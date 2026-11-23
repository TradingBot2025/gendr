import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Gender" },
      { name: "description", content: "Choose a new password for your Gender account." },
      { property: "og:title", content: "Reset password — Gender" },
      { property: "og:description", content: "Choose a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/discover" });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={save}
        className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-8 shadow-soft"
      >
        <h1 className="text-2xl font-bold">New password</h1>
        <Input
          type="password"
          minLength={6}
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
        />
        <Button type="submit" variant="hero" className="w-full">
          Save password
        </Button>
      </form>
    </div>
  );
}
