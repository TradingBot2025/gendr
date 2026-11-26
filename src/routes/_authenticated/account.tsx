import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  ShieldCheck,
  FileText,
  LogOut,
  UserCog,
  UserPlus,
  Trash2,
  Pencil,
} from "lucide-react";
import { deleteAccount } from "@/lib/delete-account.functions";
import { verifyFace } from "@/lib/verify.functions";
import { useMe } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NotificationsToggle } from "@/components/app/NotificationsToggle";
import { BlockedContacts } from "@/components/app/BlockedContacts";
import { PasswordCard } from "@/components/app/PasswordCard";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Gender" },
      { name: "description", content: "Manage your account, privacy and delete your account." },

      { property: "og:title", content: "Account — Gender" },
      {
        property: "og:description",
        content: "Manage your account, privacy and delete your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  if (!me) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });

  const del = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount({ data: { password } });
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

      {/* The profile editor lives on its own page; link to it here instead of
          duplicating the whole editor inside the account screen. */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="text-xs text-muted-foreground">
              Edit your name, photos, and dating preferences.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/profile">
              <Pencil className="h-4 w-4" />
              <span className="ml-2">Edit profile</span>
            </Link>
          </Button>
        </div>
      </section>

      {/* Invite friends */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Invite friends</h2>
            <p className="text-xs text-muted-foreground">
              Share Gender with friends and grow your matches.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/referrals">
              <UserPlus className="h-4 w-4" />
              <span className="ml-2">Refer a friend</span>
            </Link>
          </Button>
        </div>
      </section>

      <NotificationsToggle />

      <PasswordCard />

      <BlockedContacts />

      {/* Verification */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {me.profile?.verified ? (
                <>
                  <BadgeCheck className="h-5 w-5 text-primary" /> Verified
                </>
              ) : (
                "Verification"
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {me.profile?.verified
                ? "Your profile is verified."
                : "Verify your face to earn the verified badge."}
            </p>
          </div>
          {!me.profile?.verified && (
            <Button variant="outline" size="sm" onClick={() => setVerifyOpen(true)}>
              <Camera className="h-4 w-4" />
              <span className="ml-2">Get verified</span>
            </Button>
          )}
        </div>
        <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} onDone={refresh} />
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
        <div className="flex flex-wrap gap-3">
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

      {/* Account info — private details (email, name, verification, role) are
          only shown to administrators. Regular users just see sign out. */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium">
            G
          </span>
          <h2 className="text-xl font-semibold">Account</h2>
        </div>
        {me.isAdmin ? (
          <>
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
                <span className="font-medium">Administrator</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <Button asChild variant="secondary" className="w-full">
                <Link to="/admin">
                  <UserCog className="h-4 w-4 mr-2" />
                  Administration
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your personal details are private and only visible to you.
          </p>
        )}
        <div className="mt-4 pt-4 border-t">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
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
