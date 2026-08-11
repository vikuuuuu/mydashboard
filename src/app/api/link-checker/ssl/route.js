import { NextResponse } from "next/server";
import tls from "tls";

export const runtime = "nodejs";

function getHostname(url) {
  try {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

function checkCert(hostname, port = 443, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();
        const authorized = socket.authorized;
        const authError = socket.authorizationError;
        socket.end();

        if (!cert || Object.keys(cert).length === 0) {
          return reject(new Error("Certificate nahi mil paya"));
        }

        const now = Date.now();
        const validFrom = new Date(cert.valid_from).getTime();
        const validTo = new Date(cert.valid_to).getTime();
        const daysRemaining = Math.round((validTo - now) / (1000 * 60 * 60 * 24));

        resolve({
          hostname,
          valid: authorized,
          authError: authorized ? null : authError,
          issuer: cert.issuer ? cert.issuer.O || cert.issuer.CN || "Unknown" : "Unknown",
          subject: cert.subject?.CN || hostname,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          isExpired: now > validTo,
          isNotYetValid: now < validFrom,
          selfSigned: cert.issuer?.CN === cert.subject?.CN,
          san: cert.subjectaltname
            ? cert.subjectaltname.split(",").map((s) => s.trim().replace(/^DNS:/, ""))
            : [],
          protocol,
          cipher: cipher?.name || null,
          fingerprint: cert.fingerprint256 || cert.fingerprint || null,
        });
      }
    );

    socket.on("error", (err) => reject(err));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error("SSL check timeout ho gaya"));
    });
  });
}

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required hai" }, { status: 400 });

    const hostname = getHostname(url);
    if (!hostname) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

    try {
      const result = await checkCert(hostname);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        {
          hostname,
          error: "SSL handshake fail hua — HTTPS support nahi ya cert issue hai",
          detail: err.message,
        },
        { status: 200 }
      );
    }
  } catch (err) {
    console.error("SSL check error:", err);
    return NextResponse.json({ error: "Server error", detail: err.message }, { status: 500 });
  }
}
