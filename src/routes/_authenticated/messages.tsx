import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, type Profile } from "@/lib/data";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Loader2,
  Lock,
  Check,
  X,
  Eye,
  MoreHorizontal,
  User,
  UserPlus,
  Flag,
  UserX,
  FileText,
  Star,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";

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

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Gender" },
      { name: "description", content: "Your conversations with matches." },
    ],
  }),
  component: Messages,
});

function Messages() {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const [albumRequests, setAlbumRequests] = useState<
    Array<{
      id: string;
      album_id: string;
      requester_id: string;
      status: string;
      created_at: string;
      album_name: string;
      requester_name: string;
      requester_photo: string | null;
    }>
  >([]);
  const [myApprovedRequests, setMyApprovedRequests] = useState<
    Array<{
      album_id: string;
      album_name: string;
      owner_id: string;
      owner_name: string;
      owner_photo: string | null;
    }>
  >([]);

  // Report dialog state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportProof, setReportProof] = useState<File | null>(null);
  const [reportProofPreview, setReportProofPreview] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockAfterReport, setBlockAfterReport] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportTargetName, setReportTargetName] = useState("");
  // Inbox filter chip: all | unread | favorite | online
  const [filter, setFilter] = useState<"all" | "unread" | "favorite" | "online">("all");
  // Collapse the album-requests panel so the inbox stays the focus.
  const [albumOpen, setAlbumOpen] = useState(true);
  // Favorites are a client-side concept (no DB table); persisted in localStorage.
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("fav_connections") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggleFavorite = (connectionId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      localStorage.setItem("fav_connections", JSON.stringify([...next]));
      return next;
    });
  };

  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ["inbox", uid],
    enabled: !!uid,
    // Refresh periodically so read badges clear after a chat marks messages read,
    // and so online dots reflect presence changes without a manual reload.
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: conns } = await supabase
        .from("connections")
        .select("*")
        .eq("status", "accepted");
      if (!conns?.length) return [];

      const myConns = conns.filter((c) => c.requester === uid || c.addressee === uid);
      if (!myConns.length) return [];

      const otherIds = myConns.map((c) => (c.requester === uid ? c.addressee : c.requester));

      const [{ data: profiles }, { data: messages }, { data: photos }] = await Promise.all([
        supabase
          .from("public_profiles")
          .select(
            "id,username,display_name,gender,orientation,age,city,country,bio,verified,last_seen_at,is_online",
          )
          .in("id", otherIds),
        supabase
          .from("messages")
          .select("*")
          .in(
            "connection_id",
            myConns.map((c) => c.id),
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("photos")
          .select("user_id,path,position")
          .in("user_id", otherIds)
          .order("position"),
      ]);

      const firstPhoto: Record<string, string> = {};
      photos?.forEach((p) => {
        if (!firstPhoto[p.user_id]) firstPhoto[p.user_id] = p.path;
      });

      const latestMsg: Record<string, (typeof messages)[0]> = {};
      const unreadCount: Record<string, number> = {};
      messages?.forEach((m) => {
        if (!latestMsg[m.connection_id]) latestMsg[m.connection_id] = m;
        if (m.sender !== uid && !m.read_at) {
          unreadCount[m.connection_id] = (unreadCount[m.connection_id] ?? 0) + 1;
        }
      });

      return myConns
        .map((c) => {
          const pid = c.requester === uid ? c.addressee : c.requester;
          const profile = profiles?.find((p) => p.id === pid);
          const msg = latestMsg[c.id];
          return {
            connection: c,
            profile,
            lastMessage: msg,
            photo: firstPhoto[pid],
            unreadCount: unreadCount[c.id] ?? 0,
            // Treat as online if the flag is set, or if they were active in the last
            // 5 minutes (is_online can be stale when a tab closes without firing the
            // visibility handler, so last_seen_at is a more reliable fallback).
            isOnline:
              !!profile?.is_online ||
              (!!profile?.last_seen_at &&
                Date.now() - new Date(profile.last_seen_at).getTime() < 5 * 60 * 1000),
          };
        })
        .filter((x) => x.profile);
    },
  });

  // Fetch album requests for my albums (where I'm the owner)
  const { data: incomingRequests, isLoading: reqLoading } = useQuery({
    queryKey: ["album-requests-incoming", uid],
    enabled: !!uid,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: myAlbums } = await supabase
        .from("photo_albums")
        .select("id, name, user_id")
        .eq("user_id", uid);
      if (!myAlbums?.length) return [];

      const albumIds = myAlbums.map((a) => a.id);

      const { data: requests } = await supabase
        .from("album_access_requests")
        .select("*")
        .in("album_id", albumIds)
        .order("created_at", { ascending: false });

      const requesterIds = [...new Set(requests?.map((r) => r.requester_id) ?? [])];
      const [{ data: requesters }, { data: albums }] = await Promise.all([
        requesterIds.length
          ? supabase
              .from("public_profiles")
              .select("id,username,display_name")
              .in("id", requesterIds)
          : { data: [] },
        supabase.from("photo_albums").select("id, name").in("id", albumIds),
      ]);

      const requesterPhotos = await Promise.all(
        requesterIds.map(async (rid) => {
          const { data: photos } = await supabase
            .from("photos")
            .select("path")
            .eq("user_id", rid)
            .order("position")
            .limit(1);
          return { id: rid, path: photos?.[0]?.path ?? null };
        }),
      );

      return (requests ?? []).map((r) => {
        const requester = requesters?.find((p) => p.id === r.requester_id);
        const album = albums?.find((a) => a.id === r.album_id);
        const requesterPhoto = requesterPhotos.find((rp) => rp.id === r.requester_id)?.path ?? null;
        return {
          id: r.id,
          album_id: r.album_id,
          requester_id: r.requester_id,
          status: r.status,
          created_at: r.created_at,
          album_name: album?.name ?? "Private album",
          requester_name: requester?.display_name ?? "Someone",
          requester_photo: requesterPhoto,
        };
      });
    },
  });

  // Fetch my approved requests (where I requested and was approved)
  const { data: myRequests, isLoading: myReqLoading } = useQuery({
    queryKey: ["album-requests-mine", uid],
    enabled: !!uid,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: requests } = await supabase
        .from("album_access_requests")
        .select("*")
        .eq("requester_id", uid)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (!requests?.length) return [];

      const albumIds = [...new Set(requests.map((r) => r.album_id))];
      const { data: albums } = await supabase
        .from("photo_albums")
        .select("id, name, user_id")
        .in("id", albumIds);

      if (!albums?.length) return [];

      const { data: owners } = await supabase
        .from("profiles")
        .select("id,username,display_name")
        .in("id", [...new Set(albums.map((a) => a.user_id))]);

      const ownerPhotos = await Promise.all(
        (albums ?? []).map(async (a) => {
          const { data: photos } = await supabase
            .from("photos")
            .select("path")
            .eq("user_id", a.user_id)
            .order("position")
            .limit(1);
          return { id: a.user_id, path: photos?.[0]?.path ?? null };
        }),
      );

      return requests.map((r) => {
        const album = albums?.find((a) => a.id === r.album_id);
        const owner = owners?.find((p) => p.id === album?.user_id);
        const ownerPhoto = ownerPhotos.find((op) => op.id === album?.user_id)?.path ?? null;
        return {
          album_id: r.album_id,
          album_name: album?.name ?? "Private album",
          owner_id: album?.user_id ?? "",
          owner_name: owner?.display_name ?? "Someone",
          owner_photo: ownerPhoto,
        };
      });
    },
  });

  useEffect(() => {
    if (incomingRequests) setAlbumRequests(incomingRequests);
  }, [incomingRequests]);

  useEffect(() => {
    if (myRequests) setMyApprovedRequests(myRequests);
  }, [myRequests]);

  // Apply the active filter chip to the inbox.
  const filteredInbox = (inboxData ?? []).filter((d) => {
    if (filter === "unread") return d.unreadCount > 0;
    if (filter === "favorite") return favorites.has(d.connection.id);
    if (filter === "online") return d.isOnline;
    return true;
  });

  const urls = useSigned("photos", [
    ...(inboxData ?? []).map((d) => d.photo),
    ...(albumRequests.map((r) => r.requester_photo).filter(Boolean) as string[]),
    ...(myApprovedRequests.map((r) => r.owner_photo).filter(Boolean) as string[]),
  ]);

  const previewUrls = useSigned("photo-previews", [
    ...(inboxData ?? []).map((d) => d.photo),
    ...(albumRequests.map((r) => r.requester_photo).filter(Boolean) as string[]),
    ...(myApprovedRequests.map((r) => r.owner_photo).filter(Boolean) as string[]),
  ]);

  const handleApprove = async (requestId: string) => {
    const { error } = await supabase
      .from("album_access_requests")
      .update({ status: "approved" })
      .eq("id", requestId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Access approved");
    qc.invalidateQueries({ queryKey: ["album-requests-incoming"] });
    qc.invalidateQueries({ queryKey: ["album-requests-mine"] });
  };

  // Decline = remove the request row (the owner has DELETE permission). Deleting
  // rather than leaving a 'declined' row lets the requester ask again later — the
  // table has UNIQUE(album_id, requester_id), so a stale declined row would block
  // any future request and the request would just "disappear".
  const handleDecline = async (requestId: string) => {
    const { error } = await supabase.from("album_access_requests").delete().eq("id", requestId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request declined");
    qc.invalidateQueries({ queryKey: ["album-requests-incoming"] });
    qc.invalidateQueries({ queryKey: ["album-requests-mine"] });
  };

  // Revoke an approved album access grant (delete the request so access is removed).
  const handleRevokeAccess = async (requestId: string) => {
    if (!confirm("Revoke access? This person will no longer be able to view the album.")) return;
    const { error } = await supabase.from("album_access_requests").delete().eq("id", requestId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Access revoked");
    qc.invalidateQueries({ queryKey: ["album-requests-incoming"] });
    qc.invalidateQueries({ queryKey: ["album-requests-mine"] });
  };

  // Mark every incoming message in a conversation as read (menu action). Direct
  // UPDATE on messages is revoked, so use the mark_chat_read SECURITY DEFINER RPC.
  const markRead = async (connectionId: string) => {
    if (!uid) return;
    const { error } = await supabase.rpc("mark_chat_read", { _connection_id: connectionId });
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["inbox"] });
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

  const handleReportSubmit = async () => {
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
      const { error } = await supabase.from("reports").insert({
        reporter_id: uid,
        reported_id: reportTargetId,
        reason: reportDescription.trim(),
        reason_category: reportReason,
        auto_blocked: blockAfterReport,
      });
      if (error) throw error;

      toast.success("Report submitted" + (blockAfterReport ? " and user blocked" : ""));
      setReportOpen(false);
      setReportReason("");
      setReportDescription("");
      setReportProof(null);
      setReportProofPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["discover"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Failed to submit report");
    } finally {
      setReporting(false);
    }
  };

  if (!me) return null;
  if (inboxLoading)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const hasAlbumRequests = albumRequests.length > 0 || myApprovedRequests.length > 0;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Messages</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/referrals">
              <UserPlus className="h-4 w-4" />
              <span className="ml-2">Refer a friend</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Album Requests Section */}
      {hasAlbumRequests && (
        <section className="mb-8 space-y-4 rounded-3xl border bg-card p-6 shadow-soft">
          <button
            type="button"
            onClick={() => setAlbumOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Lock className="h-5 w-5" /> Album Requests
            </h2>
            <span className="text-sm font-medium text-muted-foreground">
              {albumOpen ? "Hide" : "Show"}
            </span>
          </button>

          {albumOpen && (
            <>
              {/* Incoming requests for my albums */}
              {albumRequests.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Requests for your albums
                  </h3>
                  {albumRequests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {r.requester_photo ? (
                            <img
                              src={urls[r.requester_photo] || ""}
                              alt={r.requester_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-2xl font-bold">{r.requester_name?.[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{r.requester_name}</p>
                          <p className="text-sm text-muted-foreground">
                            requested access to "{r.album_name}"
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.status === "pending" && (
                          <>
                            <Button variant="success" size="sm" onClick={() => handleApprove(r.id)}>
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDecline(r.id)}>
                              <X className="h-3 w-3 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                              <Check className="h-3 w-3" /> Approved
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevokeAccess(r.id)}
                            >
                              <UserX className="h-3 w-3 mr-1" /> Revoke
                            </Button>
                          </div>
                        )}
                        {r.status === "declined" && (
                          <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                            <X className="h-3 w-3" /> Declined
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* My approved requests */}
              {myApprovedRequests.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Your approved requests
                  </h3>
                  {myApprovedRequests.map((r) => (
                    <div
                      key={r.album_id}
                      className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {r.owner_photo ? (
                            <img
                              src={urls[r.owner_photo] || ""}
                              alt={r.owner_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-2xl font-bold">{r.owner_name?.[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{r.owner_name}</p>
                          <p className="text-sm text-muted-foreground">
                            approved your request for "{r.album_name}"
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/profile/$username" params={{ username: r.owner_id }}>
                          <Eye className="h-3 w-3 mr-1" /> View Profile
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "All" },
            { key: "unread", label: "Unread" },
            { key: "favorite", label: "Favorite" },
            { key: "online", label: "Online" },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Conversations */}
      {inboxData && inboxData.length === 0 ? (
        <div className="rounded-3xl border bg-card p-12 text-center">
          <MessageCircle className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No conversations yet</h2>
          <p className="mt-2 text-muted-foreground">
            Connect with someone on Discover to start chatting, or invite a friend to join.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/discover">Discover people</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/referrals">
                <UserPlus className="h-4 w-4 mr-2" /> Refer a friend
              </Link>
            </Button>
          </div>
        </div>
      ) : filteredInbox.length === 0 ? (
        <div className="rounded-3xl border bg-card p-12 text-center text-muted-foreground">
          No conversations match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInbox.map((d) => {
            const profileUsername =
              d.profile.username && d.profile.username.trim() !== ""
                ? d.profile.username
                : d.profile.id;
            const isFavorite = favorites.has(d.connection.id);
            const unread = d.unreadCount ?? 0;
            return (
              <div
                key={d.connection.id}
                className="flex items-center gap-3 rounded-3xl border bg-card p-3 shadow-soft transition hover:bg-accent/40"
              >
                {/* Avatar — opens profile */}
                <Link
                  to="/profile/$username"
                  params={{ username: profileUsername }}
                  className="relative h-14 w-14 shrink-0"
                  aria-label={`View ${d.profile.display_name}'s profile`}
                >
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-muted">
                    {d.photo && urls[d.photo] ? (
                      <img
                        src={urls[d.photo]}
                        alt={d.profile.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-lg font-semibold">
                        {d.profile.display_name?.[0]}
                      </span>
                    )}
                  </div>
                  {d.isOnline && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500" />
                  )}
                </Link>

                {/* Name + last message — name opens profile, rest opens chat */}
                <Link to="/chat/$id" params={{ id: d.connection.id }} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/profile/$username"
                      params={{ username: profileUsername }}
                      className="truncate font-semibold hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.profile.display_name}
                    </Link>
                    {isFavorite && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {d.lastMessage
                        ? new Date(d.lastMessage.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-muted-foreground">
                      {d.lastMessage
                        ? (d.lastMessage.body ??
                          (d.lastMessage.attachment_path ? "📎 Attachment" : ""))
                        : "Say hi 👋"}
                    </p>
                    {unread > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Three-dots menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link to="/profile/$username" params={{ username: profileUsername }}>
                        <User className="h-4 w-4 mr-2" /> View profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleFavorite(d.connection.id)}>
                      <Star
                        className={`h-4 w-4 mr-2 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`}
                      />
                      {isFavorite ? "Remove from favorites" : "Add to favorites"}
                    </DropdownMenuItem>
                    {unread > 0 && (
                      <DropdownMenuItem onClick={() => markRead(d.connection.id)}>
                        <Check className="h-4 w-4 mr-2" /> Mark as read
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        setReportTargetId(d.profile.id);
                        setReportTargetName(d.profile.display_name);
                        setReportOpen(true);
                      }}
                    >
                      <Flag className="h-4 w-4 mr-2 text-destructive" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (confirm("Unmatch? This will delete the conversation.")) {
                          supabase
                            .from("connections")
                            .delete()
                            .eq("id", d.connection.id)
                            .then(() => {
                              toast.success("Unmatched");
                              qc.invalidateQueries({ queryKey: ["inbox"] });
                              qc.invalidateQueries({ queryKey: ["connections"] });
                            });
                        }
                      }}
                    >
                      <UserX className="h-4 w-4 mr-2 text-destructive" /> Unmatch
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report {reportTargetName}</DialogTitle>
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
              onClick={handleReportSubmit}
              disabled={reporting || !reportReason}
            >
              {reporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : ""} Submit Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
