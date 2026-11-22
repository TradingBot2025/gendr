import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ageOf, GENDERS, ORIENTATIONS, useMe, useSigned, logProfileView, useProfileViews, type Profile } from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Compass, Eye, Users, Clock, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — Gender" }, { name: "description", content: "Find people by gender, orientation, age and location. Browse and see who viewed your profile." }] }),
  component: Discover,
});

function Discover() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [gender, setGender] = useState("any");
  const [orientation, setOrientation] = useState("any");
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(99);
  const [place, setPlace] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sortFresh, setSortFresh] = useState(true);
  const [tab, setTab] = useState<"browse" | "viewed">("browse");

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data } = useQuery({
    queryKey: ["discover"],
    queryFn: async () => {
      const [{ data: profiles }, { data: photos }, { data: conns }] = await Promise.all([
        supabase.from("profiles").select("*").eq("banned", false).neq("id", me!.user.id).not("gender", "is", null).limit(2000),
        supabase.from("photos").select("user_id,path,position,is_private,album_id,view_timer").order("position"),
        supabase.from("connections").select("*"),
      ]);
      const firstPhoto: Record<string, string> = {};
      photos?.forEach((p) => { if (!firstPhoto[p.user_id]) firstPhoto[p.user_id] = p.path; });
      return { profiles: profiles ?? [], firstPhoto, conns: conns ?? [] };
    },
    enabled: !!me,
  });

  const viewed = useProfileViews();

  const list = useMemo(() => {
    const q = place.trim().toLowerCase();
    let arr = (data?.profiles ?? []).filter((p) => {
      const age = ageOf(p.birthdate);
      if (gender !== "any" && p.gender !== gender) return false;
      if (orientation !== "any" && p.orientation !== orientation) return false;
      if (age !== null && (age < minAge || age > maxAge)) return false;
      if (verifiedOnly && !p.verified) return false;
      if (onlineOnly && (!p.last_seen_at || new Date(p.last_seen_at) < new Date(fifteenMinAgo))) return false;
      if (q && !`${p.city ?? ""} ${p.country ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortFresh) arr = [...arr].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return arr;
  }, [data, gender, orientation, minAge, maxAge, place, verifiedOnly, onlineOnly, sortFresh, fifteenMinAgo]);

  const urls = useSigned("photos", list.map((p) => data?.firstPhoto[p.id]));

  useEffect(() => {
    const ch = supabase.channel("presence").on("presence", { event: "sync" }, () => {}).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const markOnline = async () => {
    await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me!.user.id);
  };
  useEffect(() => { markOnline(); const iv = setInterval(markOnline, 60000); return () => clearInterval(iv); }, [me]);

  const connect = async (id: string) => {
    await logProfileView(id);
    const { error } = await supabase.from("connections").insert({ requester: me!.user.id, addressee: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Request sent — waiting for their response");
    qc.invalidateQueries({ queryKey: ["discover"] });
  };
  const respond = async (cid: string, status: "accepted" | "declined") => {
    await supabase.from("connections").update({ status }).eq("id", cid);
    qc.invalidateQueries({ queryKey: ["discover"] });
  };

  const actionFor = (pid: string) => {
    const c = data?.conns.find((c) => c.requester === pid || c.addressee === pid);
    if (!c) return <Button variant="hero" className="w-full" onClick={() => connect(pid)}>Connect</Button>;
    if (c.status === "accepted") return <Button asChild className="w-full"><Link to="/chat/$id" params={{ id: c.id }}>Chat</Link></Button>;
    if (c.status === "declined") return <Button variant="secondary" disabled className="w-full">Not available</Button>;
    if (c.requester === me?.user.id) return <Button variant="secondary" disabled className="w-full">Waiting for response…</Button>;
    return (
      <div className="flex gap-2">
        <Button variant="success" className="flex-1" onClick={() => respond(c.id, "accepted")}>Accept</Button>
        <Button variant="outline" className="flex-1" onClick={() => respond(c.id, "declined")}>Decline</Button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Discover</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTab("browse")}><Compass className="h-4 w-4" />Browse</Button>
          <Button variant={tab === "viewed" ? "secondary" : "outline"} size="sm" onClick={() => setTab("viewed")}><Eye className="h-4 w-4" />Who viewed me</Button>
        </div>
      </div>

      <div className="mb-8 grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any gender</SelectItem>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={orientation} onValueChange={setOrientation}>
          <SelectTrigger><SelectValue placeholder="Orientation" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any orientation</SelectItem>{ORIENTATIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-2 lg:col-span-2">
          <Input type="number" min={18} max={99} value={minAge} onChange={(e) => setMinAge(Number(e.target.value) || 18)} aria-label="Minimum age" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" min={18} max={99} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value) || 99)} aria-label="Maximum age" />
        </div>
        <Input placeholder="City or country" value={place} onChange={(e) => setPlace(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={onlineOnly} onCheckedChange={setOnlineOnly} /><MapPin className="h-4 w-4" />Online now</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />Verified only</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={sortFresh} onCheckedChange={setSortFresh} /><Clock className="h-4 w-4" />Fresh first</label>
      </div>

      {tab === "browse" ? (
        list.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground">No one matches these filters yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const path = data?.firstPhoto[p.id];
              return <ProfileCard key={p.id} p={p} photo={path ? urls[path] : undefined} action={actionFor(p.id)} />;
            })}
          </div>
        )
      ) : (
        <div>
          <h2 className="mb-4 text-2xl font-bold">Who viewed your profile</h2>
          {viewed.data?.views.length === 0 ? (
            <p className="py-20 text-center text-muted-foreground">No one has viewed your profile yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {viewed.data.views.map((v) => {
                const p = data?.profiles.find((x) => x.id === v.viewer_id);
                if (!p) return null;
                const path = data?.firstPhoto[p.id];
                const existing = data?.conns.find((c) => (c.requester === p.id || c.addressee === p.id));
                const already = existing?.status === "accepted";
                const connId = existing?.id;
                return (
                  <div key={v.id} className="overflow-hidden rounded-3xl border bg-card shadow-soft">
                    <div className="relative aspect-[4/5] bg-muted">
                      {path && urls[path] ? <img src={urls[path]} alt={p.display_name ?? ""} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">{p.display_name?.[0]}</div>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
                        <div className="flex items-center gap-1.5 text-xl font-semibold">{p.display_name}{ageOf(p.birthdate) !== null && <span className="font-normal">, {ageOf(p.birthdate)}</span>}</div>
                        <div className="flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" />{[p.city, p.country].filter(Boolean).join(", ")}</div>
                      </div>
                      <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded"><Clock className="h-3 w-3" /><span>{new Date(v.created_at).toLocaleDateString()}</span></div>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {p.gender && <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{p.gender}</span>}
                        {p.orientation && <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">{p.orientation}</span>}
                      </div>
                      {p.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
                      <div className="flex gap-2">
                        {already ? <Button asChild variant="success" className="flex-1"><Link to={`/chat/${connId}`}>Chat</Link></Button> : <Button variant="hero" className="flex-1" onClick={() => connect(p.id)}>Connect</Button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
