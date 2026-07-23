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
  const online = status === "local" || status === "online";
  const hideOnMobile = mobileOpen === false;
  const active = groups.find((group) => group.groupId === activeGroupId);

  return (
    <aside className={`${hideOnMobile ? "hidden" : "flex"} sm:flex h-full w-full shrink-0 flex-col border-r border-[#e7e7e7] bg-[#f7f7f7] sm:w-72`}>
      <header className="flex items-center justify-between border-b border-[#e7e7e7] px-4 py-4">
        <div>
          <h1 className="text-base font-semibold text-[#191919]">聊天</h1>
          <p className="mt-0.5 text-[11px] text-[#888]">
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-[#07c160]" : "bg-[#fa5151]"}`} />
            {online ? "已连接" : "连接中"}
          </p>
        </div>
        <button type="button" className="rounded-lg px-2 py-1 text-sm text-[#666] hover:bg-[#e9e9e9]" onClick={onSettings}>•••</button>
      </header>

      <div className="flex-1 overflow-y-auto py-1">
        {groups.length === 0 && (
          <p className="px-7 py-10 text-center text-sm leading-6 text-[#999]">还没有聊天。<br />创建群，或输入邀请码加入。</p>
        )}
        {groups.map((group) => (
          <button key={group.groupId} type="button" onClick={() => onSelect(group.groupId)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${activeGroupId === group.groupId ? "bg-[#e9e9e9]" : "hover:bg-[#efefef]"}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-base font-semibold text-white ${group.isAdmin ? "bg-[#07c160]" : "bg-[#8aa1b5]"}`}>
              {group.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#191919]">{group.name}</p>
              <p className="mt-0.5 truncate text-xs text-[#999]">{group.displayName}</p>
            </div>
          </button>
        ))}
      </div>

      {active?.isAdmin && onOpenAdmin && (
        <div className="px-3 pb-2">
          <button type="button" onClick={onOpenAdmin} className="w-full rounded-lg bg-[#07c160] py-2.5 text-sm font-medium text-white">分享邀请码</button>
        </div>
      )}

      <footer className="grid grid-cols-3 border-t border-[#e7e7e7] bg-white px-2 pt-2 sm:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <button type="button" className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#07c160]" onClick={() => activeGroupId && onSelect(activeGroupId)}>
          <span className="text-lg leading-none">◉</span>聊天
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#555]" onClick={onCreate}>
          <span className="text-lg leading-none">＋</span>新建
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#555]" onClick={onJoin}>
          <span className="text-lg leading-none">⌁</span>加入
        </button>
      </footer>
      <footer className="hidden gap-2 border-t border-[#e7e7e7] p-3 sm:flex">
        <button type="button" className="flex-1 rounded-lg bg-[#07c160] py-2.5 text-sm font-medium text-white" onClick={onCreate}>新建聊天</button>
        <button type="button" className="flex-1 rounded-lg bg-white py-2.5 text-sm text-[#444] ring-1 ring-[#dedede]" onClick={onJoin}>加入聊天</button>
      </footer>
    </aside>
  );
}
