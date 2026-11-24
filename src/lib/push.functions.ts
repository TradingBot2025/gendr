import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import webpush from "web-push";

// Public VAPID key (safe to embed — it's meant to be shared with browsers). The
// matching PRIVATE key is read from the VAPID_PRIVATE_KEY server secret. See
// MIGRATIONS TO APPLY / setup notes: set VAPID_PRIVATE_KEY in Lovable secrets to
// the matching private key. If it's missing, push is silently skipped.
export const VAPID_PUBLIC_KEY =
  "BMMGlqGjJSf0yViJbY6jxi9BU8SiMt8UgVgAzeb0WELtwaGxNsZWAbhzmWPJwE8A0ez0Qza-lATl-tFQWlR_-Ug";

type PushPayload = {
  to: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/**
 * Send a Web Push to all of a user's registered devices. Triggered by the
 * sender's client (e.g. after sending a message or starting a call) so the
 * recipient gets a notification even when their app is fully closed.
 *
 * Requires: the VAPID_PRIVATE_KEY secret and the public.push_subscriptions
 * table (see MIGRATIONS TO APPLY). Degrades gracefully (no-op) if not set up.
 */
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PushPayload) => {
    if (typeof d?.to !== "string" || typeof d?.title !== "string")
      throw new Error("Invalid push payload");
    return { to: d.to, title: d.title, body: d.body, url: d.url, tag: d.tag };
  })
  .handler(async ({ data }) => {
    const privKey = process.env["VAPID_PRIVATE_KEY"];
    if (!privKey) return { sent: 0, configured: false };

    try {
      // Service-role client: we must read the RECIPIENT's subscriptions, which
      // the caller's RLS-scoped client is not allowed to read.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", data.to);

      if (!subs || subs.length === 0) return { sent: 0, configured: true };

      webpush.setVapidDetails(
        process.env["VAPID_SUBJECT"] ?? "mailto:admin@gender.app",
        VAPID_PUBLIC_KEY,
        privKey,
      );

      let sent = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint as string,
              keys: { p256dh: s.p256dh as string, auth: s.auth as string },
            },
            JSON.stringify({
              title: data.title,
              body: data.body ?? "",
              url: data.url ?? "/",
              tag: data.tag,
            }),
          );
          sent++;
        } catch (err) {
          // 404/410 = subscription expired/gone: clean it up so we stop retrying.
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("id", s.id as string);
          }
        }
      }
      return { sent, configured: true };
    } catch (err) {
      console.error("[push] send failed:", err instanceof Error ? err.message : err);
      return { sent: 0, configured: true };
    }
  });
