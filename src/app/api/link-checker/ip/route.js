import { NextResponse } from "next/server";
import dns from "dns/promises";

// ip-api.com free tier — no key, 45 requests/minute limit hai

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL required hai" }, { status: 400 });
    }

    let domain;
    try {
      let normalizedUrl = url.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      domain = new URL(normalizedUrl).hostname.replace(/^www\./, "");
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Domain ko IP me resolve karo
    let ip;
    try {
      const addresses = await dns.resolve4(domain);
      ip = addresses[0];
    } catch {
      try {
        const addresses6 = await dns.resolve6(domain);
        ip = addresses6[0];
      } catch {
        return NextResponse.json(
          { domain, error: "Domain resolve nahi ho paya — ye site exist nahi karti ya down hai" },
          { status: 200 }
        );
      }
    }

    const ipRes = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,org,as,asname,reverse,mobile,proxy,hosting,query`,
      { cache: "no-store" }
    );

    if (!ipRes.ok) {
      return NextResponse.json(
        { domain, ip, error: "IP info fetch nahi hua" },
        { status: 200 }
      );
    }

    const ipData = await ipRes.json();

    if (ipData.status !== "success") {
      return NextResponse.json(
        { domain, ip, error: ipData.message || "IP lookup fail hua" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      domain,
      ip,
      country: ipData.country,
      region: ipData.regionName,
      city: ipData.city,
      isp: ipData.isp,
      org: ipData.org,
      asn: ipData.as,
      asName: ipData.asname,
      reverseDns: ipData.reverse || null,
      isProxyOrVpn: ipData.proxy || false,
      isMobileNetwork: ipData.mobile || false,
      isHostingDatacenter: ipData.hosting || false,
    });
  } catch (err) {
    console.error("IP lookup error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err.message },
      { status: 500 }
    );
  }
}
