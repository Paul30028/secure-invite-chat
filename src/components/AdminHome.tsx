import type { ConnStatus } from "../hooks/useChatEngine";
import { APP_NAME } from "../config/appConfig";
import { classifyWsUrl, getWsUrl } from "../lib/settings";

export function AdminHome({
  status,
  hasGroups,
  onCreate,
  onJoin,
  onSettings,
}: {
  status: ConnStatus;
  hasGroups: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onSettings: () => void;
}) {
  const ready = status === "online" || status === "local";
  const info = classifyWsUrl(getWsUrl());

  return (
    <div className="hidden sm:flex flex-1 flex-col items-center justify-center px-8 py-10 text-center overflow-y-auto">
      <div className="w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-2">{APP_NAME}</h2>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          直连模式 · 创建群发邀请码，成员填码入群
        </p>

        <div
          className={`rounded-xl px-4 py-2.5 text-xs mb-6 ${
            ready
              ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
              : "bg-amber-950/40 border border-amber-800 text-amber-200"
          }`}
        >
          {status === "online"
            ? `已连接 · ${info.normalized}`
            : status === "local"
              ? "单机调试"
              : "未连接"}
          <button type="button" className="underline ml-2" onClick={onSettings}>
            设置
          </button>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={onCreate}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 p-4 text-left text-white"
          >
            <div className="font-semibold">创建群 · 发邀请码</div>
            <p className="text-[11px] text-indigo-100/80 mt-1">成为管理端</p>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={onJoin}
            className="rounded-xl bg-[#21262d] hover:bg-[#2d333b] disabled:opacity-40 p-4 text-left border border-[#30363d]"
          >
            <div className="font-semibold text-slate-100">输入邀请码 · 加入</div>
            <p className="text-[11px] text-slate-400 mt-1">进入对应加密群</p>
          </button>
        </div>

        {hasGroups && (
          <p className="text-xs text-slate-500 mt-6">左侧选择已有群继续聊天</p>
        )}
      </div>
    </div>
  );
}
