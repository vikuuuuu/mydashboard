// File Path: lib/getDeviceDetails.js

/**
 * Detects: IP, Browser, OS, Device Type, Screen, Location (city/country)
 * Uses ipapi.co free API - no key needed, 1000 req/day free
 */

export async function getDeviceDetails() {
  const ua = navigator.userAgent;

  // ── Browser ──────────────────────────────────────────────
  const getBrowser = () => {
    if (/Edg\//.test(ua))     return "Microsoft Edge";
    if (/OPR\//.test(ua))     return "Opera";
    if (/SamsungBrowser/.test(ua)) return "Samsung Browser";
    if (/UCBrowser/.test(ua)) return "UC Browser";
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Google Chrome";
    if (/Firefox\//.test(ua)) return "Mozilla Firefox";
    if (/Safari\//.test(ua) && !/Chrome/.test(ua))  return "Apple Safari";
    if (/MSIE|Trident/.test(ua)) return "Internet Explorer";
    return "Unknown Browser";
  };

  // ── OS ───────────────────────────────────────────────────
  const getOS = () => {
    if (/Windows NT 10/.test(ua)) return "Windows 10/11";
    if (/Windows NT 6\.3/.test(ua)) return "Windows 8.1";
    if (/Windows NT 6\.1/.test(ua)) return "Windows 7";
    if (/Windows/.test(ua))       return "Windows";
    if (/iPhone OS/.test(ua))     return `iOS ${ua.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""}`;
    if (/iPad/.test(ua))          return `iPadOS ${ua.match(/CPU OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""}`;
    if (/Android/.test(ua))       return `Android ${ua.match(/Android ([\d.]+)/)?.[1] || ""}`;
    if (/Mac OS X/.test(ua))      return `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""}`;
    if (/Linux/.test(ua))         return "Linux";
    if (/CrOS/.test(ua))          return "Chrome OS";
    return "Unknown OS";
  };

  // ── Device Type ──────────────────────────────────────────
  const getDeviceType = () => {
    if (/iPad/.test(ua))    return "Tablet 📱";
    if (/Tablet/.test(ua))  return "Tablet 📱";
    if (/Mobile|iPhone|Android(?!.*Tablet)|BlackBerry|IEMobile|Opera Mini/.test(ua))
      return "Mobile 📱";
    if (/SmartTV|SMART-TV|TV Safari|HbbTV|Tizen|WebOS/.test(ua))
      return "Smart TV 📺";
    return "Desktop 💻";
  };

  // ── Screen ───────────────────────────────────────────────
  const screen = `${window.screen.width}×${window.screen.height}`;

  // ── IP + Location via ipapi.co ───────────────────────────
  let ip       = "Unknown";
  let city     = "Unknown";
  let region   = "Unknown";
  let country  = "Unknown";
  let timezone = "Unknown";
  let isp      = "Unknown";
  let lat      = null;
  let lon      = null;

  try {
    const res  = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    const data = await res.json();
    ip       = data.ip       || ip;
    city     = data.city     || city;
    region   = data.region   || region;
    country  = data.country_name || country;
    timezone = data.timezone || timezone;
    isp      = data.org      || isp;
    lat      = data.latitude  ?? null;
    lon      = data.longitude ?? null;
  } catch (_) {
    // fallback - try another free API
    try {
      const res  = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      ip = data.ip || ip;
    } catch (_) { /* silent */ }
  }

  return {
    ip,
    browser:    getBrowser(),
    os:         getOS(),
    deviceType: getDeviceType(),
    screen,
    city,
    region,
    country,
    timezone,
    isp,
    lat,
    lon,
    location:   city !== "Unknown" ? `${city}, ${region}, ${country}` : "Unknown",
    userAgent:  ua,
  };
}