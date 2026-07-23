import { useEffect, useRef } from "react";
import type { CallState } from "../hooks/useCallEngine";

export function CallOverlay({
  call, localStream, remoteStream, onAccept, onReject, onEnd, onToggleAudio, onToggleVideo, onSwitchCamera = () => {}, audioMuted = false, videoPaused = false,
}: {
  call: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera?: () => void;
  audioMuted?: boolean;
  videoPaused?: boolean;
}) {
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream;
    if (remoteAudio.current) remoteAudio.current.srcObject = remoteStream;
    if (localVideo.current) localVideo.current.srcObject = localStream;
  }, [localStream, remoteStream]);

  const isVideo = call.mode === "video";
  const incoming = call.status === "incoming";
  const failed = call.status === "error";
  const statusText = failed
    ? call.error || "通话无法建立"
    : incoming
      ? "邀请你进行" + (isVideo ? "视频" : "语音") + "通话"
      : call.status === "connected"
        ? (isVideo ? "视频" : "语音") + "通话中"
        : "正在呼叫…";

  return (
    <section className="fixed inset-0 z-[90] flex flex-col bg-[#111] text-white" aria-label="通话">
      {isVideo && <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />}
      {!isVideo && <audio ref={remoteAudio} autoPlay playsInline />}
      <div className="relative z-10 bg-gradient-to-b from-black/60 to-transparent px-6 pt-12 text-center">
        <p className="text-xl font-medium">{call.peer.displayName}</p>
        <p className="mt-2 text-sm text-white/75">{statusText}</p>
      </div>

      {!isVideo && (
        <div className="flex flex-1 items-center justify-center">
          <div className="grid h-28 w-28 place-items-center rounded-full bg-[#07c160] text-4xl">
            {call.peer.displayName.slice(0, 1) || "友"}
          </div>
        </div>
      )}

      {isVideo && localStream && (
        <video ref={localVideo} autoPlay muted playsInline className="absolute right-4 top-24 z-20 h-36 w-24 rounded-xl bg-[#333] object-cover shadow-lg" />
      )}

      <div className="relative z-10 mt-auto grid grid-cols-4 gap-4 bg-gradient-to-t from-black/70 to-transparent px-8 pb-10 pt-12">
        {incoming ? (
          <>
            <button type="button" onClick={onReject} className="col-span-1 flex flex-col items-center gap-2 text-sm">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fa5151] text-2xl">×</span>拒绝
            </button>
            <button type="button" onClick={onAccept} className="col-span-1 flex flex-col items-center gap-2 text-sm">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#07c160] text-2xl">✓</span>接听
            </button>
          </>
        ) : failed ? (
          <button type="button" onClick={onEnd} className="col-start-2 flex flex-col items-center gap-2 text-sm">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fa5151] text-2xl">×</span>关闭
          </button>
        ) : (
          <>
            <button type="button" onClick={onToggleAudio} className="flex flex-col items-center gap-2 text-xs">
              <span className={"grid h-12 w-12 place-items-center rounded-full text-xl " + (audioMuted ? "bg-[#fa5151]" : "bg-white/20")}>{audioMuted ? "×" : "♩"}</span>{audioMuted ? "已静音" : "麦克风"}
            </button>
            <button type="button" onClick={onEnd} className="flex flex-col items-center gap-2 text-xs">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fa5151] text-2xl">⌕</span>挂断
            </button>
            <button type="button" onClick={onToggleVideo} disabled={!isVideo} className="flex flex-col items-center gap-2 text-xs disabled:opacity-30">
              <span className={"grid h-12 w-12 place-items-center rounded-full text-xl " + (videoPaused ? "bg-[#fa5151]" : "bg-white/20")}>{videoPaused ? "×" : "▣"}</span>{videoPaused ? "已关闭" : "摄像头"}
            </button>
            <button type="button" onClick={onSwitchCamera} disabled={!isVideo} className="flex flex-col items-center gap-2 text-xs disabled:opacity-30">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-xl">↻</span>翻转
            </button>
          </>
        )}
      </div>
    </section>
  );
}
