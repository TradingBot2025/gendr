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

    if (!process.env["LOVABLE_API_KEY"]) {
      console.error("[moderation] LOVABLE_API_KEY is not set — skipping nudity check.");
      return { explicit: false, reason: "Moderation not configured" };
    }

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
              'You are a strict content-safety moderator for a dating app. Look at the image and decide if it shows ANY nudity or sexually explicit content. Set "explicit" to true if the image contains ANY of: fully or partially nude body, bare breasts / nipples, bare buttocks, exposed genitals, visible pubic area, see-through clothing revealing the above, or sexual activity. When in doubt, set explicit=true. Ordinary clothed photos, faces, and swimwear that fully covers the body are explicit=false. Reply ONLY a JSON object: {"explicit": boolean, "reason": short string}.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Moderate this image for nudity / explicit content." },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[moderation] gateway error", res.status);
      return { explicit: false, reason: `Moderation unavailable (${res.status})` };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let result = { explicit: false, reason: "No answer" };
    const content = json.choices?.[0]?.message?.content ?? "";
    try {
      result = JSON.parse(content);
    } catch {
      // Some models wrap JSON in prose/fences — try to extract the first object.
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          result = JSON.parse(m[0]);
        } catch {
          /* keep default */
        }
      }
    }
    const explicit = result.explicit === true;
    console.log("[moderation] explicit=%s reason=%s", explicit, result.reason);
    return { explicit, reason: result.reason };
  });
