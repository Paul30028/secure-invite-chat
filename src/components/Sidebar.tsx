import { useRef, useState } from "react";
import type { LocalGroup } from "../lib/types";
import type { ConnStatus } from "../hooks/useChatEngine";
import type { ConversationPreference } from "../lib/privateStore";

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
  preferences = {},
  onConversationAction,
}: {
  groups: LocalGroup[];
  activeGroupId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onSettings: () => void;
  onOpenAdmin?: () => void;
  status: ConnStatus;
  mobileOpen?: boolean;
  preferences?: Record<string, ConversationPreference>;
  onConversationAction?: (id: string, action: "pin" | "mute" | "unread" | "hide") => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const start = useRef<Record<string, number>>({});
  const list = groups
    .filter((g) => !preferences[g.groupId]?.hidden)
    .sort((a, b) => Number(!!preferences[b.groupId]?.pinned) - Number(!!preferences[a.groupId]?.pinned));
  const active = groups.find((g) => g.groupId === activeGroupId);
  const statusText =
    status === "online" ? "已连接" : status === "local" ? "单机" : status === "connecting" ? "连接中" : "未连接";

  return (
    <aside
      className={`${mobileOpen === false ? "hidden" : "flex"} sm:flex w-full sm:w-72 shrink-0 bg-white border-r border-black/5 text-[#1f2329] flex-col h-full`}
    >
      <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center">
        <h1 className="text-base font-semibold">消息</h1>
        <button className="text-xs text-[#6b7280]" onClick={onSettings}>
          设置 · {statusText}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {list.length === 0 ? (
          <p className="text-xs text-[#8a8a8a] p-8 text-center">还没有聊天</p>
        ) : (
          list.map((g) => (
            <div key={g.groupId} className="relative">
              <button
                type="button"
                onClick={() => onSelect(g.groupId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(g.groupId);
                }}
                onTouchStart={(e) => {
                  start.current[g.groupId] = e.touches[0]?.clientX || 0;
                }}
                onTouchEnd={(e) => {
                  if ((start.current[g.groupId] || 0) - (e.changedTouches[0]?.clientX || 0) > 48)
                    setMenu(g.groupId);
                }}
                className={`w-full text-left px-3 py-3 flex items-center gap-3 ${
                  activeGroupId === g.groupId ? "bg-[#eaf1ec]" : "hover:bg-[#f3efe6]"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-md grid place-items-center text-white ${
                    g.isAdmin ? "bg-[#3d6b4f]" : "bg-[#8a9a82]"
                  }`}
                >
                  {g.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate text-[#1f2329]">
                    {preferences[g.groupId]?.pinned && "📌 "}
                    {g.name}
                  </p>
                  <p className="text-xs text-[#8a8a8a]">
                    {preferences[g.groupId]?.muted ? "已静音" : g.displayName}
                  </p>
                </div>
              </button>
              {menu === g.groupId && (
                <div className="absolute right-2 top-2 z-20 bg-white shadow-lg border border-black/10 rounded-lg p-1 flex text-[10px]">
                  {(["pin", "mute", "unread", "hide"] as const).map((a) => (
                    <button
                      key={a}
                      className="px-2 py-1 text-[#1f2329]"
                      onClick={() => {
                        onConversationAction?.(g.groupId, a);
                        setMenu(null);
                      }}
                    >
                      {a === "pin" ? "置顶" : a === "mute" ? "静音" : a === "unread" ? "未读" : "删除"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {active?.isAdmin && onOpenAdmin && (
        <div className="px-3 pb-2">
          <button className="w-full py-2 text-sm rounded-xl bg-[#3d6b4f] text-white" onClick={onOpenAdmin}>
            管理邀请码
          </button>
        </div>
      )}

      <div className="p-3 border-t border-black/5 flex gap-2">
        <button className="flex-1 py-2 text-xs rounded bg-[#3d6b4f] text-white" onClick={onCreate}>
          发起群聊
        </button>
        <button className="flex-1 py-2 text-xs rounded bg-[#f3efe6] text-[#1f2329]" onClick={onJoin}>
          加入群聊
        </button>
      </div>
    </aside>
  );
}
