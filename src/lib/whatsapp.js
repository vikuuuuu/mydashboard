// lib/whatsapp.js
//
// FREE, NO-BACKEND WHATSAPP SEND
// -------------------------------
// This opens the customer's WhatsApp (app on mobile, WhatsApp Web on desktop) with the
// message already typed into the box, right after you save an entry. WhatsApp's own
// policy does not allow a website to press "send" on your behalf silently, so this is
// the closest "automatic" flow you can get for free — you (or whoever is at the counter)
// just tap the send button once.
//
// If you later want entries to reach customers with zero taps (fully automatic, even
// when nobody is watching the screen), use the optional /api/send-whatsapp route, which
// calls Meta's official WhatsApp Cloud API. That needs a Meta developer account, a
// WhatsApp Business phone number, and an access token — see the comment in that file.

export function formatPhoneForWhatsApp(phone, defaultCountryCode = "91") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  // If the number looks like a plain 10-digit local number, prefix the default country code.
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function buildEntryMessage({
  customerName,
  date,
  shift,
  liters,
  fat,
  rate,
  totalRs,
  cmFundRs,
  amount,
  dairyName = "Dairy",
}) {
  const shiftLabel = shift === "morning" ? "Subah (Morning)" : "Shaam (Evening)";
  const lines = [
    `Namaste ${customerName} ji,`,
    `Aapki doodh entry ho gayi hai:`,
    ``,
    `Date: ${date}`,
    `Shift: ${shiftLabel}`,
    `Fat: ${fat}%`,
    `Liters: ${liters} L`,
    `Rate/Ltr: Rs.${rate}`,
  ];

  if (totalRs !== undefined) lines.push(`Total RS: Rs.${totalRs}`);
  if (cmFundRs !== undefined && Number(cmFundRs) > 0) lines.push(`CMFund RS: -Rs.${cmFundRs}`);

  lines.push(`Final Amount: Rs.${amount}`, ``, `Dhanyawad!`, `- ${dairyName}`);

  return lines.join("\n");
}

// Opens WhatsApp with the message pre-filled. Returns the URL used (useful for logging).
export function openWhatsAppMessage(phone, message, defaultCountryCode = "91") {
  const formatted = formatPhoneForWhatsApp(phone, defaultCountryCode);
  if (!formatted) return null;
  const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return url;
}

// Optional: call this instead of openWhatsAppMessage if you've configured the
// Meta WhatsApp Cloud API route for fully silent sending.
export async function sendWhatsAppViaCloudAPI(phone, message, defaultCountryCode = "91") {
  const formatted = formatPhoneForWhatsApp(phone, defaultCountryCode);
  const res = await fetch("/api/send-whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: formatted, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.error?.message || data?.error || "WhatsApp send failed");
  return data;
}
