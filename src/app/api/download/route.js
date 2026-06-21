import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL parameter is missing" }, { status: 400 });
    }

    // ── STEP 1: AAPKA SCRAPER ENGINE LAYOUT ──
    // Yahan aap apna original rapidapi ya custom instagram/youtube scraper core logic lagayein.
    // Demo ke liye, hum maan rahe hain ki aapke engine ne direct mp4 link generate kar liya hai:
    
    let fakeExtractedDirectMp4Url = url; 

    // Agar testing ke liye koi dummy mp4 link chahiye ho toh:
    if (url.includes("instagram.com")) {
      // Real app mein yahan scraper se mila hua direct cdn link replace hoga
      fakeExtractedDirectMp4Url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"; 
    }

    // Response object structure jo client frontend demand kar raha hai
    return NextResponse.json({
      title: "Social Media Video Content",
      quality: "Auto-Detected (Best Quality)",
      size: "Calculated dynamically",
      downloadUrl: fakeExtractedDirectMp4Url, // Client is link se download/stream proxy fetch karega
    });

  } catch (error) {
    console.error("Backend Post Engine Error:", error);
    return NextResponse.json({ error: "Internal Server Parse Exception Failed" }, { status: 500 });
  }
}

// ── GET ROUTE (ADVANCED PROXY STREAM ENGINE) ──
// Ye route Instagram ke secure servers se data utha kar frontend video player ko binary format me dega
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const proxyUrl = searchParams.get("proxyUrl");

  if (!proxyUrl) {
    return new Response("Missing proxyUrl stream parameters", { status: 400 });
  }

  try {
    // Platform ke strict security rules bypass karne ke liye spoof headers add karna
    const videoResponse = await fetch(proxyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Origin": "https://www.instagram.com"
      },
    });

    if (!videoResponse.ok) {
      throw new Error(`Target resource responded with status: ${videoResponse.status}`);
    }

    // Content types and buffer mapping rules
    const contentType = videoResponse.headers.get("content-type") || "video/mp4";
    const contentLength = videoResponse.headers.get("content-length");
    const videoBuffer = await videoResponse.arrayBuffer();

    // Custom headers inject karna taaki frontend video element load kare aur CORS clear ho jaye
    const responseHeaders = new Headers({
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*", // 👈 browser black screen security clear rule
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    console.error("Proxy Engine Pipeline Crash:", err);
    return new Response("Proxy core stream failed to forward packet buffers", { status: 500 });
  }
}
