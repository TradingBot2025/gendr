export type PhotoVisibility = { path: string; preview_path?: string | null; is_private: boolean; album_id: string | null; position?: number };

export function coverPhoto(photos: PhotoVisibility[]) {
  const ordered = [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const publicPhoto = ordered.find((photo) => !photo.is_private && !photo.album_id);
  if (publicPhoto) return { path: publicPhoto.path, blurred: false };
  const privatePhoto = ordered[0];
  return { path: privatePhoto?.preview_path ?? null, blurred: !!privatePhoto };
}

export function canViewPrivateAlbum(ownerId: string, viewerId: string, status?: string) {
  return ownerId === viewerId || status === "approved";
}