// src/lib/appVersion.js

export const APP_VERSION    = "v1.3.8";
export const LASTUPDATE_DATE = "20 May 2026";

/**
 * Full changelog — latest first.
 * type: "major" | "minor" | "patch" | "fix"
 */
export const CHANGELOG = [
  {
    version: "v1.3.8",
    date:    "20 May 2026",
    type:    "minor",
    label:   "Latest",
    changes: [
      "💎 Subscription system with Razorpay payment gateway",
      "🔒 Dashboard lock overlay for non-subscribers",
      "📅 Yearly subscription countdown on Profile page",
      "✅ Payment signature verification (HMAC-SHA256)",
      "🔄 Auto-unlock dashboard after successful payment",
    ],
  },
  {
    version: "v1.3.5",
    date:    "10 May 2026",
    type:    "minor",
    label:   null,
    changes: [
      "🔐 Login Activity expandable detail cards",
      "🖥️ Registered device & ISP info on Profile",
      "📊 Tool usage history with file size stats",
      "🎨 Profile page hero banner redesign",
    ],
  },
  {
    version: "v1.3.0",
    date:    "28 Apr 2026",
    type:    "minor",
    label:   null,
    changes: [
      "📚 Study Tool added to dashboard",
      "📁 All File Studio — preview & convert any format",
      "🔍 Dashboard search with highlight",
      "📌 Pin/unpin tools with drag-to-reorder",
    ],
  },
  {
    version: "v1.2.8",
    date:    "15 Apr 2026",
    type:    "fix",
    label:   null,
    changes: [
      "🐛 Fixed session kick modal not appearing on mobile",
      "⚡ Faster Firestore subscription queries",
      "🔧 Avatar initials fallback color consistency fix",
    ],
  },
  {
    version: "v1.2.5",
    date:    "02 Apr 2026",
    type:    "minor",
    label:   null,
    changes: [
      "🎞️ My Video Editor tool added",
      "💬 Web Chat — missed voice & video call badges",
      "🔔 Realtime unread message count on dashboard",
    ],
  },
  {
    version: "v1.2.0",
    date:    "20 Mar 2026",
    type:    "major",
    label:   null,
    changes: [
      "🚀 Single-session enforcement (kicked modal)",
      "🔌 IP, ISP & location tracking on login",
      "📈 My Financials — trade profit/loss tracker",
      "🌐 Web Chat real-time messaging",
    ],
  },
  {
    version: "v1.1.0",
    date:    "05 Mar 2026",
    type:    "minor",
    label:   null,
    changes: [
      "🖼️ Image → PDF bulk converter",
      "✂️ All-in-One Image tool (crop, resize, compress)",
      "📄 PDF Tool — resize & edit",
      "🎬 Video → Image frame extractor",
    ],
  },
  {
    version: "v1.0.0",
    date:    "15 Feb 2026",
    type:    "major",
    label:   "Initial Release",
    changes: [
      "🎉 MyDashboard initial launch",
      "🔐 Firebase Auth — email & Google login",
      "📝 Notes tool",
      "👤 User profile page",
      "🔄 Session management",
    ],
  },
];
