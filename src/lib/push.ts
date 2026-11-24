// Client-side helpers for installable-app (PWA) notifications.
//
// Two layers:
//  1. Background notifications while the tab is alive but hidden/minimized —
//     always available (no keys needed). The page relays them to the service
//     worker via postMessage and the SW shows a native OS notification.
//  2. True Web Push (works even when the app is fully closed) — only available
//     when a VAPID public key is configured (VITE_VAPID_PUBLIC_KEY) and a push
//     sender is wired server-side. Everything degrades gracefully when absent.

const SW_URL = "/sw.js";

export type NotificationPermissionLike = NotificationPermission | "unsupported";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
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
        console.warn("[PWA] service worker registration failed:", err);
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
  const base = { ...(body !== undefined ? { body } : {}), icon: "/icon-192.png", badge: "/icon-192.png", ...(tag !== undefined ? { tag } : {}), data: { url } };
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

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// VAPID public key (generate with `npx web-push generate-vapid-keys`).
const VAPID_PUBLIC_KEY = (import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined) ?? "";

export function isWebPushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

// Ask the user for permission and (when configured) create a push subscription.
// Returns a status string so the UI can react.
export async function enableNotifications(): Promise<
  "granted" | "denied" | "unsupported" | "subscribe-failed"
> {
  if (!isPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsupported";

  if (!isWebPushConfigured()) {
    // Permission granted; background-while-minimized works via the SW already.
    return "granted";
  }

  try {
    const reg = await registerServiceWorker();
    if (!reg) return "subscribe-failed";
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    // Persist the subscription so the backend can target this device.
    const { savePushSubscription } = await import("@/lib/push-subscription.functions");
    const subscription = sub.toJSON();
    const p256dh = subscription.keys?.["p256dh"];
    const auth = subscription.keys?.["auth"];
    if (!subscription.endpoint || !p256dh || !auth) return "subscribe-failed";
    await savePushSubscription({ data: { endpoint: subscription.endpoint, keys: { p256dh, auth } } });
    return "granted";
  } catch (err) {
    console.warn("[PWA] push subscription failed:", err);
    return "subscribe-failed";
  }
}

// Dismiss a previously shown background notification (e.g. when the user opens
// the relevant view). Uses the tag assigned when it was shown.
export async function clearBackgroundNotification(tag: string): Promise<void> {
  const reg = await registerServiceWorker();
  if (!reg) return;
  const tags = await reg.getNotifications({ tag });
  tags.forEach((n) => n.close());
}
