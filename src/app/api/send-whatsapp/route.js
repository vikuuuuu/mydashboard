// app/api/send-whatsapp/route.js
//
// OPTIONAL — only needed if you want zero-tap, fully silent WhatsApp sending.
// Uses Meta's official WhatsApp Cloud API. Setup (one-time):
//   1. Create a Meta developer app at developers.facebook.com and add the
//      "WhatsApp" product.
//   2. Get a WhatsApp Business phone number (Meta gives you a free test number,
//      or connect your own).
//   3. Copy the temporary or permanent access token and the Phone Number ID.
//   4. Add to .env.local:
//        WHATSAPP_TOKEN=your_token_here
//        WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
//   5. Customers must have messaged your business number (or been added as a
//      test recipient) at least once within Meta's 24-hour session window,
//      OR you send an approved template message, otherwise Meta will reject it.
//
// Until you've done this, the app works fine without this route — it just uses
// the free wa.me link flow in lib/whatsapp.js instead.

import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { phone, message } = await req.json();

    if (!phone || !message) {
      return NextResponse.json({ error: "phone and message are required" }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return NextResponse.json(
        {
          error:
            "WhatsApp Cloud API is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in your environment, or use the free wa.me flow instead.",
        },
        { status: 400 }
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const data = await metaRes.json();

    if (!metaRes.ok) {
      return NextResponse.json({ error: data }, { status: metaRes.status });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
