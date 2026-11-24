import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * Image moderation for auto-protecting explicit uploads.
 *
 * Given a path in the user's own "photos" bucket, asks the Lovable AI gateway
 * (Gemini vision) whether the image is nude / sexually explicit. Used to force
 * such photos into a private album so they are never shown publicly. Fails open
 * (explicit=false) when the service is unavailable so uploads aren't blocked.
 */
export const moderateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => {
    if (typeof d?.path !== "string" || !d.path) throw new Error("Invalid image path");
    if (d.path.length > 400) throw new Error("Invalid image path");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: blob } = await supabase.storage.from("photos").download(data.path);
    if (!blob) return { explicit: false, reason: "Could not read image" };

    const url = `data:${blob.type || "image/jpeg"};base64,${toBase64(await blob.arrayBuffer())}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are a content-safety moderator for a dating app. Decide whether the image contains nudity or sexually explicit content (e.g. fully nude body, exposed genitals, bare breasts or buttocks, or sexual acts). Do NOT flag ordinary clothed or swimwear photos. Reply ONLY JSON: {"explicit": boolean, "reason": string}.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Is this image nude or sexually explicit?" },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { explicit: false, reason: "Moderation unavailable" };

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let result = { explicit: false, reason: "No answer" };
    try {
      result = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      /* keep default (fail open) */
    }
    return { explicit: !!result.explicit, reason: result.reason };
  });
