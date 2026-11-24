import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unblockUser, useBlockedContacts } from "@/lib/data";

/**
 * Settings section listing everyone the current user has blocked, with a
 * one-click Unblock. Blocked users can't contact you. Requires the
 * public.blocked_users table (see MIGRATIONS TO APPLY).
 */
export function BlockedContacts() {
  const qc = useQueryClient();
  const { data: blocked = [], isLoading } = useBlockedContacts();

  const unblock = async (id: string) => {
    try {
      await unblockUser(id);
      toast.success("User unblocked");
      void qc.invalidateQueries({ queryKey: ["blocked-contacts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unblock. Please try again.");
    }
  };

  return (
    <section className="rounded-3xl border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <ShieldOff className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Blocked contacts</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You haven't blocked anyone. People you block can't message or call you.
        </p>
      ) : (
        <ul className="space-y-3">
          {blocked.map((b) => (
            <li
              key={b.blocked_id}
              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
            >
              <Link
                to="/profile/$username"
                params={{ username: b.profile?.username ?? b.blocked_id }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                  {b.profile?.display_name?.[0] ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.profile?.display_name ?? "User"}</p>
                  {b.profile?.username && (
                    <p className="truncate text-xs text-muted-foreground">@{b.profile.username}</p>
                  )}
                </div>
              </Link>
              <Button variant="outline" size="sm" onClick={() => unblock(b.blocked_id)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
