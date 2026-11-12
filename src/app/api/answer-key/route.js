import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import https from 'node:https';
import { parseAnswerKeyHtml } from '@/lib/answerKeyParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const preferredRegion = 'bom1';

const ALLOWED_HOSTS = ['digialm.com'];
const MAX_BYTES = 8 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) =>
  NextResponse.json({ ok: false, error: { code, message } }, { status });

function isAllowed(u) {
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

async function verifyUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !key) return false;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        cache: 'no-store',
      }
    );
    return r.ok;
  } catch {
    return false;
  }
}

const browserHeaders = () => ({
  'User-Agent': UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
});

// Raw HTTPS request that preserves exact path (like '//per/g22/...') without URL normalization
function rawHttpsGet(rawUrl, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl);
    const hostIdx = rawUrl.indexOf(u.host);
    const rawPath = hostIdx !== -1 ? rawUrl.slice(hostIdx + u.host.length) || '/' : u.pathname + u.search;

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: rawPath,
        method: 'GET',
        headers: {
          Host: u.host,
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            loc: res.headers.location || null,
            server: res.headers.server || '',
            setCookie: res.headers['set-cookie'] || [],
            buf: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchSheet(startUrl) {
  let cleanStr = startUrl.replace(/&amp;/gi, '&').replace(/[\r\n\t\s]+/g, '').trim();
  let current;
  try {
    current = new URL(cleanStr);
  } catch {
    throw new HttpError(400, 'BAD_URL', 'That does not look like a valid link.');
  }

  const cookies = new Map();
  const remember = (setCookieArr) => {
    for (const line of setCookieArr || []) {
      const pair = line.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };

  async function get(targetStr, uObj, isRetry = false) {
    try {
      const headers = browserHeaders();
      if (isRetry) {
        headers.Referer = `${uObj.origin}/`;
        headers['Sec-Fetch-Site'] = 'same-origin';
      }
      if (cookies.size) {
        headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const res = await rawHttpsGet(targetStr, headers);
      remember(res.setCookie);
      return res;
    } catch {
      throw new HttpError(
        502,
        'FETCH_FAILED',
        'Could not reach the exam site. Open the link in your browser, press Ctrl+U, copy all, and use "Paste page source".'
      );
    }
  }

  let warmedUp = false;
  for (let hop = 0; hop < 6; hop += 1) {
    if (!isAllowed(current)) {
      throw new HttpError(
        400,
        'BAD_HOST',
        'Only answer-key links from digialm.com (RRB / SSC) are supported. Use "Paste page source" for anything else.'
      );
    }

    const r = await get(cleanStr, current, warmedUp);

    if (r.status >= 300 && r.status < 400 && r.loc) {
      const nextUrl = new URL(r.loc, current);
      current = nextUrl;
      cleanStr = r.loc.startsWith('http') ? r.loc : nextUrl.toString();
      continue;
    }

    if (!r.ok && !warmedUp && (r.status === 400 || r.status === 403)) {
      warmedUp = true;
      await get(`${current.origin}/`, new URL('/', current.origin), false).catch(() => {});
      continue;
    }

    if (!r.ok) {
      const tag = `${r.status}${r.server ? ` · ${r.server}` : ''}`;
      throw new HttpError(
        502,
        'FETCH_FAILED',
        `The exam site blocked direct server access (${tag}). Open your answer key link in browser, press Ctrl+U (View Source), copy everything (Ctrl+A, Ctrl+C), and paste it in "Paste page source".`
      );
    }
    if (r.buf.byteLength > MAX_BYTES) {
      throw new HttpError(413, 'TOO_LARGE', 'That page is too large to analyze.');
    }
    return new TextDecoder('utf-8').decode(r.buf);
  }
  throw new HttpError(502, 'FETCH_FAILED', 'Too many redirects from the exam site.');
}

export async function POST(req) {
  try {
    if (!(await verifyUser(req))) {
      return fail(401, 'AUTH', 'Your session has expired. Sign in again and retry.');
    }

    const body = await req.json().catch(() => ({}));
    let html = '';
    let source = 'html';
    let sourceUrl = '';

    if (typeof body.url === 'string' && body.url.trim()) {
      sourceUrl = body.url.trim().slice(0, 500);
      source = 'url';
      html = await fetchSheet(body.url.trim());
    } else if (typeof body.html === 'string' && body.html.length > 200) {
      if (body.html.length > MAX_BYTES) {
        return fail(413, 'TOO_LARGE', 'That page source is too large to analyze.');
      }
      html = body.html;
    } else {
      return fail(400, 'EMPTY', 'Paste an answer key link or the page source.');
    }

    const parsed = parseAnswerKeyHtml(html);

    const c = parsed.candidate;
    const basis = c.rollNo
      ? [c.rollNo, c.examDate, c.examTime, c.subject].join('|')
      : sourceUrl || html.slice(0, 2000);
    const fingerprint = crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);

    return NextResponse.json({ ok: true, ...parsed, source, sourceUrl, fingerprint });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.code, err.message);
    if (err?.code === 'NO_QUESTIONS') {
      return fail(
        422,
        'NO_QUESTIONS',
        'No questions found. Make sure this is the candidate response / answer key page, not the login or home page.'
      );
    }
    if (err?.code === 'NO_ANSWERS') {
      return fail(
        422,
        'NO_ANSWERS',
        'This page has your responses but no correct answers marked, so it cannot be scored. Use the link that shows the answer key.'
      );
    }
    console.error('answer-key route error', err);
    return fail(500, 'SERVER', 'Something went wrong while analyzing. Try again.');
  }
}
