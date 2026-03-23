// ─── sw-notifications.js — copy to /public/ ──────────────
// Handles background notifications even when browser tab is closed
// Supports: message notifications, call notifications, action buttons

const CACHE_NAME = "chat-sw-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

// ════════════════════════════════════════════════════════════
//  SHOW NOTIFICATION from app (via sw.showNotification)
// ════════════════════════════════════════════════════════════
self.addEventListener("notificationclick", e => {
  const { action } = e;
  const data = e.notification.data || {};
  e.notification.close();

  if (action === "decline") {
    // Notify app to reject call
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      cs.forEach(c => c.postMessage({ type: "CALL_REJECTED", data }));
    });
    return;
  }

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      // Try to focus existing tab
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing && "focus" in existing) {
        existing.focus();
        existing.postMessage({ type: "NOTIFICATION_CLICK", action, data });
        return;
      }
      // Open new tab
      return clients.openWindow("/").then(newClient => {
        if (newClient) {
          // Wait a bit for app to load then send message
          setTimeout(() => {
            newClient.postMessage({ type: "NOTIFICATION_CLICK", action, data });
          }, 2000);
        }
      });
    })
  );
});

// ════════════════════════════════════════════════════════════
//  NOTIFICATION CLOSE (user dismissed it)
// ════════════════════════════════════════════════════════════
self.addEventListener("notificationclose", e => {
  const data = e.notification.data || {};
  if (data.type === "call") {
    clients.matchAll({ type: "window" }).then(cs => {
      cs.forEach(c => c.postMessage({ type: "CALL_DISMISSED", data }));
    });
  }
});

// ════════════════════════════════════════════════════════════
//  MESSAGE from app — show notification directly via SW
//  App sends: { type: "SHOW_NOTIFICATION", title, body, options }
// ════════════════════════════════════════════════════════════
self.addEventListener("message", e => {
  if (e.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, options = {} } = e.data;
    const isCall = options.requireInteraction;

    self.registration.showNotification(title, {
      body,
      icon:               options.icon || "/icon-192.png",
      badge:              "/favicon.ico",
      tag:                options.tag || "chat",
      requireInteraction: isCall || false,
      silent:             false,
      vibrate:            isCall ? [400, 200, 400, 200, 400] : [200, 100, 200],
      data:               options.data || {},
      actions:            isCall
        ? [{ action: "accept", title: "Accept ✅" }, { action: "decline", title: "Decline ❌" }]
        : [{ action: "reply", title: "Reply" }, { action: "mark_read", title: "Mark read" }],
      timestamp:          Date.now(),
    });
  }
});
