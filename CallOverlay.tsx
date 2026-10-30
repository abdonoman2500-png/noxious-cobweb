"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessenger } from "@/components/MessengerProvider";
import { Avatar, Icon } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import type { CallDTO } from "@/lib/types";

type Signal = { id: number; kind: string; payload: unknown };

export function CallOverlay() {
  const { call, iceServers, acceptCall, rejectCall, endCall, t } = useMessenger();
  const [state, setState] = useState<"idle" | "calling" | "connecting" | "connected" | "failed">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lastSignalRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<number | null>(null);
  const statusRef = useRef<CallDTO["status"]>("ringing");
  const kindRef = useRef<"audio" | "video">("audio");
  const directionRef = useRef<"incoming" | "outgoing">("outgoing");
  const facingRef = useRef<"user" | "environment">("user");
  const endCallRef = useRef(endCall);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  useEffect(() => {
    facingRef.current = facingMode;
  }, [facingMode]);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    lastSignalRef.current = 0;
  }, []);

  const sendSignal = useCallback(async (kind: "offer" | "answer" | "candidate", payload: unknown) => {
    if (!callIdRef.current) return;
    await fetch(`/api/calls/${callIdRef.current}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload }),
    }).catch(() => undefined);
  }, []);

  const ensurePeer = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("candidate", event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
        setState("connected");
      }
    };
    pc.onconnectionstatechange = () => {
      const current = pc.connectionState;
      if (current === "connected") setState("connected");
      else if (current === "failed") {
        setState("failed");
        setError("connection_failed");
      } else if (current === "disconnected") setState("connecting");
    };
    return pc;
  }, [iceServers, sendSignal]);

  const startMedia = useCallback(async () => {
    const wantVideo = kindRef.current === "video";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? { facingMode: facingRef.current } : false,
    });
    streamRef.current = stream;
    if (localVideo.current) {
      localVideo.current.srcObject = stream;
      localVideo.current.muted = true;
    }
    const pc = await ensurePeer();
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    return stream;
  }, [ensurePeer]);

  const handleSignal = useCallback(
    async (signal: Signal) => {
      const pc = await ensurePeer();
      if (signal.kind === "offer") {
        await startMedia();
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("answer", { type: answer.type, sdp: answer.sdp });
      } else if (signal.kind === "answer") {
        if (pc.signalingState !== "stable") {
          await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        }
      } else if (signal.kind === "candidate") {
        try {
          await pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
        } catch {
          // candidate arrived before the remote description — ignore
        }
      }
    },
    [ensurePeer, sendSignal, startMedia],
  );

  const callId = call?.id ?? null;

  // Call lifecycle: keyed on the call id only so re-renders never restart it.
  useEffect(() => {
    if (!callId) {
      cleanup();
      setState("idle");
      setSeconds(0);
      setError(null);
      return;
    }
    callIdRef.current = callId;
    statusRef.current = call?.status ?? "ringing";
    kindRef.current = call?.kind ?? "audio";
    directionRef.current = call?.direction ?? "outgoing";
    setState((current) => (current === "connected" ? current : "calling"));
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/calls/${callId}?since=${lastSignalRef.current}`);
        if (!response.ok) return;
        const data = (await response.json()) as { status: CallDTO["status"]; signals: Signal[] };
        if (cancelled) return;

        if (data.status !== statusRef.current) {
          statusRef.current = data.status;
          if (data.status === "rejected" || data.status === "missed" || data.status === "ended") {
            cleanup();
            setState("idle");
            void endCallRef.current();
            return;
          }
          if (data.status === "accepted") {
            setState((current) => (current === "connected" ? current : "connecting"));
            if (directionRef.current === "outgoing") {
              await startMedia();
              const pc = await ensurePeer();
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await sendSignal("offer", { type: offer.type, sdp: offer.sdp });
            }
          }
        }

        for (const signal of data.signals) {
          lastSignalRef.current = Math.max(lastSignalRef.current, signal.id);
          await handleSignal(signal);
        }
      } catch {
        // keep polling; transient network errors are expected on mobile
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), 1200);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  useEffect(() => {
    if (state !== "connected") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => () => cleanup(), [cleanup]);

  if (!call) return null;

  const toggleMute = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const toggleCamera = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
  };

  const switchCamera = async () => {
    if (call.kind !== "video") return;
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    facingRef.current = next;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: next },
      });
      const pc = pcRef.current;
      const videoTrack = newStream.getVideoTracks()[0];
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) await sender.replaceTrack(videoTrack);
      streamRef.current?.getVideoTracks().forEach((track) => track.stop());
      if (localVideo.current) localVideo.current.srcObject = newStream;
      streamRef.current = newStream;
    } catch {
      setError("camera_error");
    }
  };

  const incoming = call.direction === "incoming" && call.status === "ringing";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
      <div className="relative flex-1">
        {call.kind === "video" ? (
          <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950">
            <div className="flex flex-col items-center gap-4">
              <div className={incoming ? "ring-pulse rounded-full" : ""}>
                <Avatar name={call.peerName} size={112} />
              </div>
              <p className="text-2xl font-semibold">{call.peerName}</p>
              <p className="text-sm text-white/70">
                {incoming
                  ? t("incomingCall")
                  : state === "connected"
                    ? formatDuration(seconds)
                    : state === "failed"
                      ? t("callFailed")
                      : t("calling")}
              </p>
            </div>
          </div>
        )}

        {call.kind === "video" && (
          <div className="absolute end-3 top-3 h-32 w-24 overflow-hidden rounded-xl border border-white/20 bg-black/40">
            <video ref={localVideo} autoPlay playsInline muted className="h-full w-full object-cover" />
          </div>
        )}

        <div className="absolute start-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              state === "connected" ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          {state === "connected"
            ? t("connected")
            : state === "failed"
              ? t("callFailed")
              : t("connecting")}
          {state === "connected" && ` · ${formatDuration(seconds)}`}
        </div>

        {error && (
          <div className="absolute bottom-28 start-1/2 -translate-x-1/2 rounded-full bg-red-600/90 px-3 py-1 text-xs">
            {error === "camera_error" ? t("cameraPermission") : t("callFailed")}
          </div>
        )}
      </div>

      <div className="safe-bottom flex items-center justify-around gap-3 bg-slate-950/95 px-4 py-5">
        {incoming ? (
          <>
            <button
              onClick={() => void rejectCall()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600"
              aria-label={t("reject")}
            >
              <Icon name="phoneOff" className="h-7 w-7" />
            </button>
            <button
              onClick={() => void acceptCall()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600"
              aria-label={t("accept")}
            >
              <Icon name={call.kind === "video" ? "video" : "phone"} className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                muted ? "bg-white text-slate-900" : "bg-white/15"
              }`}
              aria-label={t("mute")}
            >
              <Icon name={muted ? "micOff" : "mic"} className="h-6 w-6" />
            </button>
            {call.kind === "video" && (
              <>
                <button
                  onClick={() => void toggleCamera()}
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    cameraOff ? "bg-white text-slate-900" : "bg-white/15"
                  }`}
                  aria-label={t("cameraOff")}
                >
                  <Icon name={cameraOff ? "videoOff" : "camera"} className="h-6 w-6" />
                </button>
                <button
                  onClick={() => void switchCamera()}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15"
                  aria-label={t("switchCamera")}
                >
                  <Icon name="switch" className="h-6 w-6" />
                </button>
              </>
            )}
            <button
              onClick={() => void endCall()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600"
              aria-label={t("endCall")}
            >
              <Icon name="phoneOff" className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
