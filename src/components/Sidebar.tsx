import { useRef, useState } from "react";
import type { LocalGroup } from "../lib/types";
import type { ConnStatus } from "../hooks/useChatEngine";
import type { ConversationPreference } from "../lib/privateStore";

export function Sidebar({ groups, activeGroupId, onSelect, onCreate, onJoin, onSettings, onOpenAdmin, status, mobileOpen, preferences = {}, onConversationAction, dailyNotice }: {
  groups: LocalGroup[]; activeGroupId: string | null; onSelect: (id: string) => void;
  onCreate: () => void; onJoin: () => void; onSettings: () => void; onOpenAdmin?: () => void;
  status: ConnStatus; mobileOpen?: boolean; preferences?: Record<string, ConversationPreference>;
  onConversationAction?: (id: string, action: "pin" | "mute" | "unread" | "hide") => void;
  dailyNotice?: { scripture?: string; dailyDevotion?: string };
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const touchStart = useRef<Record<string, number>>({});
  const visible = groups.filter((group) => !preferences[group.groupId]?.hidden).sort((a, b) => Number(!!preferences[b.groupId]?.pinned) - Number(!!preferences[a.groupId]?.pinned));
  const active = groups.find((group) => group.groupId === activeGroupId);
  const statusText = status === "online" ? "已连接" : status === "connecting" ? "连接中" : "暂时离线";

  return <aside className={`${mobileOpen === false ? "hidden" : "flex"} sm:flex w-full sm:w-[340px] shrink-0 bg-[#fffef9] border-r border-[#e6e3d7] text-[#2c382d] flex-col h-full`}>
    <header className="px-5 pt-5 pb-3 flex items-center justify-between">
      <h1 className="text-[25px] font-semibold tracking-tight">消息</h1>
      <button type="button" onClick={onSettings} className="text-xs text-[#7d8b7b]">{statusText}</button>
    </header>
    <div className="mx-4 mb-3 rounded-xl border border-[#ead8a8] bg-[#fff9e9] px-3 py-3 flex gap-3 text-left">
      <span className="text-2xl leading-none">✦</span>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#927136]">每日箴言</p><p className="text-xs leading-relaxed mt-1 text-[#655c48] truncate">{dailyNotice?.scripture || dailyNotice?.dailyDevotion || "每日安静片刻，彼此扶持同行。"}</p></div>
      <span className="self-center text-[#a98749]">›</span>
    </div>
    <div className="flex-1 overflow-y-auto px-2 pb-2">
      {visible.length === 0 ? <p className="text-center text-sm text-[#96a092] mt-12">还没有聊天<br /><span className="text-xs">创建群聊或输入邀请码加入</span></p> : visible.map((group) => <div key={group.groupId} className="relative">
        <button type="button" onClick={() => onSelect(group.groupId)} onContextMenu={(event) => { event.preventDefault(); setMenu(group.groupId); }}
          onTouchStart={(event) => { touchStart.current[group.groupId] = event.touches[0]?.clientX || 0; }}
          onTouchEnd={(event) => { if ((touchStart.current[group.groupId] || 0) - (event.changedTouches[0]?.clientX || 0) > 48) setMenu(group.groupId); }}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left ${activeGroupId === group.groupId ? "bg-[#eef3ea]" : "hover:bg-[#f7f7f1]"}`}>
          <span className={`w-11 h-11 rounded-full grid place-items-center text-white font-semibold ${group.isAdmin ? "bg-[#597d5d]" : "bg-[#8b9b88]"}`}>{group.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><b className="text-sm font-medium truncate">{preferences[group.groupId]?.pinned && "⌖ "}{group.name}</b><em className="not-italic text-[10px] text-[#929991]">{preferences[group.groupId]?.unread ? "新消息" : ""}</em></span><span className="block text-xs truncate mt-1 text-[#8c958a]">{preferences[group.groupId]?.muted ? "已静音" : group.displayName}</span></span>
        </button>
        {menu === group.groupId && <div className="absolute right-2 top-2 z-20 bg-[#405747] text-white rounded-lg p-1 shadow-lg flex text-[11px]">{(["pin", "mute", "unread", "hide"] as const).map((action) => <button key={action} className="px-2 py-1.5" onClick={() => { onConversationAction?.(group.groupId, action); setMenu(null); }}>{action === "pin" ? "置顶" : action === "mute" ? "静音" : action === "unread" ? "未读" : "删除"}</button>)}</div>}
      </div>)}</div>
    <div className="px-4 pb-4 pt-3 border-t border-[#ece9de]">
      {active?.isAdmin && onOpenAdmin && <button type="button" className="w-full text-xs text-[#537757] mb-2" onClick={onOpenAdmin}>管理邀请码</button>}
      <div className="grid grid-cols-2 gap-3"><button type="button" className="rounded-xl bg-[#edf2e9] py-4 text-sm font-medium text-[#4d704f]" onClick={onCreate}>＋<span className="block mt-1">创建群聊</span></button><button type="button" className="rounded-xl bg-[#edf2e9] py-4 text-sm font-medium text-[#4d704f]" onClick={onJoin}>＋<span className="block mt-1">加入群聊</span></button></div>
    </div>
  </aside>;
}
