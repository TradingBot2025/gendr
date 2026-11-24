import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PayloadSchema = z.object({
  to: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().max(300).optional(),
  url: z.string().max(300).optional(),
  tag: z.string().max(120).optional(),
});

type SubRow = { endpoint: string; p256dh: string; auth: string };

/**
 * Send a Web Push to all of a user's registered devices.
 *
 * Called from the client by the actor (who is online) right after they create an
 * event — a message, a connection request, an acceptance, an album request — so
 * the recipient gets a native notification even when their app is fully closed.
 *
 * Requires the `public.push_subscriptions` table (see MIGRATIONS TO APPLY) and
 * these server env vars:
 *   VAPID_SUBJECT      e.g. mailto:admin@gender.app
 *   VAPID_PUBLIC_KEY   same value as the client's VITE_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY  keep secret, server-only
 *
 * When push is not configured, this is a safe no-op so nothing breaks.
 */
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(PayloadSchema)
  .handler(async ({ data, context }) => {
    const { to, title, body, url, tag } = data;

    // Don't notify yourself.
    if (to === context.userId) return { sent: 0, skipped: true as const };

    const subject = process.env["VAPID_SUBJECT"] || "mailto:admin@gender.app";
    const publicKey = process.env["VAPID_PUBLIC_KEY"] || process.env["VITE_VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];

    if (!publicKey || !privateKey) {
      // Web Push not configured on the server — nothing to deliver.
      return { sent: 0, skipped: true as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const webpush = (await import("web-push")).default;

    // Typed accessor for the push_subscriptions table (not yet in generated
    // types). The service-role client bypasses RLS so we can read the
    // recipient's subscriptions.
    const admin = supabaseAdmin as unknown as {
      from(table: "push_subscriptions"): {
        select(cols: string): {
          eq(
            col: string,
            val: string,
          ): PromiseLike<{ data: SubRow[] | null; error: { message: string } | null }>;
        };
        delete(): { eq(col: string, val: string): PromiseLike<{ error: unknown }> };
      };
    };

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", to);

    if (error || !subs?.length) return { sent: 0, skipped: true as const };

    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body, url, tag }),
            {
              vapidDetails: { subject, publicKey, privateKey },
              TTL: 60 * 60 * 24,
            },
          );
          sent++;
        } catch (e) {
          const statusCode = (e as { statusCode?: number })?.statusCode;
          // 404/410 means the subscription is dead — clean it up.
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      }),
    );

    return { sent, skipped: false as const };
  });
