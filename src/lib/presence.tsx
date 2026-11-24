import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";

// Live presence + call availability via Supabase Realtime Presence.
//
// This replaces the old DB-column approach (profiles.is_online / last_seen_at
// and profiles.voice_call_enabled / video_call_enabled) which never worked:
//   - authenticated users aren't granted UPDATE on those profile columns, so the
//     writes silently failed and everyone always showed "offline";
//   - the call-availability columns didn't exist in the live DB, causing
//     "Could not find ... column in schema cache" errors.
//
// Presence needs no schema change. Each client joins one shared channel and
// tracks { user_id, voice, video }. Everyone can then read who's online and
// whether that person is currently accepting voice / video calls. Call
// availability is persisted locally (localStorage) and re-broadcast on change.

export type CallFlags = { voice: boolean; video: boolean };

type PeerPresence = CallFlags & { online: boolean };

type PresenceCtx = {
  onlineIds: Set<string>;
  /** Live presence for a user (online now + their current call flags). */
  getPresence: (id: string) => PeerPresence;
  isOnline: (id: string) => boolean;
  /** My own call-availability flags. */
  flags: CallFlags;
  /** Update my call-availability; persisted locally and re-broadcast live. */
  setFlags: (next: CallFlags) => void;
};

const PresenceContext = createContext<PresenceCtx>({
  onlineIds: new Set(),
  getPresence: () => ({ online: false, voice: false, video: false }),
  isOnline: () => false,
  flags: { voice: false, video: false },
  setFlags: () => {},
});

export const usePresence = () => useContext(PresenceContext);

const PRESENCE_CHANNEL = "gender-online-presence";
const FLAGS_KEY = "gendr:call-flags";

function loadFlags(): CallFlags {
  if (typeof window === "undefined") return { voice: false, video: false };
  try {
    const raw = localStorage.getItem(FLAGS_KEY);
    if (!raw) return { voice: false, video: false };
    const p = JSON.parse(raw) as Partial<CallFlags>;
    return { voice: !!p.voice, video: !!p.video };
  } catch {
    return { voice: false, video: false };
  }
}

function saveFlags(flags: CallFlags) {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    // ignore (private mode / storage disabled)
  }
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const uid = me?.user.id;

  const [flags, setFlagsState] = useState<CallFlags>(() => loadFlags());
  const [peers, setPeers] = useState<Record<string, PeerPresence>>({});

  // Keep latest flags in a ref so the channel track callback (and re-track on
  // visibility change) always sends the current values without re-subscribing.
  const flagsRef = useRef(flags);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!uid) return;

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: uid } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState();
      const next: Record<string, PeerPresence> = {};
      for (const [key, metas] of Object.entries(state)) {
        const meta = (metas[0] ?? {}) as { voice?: boolean; video?: boolean };
        next[key] = { online: true, voice: !!meta.voice, video: !!meta.video };
      }
      setPeers(next);
    };

    channel.on("presence", { event: "sync" }, sync);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const f = flagsRef.current;
        void channel.track({ user_id: uid, voice: f.voice, video: f.video });
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && channelRef.current) {
        const f = flagsRef.current;
        void channelRef.current.track({ user_id: uid, voice: f.voice, video: f.video });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [uid]);

  const setFlags = useCallback(
    (next: CallFlags) => {
      setFlagsState(next);
      flagsRef.current = next;
      saveFlags(next);
      // Re-broadcast immediately so peers see the change without waiting.
      if (channelRef.current) {
        void channelRef.current.track({ user_id: uid, voice: next.voice, video: next.video });
      }
    },
    [uid],
  );

  const onlineIds = useMemo(() => new Set(Object.keys(peers)), [peers]);

  const value = useMemo<PresenceCtx>(
    () => ({
      onlineIds,
      getPresence: (id: string) => peers[id] ?? { online: false, voice: false, video: false },
      isOnline: (id: string) => !!peers[id],
      flags,
      setFlags,
    }),
    [onlineIds, peers, flags, setFlags],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
