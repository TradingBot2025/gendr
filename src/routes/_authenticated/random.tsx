import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Shuffle, SkipForward, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { useCall } from "@/lib/calls";
import { MediaView } from "@/components/app/CallOverlay";
import { Button } from "@/components/ui/button";
import { unlockAudioContext } from "@/lib/audio";

export const Route = createFileRoute("/_authenticated/random")({
  head: () => ({ meta: [{ title: "Random video — Gender" }, { name: "description", content: "Meet someone new on a random video call." }] }),
  component: Random,
});

function Random() {
  const { data: me } = useMe();
  const call = useCall();
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(0);
  const ch = useRef<RealtimeChannel | null>(null);
  const uid = me?.user.id;
  const callRef = useRef(call); callRef.current = call;
  const searchRef = useRef(searching); searchRef.current = searching;

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

  useEffect(() => {
    if (!uid) return;
    const c = supabase.channel("random-lobby", { config: { presence: { key: uid } } });
    c.on("presence", { event: "sync" }, () => {
      const st = c.presenceState<{ waiting: boolean; name: string }>();
      setOnline(Object.keys(st).length);
      if (!searchRef.current || callRef.current.status !== "idle") return;
      const waiting = Object.entries(st).filter(([, v]) => v[0]?.waiting).map(([k, v]) => ({ id: k, name: v[0]?.name ?? "Stranger" })).sort((a, b) => a.id.localeCompare(b.id));
      const i = waiting.findIndex((w) => w.id === uid);
      if (i >= 0 && i % 2 === 0 && waiting[i + 1]) {
        const peer = waiting[i + 1]!;
        void c.track({ waiting: false, name: "" });
        void callRef.current.start(peer.id, peer.name, true, true);
      }
    }).subscribe();
    ch.current = c;
    return () => { supabase.removeChannel(c); ch.current = null; callRef.current.setAutoAccept(false); if (callRef.current.random) callRef.current.hangup(); };
  }, [uid]);

  // keep presence in sync with state
  useEffect(() => {
    call.setAutoAccept(searching);
    const waiting = searching && call.status === "idle";
    void ch.current?.track({ waiting, name: me?.profile?.display_name?.split(" ")[0] ?? "Stranger" });
  }, [searching, call.status, me?.profile?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const inCall = call.random && call.status !== "idle";
  const stop = () => { setSearching(false); if (inCall) call.hangup(); };
  const next = () => { if (inCall) call.hangup(); setSearching(true); };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">Random video</h1>
          <p className="text-muted-foreground">{online} online right now. Be kind — you can skip anytime.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-stage">
          {inCall && call.remote ? <MediaView stream={call.remote} className="h-full w-full object-cover" /> : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-stage-foreground">
              <Shuffle className={`h-10 w-10 ${searching ? "animate-spin" : ""}`} />
              <span>{searching ? (inCall ? "Connecting…" : "Looking for someone…") : "Press Start to meet someone"}</span>
            </div>
          )}
          {inCall && <span className="absolute left-3 top-3 rounded-full bg-card/80 px-3 py-1 text-sm">{call.peerName}</span>}
        </div>
        <div className="aspect-video overflow-hidden rounded-3xl bg-muted">
          {call.local && call.random ? <MediaView stream={call.local} muted className="h-full w-full -scale-x-100 object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground">Your camera</div>}
        </div>
      </div>
      <div className="mt-6 flex justify-center gap-3">
        {!searching && !inCall ? (
          <Button variant="hero" size="lg" onClick={() => setSearching(true)}><Shuffle />Start</Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={next}><SkipForward />Next</Button>
            <Button variant="destructive" size="lg" onClick={stop}><Square />Stop</Button>
          </>
        )}
      </div>
    </div>
  );
}
