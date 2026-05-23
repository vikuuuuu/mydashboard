// src/lib/appVersion.js

export const APP_VERSION    = "v1.3.6";
export const LASTUPDATE_DATE = "23 May 2026";

/**
 * Full changelog — latest first.
 * type: "major" | "minor" | "patch" | "fix"
 */
export const CHANGELOG = [
  {
    version: "v1.3.6",
    date:    "23 May 2026",
    type:    "minor",
    label:   "latest",
    changes: [
      "🔒 Security Lock System in Notes page",
      "🤖 AI Writing Assistant in Notes Page",
      "📜 Version History in Notes Page",
      "🎯 Word Goal Tracker in Notes page",
      "🐛 Bug Fixes in Notes page",
    ],
  },
  {
    version: "v1.3.5",
    date:    "21 May 2026",
    type:    "fix",
    label:  null,
    changes: [
      "🐛 Disable subscription lock overlay in dashboard",
      "⚡ Add CHANGELOG for version tracking",
    ],
  },
  {
    version: "v1.3.4",
    date:    "20 May 2026",
    type:    "fix",
    label:   null,
    changes: [
      "🐛Update app version and last update date",
      "⚡ Delete src/app/dashboard/webchat/webchat.module.css",
    ],
  },
  {
    version: "v1.3.3",
    date:    "19 May 2026",
    type:    "minor",
    label:   null,
    changes: [
      "💎 Update myvideo.module.css and page.jsx",
      "🔒Remove InvoiceGenerator component",
    ],
  },
  {
    version: "v1.3.2",
    date:    "18 May 2026",
    type:    "minor",
    label:   null,
    changes: [
      "💎 Bug Fix and Update Webchat, Studytool",
      "🔒Refactor InvoiceGenerator component with new features",
    ],
  },
  {
    version: "v1.3.1",
    date:    "16 May 2026",
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
    date:    "16 May 2026",
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
    version: "v1.2.2",
    date:    "04 May 2026",
    type:    "fix",
    label:   null,
    changes: [
      "🐛 Fixed session kick modal not appearing on mobile",
      "⚡ Faster Firestore subscription queries",
      "🔧 Avatar initials fallback color consistency fix",
    ],
  },
  {
    version: "v1.2.1",
    date:    "03 May 2026",
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
    date:    "03 May 2026",
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
    date:    "01 May 2026",
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
    date:    "30 April 2026",
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
