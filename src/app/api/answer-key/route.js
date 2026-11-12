import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { parseAnswerKeyHtml } from '@/lib/answerKeyParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Government exam hosts are sometimes slow or blocked outside India.
// On Vercel this pins the function to Mumbai.
export const preferredRegion = 'bom1';

// Only these hosts can be fetched. Never open this up to arbitrary URLs —
// the route would become an open proxy / SSRF hole.
const ALLOWED_HOSTS = ['digialm.com'];
const MAX_BYTES = 8 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

// Confirms the Firebase ID token with Google's REST API, so no admin SDK is
// needed. Uses the same public web API key your client already has.
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

const browserHeaders = (u) => ({
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  Referer: `${u.origin}/`,
  'Upgrade-Insecure-Requests': '1',
});

async function fetchSheet(startUrl) {
  let current;
  try {
    // Undo copy-paste damage: HTML-escaped ampersands, spaces, line breaks.
    current = new URL(startUrl.replace(/&amp;/gi, '&').replace(/\s+/g, ''));
  } catch {
    throw new HttpError(400, 'BAD_URL', 'That does not look like a valid link.');
  }

  // Cookies picked up along the way (redirects, warm-up request).
  const cookies = new Map();
  const remember = (res) => {
    const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };

  async function get(u) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const headers = browserHeaders(u);
      if (cookies.size) {
        headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        cache: 'no-store',
        headers,
      });
      remember(res);
      const isRedirect = res.status >= 300 && res.status < 400;
      const buf = isRedirect ? null : await res.arrayBuffer();
      return { status: res.status, ok: res.ok, loc: res.headers.get('location'), buf };
    } catch {
      throw new HttpError(
        502,
        'FETCH_FAILED',
        'Could not reach the exam site. Open the link in your browser, then use "Paste page source" instead.'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Follow redirects by hand so every hop is re-checked against the allow-list.
  let warmedUp = false;
  for (let hop = 0; hop < 6; hop += 1) {
    if (!isAllowed(current)) {
      throw new HttpError(
        400,
        'BAD_HOST',
        'Only answer-key links from digialm.com (RRB / SSC) are supported. Use "Paste page source" for anything else.'
      );
    }

    const r = await get(current);

    if (r.status >= 300 && r.status < 400 && r.loc) {
      current = new URL(r.loc, current);
      continue;
    }

    // 400/403: visit the site's home page once to pick up cookies, then retry.
    if (!r.ok && !warmedUp && (r.status === 400 || r.status === 403)) {
      warmedUp = true;
      await get(new URL('/', current.origin)).catch(() => {});
      continue;
    }

    if (!r.ok) {
      console.error('answer-key upstream failure', r.status, current.hostname);
      throw new HttpError(
        502,
        'FETCH_FAILED',
        `The exam site returned an error (${r.status}). The link may have expired — try "Paste page source" instead.`
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

    // Same sheet → same fingerprint → re-analyzing updates one Firestore doc
    // instead of creating duplicates.
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
