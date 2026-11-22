import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ageOf, useMe, useSigned, type Profile, adminRecordAction, adminSetFlags, reportProfile, useReports, useAdminActions } from "@/lib/data";
import { deleteAccount } from "@/lib/delete-account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Gender" }, { name: "description", content: "Manage members, reports, suspensions and verification." }] }),
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
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; status: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: photos }, { data: conns }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("photos").select("user_id,path,position").order("position"),
        supabase.from("connections").select("*").order("created_at", { ascending: false }),
        supabase.from("connections").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      ]);
      const first: Record<string, string> = {};
      photos?.forEach((p) => { if (!first[p.user_id]) first[p.user_id] = p.path; });
      return { profiles: profiles ?? [], conns: conns ?? [], first, matches: count ?? 0 };
    },
  });
  const reports = useReports();
  const actions = useAdminActions();
  const list = useMemo(() => (data?.profiles ?? []).filter((p) => `${p.display_name} ${p.city} ${p.country} ${p.gender}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const urls = useSigned("photos", list.map((p) => data?.first[p.id]));
  const declined = (data?.conns ?? []).filter((c) => c.status === "declined");
  const pending = (data?.conns ?? []).filter((c) => c.status === "pending");

  if (!me?.isAdmin) return <div className="p-8 text-center"><p className="text-muted-foreground">Admins only.</p><Button asChild className="mt-4"><Link to="/dashboard">Go to dashboard</Link></Button></div>;

  const setFlags = async (p: Profile, verified: boolean, banned: boolean) => {
    await adminSetFlags(p.id, verified, banned);
    await adminRecordAction(p.id, banned ? "ban" : "unban", `verified=${verified}`);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      const { error } = await deleteAccount({ data: { password: delPwd, target_id: delTarget.id } });
      if (error) throw error;
      await adminRecordAction(delTarget.id, "delete", `deleted by admin ${me.user.id}`);
      toast.success("Account deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) { toast.error(err.message ?? "Delete failed"); }
    finally { setDelOpen(false); setDelPwd(""); }
  };

  const resetConnection = async () => {
    if (!resetTarget) return;
    try {
      const { error } = await supabase.from("connections").update({ status: "pending" }).eq("id", resetTarget.id);
      if (error) throw error;
      await adminRecordAction(resetTarget.id, "unban", `reset declined connection`);
      toast.success("Connection reset — user can send a new request");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) { toast.error(err.message ?? "Reset failed"); }
    finally { setResetOpen(false); setResetTarget(null); }
  };

  const all = data?.profiles ?? [];
  const stats = [
    { l: "Members", v: all.length }, { l: "Verified", v: all.filter((p) => p.verified).length },
    { l: "Suspended", v: all.filter((p) => p.banned).length }, { l: "Reports", v: reports.data?.filter((r) => r.status === "open").length ?? 0 },
    { l: "Declined requests", v: declined.length }, { l: "Matches", v: data?.matches ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-4xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-5">
        {stats.map((s) => <div key={s.l} className="rounded-3xl border bg-card p-5 shadow-soft"><div className="text-3xl font-bold">{s.v}</div><div className="text-sm text-muted-foreground">{s.l}</div></div>)}
      </div>

      <Tabs defaultValue={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="connections">Connections ({declined.length} declined)</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="actions">Admin actions</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Input placeholder="Search by name, city, country, gender" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" />
          <div className="overflow-x-auto rounded-3xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Gender</TableHead><TableHead>Age</TableHead><TableHead>Location</TableHead><TableHead>Last seen</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {list.map((p) => {
                  const ph = data?.first[p.id];
                  const self = p.id === me.user.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">{ph && urls[ph] ? <img src={urls[ph]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center">{p.display_name?.[0]}</span>}</div>
                          <span className="font-medium">{p.display_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{p.gender ?? "—"}</TableCell>
                      <TableCell>{ageOf(p.birthdate) ?? "—"}</TableCell>
                      <TableCell>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">{p.last_seen_at ? new Date(p.last_seen_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="space-x-1">
                        {p.verified && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"><BadgeCheck className="h-3 w-3" />Verified</span>}
                        {p.banned && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">Suspended</span>}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {p.verified && <Button size="sm" variant="outline" onClick={() => setFlags(p, false, p.banned)}>Remove badge</Button>}
                        {!self && <Button size="sm" variant={p.banned ? "secondary" : "destructive"} onClick={() => setFlags(p, p.verified, !p.banned)}>{p.banned ? "Restore" : "Suspend"}</Button>}
                        {!self && <Button size="sm" variant="destructive" onClick={() => { setDelTarget({ id: p.id, name: p.display_name ?? "user" }); setDelOpen(true); }}>Delete</Button>}
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
            <p className="text-sm text-muted-foreground">Reset declined connections so the users can send a new request.</p>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex gap-2"><span className="text-xs font-medium text-muted-foreground">Pending:</span> <span className="font-medium">{pending.length}</span></div>
            <div className="flex gap-2"><span className="text-xs font-medium text-muted-foreground">Declined:</span> <span className="font-medium text-destructive">{declined.length}</span></div>
          </div>
          {declined.length === 0 ? (
            <p className="text-muted-foreground">No declined connections.</p>
          ) : (
            <div className="overflow-x-auto rounded-3xl border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {declined.map((c) => {
                    const fromProf = all.find((p) => p.id === c.requester);
                    const toProf = all.find((p) => p.id === c.addressee);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{fromProf?.display_name ?? "—"}</TableCell>
                        <TableCell>{toProf?.display_name ?? "—"}</TableCell>
                        <TableCell><span className="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive">{c.status}</span></TableCell>
                        <TableCell className="text-xs">{new Date(c.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setResetTarget({ id: c.id, name: fromProf?.display_name ?? "user", status: c.status }); setResetOpen(true); }}>Reset</Button>
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
            <h2 className="text-xl font-semibold">Profile reports</h2>
            <p className="text-sm text-muted-foreground">Review reported profiles and take action.</p>
          </div>
          {reports.data?.length === 0 ? (
            <p className="text-muted-foreground">No reports yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-3xl border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>Reporter</TableHead><TableHead>Reported</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {reports.data?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{(r as any).reporter?.display_name ?? "—"}</TableCell>
                      <TableCell>{(r as any).reported?.display_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{r.reason}</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded text-xs ${r.status === "open" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>{r.status}</span></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="destructive" onClick={() => setFlags({ id: r.reported_id, display_name: (r as any).reported?.display_name ?? "user", gender: "", orientation: "", birthdate: "", city: "", country: "", bio: "", banned: false, verified: false, created_at: "" } as Profile, false, true)}>Ban profile</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <TableHeader><TableRow><TableHead>Admin</TableHead><TableHead>Target</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {actions.data?.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{(a as any).admin?.display_name ?? "—"}</TableCell>
                      <TableCell>{(a as any).target?.display_name ?? "—"}</TableCell>
                      <TableCell>{a.action_type}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.details ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
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
            <AlertDialogDescription>This permanently deletes the member's account. Enter your admin password to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form onSubmit={handleDelete} className="space-y-2">
              <div className="space-y-1.5"><Label>Admin password</Label><Input type="password" value={delPwd} onChange={(e) => setDelPwd(e.value)} required /></div>
              <AlertDialogAction variant="destructive" type="submit" disabled={!delPwd}>Delete account</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset declined connection</AlertDialogTitle>
            <AlertDialogDescription>Reset the declined request from {resetTarget?.name} so they can send a new connection request.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" type="submit" onClick={resetConnection}>Reset connection</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
