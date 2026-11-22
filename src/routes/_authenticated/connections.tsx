import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, type Profile } from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Matches — Gender" }, { name: "description", content: "Your matches and connection requests." }] }),
  component: Connections,
});

function Connections() {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["connections", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: conns } = await supabase.from("connections").select("*").order("created_at", { ascending: false });
      const ids = (conns ?? []).map((c) => (c.requester === uid ? c.addressee : c.requester));
      const [{ data: profiles }, { data: photos }] = ids.length
        ? await Promise.all([supabase.from("profiles").select("id,username,display_name,gender,orientation,birthdate,city,country,bio,verified,last_seen_at").in("id", ids), supabase.from("photos").select("user_id,path,position").in("user_id", ids).order("position")])
        : [{ data: [] as Profile[] }, { data: [] as { user_id: string; path: string }[] }];
      const first: Record<string, string> = {};
      photos?.forEach((p) => { if (!first[p.user_id]) first[p.user_id] = p.path; });
      return (conns ?? []).flatMap((c) => {
        const pid = c.requester === uid ? c.addressee : c.requester;
        const p = profiles?.find((x) => x.id === pid);
        return p ? [{ c, p, photo: first[pid] }] : [];
      });
    },
  });
  const urls = useSigned("photos", (data ?? []).map((d) => d.photo));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["connections"] }); qc.invalidateQueries({ queryKey: ["discover"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const respond = async (id: string, status: "accepted" | "declined") => {
    const { error } = await supabase.from("connections").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(status === "accepted" ? "It's a match!" : "Request declined"); refresh(); }
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("connections").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  const all = data ?? [];
  const groups = {
    matches: all.filter((d) => d.c.status === "accepted"),
    incoming: all.filter((d) => d.c.status === "pending" && d.c.addressee === uid),
    sent: all.filter((d) => d.c.status === "pending" && d.c.requester === uid),
  };
  const grid = (items: typeof all, action: (d: (typeof all)[number]) => ReactNode, empty: string) =>
    items.length ? (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((d) => {
          const profileUsername = d.p.username && d.p.username.trim() !== "" ? d.p.username : d.p.id;
          return <ProfileCard key={d.c.id} p={d.p} photo={d.photo ? urls[d.photo] : undefined} action={action(d)} to="/profile/$username" toParams={{ username: profileUsername }} />;
        })}
      </div>
    ) : <p className="py-16 text-center text-muted-foreground">{empty}</p>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-6 text-4xl font-bold">Matches</h1>
      <Tabs defaultValue="matches">
        <TabsList className="mb-6">
          <TabsTrigger value="matches">Matches ({groups.matches.length})</TabsTrigger>
          <TabsTrigger value="incoming">Received ({groups.incoming.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({groups.sent.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="matches">{grid(groups.matches, (d) => (
          <div className="flex gap-2">
            <Button asChild className="flex-1"><Link to="/chat/$id" params={{ id: d.c.id }}>Chat</Link></Button>
            <Button variant="outline" onClick={() => remove(d.c.id)}>Unmatch</Button>
          </div>
        ), "No matches yet.")}</TabsContent>
        <TabsContent value="incoming">{grid(groups.incoming, (d) => (
          <div className="flex gap-2">
            <Button variant="success" className="flex-1" onClick={() => respond(d.c.id, "accepted")}>Accept</Button>
            <Button variant="outline" className="flex-1" onClick={() => respond(d.c.id, "declined")}>Decline</Button>
          </div>
        ), "No new requests.")}</TabsContent>
        <TabsContent value="sent">{grid(groups.sent, (d) => (
          <div className="flex gap-2">
            <Button variant="secondary" disabled className="flex-1">Waiting for response…</Button>
            <Button variant="outline" onClick={() => remove(d.c.id)}>Cancel</Button>
          </div>
        ), "You haven't sent any requests.")}</TabsContent>
      </Tabs>
    </div>
  );
}
