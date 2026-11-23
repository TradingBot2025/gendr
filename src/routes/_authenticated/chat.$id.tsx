import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Paperclip,
  Phone,
  Send,
  Video,
  ShieldCheck,
  Clock,
  Image,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Camera,
  RotateCcw,
  MoreHorizontal,
  User,
  Flag,
  UserX,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, useMyAlbumsWithPhotos } from "@/lib/data";
import { useCall } from "@/lib/calls";
import {
  playNotificationSound,
  playRingingSound,
  stopRingingSound,
  unlockAudioContext,
} from "@/lib/audio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoViewer } from "@/components/app/PhotoViewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

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

const DISAPPEAR_OPTIONS = [{ value: 86400, label: "24 hours" }];

function formatDisappear(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const preset = DISAPPEAR_OPTIONS.find((o) => o.value === seconds);
  if (preset) return preset.label;
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  if (seconds < 86400) {
    const h = Math.round(seconds / 3600);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  if (seconds < 604800) {
    const d = Math.round(seconds / 86400);
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const w = Math.round(seconds / 604800);
  return `${w} week${w === 1 ? "" : "s"}`;
}

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({
    meta: [
      { title: "Chat — Gender" },
      {
        name: "description",
        content: "Chat, share and call your match. Set a disappearing timer for messages.",
      },
    ],
  }),
  component: Chat,
});

function Chat() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const call = useCall();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [expNotice, setExpNotice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [maxViews, setMaxViews] = useState<number | null>(null); // null = unlimited, 1 = one-time, etc.
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [albumPhotos, setAlbumPhotos] = useState<
    { id: string; path: string; album_id: string | null }[]
  >([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<Array<{
    id: string;
    path: string;
    attachment_type?: string;
  }> | null>(null);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  // Report dialog state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportProof, setReportProof] = useState<File | null>(null);
  const [reportProofPreview, setReportProofPreview] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockAfterReport, setBlockAfterReport] = useState(true);
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportTargetName, setReportTargetName] = useState("");

  // Unlock audio on first user interaction (mobile)
  useEffect(() => {
    function unlockAudio() {
      unlockAudioContext();
    }
    document.addEventListener("click", unlockAudio, { once: true });
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Fetch chat info
  const { data: info } = useQuery({
    queryKey: ["chat-info", id],
    enabled: !!uid,
    queryFn: async () => {
      const { data: c } = await supabase.from("connections").select("*").eq("id", id).maybeSingle();
      if (!c || c.status !== "accepted") return null;
      const pid = c.requester === uid ? c.addressee : c.requester;
      const [{ data: p }, { data: ph }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", pid).maybeSingle(),
        supabase.from("photos").select("path").eq("user_id", pid).order("position").limit(1),
      ]);
      const disappearSeconds =
        (c as { disappear_seconds?: number | null }).disappear_seconds ?? null;
      return { pid, peer: p, photo: ph?.[0]?.path, disappearSeconds };
    },
  });

  // Fetch messages
  const { data: msgs } = useQuery({
    queryKey: ["messages", id],
    enabled: !!info,
    refetchInterval: 2500,
    queryFn: async () =>
      (
        await supabase
          .from("messages")
          .select("*")
          .eq("connection_id", id)
          .order("created_at")
          .limit(500)
      ).data ?? [],
  });

  // Fetch user's albums with photos for album picker
  const { data: myAlbums } = useMyAlbumsWithPhotos();

  const purls = useSigned("photos", [info?.photo]);
  const aurls = useSigned(
    "attachments",
    (msgs ?? []).map((m) => m.attachment_path),
  );
  // Album photos live in the "photos" bucket, not attachments — sign them separately.
  const albumPhotoPaths = (myAlbums ?? []).flatMap((a) => a.photos.map((p) => p.path));
  const albumUrls = useSigned("photos", albumPhotoPaths);

  // Track viewed messages for expiring photos
  const viewedMsgRef = useRef<Set<string>>(new Set());

  // Scroll to bottom
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs?.length]);

  // Play notification sound on new message
  const lastMsgCountRef = useRef(msgs?.length ?? 0);
  useEffect(() => {
    if (msgs && msgs.length > lastMsgCountRef.current && notificationsEnabled && audioEnabled) {
      const newMsgs = msgs.slice(lastMsgCountRef.current);
      const hasNewFromOther = newMsgs.some((m) => m.sender !== uid);
      if (hasNewFromOther) playNotificationSound();
    }
    lastMsgCountRef.current = msgs?.length ?? 0;
  }, [msgs?.length, notificationsEnabled, audioEnabled, uid]);

  // Handle call ringing
  useEffect(() => {
    if (call.status === "incoming" && audioEnabled) {
      playRingingSound();
    } else {
      stopRingingSound();
    }
    return () => stopRingingSound();
  }, [call.status, audioEnabled]);

  // Auto-increment view count for limited-view images when they come into view (for recipient)
  useEffect(() => {
    if (!msgs?.length || !uid) return;
    const currentNow = Date.now();
    msgs.forEach((m) => {
      const mine = m.sender === uid;
      const isExpired = m.expires_at && new Date(m.expires_at).getTime() < currentNow;
      const isViewLimited =
        m.max_views !== null &&
        m.max_views !== undefined &&
        m.view_count !== undefined &&
        m.view_count >= m.max_views;
      const isImage = m.attachment_type?.startsWith("image/");

      if (
        !mine &&
        isImage &&
        m.max_views &&
        m.max_views > 0 &&
        m.view_count !== undefined &&
        m.view_count < m.max_views &&
        !isExpired &&
        !isViewLimited
      ) {
        if (!viewedMsgRef.current.has(m.id)) {
          viewedMsgRef.current.add(m.id);
          supabase.rpc("increment_message_view", { message_id: m.id }).then(() => {
            qc.invalidateQueries({ queryKey: ["messages", id] });
          });
        }
      }
    });
  }, [msgs, uid]);

  if (info === null)
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">This chat isn't available.</p>
        <Button asChild className="mt-4">
          <Link to="/connections">Back to matches</Link>
        </Button>
      </div>
    );
  if (!info || !uid) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  const name = info.peer?.display_name ?? "Match";
  const disappearSeconds = info.disappearSeconds ?? 86400;
  const disappearLabel = formatDisappear(disappearSeconds) ?? "24 hours";

  const now = Date.now();
  const expired = (msgs ?? []).filter(
    (m) => m.expires_at && new Date(m.expires_at).getTime() < now,
  );

  // Check if message is a short-timer message (10s/15s) that should disappear immediately when expired
  const isShortTimer = (m: Message) =>
    m.expires_at && new Date(m.expires_at).getTime() - new Date(m.created_at).getTime() < 60 * 1000;

  // Message is expired AND should be hidden (short timer) OR view limited
  const isExpiredAndHidden = (m: Message) => {
    if (!m.expires_at) return false;
    const isExpired = new Date(m.expires_at).getTime() < now;
    if (!isExpired) return false;
    // Short timer messages (10s/15s) should disappear immediately
    if (isShortTimer(m)) return true;
    // 24h messages should show as expired but not blur/hide
    return false;
  };

  const sendMsg = async (fields: {
    body?: string;
    attachment_path?: string;
    attachment_type?: string;
    attachment_name?: string;
    max_views?: number | null;
  }) => {
    // All messages follow one rule: disappear after 24 hours.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("messages").insert({
      connection_id: id,
      sender: uid,
      expires_at: expiresAt,
      max_views: fields.max_views ?? null,
      view_count: 0,
      ...fields,
    });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["messages", id] });
  };

  const setChatTimer = async (seconds: number) => {
    const { error } = await supabase.rpc("set_chat_timer", {
      _connection_id: id,
      _seconds: seconds,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Disappearing messages: ${formatDisappear(seconds)}`);
    qc.invalidateQueries({ queryKey: ["chat-info", id] });
  };

  const unsendMessage = async (messageId: string) => {
    const { error } = await supabase
      .from("messages")
      .update({
        unsent: true,
        body: null,
        attachment_path: null,
        attachment_type: null,
        attachment_name: null,
      })
      .eq("id", messageId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Message unsent");
    qc.invalidateQueries({ queryKey: ["messages", id] });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const b = text.trim().slice(0, 4000);
    if (!b) return;
    setText("");
    setSending(true);
    await sendMsg({ body: b });
    setSending(false);
  };

  const attach = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Files must be under 25MB");
      return;
    }
    setSending(true);
    const path = `${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("attachments")
      .upload(path, f, { contentType: f.type });
    if (error) toast.error(error.message);
    else
      await sendMsg({
        attachment_path: path,
        attachment_type: f.type || "application/octet-stream",
        attachment_name: f.name,
        max_views: maxViews,
      });
    setSending(false);
    if (fileRef.current) fileRef.current.value = "";
    setShowAttachMenu(false);
  };

  const sendAlbumPhoto = async (photoPath: string, photoId: string) => {
    setSending(true);
    // Copy photo to attachments bucket for chat using signed URL
    const path = `${id}/${crypto.randomUUID()}-${photoId}.jpg`;
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from("photos")
      .createSignedUrl(photoPath, 60);
    if (signError || !signedUrlData?.signedUrl) {
      toast.error("Failed to get photo URL");
      setSending(false);
      return;
    }
    const resp = await fetch(signedUrlData.signedUrl);
    const blob = await resp.blob();
    const { error } = await supabase.storage
      .from("attachments")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }
    await sendMsg({
      attachment_path: path,
      attachment_type: "image/jpeg",
      attachment_name: `photo-${photoId}.jpg`,
      max_views: maxViews,
    });
    setSending(false);
    setShowAlbumPicker(false);
    setShowAttachMenu(false);
  };

  const incrementView = async (messageId: string) => {
    if (viewedMsgRef.current.has(messageId)) return;
    viewedMsgRef.current.add(messageId);
    await supabase.rpc("increment_message_view", { message_id: messageId });
    qc.invalidateQueries({ queryKey: ["messages", id] });
  };

  const openExpired = () => setExpNotice(true);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b bg-card p-3">
        <Button asChild size="icon" variant="ghost" className="shrink-0">
          <Link to="/messages" aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <Link
          to="/profile/$username"
          params={{ username: info.peer?.username ?? info.pid }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
            {info.photo && purls[info.photo] ? (
              <img src={purls[info.photo]} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center">{name[0]}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {info.peer?.is_online
                ? "Online"
                : info.peer?.last_seen_at
                  ? `Last seen ${new Date(info.peer.last_seen_at).toLocaleDateString()}`
                  : `Messages disappear after ${disappearLabel}`}
            </div>
          </div>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => call.start(info.pid, name, false)}
          aria-label="Voice call"
        >
          <Phone />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => call.start(info.pid, name, true)}
          aria-label="Video call"
        >
          <Video />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-full"
              aria-label="More options"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/profile/$username" params={{ username: info.peer?.username ?? info.pid }}>
                <User className="h-4 w-4 mr-2" /> View profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Clock className="h-4 w-4 mr-2" /> Disappearing messages
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DISAPPEAR_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.value} onClick={() => setChatTimer(o.value)}>
                    {o.label}
                    {disappearSeconds === o.value && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => setNotificationsEnabled(!notificationsEnabled)}>
              {notificationsEnabled ? (
                <EyeOff className="h-4 w-4 mr-2" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              {notificationsEnabled ? "Mute this chat" : "Unmute this chat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openExpired}>
              <ShieldCheck className="h-4 w-4 mr-2" /> Chat privacy info
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setReportOpen(true);
                setReportTargetId(info.pid);
                setReportTargetName(name);
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
                    .eq("id", id)
                    .then(() => {
                      toast.success("Unmatched");
                      qc.invalidateQueries({ queryKey: ["inbox"] });
                      qc.invalidateQueries({ queryKey: ["connections"] });
                      void navigate({ to: "/connections" });
                    });
                }
              }}
            >
              <UserX className="h-4 w-4 mr-2 text-destructive" /> Unmatch
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Dialog open={expNotice} onOpenChange={setExpNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disappearing messages</DialogTitle>
          </DialogHeader>
          <p className="text-sm mb-4">
            All messages in this chat are end-to-end encrypted and are permanently deleted{" "}
            <strong>after {disappearLabel}</strong>, from both the app and our database. Nothing is
            visible after {disappearLabel}.
          </p>
          <ShieldCheck className="h-4 w-4 text-primary mr-1" />
          <span className="text-sm text-muted-foreground">End-to-end encrypted</span>
          <Button className="mt-4 w-full" onClick={() => setExpNotice(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>

      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-4">
        {!msgs?.length && (
          <p className="py-10 text-center text-muted-foreground">Say hi to {name} 👋</p>
        )}
        {expired.length > 0 && (
          <div className="mb-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-[11px] text-destructive text-center">
            {expired.length} message{expired.length !== 1 ? "s" : ""} expired and were deleted (
            {disappearLabel} limit).
          </div>
        )}
        {msgs?.map((m) => {
          const mine = m.sender === uid;
          const isExpired = m.expires_at && new Date(m.expires_at).getTime() < now;
          const isShortTimer =
            m.expires_at &&
            new Date(m.expires_at).getTime() - new Date(m.created_at).getTime() < 60 * 1000;
          const isExpiredAndHidden = isExpired && isShortTimer;
          const isViewLimited =
            m.max_views !== null &&
            m.max_views !== undefined &&
            m.view_count !== undefined &&
            m.view_count >= m.max_views;
          const isUnsent = m.unsent === true;
          const url = m.attachment_path ? aurls[m.attachment_path] : undefined;
          const isImage = m.attachment_type?.startsWith("image/");
          const isVideo = m.attachment_type?.startsWith("video/");

          // Don't render short-timer expired messages at all
          if (isExpiredAndHidden) return null;

          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`group max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-soft ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card"} ${(isExpired && !isShortTimer) || isViewLimited ? "opacity-40" : ""} ${isUnsent ? "bg-muted" : ""}`}
              >
                {isUnsent ? (
                  <div className="flex items-center gap-2 text-xs opacity-60">
                    <RotateCcw className="h-3 w-3" />
                    <span>Message unsent</span>
                  </div>
                ) : (
                  <>
                    {m.attachment_path && (
                      <>
                        {isImage ? (
                          url ? (
                            <div
                              onClick={() => {
                                if (!mine) incrementView(m.id);
                                // Collect all images in chat for PhotoViewer navigation
                                const imageMsgs = (msgs ?? []).filter(
                                  (msg) =>
                                    msg.attachment_type?.startsWith("image/") &&
                                    msg.attachment_path &&
                                    aurls[msg.attachment_path],
                                );
                                setPhotoViewerPhotos(
                                  imageMsgs.map((msg) => ({
                                    id: msg.id,
                                    path: msg.attachment_path,
                                    attachment_type: msg.attachment_type,
                                  })),
                                );
                                const idx = imageMsgs.findIndex((msg) => msg.id === m.id);
                                setPhotoViewerIndex(idx >= 0 ? idx : 0);
                                setPhotoViewerOpen(true);
                              }}
                              className="cursor-pointer"
                            >
                              <img
                                src={url}
                                alt={m.attachment_name ?? "image"}
                                className="mb-1 max-h-64 rounded-xl"
                              />
                            </div>
                          ) : (
                            <div className="h-32 w-48 animate-pulse rounded-xl bg-muted" />
                          )
                        ) : isVideo ? (
                          url && <video src={url} controls className="mb-1 max-h-64 rounded-xl" />
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-1 flex items-center gap-2 underline"
                          >
                            <FileText className="h-4 w-4" />
                            {m.attachment_name}
                          </a>
                        )}
                        {m.max_views !== null && m.max_views !== undefined && (
                          <div className="text-[10px] text-center opacity-70 mt-1">
                            {m.max_views === 1
                              ? "👁 One-time view"
                              : `👁 ${m.view_count ?? 0}/${m.max_views} views`}
                          </div>
                        )}
                      </>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[10px] opacity-70">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {mine && !isUnsent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[10px] opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                          onClick={() => unsendMessage(m.id)}
                          title="Unsend"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {isExpired && !isShortTimer && (
                      <div className="text-[10px] text-center opacity-60 mt-1">
                        Expired — deleted after {disappearLabel}
                      </div>
                    )}
                    {isViewLimited && (
                      <div className="text-[10px] text-center opacity-60 mt-1">
                        View limit reached
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {/* Attach Menu */}
      <Dialog open={showAttachMenu} onOpenChange={setShowAttachMenu}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Attach</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => fileRef.current?.click()}
                disabled={sending}
              >
                <Paperclip className="h-4 w-4 mr-2" /> Photo / Video from device
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={(e) => attach(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                Photos and messages disappear after 24 hours.
              </p>
            </div>
            <Separator />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                const allPhotos =
                  myAlbums?.flatMap((a) =>
                    a.photos.map((p) => ({ id: p.id, path: p.path, album_id: a.id })),
                  ) ?? [];
                setAlbumPhotos(allPhotos);
                setShowAlbumPicker(true);
                setShowAttachMenu(false);
              }}
              disabled={sending || !myAlbums?.some((a) => a.photos.length)}
            >
              <Image className="h-4 w-4 mr-2" /> Choose from my albums
            </Button>
            {myAlbums?.some((a) => a.photos.length) && (
              <p className="text-xs text-muted-foreground text-center">
                {myAlbums.reduce((sum, a) => sum + a.photos.length, 0)} photos in {myAlbums.length}{" "}
                album{myAlbums.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Album Picker */}
      <Dialog open={showAlbumPicker} onOpenChange={setShowAlbumPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Choose from your albums</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div className="mb-4 space-y-2">
              <Label>View limit for this photo</Label>
              <RadioGroup
                value={maxViews === null ? "unlimited" : maxViews.toString()}
                onValueChange={(v) => setMaxViews(v === "unlimited" ? null : parseInt(v))}
              >
                <div className="flex flex-wrap gap-2">
                  <RadioGroupItem
                    value="unlimited"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border bg-background"
                  >
                    <span>Unlimited</span>
                  </RadioGroupItem>
                  <RadioGroupItem
                    value="1"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border bg-background"
                  >
                    <Eye className="h-3 w-3" />
                    <span>1 view</span>
                  </RadioGroupItem>
                  <RadioGroupItem
                    value="2"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border bg-background"
                  >
                    <span>2 views</span>
                  </RadioGroupItem>
                  <RadioGroupItem
                    value="3"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border bg-background"
                  >
                    <span>3 views</span>
                  </RadioGroupItem>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                One-time view photos disappear after the recipient opens them once.
              </p>
            </div>
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-4">
                {myAlbums?.map(
                  (album) =>
                    album.photos.length > 0 && (
                      <div key={album.id} className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <span className="text-sm">{album.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({album.photos.length})
                          </span>
                        </h4>
                        <div className="grid grid-cols-4 gap-2">
                          {album.photos.map((p) => (
                            <Button
                              key={p.id}
                              variant="outline"
                              size="icon"
                              className="aspect-square p-0"
                              onClick={() => sendAlbumPhoto(p.path, p.id)}
                              disabled={sending}
                            >
                              {albumUrls[p.path] ? (
                                <img
                                  src={albumUrls[p.path]}
                                  alt=""
                                  className="h-full w-full object-cover rounded"
                                />
                              ) : (
                                <div className="h-full w-full animate-pulse rounded bg-muted" />
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ),
                )}
                {!myAlbums?.some((a) => a.photos.length) && (
                  <p className="text-center text-muted-foreground py-8">
                    No photos in your albums yet. Add some in your Profile.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <form onSubmit={submit} className="flex items-center gap-2 border-t bg-card p-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setShowAttachMenu(true)}
            disabled={sending}
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          maxLength={4000}
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>

      <PhotoViewer
        isOpen={photoViewerOpen}
        onClose={() => setPhotoViewerOpen(false)}
        photos={photoViewerPhotos ?? []}
        initialIndex={photoViewerIndex}
        urls={aurls}
        currentUserId={uid}
        isOwner={false}
      />
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
                  onChange={(e) => {
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
                  }}
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
              onClick={async () => {
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
                  if (blockAfterReport) {
                    void navigate({ to: "/connections" });
                  }
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  toast.error(message ?? "Failed to submit report");
                } finally {
                  setReporting(false);
                }
              }}
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
