import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Compass, Heart, MessageCircle, Shuffle, UserCheck, Users } from "lucide-react";
import cover from "@/assets/dashboard-cover.jpg";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned } from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Gender" },
      { name: "description", content: "Your matches, requests, chats and new people at a glance." },
      { property: "og:title", content: "Dashboard — Gender" },
      { property: "og:description", content: "Your matches, requests, chats and new people at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const { data } = useQuery({
    queryKey: ["dashboard", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [{ data: conns }, { data: people }, { data: photos }] = await Promise.all([
        supabase.from("connections").select("*"),
        supabase.from("profiles").select("*").eq("banned", false).neq("id", uid!).not("gender", "is", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("photos").select("user_id,path,position").order("position"),
      ]);
      const first: Record<string, string> = {};
      photos?.forEach((p) => { if (!first[p.user_id]) first[p.user_id] = p.path; });
      const c = conns ?? [];
      const matches = c.filter((x) => x.status === "accepted");
      const ids = matches.map((m) => (m.requester === uid ? m.addressee : m.requester));
      const { data: mp } = ids.length ? await supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
      return {
        matches: matches.map((m) => {
          const pid = m.requester === uid ? m.addressee : m.requester;
          return { id: m.id, pid, name: mp?.find((p) => p.id === pid)?.display_name ?? "Someone" };
        }),
        incoming: c.filter((x) => x.status === "pending" && x.addressee === uid).length,
        sent: c.filter((x) => x.status === "pending" && x.requester === uid).length,
        people: people ?? [],
        first,
      };
    },
  });
  const urls = useSigned("photos", [...(data?.people.map((p) => data.first[p.id]) ?? []), ...(data?.matches.map((m) => data.first[m.pid]) ?? []), me?.photos[0]?.path]);
  if (!me) return null;
  const p = me.profile;
  const steps = [p?.display_name, p?.gender, p?.orientation, p?.birthdate, p?.city, p?.bio, me.photos.length > 0, p?.verified];
  const pct = Math.round((steps.filter(Boolean).length / steps.length) * 100);
  const myPhoto = me.photos[0]?.path;

  const stats = [
    { label: "Matches", value: data?.matches.length ?? 0, icon: Heart, to: "/connections" as const },
    { label: "Requests for you", value: data?.incoming ?? 0, icon: UserCheck, to: "/connections" as const },
    { label: "Requests sent", value: data?.sent ?? 0, icon: Users, to: "/connections" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <section className="relative overflow-hidden rounded-3xl">
        <img src={cover} alt="Friends laughing together at sunset" width={1600} height={640} className="h-56 w-full object-cover md:h-72" />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-stage/85 via-stage/30 to-transparent p-6 text-stage-foreground md:p-10">
          <div className="flex items-center gap-4">
            {myPhoto && urls[myPhoto] && <img src={urls[myPhoto]} alt="You" className="h-16 w-16 rounded-full border-2 border-stage-foreground object-cover" />}
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold md:text-4xl">Hi, {p?.display_name ?? "there"} {p?.verified && <BadgeCheck className="text-primary-glow" aria-label="Verified" />}</h1>
              <p className="opacity-90">Ready to meet someone new today?</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="rounded-3xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5">
            <s.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 text-3xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
        ))}
        <Link to="/profile" className="rounded-3xl border bg-card p-5 shadow-soft">
          <div className="text-sm text-muted-foreground">Profile strength</div>
          <div className="mt-2 text-3xl font-bold">{pct}%</div>
          <Progress value={pct} className="mt-3" />
          {!p?.verified && <div className="mt-2 text-xs text-primary">Verify your face to earn the badge</div>}
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Button asChild variant="hero" size="lg"><Link to="/discover"><Compass />Discover people</Link></Button>
        <Button asChild variant="secondary" size="lg"><Link to="/random"><Shuffle />Random video</Link></Button>
        <Button asChild variant="outline" size="lg"><Link to="/connections"><Heart />My matches</Link></Button>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Your chats</h2>
        {data?.matches.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {data.matches.map((m) => {
              const ph = data.first[m.pid];
              return (
                <Link key={m.id} to="/chat/$id" params={{ id: m.id }} className="flex w-24 shrink-0 flex-col items-center gap-2 text-center">
                  <div className="relative h-20 w-20 overflow-hidden rounded-full bg-muted">
                    {ph && urls[ph] ? <img src={urls[ph]} alt={m.name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">{m.name[0]}</span>}
                    <MessageCircle className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" />
                  </div>
                  <span className="truncate text-sm">{m.name}</span>
                </Link>
              );
            })}
          </div>
        ) : <p className="text-muted-foreground">No matches yet. Send a few connection requests from Discover.</p>}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">New people</h2>
          <Link to="/discover" className="text-sm text-primary">See all</Link>
        </div>
        {data?.people.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.people.map((pp) => {
              const ph = data.first[pp.id];
              return <ProfileCard key={pp.id} p={pp} photo={ph ? urls[ph] : undefined} action={<Button asChild variant="outline" className="w-full"><Link to="/discover">View in Discover</Link></Button>} />;
            })}
          </div>
        ) : <p className="text-muted-foreground">No one else has joined yet — invite your friends!</p>}
      </section>
    </div>
  );
}
