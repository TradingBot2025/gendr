import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sendCallSignal, getTurnCredentials } from "@/lib/call-signalling.functions";

type Signal = {
  type: "offer" | "answer" | "ice" | "hangup" | "decline";
  from: string;
  name?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  video?: boolean;
  random?: boolean;
};

export type CallStatus = "idle" | "outgoing" | "incoming" | "active";
type CallState = {
  status: CallStatus;
  peerId: string | null;
  peerName: string;
  video: boolean;
  random: boolean;
};

type Ctx = CallState & {
  local: MediaStream | null;
  remote: MediaStream | null;
  start: (peerId: string, peerName: string, video: boolean, random?: boolean) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: () => void;
  setAutoAccept: (v: boolean) => void;
  toggleMic: () => boolean;
  toggleCam: () => boolean;
  // Switch between front and back camera (video calls). No-op if unsupported.
  flipCamera: () => Promise<void>;
  // Route remote audio through a different output (speaker/earpiece). Best-effort.
  speakerOn: boolean;
  speakerSupported: boolean;
  toggleSpeaker: () => Promise<void>;
  // Register the <video>/<audio> element playing the remote stream so the
  // speaker toggle can retarget its output device.
  setRemoteMedia: (el: HTMLMediaElement | null) => void;
};

const CallCtx = createContext<Ctx | null>(null);
export const useCall = () => {
  const c = useContext(CallCtx);
  if (!c) throw new Error("useCall outside provider");
  return c;
};

const IDLE: CallState = { status: "idle", peerId: null, peerName: "", video: false, random: false };

export function CallProvider({
  userId,
  myName,
  children,
}: {
  userId: string;
  myName: string;
  children: ReactNode;
}) {
  const [state, setStateRaw] = useState<CallState>(IDLE);
  const stateRef = useRef(state);
  const setState = (s: CallState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const pendingOffer = useRef<Signal | null>(null);
  const iceQueue = useRef<RTCIceCandidateInit[]>([]);
  const autoAccept = useRef(false);
  const facingRef = useRef<"user" | "environment">("user");
  const remoteMediaRef = useRef<HTMLMediaElement | null>(null);
  const [speakerOn, setSpeakerOn] = useState(false);
  const speakerSupported =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const turnCredsRef = useRef<{ username: string; credential: string; urls: string[] } | null>(
    null,
  );

  // Fetch TURN credentials on mount
  useEffect(() => {
    let alive = true;
    getTurnCredentials()
      .then(({ username, credential, urls }) => {
        if (alive && username && credential) {
          turnCredsRef.current = { username, credential, urls };
        }
      })
      .catch(() => {
        // Fallback to STUN only
        turnCredsRef.current = null;
      });
    return () => {
      alive = false;
    };
  }, []);

  const getIceServers = useCallback((forceRelay = false) => {
    const servers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ];

    if (turnCredsRef.current) {
      servers.push({
        urls: turnCredsRef.current.urls,
        username: turnCredsRef.current.username,
        credential: turnCredsRef.current.credential,
      });
    }

    if (forceRelay) {
      return { iceServers: servers, iceTransportPolicy: "relay" as RTCIceTransportPolicy };
    }
    return { iceServers: servers };
  }, []);

  const send = useCallback(async (to: string, s: Omit<Signal, "from">) => {
    try {
      await sendCallSignal({ data: { to, ...s } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to send call signal:", message);
      // Don't throw - let the call fail naturally
    }
  }, []);

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pendingOffer.current = null;
    iceQueue.current = [];
    setLocal(null);
    setRemote(null);
    setSpeakerOn(false);
    facingRef.current = "user";
    remoteMediaRef.current = null;
    setState(IDLE);
  }, []);

  const makePc = useCallback(
    (peer: string, forceRelay = false) => {
      const config = getIceServers(forceRelay);
      const conn = new RTCPeerConnection(config);
      conn.onicecandidate = (e) => {
        if (e.candidate) void send(peer, { type: "ice", candidate: e.candidate.toJSON() });
      };
      // Accumulate remote tracks into a single MediaStream. Some browsers (notably
      // mobile Safari ↔ desktop Chrome) don't populate e.streams[0], so relying on it
      // leaves the remote stream empty and no video/audio shows. Building the stream
      // from tracks works across all browsers.
      const remoteStream = new MediaStream();
      conn.ontrack = (e) => {
        remoteStream.addTrack(e.track);
        setRemote(remoteStream);
      };
      let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
      conn.onconnectionstatechange = () => {
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          disconnectTimer = null;
        }
        if (conn.connectionState === "connected") {
          // Recovered from a temporary drop — keep the call alive.
          return;
        }
        if (conn.connectionState === "disconnected") {
          // Mobile networks briefly drop; give it 8s to recover before ending.
          disconnectTimer = setTimeout(() => {
            if (pc.current === conn && conn.connectionState !== "connected") {
              toast("Call ended");
              cleanup();
            }
          }, 8000);
        }
        if (conn.connectionState === "failed") {
          if (pc.current === conn) {
            toast("Call ended");
            cleanup();
          }
        }
      };
      pc.current = conn;
      return conn;
    },
    [getIceServers, send, cleanup],
  );

  const getMedia = async (video: boolean) => {
    const m = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video
        ? {
            facingMode: { ideal: facingRef.current },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    });
    localRef.current = m;
    setLocal(m);
    return m;
  };

  const flushIce = async () => {
    for (const c of iceQueue.current) await pc.current?.addIceCandidate(c).catch(() => {});
    iceQueue.current = [];
  };

  const start = async (peerId: string, peerName: string, video: boolean, random = false) => {
    if (stateRef.current.status !== "idle") return;
    try {
      setState({ status: "outgoing", peerId, peerName, video, random });
      const m = await getMedia(video);
      // Force relay for random calls to hide IPs
      const conn = makePc(peerId, random);
      m.getTracks().forEach((t) => conn.addTrack(t, m));
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      // Include the caller's name so the recipient's incoming-call screen shows
      // who is calling (previously it always fell back to "Someone").
      await send(peerId, { type: "offer", sdp: offer, video, random, name: myName });
    } catch {
      toast.error("Could not access microphone/camera");
      cleanup();
    }
  };

  const accept = async () => {
    const offer = pendingOffer.current;
    if (!offer?.sdp) return;
    try {
      const m = await getMedia(!!offer.video);
      // Force relay for random calls
      const conn = makePc(offer.from, !!offer.random);
      m.getTracks().forEach((t) => conn.addTrack(t, m));
      await conn.setRemoteDescription(offer.sdp);
      await flushIce();
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      await send(offer.from, { type: "answer", sdp: answer });
      setState({ ...stateRef.current, status: "active" });
    } catch {
      toast.error("Could not access microphone/camera");
      void send(offer.from, { type: "decline" });
      cleanup();
    }
  };

  const decline = () => {
    const p = stateRef.current.peerId;
    if (p) void send(p, { type: "decline" });
    cleanup();
  };
  const hangup = () => {
    const p = stateRef.current.peerId;
    if (p) void send(p, { type: "hangup" });
    cleanup();
  };

  // stable handler via ref
  const handler = useRef<(s: Signal) => void>(() => {});
  handler.current = async (s: Signal) => {
    const cur = stateRef.current;
    if (s.type === "offer") {
      if (cur.status !== "idle") {
        void send(s.from, { type: "decline" });
        return;
      }
      if (s.random && !autoAccept.current) {
        void send(s.from, { type: "decline" });
        return;
      }
      pendingOffer.current = s;
      setState({
        status: "incoming",
        peerId: s.from,
        peerName: s.name ?? "Someone",
        video: !!s.video,
        random: !!s.random,
      });
      if (s.random) await accept();
      return;
    }
    if (s.from !== cur.peerId) return;
    if (s.type === "answer" && pc.current && s.sdp) {
      await pc.current.setRemoteDescription(s.sdp);
      await flushIce();
      setState({ ...stateRef.current, status: "active" });
    } else if (s.type === "ice" && s.candidate) {
      if (pc.current?.remoteDescription)
        await pc.current.addIceCandidate(s.candidate).catch(() => {});
      else iceQueue.current.push(s.candidate);
    } else if (s.type === "hangup") {
      if (!cur.random) toast("Call ended");
      cleanup();
    } else if (s.type === "decline") {
      if (!cur.random) toast("Call declined or user busy");
      cleanup();
    }
  };

  useEffect(() => {
    // Use private channel for receiving - only authenticated user can subscribe
    const ch = supabase
      .channel(`private-call-${userId}`, { config: { private: true } })
      .on("broadcast", { event: "signal" }, ({ payload }) => handler.current(payload as Signal))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const toggleMic = () => {
    const t = localRef.current?.getAudioTracks()[0];
    if (t) t.enabled = !t.enabled;
    return !!t?.enabled;
  };
  const toggleCam = () => {
    const t = localRef.current?.getVideoTracks()[0];
    if (t) t.enabled = !t.enabled;
    return !!t?.enabled;
  };

  const setRemoteMedia = useCallback((el: HTMLMediaElement | null) => {
    remoteMediaRef.current = el;
  }, []);

  // Switch camera (front <-> back) on video calls by replacing the outgoing
  // video track on the peer connection and refreshing the local preview.
  const flipCamera = useCallback(async () => {
    const conn = pc.current;
    const local = localRef.current;
    if (!conn || !local) return;
    const next: "user" | "environment" = facingRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: next } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      for (const sender of conn.getSenders()) {
        if (sender.track && sender.track.kind === "video") {
          await sender.replaceTrack(newTrack).catch(() => {});
        }
      }
      const oldTrack = local.getVideoTracks()[0];
      if (oldTrack) {
        local.removeTrack(oldTrack);
        oldTrack.stop();
      }
      local.addTrack(newTrack);
      setLocal(new MediaStream(local.getTracks()));
      facingRef.current = next;
    } catch {
      toast.error("Could not switch camera");
    }
  }, []);

  // Best-effort speaker/earpiece switch for the remote audio output. Works on
  // browsers that expose HTMLMediaElement.setSinkId with >1 audio output.
  const toggleSpeaker = useCallback(async () => {
    const el = remoteMediaRef.current as
      (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el || typeof el.setSinkId !== "function") return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      if (outputs.length < 2) return;
      const nextOn = !speakerOn;
      const target = outputs[nextOn ? 1 % outputs.length : 0];
      if (!target) return;
      await el.setSinkId(target.deviceId);
      setSpeakerOn(nextOn);
    } catch {
      // ignore — device selection unsupported
    }
  }, [speakerOn]);

  return (
    <CallCtx.Provider
      value={{
        ...state,
        local,
        remote,
        start,
        accept,
        decline,
        hangup,
        setAutoAccept: (v) => {
          autoAccept.current = v;
        },
        toggleMic,
        toggleCam,
        flipCamera,
        speakerOn,
        speakerSupported,
        toggleSpeaker,
        setRemoteMedia,
      }}
    >
      {children}
    </CallCtx.Provider>
  );
}
