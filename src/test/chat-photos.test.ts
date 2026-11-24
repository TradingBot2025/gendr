import { describe, expect, it } from "vitest";
import { chatPhotos } from "@/lib/chat-photos";

describe("chat photo viewer", () => {
  it("opens only image attachments with an accessible path", () => {
    expect(chatPhotos([
      { id: "image", attachment_path: "a/photo.png", attachment_type: "image/png" },
      { id: "missing", attachment_path: null, attachment_type: "image/png" },
      { id: "inaccessible", attachment_path: "hidden.png", attachment_type: "image/png" },
      { id: "video", attachment_path: "video.mp4", attachment_type: "video/mp4" },
    ], { "a/photo.png": "signed-image", "video.mp4": "signed-video" })).toEqual([
      { id: "image", path: "a/photo.png", album_id: null, attachment_type: "image/png" },
    ]);
  });
});