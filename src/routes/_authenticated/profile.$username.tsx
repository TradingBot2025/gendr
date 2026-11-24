import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Flag,
  MapPin,
  MessageCircle,
  User,
  X,
  Check,
  Loader2,
  Image,
  FileText,
  Lock,
  Eye,
  EyeOff,
  Send,
  UserPlus,
  MoreHorizontal,
  Phone,
  Video,
  UserX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, logProfileView, reportProfile } from "@/lib/data";
import { notifyUser } from "@/lib/push-notify";
import { useCall } from "@/lib/calls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PhotoViewer } from "@/components/app/PhotoViewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/profile/$username")({
  head: () => ({
    meta: [{ title: "Profile — Gender" }, { name: "description", content: "View user profile." }],
  }),
  component: ProfileView,
});

const REPORT_REASONS = [
  {
    value: "spam",
    label: "Spam",
    description: "Unwanted messages, promotional content, or repetitive messaging",
  },
  {
    value: "fraud",
    label: "Fraud/Scam",
    description: "Attempting to deceive for money, personal info, or financial gain",
  },
  {
    value: "money_request",
    label: "Asking for Money",
    description: "Directly or indirectly requesting money, gifts, or financial help",
  },
  {
    value: "fake_profile",
    label: "Fake Profile",
    description: "Using stolen photos, false identity, or misleading information",
  },
  {
    value: "harassment",
    label: "Harassment",
    description: "Threats, abusive language, stalking, or unwanted persistent contact",
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate Content",
    description: "Explicit, offensive, or prohibited content in photos/bio",
  },
  { value: "underage", label: "Underage User", description: "Appears to be under 18 years old" },
  { value: "other", label: "Other", description: "Something not listed here" },
];

// Base public profile columns from the public_profiles view (readable by all
// authenticated users). Uses age directly (not birthdate) since the view exposes age.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ProfileView() {
  const { username } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const call = useCall();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportProof, setReportProof] = useState<File | null>(null);
  const [reportProofPreview, setReportProofPreview] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockAfterReport, setBlockAfterReport] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<Array<{
    id: string;
    path: string;
    album_id: string | null;
    is_private?: boolean;
    view_timer?: string;
  }> | null>(null);
  const [moveAlbumId, setMoveAlbumId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const movePhotoId = useRef<string | null>(null);
  const [albumRequests, setAlbumRequests] = useState<
    Record<string, { status: string; id: string }>
  >({});
  const [tab, setTab] = useState<"info" | "photos">("info");

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ["profile-view", username],
    enabled: !!uid,
    queryFn: async () => {
      if (!uid) return null;
      // Read other members from the public_profiles view (readable by all authenticated users).
      // The route param may be a username or, as a fallback for legacy profiles without a
      // username, the user's id (UUID).
      // Try the extended column set first; if the view doesn't expose those columns yet
      // (migration not applied to the view), fall back to the base columns.
      const fetchBy = async (column: "username" | "id", value: string) => {
        const { data, error } = await supabase.from("public_profiles").select("*").eq(column, value).maybeSingle();
        if (error) throw error;
        return data?.id ? { ...data, id: data.id } : null;
      };
      const p = await fetchBy(UUID_RE.test(username) ? "id" : "username", username);

      if (!p) return null;

      // Determine the relationship between me and this profile.
      const { data: conns } = await supabase
        .from("connections")
        .select("*")
        .or(
          `and(requester.eq.${uid},addressee.eq.${p.id}),and(requester.eq.${p.id},addressee.eq.${uid})`,
        );
      const conn = conns?.[0];
      const isConnected = conn?.status === "accepted";

      // Whether this member has enabled voice / video calling. Read from the
      // profiles table (the public_profiles view doesn't expose these columns).
      const { data: callRows } = await supabase.rpc("get_call_settings", { _user_id: p.id });
      const callFlags = { voice: !!callRows?.[0]?.voice_call_enabled, video: !!callRows?.[0]?.video_call_enabled };

      const { data: allPhotos } = await supabase
        .from("photos")
        .select("*")
        .eq("user_id", p.id)
        .order("position");

      const { data: allAlbums } = await supabase
        .from("photo_albums")
        .select("*")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false });

      // Fetch my album access requests (for this user's albums) so the UI reflects
      // pending/approved state on load, not just after clicking in this session.
      const { data: accessRequests } = await supabase
        .from("album_access_requests")
        .select("album_id, status, id")
        .eq("requester_id", uid);

      const requestsMap: Record<string, { status: string; id: string }> = {};
      accessRequests?.forEach((r) => {
        requestsMap[r.album_id] = { status: r.status, id: r.id };
      });

      const photosByAlbum: Record<string, typeof allPhotos> = {};
      (allPhotos ?? []).forEach((ph) => {
        const k = ph.album_id ?? "none";
        if (!photosByAlbum[k]) photosByAlbum[k] = [];
        photosByAlbum[k]?.push(ph);
      });

      const albumsWithPhotos = (allAlbums ?? []).map((a) => ({
        ...a,
        photos: photosByAlbum[a.id] ?? [],
      }));

      const visiblePhotos = isConnected
        ? (allPhotos ?? [])
        : (allPhotos ?? []).filter((ph) => !ph.is_private);
      const mainPhotos = visiblePhotos.filter((ph) => !ph.album_id);

      return {
        profile: p,
        allPhotos: allPhotos ?? [],
        visiblePhotos,
        mainPhotos,
        albums: albumsWithPhotos,
        connections: conns ?? [],
        albumRequests: requestsMap,
        isConnected,
        callFlags,
      };
    },
  });

  useEffect(() => {
    if (profile?.profile && profile.profile.id !== uid) {
      logProfileView(profile.profile.id).catch(() => {});
    }
  }, [profile, username, uid]);

  // Sync album-access request state from the query so approved/pending shows on load.
  useEffect(() => {
    if (profile?.albumRequests) setAlbumRequests(profile.albumRequests);
  }, [profile]);

  // If someone opens their own /profile/<self>, send them to the editor.
  useEffect(() => {
    if (profile?.profile && profile.profile.id === uid) {
      void navigate({ to: "/profile" });
    }
  }, [profile, uid, navigate]);

  const conn = profile?.connections.find(
    (c: { requester: string; addressee: string; status: string }) =>
      (c.requester === uid && c.addressee === profile.profile?.id) ||
      (c.requester === profile.profile?.id && c.addressee === uid),
  );
  const isConnected = profile?.isConnected ?? conn?.status === "accepted";
  const isPending = conn?.status === "pending";
  const isOwnRequest = conn?.requester === uid;

  const mainPhotos = profile?.mainPhotos ?? [];
  const visiblePhotos = profile?.visiblePhotos ?? [];
  const allPhotos = profile?.allPhotos ?? [];
  const albums = profile?.albums ?? [];
  // Only albums that actually contain photos are shown.
  const albumsWithPhotos = albums.filter(
    (a: { photos?: unknown[] }) => (a.photos?.length ?? 0) > 0,
  );

  const hasMainPhotos = mainPhotos.length > 0;
  const allVisiblePrivate =
    visiblePhotos.length > 0 &&
    visiblePhotos.every((ph: { is_private: boolean }) => ph.is_private === true);
  const showMainBlur = !isConnected && allVisiblePrivate && profile?.profile?.id !== uid;

  const privateAlbumWithPhotos = albums.find(
    (a) => a.is_private && a.photos.length > 0,
  );
  const fallbackMainPhoto = privateAlbumWithPhotos?.photos?.[0];
  const showFallbackBlur =
    !isConnected && !hasMainPhotos && fallbackMainPhoto && profile?.profile?.id !== uid;

  // Photos we are allowed to render: visible (public, or all when connected) main photos,
  // plus album photos the viewer may open (approved private albums only — even connected
  // users must request and be approved), plus the blurred fallback.
  const viewableAlbumPhotos = albums
    .filter(
      (a: { id: string; is_private: boolean }) =>
        !a.is_private || albumRequests[a.id]?.status === "approved",
    )
    .flatMap((a: { photos?: { path: string }[] }) => (a.photos ?? []).map((ph) => ph.path));

  const photoPaths = [
    ...visiblePhotos.map((ph: { path: string }) => ph.path),
    ...viewableAlbumPhotos,
    ...(fallbackMainPhoto ? [fallbackMainPhoto.path] : []),
  ];
  const urls = useSigned("photos", photoPaths);

  // Blurred previews live in the "photo-previews" bucket keyed by preview_path, NOT path.
  const previewPaths = (allPhotos ?? [])
    .map((ph: { preview_path?: string | null }) => ph.preview_path)
    .filter((v): v is string => !!v);
  const previewUrls = useSigned("photo-previews", previewPaths);

  const p = profile?.profile;

  if (!me || !uid || profileLoading)
    return <div className="flex h-screen items-center justify-center">Loading…</div>;
  if (profileError)
    return <div className="p-8 text-center text-muted-foreground">Failed to load profile.</div>;
  if (!p) return <div className="p-8 text-center text-muted-foreground">Profile not found.</div>;
  if (p.id === uid)
    return <div className="flex h-screen items-center justify-center">Redirecting…</div>;

  const handleReport = async () => {
    if (!reportReason) {
      toast.error("Please select a reason");
      return;
    }
    if (blockAfterReport && !reportDescription.trim()) {
      toast.error("Please provide details/proof for the report");
      return;
    }
    setReporting(true);
    try {
      await reportProfile(p.id, reportDescription.trim(), {
        reasonCategory: reportReason,
        proofText: reportDescription.trim(),
        
        autoBlock: blockAfterReport,
      });

      toast.success("Report submitted" + (blockAfterReport ? " and user blocked" : ""));
      setReportOpen(false);
      setReportReason("");
      setReportDescription("");
      setReportProof(null);
      setReportProofPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["profile-view", username] });
      qc.invalidateQueries({ queryKey: ["discover"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Failed to submit report");
    } finally {
      setReporting(false);
    }
  };

  const handleRequestAlbumAccess = async (albumId: string) => {
    const { error } = await supabase
      .from("album_access_requests")
      .insert({ album_id: albumId, requester_id: uid });
    if (error) {
      // 23505 = unique_violation: a request row already exists for this album.
      // Declines are now deleted, so this mainly guards against stale legacy rows.
      toast.error(
        error.code === "23505" ? "You already have a request for this album." : error.message,
      );
      return;
    }
    setAlbumRequests((prev) => ({ ...prev, [albumId]: { status: "pending", id: "" } }));
    toast.success("Access request sent");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    void notifyUser(p.id, {
      title: me?.profile?.display_name ?? "Someone",
      body: "requested access to your private album",
      url: "/albums",
      tag: "album-request",
    });
  };

  const handleMoveToAlbum = async (photoId: string, albumId: string | null) => {
    const { error } = await supabase.from("photos").update({ album_id: albumId }).eq("id", photoId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(albumId ? "Moved to album" : "Removed from album");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Delete this photo permanently?")) return;
    const { error } = await supabase.from("photos").delete().eq("id", photoId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Photo deleted");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleSetTimer = async (photoId: string, timer: "normal" | "10s" | "15s") => {
    const { error } = await supabase.from("photos").update({ view_timer: timer }).eq("id", photoId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`View timer set to ${timer}`);
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Proof file must be under 5MB");
      return;
    }
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("text/") &&
      file.type !== "application/pdf"
    ) {
      toast.error("Proof must be an image, text file, or PDF");
      return;
    }
    setReportProof(file);
    if (file.type.startsWith("image/")) {
      setReportProofPreview(URL.createObjectURL(file));
    } else {
      setReportProofPreview(file.name);
    }
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "info" | "photos")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 space-y-6">
            {/* Photo carousel */}
            <div className="overflow-hidden rounded-3xl border bg-card shadow-soft">
              <div className="relative aspect-[4/5] max-h-[520px] bg-muted">
                {/* Options dropdown overlay */}
                <div className="absolute right-3 top-3 z-20">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                        aria-label="More options"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => setReportOpen(true)}>
                        <Flag className="h-4 w-4 mr-2 text-destructive" /> Report
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setReportReason("harassment");
                          setBlockAfterReport(true);
                          setReportOpen(true);
                        }}
                      >
                        <UserX className="h-4 w-4 mr-2 text-destructive" /> Block
                      </DropdownMenuItem>
                      {!conn && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              supabase
                                .from("connections")
                                .insert({ requester: uid, addressee: p.id })
                                .then(({ error }) => {
                                  if (error) {
                                    toast.error(error.message);
                                    return;
                                  }
                                  toast.success("Connection request sent");
                                  qc.invalidateQueries({ queryKey: ["discover"] });
                                  qc.invalidateQueries({ queryKey: ["profile-view", username] });
                                })
                            }
                          >
                            <UserPlus className="h-4 w-4 mr-2" /> Connect
                          </DropdownMenuItem>
                        </>
                      )}
                      {isPending && isOwnRequest && (
                        <DropdownMenuItem
                          onClick={() =>
                            supabase
                              .from("connections")
                              .delete()
                              .eq("id", conn!.id)
                              .then(() => {
                                toast.success("Request cancelled");
                                qc.invalidateQueries({ queryKey: ["profile-view", username] });
                                qc.invalidateQueries({ queryKey: ["discover"] });
                              })
                          }
                        >
                          <X className="h-4 w-4 mr-2 text-muted-foreground" /> Cancel request
                        </DropdownMenuItem>
                      )}
                      {isPending && !isOwnRequest && (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              supabase
                                .from("connections")
                                .update({ status: "accepted" })
                                .eq("id", conn!.id)
                                .then(() => {
                                  toast.success("Connected!");
                                  qc.invalidateQueries({ queryKey: ["profile-view", username] });
                                })
                            }
                          >
                            <Check className="h-4 w-4 mr-2 text-green-500" /> Accept
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              supabase
                                .from("connections")
                                .update({ status: "declined" })
                                .eq("id", conn!.id)
                                .then(() =>
                                  qc.invalidateQueries({ queryKey: ["profile-view", username] }),
                                )
                            }
                          >
                            <X className="h-4 w-4 mr-2 text-red-500" /> Decline
                          </DropdownMenuItem>
                        </>
                      )}
                      {isConnected && (
                        <DropdownMenuItem asChild>
                          <Link to="/chat/$id" params={{ id: conn!.id }}>
                            <MessageCircle className="h-4 w-4 mr-2" /> Chat
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Carousel image */}
                {hasMainPhotos && mainPhotos[carouselIndex] ? (
                  urls[mainPhotos[carouselIndex].path] ? (
                    <button
                      type="button"
                      className="h-full w-full"
                      onClick={() => {
                        setViewerPhotos(null);
                        setPhotoViewerIndex(carouselIndex);
                        setPhotoViewerOpen(true);
                      }}
                      aria-label="View photo"
                    >
                      <img
                        src={urls[mainPhotos[carouselIndex].path]}
                        alt={p.display_name}
                        className={`h-full w-full object-cover ${showMainBlur ? "blur-[16px]" : ""}`}
                        loading="eager"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">
                      {p.display_name?.[0]}
                    </div>
                  )
                ) : showFallbackBlur && fallbackMainPhoto ? (
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => handleRequestAlbumAccess(privateAlbumWithPhotos!.id)}
                  >
                    {fallbackMainPhoto.preview_path &&
                    previewUrls[fallbackMainPhoto.preview_path] ? (
                      <img
                        src={previewUrls[fallbackMainPhoto.preview_path]}
                        alt=""
                        className="h-full w-full object-cover blur-[16px]"
                      />
                    ) : null}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 p-4 text-center">
                      <Lock className="mb-3 h-12 w-12 text-white/90" />
                      <p className="text-lg font-semibold text-white">Private Photos</p>
                      <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
                        <UserPlus className="h-4 w-4" /> Request Access
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <img
                      src="/profile-placeholder.svg"
                      alt="No photo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}

                {/* Blur overlay for private main photos (connected-but-unapproved) */}
                {showMainBlur && hasMainPhotos && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 p-4 text-center">
                    <Lock className="mb-3 h-12 w-12 text-white/90" />
                    <p className="text-lg font-semibold text-white">Private Photos</p>
                    <button
                      type="button"
                      onClick={() => handleRequestAlbumAccess(privateAlbumWithPhotos!.id)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
                    >
                      <UserPlus className="h-4 w-4" /> Request Access
                    </button>
                  </div>
                )}

                {/* Dots */}
                {hasMainPhotos && mainPhotos.length > 1 && !showMainBlur && (
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                    {mainPhotos.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCarouselIndex(i)}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${i === carouselIndex ? "bg-white" : "bg-white/50"}`}
                        aria-label={`Go to photo ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className="p-6 space-y-4 rounded-3xl border bg-card shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="flex items-center gap-2 text-3xl font-bold">
                    {p.display_name}
                    {p.age !== null && p.age !== undefined && (
                      <span className="text-2xl font-normal text-muted-foreground">, {p.age}</span>
                    )}
                    {p.verified && <BadgeCheck className="h-6 w-6 text-primary" />}
                  </h1>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs items-center">
                    {p.gender && (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                        {p.gender}
                      </span>
                    )}
                    {p.orientation && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                        {p.orientation}
                      </span>
                    )}
                    {p.is_online && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />{" "}
                        Online
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {p.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.city}
                    {p.country && `, ${p.country}`}
                  </span>
                )}
                {p.country && !p.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.country}
                  </span>
                )}
                {!p.is_online && p.last_seen_at && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    Last seen{" "}
                    {new Date(p.last_seen_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>

              {p.bio && <p className="text-muted-foreground">{p.bio}</p>}

              {/* Extended details */}
              {(p.height ||
                p.weight ||
                p.education ||
                p.children ||
                p.marital_status ||
                p.looking_for) && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/40 p-4 text-sm sm:grid-cols-3">
                  {p.height && (
                    <div>
                      <div className="text-xs text-muted-foreground">Height</div>
                      <div className="font-medium">{p.height} cm</div>
                    </div>
                  )}
                  {p.weight && (
                    <div>
                      <div className="text-xs text-muted-foreground">Weight</div>
                      <div className="font-medium">{p.weight} kg</div>
                    </div>
                  )}
                  {p.education && (
                    <div>
                      <div className="text-xs text-muted-foreground">Education</div>
                      <div className="font-medium">{p.education}</div>
                    </div>
                  )}
                  {p.children && (
                    <div>
                      <div className="text-xs text-muted-foreground">Children</div>
                      <div className="font-medium">{p.children}</div>
                    </div>
                  )}
                  {p.marital_status && (
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="font-medium">{p.marital_status}</div>
                    </div>
                  )}
                  {p.looking_for && (
                    <div>
                      <div className="text-xs text-muted-foreground">Looking for</div>
                      <div className="font-medium">{p.looking_for}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap gap-3">
                  {isConnected ? (
                    <>
                      <Button asChild variant="hero" className="flex-1 min-w-[140px]">
                        <Link to="/chat/$id" params={{ id: conn!.id }}>
                          <MessageCircle className="h-4 w-4 mr-2" /> Chat
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 w-11 shrink-0 rounded-full"
                        onClick={() => call.start(p.id, p.display_name ?? "Someone", false)}
                        aria-label="Voice call"
                        disabled={!profile.callFlags.voice}
                        title={profile.callFlags.voice ? "Voice call" : "Voice calls are off"}
                      >
                        <Phone className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 w-11 shrink-0 rounded-full"
                        onClick={() => call.start(p.id, p.display_name ?? "Someone", true)}
                        aria-label="Video call"
                        disabled={!profile.callFlags.video}
                        title={profile.callFlags.video ? "Video call" : "Video calls are off"}
                      >
                        <Video className="h-5 w-5" />
                      </Button>
                    </>
                  ) : isPending ? (
                    isOwnRequest ? (
                      <Button variant="secondary" disabled className="flex-1 min-w-[140px]">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting for response…
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="success"
                          className="flex-1 min-w-[120px]"
                          onClick={() =>
                            supabase
                              .from("connections")
                              .update({ status: "accepted" })
                              .eq("id", conn!.id)
                              .then(() => {
                                toast.success("Connected!");
                                qc.invalidateQueries({ queryKey: ["profile-view", username] });
                              })
                          }
                        >
                          <Check className="h-4 w-4 mr-2" /> Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 min-w-[120px]"
                          onClick={() =>
                            supabase
                              .from("connections")
                              .update({ status: "declined" })
                              .eq("id", conn!.id)
                              .then(() => {
                                qc.invalidateQueries({ queryKey: ["profile-view", username] });
                              })
                          }
                        >
                          <X className="h-4 w-4 mr-2" /> Decline
                        </Button>
                      </div>
                    )
                  ) : (
                    <Button
                      variant="hero"
                      className="flex-1 min-w-[140px]"
                      onClick={() =>
                        supabase
                          .from("connections")
                          .insert({ requester: uid, addressee: p.id })
                          .then(() => {
                            toast.success("Connection request sent");
                            qc.invalidateQueries({ queryKey: ["profile-view", username] });
                            qc.invalidateQueries({ queryKey: ["discover"] });
                          })
                      }
                    >
                      <User className="h-4 w-4 mr-2" /> Connect
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    className="flex-1 min-w-[120px]"
                    onClick={() => setReportOpen(true)}
                  >
                    <Flag className="h-4 w-4 mr-2 text-destructive" /> Report
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-w-[120px]"
                    onClick={() => {
                      setReportReason("harassment");
                      setBlockAfterReport(true);
                      setReportOpen(true);
                    }}
                  >
                    <UserX className="h-4 w-4 mr-2 text-destructive" /> Block
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="photos" className="mt-4 space-y-6">
            {/* Main photos */}
            {hasMainPhotos && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Image className="h-6 w-6" /> Photos ({mainPhotos.length})
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {mainPhotos.map((ph: { id: string; path: string }, i: number) => (
                    <Button
                      key={ph.id}
                      variant="ghost"
                      className="aspect-square overflow-hidden rounded-2xl p-0"
                      onClick={() => {
                        setViewerPhotos(null);
                        setPhotoViewerIndex(i);
                        setPhotoViewerOpen(true);
                      }}
                    >
                      {urls[ph.path] ? (
                        <img
                          src={urls[ph.path]}
                          alt={`Photo ${i + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full animate-pulse bg-muted" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {/* Albums */}
            {albumsWithPhotos.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Image className="h-6 w-6" /> Albums ({albumsWithPhotos.length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {albumsWithPhotos.map(
                    (album: {
                      id: string;
                      is_private: boolean;
                      photos?: { path: string; preview_path?: string | null }[];
                      name: string;
                    }) => {
                      const albumPhotos = album.photos ?? [];
                      const hasPhotos = albumPhotos.length > 0;
                      const firstPhoto = albumPhotos[0];
                      const firstPhotoUrl =
                        hasPhotos && firstPhoto?.path ? urls[firstPhoto.path] : null;
                      const firstPreviewUrl =
                        hasPhotos && firstPhoto?.preview_path
                          ? previewUrls[firstPhoto.preview_path]
                          : null;
                      const isPrivateAlbum =
                        album.is_private && albumRequests[album.id]?.status !== "approved";
                      const request = albumRequests[album.id];
                      const isOwner = p.id === uid;

                      return (
                        <Button
                          key={album.id}
                          variant="ghost"
                          className="rounded-3xl border bg-card overflow-hidden shadow-soft h-auto p-0"
                          onClick={() => {
                            if (isPrivateAlbum && hasPhotos) {
                              if (request?.status === "approved") {
                                setViewerPhotos(albumPhotos);
                                setPhotoViewerIndex(0);
                                setPhotoViewerOpen(true);
                              }
                              return;
                            }
                            if (hasPhotos) {
                              setViewerPhotos(albumPhotos);
                              setPhotoViewerIndex(0);
                              setPhotoViewerOpen(true);
                            }
                          }}
                          disabled={!hasPhotos}
                        >
                          <div className="aspect-[4/5] bg-muted relative">
                            {isPrivateAlbum && hasPhotos ? (
                              // Show the pre-blurred derivative only — never the original private photo.
                              firstPreviewUrl ? (
                                <img
                                  src={firstPreviewUrl}
                                  alt={album.name}
                                  className="h-full w-full object-cover blur-[20px]"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full bg-muted" />
                              )
                            ) : firstPhotoUrl ? (
                              <img
                                src={firstPhotoUrl}
                                alt={album.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">
                                {album.name?.[0]}
                              </div>
                            )}
                            {isPrivateAlbum && (
                              <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center p-4 text-center">
                                <Lock className="h-8 w-8 text-white/90 mb-2" />
                                <p className="text-white text-sm font-medium">Private Album</p>
                                {request?.status === "pending" && (
                                  <span className="mt-2 text-white/80 text-sm">Request sent</span>
                                )}
                                {request?.status === "declined" && (
                                  <span className="mt-2 text-white/80 text-sm text-red-300">
                                    Declined
                                  </span>
                                )}
                                {request?.status === "approved" && (
                                  <Button
                                    variant="default"
                                    className="mt-3 bg-primary text-primary-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewerPhotos(albumPhotos);
                                      setPhotoViewerIndex(0);
                                      setPhotoViewerOpen(true);
                                    }}
                                  >
                                    <Eye className="h-3 w-3 mr-1" /> View Album
                                  </Button>
                                )}
                                {(!request || request.status === "declined") && !isOwner && (
                                  <Button
                                    variant="default"
                                    className="mt-3 bg-primary text-primary-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRequestAlbumAccess(album.id);
                                    }}
                                  >
                                    <UserPlus className="h-3 w-3 mr-1" /> Request Access
                                  </Button>
                                )}
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
                              <div className="font-semibold">{album.name}</div>
                              <div className="text-sm opacity-90">
                                {albumPhotos.length} photo{albumPhotos.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                        </Button>
                      );
                    },
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Report {p.display_name}</DialogTitle>
              <DialogDescription>
                Help keep Gender safe. Reports are anonymous and reviewed by our team.
                {blockAfterReport && " The user will also be blocked from contacting you."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={reportReason} onValueChange={setReportReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Details / Proof <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Describe what happened. Include dates, specific messages, or any evidence..."
                  rows={4}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Be specific. Reports with details are reviewed faster.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Attach Proof (Optional)</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => fileRef.current?.click()}
                    disabled={reporting}
                  >
                    <FileText className="h-4 w-4 mr-2" /> Attach screenshot/document
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,text/*,.pdf"
                    hidden
                    onChange={handleProofUpload}
                  />
                </div>
                {reportProofPreview && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    {reportProofPreview.startsWith("blob:") ? (
                      <img
                        src={reportProofPreview}
                        alt="Proof preview"
                        className="h-16 w-auto rounded"
                      />
                    ) : (
                      <span className="text-sm">{reportProofPreview}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setReportProof(null);
                        setReportProofPreview(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockAfterReport}
                  onChange={(e) => setBlockAfterReport(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Block this user after reporting (they won't be able to contact you)
                </span>
              </Label>
            </div>
            <div className="flex gap-2 border-t pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReportOpen(false)}
                disabled={reporting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleReport}
                disabled={reporting || !reportReason}
              >
                {reporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : ""} Submit Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <PhotoViewer
          isOpen={photoViewerOpen}
          onClose={() => {
            setPhotoViewerOpen(false);
            setViewerPhotos(null);
          }}
          photos={viewerPhotos ?? (isConnected ? allPhotos : visiblePhotos)}
          initialIndex={photoViewerIndex}
          urls={urls}
          currentUserId={uid}
          isOwner={p.id === uid}
          onMoveToAlbum={handleMoveToAlbum}
          onDeletePhoto={handleDeletePhoto}
          onSetTimer={handleSetTimer}
          albums={albums}
        />
      </div>
    </>
  );
}
