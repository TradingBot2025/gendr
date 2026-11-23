import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ageOf,
  GENDERS,
  ORIENTATIONS,
  useMe,
  useSigned,
  logProfileView,
  useProfileViews,
  type Profile,
  type PublicProfile,
} from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Compass,
  Eye,
  Users,
  Clock,
  MapPin,
  Loader2,
  ChevronDown,
  Settings,
  Image,
  Bell,
  Home,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover — Gender" },
      {
        name: "description",
        content:
          "Find people by gender, orientation, age and location. Browse and see who viewed your profile.",
      },
    ],
  }),
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

  // Infinite query for paginated discover
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: [
        "discover",
        gender,
        orientation,
        minAge,
        maxAge,
        place,
        verifiedOnly,
        onlineOnly,
        sortFresh,
      ],
      queryFn: async ({ pageParam = 0 }) => {
        const { data, error } = await supabase.rpc("discover_profiles", {
          _gender: gender,
          _orientation: orientation,
          _min_age: minAge,
          _max_age: maxAge,
          _place: place,
          _verified_only: verifiedOnly,
          _online_only: onlineOnly,
          _sort_fresh: sortFresh,
          _limit: 20,
          _offset: pageParam * 20,
        });
        if (error) throw error;
        return data ?? [];
      },
      getNextPageParam: (lastPage, allPages) => {
        return lastPage.length === 20 ? allPages.length : undefined;
      },
      enabled: !!me,
      initialPageParam: 0,
    });

  // Flatten pages
  const profiles = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Signed URLs for photos
  const photoPaths = profiles.map((p) => p.photo_path).filter(Boolean) as string[];
  const urls = useSigned("photos", photoPaths);

  // My own avatar (top-right of header)
  const myPhotoPath = me?.photos?.[0]?.path;
  const myAvatarUrls = useSigned("photos", [myPhotoPath]);
  const myAvatarUrl = myPhotoPath ? myAvatarUrls[myPhotoPath] : undefined;

  // Viewed profiles tab
  const viewed = useProfileViews();

  // Pending connection requests (incoming) — for the requests menu badge
  const { data: pendingConnections } = useQuery({
    queryKey: ["pending-connections", me?.user.id],
    enabled: !!me,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("connections")
        .select("id, requester, created_at")
        .eq("addressee", me!.user.id)
        .eq("status", "pending");
      return data ?? [];
    },
  });

  // Pending album access requests on my albums — for the requests menu badge
  const { data: pendingAlbumRequests } = useQuery({
    queryKey: ["pending-album-requests", me?.user.id],
    enabled: !!me,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: myAlbums } = await supabase
        .from("photo_albums")
        .select("id")
        .eq("user_id", me!.user.id);
      const ids = (myAlbums ?? []).map((a) => a.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("album_access_requests")
        .select("id, album_id, requester_id, created_at")
        .in("album_id", ids)
        .eq("status", "pending");
      return data ?? [];
    },
  });

  const pendingCount = (pendingConnections?.length ?? 0) + (pendingAlbumRequests?.length ?? 0);

  // Mark online
  const markOnline = async () => {
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", me?.user.id ?? "");
  };
  useEffect(() => {
    markOnline();
    const iv = setInterval(markOnline, 60000);
    return () => clearInterval(iv);
  }, [me]);

  const connect = async (id: string) => {
    await logProfileView(id);
    const { error } = await supabase
      .from("connections")
      .insert({ requester: me?.user.id ?? "", addressee: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request sent — waiting for their response");
    refetch();
    qc.invalidateQueries({ queryKey: ["discover"] });
  };

  const respond = async (cid: string, status: "accepted" | "declined") => {
    const { error } = await supabase.from("connections").update({ status }).eq("id", cid);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetch();
    qc.invalidateQueries({ queryKey: ["discover"] });
  };

  const actionFor = (
    profile: PublicProfile & {
      connection_status: string;
      connection_id: string | null;
      connection_requester: string | null;
    },
  ) => {
    const c =
      profile.connection_status !== "none"
        ? {
            status: profile.connection_status,
            id: profile.connection_id,
            requester: profile.connection_requester,
            addressee: profile.id,
          }
        : null;
    if (!c)
      return (
        <Button variant="hero" className="w-full" onClick={() => connect(profile.id)}>
          Connect
        </Button>
      );
    if (c.status === "accepted")
      return (
        <Button asChild className="w-full">
          <Link to="/chat/$id" params={{ id: c.id }}>
            Chat
          </Link>
        </Button>
      );
    if (c.status === "declined")
      return (
        <Button variant="secondary" disabled className="w-full">
          Not available
        </Button>
      );
    if (c.requester === me?.user.id)
      return (
        <Button variant="secondary" disabled className="w-full">
          Waiting for response…
        </Button>
      );
    return (
      <div className="flex gap-2">
        <Button variant="success" className="flex-1" onClick={() => respond(c.id, "accepted")}>
          Accept
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => respond(c.id, "declined")}>
          Decline
        </Button>
      </div>
    );
  };

  // Load more handler
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (isFetchingNextPage || !hasNextPage) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  // Filter change handlers that reset pagination
  const handleGenderChange = useCallback(
    (v: string) => {
      setGender(v);
      refetch();
    },
    [refetch],
  );
  const handleOrientationChange = useCallback(
    (v: string) => {
      setOrientation(v);
      refetch();
    },
    [refetch],
  );
  const handleMinAgeChange = useCallback(
    (v: number) => {
      setMinAge(v);
      refetch();
    },
    [refetch],
  );
  const handleMaxAgeChange = useCallback(
    (v: number) => {
      setMaxAge(v);
      refetch();
    },
    [refetch],
  );
  const handlePlaceChange = useCallback(
    (v: string) => {
      setPlace(v);
      refetch();
    },
    [refetch],
  );
  const handleVerifiedOnlyChange = useCallback(
    (v: boolean) => {
      setVerifiedOnly(v);
      refetch();
    },
    [refetch],
  );
  const handleOnlineOnlyChange = useCallback(
    (v: boolean) => {
      setOnlineOnly(v);
      refetch();
    },
    [refetch],
  );
  const handleSortFreshChange = useCallback(
    (v: boolean) => {
      setSortFresh(v);
      refetch();
    },
    [refetch],
  );

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      {/* Header: breadcrumb title + menu (Settings, Albums, Requests) + user image */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
          <span className="hidden sm:inline">/</span>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Discover</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden gap-2 sm:flex">
            <Button variant="outline" size="sm" onClick={() => setTab("browse")}>
              <Compass className="h-4 w-4" />
              Browse
            </Button>
            <Button
              variant={tab === "viewed" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setTab("viewed")}
            >
              <Eye className="h-4 w-4" />
              Who viewed me
            </Button>
          </div>

          {/* Menu: Settings, Albums, Requests */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Menu">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Menu</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/discover">
                  <Compass className="mr-2 h-4 w-4" /> Browse
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/albums">
                  <Image className="mr-2 h-4 w-4" /> My albums
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/messages">
                  <Bell className="mr-2 h-4 w-4" /> Requests
                  {pendingCount > 0 && (
                    <span className="ml-auto inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/account">
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User image top-right */}
          <Link
            to="/profile/"
            className="h-10 w-10 overflow-hidden rounded-full border bg-muted"
            aria-label="My profile"
          >
            {myAvatarUrl ? (
              <img src={myAvatarUrl} alt="Me" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center font-semibold">
                {me?.profile?.display_name?.[0] ?? "?"}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile tab switch */}
      <div className="mb-4 flex gap-2 sm:hidden">
        <Button
          variant={tab === "browse" ? "secondary" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => setTab("browse")}
        >
          <Compass className="h-4 w-4" /> Browse
        </Button>
        <Button
          variant={tab === "viewed" ? "secondary" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => setTab("viewed")}
        >
          <Eye className="h-4 w-4" /> Viewed
        </Button>
      </div>

      <div className="mb-8 grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Select value={gender} onValueChange={handleGenderChange}>
          <SelectTrigger>
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any gender</SelectItem>
            {GENDERS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orientation} onValueChange={handleOrientationChange}>
          <SelectTrigger>
            <SelectValue placeholder="Orientation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any orientation</SelectItem>
            {ORIENTATIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 lg:col-span-2">
          <Input
            type="number"
            min={18}
            max={99}
            value={minAge}
            onChange={(e) => handleMinAgeChange(Number(e.target.value) || 18)}
            aria-label="Minimum age"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            min={18}
            max={99}
            value={maxAge}
            onChange={(e) => handleMaxAgeChange(Number(e.target.value) || 99)}
            aria-label="Maximum age"
          />
        </div>
        <Input
          placeholder="City or country"
          value={place}
          onChange={(e) => handlePlaceChange(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlineOnly} onCheckedChange={handleOnlineOnlyChange} />
          <MapPin className="h-4 w-4" />
          Online now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={verifiedOnly} onCheckedChange={handleVerifiedOnlyChange} />
          Verified only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={sortFresh} onCheckedChange={handleSortFreshChange} />
          <Clock className="h-4 w-4" />
          Fresh first
        </label>
      </div>

      {tab === "browse" ? (
        <>
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-3xl border bg-card overflow-hidden animate-pulse">
                  <div className="aspect-[4/5] bg-muted" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 w-3/4 bg-muted" />
                    <div className="h-4 w-1/2 bg-muted" />
                    <div className="h-4 w-1/4 bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <p className="py-20 text-center text-muted-foreground">
              No one matches these filters yet.
            </p>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {profiles.map((p) => {
                  const profileUsername =
                    p.username && p.username.trim() !== "" ? p.username : p.id;
                  return (
                    <ProfileCard
                      key={p.id}
                      p={p}
                      photo={p.photo_path ? urls[p.photo_path] : undefined}
                      action={actionFor(p)}
                      to="/profile/$username"
                      toParams={{ username: profileUsername }}
                    />
                  );
                })}
              </div>
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex justify-center py-4">
                  {isFetchingNextPage ? (
                    <Button variant="outline" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading more…
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => fetchNextPage()}>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div>
          <h2 className="mb-4 text-2xl font-bold">Who viewed your profile</h2>
          {viewed.data?.views.length === 0 ? (
            <p className="py-20 text-center text-muted-foreground">
              No one has viewed your profile yet.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {viewed.data?.views.map(
                (p: {
                  viewer_id: string;
                  username: string | null;
                  photo_path: string | null;
                  connection_status: string;
                  connection_id: string | null;
                  connection_requester: string | null;
                }) => {
                  const profileUsername =
                    p.username && p.username.trim() !== "" ? p.username : p.viewer_id;
                  return (
                    <ProfileCard
                      key={p.viewer_id}
                      p={p}
                      photo={p.photo_path ? urls[p.photo_path] : undefined}
                      to="/profile/$username"
                      toParams={{ username: profileUsername }}
                      action={
                        <div className="flex gap-2">
                          {p.connection_status === "accepted" ? (
                            <Button asChild variant="success" className="flex-1">
                              <Link to="/chat/$id" params={{ id: p.connection_id ?? "" }}>
                                Chat
                              </Link>
                            </Button>
                          ) : p.connection_status === "pending" &&
                            p.connection_requester !== me?.user.id ? (
                            <div className="flex gap-2 w-full">
                              <Button
                                variant="success"
                                className="flex-1"
                                onClick={() => respond(p.connection_id!, "accepted")}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => respond(p.connection_id!, "declined")}
                              >
                                Decline
                              </Button>
                            </div>
                          ) : p.connection_status === "pending" &&
                            p.connection_requester === me?.user.id ? (
                            <Button variant="secondary" disabled className="w-full">
                              Waiting for response…
                            </Button>
                          ) : (
                            <Button
                              variant="hero"
                              className="flex-1"
                              onClick={() => connect(p.viewer_id)}
                            >
                              Connect
                            </Button>
                          )}
                        </div>
                      }
                    />
                  );
                },
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
