import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, createReferral, type Referral } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, Share, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Refer a friend — Gender" },
      { name: "description", content: "Invite friends to Gender and earn rewards." },
    ],
  }),
  component: Referrals,
});

function Referrals() {
  const { data: me } = useMe();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [autoLink, setAutoLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-generate referral link from username
  useEffect(() => {
    if (me?.profile?.username) {
      const link = `${window.location.origin}/auth?ref=${me.profile.username}`;
      setAutoLink(link);
    }
  }, [me?.profile?.username]);

  const create = async () => {
    if (!code.trim()) return;
    setCreating(true);
    try {
      await createReferral(code.trim());
      toast.success("Referral code created");
      setCode("");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Failed");
    } finally {
      setCreating(false);
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", me!.user.id)
      .order("created_at", { ascending: false });
    setReferrals(data ?? []);
  };

  const share = (c: string) => {
    const url = `${window.location.origin}/auth?ref=${c}`;
    if (navigator.share) {
      navigator.share({ title: "Join Gender", text: "Join me on Gender dating!", url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        toast.success("Link copied");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const shareAutoLink = () => {
    if (!autoLink) return;
    if (navigator.share) {
      navigator.share({ title: "Join Gender", text: "Join me on Gender dating!", url: autoLink });
    } else {
      navigator.clipboard.writeText(autoLink).then(() => {
        toast.success("Referral link copied");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-4xl font-bold">Refer a friend</h1>
        <p className="text-muted-foreground">
          Invite friends to Gender. Share your link to help grow the community.
        </p>
      </div>

      {/* Auto-generated referral link from username */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your referral link</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs text-green-700 font-medium">
            Auto-generated
          </span>
        </div>
        {autoLink ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-muted rounded-xl p-3">
              <span className="font-mono text-sm flex-1 break-all">{autoLink}</span>
              <Button size="icon" variant="ghost" onClick={shareAutoLink} disabled={copied}>
                {copied ? (
                  <Copy className="h-4 w-4 text-green-500" />
                ) : (
                  <Share className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link uses your username. Share it directly - no code needed!
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-muted rounded-xl p-3 text-muted-foreground">
            <span>Complete your profile to get your referral link</span>
          </div>
        )}
      </section>

      {/* Optional: Custom referral codes */}
      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Custom referral codes (optional)</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground font-medium">
            Advanced
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. JOIN2024"
            className="flex-1"
          />
          <Button variant="hero" disabled={creating} onClick={create}>
            {creating ? "Creating…" : "Create code"}
          </Button>
        </div>
        {code && (
          <div className="mt-4 flex items-center gap-2 bg-muted rounded-xl p-3">
            <span className="font-mono text-sm">
              {window.location.origin}/auth?ref={code}
            </span>
            <Button size="icon" variant="ghost" onClick={() => share(code)}>
              <Share className="h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold">Your referrals</h2>
        {referrals.length === 0 ? (
          <p className="text-muted-foreground">No referrals yet. Share your link to start.</p>
        ) : (
          <div className="space-y-3">
            {referrals.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b pb-3 last:border-0"
              >
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
