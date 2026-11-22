import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Camera, ImagePlus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GENDERS, ORIENTATIONS, useMe, useSigned } from "@/lib/data";
import { verifyFace } from "@/lib/verify.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Gender" }, { name: "description", content: "Edit your details, photos and verification." }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({ display_name: "", gender: "", orientation: "", birthdate: "", city: "", country: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = me?.profile;
    if (p) setForm({ display_name: p.display_name ?? "", gender: p.gender ?? "", orientation: p.orientation ?? "", birthdate: p.birthdate ?? "", city: p.city ?? "", country: p.country ?? "", bio: p.bio ?? "" });
  }, [me?.profile]);

  const photos = me?.photos ?? [];
  const urls = useSigned("photos", photos.map((p) => p.path));
  if (!me) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (form.birthdate) {
      const b = new Date(form.birthdate); const min = new Date(); min.setFullYear(min.getFullYear() - 18);
      if (b > min) { toast.error("You must be at least 18"); return; }
    }
    if (form.display_name.trim().length < 2) { toast.error("Please enter your name"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: form.display_name.trim().slice(0, 60), gender: form.gender || null, orientation: form.orientation || null,
      birthdate: form.birthdate || null, city: form.city.trim().slice(0, 80) || null, country: form.country.trim().slice(0, 80) || null, bio: form.bio.trim().slice(0, 500) || null,
    }).eq("id", me.user.id);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Profile saved"); refresh(); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 6 - photos.length;
    if (room <= 0) { toast.error("Maximum 6 photos"); return; }
    setUploading(true);
    let pos = photos.length;
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith("image/")) { toast.error(`${f.name} is not an image`); continue; }
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} is over 8MB`); continue; }
      const path = `${me.user.id}/${crypto.randomUUID()}.${f.name.split(".").pop() ?? "jpg"}`;
      const { error } = await supabase.storage.from("photos").upload(path, f, { contentType: f.type });
      if (error) { toast.error(error.message); continue; }
      const { error: e2 } = await supabase.from("photos").insert({ user_id: me.user.id, path, position: pos++ });
      if (e2) { toast.error(e2.message); await supabase.storage.from("photos").remove([path]); }
    }
    setUploading(false);
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
    await Promise.all(order.map((p, i) => supabase.from("photos").update({ position: i }).eq("id", p.id)));
    refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">My profile</h1>
        {me.profile?.verified ? (
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-foreground"><BadgeCheck className="h-4 w-4 text-primary" />Verified</span>
        ) : (
          <Button variant="hero" onClick={() => setVerifyOpen(true)} disabled={!photos.length}><Camera />Verify my face</Button>
        )}
      </div>
      {!me.complete && <p className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">Fill in your name, gender, orientation, birthday, city and add at least one photo to unlock the app.</p>}

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Photos ({photos.length}/6)</h2>
          <Button variant="outline" disabled={uploading || photos.length >= 6} onClick={() => fileRef.current?.click()}><ImagePlus />{uploading ? "Uploading…" : "Add photos"}</Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
              {urls[p.path] && <img src={urls[p.path]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />}
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">Main</span>}
              <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
                {i > 0 && <Button size="icon" variant="secondary" onClick={() => makeMain(p.id)} aria-label="Make main photo"><Star /></Button>}
                <Button size="icon" variant="destructive" onClick={() => remove(p.id, p.path)} aria-label="Delete photo"><Trash2 /></Button>
              </div>
            </div>
          ))}
          {!photos.length && <p className="col-span-full py-8 text-center text-muted-foreground">No photos yet.</p>}
        </div>
      </section>

      <form onSubmit={save} className="grid gap-4 rounded-3xl border bg-card p-6 shadow-soft sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.display_name} onChange={(e) => set("display_name")(e.target.value)} maxLength={60} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input value={me.user.email ?? ""} disabled /></div>
        <div className="space-y-1.5"><Label>Gender</Label>
          <Select value={form.gender} onValueChange={set("gender")}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>Orientation</Label>
          <Select value={form.orientation} onValueChange={set("orientation")}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{ORIENTATIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>Birthday</Label><Input type="date" value={form.birthdate} onChange={(e) => set("birthdate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => set("city")(e.target.value)} maxLength={80} /></div>
        <div className="space-y-1.5"><Label>Country</Label><Input value={form.country} onChange={(e) => set("country")(e.target.value)} maxLength={80} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>About me</Label><Textarea value={form.bio} onChange={(e) => set("bio")(e.target.value)} maxLength={500} rows={4} /></div>
        <Button type="submit" variant="hero" disabled={saving} className="sm:col-span-2">{saving ? "Saving…" : "Save profile"}</Button>
      </form>

      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} onDone={refresh} />
    </div>
  );
}

function VerifyDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
      .then((s) => { stream.current = s; if (video.current) video.current.srcObject = s; })
      .catch(() => toast.error("Camera access is needed for verification"));
    return () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [open]);
  const capture = async () => {
    const v = video.current; if (!v?.videoWidth) return;
    const c = document.createElement("canvas"); c.width = 640; c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    setBusy(true);
    try {
      const r = await verifyFace({ data: { selfie: c.toDataURL("image/jpeg", 0.85) } });
      if (r.verified) { toast.success("You're verified!"); onDone(); onOpenChange(false); }
      else toast.error(r.reason || "Could not verify, try again in better light");
    } catch { toast.error("Verification failed, try again"); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Face verification</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Look at the camera. We compare this selfie with your profile photos.</p>
        <video ref={video} autoPlay playsInline muted className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover" />
        <Button variant="hero" onClick={capture} disabled={busy}>{busy ? "Checking…" : "Take selfie & verify"}</Button>
      </DialogContent>
    </Dialog>
  );
}
