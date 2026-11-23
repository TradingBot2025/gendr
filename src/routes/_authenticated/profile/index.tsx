import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Camera, ImagePlus, Star, Trash2, Lock, Clock, Plus } from "lucide-react";
import { ProfileCard } from "@/components/app/ProfileCard";
import { supabase } from "@/integrations/supabase/client";
import {
  GENDERS,
  ORIENTATIONS,
  useMe,
  useSigned,
  usePhotoAlbums,
  type PhotoAlbum,
} from "@/lib/data";
import { uploadBlurredPreview } from "@/lib/photo-previews";
import { verifyFace } from "@/lib/verify.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/profile/")({
  head: () => ({
    meta: [
      { title: "My profile — Gender" },
      { name: "description", content: "Edit your details, photos and verification." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    gender: "",
    orientation: "",
    birthdate: "",
    city: "",
    country: "",
    bio: "",
    looking_for: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [newAlbum, setNewAlbum] = useState("");
  const [uploadAlbum, setUploadAlbum] = useState<string | null>(null);
  const [uploadTimer, setUploadTimer] = useState<"normal" | "10s" | "15s">("normal");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = me?.profile;
    if (p)
      setForm({
        display_name: p.display_name ?? "",
        username: p.username ?? "",
        gender: p.gender ?? "",
        orientation: p.orientation ?? "",
        birthdate: p.birthdate ?? "",
        city: p.city ?? "",
        country: p.country ?? "",
        bio: p.bio ?? "",
        looking_for: p.looking_for ?? "",
      });
  }, [me?.profile]);

  const photos = me?.photos ?? [];
  const { data: albums } = usePhotoAlbums();
  const urls = useSigned(
    "photos",
    photos.map((p) => p.path),
  );
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const generate = async () => {
      for (const photo of me.photos.filter((p) => !p.preview_path)) {
        try {
          const { data, error } = await supabase.storage.from("photos").download(photo.path);
          if (error || !data || !alive) continue;
          const preview_path = await uploadBlurredPreview(me.user.id, data);
          const result = await supabase.from("photos").update({ preview_path }).eq("id", photo.id);
          if (result.error) throw result.error;
        } catch {
          /* Originals remain private even when preview generation fails. */
        }
      }
      if (alive && me.photos.some((p) => !p.preview_path))
        void qc.invalidateQueries({ queryKey: ["photo-covers"] });
    };
    void generate();
    return () => {
      alive = false;
    };
  }, [me?.user.id, me?.photos.length, qc]);
  if (!me) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (form.birthdate) {
      const b = new Date(form.birthdate);
      const min = new Date();
      min.setFullYear(min.getFullYear() - 18);
      if (b > min) {
        toast.error("You must be at least 18");
        return;
      }
    }
    if (form.display_name.trim().length < 2) {
      toast.error("Please enter your name");
      return;
    }
    if (form.username && form.username.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (form.username && !/^[a-zA-Z0-9_]+$/.test(form.username.trim())) {
      toast.error("Username can only contain letters, numbers, and underscores");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name.trim().slice(0, 60),
        username: form.username?.trim() || null,
        gender: form.gender || null,
        orientation: form.orientation || null,
        birthdate: form.birthdate || null,
        city: form.city.trim().slice(0, 80) || null,
        country: form.country.trim().slice(0, 80) || null,
        bio: form.bio.trim().slice(0, 500) || null,
        looking_for: form.looking_for.trim().slice(0, 500) || null,
      })
      .eq("id", me.user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile saved");
      refresh();
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["discover"] });
    }
  };

  const createAlbum = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAlbum.trim()) return;
    const { error } = await supabase
      .from("photo_albums")
      .insert({ user_id: me.user.id, name: newAlbum.trim(), is_private: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewAlbum("");
    setAlbumOpen(false);
    refresh();
    qc.invalidateQueries({ queryKey: ["photo-albums"] });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 6 - photos.length;
    if (room <= 0) {
      toast.error("Maximum 6 photos");
      return;
    }
    setUploading(true);
    let pos = photos.length;
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image`);
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} is over 8MB`);
        continue;
      }
      const path = `${me.user.id}/${crypto.randomUUID()}.${f.name.split(".").pop() ?? "jpg"}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(path, f, { contentType: f.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      let preview_path: string | null = null;
      try {
        preview_path = await uploadBlurredPreview(me.user.id, f);
      } catch {
        toast.error("Blurred preview could not be created; the original stays private.");
      }
      const { error: e2 } = await supabase.from("photos").insert({
        preview_path,
        user_id: me.user.id,
        path,
        position: pos++,
        album_id: uploadAlbum || null,
        is_private: !!uploadAlbum,
        view_timer: uploadTimer,
      });
      if (e2) {
        toast.error(e2.message);
        await supabase.storage.from("photos").remove([path]);
      }
    }
    setUploading(false);
    setUploadAlbum(null);
    setUploadTimer("normal");
    if (fileRef.current) fileRef.current.value = "";
    refresh();
    qc.invalidateQueries({ queryKey: ["photo-covers"] });
    qc.invalidateQueries({ queryKey: ["albums"] });
    toast.success("Photos uploaded");
  };

  const remove = async (id: string, path: string) => {
    const { error } = await supabase.from("photos").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from("photos").remove([path]);
    refresh();
  };
  const makeMain = async (id: string) => {
    const selected = photos.find((p) => p.id === id);
    if (!selected) return;
    const order = [selected, ...photos.filter((p) => p.id !== id)];
    const results = await Promise.all(
      order.map((p, i) => supabase.from("photos").update({ position: i }).eq("id", p.id)),
    );
    const failure = results.find((result) => result.error);
    if (failure?.error) toast.error(failure.error.message);
    refresh();
    qc.invalidateQueries({ queryKey: ["photo-covers"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">My profile</h1>
        {me.profile?.verified ? (
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-foreground">
            <BadgeCheck className="h-4 w-4 text-primary" />
            Verified
          </span>
        ) : (
          <Button variant="hero" onClick={() => setVerifyOpen(true)} disabled={!photos.length}>
            <Camera />
            Verify my face
          </Button>
        )}
      </div>
      {!me.complete && (
        <p className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
          Fill in your name, gender, orientation, birthday, city and add at least one photo to
          unlock the app.
        </p>
      )}

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Photos ({photos.length}/6)</h2>
            <p className="text-xs text-muted-foreground">
              Private albums require your separate approval. Set a disappearing timer (10s / 15s).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlbumOpen(true)}
              disabled={photos.length >= 6}
            >
              <Plus className="h-3 w-3 mr-1" />
              New album
            </Button>
            <Button
              variant="outline"
              disabled={uploading || photos.length >= 6}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus />
              {uploading ? "Uploading…" : "Add photos"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
          </div>
        </div>
        <div className="mb-4 space-y-2">
          <Label>Upload destination</Label>
          <Select
            value={uploadAlbum ?? "main"}
            onValueChange={(v) => setUploadAlbum(v === "main" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Main photos (public)</SelectItem>
              {albums
                ?.filter((a) => a.user_id === me.user.id)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} (private)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted"
            >
              {urls[p.path] && (
                <img
                  src={urls[p.path]}
                  alt={`Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              )}
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  Main
                </span>
              )}
              {p.album_id && (
                <span className="absolute left-2 top-10 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  <Lock className="h-3 w-3" /> Private
                </span>
              )}
              {p.view_timer !== "normal" && (
                <span className="absolute right-2 top-10 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  <Clock className="h-3 w-3" /> {p.view_timer}
                </span>
              )}
              <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
                {i > 0 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => makeMain(p.id)}
                    aria-label="Make main photo"
                  >
                    <Star />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => remove(p.id, p.path)}
                  aria-label="Delete photo"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          {!photos.length && (
            <p className="col-span-full py-8 text-center text-muted-foreground">No photos yet.</p>
          )}
        </div>
      </section>

      <form
        onSubmit={save}
        className="grid gap-4 rounded-3xl border bg-card p-6 shadow-soft sm:grid-cols-2"
      >
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={form.display_name}
            onChange={(e) => set("display_name")(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input
            value={form.username}
            onChange={(e) => set("username")(e.target.value)}
            placeholder="@username"
            maxLength={30}
            pattern="[a-zA-Z0-9_]*"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={me.user.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Gender</Label>
          <Select value={form.gender} onValueChange={set("gender")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Orientation</Label>
          <Select value={form.orientation} onValueChange={set("orientation")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {ORIENTATIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Birthday</Label>
          <Input
            type="date"
            value={form.birthdate}
            onChange={(e) => set("birthdate")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => set("city")(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Input
            value={form.country}
            onChange={(e) => set("country")(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>About me</Label>
          <Textarea
            value={form.bio}
            onChange={(e) => set("bio")(e.target.value)}
            maxLength={500}
            rows={4}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Looking for</Label>
          <Textarea
            value={form.looking_for}
            onChange={(e) => set("looking_for")(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>
        <Button type="submit" variant="hero" disabled={saving} className="sm:col-span-2">
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </form>

      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} onDone={refresh} />
      <Dialog open={albumOpen} onOpenChange={setAlbumOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New private album</DialogTitle>
          </DialogHeader>
          <form onSubmit={createAlbum} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Album name</Label>
              <Input
                value={newAlbum}
                onChange={(e) => setNewAlbum(e.target.value)}
                placeholder="e.g. Private moments"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only viewers you approve for this album can see the originals.
            </p>
            <Button type="submit" variant="hero" className="w-full">
              Create album
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VerifyDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => toast.error("Camera access is needed for verification"));
    return () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open]);
  const capture = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
    const context = c.getContext("2d");
    if (!context) return;
    context.drawImage(v, 0, 0, c.width, c.height);
    setBusy(true);
    try {
      const r = await verifyFace({ data: { selfie: c.toDataURL("image/jpeg", 0.85) } });
      if (r.verified) {
        toast.success("You're verified!");
        onDone();
        onOpenChange(false);
      } else toast.error(r.reason || "Could not verify, try again in better light");
    } catch {
      toast.error("Verification failed, try again");
    }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <div className="relative flex flex-col items-center gap-4 bg-stage p-6 rounded-3xl">
          <DialogHeader className="absolute top-4 left-4 right-4 z-10">
            <DialogTitle className="text-stage-foreground">Face verification</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-stage-foreground/80 text-center z-10">
            Look at the camera. We compare this selfie with your profile photos.
          </p>
          <div className="relative aspect-[4/3] w-full max-w-md rounded-2xl overflow-hidden bg-muted">
            <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-full w-full">
                  <div className="absolute left-0 right-0 h-[2px] bg-primary animate-scan"></div>
                  <div className="absolute inset-0 border-2 border-primary/50 animate-pulse rounded-2xl"></div>
                </div>
                <div className="absolute bottom-4 flex items-center gap-2 bg-stage/90 px-3 py-1 rounded-full backdrop-blur">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-stage-foreground">Scanning…</span>
                </div>
              </div>
            )}
          </div>
          <div className="absolute bottom-4 left-4 right-4 z-10">
            <Button variant="hero" onClick={capture} disabled={busy} className="w-full">
              {busy ? "Checking…" : "Take selfie & verify"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
