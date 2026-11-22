import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Shuffle, SkipForward, Square, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { useCall } from "@/lib/calls";
import { MediaView } from "@/components/app/CallOverlay";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unlockAudioContext, playRingingSound, stopRingingSound } from "@/lib/audio";

export const Route = createFileRoute("/_authenticated/random")({
  head: () => ({ meta: [{ title: "Random video — Gender" }, { name: "description", content: "Meet someone new on a random video call." }] }),
  component: Random,
});

// Common countries list
const COUNTRIES = [
  { code: "global", name: "🌍 Worldwide" },
  { code: "US", name: "🇺🇸 United States" },
  { code: "GB", name: "🇬🇧 United Kingdom" },
  { code: "CA", name: "🇨🇦 Canada" },
  { code: "AU", name: "🇦🇺 Australia" },
  { code: "DE", name: "🇩🇪 Germany" },
  { code: "FR", name: "🇫🇷 France" },
  { code: "IN", name: "🇮🇳 India" },
  { code: "BR", name: "🇧🇷 Brazil" },
  { code: "MX", name: "🇲🇽 Mexico" },
  { code: "ES", name: "🇪🇸 Spain" },
  { code: "IT", name: "🇮🇹 Italy" },
  { code: "NL", name: "🇳🇱 Netherlands" },
  { code: "SE", name: "🇸🇪 Sweden" },
  { code: "NO", name: "🇳🇴 Norway" },
  { code: "DK", name: "🇩🇰 Denmark" },
  { code: "FI", name: "🇫🇮 Finland" },
  { code: "JP", name: "🇯🇵 Japan" },
  { code: "KR", name: "🇰🇷 South Korea" },
  { code: "SG", name: "🇸🇬 Singapore" },
  { code: "NZ", name: "🇳🇿 New Zealand" },
  { code: "IE", name: "🇮🇪 Ireland" },
  { code: "CH", name: "🇨🇭 Switzerland" },
  { code: "AT", name: "🇦🇹 Austria" },
  { code: "BE", name: "🇧🇪 Belgium" },
  { code: "PL", name: "🇵🇱 Poland" },
  { code: "CZ", name: "🇨🇿 Czech Republic" },
  { code: "PT", name: "🇵🇹 Portugal" },
  { code: "GR", name: "🇬🇷 Greece" },
  { code: "IL", name: "🇮🇱 Israel" },
  { code: "ZA", name: "🇿🇦 South Africa" },
  { code: "AR", name: "🇦🇷 Argentina" },
  { code: "CL", name: "🇨🇱 Chile" },
  { code: "CO", name: "🇨🇴 Colombia" },
  { code: "PE", name: "🇵🇪 Peru" },
  { code: "VE", name: "🇻🇪 Venezuela" },
  { code: "NG", name: "🇳🇬 Nigeria" },
  { code: "KE", name: "🇰🇪 Kenya" },
  { code: "EG", name: "🇪🇬 Egypt" },
  { code: "MA", name: "🇲🇦 Morocco" },
  { code: "AE", name: "🇦🇪 UAE" },
  { code: "SA", name: "🇸🇦 Saudi Arabia" },
  { code: "TR", name: "🇹🇷 Turkey" },
  { code: "RU", name: "🇷🇺 Russia" },
  { code: "UA", name: "🇺🇦 Ukraine" },
  { code: "PH", name: "🇵🇭 Philippines" },
  { code: "TH", name: "🇹🇭 Thailand" },
  { code: "VN", name: "🇻🇳 Vietnam" },
  { code: "ID", name: "🇮🇩 Indonesia" },
  { code: "MY", name: "🇲🇾 Malaysia" },
  { code: "HK", name: "🇭🇰 Hong Kong" },
  { code: "TW", name: "🇹🇼 Taiwan" },
];

function Random() {
  const { data: me } = useMe();
  const call = useCall();
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState("global");
  const ch = useRef<RealtimeChannel | null>(null);
  const uid = me?.user.id;
  const callRef = useRef(call); callRef.current = call;
  const searchRef = useRef(searching); searchRef.current = searching;
  const countryRef = useRef(selectedCountry); countryRef.current = selectedCountry;

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

  // Build channel name based on selected country
  const getChannelName = (country: string) => country === "global" ? "random-lobby" : `random-lobby-${country.toLowerCase()}`;

  useEffect(() => {
    if (!uid) return;
    const channelName = getChannelName(countryRef.current);
    const c = supabase.channel(channelName, { config: { presence: { key: uid } } });
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
  }, [uid, selectedCountry]);

  // keep presence in sync with state
  useEffect(() => {
    call.setAutoAccept(searching);
    const waiting = searching && call.status === "idle";
    void ch.current?.track({ waiting, name: me?.profile?.display_name?.split(" ")[0] ?? "Stranger" });
  }, [searching, call.status, me?.profile?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const inCall = call.random && call.status !== "idle";
  const stop = () => { setSearching(false); if (inCall) call.hangup(); };
  const next = () => { if (inCall) call.hangup(); setSearching(true); };

  // Reset search when country changes
  useEffect(() => {
    if (searching) {
      setSearching(false);
    }
  }, [selectedCountry]);

  // Handle ringing sound for random calls (global CallOverlay returns null for random)
  useEffect(() => {
    if (call.random && call.status === "incoming") {
      playRingingSound();
    } else if (call.random && call.status !== "incoming") {
      stopRingingSound();
    }
    return () => { if (call.random) stopRingingSound(); };
  }, [call.random, call.status]);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">Random video</h1>
          <p className="text-muted-foreground">{online} online right now. Be kind — you can skip anytime.</p>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <Select value={selectedCountry} onValueChange={setSelectedCountry} disabled={searching || inCall}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Worldwide" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
