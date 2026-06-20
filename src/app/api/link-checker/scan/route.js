import { NextResponse } from "next/server";

// VirusTotal v3 API
// Free key le lo: https://www.virustotal.com/gui/join-us  (Sign up -> Profile icon -> API Key)
const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY;
const VT_BASE = "https://www.virustotal.com/api/v3";

function toBase64Url(str) {
  // VirusTotal URL-id ke liye standard base64 (without padding) chahiye
  return Buffer.from(str)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function POST(req) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required hai" }, { status: 400 });
    }

    if (!VT_API_KEY) {
      return NextResponse.json(
        { error: "VIRUSTOTAL_API_KEY missing hai .env.local me" },
        { status: 500 }
      );
    }

    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const urlId = toBase64Url(normalizedUrl);

    // Step 1: Pehle dekho ki ye URL pehle se VT database me analyzed hai ya nahi
    let report = await fetch(`${VT_BASE}/urls/${urlId}`, {
      headers: { "x-apikey": VT_API_KEY },
      cache: "no-store",
    });

    // Step 2: Agar nahi mila (404), toh naya scan submit karo
    if (report.status === 404) {
      const submitRes = await fetch(`${VT_BASE}/urls`, {
        method: "POST",
        headers: {
          "x-apikey": VT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ url: normalizedUrl }),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        return NextResponse.json(
          { error: "VirusTotal submit fail hua", detail: errText },
          { status: submitRes.status }
        );
      }

      const submitData = await submitRes.json();
      const analysisId = submitData.data.id;

      // Naya scan complete hone me thoda time lagta hai — poll karo (max ~15s)
      let analysisResult = null;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const analysisRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
          headers: { "x-apikey": VT_API_KEY },
          cache: "no-store",
        });
        const analysisData = await analysisRes.json();
        if (analysisData.data?.attributes?.status === "completed") {
          analysisResult = analysisData;
          break;
        }
      }

      if (!analysisResult) {
        return NextResponse.json(
          { error: "Scan abhi bhi pending hai, thodi der baad try karo" },
          { status: 202 }
        );
      }

      const stats = analysisResult.data.attributes.stats;
      const results = analysisResult.data.attributes.results;

      return NextResponse.json({
        url: normalizedUrl,
        stats,
        verdict: getVerdict(stats),
        engines: formatEngines(results),
        permalink: `https://www.virustotal.com/gui/url/${urlId}`,
      });
    }

    if (!report.ok) {
      const errText = await report.text();
      return NextResponse.json(
        { error: "VirusTotal se data nahi mila", detail: errText },
        { status: report.status }
      );
    }

    const data = await report.json();
    const attrs = data.data.attributes;
    const stats = attrs.last_analysis_stats;
    const results = attrs.last_analysis_results;

    return NextResponse.json({
      url: normalizedUrl,
      stats,
      verdict: getVerdict(stats),
      engines: formatEngines(results),
      lastAnalysisDate: attrs.last_analysis_date
        ? new Date(attrs.last_analysis_date * 1000).toISOString()
        : null,
      reputation: attrs.reputation,
      categories: attrs.categories || {},
      permalink: `https://www.virustotal.com/gui/url/${urlId}`,
    });
  } catch (err) {
    console.error("VT scan error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err.message },
      { status: 500 }
    );
  }
}

function getVerdict(stats) {
  if (!stats) return "unknown";
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  if (malicious > 3) return "dangerous";
  if (malicious > 0 || suspicious > 2) return "suspicious";
  return "safe";
}

function formatEngines(results) {
  if (!results) return [];
  return Object.entries(results)
    .filter(([, v]) => v.category === "malicious" || v.category === "suspicious")
    .map(([engine, v]) => ({
      engine,
      category: v.category,
      result: v.result,
    }));
}
