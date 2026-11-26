// Client-side helpers for app (PWA) notifications.
//
// Background notifications while the tab is hidden/minimized are shown by the
// service worker via postMessage (works with just the Notification permission).
// When the app is FULLY closed, delivery uses real Web Push (service worker +
// push subscription stored in public.push_subscriptions + VAPID keys). The
// private VAPID key lives server-side; only the public key is embedded here.

import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — safe to ship to browsers. MUST match the server's
// VAPID_PRIVATE_KEY (see src/lib/push.functions.ts).
const VAPID_PUBLIC_KEY =
  "BMMGlqGjJSf0yViJbY6jxi9BU8SiMt8UgVgAzeb0WELtwaGxNsZWAbhzmWPJwE8A0ez0Qza-lATl-tFQWlR_-Ug";

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
  const base: NotificationOptions = {
    ...(body !== undefined ? { body } : {}),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    ...(tag !== undefined ? { tag } : {}),
    data: { url },
  };
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
export async function enableNotifications(): Promise<NotificationPermissionLike> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  return permission;
}

// --- Web Push (works even when the app is fully closed) ---

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Subscribe this device to Web Push (if permission is granted) and persist the
// subscription in public.push_subscriptions so the server can push to it. Safe
// to call repeatedly — it reuses an existing subscription and upserts by
// endpoint. No-op (never throws) if push isn't supported or not permitted.
export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const reg = await registerServiceWorker();
    if (!reg || !("pushManager" in reg)) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth } as never,
        {
          onConflict: "endpoint",
        },
      );
  } catch (err) {
    console.warn("[push] subscribe failed:", err);
  }
}

// Dismiss a previously shown background notification (e.g. when the user opens
// the relevant view).
export async function clearBackgroundNotification(tag: string): Promise<void> {
  const reg = await registerServiceWorker();
  if (!reg) return;
  const tags = await reg.getNotifications({ tag });
  tags.forEach((n) => n.close());
}
