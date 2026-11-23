import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteAccount } from "@/lib/delete-account.functions";
import { useMe } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, FileText, ShieldCheck, User, Album, Users, Shield, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account — Gender" }, { name: "description", content: "Manage your account, privacy and delete your account." }] }),
  component: Account,
});

function Account() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: "/auth", replace: true }); };
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const del = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { toast.error("Please enter your password"); return; }
    setDeleting(true);
    try {
      await deleteAccount({ data: { password } });
      toast.success("Account deleted");
      await signOut();
    } catch (err: any) {
      toast.error(err.message ?? "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-4xl font-bold">Account</h1>
        <p className="text-muted-foreground">Manage your Gender account and privacy.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline" className="justify-start"><Link to="/profile"><User />Edit profile</Link></Button>
        <Button asChild variant="outline" className="justify-start"><Link to="/albums"><Album />Private albums & access</Link></Button>
        <Button asChild variant="outline" className="justify-start"><Link to="/referrals"><Users />Invite friends</Link></Button>
        {me.isAdmin && <Button asChild variant="outline" className="justify-start"><Link to="/admin"><Shield />Administration</Link></Button>}
        <Button variant="outline" className="justify-start" onClick={signOut}><LogOut />Sign out</Button>
      </div>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Privacy & data</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Your chats are restricted to accepted matches and hidden when their expiry time is reached.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setPolicyOpen(true)} className="flex-1"><FileText className="h-4 w-4 mr-2" />Privacy policy</Button>
          <Button asChild variant="outline" className="flex-1"><Link to="/terms"><FileText className="h-4 w-4 mr-2" />Terms &amp; conditions</Link></Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)} className="flex-1"><Trash2 className="h-4 w-4 mr-2" />Delete account</Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium">G</span>
          <h2 className="text-xl font-semibold">Account info</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Email</span><span className="font-medium">{me.user.email}</span></div>
          <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Name</span><span className="font-medium">{me.profile?.display_name ?? "—"}</span></div>
          <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Verified</span><span className={`font-medium ${me.profile?.verified ? "text-success" : "text-muted-foreground"}`}>{me.profile?.verified ? "Yes" : "No"}</span></div>
          <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Role</span><span className="font-medium">{me.isAdmin ? "Administrator" : "User"}</span></div>
        </div>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete your account</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">This permanently removes your profile, photos, chats and matches. This cannot be undone.</p>
          <form onSubmit={del} className="space-y-3 p-4">
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button type="submit" variant="destructive" disabled={deleting} className="w-full">{deleting ? "Deleting…" : "Delete my account"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader><DialogTitle>Privacy policy</DialogTitle></DialogHeader>
          <div className="space-y-3 p-4 text-sm text-muted-foreground">
            <p><strong>1. Information we collect.</strong> Name, email, gender, orientation, birthday, location, photos and chat messages you choose to share.</p>
            <p><strong>2. Chat privacy.</strong> Only accepted matches can read your chats. Messages are hidden after their expiry time.</p>
            <p><strong>3. Photos.</strong> Public photos are visible to everyone. Private album originals require your separate approval for each viewer. Disappearing photos (10s / 15s) vanish after the timer you set.</p>
            <p><strong>4. Face verification.</strong> Your selfie is compared to your profile photos solely to issue a verification badge. It is not shared with third parties.</p>
            <p><strong>5. Account deletion.</strong> You may delete your account at any time by confirming your password. All personal data is erased.</p>
            <p><strong>6. Ads.</strong> Advertisements may be shown to logged-in users via third-party ad platforms (e.g. Google). Personal data is shared only as described in this policy.</p>
            <p><strong>7. Minors.</strong> This service is for users 18 and older.</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setPolicyOpen(false)}>I understand</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
