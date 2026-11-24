import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignalSchema = z.object({
  to: z.string().uuid(),
  type: z.enum(["offer", "answer", "ice", "hangup", "decline"]),
  sdp: z.any().optional(),
  candidate: z.any().optional(),
  video: z.boolean().optional(),
  random: z.boolean().optional(),
  // Caller's display name, forwarded so the recipient sees who is calling
  // instead of a generic "Someone".
  name: z.string().optional(),
});

export const sendCallSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SignalSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { to, type, sdp, candidate, video, random } = data;

    // Validate that users can communicate
    if (random) {
      // For random calls: check both are in matched state in queue
      const { data: myQueue } = await supabase
        .from("random_matchmaking_queue")
        .select("status, matched_with")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: theirQueue } = await supabase
        .from("random_matchmaking_queue")
        .select("status, matched_with")
        .eq("user_id", to)
        .maybeSingle();

      if (!myQueue || !theirQueue) throw new Error("Not in random queue");
      if (myQueue.status !== "matched" || theirQueue.status !== "matched")
        throw new Error("Not matched");
      if (myQueue.matched_with !== to || theirQueue.matched_with !== userId)
        throw new Error("Not matched with each other");
    } else {
      // For regular calls: check accepted connection exists
      const { data: conn } = await supabase
        .from("connections")
        .select("id")
        .eq("status", "accepted")
        .or(
          `and(requester.eq.${userId},addressee.eq.${to}),and(requester.eq.${to},addressee.eq.${userId})`,
        )
        .maybeSingle();

      if (!conn) throw new Error("No accepted connection");
    }

    // Broadcast to the recipient's call channel. This is a PUBLIC realtime
    // channel (no `private: true`) so it works without any realtime.messages
    // RLS policies — private channels require DB policies that may not be
    // applied, which silently broke all calling. Media itself is still
    // end-to-end encrypted (DTLS-SRTP); only SDP/ICE metadata uses this channel.
    const channel = supabase.channel(`private-call-${to}`);
    // Join the topic before publishing so the broadcast is actually delivered
    // (some supabase-js versions drop sends on an unjoined channel). Proceed to
    // send even if the join is slow/fails — worst case matches the old behavior.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      channel.subscribe((status) => {
        if (status !== "CONNECTING") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const result = await channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...data, from: userId },
    });
    await supabase.removeChannel(channel);
    if (result === "error") throw new Error("Call signal delivery failed");
    return { ok: true };
  });

export const getTurnCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Call the database function for TURN credentials
    const { data, error } = await supabase.rpc("get_turn_credentials");
    if (error) throw error;

    // data is an array of rows from the RETURNS TABLE function
    const creds = data?.[0];
    if (!creds) throw new Error("Failed to get TURN credentials");

    return {
      username: creds.username,
      credential: creds.credential,
      urls: creds.urls,
      ttl: creds.ttl,
    };
  });
