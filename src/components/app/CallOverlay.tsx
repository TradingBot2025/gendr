import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "@/lib/calls";
import { playRingingSound, stopRingingSound, unlockAudioContext } from "@/lib/audio";

export function MediaView({
  stream,
  muted,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) {
      // Autoplay can be blocked (especially mobile with audio). Try to play, and
      // if it fails, mute and retry so at least the video renders.
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

export function CallControls() {
  const c = useCall();
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        size="icon"
        variant="secondary"
        className="h-12 w-12 rounded-full"
        onClick={() => setMic(c.toggleMic())}
        aria-label="Toggle microphone"
      >
        {mic ? <Mic /> : <MicOff />}
      </Button>
      {c.video && (
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full"
          onClick={() => setCam(c.toggleCam())}
          aria-label="Toggle camera"
        >
          {cam ? <Video /> : <VideoOff />}
        </Button>
      )}
      <Button
        size="icon"
        variant="destructive"
        className="h-14 w-14 rounded-full"
        onClick={c.hangup}
        aria-label="Hang up"
      >
        <PhoneOff />
      </Button>
    </div>
  );
}

export function CallOverlay() {
  const c = useCall();

  // Don't render overlay for random calls (they have their own UI) or idle

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

  // Play ringing sound on incoming call
  useEffect(() => {
    if (c.status === "incoming") playRingingSound();
    else stopRingingSound();
    return () => stopRingingSound();
  }, [c.status]);

  if (c.status === "idle" || c.random) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stage text-stage-foreground">
      <div className="relative flex-1 overflow-hidden">
        {c.video ? (
          <MediaView stream={c.remote} className="h-full w-full object-cover" />
        ) : (
          <>
            {/* Keep the element rendered (not display:none) so audio plays on mobile. */}
            <MediaView
              stream={c.remote}
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-primary text-4xl font-bold">
                {c.peerName.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </>
        )}
        <div className="absolute left-0 right-0 top-8 text-center">
          <h2 className="text-2xl">{c.peerName}</h2>
          <p className="text-sm opacity-70">
            {c.status === "outgoing"
              ? "Ringing…"
              : c.status === "incoming"
                ? `Incoming ${c.video ? "video" : "voice"} call`
                : c.video
                  ? "Video call"
                  : "Voice call"}
          </p>
        </div>
        {c.video && c.local && (
          <MediaView
            stream={c.local}
            muted
            className="absolute bottom-4 right-4 h-40 w-28 rounded-xl border-2 border-stage-foreground/30 object-cover md:h-48 md:w-36"
          />
        )}
      </div>
      <div className="p-8">
        {c.status === "incoming" ? (
          <div className="flex justify-center gap-10">
            <Button
              size="icon"
              variant="destructive"
              className="h-16 w-16 rounded-full"
              onClick={c.decline}
              aria-label="Decline"
            >
              <PhoneOff />
            </Button>
            <Button
              size="icon"
              variant="success"
              className="h-16 w-16 rounded-full"
              onClick={c.accept}
              aria-label="Accept"
            >
              <Phone />
            </Button>
          </div>
        ) : (
          <CallControls />
        )}
      </div>
    </div>
  );
}
