import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Flag, MapPin, MessageCircle, Shield, User, Heart, X, Check, Loader2, Image, FileText, Lock, Eye, EyeOff, Send, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ageOf, GENDERS, ORIENTATIONS, useMe, useSigned, logProfileView, reportProfile } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PhotoViewer } from "@/components/app/PhotoViewer";

export const Route = createFileRoute("/_authenticated/profile/$username")({
  head: () => ({ meta: [{ title: "Profile — Gender" }, { name: "description", content: "View user profile." }] }),
  component: ProfileView,
});

const REPORT_REASONS = [
  { value: "spam", label: "Spam", description: "Unwanted messages, promotional content, or repetitive messaging" },
  { value: "fraud", label: "Fraud/Scam", description: "Attempting to deceive for money, personal info, or financial gain" },
  { value: "money_request", label: "Asking for Money", description: "Directly or indirectly requesting money, gifts, or financial help" },
  { value: "fake_profile", label: "Fake Profile", description: "Using stolen photos, false identity, or misleading information" },
  { value: "harassment", label: "Harassment", description: "Threats, abusive language, stalking, or unwanted persistent contact" },
  { value: "inappropriate_content", label: "Inappropriate Content", description: "Explicit, offensive, or prohibited content in photos/bio" },
  { value: "underage", label: "Underage User", description: "Appears to be under 18 years old" },
  { value: "other", label: "Other", description: "Something not listed here" },
];

function ProfileView() {
  const { username } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
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
  const [viewerPhotos, setViewerPhotos] = useState<Array<{ id: string; path: string; album_id: string | null; is_private?: boolean; view_timer?: string }> | null>(null);
  const [moveAlbumId, setMoveAlbumId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const movePhotoId = useRef<string | null>(null);
  const [showPrivateRequest, setShowPrivateRequest] = useState(false);
  const [privateRequestMsg, setPrivateRequestMsg] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile-view", username],
    enabled: !!uid,
    queryFn: async () => {
      // Try to find by username first, then fall back to ID (for legacy users without username)
      let { data: p } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      
      // If not found by username, try by ID (in case username is a UUID)
      if (!p) {
        const { data: pById } = await supabase.from("profiles").select("*").eq("id", username).maybeSingle();
        p = pById;
      }
      
      if (!p) return null;
      // Check connection status first to determine photo/album visibility
      const { data: conns } = await supabase.from("connections").select("*");
      const conn = conns?.find((c: any) => 
        (c.requester === uid && c.addressee === p.id) || (c.requester === p.id && c.addressee === uid)
      );
      const isConnected = conn?.status === "accepted";
      
      // Fetch ALL photos (we'll filter for display)
      const { data: allPhotos } = await supabase.from("photos").select("*").eq("user_id", p.id).order("position");
      
      // Fetch ALL albums (for display, including private ones)
      const { data: allAlbums } = await supabase.from("photo_albums").select("*").eq("user_id", p.id).order("created_at", { ascending: false });
      
      // Group ALL photos by album
      const photosByAlbum: Record<string, typeof allPhotos> = {};
      (allPhotos ?? []).forEach((ph) => {
        const k = ph.album_id ?? "none";
        if (!photosByAlbum[k]) photosByAlbum[k] = [];
        photosByAlbum[k].push(ph);
      });
      
      // Attach photos to albums (all albums with their photos)
      const albumsWithPhotos = (allAlbums ?? []).map((a) => ({ ...a, photos: photosByAlbum[a.id] ?? [] }));
      
      // Determine visible photos for non-connected users: only non-private photos
      const visiblePhotos = isConnected 
        ? (allPhotos ?? []) 
        : (allPhotos ?? []).filter((ph) => !ph.is_private);
      
      // Main photos = photos without album_id that are visible
      const mainPhotos = visiblePhotos.filter((ph) => !ph.album_id);
      
      return { 
        profile: p, 
        allPhotos: allPhotos ?? [], 
        visiblePhotos,
        mainPhotos,
        albums: albumsWithPhotos, 
        connections: conns ?? [],
        isConnected 
      };
    },
  });

  // Log profile view
  useEffect(() => {
    if (profile?.profile && profile.profile.id !== uid) {
      logProfileView(profile.profile.id).catch(() => {});
    }
  }, [profile, username, uid]);

  // Get connection status
  const conn = profile?.connections.find((c: any) => 
    (c.requester === uid && c.addressee === profile.profile?.id) || (c.requester === profile.profile?.id && c.addressee === uid)
  );
  const isConnected = profile?.isConnected ?? (conn?.status === "accepted");
  const isPending = conn?.status === "pending";
  const isOwnRequest = conn?.requester === uid;

  // Main photos (visible ones without album_id)
  const mainPhotos = profile?.mainPhotos ?? [];
  const visiblePhotos = profile?.visiblePhotos ?? [];
  const allPhotos = profile?.allPhotos ?? [];
  const albums = profile?.albums ?? [];

  // Check if all visible photos are private (for blur logic)
  const hasMainPhotos = mainPhotos.length > 0;
  const allVisiblePrivate = visiblePhotos.length > 0 && visiblePhotos.every((ph: any) => ph.is_private === true);
  const showMainBlur = !isConnected && allVisiblePrivate && profile.profile?.id !== uid;
  
  // If no main photos but has private albums with photos, use first private album's first photo as blurred main
  const privateAlbumWithPhotos = albums.find((a: any) => a.is_private && a.photos?.length > 0);
  const fallbackMainPhoto = privateAlbumWithPhotos?.photos?.[0];
  const showFallbackBlur = !isConnected && !hasMainPhotos && fallbackMainPhoto && profile.profile?.id !== uid;

  // Get photo URLs for visible photos + fallback
  const photoPaths = [
    ...visiblePhotos.map((p: any) => p.path),
    ...(fallbackMainPhoto ? [fallbackMainPhoto.path] : [])
  ];
  const urls = useSigned("photos", photoPaths);

  if (!me) return <div className="flex h-screen items-center justify-center">Loading…</div>;
  if (!profile?.profile) return <div className="p-8 text-center text-muted-foreground">Profile not found.</div>;
  if (profile.profile.id === uid) return <Link to="/profile" replace />;

  const p = profile.profile;
  const photos = profile.photos;

  const handleReport = async () => {
    if (!reportReason) { toast.error("Please select a reason"); return; }
    if (blockAfterReport && !reportDescription.trim()) { 
      toast.error("Please provide details/proof for the report"); 
      return; 
    }
    setReporting(true);
    try {
      // Create report with enhanced fields
      await reportProfile(p.id, reportDescription.trim(), {
        reasonCategory: reportReason,
        proofText: reportDescription.trim(),
        proofFilePath: null, // TODO: upload proof file to storage
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
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit report");
    } finally {
      setReporting(false);
    }
  };

  const handleMoveToAlbum = async (photoId: string, albumId: string | null) => {
    const { error } = await supabase.from("photos").update({ album_id: albumId }).eq("id", photoId);
    if (error) { toast.error(error.message); return; }
    toast.success(albumId ? "Moved to album" : "Removed from album");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Delete this photo permanently?")) return;
    const { error } = await supabase.from("photos").delete().eq("id", photoId);
    if (error) { toast.error(error.message); return; }
    toast.success("Photo deleted");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleSetTimer = async (photoId: string, timer: "normal" | "10s" | "15s") => {
    const { error } = await supabase.from("photos").update({ view_timer: timer }).eq("id", photoId);
    if (error) { toast.error(error.message); return; }
    toast.success(`View timer set to ${timer}`);
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Proof file must be under 5MB"); return; }
    if (!file.type.startsWith("image/") && !file.type.startsWith("text/") && file.type !== "application/pdf") {
      toast.error("Proof must be an image, text file, or PDF"); return;
    }
    setReportProof(file);
    if (file.type.startsWith("image/")) {
      setReportProofPreview(URL.createObjectURL(file));
    } else {
      setReportProofPreview(file.name);
    }
  };

  const handlePrivateRequest = async () => {
    if (!privateRequestMsg.trim()) {
      toast.error("Please add a message");
      return;
    }
    // Create a connection request with a note about private album access
    const { error } = await supabase.from("connections").insert({ 
      requester: uid, 
      addressee: p.id 
    });
    if (error) { 
      toast.error(error.message); 
      return; 
    }
    // Send a notification/message about the private album request
    toast.success("Request sent! They'll be notified.");
    setShowPrivateRequest(false);
    setPrivateRequestMsg("");
    qc.invalidateQueries({ queryKey: ["profile-view", username] });
    qc.invalidateQueries({ queryKey: ["discover"] });
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      {/* Profile Header */}
      <div className="rounded-3xl border bg-card overflow-hidden shadow-soft">
        {/* Photo Carousel */}
        <div className="relative aspect-[4/5] bg-muted">
          {mainPhotos.length > 0 ? (
            <>
              <div className="h-full w-full overflow-hidden">
                {mainPhotos.map((ph: any, i: number) => (
                  <Button
                    key={ph.id}
                    variant="ghost"
                    className="h-full w-full p-0"
                    onClick={() => { 
                      if (showMainBlur && i === 0) {
                        setShowPrivateRequest(true);
                        return;
                      }
                      setViewerPhotos(null); 
                      setPhotoViewerIndex(i); 
                      setPhotoViewerOpen(true); 
                    }}
                  >
                    <div className="relative h-full w-full">
                      <img
                        src={urls[ph.path] || ""}
                        alt={`${p.display_name}'s photo ${i + 1}`}
                        className={`h-full w-full object-cover ${showMainBlur && i === 0 ? "blur-[20px]" : ""}`}
                        loading={i === 0 ? "eager" : "lazy"}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      {(showMainBlur && i === 0) && (
                        <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center p-4 text-center">
                          <Lock className="h-12 w-12 text-white/90 mb-3" />
                          <p className="text-white text-lg font-semibold">Private Photos</p>
                          <p className="text-white/70 text-sm mt-1">This user's photos are private</p>
                          <Button 
                            variant="default" 
                            className="mt-4 bg-primary text-primary-foreground"
                            onClick={(e) => { e.stopPropagation(); setShowPrivateRequest(true); }}
                          >
                            <UserPlus className="h-4 w-4 mr-2" /> Request Access
                          </Button>
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
              {mainPhotos.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {mainPhotos.map((_, i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full transition-colors ${!showMainBlur && i === 0 ? "bg-white" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (showFallbackBlur && fallbackMainPhoto ? (
            // Show blurred fallback from private album
            <Button
              variant="ghost"
              className="h-full w-full p-0"
              onClick={() => setShowPrivateRequest(true)}
            >
              <div className="relative h-full w-full">
                <img
                  src={urls[fallbackMainPhoto.path] || ""}
                  alt={`${p.display_name}'s private photo`}
                  className="h-full w-full object-cover blur-[20px]"
                  loading="eager"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center p-4 text-center">
                  <Lock className="h-12 w-12 text-white/90 mb-3" />
                  <p className="text-white text-lg font-semibold">Private Photos</p>
                  <p className="text-white/70 text-sm mt-1">This user's photos are private</p>
                  <Button 
                    variant="default" 
                    className="mt-4 bg-primary text-primary-foreground"
                    onClick={(e) => { e.stopPropagation(); setShowPrivateRequest(true); }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" /> Request Access
                  </Button>
                </div>
              </div>
            </Button>
          ) : (
            // No photos at all - show initial
            <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">
              {p.display_name?.[0]}
            </div>
          )}
          
          {/* Badges */}
          <div className="absolute top-4 left-4 right-4 flex justify-between">
            <div className="flex gap-2">
              {p.verified && (
                <span className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-sm font-medium shadow">
                  <BadgeCheck className="h-4 w-4 text-primary" /> Verified
                </span>
              )}
              {/* Online status indicator */}
              {p.is_online && (
                <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-sm font-medium text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Online
                </span>
              )}
            </div>
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white/90 shadow-lg">
                  <Flag className="h-5 w-5 text-destructive" />
                </Button>
              </DialogTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                      <SelectContent>
                        {REPORT_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Details / Proof <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="Describe what happened. Include dates, specific messages, or any evidence..."
                      rows={4}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Be specific. Reports with details are reviewed faster.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Attach Proof (Optional)</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={reporting}>
                        <FileText className="h-4 w-4 mr-2" /> Attach screenshot/document
                      </Button>
                      <input ref={fileRef} type="file" accept="image/*,text/*,.pdf" hidden onChange={handleProofUpload} />
                    </div>
                    {reportProofPreview && (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        {reportProofPreview.startsWith("blob:") ? (
                          <img src={reportProofPreview} alt="Proof preview" className="h-16 w-auto rounded" />
                        ) : (
                          <span className="text-sm">{reportProofPreview}</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setReportProof(null); setReportProofPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={blockAfterReport} onChange={(e) => setBlockAfterReport(e.target.checked)} className="h-4 w-4" />
                    <span className="text-sm">Block this user after reporting (they won't be able to contact you)</span>
                  </Label>
                </div>
                <div className="flex gap-2 border-t pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setReportOpen(false)} disabled={reporting}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleReport} disabled={reporting || !reportReason}>
                    {reporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : ""} Submit Report
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Profile Info */}
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold">
                {p.display_name}
                {ageOf(p.birthdate) !== null && <span className="text-2xl font-normal text-muted-foreground">, {ageOf(p.birthdate)}</span>}
                {p.verified && <BadgeCheck className="h-6 w-6 text-primary" />}
              </h1>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs items-center">
                {p.gender && <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{p.gender}</span>}
                {p.orientation && <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">{p.orientation}</span>}
                {p.is_online && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Online
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {p.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.city}{p.country && `, ${p.country}`}</span>}
            {p.country && !p.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.country}</span>}
          </div>

          {p.bio && <p className="text-muted-foreground">{p.bio}</p>}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {isConnected ? (
              <Button asChild variant="hero" className="flex-1 min-w-[140px]"><Link to="/chat/$id" params={{ id: conn.id }}><MessageCircle className="h-4 w-4 mr-2" />Chat</Link></Button>
            ) : isPending ? (
              isOwnRequest ? (
                <Button variant="secondary" disabled className="flex-1 min-w-[140px]"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Waiting for response…</Button>
              ) : (
                <>
                  <Button variant="success" className="flex-1 min-w-[120px]" onClick={() => supabase.from("connections").update({ status: "accepted" }).eq("id", conn.id).then(() => { toast.success("Connected!"); qc.invalidateQueries({ queryKey: ["profile-view", username] }); })}><Check className="h-4 w-4 mr-2" />Accept</Button>
                  <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => supabase.from("connections").update({ status: "declined" }).eq("id", conn.id).then(() => { qc.invalidateQueries({ queryKey: ["profile-view", username] }); })}><X className="h-4 w-4 mr-2" />Decline</Button>
                </>
              )
            ) : (
              <Button variant="hero" className="flex-1 min-w-[140px]" onClick={() => supabase.from("connections").insert({ requester: uid, addressee: p.id }).then(() => { toast.success("Connection request sent"); qc.invalidateQueries({ queryKey: ["profile-view", username] }); qc.invalidateQueries({ queryKey: ["discover"] }); })}><User className="h-4 w-4 mr-2" />Connect</Button>
            )}
            {p.id !== uid && !isConnected && (allVisiblePrivate || showFallbackBlur) && (
              <Button variant="outline" onClick={() => setShowPrivateRequest(true)}>
                <Lock className="h-4 w-4 mr-2" /> Request Private Access
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => setReportOpen(true)} aria-label="Report user"><Flag className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {/* Albums */}
      {albums.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold flex items-center gap-2"><Image className="h-6 w-6" />Albums ({albums.length})</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album: any) => {
              const albumPhotos = album.photos ?? [];
              const hasPhotos = albumPhotos.length > 0;
              const firstPhotoUrl = hasPhotos && albumPhotos[0]?.path ? urls[albumPhotos[0].path] : null;
              const isPrivateAlbum = album.is_private && !isConnected;
              
              return (
                <Button
                  key={album.id}
                  variant="ghost"
                  className="rounded-3xl border bg-card overflow-hidden shadow-soft h-auto p-0"
                  onClick={() => {
                    if (isPrivateAlbum && hasPhotos) {
                      setShowPrivateRequest(true);
                      return;
                    }
                    hasPhotos && (setViewerPhotos(albumPhotos), setPhotoViewerIndex(0), setPhotoViewerOpen(true))
                  }}
                  disabled={!hasPhotos}
                >
                  <div className="aspect-[4/5] bg-muted relative">
                    {firstPhotoUrl ? (
                      <img src={firstPhotoUrl} alt={album.name} className={`h-full w-full object-cover ${isPrivateAlbum ? "blur-[20px]" : ""}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">{album.name?.[0]}</div>
                    )}
                    {isPrivateAlbum && (
                      <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center p-4 text-center">
                        <Lock className="h-8 w-8 text-white/90 mb-2" />
                        <p className="text-white text-sm font-medium">Private Album</p>
                        <Button 
                          variant="default" 
                          className="mt-3 bg-primary text-primary-foreground"
                          onClick={(e) => { e.stopPropagation(); setShowPrivateRequest(true); }}
                        >
                          <UserPlus className="h-3 w-3 mr-1" /> Request Access
                        </Button>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
                      <div className="font-semibold">{album.name}</div>
                      <div className="text-sm opacity-90">{albumPhotos.length} photo{albumPhotos.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Additional Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border bg-card p-6 shadow-soft">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Shield className="h-5 w-5" />Safety</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Only accepted matches can message you</p>
            <p>• Private photos are visible only to matches</p>
            <p>• All messages expire after 24 hours</p>
            <p>• Report inappropriate behavior anytime</p>
          </div>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-soft">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Heart className="h-5 w-5" />Looking for</h3>
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.slice(0, 5).map((g) => <span key={g} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{g}</span>)}
            {GENDERS.length > 5 && <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">+{GENDERS.length - 5} more</span>}
          </div>
        </div>
      </div>
    </div>

    {/* Private Access Request Dialog */}
    <Dialog open={showPrivateRequest} onOpenChange={setShowPrivateRequest}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Private Access</DialogTitle>
          <DialogDescription>
            Send a connection request to {p.display_name} with a note asking to view their private photos/albums.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Message (Optional)</Label>
            <Textarea
              value={privateRequestMsg}
              onChange={(e) => setPrivateRequestMsg(e.target.value)}
              placeholder="Hi! I'd love to see your private photos..."
              rows={3}
            />
          </div>
        </div>
        <div className="flex gap-2 border-t pt-4">
          <Button variant="outline" className="flex-1" onClick={() => { setShowPrivateRequest(false); setPrivateRequestMsg(""); }}>Cancel</Button>
          <Button variant="hero" className="flex-1" onClick={handlePrivateRequest}>
            <Send className="h-4 w-4 mr-2" /> Send Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <PhotoViewer
      isOpen={photoViewerOpen}
      onClose={() => { setPhotoViewerOpen(false); setViewerPhotos(null); }}
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
    </>
  );
}