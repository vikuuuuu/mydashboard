// lib/getDeviceDetails.js
export const getDeviceDetails = async () => {
  let ip = "Unknown IP";
  let location = "Unknown Location";

  // Fetch IP and Location
  try {
    const res = await fetch("http://ip-api.com/json/");
    const data = await res.json();
    if (data.status === "success") {
      ip = data.query;
      location = `${data.city}, ${data.country}`;
    }
  } catch (error) {
    console.error("Failed to fetch IP details", error);
  }

  // Basic Browser and OS Info
  const userAgent = navigator.userAgent;
  let browser = "Unknown Browser";
  if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";
  else if (userAgent.includes("Edge")) browser = "Edge";

  let os = "Unknown OS";
  if (userAgent.includes("Win")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "MacOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("like Mac")) os = "iOS";

  return {
    ip,
    location,
    browser,
    os,
    userAgent,
    timestamp: new Date().toISOString(), // Standard ISO format string
  };
};
