import { supabase } from "@/integrations/supabase/client";

// Only upload a tiny, irreversibly pixelated derivative, never an original to this bucket.
export async function uploadBlurredPreview(userId: string, file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const tiny = document.createElement("canvas");
  tiny.width = 8;
  tiny.height = 10;
  const small = tiny.getContext("2d");
  if (!small) throw new Error("Image processing unavailable");
  small.drawImage(bitmap, 0, 0, 8, 10);
  bitmap.close();
  const output = document.createElement("canvas");
  output.width = 160;
  output.height = 200;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Image processing unavailable");
  ctx.filter = "blur(12px)";
  ctx.drawImage(tiny, -20, -20, 200, 240);
  const blob = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Preview failed"))),
      "image/jpeg",
      0.65,
    ),
  );
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("photo-previews")
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}
