// lib/linkChecker.js
export function normalizeUrl(input) {
  let u = (input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

export function getDomain(input) {
  try {
    return new URL(normalizeUrl(input)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Firestore `undefined` allow nahi karta — recursively clean karo
export function stripUndefined(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = typeof v === "object" ? stripUndefined(v) : v;
  }
  return out;
}

// ── In-memory session cache (same tab me same URL dobara scan na ho) ──
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const memCache = new Map();

export function getCachedScan(url) {
  const key = normalizeUrl(url);
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedScan(url, data) {
  memCache.set(normalizeUrl(url), { data, ts: Date.now() });
}
