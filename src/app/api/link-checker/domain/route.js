import { NextResponse } from "next/server";

// RDAP (Registration Data Access Protocol) — WHOIS ka modern, free, no-key replacement.
// rdap.org automatically sahi registry pe redirect kar deta hai (.com, .in, .org etc).

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

    const rdapRes = await fetch(`https://rdap.org/domain/${domain}`, {
      cache: "no-store",
      headers: { Accept: "application/rdap+json" },
    });

    if (!rdapRes.ok) {
      return NextResponse.json(
        {
          domain,
          available: false,
          error: "RDAP data nahi mila is domain ke liye (ho sakta hai registry support na kare)",
        },
        { status: 200 }
      );
    }

    const data = await rdapRes.json();

    // Events se important dates nikalo
    const events = data.events || [];
    const registrationEvent = events.find((e) => e.eventAction === "registration");
    const expirationEvent = events.find((e) => e.eventAction === "expiration");
    const lastChangedEvent = events.find(
      (e) => e.eventAction === "last changed" || e.eventAction === "last update of RDAP database"
    );

    // Registrar entity nikalo
    const registrarEntity = (data.entities || []).find((e) =>
      (e.roles || []).includes("registrar")
    );
    const registrarName =
      registrarEntity?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3] ||
      registrarEntity?.publicIds?.[0]?.identifier ||
      null;

    // Registrant / org entity (privacy-protected hone ki wajah se aksar nahi milta)
    const registrantEntity = (data.entities || []).find((e) =>
      (e.roles || []).includes("registrant")
    );
    const registrantOrg =
      registrantEntity?.vcardArray?.[1]?.find((f) => f[0] === "org")?.[3] || null;

    return NextResponse.json({
      domain,
      status: data.status || [],
      registrar: registrarName,
      registrantOrg: registrantOrg || "Privacy protected / not disclosed",
      createdDate: registrationEvent?.eventDate || null,
      expiryDate: expirationEvent?.eventDate || null,
      lastUpdated: lastChangedEvent?.eventDate || null,
      nameservers: (data.nameservers || []).map((ns) => ns.ldhName),
      raw: {
        handle: data.handle || null,
        objectClassName: data.objectClassName || null,
      },
    });
  } catch (err) {
    console.error("RDAP error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err.message },
      { status: 500 }
    );
  }
}
