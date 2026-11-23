import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Heart, LogOut, Settings, Shuffle, MessageCircle, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { useNotifications } from "@/lib/notifications";
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

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (isLoading || !me)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );

  if (me.profile?.banned)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-3xl font-bold">Account suspended</h1>
        <p className="text-muted-foreground">An administrator has suspended this account.</p>
        <Button onClick={signOut}>Sign out</Button>
      </div>
    );

  return (
    <CallProvider userId={me.user.id} myName={me.profile?.display_name ?? "Someone"}>
      <ShellInner signOut={signOut} />
    </CallProvider>
  );
}

function ShellInner({ signOut }: { signOut: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount: unread } = useNotifications();
  const { data: me } = useMe();

  // Desktop sidebar nav (full set)
  const desktopNav = [
    { to: "/discover", label: "Discover", icon: Compass },
    { to: "/connections", label: "Matches", icon: Heart },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/random", label: "Random", icon: Shuffle },
    { to: "/account", label: "Account", icon: Settings },
    ...(me?.isAdmin ? ([{ to: "/admin", label: "Admin", icon: UserCog }] as const) : []),
  ] as const;

  // Mobile bottom nav — 5 items per roadmap: Discover, Matches, Messages, Random, Account
  const mobileNav = [
    { to: "/discover", label: "Discover", icon: Compass, badge: 0 },
    { to: "/connections", label: "Matches", icon: Heart, badge: 0 },
    { to: "/messages", label: "Messages", icon: MessageCircle, badge: unread },
    { to: "/random", label: "Random", icon: Shuffle, badge: 0 },
    { to: "/account", label: "Account", icon: Settings, badge: 0 },
  ] as const;

  const inChat = path.startsWith("/chat/");

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-5 md:flex">
        <Link to="/discover" className="mb-8 font-display text-2xl font-bold text-primary">
          Gender
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {desktopNav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
              {n.to === "/messages" && unread > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-h-5 w-5 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <Button variant="ghost" className="justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </aside>

      {/* Main content */}
      <main className={`min-w-0 flex-1 ${inChat ? "" : "pb-20 md:pb-0"}`}>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      {!inChat && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
          {mobileNav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex flex-col items-center gap-0.5 px-3 text-[11px] text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <span className="relative">
                <n.icon className="h-5 w-5" />
                {n.badge > 0 && (
                  <span className="absolute -right-2 -top-1 inline-flex items-center justify-center min-h-4 min-w-4 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">
                    {n.badge > 9 ? "9+" : n.badge}
                  </span>
                )}
              </span>
              {n.label}
            </Link>
          ))}
        </nav>
      )}

      <CallOverlay />
    </div>
  );
}
