// Gender PWA service worker.
// Responsibilities:
//  - Enable installability (a registered SW is required for the install prompt).
//  - Show system notifications when the app is in the background / minimized
//    (the page posts a "notify" message) and when a Web Push arrives.
//  - Focus or open the right view when a notification is tapped.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The page relays notifications here when the tab is hidden (minimized) but
// still alive, so a native OS notification is shown even though the in-page
// toast cannot be seen.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "notify") {
    event.waitUntil(
      self.registration.showNotification(String(data.title || "Gender"), {
        body: String(data.body || ""),
        icon: data.icon || "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag ? String(data.tag) : undefined,
        data: { url: data.url || "/" },
      }),
    );
  }
});

// Real Web Push (works even when the app is fully closed, once a push service
// and VAPID keys are configured server-side).
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Gender";
  const options = {
    body: payload.body || "You have a new notification",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client && target) {
            client.navigate(target).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
