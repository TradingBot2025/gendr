import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Shape of a PushSubscription.toJSON() payload we care about.
const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// Store (or refresh) the current user's Web Push subscription so the backend
// can deliver push notifications to this device.
//
// Requires the `public.push_subscriptions` table — see MIGRATIONS TO APPLY.
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SubscriptionSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { endpoint, keys } = data;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: "endpoint" },
    );

    if (error) throw error;
    return { ok: true };
  });
