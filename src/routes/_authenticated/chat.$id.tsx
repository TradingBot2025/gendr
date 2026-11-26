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
  Copy,
  User,
  Flag,
  UserX,
  Loader2,
  Check,
  X,
  Trash2,
  Menu,
  Layout,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, useMyAlbumsWithPhotos, blockUser, type Message } from "@/lib/data";
import { sendPushToUser } from "@/lib/push.functions";

import { usePresence } from "@/lib/presence";
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

const DISAPPEAR_OPTIONS = [
  { value: 10, label: "10 seconds" },
  { value: 60, label: "1 minute" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
];

// Renders a timed photo (10s/15s) with a live countdown. Once the countdown
// reaches zero the image is replaced by a "Photo expired" placeholder and is
// never shown again for the lifetime of this component.
function TimedImageView({ url, expiresAtMs }: { url: string; expiresAtMs: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [expiresAtMs]);

  if (remaining <= 0) {
    return (
      <div className="flex h-40 w-52 flex-col items-center justify-center gap-1 rounded-xl bg-muted text-xs text-muted-foreground">
        <EyeOff className="h-5 w-5" />
        <span>Photo expired</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <img src={url} alt="timed photo" className="mb-1 max-h-64 rounded-xl" />
      <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
        {remaining}s
      </div>
    </div>
  );
}

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

      { property: "og:title", content: "Chat — Gender" },
      {
        property: "og:description",
        content: "Chat, share and call your match. Set a disappearing timer for messages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});

function Chat() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const call = useCall();
  const presence = usePresence();
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
  // Pending attachment (file or album photo) awaiting view-mode selection
  const [pendingAttachment, setPendingAttachment] = useState<{
    file?: File;
    albumPath?: string;
    albumPhotoId?: string;
  } | null>(null);
  const [showViewModeDialog, setShowViewModeDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"normal" | "once" | "10s" | "15s">("normal");
  // Message IDs of special (view-once / timed) photos the recipient has opened
  // in this session. Used to swap the blurred "Tap to view" placeholder for the
  // actual image immediately, without waiting for the view-count refetch.
  const [openedSpecial, setOpenedSpecial] = useState<Set<string>>(new Set());
  // Text message IDs the recipient has opened — used so text doesn't expire
  // unless the message has been opened.
  const [openedTextMsgIds, setOpenedTextMsgIds] = useState<Set<string>>(new Set());
  // Timestamps (ms) when each message was first opened — used so the countdown
  // timer for timed media starts at open time, not at send time.
  const openedAtMsRef = useRef<Map<string, number>>(new Map());
  // Slide-to-delete state
  const [swipedMsgId, setSwipedMsgId] = useState<string | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Long-press state
  const [longPressMsgId, setLongPressMsgId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressMenu, setLongPressMenu] = useState<{
    x: number;
    y: number;
    msg: Message;
  } | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<Array<{
    id: string;
    path: string;
    attachment_type: string | null;
    album_id: string | null;
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

  // Real-time updates: when a new message (or a read/unsend update) lands for
  // THIS conversation, refetch immediately so it appears instantly instead of
  // waiting up to 2.5s for the poll. The 2.5s poll above stays as a fallback for
  // when Realtime isn't available. Also keeps the inbox unread badges fresh.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`chat-messages-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `connection_id=eq.${id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["messages", id] });
          void qc.invalidateQueries({ queryKey: ["inbox"] });
          void qc.invalidateQueries({ queryKey: ["unread-messages"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, qc]);

  // Mark incoming messages as read while this chat is open (and whenever new ones
  // arrive). Direct UPDATE on messages is revoked (REVOKE UPDATE ... FROM
  // authenticated), so we must go through the SECURITY DEFINER mark_chat_read RPC —
  // otherwise the browser gets "permission denied for table messages".
  useEffect(() => {
    if (!id || !uid || !msgs || msgs.length === 0) return;
    const hasUnread = msgs.some((m) => m.sender !== uid && !m.read_at);
    if (!hasUnread) return;
    supabase.rpc("mark_chat_read", { _connection_id: id }).then(({ error }) => {
      if (!error) qc.invalidateQueries({ queryKey: ["inbox"] });
    });
  }, [msgs, id, uid, qc]);

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

  // View count for limited-view / timed photos is incremented only when the
  // recipient explicitly taps "Tap to view" (see handleOpenSpecial below),
  // not merely by scrolling into view.

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
  const peerOnline = presence.isOnline(info.pid);
  // Calling unlocks once the conversation has actually started — i.e. BOTH
  // people have sent at least one (non-unsent) message. Until the other side
  // replies, the call buttons stay disabled. Once unlocked, they keep working.
  const convoStarted = (() => {
    if (!msgs || !uid) return false;
    let mine = false;
    let theirs = false;
    for (const m of msgs) {
      if (m.unsent) continue;
      if (m.sender === uid) mine = true;
      else theirs = true;
    }
    return mine && theirs;
  })();
  const disappearSeconds = info.disappearSeconds ?? 86400;
  const disappearLabel = formatDisappear(disappearSeconds) ?? "24 hours";

  const now = Date.now();

  const sendMsg = async (fields: {
    body?: string;
    attachment_path?: string;
    attachment_type?: string;
    attachment_name?: string;
    max_views?: number | null;
    _expiresAt?: string;
  }) => {
    // All messages follow one rule: disappear after 24 hours, unless an override is provided
    // (for timed photos: 10s or 15s after sending).
    const expiresAt = fields._expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { _expiresAt, ...rest } = fields;
    const { error } = await supabase.from("messages").insert({
      connection_id: id,
      sender: uid,
      expires_at: expiresAt,
      max_views: fields.max_views ?? null,
      view_count: 0,
      ...rest,
    });
    if (error) toast.error(error.message);
    else {
      // Notify the recipient even if their app is fully closed (Web Push). The
      // server function no-ops if push isn't configured on this deployment, and
      // is best-effort: never block sending a message on it.
      const preview = fields.body?.trim()
        ? fields.body.trim().slice(0, 120)
        : fields.attachment_type === "image"
          ? "Sent a photo"
          : "Sent an attachment";
      void sendPushToUser({
        data: {
          to: info.pid,
          title: me?.profile?.display_name || "New message",
          body: preview,
          url: `/chat/${id}`,
          tag: `msg-${id}`,
        },
      }).catch(() => {});
    }
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
    // Direct UPDATE/DELETE on messages is not granted; unsend goes through the
    // SECURITY DEFINER unsend_message RPC (sets unsent=true, clears the body).
    const { error } = await supabase.rpc("unsend_message", { _message_id: messageId });
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
    setPendingAttachment({ file: f });
    setViewMode("normal");
    setShowViewModeDialog(true);
    setShowAttachMenu(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const sendAlbumPhoto = async (photoPath: string, photoId: string) => {
    setPendingAttachment({ albumPath: photoPath, albumPhotoId: photoId });
    setViewMode("normal");
    setShowViewModeDialog(true);
    setShowAlbumPicker(false);
  };

  const confirmSendAttachment = async () => {
    if (!pendingAttachment) return;
    setSending(true);
    setShowViewModeDialog(false);

    // Determine max_views and expires_at based on view mode
    let maxViewsForSend: number | null = null;
    let expiresAtOverride: string | null = null;
    if (viewMode === "once") maxViewsForSend = 1;
    else if (viewMode === "10s") {
      maxViewsForSend = 1;
      expiresAtOverride = new Date(Date.now() + 10 * 1000).toISOString();
    } else if (viewMode === "15s") {
      maxViewsForSend = 1;
      expiresAtOverride = new Date(Date.now() + 15 * 1000).toISOString();
    } else {
      // Normal: apply the chosen view limit (unlimited = null, or 1/2/3)
      maxViewsForSend = maxViews;
    }

    if (pendingAttachment.file) {
      const f = pendingAttachment.file;
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
          max_views: maxViewsForSend,
          ...(expiresAtOverride ? { _expiresAt: expiresAtOverride } : {}),
        });
    } else if (pendingAttachment.albumPath && pendingAttachment.albumPhotoId) {
      const photoPath = pendingAttachment.albumPath;
      const photoId = pendingAttachment.albumPhotoId;
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
        max_views: maxViewsForSend,
        ...(expiresAtOverride ? { _expiresAt: expiresAtOverride } : {}),
      });
    }
    setSending(false);
    setPendingAttachment(null);
    setViewMode("normal");
    setMaxViews(null);
  };

  const incrementView = async (messageId: string) => {
    if (viewedMsgRef.current.has(messageId)) return;
    viewedMsgRef.current.add(messageId);
    await supabase.rpc("increment_message_view", { message_id: messageId });
    qc.invalidateQueries({ queryKey: ["messages", id] });
  };

  // Recipient taps a view-once / timed / view-limited photo.
  const handleOpenSpecial = (m: Message) => {
    if (!m.attachment_path) return;
    // Count this view (once per session per message).
    if (!mine(m)) void incrementView(m.id);
    // Reveal immediately.
    setOpenedSpecial((prev) => {
      const next = new Set(prev);
      next.add(m.id);
      return next;
    });
    // Non-timed special photos also open in the full-screen viewer.
    const timed =
      m.expires_at &&
      new Date(m.expires_at).getTime() - new Date(m.created_at).getTime() < 60 * 1000;
    if (!timed) {
      const imageMsgs = (msgs ?? []).filter(
        (msg): msg is Message & { attachment_path: string } =>
          !!(
            msg.attachment_type?.startsWith("image/") &&
            msg.attachment_path &&
            aurls[msg.attachment_path]
          ),
      );
      setPhotoViewerPhotos(
        imageMsgs.map((msg) => ({
          id: msg.id,
          path: msg.attachment_path,
          attachment_type: msg.attachment_type,
          album_id: null,
        })),
      );
      const idx = imageMsgs.findIndex((msg) => msg.id === m.id);
      setPhotoViewerIndex(idx >= 0 ? idx : 0);
      setPhotoViewerOpen(true);
    }
  };

  // Record when a message is first opened so the countdown timer starts at
  // open time rather than send time.
  const handleOpenMessage = (m: Message) => {
    if (!openedAtMsRef.current.has(m.id)) {
      openedAtMsRef.current.set(m.id, Date.now());
    }
    if (m.body && !mine(m)) {
      // Mark text messages as opened so the expiry logic can use open time.
      setOpenedTextMsgIds((prev) => {
        const next = new Set(prev);
        next.add(m.id);
        return next;
      });
    }
  };

  // --- Slide-to-delete ---
  const handleSwipeStart = (e: React.TouchEvent, msgId: string) => {
    if (!mineFromMsg(e.currentTarget as Element, msgs, msgId)) return;
    const touch = e.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSwipeMove = (e: React.TouchEvent, msgId: string) => {
    const touch = e.touches[0];
    if (!swipeStartRef.current || !touch) return;
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    // Only trigger horizontal swipe on sender's own messages
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      setSwipedMsgId(msgId);
    }
  };

  const handleSwipeEnd = () => {
    swipeStartRef.current = null;
  };

  // --- Long press ---
  const handleLongPressStart = (e: React.PointerEvent, msg: Message) => {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressMenu({
        x: e.clientX,
        y: e.clientY,
        msg,
      });
      setLongPressMsgId(msg.id);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLongPressMenuAction = (action: "profile" | "albums" | "photos") => {
    if (!longPressMenu) return;
    const { msg } = longPressMenu;
    setLongPressMenu(null);
    setLongPressMsgId(null);
    if (action === "profile") {
      navigate({ to: "/profile/$username", params: { username: msg.sender } });
    } else if (action === "albums") {
      navigate({ to: "/albums" });
    } else if (action === "photos") {
      // Open photo viewer for this message's attachment if it's an image
      if (msg.attachment_path && msg.attachment_type?.startsWith("image/")) {
        setPhotoViewerPhotos([
          {
            id: msg.id,
            path: msg.attachment_path,
            attachment_type: msg.attachment_type,
            album_id: null,
          },
        ]);
        setPhotoViewerIndex(0);
        setPhotoViewerOpen(true);
      }
    }
  };

  // Unsend (delete) the swiped message
  const handleDeleteSwiped = async () => {
    if (!swipedMsgId) return;
    await unsendMessage(swipedMsgId);
    setSwipedMsgId(null);
  };

  const mineFromMsg = (
    el: Element | null,
    messages: Message[] | undefined,
    msgId: string,
  ): boolean => {
    if (!messages || !el) return false;
    const m = messages.find((msg) => msg.id === msgId);
    return m ? m.sender === uid : false;
  };

  const mine = (m: Message) => m.sender === uid;

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
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
            {info.photo && purls[info.photo] ? (
              <img src={purls[info.photo]} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center">{name[0]}</span>
            )}
            <span
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                peerOnline ? "bg-green-500" : "bg-red-500"
              }`}
              aria-label={peerOnline ? "Online" : "Offline"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {peerOnline ? "Online" : "Offline"}
            </div>
          </div>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => call.start(info.pid, name, false)}
          disabled={!convoStarted}
          aria-label="Voice call"
          title={convoStarted ? "Voice call" : "Start chatting first to unlock calls"}
        >
          <Phone />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => call.start(info.pid, name, true)}
          disabled={!convoStarted}
          aria-label="Video call"
          title={convoStarted ? "Video call" : "Start chatting first to unlock calls"}
        >
          <Video />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              aria-label="Disappearing messages"
            >
              <Clock className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Disappearing messages
            </div>
            {DISAPPEAR_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.value} onClick={() => setChatTimer(o.value)}>
                {o.label}
                {disappearSeconds === o.value && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
            <DropdownMenuItem
              onClick={() => {
                if (confirm("Block this user? They won't be able to message or call you.")) {
                  blockUser(info.pid)
                    .then(() => {
                      toast.success("User blocked");
                      qc.invalidateQueries({ queryKey: ["inbox"] });
                      qc.invalidateQueries({ queryKey: ["blocked-contacts"] });
                      void navigate({ to: "/connections" });
                    })
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Couldn't block user"),
                    );
                }
              }}
            >
              <UserX className="h-4 w-4 mr-2 text-destructive" /> Block
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
        <div className="mx-auto mb-2 w-fit rounded-full bg-card px-3 py-1 text-center text-[11px] text-muted-foreground shadow-soft">
          <Clock className="mr-1 inline h-3 w-3" />
          Messages disappear after {disappearLabel}
        </div>
        {!msgs?.length && (
          <p className="py-10 text-center text-muted-foreground">Say hi to {name} 👋</p>
        )}
        {msgs?.map((m) => {
          const mine = m.sender === uid;
          const openedAtMs = openedAtMsRef.current.get(m.id);
          const timerStartMs = openedAtMs ?? new Date(m.created_at).getTime();
          const isExpired = !!(m.expires_at && new Date(m.expires_at).getTime() < now);
          const isShortTimer = !!(
            m.expires_at && new Date(m.expires_at).getTime() - timerStartMs < 60 * 1000
          );
          const isExpiredAndHidden = isExpired && isShortTimer;
          const isViewLimited =
            m.max_views !== null &&
            m.max_views !== undefined &&
            m.view_count !== undefined &&
            m.view_count >= m.max_views;
          const isUnsent = m.unsent === true;
          const url = m.attachment_path ? aurls[m.attachment_path] : undefined;
          const isImage = !!m.attachment_type?.startsWith("image/");
          const isVideo = !!m.attachment_type?.startsWith("video/");

          // Special = view-once / timed / view-limited photo
          const isSpecial =
            isImage && m.max_views !== null && m.max_views !== undefined && m.max_views > 0;
          const isTimed = !!(isShortTimer && m.expires_at);
          const spanSec = m.expires_at
            ? Math.round((new Date(m.expires_at).getTime() - timerStartMs) / 1000)
            : 0;
          const opened = openedSpecial.has(m.id);
          const textOpened = openedTextMsgIds.has(m.id);
          const viewed = (m.view_count ?? 0) > 0;
          const exhausted = isViewLimited;
          const timedExpired = isTimed && isExpired;
          const specialHidden = isSpecial && (exhausted || timedExpired);
          const showTapToView = isSpecial && !mine && !viewed && !opened && !specialHidden;

          // Badge text shown on the bubble (e.g. "1x", "2x", "10s")
          let specialBadge: string | null = null;
          if (isSpecial) {
            if (isTimed) specialBadge = `${Math.max(spanSec, 0) || 10}s`;
            else if (m.max_views === 1) specialBadge = "1x";
            else specialBadge = `${m.max_views}x`;
          }

          // Don't render short-timer expired messages at all
          if (isExpiredAndHidden) return null;

          // Text messages should not disappear unless opened AND expired.
          const isTextExpired = m.body && textOpened && isExpired && !isShortTimer;

          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
              onTouchStart={(e) => handleSwipeStart(e, m.id)}
              onTouchMove={(e) => handleSwipeMove(e, m.id)}
              onTouchEnd={handleSwipeEnd}
              onPointerDown={(e) => handleLongPressStart(e, m)}
              onPointerUp={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
            >
              <div
                className={`group max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                  mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-card"
                } ${isExpired && !isShortTimer ? "opacity-60" : ""} ${
                  isUnsent ? "bg-muted" : ""
                } ${swipedMsgId === m.id ? "translate-x-[-60px]" : ""} relative`}
              >
                {swipedMsgId === m.id && mine && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-destructive">
                    <Trash2 className="h-5 w-5" />
                  </div>
                )}
                {isUnsent ? (
                  <div className="flex items-center gap-2 text-xs opacity-60">
                    <RotateCcw className="h-3 w-3" />
                    <span>This message was unsent</span>
                  </div>
                ) : (
                  <>
                    {m.attachment_path && (
                      <>
                        {isImage ? (
                          specialHidden ? (
                            <div className="flex h-40 w-52 flex-col items-center justify-center gap-1 rounded-xl bg-muted text-xs text-muted-foreground">
                              <EyeOff className="h-5 w-5" />
                              <span>Photo expired</span>
                            </div>
                          ) : showTapToView ? (
                            <button
                              type="button"
                              onClick={() => handleOpenSpecial(m)}
                              className="relative h-40 w-52 overflow-hidden rounded-xl bg-muted"
                              aria-label="Tap to view photo"
                            >
                              {url && (
                                <img
                                  src={url}
                                  alt="hidden"
                                  className="h-full w-full scale-110 object-cover blur-xl"
                                />
                              )}
                              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white">
                                <Eye className="h-6 w-6" />
                                <span className="text-xs font-medium">Tap to view</span>
                              </span>
                            </button>
                          ) : url ? (
                            isTimed && !mine && m.expires_at ? (
                              <TimedImageView
                                url={url}
                                expiresAtMs={
                                  openedAtMs
                                    ? new Date(openedAtMs).getTime() +
                                      (new Date(m.expires_at).getTime() -
                                        new Date(m.created_at).getTime())
                                    : new Date(m.expires_at).getTime()
                                }
                              />
                            ) : (
                              <div
                                onClick={() => {
                                  handleOpenMessage(m);
                                  if (isSpecial && !mine && !viewed) {
                                    handleOpenSpecial(m);
                                    return;
                                  }
                                  const imageMsgs = (msgs ?? []).filter(
                                    (msg): msg is Message & { attachment_path: string } =>
                                      !!(
                                        msg.attachment_type?.startsWith("image/") &&
                                        msg.attachment_path &&
                                        aurls[msg.attachment_path]
                                      ),
                                  );
                                  setPhotoViewerPhotos(
                                    imageMsgs.map((msg) => ({
                                      id: msg.id,
                                      path: msg.attachment_path,
                                      attachment_type: msg.attachment_type,
                                      album_id: null,
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
                            )
                          ) : (
                            <div className="h-32 w-48 animate-pulse rounded-xl bg-muted" />
                          )
                        ) : isVideo ? (
                          url && (
                            <div onClick={() => handleOpenMessage(m)} className="cursor-pointer">
                              <video src={url} controls className="mb-1 max-h-64 rounded-xl" />
                            </div>
                          )
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-1 flex items-center gap-2 underline"
                            onClick={() => handleOpenMessage(m)}
                          >
                            <FileText className="h-4 w-4" />
                            {m.attachment_name}
                          </a>
                        )}
                        {specialBadge && (
                          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-1.5 py-0.5 dark:bg-white/10">
                              <Eye className="h-3 w-3" />
                              {specialBadge}
                            </span>
                            {mine && <span>{viewed ? "Opened" : "Not opened"}</span>}
                            {!mine && !isTimed && m.max_views !== 1 && (
                              <span>
                                {m.view_count ?? 0}/{m.max_views} views
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {m.body && !isTextExpired && (
                      <>
                        <p
                          className="whitespace-pre-wrap break-words"
                          onClick={() => handleOpenMessage(m)}
                        >
                          {m.body}
                        </p>
                        {isExpired && !isShortTimer && textOpened && (
                          <div className="text-[10px] text-center opacity-60 mt-1">
                            Expired — deleted after {disappearLabel}
                          </div>
                        )}
                        {isExpired && !isShortTimer && !textOpened && (
                          <div className="text-[10px] text-center opacity-60 mt-1">
                            Message will expire after {disappearLabel} once opened
                          </div>
                        )}
                      </>
                    )}
                    {!m.body && isTextExpired && (
                      <div className="text-[10px] text-center opacity-60 mt-1">
                        Expired — deleted after {disappearLabel}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[10px] opacity-70">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {mine && !isUnsent && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                              title="Message options"
                              aria-label="Message options"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => {
                                if (m.body) {
                                  void navigator.clipboard?.writeText(m.body);
                                  toast.success("Copied");
                                } else {
                                  toast.error("Nothing to copy");
                                }
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" /> Copy
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => unsendMessage(m.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <RotateCcw className="h-4 w-4 mr-2" /> Unsend
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {isViewLimited && (
                      <div className="text-[10px] text-center opacity-60 mt-1">
                        View limit reached
                      </div>
                    )}
                  </>
                )}
                {longPressMenu?.msg.id === m.id && (
                  <div
                    className="absolute z-50 mt-2 w-56 rounded-xl border bg-card shadow-lg"
                    style={{
                      top: longPressMenu.y,
                      left: longPressMenu.x,
                    }}
                  >
                    <div className="px-2 py-1">
                      <DropdownMenuItem onClick={() => handleLongPressMenuAction("profile")}>
                        <User className="mr-2 h-4 w-4" /> View profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleLongPressMenuAction("albums")}>
                        <Layout className="mr-2 h-4 w-4" /> View albums
                      </DropdownMenuItem>
                      {m.attachment_path && m.attachment_type?.startsWith("image/") && (
                        <DropdownMenuItem onClick={() => handleLongPressMenuAction("photos")}>
                          <Image className="mr-2 h-4 w-4" /> View photo
                        </DropdownMenuItem>
                      )}
                    </div>
                  </div>
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

      {/* View Mode Dialog — shown after selecting a file or album photo */}
      <Dialog open={showViewModeDialog} onOpenChange={setShowViewModeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>How should it be seen?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 p-4">
            <Button
              variant={viewMode === "normal" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setViewMode("normal")}
            >
              Normal (no limit)
            </Button>
            <Button
              variant={viewMode === "once" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setViewMode("once")}
            >
              <Eye className="h-4 w-4 mr-2" /> View once
            </Button>
            <Button
              variant={viewMode === "10s" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setViewMode("10s")}
            >
              <Clock className="h-4 w-4 mr-2" /> View for 10 seconds
            </Button>
            <Button
              variant={viewMode === "15s" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setViewMode("15s")}
            >
              <Clock className="h-4 w-4 mr-2" /> View for 15 seconds
            </Button>
            {viewMode === "normal" && (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <Label className="text-xs">View limit</Label>
                <RadioGroup
                  value={maxViews === null ? "unlimited" : maxViews.toString()}
                  onValueChange={(v) => setMaxViews(v === "unlimited" ? null : parseInt(v))}
                >
                  <div className="flex flex-wrap gap-2">
                    <RadioGroupItem
                      value="unlimited"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-background text-sm"
                    >
                      <span>Unlimited</span>
                    </RadioGroupItem>
                    <RadioGroupItem
                      value="1"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-background text-sm"
                    >
                      <Eye className="h-3 w-3" />
                      <span>1 view</span>
                    </RadioGroupItem>
                    <RadioGroupItem
                      value="2"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-background text-sm"
                    >
                      <span>2 views</span>
                    </RadioGroupItem>
                    <RadioGroupItem
                      value="3"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-background text-sm"
                    >
                      <span>3 views</span>
                    </RadioGroupItem>
                  </div>
                </RadioGroup>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {viewMode === "normal"
                ? "This photo stays visible until it expires after 24 hours."
                : viewMode === "once"
                  ? "The recipient can view this photo once, then it expires."
                  : viewMode === "10s"
                    ? "The recipient has 10 seconds to view this photo."
                    : "The recipient has 15 seconds to view this photo."}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowViewModeDialog(false);
                  setPendingAttachment(null);
                }}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={confirmSendAttachment} disabled={sending}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
            </div>
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
                if (!uid) return;
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
