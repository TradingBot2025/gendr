import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image, Plus, Trash2, ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/albums")({
  head: () => ({ meta: [{ title: "Private Albums — Gender" }, { name: "description", content: "Manage your private photo albums. Shared only with your matches." }] }),
  component: Albums,
});

function Albums() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: albums } = useQuery({
    queryKey: ["albums", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const [{ data: alb }, { data: photos }] = await Promise.all([
        supabase.from("photo_albums").select("*").eq("user_id", me!.user.id).order("created_at", { ascending: false }),
        supabase.from("photos").select("id,path,album_id,is_private,view_timer,position").order("position"),
      ]);
      const byAlbum: Record<string, typeof photos> = {};
      (photos ?? []).forEach((p) => {
        const k = p.album_id ?? "none";
        if (!byAlbum[k]) byAlbum[k] = [];
        byAlbum[k].push(p);
      });
      return (alb ?? []).map((a) => ({ ...a, photos: byAlbum[a.id] ?? [] }));
    },
  });
  const urls = useSigned("photos", (albums ?? []).flatMap((a) => a.photos.map((p) => p.path)));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("photo_albums").insert({ user_id: me!.user.id, name: newName.trim(), is_private: true });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setNewName(""); setOpen(false);
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("photo_albums").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Album deleted");
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const setTimer = async (photoId: string, timer: "normal" | "10s" | "15s") => {
    const { error } = await supabase.from("photos").update({ view_timer: timer }).eq("id", photoId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["albums"] });
  };

  if (!me) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Private albums</h1>
          <p className="text-muted-foreground">Private albums are only visible to your accepted matches. You control who sees them.</p>
        </div>
        <Button variant="hero" onClick={() => setOpen(true)}><Plus />New album</Button>
      </div>

      {albums?.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-card p-16 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold">No private albums yet</h3>
          <p className="text-sm text-muted-foreground">Create a private album and add photos to share only with matches.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <div key={a.id} className="rounded-3xl border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">{a.name}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${a.is_private ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  <Lock className="h-3 w-3" /> {a.is_private ? "Private" : "Public"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{a.photos.length} photo{a.photos.length !== 1 ? "s" : ""}</p>
              <div className="grid gap-2">
                {a.photos.map((p) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                    {urls[p.path] ? <img src={urls[p.path]} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center text-muted-foreground">?</div>}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setTimer(p.id, "normal")} title="Normal"><span className="text-[10px]">∞</span></Button>
                      <Button size="icon" variant="ghost" onClick={() => setTimer(p.id, "10s")} title="10 seconds"><span className="text-[10px]">10s</span></Button>
                      <Button size="icon" variant="ghost" onClick={() => setTimer(p.id, "15s")} title="15 seconds"><span className="text-[10px]">15s</span></Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="destructive" disabled={deletingId === a.id} onClick={() => remove(a.id)} className="mt-3 w-full">{deletingId === a.id ? "Deleting…" : "Delete album"}</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New private album</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4 p-4">
            <div className="space-y-1.5"><Label>Album name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Vacation 2024" /></div>
            <Button type="submit" variant="hero" disabled={creating} className="w-full">{creating ? "Creating…" : "Create album"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
