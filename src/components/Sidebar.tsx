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
      } sm:flex w-full sm:w-72 shrink-0 bg-[#0d1117] border-r border-[#21262d] flex-col h-full`}
    >
      <div className="px-4 py-4 border-b border-[#21262d] flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold">邀群密聊</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-slate-400 px-2 py-1 rounded bg-[#161b22]"
            onClick={onSettings}
          >
            设置
          </button>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            {statusText}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {groups.length === 0 && (
          <p className="text-xs text-slate-500 px-4 py-8 text-center leading-relaxed">
            还没有群
            <br />
            创建并发邀请码，或输入邀请码加入
          </p>
        )}
        {groups.map((g) => (
          <button
            key={g.groupId}
            type="button"
            onClick={() => onSelect(g.groupId)}
            className={`w-full text-left px-4 py-3.5 flex items-center gap-3 ${
              activeGroupId === g.groupId ? "bg-[#161b22]" : "hover:bg-[#161b22]/60"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                g.isAdmin ? "bg-indigo-600" : "bg-slate-600"
              }`}
            >
              {g.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                {g.name}
                {g.isAdmin && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-600/40 text-indigo-200">
                    管理
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">{g.displayName}</div>
            </div>
          </button>
        ))}
      </div>

      {active?.isAdmin && onOpenAdmin && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="w-full py-2.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            查看 / 分享邀请码
          </button>
        </div>
      )}

      <div
        className="p-3 border-t border-[#21262d] flex gap-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          className="flex-1 px-3 py-2.5 text-xs rounded-lg bg-indigo-600 text-white"
          onClick={onCreate}
        >
          创建并发码
        </button>
        <button
          type="button"
          className="flex-1 px-3 py-2.5 text-xs rounded-lg bg-[#21262d] text-slate-200"
          onClick={onJoin}
        >
          填邀请码
        </button>
      </div>
    </aside>
  );
}
