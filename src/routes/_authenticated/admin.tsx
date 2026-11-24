import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ageOf,
  useMe,
  useSigned,
  type Profile,
  adminRecordAction,
  adminSetFlags,
  reportProfile,
  useReports,
  useAdminActions,
} from "@/lib/data";
import { deleteAccount } from "@/lib/delete-account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam / advertising",
  fraud: "Scam / fraud",
  money_request: "Money request",
  fake_profile: "Fake profile",
  harassment: "Harassment",
  inappropriate_content: "Inappropriate content",
  underage: "Underage user",
  other: "Other",
};

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Gender" },
      { name: "description", content: "Manage members, reports, suspensions and verification." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"members" | "reports" | "actions" | "connections">("members");
  const [delOpen, setDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);
  const [delPwd, setDelPwd] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: photos }, { data: conns }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("photos").select("user_id,path,position").order("position"),
        supabase.from("connections").select("*").order("created_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted"),
      ]);
      const first: Record<string, string> = {};
      photos?.forEach((p) => {
        if (!first[p.user_id]) first[p.user_id] = p.path;
      });
      return { profiles: profiles ?? [], conns: conns ?? [], first, matches: count ?? 0 };
    },
  });
  const reports = useReports();
  const actions = useAdminActions();
  const list = useMemo(
    () =>
      (data?.profiles ?? []).filter((p) =>
        `${p.display_name} ${p.city} ${p.country} ${p.gender}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [data, q],
  );
  const urls = useSigned(
    "photos",
    list.map((p) => data?.first[p.id]),
  );
  // Sign any report proof images so admins can view them. (Declared with the
  // other hooks, before the admin-only early return, to satisfy hook order.)
  const reportProofs = useSigned(
    "report-proofs",
    (reports.data ?? []).map(
      (r) => (r as { proof_file_path?: string | null }).proof_file_path ?? undefined,
    ),
  );
  const declined = (data?.conns ?? []).filter((c) => c.status === "declined");
  const pending = (data?.conns ?? []).filter((c) => c.status === "pending");

  if (!me?.isAdmin)
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Admins only.</p>
        <Button asChild className="mt-4">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );

  const setFlags = async (
    p: Pick<Profile, "id" | "display_name">,
    verified: boolean,
    banned: boolean,
  ) => {
    await adminSetFlags(p.id, verified, banned);
    await adminRecordAction(p.id, banned ? "ban" : "unban", `verified=${verified}`);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const setReportStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("reports")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: me?.user.id,
      } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "reviewed" ? "Marked as reviewed" : "Reopened");
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };

  const deleteReport = async (id: string) => {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Report deleted");
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await deleteAccount({ data: { password: delPwd, target_id: delTarget.id } });
      await adminRecordAction(delTarget.id, "delete", `deleted by admin ${me.user.id}`);
      toast.success("Account deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Delete failed");
    } finally {
      setDelOpen(false);
      setDelPwd("");
    }
  };

  const resetConnection = async () => {
    if (!resetTarget) return;
    try {
      const { error } = await supabase
        .from("connections")
        .update({ status: "pending" })
        .eq("id", resetTarget.id);
      if (error) throw error;
      await adminRecordAction(resetTarget.id, "unban", `reset declined connection`);
      toast.success("Connection reset — user can send a new request");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Reset failed");
    } finally {
      setResetOpen(false);
      setResetTarget(null);
    }
  };

  const all = data?.profiles ?? [];
  const stats = [
    { l: "Members", v: all.length },
    { l: "Verified", v: all.filter((p) => p.verified).length },
    { l: "Suspended", v: all.filter((p) => p.banned).length },
    { l: "Reports", v: reports.data?.filter((r) => r.status === "open").length ?? 0 },
    { l: "Declined requests", v: declined.length },
    { l: "Matches", v: data?.matches ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-4xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.l} className="rounded-3xl border bg-card p-5 shadow-soft">
            <div className="text-3xl font-bold">{s.v}</div>
            <div className="text-sm text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>

      <Tabs
        defaultValue={tab}
        onValueChange={(v) => {
          if (v === "members" || v === "reports" || v === "actions" || v === "connections")
            setTab(v);
        }}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="connections">Connections ({declined.length} declined)</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="actions">Admin actions</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Input
            placeholder="Search by name, city, country, gender"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4"
          />
          <div className="overflow-x-auto rounded-3xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const ph = data?.first[p.id];
                  const self = p.id === me.user.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
                            {ph && urls[ph] ? (
                              <img src={urls[ph]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full items-center justify-center">
                                {p.display_name?.[0]}
                              </span>
                            )}
                          </div>
                          <span className="font-medium">{p.display_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{p.gender ?? "—"}</TableCell>
                      <TableCell>{ageOf(p.birthdate) ?? "—"}</TableCell>
                      <TableCell>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.last_seen_at ? new Date(p.last_seen_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {p.verified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                            <BadgeCheck className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                        {p.banned && (
                          <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                            Suspended
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {p.verified && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFlags(p, false, p.banned)}
                          >
                            Remove badge
                          </Button>
                        )}
                        {!self && (
                          <Button
                            size="sm"
                            variant={p.banned ? "secondary" : "destructive"}
                            onClick={() => setFlags(p, p.verified, !p.banned)}
                          >
                            {p.banned ? "Restore" : "Suspend"}
                          </Button>
                        )}
                        {!self && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setDelTarget({ id: p.id, name: p.display_name ?? "user" });
                              setDelOpen(true);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="connections">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Connection requests</h2>
            <p className="text-sm text-muted-foreground">
              Reset declined connections so the users can send a new request.
            </p>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex gap-2">
              <span className="text-xs font-medium text-muted-foreground">Pending:</span>{" "}
              <span className="font-medium">{pending.length}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-xs font-medium text-muted-foreground">Declined:</span>{" "}
              <span className="font-medium text-destructive">{declined.length}</span>
            </div>
          </div>
          {declined.length === 0 ? (
            <p className="text-muted-foreground">No declined connections.</p>
          ) : (
            <div className="overflow-x-auto rounded-3xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {declined.map((c) => {
                    const fromProf = all.find((p) => p.id === c.requester);
                    const toProf = all.find((p) => p.id === c.addressee);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{fromProf?.display_name ?? "—"}</TableCell>
                        <TableCell>{toProf?.display_name ?? "—"}</TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive">
                            {c.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(c.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResetTarget({
                                id: c.id,
                                name: fromProf?.display_name ?? "user",
                                status: c.status,
                              });
                              setResetOpen(true);
                            }}
                          >
                            Reset
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Profile reports</h2>
              <p className="text-sm text-muted-foreground">
                Full details for each report so you can take the right action.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reports.refetch()}
              disabled={reports.isFetching}
            >
              {reports.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {reports.isLoading ? (
            <p className="text-muted-foreground">Loading reports…</p>
          ) : reports.isError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Couldn't load reports.</p>
              <p className="mt-1 text-muted-foreground">
                {(reports.error as Error | null)?.message ?? "Unknown error"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void reports.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : reports.data?.length === 0 ? (
            <p className="text-muted-foreground">No reports yet.</p>
          ) : (
            <div className="space-y-4">
              {reports.data?.map((r) => {
                const rep = r as {
                  id: string;
                  reporter_id: string;
                  reported_id: string;
                  reason: string;
                  reason_category: string | null;
                  proof_text: string | null;
                  proof_file_path: string | null;
                  auto_blocked: boolean;
                  status: string;
                  created_at: string;
                  reviewed_at: string | null;
                  reporter?: { display_name?: string; username?: string };
                  reported?: { display_name?: string; username?: string };
                };
                const reporterName = rep.reporter?.display_name ?? "Unknown";
                const reportedName = rep.reported?.display_name ?? "user";
                const proofUrl = rep.proof_file_path
                  ? reportProofs[rep.proof_file_path]
                  : undefined;
                const reportedProfile = (data?.profiles ?? []).find(
                  (p) => p.id === rep.reported_id,
                ) as Pick<Profile, "id" | "display_name"> | undefined;
                return (
                  <div key={rep.id} className="rounded-3xl border bg-card p-4 shadow-soft">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-semibold">{reporterName}</span>
                        <span className="text-muted-foreground"> reported </span>
                        <Link
                          to="/profile/$username"
                          params={{
                            username: rep.reported?.username ?? rep.reported_id,
                          }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {reportedName}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        {rep.auto_blocked && (
                          <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                            auto-blocked
                          </span>
                        )}
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${rep.status === "open" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}
                        >
                          {rep.status}
                        </span>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Category
                        </dt>
                        <dd className="font-medium">
                          {rep.reason_category
                            ? (REASON_LABELS[rep.reason_category] ?? rep.reason_category)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Reported
                        </dt>
                        <dd className="text-xs text-muted-foreground">
                          {new Date(rep.created_at).toLocaleString()}
                          {rep.reviewed_at &&
                            ` · reviewed ${new Date(rep.reviewed_at).toLocaleString()}`}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Details
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">{rep.reason || "—"}</dd>
                      </div>
                      {rep.proof_text && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Reporter's note
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">{rep.proof_text}</dd>
                        </div>
                      )}
                    </dl>

                    {proofUrl && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                          Proof attachment
                        </p>
                        <img
                          src={proofUrl}
                          alt="Report proof"
                          className="max-h-64 rounded-xl border object-contain"
                        />
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          reportedProfile ? setFlags(reportedProfile, false, true) : void 0
                        }
                      >
                        Ban profile
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reportedProfile ? setFlags(reportedProfile, false, false) : void 0
                        }
                      >
                        Unban
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setReportStatus(rep.id, rep.status === "open" ? "reviewed" : "open")
                        }
                      >
                        {rep.status === "open" ? "Mark reviewed" : "Reopen"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteReport(rep.id)}>
                        Delete report
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="actions">
          <h2 className="mb-4 text-xl font-semibold">Admin action log</h2>
          {actions.data?.length === 0 ? (
            <p className="text-muted-foreground">No admin actions logged.</p>
          ) : (
            <div className="overflow-x-auto rounded-3xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.data?.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {(
                          a as {
                            admin?: { display_name?: string };
                            target?: { display_name?: string };
                          }
                        ).admin?.display_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {(
                          a as {
                            admin?: { display_name?: string };
                            target?: { display_name?: string };
                          }
                        ).target?.display_name ?? "—"}
                      </TableCell>
                      <TableCell>{a.action_type}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.details ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(a.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {delTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the member's account. Enter your admin password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="space-y-2"
            >
              <div className="space-y-1.5">
                <Label>Admin password</Label>
                <Input
                  type="password"
                  value={delPwd}
                  onChange={(e) => setDelPwd(e.target.value)}
                  required
                />
              </div>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground"
                type="submit"
                disabled={!delPwd}
              >
                Delete account
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset declined connection</AlertDialogTitle>
            <AlertDialogDescription>
              Reset the declined request from {resetTarget?.name} so they can send a new connection
              request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              type="submit"
              onClick={resetConnection}
            >
              Reset connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
