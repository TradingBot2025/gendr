import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Heart, LayoutDashboard, LogOut, Shield, Shuffle, User, Album, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { toast } from "sonner";
import { CallProvider } from "@/lib/calls";
import { CallOverlay } from "@/components/app/CallOverlay";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

function Shell() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  useEffect(() => {
    const ch = supabase
      .channel(`msg-notify-${me?.user.id}`)
      .on("broadcast", { event: "new_message" }, () => {
        setUnread((n) => n + 1);
        setNotifOpen(true);
        toastNewMessage();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me?.user.id]);

  if (isLoading || !me) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  if (me.profile?.banned)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-3xl font-bold">Account suspended</h1>
        <p className="text-muted-foreground">An administrator has suspended this account.</p>
        <Button onClick={signOut}>Sign out</Button>
      </div>
    );

  const nav = [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/discover", label: "Discover", icon: Compass },
    { to: "/connections", label: "Matches", icon: Heart, badge: unread > 0 ? unread : undefined },
    { to: "/random", label: "Random", icon: Shuffle },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/albums", label: "Albums", icon: Album },
    { to: "/referrals", label: "Refer", icon: UsersIcon },
    { to: "/account", label: "Account", icon: Settings },
    ...(me.isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ] as const;

  const gated = !me.complete && !path.startsWith("/profile") && !path.startsWith("/account");
  const inChat = path.startsWith("/chat/");

  return (
    <CallProvider userId={me.user.id} myName={me.profile?.display_name ?? "Someone"}>
      <div className="flex min-h-screen flex-col bg-background md:flex-row">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-5 md:flex">
          <span className="mb-8 font-display text-2xl font-bold text-primary">Gender</span>
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((n) => {
              const active = path === n.to;
              return (
                <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-foreground" }}>
                  <n.icon className="h-4 w-4" />{n.label}{n.badge && <span className="ml-auto inline-flex items-center justify-center min-h-5 w-5 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{n.badge}</span>}
                </Link>
              );
            })}
          </nav>
          <Button variant="ghost" className="justify-start" onClick={signOut}><LogOut />Sign out</Button>
        </aside>
        <main className={`flex-1 ${inChat ? "" : "pb-20 md:pb-0"}`} ref={notifRef}>
          {gated ? (
            <div className="mx-auto mt-24 max-w-md rounded-3xl border bg-card p-8 text-center shadow-soft">
              <h2 className="text-2xl font-bold">Finish your profile</h2>
              <p className="mt-2 text-muted-foreground">Add your name, gender, orientation, birthday, city and at least one photo to start meeting people.</p>
              <Button asChild variant="hero" className="mt-6"><Link to="/profile">Complete profile</Link></Button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        {!inChat && (
          <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t bg-card py-2 md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="flex flex-col items-center gap-0.5 px-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
                <n.icon className="h-5 w-5" />{n.label}
              </Link>
            ))}
          </nav>
        )}
        <CallOverlay />
      </div>
    </CallProvider>
  );
}
