import { useEffect, useState } from "react";
import { Phone, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";
import { toast } from "sonner";

type Flags = { voice: boolean; video: boolean };

function readFlags(profile: unknown): Flags {
  const p = profile as { voice_call_enabled?: boolean; video_call_enabled?: boolean } | null;
  return { voice: !!p?.voice_call_enabled, video: !!p?.video_call_enabled };
}

/**
 * Your own call-availability toggles. Turning Voice/Video on lets the person
 * you're chatting with call you on that medium; turning it off hides their call
 * button. Stored on your profile so the other side can read it.
 *
 * Requires the profiles.voice_call_enabled / video_call_enabled columns
 * (see MIGRATIONS TO APPLY).
 */
export function CallAvailability({ className = "" }: { className?: string }) {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const [flags, setFlags] = useState<Flags>({ voice: false, video: false });
  const [busy, setBusy] = useState<keyof Flags | null>(null);

  useEffect(() => {
    if (me?.profile) setFlags(readFlags(me.profile));
  }, [me?.profile]);

  const set = async (key: keyof Flags, value: boolean) => {
    if (!uid || busy) return;
    const prev = flags;
    const next = { ...flags, [key]: value };
    setFlags(next);
    setBusy(key);
    const column = key === "voice" ? "voice_call_enabled" : "video_call_enabled";
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: value } as never)
      .eq("id", uid);
    setBusy(null);
    if (error) {
      setFlags(prev);
      toast.error(error.message);
      return;
    }
    toast.success(
      key === "voice"
        ? value
          ? "Voice calls enabled — they can call you"
          : "Voice calls disabled"
        : value
          ? "Video calls enabled — they can call you"
          : "Video calls disabled",
    );
  };

  const pill = (key: keyof Flags, on: boolean) =>
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
        className={pill("voice", flags.voice)}
        aria-pressed={flags.voice}
        onClick={() => void set("voice", !flags.voice)}
      >
        <Phone className="h-3.5 w-3.5" /> Voice {flags.voice ? "on" : "off"}
      </button>
      <button
        type="button"
        className={pill("video", flags.video)}
        aria-pressed={flags.video}
        onClick={() => void set("video", !flags.video)}
      >
        <Video className="h-3.5 w-3.5" /> Video {flags.video ? "on" : "off"}
      </button>
      <span className="ml-auto hidden text-muted-foreground sm:inline">
        Turn on so they can call you
      </span>
    </div>
  );
}
