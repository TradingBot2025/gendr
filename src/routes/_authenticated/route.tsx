import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Compass,
  Heart,
  LogOut,
  Settings,
  Shuffle,
  MessageCircle,
  UserCog,
  Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned } from "@/lib/data";
import { useNotifications } from "@/lib/notifications";
import { CallProvider } from "@/lib/calls";
import { CallOverlay } from "@/components/app/CallOverlay";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSession() (reads the persisted session from storage) instead of
    // getUser() (a blocking network call to Supabase on every open). getUser()
    // could transiently fail on mobile with a slow/dropped connection at launch
    // and bounce a still-logged-in user to /auth — which looked like an
    // unexpected logout. A stored session is trusted here; supabase-js refreshes
    // the token in the background and server routes re-validate as needed.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
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
  const myPhotoPath = me?.photos?.[0]?.path;
  const avatarUrls = useSigned("photos", [myPhotoPath]);
  const avatarUrl = myPhotoPath ? avatarUrls[myPhotoPath] : undefined;

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
  const inProfile = path.startsWith("/profile/");
  const inDiscover = path.startsWith("/discover");

  // Page title for header
  const pageTitle = inDiscover
    ? "Discover"
    : path.startsWith("/connections")
      ? "Matches"
      : path.startsWith("/messages")
        ? "Messages"
        : path.startsWith("/random")
          ? "Random"
          : path.startsWith("/account")
            ? "Account"
            : path.startsWith("/admin")
              ? "Admin"
              : path.startsWith("/profile")
                ? "Profile"
                : path.startsWith("/chat")
                  ? "Chat"
                  : path.startsWith("/albums")
                    ? "Albums"
                    : "Gender";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top header — shared on every authenticated page (except chat which has its own) */}
      {!inChat && (
        <header
          className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/discover" className="flex items-center gap-2">
              <img src="/LOGO.webp" alt="Gender logo" className="h-8 w-auto" />
              <span className="hidden text-sm text-muted-foreground sm:inline">/ {pageTitle}</span>
            </Link>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    aria-label="Account menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <span className="flex items-center gap-2">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Me"
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {me?.profile?.display_name?.[0] ?? "?"}
                          </span>
                        )}
                        My profile
                      </span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <Settings className="mr-2 h-4 w-4" /> Account & settings
                    </Link>
                  </DropdownMenuItem>
                  {me?.isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <UserCog className="mr-2 h-4 w-4" /> Admin
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link
                to="/profile"
                className="h-9 w-9 overflow-hidden rounded-full border bg-muted"
                aria-label="My profile"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Me" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center font-semibold">
                    {me?.profile?.display_name?.[0] ?? "?"}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r bg-sidebar p-5 md:flex">
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
        </aside>

        {/* Main content */}
        <main className={`min-w-0 flex-1 ${inChat ? "" : "pb-20 md:pb-0"}`}>
          <Outlet />
        </main>
      </div>

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

      {/* Footer — Privacy / Terms / Conditions + Edit */}
      <footer className="mt-auto border-t bg-card p-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4 text-sm">
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="hover:underline hover:text-foreground transition-colors"
          >
            Terms & Conditions
          </a>
          <span className="h-3 w-px bg-border mx-2" />
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="hover:underline hover:text-foreground transition-colors"
          >
            Privacy Policy
          </a>
          <span className="h-3 w-px bg-border mx-2" />
          <Button variant="ghost" size="sm" className="px-2">
            Edit profile
          </Button>
        </div>
        <p className="mt-1 text-[10px] opacity-60">
          Gender — Dating for every identity. All profiles are AI face-verified.
        </p>
      </footer>
    </div>
  );
}
