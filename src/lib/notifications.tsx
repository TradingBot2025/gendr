"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { toast } from "sonner";
import { Bell, X, MessageCircle, UserPlus, ExternalLink } from "lucide-react";

interface Notification {
  id: string;
  type: "message" | "connection_request" | "connection_accepted";
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  avatar?: string;
  senderName?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [channels, setChannels] = useState<any[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  useEffect(() => {
    if (!uid) return;

    const messageChannel = supabase
      .channel("messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `connection_id=in.(select id from connections where requester='${uid}' or addressee='${uid}')`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender === uid) return; // Don't notify for own messages

          // Get sender info
          const { data: sender } = await supabase
            .from("profiles")
            .select("display_name, photos(path)")
            .eq("id", newMsg.sender)
            .maybeSingle();

          const photoPath = sender?.photos?.[0]?.path;
          const { data: signedUrl } = photoPath ? await supabase.storage.from("photos").createSignedUrl(photoPath, 3600) : { data: null };

          setNotifications((prev) => [
            {
              id: `msg-${newMsg.id}`,
              type: "message",
              title: sender?.display_name ?? "New message",
              body: newMsg.body ?? (newMsg.attachment_path ? "📎 Attachment" : "New message"),
              timestamp: new Date(),
              read: false,
              actionUrl: `/chat/${newMsg.connection_id}`,
              actionLabel: "Open chat",
              avatar: signedUrl?.signedUrl,
              senderName: sender?.display_name,
            },
            ...prev.slice(0, 49), // Keep last 50
          ]);

          toast.success(`${sender?.display_name ?? "Someone"}: ${newMsg.body ?? "📎 Attachment"}`, {
            action: {
              label: "Open",
              onClick: () => { window.location.href = `/chat/${newMsg.connection_id}`; },
            },
            duration: 10000,
          });
        }
      )
      .subscribe();

    const connectionChannel = supabase
      .channel("connections_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `addressee=eq.${uid}`,
        },
        async (payload) => {
          const conn = payload.new as any;
          if (!conn) return;

          const { data: requester } = await supabase
            .from("profiles")
            .select("display_name, photos(path)")
            .eq("id", conn.requester)
            .maybeSingle();

          const photoPath = requester?.photos?.[0]?.path;
          const { data: signedUrl } = photoPath ? await supabase.storage.from("photos").createSignedUrl(photoPath, 3600) : { data: null };

          if (payload.eventType === "INSERT" || (payload.eventType === "UPDATE" && conn.status === "pending")) {
            setNotifications((prev) => [
              {
                id: `conn-req-${conn.id}`,
                type: "connection_request",
                title: "New connection request",
                body: `${requester?.display_name ?? "Someone"} wants to connect`,
                timestamp: new Date(),
                read: false,
                actionUrl: "/connections",
                actionLabel: "View requests",
                avatar: signedUrl?.signedUrl,
                senderName: requester?.display_name,
              },
              ...prev.slice(0, 49),
            ]);

            toast.info(`${requester?.display_name ?? "Someone"} wants to connect`, {
              action: {
                label: "View",
                onClick: () => { window.location.href = "/connections"; },
              },
              duration: 10000,
            });
          } else if (payload.eventType === "UPDATE" && conn.status === "accepted") {
            setNotifications((prev) => [
              {
                id: `conn-acc-${conn.id}`,
                type: "connection_accepted",
                title: "Connection accepted!",
                body: `${requester?.display_name ?? "Someone"} accepted your request`,
                timestamp: new Date(),
                read: false,
                actionUrl: `/chat/${conn.id}`,
                actionLabel: "Start chat",
                avatar: signedUrl?.signedUrl,
                senderName: requester?.display_name,
              },
              ...prev.slice(0, 49),
            ]);

            toast.success(`${requester?.display_name ?? "Someone"} accepted your connection!`, {
              action: {
                label: "Chat",
                onClick: () => { window.location.href = `/chat/${conn.id}`; },
              },
              duration: 10000,
            });
          }
        }
      )
      .subscribe();

    setChannels([messageChannel, connectionChannel]);

    return () => {
      messageChannel.unsubscribe();
      connectionChannel.unsubscribe();
    };
  }, [uid]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, removeNotification }}>
      {children}
      <NotificationBell />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}

function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } = useNotifications();
  const [open, setOpen] = useState(false);

  if (notifications.length === 0 && unreadCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={`relative p-3 rounded-full bg-card shadow-lg border transition-all ${unreadCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute bottom-14 right-0 w-80 md:w-96 bg-card border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-semibold">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                <ul className="divide-y">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`p-3 hover:bg-accent transition-colors ${!n.read ? "bg-accent/30" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {n.avatar && (
                          <img src={n.avatar} alt={n.senderName ?? ""} className="h-10 w-10 rounded-full object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${!n.read ? "font-semibold" : ""}`}>{n.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{n.body}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {n.actionUrl && (
                            <a
                              href={n.actionUrl}
                              onClick={() => { markAsRead(n.id); setOpen(false); }}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                            >
                              {n.actionLabel}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}