import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";

// Live online presence via Supabase Realtime Presence.
//
// This replaces the old DB-column approach (profiles.is_online / last_seen_at)
// which never worked: authenticated users aren't granted UPDATE on those
// columns, so the writes silently failed and everyone always showed "offline".
//
// Presence needs no schema change. Each client joins one shared channel and
// tracks its presence; everyone can then read who is currently online.

type PresenceCtx = {
  onlineIds: Set<string>;
  isOnline: (id: string) => boolean;
};

const PresenceContext = createContext<PresenceCtx>({
  onlineIds: new Set(),
  isOnline: () => false,
});

export const usePresence = () => useContext(PresenceContext);

const PRESENCE_CHANNEL = "gender-online-presence";

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) return;

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: uid } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setOnlineIds(new Set(Object.keys(state)));
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Announce presence. Re-track when the tab becomes visible again so a
        // backgrounded tab that got suspended rejoins cleanly.
        void channel.track({ user_id: uid, online_at: new Date().toISOString() });
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void channel.track({ user_id: uid, online_at: new Date().toISOString() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [uid]);

  const value = useMemo<PresenceCtx>(
    () => ({ onlineIds, isOnline: (id: string) => onlineIds.has(id) }),
    [onlineIds],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
