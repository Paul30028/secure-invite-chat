import type { LocalGroup } from "../lib/types";
import type { ConnStatus } from "../hooks/useChatEngine";

export function Sidebar({
  groups,
  activeGroupId,
  onSelect,
  onCreate,
  onJoin,
  onSettings,
  onOpenAdmin,
  status,
  mobileOpen,
}: {
  groups: LocalGroup[];
  activeGroupId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onSettings: () => void;
  onOpenAdmin?: () => void;
  onOpenMultiGuide?: () => void;
  status: ConnStatus;
  mobileOpen?: boolean;
}) {
  const statusColor =
    status === "local" || status === "online"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-red-500";
  const statusText =
    status === "local"
      ? "单机"
      : status === "online"
        ? "已连接"
        : status === "connecting"
          ? "连接中"
          : "未连接";

  const hideOnMobile = mobileOpen === false;
  const active = groups.find((g) => g.groupId === activeGroupId);

  return (
    <aside
      className={`${
        hideOnMobile ? "hidden" : "flex"
      } sm:flex w-full sm:w-72 shrink-0 bg-[#2e2e2e] border-r border-[#242424] text-white flex-col h-full`}
    >
      <div className="px-4 py-3 border-b border-[#242424] flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-wide">微信式密聊</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-zinc-300 px-2 py-1 rounded bg-[#3a3a3a] hover:bg-[#464646]"
            onClick={onSettings}
          >
            设置
          </button>
          <div className="flex items-center gap-1.5 text-xs text-zinc-300">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            {statusText}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {groups.length === 0 && (
          <p className="text-xs text-zinc-400 px-4 py-8 text-center leading-relaxed">
            还没有聊天
            <br />
            像微信一样，先创建群聊或扫一扫/粘贴邀请码加入
          </p>
        )}
        {groups.map((g) => (
          <button
            key={g.groupId}
            type="button"
            onClick={() => onSelect(g.groupId)}
            className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors ${
              activeGroupId === g.groupId ? "bg-[#3a3a3a]" : "hover:bg-[#363636]"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-md flex items-center justify-center text-sm font-semibold shrink-0 ${
                g.isAdmin ? "bg-[#07c160]" : "bg-[#6b7280]"
              }`}
            >
              {g.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                {g.name}
                {g.isAdmin && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#07c160]/20 text-[#95ec69]">
                    管理
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-400 truncate">{g.displayName}</div>
            </div>
          </button>
        ))}
      </div>

      {active?.isAdmin && onOpenAdmin && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="w-full py-2.5 text-sm rounded-xl bg-[#07c160] hover:bg-[#06ad56] text-white font-medium"
          >
            查看 / 分享邀请码
          </button>
        </div>
      )}

      <div
        className="p-3 border-t border-[#242424] flex gap-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          className="flex-1 px-3 py-2.5 text-xs rounded-md bg-[#07c160] text-white"
          onClick={onCreate}
        >
          发起群聊
        </button>
        <button
          type="button"
          className="flex-1 px-3 py-2.5 text-xs rounded-md bg-[#3a3a3a] text-zinc-100"
          onClick={onJoin}
        >
          加入群聊
        </button>
      </div>
    </aside>
  );
}
