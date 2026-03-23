// ─── WhatsApp-style Service Worker ───────────────────────
// File: public/sw-notifications.js
// Handles background push notifications + notification clicks

const APP_NAME = "Chat";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

// ── Push event — show notification ──
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch {}

  const isCall = data.type === "call";

  const options = {
    body:               data.body || "",
    icon:               data.icon || "/icon-192.png",
    badge:              "/icon-72.png",
    tag:                data.tag  || "chat-msg",
    requireInteraction: isCall,
    silent:             false,
    vibrate:            isCall ? [400, 200, 400, 200, 400] : [200, 100, 200],
    timestamp:          Date.now(),
    data:               data,
    // Action buttons like WhatsApp
    actions: isCall
      ? [
          { action: "accept",  title: "Accept",  icon: "/icons/accept.png"  },
          { action: "decline", title: "Decline", icon: "/icons/decline.png" },
        ]
      : [
          { action: "reply",     title: "Reply"         },
          { action: "mark_read", title: "Mark as read"  },
        ],
  };

  e.waitUntil(
    self.registration.showNotification(data.title || APP_NAME, options)
  );
});

// ── Notification click ──
self.addEventListener("notificationclick", e => {
  const { action } = e;
  const notifData  = e.notification.data || {};
  e.notification.close();

  if (action === "decline") return; // Just close

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      // Focus existing tab if open
      const existing = cs.find(c => c.url.includes(self.location.origin) && "focus" in c);
      if (existing) {
        existing.focus();
        existing.postMessage({ type: "NOTIFICATION_CLICK", action, data: notifData });
        return;
      }
      // Open new tab
      return clients.openWindow("/");
    })
  );
});

// ── Notification close (dismissed) ──
self.addEventListener("notificationclose", e => {
  const d = e.notification.data || {};
  if (d.type === "call") {
    // Notify app that call was dismissed
    clients.matchAll({ type: "window" }).then(cs => {
      cs.forEach(c => c.postMessage({ type: "CALL_DISMISSED", data: d }));
    });
  }
});
