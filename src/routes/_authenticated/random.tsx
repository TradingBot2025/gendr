import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Shuffle,
  SkipForward,
  Square,
  Globe,
  Shield,
  AlertCircle,
  UserX,
  Video,
  Mic,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { useCall } from "@/lib/calls";
import { MediaView } from "@/components/app/CallOverlay";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { unlockAudioContext, playRingingSound, stopRingingSound } from "@/lib/audio";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/random")({
  head: () => ({
    meta: [
      { title: "Random video — Gender" },
      { name: "description", content: "Meet someone new on a random video call." },
    ],
  }),
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
  const [selectedCountry, setSelectedCountry] = useState("global");
  const [consentGiven, setConsentGiven] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const uid = me?.user.id;
  const callRef = useRef(call);
  callRef.current = call;
  const searchRef = useRef(searching);
  searchRef.current = searching;
  const countryRef = useRef(selectedCountry);
  countryRef.current = selectedCountry;
  const peerIdRef = useRef<string | null>(null);
  const matchInitiatedRef = useRef(false);

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

  // Handle ringing sound for random calls
  useEffect(() => {
    if (call.random && call.status === "incoming") {
      playRingingSound();
    } else if (call.random && call.status !== "incoming") {
      stopRingingSound();
    }
    return () => {
      if (call.random) stopRingingSound();
    };
  }, [call.random, call.status]);

  // Deterministically decide who calls whom to avoid glare (both sending an
  // offer). The user with the lexicographically smaller id is always the caller;
  // the other auto-accepts. Both sides compute this from the same two ids, so
  // exactly one offer is sent regardless of matchmaking timing / who the RPC
  // returned the peer to.
  const iAmCaller = (peerId: string) => !!uid && uid < peerId;

  const beginWithPeer = (peerId: string, peerName: string) => {
    peerIdRef.current = peerId;
    if (iAmCaller(peerId)) {
      // I'm the caller — send the offer (only if not already in a call).
      matchInitiatedRef.current = true;
      callRef.current.setAutoAccept(false);
      if (callRef.current.status === "idle")
        void callRef.current.start(peerId, peerName, true, true);
    } else {
      // I'm the callee — wait for the caller's offer and auto-accept it.
      matchInitiatedRef.current = false;
      callRef.current.setAutoAccept(true);
      setSearching(true);
    }
  };

  // Search for match using server-side RPC
  const findMatch = async () => {
    if (!uid || !consentGiven) return;
    try {
      const { data, error } = await Promise.resolve(
        supabase.rpc("find_random_match", {
          _country_code: countryRef.current,
        }),
      );
      if (error) throw error;
      if (data && data.length > 0) {
        const peer = data[0];
        beginWithPeer(peer.peer_id, peer.peer_name);
      } else {
        // No match found immediately - wait for one via realtime. We don't yet
        // know the peer id, so just enable auto-accept; the caller/callee role
        // is decided in the realtime handler once the peer is known.
        matchInitiatedRef.current = false;
        callRef.current.setAutoAccept(true);
        setSearching(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Failed to find match");
      setSearching(false);
    }
  };

  // Subscribe to random matchmaking queue updates for real-time matching
  useEffect(() => {
    if (!uid || !searching) return;
    const ch = supabase
      .channel(`random-queue-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "random_matchmaking_queue",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const newRow = payload.new as {
            status: string;
            matched_with: string | null;
          };
          if (newRow.status === "matched" && newRow.matched_with) {
            const peerId = newRow.matched_with;
            // If we're the caller and haven't started yet, send the offer now.
            // If we're the callee, just wait for the offer (auto-accept).
            if (iAmCaller(peerId) && callRef.current.status === "idle") {
              supabase
                .from("profiles")
                .select("display_name")
                .eq("id", peerId)
                .maybeSingle()
                .then(({ data: peer }) =>
                  beginWithPeer(peerId, peer?.display_name ?? "Stranger"),
                );
            } else {
              callRef.current.setAutoAccept(true);
            }
          } else if (newRow.status === "cancelled" || newRow.status === "expired") {
            setSearching(false);
            callRef.current.setAutoAccept(false);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, searching]);

  const stop = () => {
    setSearching(false);
    if (call.random && call.status !== "idle") call.hangup();
    // Leave queue
    Promise.resolve(supabase.rpc("leave_random_queue"));
    callRef.current.setAutoAccept(false);
    matchInitiatedRef.current = false;
  };

  const next = () => {
    if (call.random && call.status !== "idle") call.hangup();
    Promise.resolve(supabase.rpc("leave_random_queue")).then(() => {
      setTimeout(() => findMatch(), 500);
    });
  };

  const inCall = call.random && call.status !== "idle";

  const handleConsentAccept = () => {
    setConsentGiven(true);
    setShowConsent(false);
    findMatch();
  };

  const handleReport = async () => {
    if (!reportReason || !peerIdRef.current) return;
    try {
      // Report the peer
      await Promise.resolve(
        supabase.from("reports").insert({
          reporter_id: uid,
          reported_id: peerIdRef.current,
          reason: reportDetails || reportReason,
          reason_category: reportReason,
          auto_blocked: true,
        }),
      );
      // Also block/leave
      stop();
      toast.success("Reported and disconnected");
      setShowReport(false);
      setReportReason("");
      setReportDetails("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message ?? "Failed to report");
    }
  };

  // Reset consent on country change
  useEffect(() => {
    if (searching) {
      setSearching(false);
      Promise.resolve(supabase.rpc("leave_random_queue"));
    }
    setConsentGiven(false);
    callRef.current.setAutoAccept(false);
    matchInitiatedRef.current = false;
  }, [selectedCountry]);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">Random video</h1>
          <p className="text-muted-foreground">
            Meet someone new. Be kind — you can skip or report anytime.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <Select
            value={selectedCountry}
            onValueChange={setSelectedCountry}
            disabled={searching || inCall}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Worldwide" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-stage">
          {inCall && call.remote ? (
            <MediaView stream={call.remote} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-stage-foreground">
              <Shuffle className={`h-10 w-10 ${searching ? "animate-spin" : ""}`} />
              <span>
                {searching
                  ? inCall
                    ? "Connecting…"
                    : "Looking for someone…"
                  : "Press Start to meet someone"}
              </span>
            </div>
          )}
          {inCall && (
            <span className="absolute left-3 top-3 rounded-full bg-card/80 px-3 py-1 text-sm">
              {call.peerName}
            </span>
          )}
          {inCall && (
            <div className="absolute right-3 top-3 flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="bg-white/90"
                onClick={() => call.toggleCam()}
                aria-label="Toggle camera"
              >
                <Video className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="bg-white/90"
                onClick={() => call.toggleMic()}
                aria-label="Toggle microphone"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="bg-white/90"
                onClick={() => {
                  setShowReport(true);
                  peerIdRef.current = call.peerId;
                }}
                aria-label="Report user"
              >
                <AlertCircle className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>
        <div className="aspect-video overflow-hidden rounded-3xl bg-muted">
          {call.local && call.random ? (
            <MediaView
              stream={call.local}
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Your camera
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {!searching && !inCall && !consentGiven ? (
          <Button variant="hero" size="lg" onClick={() => setShowConsent(true)}>
            <Shield className="h-4 w-4 mr-2" />
            Start
          </Button>
        ) : !searching && !inCall && consentGiven ? (
          <Button variant="hero" size="lg" onClick={findMatch}>
            <Shuffle className="h-4 w-4 mr-2" />
            Find Match
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={next}>
              <SkipForward className="h-4 w-4 mr-2" />
              Next
            </Button>
            <Button variant="destructive" size="lg" onClick={stop}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </>
        )}
      </div>

      {/* Consent Dialog */}
      <Dialog open={showConsent} onOpenChange={setShowConsent}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Random Video Consent</DialogTitle>
            <DialogDescription>
              You are about to join a random video call with another user. Please read and accept:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" required />
              <span>I am 18 years or older</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" required />
              <span>I understand this is a live video call with a stranger</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" required />
              <span>I will not share illegal, explicit, or harmful content</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" required />
              <span>I understand I can be reported and banned for violations</span>
            </label>
          </div>
          <div className="flex gap-2 border-t pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowConsent(false)}>
              Cancel
            </Button>
            <Button variant="hero" className="flex-1" onClick={handleConsentAccept}>
              I Accept
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report User</DialogTitle>
            <DialogDescription>
              Help keep the community safe. Reports are reviewed by our team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inappropriate_content">Inappropriate Content</SelectItem>
                  <SelectItem value="harassment">Harassment</SelectItem>
                  <SelectItem value="fake_profile">Fake Profile</SelectItem>
                  <SelectItem value="underage">Underage User</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Details (optional)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Describe what happened..."
                rows={3}
                className="w-full rounded-lg border bg-background p-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 border-t pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowReport(false);
                setReportReason("");
                setReportDetails("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleReport}
              disabled={!reportReason}
            >
              Report & Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
