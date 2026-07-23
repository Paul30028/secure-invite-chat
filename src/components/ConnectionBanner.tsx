import type { ConnStatus } from "../hooks/useChatEngine";
import { getWsUrl } from "../lib/settings";

export function ConnectionBanner({
  status,
  onSettings,
}: {
  status: ConnStatus;
  onSettings: () => void;
}) {
  if (status === "online") return null;

  if (status === "local") {
    return (
      <button
        type="button"
        onClick={onSettings}
        className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 border-b bg-[#fff8e8] border-[#f1d8a5] text-[#805d1b] sm:px-4 sm:py-2 sm:text-[12px]"
      >
        <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
        <span className="flex-1">单机模式 · 手机无法进群，请连服务器</span>
        <span className="text-[11px] underline shrink-0">设置</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSettings}
      className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 border-b ${
        status === "connecting"
          ? "bg-[#fff8e8] border-[#f1d8a5] text-[#805d1b]"
          : "bg-[#fff2f2] border-[#efc5c5] text-[#a33c3c]"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          status === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-400"
        }`}
      />
      <span className="flex-1 min-w-0 truncate">
        {status === "connecting" ? "连接中…" : "未连接"} · {getWsUrl()}
      </span>
      <span className="text-[11px] underline shrink-0">设置</span>
    </button>
  );
}
