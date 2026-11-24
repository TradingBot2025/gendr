import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { registerServiceWorker, showBackgroundNotification } from "@/lib/push";
import { toast } from "sonner";

export type NotificationType =
  "message" | "connection_request" | "connection_accepted" | "album_access";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  avatar?: string;
  senderName?: string;
}

interface NotificationCtx {
  unreadCount: number;
  notifications: AppNotification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationCtx>({
  unreadCount: 0,
  notifications: [],
  markAsRead: () => {},
  markAllAsRead: () => {},
  removeNotification: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Keep the latest path in a ref so the realtime/polling effects can read it
  // without re-subscribing on every navigation (which caused channel churn and
  // "real-time connection error / timed out" toasts on each page change).
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // Dedup across realtime AND polling so the same event never notifies twice
  // (in-app and background share this set).
  const notifiedIds = useRef<Set<string>>(new Set());

  // Per-source "seen" state used by the polling fallback so we never notify
  // about rows that already existed when the app loaded (the stale-notification
  // bug). These are primed on the first poll without emitting.
  const messageSeeded = useRef(false);
  const lastMessageId = useRef<string | null>(null);
  const connSeen = useRef<Set<string> | null>(null);
  const albumSeen = useRef<Set<string> | null>(null);

  // Register the service worker so background notifications and (when
  // configured) Web Push work.
  useEffect(() => {
    if (!uid) return;
    void registerServiceWorker();
  }, [uid]);

  // Count unread DB messages
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-messages", uid],
    enabled: !!uid,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!uid) return 0;
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .neq("sender", uid)
        .is("read_at", null)
        .eq("unsent", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Single funnel for every notification. Deduplicates by id, then:
  //  - adds it to the in-app list (both foreground and background), and
  //  - when the tab is visible shows an in-app toast, when hidden shows a native
  //    OS notification via the service worker (works while minimized).
  const emit = useCallback(
    (n: AppNotification) => {
      if (notifiedIds.current.has(n.id)) return;
      notifiedIds.current.add(n.id);

      setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 50));

      const visible = typeof document !== "undefined" && document.visibilityState === "visible";
      if (visible) {
        toast(n.title, {
          description: n.body,
          action: n.actionUrl
            ? {
                label: n.actionLabel ?? "Open",
                onClick: () => void navigate(n.actionUrl as string),
              }
            : undefined,
          duration: 8000,
        });
      } else {
        void showBackgroundNotification({
          title: n.title,
          body: n.body,
          url: n.actionUrl,
          tag: n.id,
        });
      }
    },
    [navigate],
  );

  // Real-time notifications via Postgres changes. Each handler funnels through
  // emit() so it benefits from the same dedup + background dispatch as polling.
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`app-alerts-${uid}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async ({ new: message }) => {
          if (message["sender"] === uid) return;
          void qc.invalidateQueries({ queryKey: ["unread-messages"] });
          void qc.invalidateQueries({ queryKey: ["messages"] });
          void qc.invalidateQueries({ queryKey: ["inbox"] });

          const connId = String(message["connection_id"]);
          if (pathRef.current === `/chat/${connId}`) return; // already in that chat

          const { data: sender } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", String(message["sender"]))
            .maybeSingle();
          const senderName = sender?.display_name ?? "Someone";
          const body = String(
            message["body"] ??
              (message["attachment_path"] ? "📎 Sent an attachment" : "New message"),
          );

          emit({
            id: `msg-${message["id"]}`,
            type: "message",
            title: senderName,
            body,
            timestamp: new Date(),
            read: false,
            actionUrl: `/chat/${connId}`,
            actionLabel: "Open chat",
            senderName,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        async ({ new: connection, eventType }) => {
          void qc.invalidateQueries({ queryKey: ["connections"] });
          void qc.invalidateQueries({ queryKey: ["discover"] });
          void qc.invalidateQueries({ queryKey: ["dashboard"] });

          if (eventType === "INSERT" && connection["addressee"] === uid) {
            emit({
              id: `conn-req-${connection["id"]}`,
              type: "connection_request",
              title: "New connection request",
              body: "Someone wants to connect with you",
              timestamp: new Date(),
              read: false,
              actionUrl: "/connections",
              actionLabel: "View requests",
            });
          }
          if (
            eventType === "UPDATE" &&
            connection["requester"] === uid &&
            connection["status"] === "accepted"
          ) {
            const connId = String(connection["id"]);
            emit({
              id: `conn-acc-${connId}`,
              type: "connection_accepted",
              title: "It's a match!",
              body: "Your connection request was accepted",
              timestamp: new Date(),
              read: false,
              actionUrl: `/chat/${connId}`,
              actionLabel: "Start chat",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "album_access_requests" },
        async ({ new: request, eventType }) => {
          void qc.invalidateQueries({ queryKey: ["album-access"] });
          void qc.invalidateQueries({ queryKey: ["profile-view"] });

          // Notify album owner when someone requests access
          if (eventType === "INSERT" && request["requester_id"] !== uid) {
            const { data: requester } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", String(request["requester_id"]))
              .maybeSingle();
            const requesterName = requester?.display_name ?? "Someone";
            const { data: album } = await supabase
              .from("photo_albums")
              .select("name")
              .eq("id", String(request["album_id"]))
              .maybeSingle();
            const albumName = album?.name ?? "Private album";

            emit({
              id: `album-req-${request["id"]}`,
              type: "album_access",
              title: `${requesterName} requested access`,
              body: `to "${albumName}"`,
              timestamp: new Date(),
              read: false,
              actionUrl: "/albums",
              actionLabel: "Review",
            });
          }
          // Notify requester when approved
          if (
            eventType === "UPDATE" &&
            request["requester_id"] === uid &&
            request["status"] === "approved"
          ) {
            const { data: album } = await supabase
              .from("photo_albums")
              .select("name")
              .eq("id", String(request["album_id"]))
              .maybeSingle();
            const albumName = album?.name ?? "Private album";

            emit({
              id: `album-acc-${request["id"]}`,
              type: "album_access",
              title: `Access approved`,
              body: `to "${albumName}"`,
              timestamp: new Date(),
              read: false,
              actionUrl: "/albums",
              actionLabel: "View album",
            });
          }
        },
      )
      .subscribe((status, err) => {
        // Realtime (postgres_changes) is a best-effort enhancement: the polling
        // loop below is a complete fallback, and calls use a separate broadcast
        // channel. Don't surface scary "connection error" toasts for transient
        // realtime hiccups — just log and let polling cover it.
        if (status === "CHANNEL_ERROR") {
          console.warn("[Realtime] channel error, using polling fallback:", err);
        } else if (status === "TIMED_OUT") {
          console.warn("[Realtime] timed out, using polling fallback:", err);
        } else if (status === "CLOSED") {
          console.log("[Realtime] Channel closed");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [uid, qc, emit]);

  // Polling fallback for when realtime is unavailable. Realtime is the primary
  // path; this is a safety net, so it runs less often to keep DB/client load low
  // (the previous 8s interval made the app feel sluggish). The first poll only
  // establishes a baseline — it never notifies about pre-existing rows (the
  // "old message notified on load" fix).
  useEffect(() => {
    if (!uid) return;
    let stopped = false;

    const poll = async () => {
      try {
        // --- Messages ---
        const { data: latestMsg } = await supabase
          .from("messages")
          .select("id, connection_id, sender, body, attachment_path, created_at")
          .neq("sender", uid)
          .eq("unsent", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg) {
          if (!messageSeeded.current) {
            messageSeeded.current = true;
            lastMessageId.current = latestMsg.id;
          } else if (latestMsg.id !== lastMessageId.current) {
            lastMessageId.current = latestMsg.id;
            const connId = String(latestMsg.connection_id);
            if (pathRef.current !== `/chat/${connId}`) {
              const { data: sender } = await supabase
                .from("profiles")
                .select("display_name")
                .eq("id", String(latestMsg.sender))
                .maybeSingle();
              const senderName = sender?.display_name ?? "Someone";
              const body = String(
                latestMsg.body ??
                  (latestMsg.attachment_path ? "📎 Sent an attachment" : "New message"),
              );
              emit({
                id: `msg-${latestMsg.id}`,
                type: "message",
                title: senderName,
                body,
                timestamp: new Date(latestMsg.created_at),
                read: false,
                actionUrl: `/chat/${connId}`,
                actionLabel: "Open chat",
                senderName,
              });
              void qc.invalidateQueries({ queryKey: ["unread-messages"] });
              void qc.invalidateQueries({ queryKey: ["inbox"] });
            }
          }
        }

        // --- Connections (requests + matches) ---
        const { data: conns } = await supabase
          .from("connections")
          .select("id, requester, addressee, status, created_at")
          .or(`requester.eq.${uid},addressee.eq.${uid}`)
          .order("created_at", { ascending: false })
          .limit(40);

        if (conns) {
          if (connSeen.current === null) {
            connSeen.current = new Set<string>();
            for (const c of conns) {
              // Seed only the states that already exist so we don't re-notify,
              // while leaving transitions (pending→accepted) detectable later.
              if (c.addressee === uid && c.status === "pending") {
                connSeen.current.add(`conn-req-${c.id}`);
              }
              if (c.requester === uid && c.status === "accepted") {
                connSeen.current.add(`conn-acc-${c.id}`);
              }
            }
          } else {
            let changed = false;
            for (const c of conns) {
              if (
                c.addressee === uid &&
                c.status === "pending" &&
                !connSeen.current.has(`conn-req-${c.id}`)
              ) {
                connSeen.current.add(`conn-req-${c.id}`);
                changed = true;
                emit({
                  id: `conn-req-${c.id}`,
                  type: "connection_request",
                  title: "New connection request",
                  body: "Someone wants to connect with you",
                  timestamp: new Date(c.created_at),
                  read: false,
                  actionUrl: "/connections",
                  actionLabel: "View requests",
                });
              }
              if (
                c.requester === uid &&
                c.status === "accepted" &&
                !connSeen.current.has(`conn-acc-${c.id}`)
              ) {
                connSeen.current.add(`conn-acc-${c.id}`);
                changed = true;
                emit({
                  id: `conn-acc-${c.id}`,
                  type: "connection_accepted",
                  title: "It's a match!",
                  body: "Your connection request was accepted",
                  timestamp: new Date(c.created_at),
                  read: false,
                  actionUrl: `/chat/${c.id}`,
                  actionLabel: "Start chat",
                });
              }
            }
            if (changed) {
              void qc.invalidateQueries({ queryKey: ["connections"] });
              void qc.invalidateQueries({ queryKey: ["discover"] });
              void qc.invalidateQueries({ queryKey: ["dashboard"] });
            }
          }
        }

        // --- Album access requests (owner side + requester approvals) ---
        const { data: albumReqs } = await supabase
          .from("album_access_requests")
          .select("id, album_id, requester_id, status, created_at");
        if (albumReqs && albumReqs.length) {
          const albumIds = Array.from(new Set(albumReqs.map((r) => r.album_id)));
          const { data: albumRows } = await supabase
            .from("photo_albums")
            .select("id, name")
            .in("id", albumIds);
          const albumNames = new Map<string, string>(
            (albumRows ?? []).map((a) => [a.id, a.name] as [string, string]),
          );
          const nameFor = (id: string) => albumNames.get(id) ?? "Private album";

          if (albumSeen.current === null) {
            albumSeen.current = new Set<string>();
            for (const r of albumReqs) {
              if (r.requester_id !== uid) {
                albumSeen.current.add(`album-req-${r.id}`);
              }
              if (r.requester_id === uid && r.status === "approved") {
                albumSeen.current.add(`album-acc-${r.id}`);
              }
            }
          } else {
            let changed = false;
            for (const r of albumReqs) {
              if (
                r.requester_id !== uid &&
                r.status === "pending" &&
                !albumSeen.current.has(`album-req-${r.id}`)
              ) {
                albumSeen.current.add(`album-req-${r.id}`);
                changed = true;
                emit({
                  id: `album-req-${r.id}`,
                  type: "album_access",
                  title: "New album access request",
                  body: `Someone requested access to "${nameFor(r.album_id)}"`,
                  timestamp: new Date(r.created_at),
                  read: false,
                  actionUrl: "/albums",
                  actionLabel: "Review",
                });
              }
              if (
                r.requester_id === uid &&
                r.status === "approved" &&
                !albumSeen.current.has(`album-acc-${r.id}`)
              ) {
                albumSeen.current.add(`album-acc-${r.id}`);
                changed = true;
                emit({
                  id: `album-acc-${r.id}`,
                  type: "album_access",
                  title: "Access approved",
                  body: `to "${nameFor(r.album_id)}"`,
                  timestamp: new Date(r.created_at),
                  read: false,
                  actionUrl: "/albums",
                  actionLabel: "View album",
                });
              }
            }
            if (changed) {
              void qc.invalidateQueries({ queryKey: ["album-access"] });
              void qc.invalidateQueries({ queryKey: ["profile-view"] });
            }
          }
        }
      } catch (err) {
        if (!stopped) console.error("[Polling] notification poll failed:", err);
      }
    };

    // Run once immediately to prime the baseline, then every 20s.
    void poll();
    const interval = setInterval(poll, 20000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [uid, qc, emit]);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, notifications, markAsRead, markAllAsRead, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
