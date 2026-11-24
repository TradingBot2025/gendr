import { Phone, Video } from "lucide-react";
import { usePresence } from "@/lib/presence";

/**
 * Your own call-availability toggles. Turning Voice/Video on lets the person
 * you're chatting with call you on that medium; turning it off hides their call
 * button. Stored on this device and broadcast live via Supabase Realtime
 * Presence — no database columns required (the previous profiles.voice_call_
 * enabled columns didn't exist and caused schema-cache errors).
 */
export function CallAvailability({ className = "" }: { className?: string }) {
  const { flags, setFlags } = usePresence();

  const pill = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background text-muted-foreground hover:bg-accent"
    }`;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 text-xs ${className}`}
    >
      <span className="text-muted-foreground">Ready for calls:</span>
      <button
        type="button"
        className={pill(flags.voice)}
        aria-pressed={flags.voice}
        onClick={() => setFlags({ ...flags, voice: !flags.voice })}
      >
        <Phone className="h-3.5 w-3.5" /> Voice {flags.voice ? "on" : "off"}
      </button>
      <button
        type="button"
        className={pill(flags.video)}
        aria-pressed={flags.video}
        onClick={() => setFlags({ ...flags, video: !flags.video })}
      >
        <Video className="h-3.5 w-3.5" /> Video {flags.video ? "on" : "off"}
      </button>
      <span className="ml-auto hidden text-muted-foreground sm:inline">
        Turn on so they can call you
      </span>
    </div>
  );
}
