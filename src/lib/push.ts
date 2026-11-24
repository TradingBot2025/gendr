// Client-side helpers for app (PWA) notifications — no keys / no Web Push.
//
// Background notifications while the tab is hidden/minimized are shown by the
// service worker via postMessage (works with just the Notification permission).
// This intentionally does NOT use the Push API / VAPID keys.

const SW_URL = "/sw.js";

export type NotificationPermissionLike = NotificationPermission | "unsupported";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export function notificationPermission(): NotificationPermissionLike {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL)
      .then((reg) => reg)
      .catch((err) => {
        console.warn("[notifications] service worker registration failed:", err);
        return null;
      });
  }
  return registrationPromise;
}

// Show a native notification via the service worker (works when minimized).
// Falls back to a regular Notification when no SW is controlling the page.
export async function showBackgroundNotification(opts: {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  const { title, body, url = "/", tag } = opts;
  const reg = await registerServiceWorker();
  const base = { body, icon: "/icon-192.png", badge: "/icon-192.png", tag, data: { url } };
  try {
    if (reg && "showNotification" in reg) {
      await reg.showNotification(title, base);
      return;
    }
  } catch {
    // fall through to constructor
  }
  try {
    new Notification(title, base);
  } catch {
    // Some mobile browsers require SW-based notifications; ignore.
  }
}

// Ask the user for notification permission so alerts show even when the app is
// minimized. No keys or push subscription involved.
export async function enableNotifications(): Promise<"granted" | "denied" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  return permission;
}

// Dismiss a previously shown background notification (e.g. when the user opens
// the relevant view).
export async function clearBackgroundNotification(tag: string): Promise<void> {
  const reg = await registerServiceWorker();
  if (!reg) return;
  const tags = await reg.getNotifications({ tag });
  tags.forEach((n) => n.close());
}
