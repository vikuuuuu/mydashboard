import { NextResponse } from "next/server";

// Free tier: https://developers.google.com/safe-browsing/v4/get-started
// Key na ho toh ye silently skip ho jayega — feature toot nahi ega
const GSB_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
const GSB_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required hai" }, { status: 400 });

    if (!GSB_KEY) {
      return NextResponse.json({ skipped: true, reason: "GOOGLE_SAFE_BROWSING_API_KEY set nahi hai" });
    }

    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = "https://" + normalizedUrl;

    const body = {
      client: { clientId: "mydashboard-link-checker", clientVersion: "1.0.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url: normalizedUrl }],
      },
    };

    const res = await fetch(`${GSB_URL}?key=${GSB_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return NextResponse.json({ error: "Safe Browsing check fail hua" }, { status: 200 });

    const data = await res.json();
    const matches = data.matches || [];

    return NextResponse.json({
      flagged: matches.length > 0,
      threats: matches.map((m) => ({ type: m.threatType, platform: m.platformType })),
    });
  } catch (err) {
    console.error("Safe Browsing error:", err);
    return NextResponse.json({ error: "Server error", detail: err.message }, { status: 500 });
  }
}
