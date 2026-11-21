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

export const verifyFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { selfie: string }) => {
    if (typeof d?.selfie !== "string" || !d.selfie.startsWith("data:image/")) throw new Error("Invalid selfie");
    if (d.selfie.length > 6_000_000) throw new Error("Selfie too large");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: photos } = await supabase.from("photos").select("path").eq("user_id", userId).order("position").limit(3);
    if (!photos?.length) return { verified: false, reason: "Add at least one profile photo first." };

    const images: string[] = [];
    for (const p of photos) {
      const { data: blob } = await supabase.storage.from("photos").download(p.path);
      if (blob) images.push(`data:${blob.type || "image/jpeg"};base64,${toBase64(await blob.arrayBuffer())}`);
    }
    if (!images.length) return { verified: false, reason: "Could not read your photos." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'You verify dating profiles. The FIRST image is a live selfie. The others are profile photos. Decide if the selfie shows a real live person and the same person appears in at least one profile photo. Reply only JSON: {"match": boolean, "confidence": number 0-1, "reason": string}.' },
          {
            role: "user",
            content: [
              { type: "text", text: "Selfie first, then profile photos." },
              { type: "image_url", image_url: { url: data.selfie } },
              ...images.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
      }),
    });
    if (res.status === 429) return { verified: false, reason: "Too many attempts right now, try again in a minute." };
    if (!res.ok) return { verified: false, reason: "Verification service unavailable, try again." };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let result = { match: false, confidence: 0, reason: "No answer" };
    try { result = JSON.parse(json.choices?.[0]?.message?.content ?? "{}"); } catch { /* keep default */ }
    const ok = !!result.match && Number(result.confidence) >= 0.7;
    if (ok) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("profiles").update({ verified: true }).eq("id", userId);
    }
    return { verified: ok, reason: result.reason };
  });
