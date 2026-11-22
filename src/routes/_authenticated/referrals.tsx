import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { createReferral } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, Share } from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Refer a friend — Gender" }, { name: "description", content: "Invite friends to Gender and earn rewards." }] }),
  component: Referrals,
});

function Referrals() {
  const { data: me } = useMe();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [referrals, setReferrals] = useState<any[]>([]);

  const create = async () => {
    if (!code.trim()) return;
    setCreating(true);
    try {
      await createReferral(code.trim());
      toast.success("Referral code created");
      setCode("");
      load();
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
    finally { setCreating(false); }
  };

  const load = async () => {
    const { data } = await supabase.from("referrals").select("*").eq("referrer_id", me!.user.id).order("created_at", { ascending: false });
    setReferrals(data ?? []);
  };

  const share = (c: string) => {
    navigator.share ? navigator.share({ title: "Join Gender", text: "Join me on Gender dating!", url: window.location.origin + "/auth?ref=" + c }) : navigator.clipboard.writeText(window.location.origin + "/auth?ref=" + c).then(() => toast.success("Link copied"));
  };

  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-4xl font-bold">Refer a friend</h1>
        <p className="text-muted-foreground">Invite friends to Gender. When they join with your code, you both get a bonus.</p>
      </div>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your referral code</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground font-medium">Kinder-style</span>
        </div>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. JOIN2024" className="flex-1" />
          <Button variant="hero" disabled={creating} onClick={create}>{creating ? "Creating…" : "Create code"}</Button>
        </div>
        {code && (
          <div className="mt-4 flex items-center gap-2 bg-muted rounded-xl p-3">
            <span className="font-mono text-sm">{window.location.origin}/auth?ref={code}</span>
            <Button size="icon" variant="ghost" onClick={() => share(code)}><Share className="h-4 w-4" /></Button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold">Your referrals</h2>
        {referrals.length === 0 ? (
          <p className="text-muted-foreground">No referrals yet. Share your code to start.</p>
        ) : (
          <div className="space-y-3">
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <span className="font-medium">{r.code}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.status}</span>
                </div>
                <span className="text-sm">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
