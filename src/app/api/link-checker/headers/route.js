import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CHECKS = [
  { key: "strict-transport-security", label: "HSTS", weight: 20, hint: "HTTPS force karta hai, downgrade attacks se bachata hai." },
  { key: "content-security-policy", label: "Content-Security-Policy", weight: 25, hint: "XSS/data-injection limit karta hai." },
  { key: "x-frame-options", label: "X-Frame-Options", weight: 15, hint: "Clickjacking se bachata hai." },
  { key: "x-content-type-options", label: "X-Content-Type-Options", weight: 10, hint: "MIME-sniffing attacks se bachata hai." },
  { key: "referrer-policy", label: "Referrer-Policy", weight: 10, hint: "Referrer ke through info leak control karta hai." },
  { key: "permissions-policy", label: "Permissions-Policy", weight: 10, hint: "Camera/mic/location jaisi browser features restrict karta hai." },
  { key: "x-xss-protection", label: "X-XSS-Protection", weight: 5, hint: "Legacy browser XSS filter." },
  {
    key: "set-cookie",
    label: "Cookies (Secure/HttpOnly)",
    weight: 5,
    hint: "Cookies secure flags ke saath honi chahiye.",
    custom: (headers) => {
      const raw = headers.get("set-cookie");
      if (!raw) return { present: true, note: "Koi cookie set nahi hui" };
      const ok = /secure/i.test(raw) && /httponly/i.test(raw);
      return { present: ok, note: ok ? "Secure + HttpOnly hai" : "Secure/HttpOnly flag missing" };
    },
  },
];

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required hai" }, { status: 400 });

    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = "https://" + normalizedUrl;

    let res;
    try {
      res = await fetch(normalizedUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(9000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkCheckerBot/1.0)" },
      });
    } catch (err) {
      return NextResponse.json(
        { url: normalizedUrl, error: "Site tak pahunch nahi paya", detail: err.message },
        { status: 200 }
      );
    }

    const results = [];
    let score = 0;
    let maxScore = 0;

    for (const check of CHECKS) {
      maxScore += check.weight;
      if (check.custom) {
        const outcome = check.custom(res.headers);
        if (outcome.present) score += check.weight;
        results.push({ label: check.label, present: outcome.present, hint: check.hint, note: outcome.note });
      } else {
        const value = res.headers.get(check.key);
        const present = !!value;
        if (present) score += check.weight;
        results.push({ label: check.label, present, hint: check.hint, value: value || null });
      }
    }

    const percent = Math.round((score / maxScore) * 100);
    const grade = percent >= 85 ? "A" : percent >= 70 ? "B" : percent >= 50 ? "C" : percent >= 30 ? "D" : "F";

    return NextResponse.json({
      url: normalizedUrl,
      finalUrl: res.url,
      status: res.status,
      redirected: res.redirected,
      server: res.headers.get("server") || null,
      poweredBy: res.headers.get("x-powered-by") || null,
      grade,
      percent,
      checks: results,
    });
  } catch (err) {
    console.error("Headers check error:", err);
    return NextResponse.json({ error: "Server error", detail: err.message }, { status: 500 });
  }
}
