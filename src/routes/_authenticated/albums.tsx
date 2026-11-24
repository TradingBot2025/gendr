import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned } from "@/lib/data";
import { notifyUser } from "@/lib/push-notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image, Plus, Trash2, ShieldCheck, Lock, Move } from "lucide-react";

export const Route = createFileRoute("/_authenticated/albums")({
  head: () => ({
    meta: [
      { title: "Private Albums — Gender" },
      {
        name: "description",
        content: "Manage your private photo albums. Shared only with your matches.",
      },
    ],
  }),
  component: Albums,
});

function Albums() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movePhotoId, setMovePhotoId] = useState<string | null>(null);
  const [moveAlbumId, setMoveAlbumId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [draggedPhoto, setDraggedPhoto] = useState<{ id: string; albumId: string | null } | null>(
    null,
  );
  const [dragOverAlbum, setDragOverAlbum] = useState<string | null>(null);

  const { data: albumsData } = useQuery({
    queryKey: ["albums", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      if (!me) return [];
      const [{ data: alb }, { data: photos }] = await Promise.all([
        supabase
          .from("photo_albums")
          .select("*")
          .eq("user_id", me?.user.id ?? "")
          .order("created_at", { ascending: false }),
        supabase
          .from("photos")
          .select("id,path,album_id,is_private,view_timer,position")
          .eq("user_id", me?.user.id ?? "")
          .order("position"),
      ]);
      const byAlbum: Record<string, typeof photos> = {};
      (photos ?? []).forEach((p) => {
        const k = p.album_id ?? "none";
        if (!byAlbum[k]) byAlbum[k] = [];
        byAlbum[k]?.push(p);
      });
      // Create a "Main photos" pseudo-album for photos not in any album
      const mainPhotos = byAlbum["none"] ?? [];
      const albumList = (alb ?? []).map((a) => ({ ...a, photos: byAlbum[a.id] ?? [] }));
      if (mainPhotos.length > 0) {
        albumList.unshift({
          id: "none",
          name: "Main photos",
          is_private: false,
          created_at: "",
          user_id: me?.user.id ?? "",
          photos: mainPhotos,
        });
      }
      return albumList;
    },
  });
  const urls = useSigned(
    "photos",
    (albumsData ?? []).flatMap((a) => a.photos.map((p) => p.path)),
  );

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const { error } = await supabase
      .from("photo_albums")
      .insert({ user_id: me?.user.id ?? "", name: newName.trim(), is_private: true });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewName("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const remove = async (id: string) => {
    if (albumsData?.find((a) => a.id === id)?.photos.length) {
      toast.error("Move or delete the photos before deleting this album");
      return;
    }
    setDeletingId(id);
    const { error } = await supabase.from("photo_albums").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album deleted");
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const setTimer = async (photoId: string, timer: "normal" | "10s" | "15s") => {
    const { error } = await supabase.from("photos").update({ view_timer: timer }).eq("id", photoId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const movePhoto = async (photoId: string, targetAlbumId: string | null) => {
    const { error } = await supabase
      .from("photos")
      .update({ album_id: targetAlbumId })
      .eq("id", photoId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(targetAlbumId ? "Photo moved to album" : "Photo removed from album");
    setShowMoveDialog(false);
    setMovePhotoId(null);
    setMoveAlbumId(null);
    qc.invalidateQueries({ queryKey: ["albums"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["photo-covers"] });
  };

  const handleDragStart = (e: React.DragEvent, photoId: string, albumId: string | null) => {
    // Store albumId as string: "none" for main photos, UUID for albums
    const albumIdStr = albumId ?? "none";
    setDraggedPhoto({ id: photoId, albumId: albumIdStr });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", photoId);
  };

  const handleDragEnd = () => {
    setDraggedPhoto(null);
    setDragOverAlbum(null);
  };

  const handleDragOver = (e: React.DragEvent, albumId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverAlbum(albumId);
  };

  const handleDragLeave = () => {
    setDragOverAlbum(null);
  };

  const handleDrop = async (e: React.DragEvent, targetAlbumId: string) => {
    e.preventDefault();
    if (!draggedPhoto) return;
    // Both are strings: "none" or UUID
    if (draggedPhoto.albumId === targetAlbumId) {
      setDraggedPhoto(null);
      setDragOverAlbum(null);
      return;
    }
    const targetId = targetAlbumId === "none" ? null : targetAlbumId;
    const { error } = await supabase
      .from("photos")
      .update({ album_id: targetId })
      .eq("id", draggedPhoto.id);
    if (error) {
      toast.error(error.message);
      console.error("Move error:", error);
    } else {
      toast.success("Photo moved");
      qc.invalidateQueries({ queryKey: ["albums"] });
    }
    setDraggedPhoto(null);
    setDragOverAlbum(null);
  };

  const { data: access = [] } = useQuery({
    queryKey: ["album-access", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("album_access_requests")
        .select("*,requester:profiles!album_access_requests_requester_id_fkey(display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const respondAccess = async (id: string, status: "approved" | "declined") => {
    // Declining (or revoking) removes the request row so the viewer can request
    // access again later; a stale 'declined' row would otherwise block re-requests.
    const { error } =
      status === "declined"
        ? await supabase.from("album_access_requests").delete().eq("id", id)
        : await supabase.from("album_access_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Album access approved" : "Album access removed");
      void qc.invalidateQueries({ queryKey: ["album-access"] });
      if (status === "approved") {
        const req = access.find((a) => a.id === id) as { requester_id?: string } | undefined;
        if (req?.requester_id) {
          void notifyUser(req.requester_id, {
            title: me?.profile?.display_name ?? "Someone",
            body: "approved your album access request",
            url: "/albums",
            tag: "album-approved",
          });
        }
      }
    }
  };
  if (!me) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Private albums</h1>
          <p className="text-muted-foreground">
            Approve each viewer separately for each private album.
          </p>
        </div>
        <Button variant="hero" onClick={() => setOpen(true)}>
          <Plus />
          New album
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Album access</h2>
          <Button asChild variant="outline">
            <Link to="/profile">Add photos</Link>
          </Button>
        </div>
        {access.filter((r) => albumsData?.some((a) => a.id === r.album_id)).length === 0 && (
          <p className="text-sm text-muted-foreground">No access requests yet.</p>
        )}
        {access
          .filter((r) => albumsData?.some((a) => a.id === r.album_id))
          .map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <div>
                <p className="font-medium">
                  {r.requester?.display_name ?? "Member"} ·{" "}
                  {albumsData?.find((a) => a.id === r.album_id)?.name}
                </p>
                <p className="text-sm text-muted-foreground">{r.status}</p>
              </div>
              <div className="flex gap-2">
                {r.status === "pending" && (
                  <Button size="sm" onClick={() => respondAccess(r.id, "approved")}>
                    Approve
                  </Button>
                )}
                {r.status !== "declined" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondAccess(r.id, "declined")}
                  >
                    {r.status === "approved" ? "Revoke" : "Decline"}
                  </Button>
                )}
              </div>
            </div>
          ))}
      </section>

      {albumsData?.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-card p-16 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold">No private albums yet</h3>
          <p className="text-sm text-muted-foreground">
            Create a private album and approve who can view it.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albumsData?.map((a) => {
            const albumId = a.id === "none" ? "none" : a.id;
            const isDragOver = dragOverAlbum === albumId;
            return (
              <div
                key={a.id}
                className={`rounded-3xl border bg-card p-5 shadow-soft transition-colors ${isDragOver ? "border-primary bg-primary/5 ring-2 ring-primary/20" : ""}`}
                onDragOver={(e) => handleDragOver(e, albumId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, albumId)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">{a.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${a.is_private ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    <Lock className="h-3 w-3" /> {a.is_private ? "Private" : "Public"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {a.photos.length} photo{a.photos.length !== 1 ? "s" : ""}
                </p>
                <div className="grid gap-2">
                  {a.photos.map((p) => (
                    <div
                      key={p.id}
                      className={`relative aspect-square overflow-hidden rounded-xl bg-muted transition-opacity ${draggedPhoto?.id === p.id ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, p.id, p.album_id ?? "none")}
                      onDragEnd={handleDragEnd}
                    >
                      {urls[p.path] ? (
                        <img src={urls[p.path]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          ?
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimer(p.id, "normal");
                          }}
                          title="Normal"
                        >
                          <span className="text-[10px]">∞</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimer(p.id, "10s");
                          }}
                          title="10 seconds"
                        >
                          <span className="text-[10px]">10s</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimer(p.id, "15s");
                          }}
                          title="15 seconds"
                        >
                          <span className="text-[10px]">15s</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMovePhotoId(p.id);
                            setMoveAlbumId(p.album_id ?? "none");
                            setShowMoveDialog(true);
                          }}
                          title="Move to album"
                        >
                          <Move className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 text-xs">
                        {p.view_timer && p.view_timer !== "normal" && (
                          <span className="bg-black/70 text-white px-1.5 py-0.5 rounded">
                            {p.view_timer}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {a.id !== "none" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingId === a.id}
                    onClick={() => remove(a.id)}
                    className="mt-3 w-full"
                  >
                    {deletingId === a.id ? "Deleting…" : "Delete album"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New private album</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Album name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Vacation 2024"
              />
            </div>
            <Button type="submit" variant="hero" disabled={creating} className="w-full">
              {creating ? "Creating…" : "Create album"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {showMoveDialog && (
        <Dialog
          open={showMoveDialog}
          onOpenChange={() => {
            setShowMoveDialog(false);
            setMovePhotoId(null);
            setMoveAlbumId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Select destination album (or "None" to remove from album)
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                  <input
                    type="radio"
                    name="moveAlbum"
                    value="none"
                    checked={moveAlbumId === "none"}
                    onChange={() => setMoveAlbumId("none")}
                    className="h-4 w-4"
                  />
                  <span>None (remove from album)</span>
                </label>
                {albumsData?.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="moveAlbum"
                      value={a.id}
                      checked={moveAlbumId === a.id}
                      onChange={() => setMoveAlbumId(a.id)}
                      className="h-4 w-4"
                    />
                    <span>
                      {a.name} ({a.is_private ? "Private" : "Public"})
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowMoveDialog(false);
                    setMovePhotoId(null);
                    setMoveAlbumId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() =>
                    movePhotoId &&
                    movePhoto(movePhotoId, moveAlbumId === "none" ? null : moveAlbumId)
                  }
                  disabled={!movePhotoId}
                >
                  Move
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
