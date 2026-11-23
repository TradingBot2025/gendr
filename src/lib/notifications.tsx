import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
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

  // Keep online status up to date
  useEffect(() => {
    if (!uid) return;
    const update = () => {
      void supabase
        .from("profiles")
        .update({ is_online: !document.hidden, last_seen_at: new Date().toISOString() })
        .eq("id", uid);
    };
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    const handleUnload = () => {
      void supabase.from("profiles").update({ is_online: false }).eq("id", uid);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [uid]);

  // Real-time notifications via Postgres changes
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
          if (path === `/chat/${connId}`) return; // already in that chat

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

          setNotifications((prev) => [
            {
              id: `msg-${message["id"]}`,
              type: "message",
              title: senderName,
              body,
              timestamp: new Date(),
              read: false,
              actionUrl: `/chat/${connId}`,
              actionLabel: "Open chat",
              senderName,
            },
            ...prev.slice(0, 49),
          ]);

          toast(senderName, {
            description: body,
            action: {
              label: "Open",
              onClick: () => void navigate({ to: "/chat/$id", params: { id: connId } }),
            },
            duration: 8000,
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
            toast("New match request", {
              action: { label: "View", onClick: () => void navigate({ to: "/connections" }) },
            });
            setNotifications((prev) => [
              {
                id: `conn-req-${connection["id"]}`,
                type: "connection_request",
                title: "New connection request",
                body: "Someone wants to connect with you",
                timestamp: new Date(),
                read: false,
                actionUrl: "/connections",
                actionLabel: "View requests",
              },
              ...prev.slice(0, 49),
            ]);
          }
          if (
            eventType === "UPDATE" &&
            connection["requester"] === uid &&
            connection["status"] === "accepted"
          ) {
            const connId = String(connection["id"]);
            toast.success("It's a match!", {
              action: {
                label: "Chat",
                onClick: () => void navigate({ to: "/chat/$id", params: { id: connId } }),
              },
            });
            setNotifications((prev) => [
              {
                id: `conn-acc-${connId}`,
                type: "connection_accepted",
                title: "It's a match!",
                body: "Your connection request was accepted",
                timestamp: new Date(),
                read: false,
                actionUrl: `/chat/${connId}`,
                actionLabel: "Start chat",
              },
              ...prev.slice(0, 49),
            ]);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "album_access_requests" },
        ({ new: request, eventType }) => {
          void qc.invalidateQueries({ queryKey: ["album-access"] });
          void qc.invalidateQueries({ queryKey: ["profile-view"] });
          if (eventType === "INSERT" && request["requester_id"] !== uid) {
            toast("Private album access requested", {
              action: { label: "Review", onClick: () => void navigate({ to: "/albums" }) },
            });
          }
          if (
            eventType === "UPDATE" &&
            request["requester_id"] === uid &&
            request["status"] === "approved"
          ) {
            toast.success("Private album access approved!");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, path, qc, navigate]);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, notifications, markAsRead, markAllAsRead, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
