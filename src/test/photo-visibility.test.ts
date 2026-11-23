import { describe, expect, it } from "vitest";
import { canViewPrivateAlbum, coverPhoto } from "@/lib/photo-visibility";

describe("Photo privacy", () => {
  it("requires the owner's explicit approval, not a match", () => {
    expect(canViewPrivateAlbum("owner", "viewer", "accepted")).toBe(false);
    expect(canViewPrivateAlbum("owner", "viewer", "pending")).toBe(false);
    expect(canViewPrivateAlbum("owner", "viewer", "approved")).toBe(true);
  });
  it("shows a safe blurred derivative when all photos are private", () => {
    expect(coverPhoto([{ path: "original.jpg", preview_path: "blur.jpg", is_private: true, album_id: "album" }])).toEqual({ path: "blur.jpg", blurred: true });
  });
  it("uses a dummy image when no photos exist", () => {
    expect(coverPhoto([])).toEqual({ path: null, blurred: false });
  });
  it("never falls back to a private original without a preview", () => {
    expect(coverPhoto([{ path: "secret.jpg", is_private: true, album_id: "album" }]).path).toBeNull();
  });
  it("prefers a public main-album photo over private photos", () => {
    expect(coverPhoto([{ path: "secret.jpg", is_private: true, album_id: "album", position: 0 }, { path: "public.jpg", is_private: false, album_id: null, position: 1 }])).toEqual({ path: "public.jpg", blurred: false });
  });
});