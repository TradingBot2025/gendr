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
  Clock,
  Plus,
  ShieldCheck,
  FileText,
  LogOut,
} from "lucide-react";
import { deleteAccount } from "@/lib/delete-account.functions";
import {
  useMe,
  useSigned,
  GENDERS,
  ORIENTATIONS,
  usePhotoAlbums,
  type PhotoAlbum,
} from "@/lib/data";
import { verifyFace } from "@/lib/verify.functions";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Gender" },
      { name: "description", content: "Manage your account, privacy and delete your account." },
    ],
  }),
  component: Account,
});

function Account() {
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
  });
  const [saving, setSaving] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      });
  }, [me?.profile]);

  const photos = me?.photos ?? [];
  const { data: albums } = usePhotoAlbums();
  const urls = useSigned(
    "photos",
    photos.map((p) => p.path),
  );
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
      const { error: e2 } = await supabase.from("photos").insert({
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
  };

  const remove = async (id: string, path: string) => {
    await supabase.from("photos").delete().eq("id", id);
    await supabase.storage.from("photos").remove([path]);
    refresh();
  };
  const makeMain = async (id: string) => {
    const order = [photos.find((p) => p.id === id)!, ...photos.filter((p) => p.id !== id)];
    await Promise.all(
      order.map((p, i) => supabase.from("photos").update({ position: i }).eq("id", p.id)),
    );
    refresh();
  };

  const del = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    setDeleting(true);
    try {
      const { error } = await deleteAccount({ data: { password } });
      if (error) throw error;
      toast.success("Account deleted");
      await supabase.auth.signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-4xl font-bold">Account</h1>
        <p className="text-muted-foreground">Manage your Gender account, profile and privacy.</p>
      </div>

      {/* Profile Section (for mobile - profile is inside account) */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft md:hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="text-xs text-muted-foreground">Edit your profile details and photos.</p>
          </div>
        </div>

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
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
          <Button type="submit" variant="hero" disabled={saving} className="sm:col-span-2">
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </form>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Photos ({photos.length}/6)</h3>
          <div className="flex gap-2 mb-3">
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
        </div>

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
                Photos in this album are visible only to your accepted matches.
              </p>
              <Button type="submit" variant="hero" className="w-full">
                Create album
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Privacy & data</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Your chats are end-to-end encrypted and automatically deleted 24 hours after they are
          sent, from both the app and our database. Nothing is visible after 24 hours.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setPolicyOpen(true)} className="flex-1">
            <FileText className="h-4 w-4 mr-2" />
            Privacy policy
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/terms">
              <FileText className="h-4 w-4 mr-2" />
              Terms & conditions
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)} className="flex-1">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete account
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium">
            G
          </span>
          <h2 className="text-xl font-semibold">Account info</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{me.user.email}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{me.profile?.display_name ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Verified</span>
            <span
              className={`font-medium ${me.profile?.verified ? "text-success" : "text-muted-foreground"}`}
            >
              {me.profile?.verified ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{me.isAdmin ? "Administrator" : "User"}</span>
          </div>
        </div>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            This permanently removes your profile, photos, chats and matches. This cannot be undone.
          </p>
          <form onSubmit={del} className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="destructive" disabled={deleting} className="w-full">
              {deleting ? "Deleting…" : "Delete my account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader>
            <DialogTitle>Privacy policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4 text-sm text-muted-foreground">
            <p>
              <strong>1. Information we collect.</strong> Name, email, gender, orientation,
              birthday, location, photos and chat messages you choose to share.
            </p>
            <p>
              <strong>2. End-to-end encryption.</strong> All chats are end-to-end encrypted.
              Messages and media are deleted 24 hours after being sent, from both your device and
              our database.
            </p>
            <p>
              <strong>3. Photos.</strong> Public photos are visible to everyone. Private albums are
              visible only to matches you accept. Disappearing photos (10s / 15s) vanish after the
              timer you set.
            </p>
            <p>
              <strong>4. Face verification.</strong> Your selfie is compared to your profile photos
              solely to issue a verification badge. It is not shared with third parties.
            </p>
            <p>
              <strong>5. Account deletion.</strong> You may delete your account at any time by
              confirming your password. All personal data is erased.
            </p>
            <p>
              <strong>6. Ads.</strong> Advertisements may be shown to logged-in users via
              third-party ad platforms (e.g. Google). Personal data is shared only as described in
              this policy.
            </p>
            <p>
              <strong>7. Minors.</strong> This service is for users 18 and older.
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setPolicyOpen(false)}>
            I understand
          </Button>
        </DialogContent>
      </Dialog>

      {/* Sign out button for mobile */}
      <div className="md:hidden">
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
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
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
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
