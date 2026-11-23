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
});

export const sendCallSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(SignalSchema)
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

    // Broadcast to the recipient's private channel
    const { error } = await supabase.channel(`private-call-${to}`).send({
      type: "broadcast",
      event: "signal",
      payload: { ...data, from: userId },
    });

    if (error) throw error;
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
