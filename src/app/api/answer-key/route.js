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

async function fetchSheet(startUrl) {
  let current;
  try {
    current = new URL(startUrl);
  } catch {
    throw new HttpError(400, 'BAD_URL', 'That does not look like a valid link.');
  }

  // Follow redirects by hand so every hop is re-checked against the allow-list.
  for (let hop = 0; hop < 4; hop += 1) {
    if (!isAllowed(current)) {
      throw new HttpError(
        400,
        'BAD_HOST',
        'Only answer-key links from digialm.com (RRB / SSC) are supported. Use "Paste page source" for anything else.'
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        cache: 'no-store',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
      });

      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        continue;
      }
      if (!res.ok) {
        throw new HttpError(
          502,
          'FETCH_FAILED',
          `The exam site returned an error (${res.status}). The link may have expired — try "Paste page source" instead.`
        );
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        throw new HttpError(413, 'TOO_LARGE', 'That page is too large to analyze.');
      }
      return new TextDecoder('utf-8').decode(buf);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        502,
        'FETCH_FAILED',
        'Could not reach the exam site. Open the link in your browser, then use "Paste page source" instead.'
      );
    } finally {
      clearTimeout(timer);
    }
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
