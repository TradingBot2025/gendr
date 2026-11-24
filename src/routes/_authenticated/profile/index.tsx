import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  ImagePlus,
  Star,
  Trash2,
  Lock,
  Globe,
  Clock,
  Plus,
  MapPin,
  Pencil,
  Eye,
} from "lucide-react";
import { ProfileCard } from "@/components/app/ProfileCard";
import { supabase } from "@/integrations/supabase/client";
import {
  GENDERS,
  ORIENTATIONS,
  EDUCATION_LEVELS,
  CHILDREN_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  useMe,
  useSigned,
  usePhotoAlbums,
  ageOf,
  type PhotoAlbum,
} from "@/lib/data";
import { uploadBlurredPreview } from "@/lib/photo-previews";
import { verifyFace } from "@/lib/verify.functions";
import { moderateImage } from "@/lib/moderation.functions";
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
    height: "",
    weight: "",
    education: "",
    children: "",
    marital_status: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
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
        height: p.height?.toString() ?? "",
        weight: p.weight?.toString() ?? "",
        education: p.education ?? "",
        children: p.children ?? "",
        marital_status: p.marital_status ?? "",
      });
  }, [me?.profile]);

  const photos = me?.photos ?? [];
  const { data: albums } = usePhotoAlbums();
  // Per-destination photo limits: main (public) album up to 10, each private album
  // up to 5. The uploader targets `uploadAlbum` (null = main).
  const mainPhotoCount = photos.filter((ph) => !ph.album_id).length;
  const uploadIsMain = !uploadAlbum;
  const uploadTargetCount = uploadIsMain
    ? mainPhotoCount
    : photos.filter((ph) => ph.album_id === uploadAlbum).length;
  const uploadTargetMax = uploadIsMain ? 10 : 5;
  const uploadTargetFull = uploadTargetCount >= uploadTargetMax;
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

  // View mode — how other members see this profile. Shown first; "Edit profile"
  // switches to the editor below.
  if (!editing) {
    const pr = me.profile;
    const age = ageOf(pr?.birthdate ?? null);
    const mainPhotos = photos.filter((ph) => !ph.album_id);
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">My profile</h1>
          <Button variant="hero" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit profile
          </Button>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-soft">
          {mainPhotos[0] && urls[mainPhotos[0].path] ? (
            <div className="aspect-[4/5] max-h-[480px] bg-muted">
              <img
                src={urls[mainPhotos[0].path]}
                alt={pr?.display_name ?? "Me"}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-[4/5] max-h-[480px] items-center justify-center bg-muted">
              <img
                src="/profile-placeholder.svg"
                alt="No photo"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="space-y-3 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-bold">
                {pr?.display_name ?? "Your name"}
                {age !== null && (
                  <span className="text-xl font-normal text-muted-foreground">, {age}</span>
                )}
                {pr?.verified && <BadgeCheck className="h-5 w-5 text-primary" />}
              </h2>
              {pr?.verified ? (
                <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-foreground">
                  <BadgeCheck className="h-4 w-4 text-primary" /> Verified
                </span>
              ) : (
                <Button
                  variant="hero"
                  size="sm"
                  onClick={() => setVerifyOpen(true)}
                  disabled={!photos.length}
                >
                  <Camera className="mr-1 h-4 w-4" /> Verify
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {pr?.gender && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                  {pr.gender}
                </span>
              )}
              {pr?.orientation && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                  {pr.orientation}
                </span>
              )}
            </div>
            {(pr?.city || pr?.country) && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {pr?.city}
                {pr?.city && pr?.country && ", "}
                {pr?.country}
              </div>
            )}
            {pr?.bio && <p className="text-muted-foreground">{pr.bio}</p>}
            {pr?.looking_for && (
              <div className="rounded-2xl bg-muted/40 p-4 text-sm">
                <div className="text-xs text-muted-foreground">Looking for</div>
                <div className="font-medium">{pr.looking_for}</div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/discover">
                  <Eye className="mr-2 h-4 w-4" /> Preview in Discover
                </Link>
              </Button>
              <Button className="flex-1" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit profile
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
    const baseFields = {
      display_name: form.display_name.trim().slice(0, 60),
      username: form.username?.trim() || null,
      gender: form.gender || null,
      orientation: form.orientation || null,
      birthdate: form.birthdate || null,
      city: form.city.trim().slice(0, 80) || null,
      country: form.country.trim().slice(0, 80) || null,
      bio: form.bio.trim().slice(0, 500) || null,
      looking_for: form.looking_for || null,
    };
    const extendedFields = {
      height: form.height ? Number(form.height) : null,
      weight: form.weight ? Number(form.weight) : null,
      education: form.education || null,
      children: form.children || null,
      marital_status: form.marital_status || null,
    };
    // Try the full update first; if the extended columns aren't in the DB yet
    // (migration 0006 not applied), fall back to base fields only.
    let { error } = await supabase
      .from("profiles")
      .update({ ...baseFields, ...extendedFields })
      .eq("id", me.user.id);
    if (error) {
      const retry = await supabase.from("profiles").update(baseFields).eq("id", me.user.id);
      error = retry.error;
    }
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

  // Find (or create) the user's private album — used to auto-hide explicit
  // uploads. Privacy in this app == private-album membership (enforced by the
  // sync_photo_privacy DB trigger), so explicit photos must land in an album.
  const ensurePrivateAlbum = async (): Promise<string | null> => {
    if (!me) return null;
    if (uploadAlbum) return uploadAlbum;
    const existing = (albums ?? []).find((a) => a.user_id === me.user.id);
    if (existing) return existing.id;
    const { data } = await supabase
      .from("photo_albums")
      .insert({ user_id: me.user.id, name: "Private Photos", is_private: true })
      .select("id")
      .single();
    return data?.id ?? null;
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = uploadTargetMax - uploadTargetCount;
    if (room <= 0) {
      toast.error(
        uploadIsMain
          ? "Main album is full (10/10). Delete a photo to add another."
          : "This album is full (5/5). Delete a photo to add another.",
      );
      return;
    }
    setUploading(true);
    let pos = uploadTargetCount;
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
      // Auto-protect explicit/nude uploads: if the moderation model flags the
      // image, force it into a private album so it's never shown publicly,
      // regardless of the selected destination.
      let explicit = false;
      try {
        const mod = await moderateImage({ data: { path } });
        explicit = !!mod.explicit;
      } catch (err) {
        // Fail open: if moderation is unavailable, respect the user's choice.
        console.error("[moderation] check failed:", err);
      }
      let albumId: string | null = uploadAlbum || null;
      let isPrivate = !!uploadAlbum;
      if (explicit) {
        albumId = await ensurePrivateAlbum();
        isPrivate = true;
        toast.warning("This photo was moved to a private album (explicit content).");
      }
      const { error: e2 } = await supabase.from("photos").insert({
        preview_path,
        user_id: me.user.id,
        path,
        position: pos++,
        album_id: albumId,
        is_private: isPrivate,
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

  // One-click toggle on a photo: move it between the public main album
  // (album_id = null) and a private album. When making it private, use the album
  // selected as the upload destination if any, else the first private album, else
  // create a "Private Photos" album.
  const movePhotoToPrivacy = async (
    photo: { id: string; album_id: string | null },
    makePrivate: boolean,
  ) => {
    if (!me) return;
    let albumId: string | null = null;
    if (makePrivate) {
      if (uploadAlbum) {
        albumId = uploadAlbum;
      } else {
        const existing = (albums ?? []).find((a) => a.user_id === me.user.id);
        if (existing) {
          albumId = existing.id;
        } else {
          const { data, error } = await supabase
            .from("photo_albums")
            .insert({ user_id: me.user.id, name: "Private Photos", is_private: true })
            .select("id")
            .single();
          if (error || !data) {
            toast.error(error?.message ?? "Could not create a private album");
            return;
          }
          albumId = data.id;
          qc.invalidateQueries({ queryKey: ["photo-albums"] });
          qc.invalidateQueries({ queryKey: ["albums"] });
        }
      }
    }
    const { error } = await supabase
      .from("photos")
      .update({ album_id: albumId })
      .eq("id", photo.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(makePrivate ? "Moved to private album" : "Moved to main (public)");
    refresh();
    qc.invalidateQueries({ queryKey: ["photo-covers"] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">My profile</h1>
        <div className="flex flex-wrap items-center gap-3">
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
          <Button variant="outline" onClick={() => setEditing(false)}>
            <Eye className="mr-2 h-4 w-4" /> View profile
          </Button>
        </div>
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
            <h2 className="text-xl font-semibold">Photos ({photos.length})</h2>
            <p className="text-xs text-muted-foreground">
              {uploadTargetFull
                ? `Limit reached (${uploadTargetCount}/${uploadTargetMax}). Delete a photo to add another.`
                : uploadIsMain
                  ? `Main album: ${uploadTargetCount}/${uploadTargetMax}. Private albums: up to 5 each.`
                  : `Selected album: ${uploadTargetCount}/${uploadTargetMax} photos.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAlbumOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              New album
            </Button>
            <Button
              variant="outline"
              disabled={uploading || uploadTargetFull}
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
              <Button
                size="icon"
                variant={p.album_id ? "secondary" : "default"}
                className="absolute right-2 top-2 h-7 w-7"
                onClick={() => movePhotoToPrivacy(p, !p.album_id)}
                aria-label={p.album_id ? "Make public (move to main)" : "Make private"}
                title={p.album_id ? "Make public" : "Make private"}
              >
                {p.album_id ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              </Button>
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
        <div className="space-y-1.5">
          <Label>Height (cm)</Label>
          <Input
            type="number"
            min={100}
            max={250}
            value={form.height}
            onChange={(e) => set("height")(e.target.value)}
            placeholder="e.g. 170"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Weight (kg)</Label>
          <Input
            type="number"
            min={30}
            max={300}
            value={form.weight}
            onChange={(e) => set("weight")(e.target.value)}
            placeholder="e.g. 65"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Education</Label>
          <Select value={form.education} onValueChange={set("education")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {EDUCATION_LEVELS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Children</Label>
          <Select value={form.children} onValueChange={set("children")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {CHILDREN_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Marital / relationship status</Label>
          <Select value={form.marital_status} onValueChange={set("marital_status")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {MARITAL_STATUS_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Looking for (gender)</Label>
          <Select value={form.looking_for} onValueChange={set("looking_for")}>
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>About me</Label>
          <Textarea
            value={form.bio}
            onChange={(e) => set("bio")(e.target.value)}
            maxLength={500}
            rows={4}
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
