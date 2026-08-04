import type { ConnStatus } from "../hooks/useChatEngine";
import { APP_NAME } from "../config/appConfig";

export function AdminHome({
  status,
  hasGroups,
  onCreate,
  onJoin,
}: {
  status: ConnStatus;
  hasGroups: boolean;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const ready = status === "online" || status === "local";
  return (
    <main className="hidden flex-1 flex-col items-center justify-center overflow-y-auto bg-[#f3efe6] px-8 py-10 text-center sm:flex">
      <div className="w-full max-w-md rounded-3xl border border-[#dfe5d9] bg-[#fffef9] p-8 shadow-sm">
        <h2 className="text-xl font-bold text-[#29362b]">{APP_NAME}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#71806f]">创建群后分享邀请码，成员验证后加入。</p>
        <div className={`mt-6 rounded-xl px-4 py-3 text-sm ${ready ? "bg-[#eaf1ec] text-[#2f5c40]" : "bg-[#fff2f2] text-[#a33c3c]"}`}>
          {status === "online" ? "已连接 · 可以创建或加入群聊" : status === "local" ? "单机调试" : "暂时无法连接服务器"}
        </div>
        <div className="mt-6 grid gap-3">
          <button type="button" disabled={!ready} onClick={onCreate} className="rounded-xl bg-[#3d6b4f] p-4 text-left text-white disabled:opacity-40">
            <span className="block font-semibold">创建群聊 · 发邀请码</span>
            <span className="mt-1 block text-[11px] text-white/85">成为群管理员</span>
          </button>
          <button type="button" disabled={!ready} onClick={onJoin} className="rounded-xl border border-[#dfe5d9] bg-white p-4 text-left text-[#29362b] disabled:opacity-40">
            <span className="block font-semibold">输入邀请码 · 加入</span>
            <span className="mt-1 block text-[11px] text-[#71806f]">进入对应的加密群</span>
          </button>
        </div>
        {hasGroups && <p className="mt-6 text-xs text-[#8a9a82]">从左侧选择已有群继续聊天。</p>}
      </div>
    </main>
  );
}
