import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Let the signed-in user set or change their password.
 *
 * Important for accounts created with "Continue with Google" (OAuth): those
 * users have no password, so they can't use email/password sign-in and — because
 * account deletion re-authenticates with a password — they can't delete their
 * account either. Setting a password here fixes both: they can then sign in with
 * email + password and delete their account whenever they want.
 */
export function PasswordCard() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        const u = data.user;
        // A user "has a password" if they have an email identity (sign-ups with
        // email/password create an identity with provider "email").
        const identities = (u?.identities ?? []) as Array<{ provider?: string }>;
        const hasPw = identities.some((i) => i.provider === "email");
        setHasPassword(hasPw);
        setEmail(u?.email ?? null);
      })
      .catch(() => alive && setHasPassword(false));
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pw !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success(
        hasPassword ? "Password updated" : "Password set — you can now sign in with email",
      );
      setPw("");
      setConfirm("");
      setHasPassword(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(
        /reauth|recent|sign in again/i.test(message)
          ? "For security, please sign out and sign back in, then try again."
          : (message ?? "Couldn't update password"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">
            {hasPassword ? "Change password" : "Set a password"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {hasPassword
              ? "Update the password you use to sign in."
              : "You signed up with Google. Add a password to also sign in with email and to be able to delete your account."}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{hasPassword ? "New password" : "Password"}</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter the password"
          />
        </div>
        {email && (
          <p className="text-xs text-muted-foreground">
            Sign-in email: <span className="font-medium">{email}</span>
          </p>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
        </Button>
      </form>
    </section>
  );
}
