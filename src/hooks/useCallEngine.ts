import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "../lib/uuid";
import { wsClient, type CallSignal } from "../lib/wsClient";

export type CallPeer = {
  deviceId: string;
  displayName: string;
};

export type CallState = {
  status: "idle" | "calling" | "incoming" | "connected" | "error";
  mode: "audio" | "video";
  peer: CallPeer;
  error?: string;
};

type ActiveCall = {
  callId: string;
  groupId: string;
  peer: CallPeer;
  mode: "audio" | "video";
  localName: string;
};

const rtcConfig: RTCConfiguration = {
  // 局域网测试会使用 host candidates。部署公网版本时在设置中配置 TURN。
  iceServers: [],
};

export function useCallEngine(deviceId: string) {
  const [call, setCall] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const pendingRef = useRef<CallSignal | null>(null);
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const finish = useCallback((notify = false, signal: "hangup" | "reject" = "hangup") => {
    const active = activeRef.current;
    if (notify && active) {
      wsClient.sendCallSignal({
        groupId: active.groupId,
        deviceId,
        targetDeviceId: active.peer.deviceId,
        callId: active.callId,
        signal,
        mode: active.mode,
        senderName: active.localName,
      });
    }
    pcRef.current?.close();
    pcRef.current = null;
    activeRef.current = null;
    pendingRef.current = null;
    queuedCandidates.current = [];
    stopMedia();
    setCall(null);
  }, [deviceId, stopMedia]);

  const createPeerConnection = useCallback((active: ActiveCall, stream: MediaStream) => {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      wsClient.sendCallSignal({
        groupId: active.groupId,
        deviceId,
        targetDeviceId: active.peer.deviceId,
        callId: active.callId,
        signal: "ice",
        mode: active.mode,
        senderName: active.localName,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] || new MediaStream([event.track]));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCall((current) => current ? { ...current, status: "connected" } : current);
      }
      if (["failed", "closed"].includes(pc.connectionState)) {
        finish(false);
      }
    };
    return pc;
  }, [deviceId, finish]);

  const capture = useCallback(async (mode: "audio" | "video") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风或摄像头通话。");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video" ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const startCall = useCallback(async (
    groupId: string,
    peer: CallPeer,
    mode: "audio" | "video",
    localName: string
  ) => {
    if (!peer.deviceId) return;
    finish(false);
    const active: ActiveCall = {
      callId: randomUUID(),
      groupId,
      peer,
      mode,
      localName,
    };
    activeRef.current = active;
    setCall({ status: "calling", mode, peer });
    try {
      const stream = await capture(mode);
      const pc = createPeerConnection(active, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsClient.sendCallSignal({
        groupId,
        deviceId,
        targetDeviceId: peer.deviceId,
        callId: active.callId,
        signal: "offer",
        mode,
        senderName: localName,
        sdp: offer,
      });
    } catch (error) {
      finish(false);
      setCall({
        status: "error",
        mode,
        peer,
        error: error instanceof Error ? error.message : "无法打开麦克风或摄像头。",
      });
    }
  }, [capture, createPeerConnection, deviceId, finish]);

  const acceptCall = useCallback(async () => {
    const signal = pendingRef.current;
    if (!signal?.sdp) return;
    const active: ActiveCall = {
      callId: signal.call_id,
      groupId: signal.group_id,
      peer: { deviceId: signal.from_device_id, displayName: signal.from_name || "成员" },
      mode: signal.mode,
      localName: "我",
    };
    activeRef.current = active;
    pendingRef.current = null;
    setCall({ status: "calling", mode: active.mode, peer: active.peer });
    try {
      const stream = await capture(active.mode);
      const pc = createPeerConnection(active, stream);
      await pc.setRemoteDescription(signal.sdp);
      for (const candidate of queuedCandidates.current.splice(0)) {
        await pc.addIceCandidate(candidate);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsClient.sendCallSignal({
        groupId: active.groupId,
        deviceId,
        targetDeviceId: active.peer.deviceId,
        callId: active.callId,
        signal: "answer",
        mode: active.mode,
        senderName: active.localName,
        sdp: answer,
      });
    } catch (error) {
      finish(true, "reject");
      setCall({
        status: "error",
        mode: active.mode,
        peer: active.peer,
        error: error instanceof Error ? error.message : "无法接听通话。",
      });
    }
  }, [capture, createPeerConnection, deviceId, finish]);

  const rejectCall = useCallback(() => finish(true, "reject"), [finish]);
  const endCall = useCallback(() => finish(true), [finish]);

  const toggleAudio = useCallback(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  }, [localStream]);

  useEffect(() => {
    const off = wsClient.on("call_signal", async (signal) => {
      if (signal.signal === "offer") {
        if (activeRef.current || pendingRef.current) {
          wsClient.sendCallSignal({
            groupId: signal.group_id,
            deviceId,
            targetDeviceId: signal.from_device_id,
            callId: signal.call_id,
            signal: "reject",
            mode: signal.mode,
            senderName: "我",
          });
          return;
        }
        pendingRef.current = signal;
        setCall({
          status: "incoming",
          mode: signal.mode,
          peer: { deviceId: signal.from_device_id, displayName: signal.from_name || "成员" },
        });
        return;
      }

      const active = activeRef.current;
      if (!active || signal.call_id !== active.callId || signal.from_device_id !== active.peer.deviceId) return;

      if (signal.signal === "answer" && signal.sdp && pcRef.current) {
        await pcRef.current.setRemoteDescription(signal.sdp);
        return;
      }
      if (signal.signal === "ice" && signal.candidate) {
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(signal.candidate);
        } else {
          queuedCandidates.current.push(signal.candidate);
        }
        return;
      }
      if (signal.signal === "hangup" || signal.signal === "reject") {
        finish(false);
      }
    });
    return () => {
      off();
      finish(false);
    };
  }, [deviceId, finish]);

  return {
    call,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
  };
}
