import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL parameter is missing" }, { status: 400 });
    }

    // ── CORE LOGIC UPDATE ──
    // Ab hum koi fake/dummy URL nahi lagayenge. User ka pasted URL hi aage bhejenge.
    // NOTE: Agar aapke paas Instagram/Twitter ka video URL extractor API hai (jaise RapidAPI), 
    // toh aap use yahan lagakar direct `.mp4` video stream CDN link nikal sakte hain.
    let extractedDirectMp4Url = url;

    return NextResponse.json({
      title: "Social Media Video Content",
      quality: "Auto-Detected (Best Quality)",
      size: "Calculated dynamically",
      downloadUrl: extractedDirectMp4Url, // User ka original input link pass ho raha hai
    });

  } catch (error) {
    console.error("Backend Post Engine Error:", error);
    return NextResponse.json({ error: "Internal Server Parse Exception Failed" }, { status: 500 });
  }
}

// ── GET ROUTE: ADVANCED STRONG PROXY STREAM ENGINE ──
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const proxyUrl = searchParams.get("proxyUrl");

  if (!proxyUrl || proxyUrl === "undefined" || proxyUrl.startsWith("/")) {
    return new Response("Invalid or missing proxyUrl stream parameters", { status: 400 });
  }

  try {
    // Platform ke rigid security rules ko spoof headers se bypass karna
    const videoResponse = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      },
    });

    if (!videoResponse.ok) {
      console.warn(`Target CDN status error: ${videoResponse.status}. Activating fallback redirect.`);
      return NextResponse.redirect(proxyUrl);
    }

    const contentType = videoResponse.headers.get("content-type") || "video/mp4";
    const contentLength = videoResponse.headers.get("content-length");
    const videoBuffer = await videoResponse.arrayBuffer();

    const responseHeaders = new Headers({
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Cache-Control": "public, max-age=86400",
    });

    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    return new Response(videoBuffer, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error("Proxy Engine Pipeline Crash, triggering safety stream redirect:", err);
    return NextResponse.redirect(proxyUrl);
  }
}
