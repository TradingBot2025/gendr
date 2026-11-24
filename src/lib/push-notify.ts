import { sendPushToUser } from "@/lib/push-sender.functions";

/**
 * Best-effort push to a user's devices. Called by the actor (who is online)
 * right after they create an event so the recipient gets a native notification
 * even if their app is closed. Never throws — push delivery must not break or
 * block the in-app action.
 */
export async function notifyUser(
  to: string,
  payload: { title: string; body?: string; url?: string; tag?: string },
): Promise<void> {
  if (!to) return;
  try {
    await sendPushToUser({ data: { to, ...payload } });
  } catch (err) {
    console.warn("[push] notifyUser failed:", err);
  }
}
