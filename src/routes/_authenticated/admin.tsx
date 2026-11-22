import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ageOf, useMe, useSigned, type Profile } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Gender" }, { name: "description", content: "Manage members, verification and suspensions." }] }),
  component: Admin,
});

function Admin() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: photos }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("photos").select("user_id,path,position").order("position"),
        supabase.from("connections").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      ]);
      const first: Record<string, string> = {};
      photos?.forEach((p) => { if (!first[p.user_id]) first[p.user_id] = p.path; });
      return { profiles: profiles ?? [], first, matches: count ?? 0 };
    },
  });
  const list = useMemo(() => (data?.profiles ?? []).filter((p) => `${p.display_name} ${p.city} ${p.country} ${p.gender}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const urls = useSigned("photos", list.map((p) => data?.first[p.id]));

  if (!me?.isAdmin) return <div className="p-8 text-center"><p className="text-muted-foreground">Admins only.</p><Button asChild className="mt-4"><Link to="/dashboard">Go to dashboard</Link></Button></div>;

  const setFlags = async (p: Profile, verified: boolean, banned: boolean) => {
    const { error } = await supabase.rpc("admin_set_flags", { _target: p.id, _verified: verified, _banned: banned });
    if (error) toast.error(error.message); else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); }
  };
  const all = data?.profiles ?? [];
  const stats = [
    { l: "Members", v: all.length }, { l: "Verified", v: all.filter((p) => p.verified).length },
    { l: "Suspended", v: all.filter((p) => p.banned).length }, { l: "Matches", v: data?.matches ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-4xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((s) => <div key={s.l} className="rounded-3xl border bg-card p-5 shadow-soft"><div className="text-3xl font-bold">{s.v}</div><div className="text-sm text-muted-foreground">{s.l}</div></div>)}
      </div>
      <Input placeholder="Search by name, city, country, gender" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto rounded-3xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Gender</TableHead><TableHead>Age</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
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
                  <TableCell className="space-x-1">
                    {p.verified && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"><BadgeCheck className="h-3 w-3" />Verified</span>}
                    {p.banned && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">Suspended</span>}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {p.verified && <Button size="sm" variant="outline" onClick={() => setFlags(p, false, p.banned)}>Remove badge</Button>}
                    {!self && <Button size="sm" variant={p.banned ? "secondary" : "destructive"} onClick={() => setFlags(p, p.verified, !p.banned)}>{p.banned ? "Restore" : "Suspend"}</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
