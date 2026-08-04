import type { GroupMember, LocalGroup } from "../lib/types";

function formatJoined(ts: number): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function MembersPanel({ group, members, myDeviceId, onClose, onRefresh, onKick, onShareHistory, onMute }: {
  group: LocalGroup; members: GroupMember[]; myDeviceId: string; onClose: () => void; onRefresh: () => void; onKick: (deviceId: string) => void; onShareHistory?: (deviceId: string) => void; onMute?: (deviceId: string) => void;
}) {
  const onlineCount = members.filter((m) => m.online).length;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"><div className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-[#dfe5d9] bg-[#fffef9] p-5 text-[#29362b] shadow-xl">
    <div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">群成员</h2><p className="mt-0.5 text-xs text-[#849083]">「{group.name}」· {members.length} 人 · 在线 {onlineCount}</p></div><button type="button" className="px-2 text-[#71806f]" onClick={onClose}>✕</button></div>
    <div className="mb-3 flex gap-2"><button type="button" className="rounded-lg bg-[#edf1e8] px-3 py-1.5 text-[11px] text-[#3d6043]" onClick={onRefresh}>刷新</button>{group.isAdmin && <span className="self-center text-[10px] text-[#849083]">管理员可移除成员或暂时禁言</span>}</div>
    {members.length === 0 ? <p className="py-8 text-center text-xs text-[#849083]">暂无成员数据，点刷新或等待同步</p> : <ul className="space-y-2">{members.map((m) => {
      const isMe = m.deviceId === myDeviceId; const canManage = group.isAdmin && !m.isAdmin && !isMe;
      return <li key={m.deviceId} className="flex items-center gap-3 rounded-xl border border-[#dfe5d9] bg-[#fffef9] px-3 py-2.5 shadow-sm"><div className="relative shrink-0"><div className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white ${m.isAdmin ? "bg-[#557c5b]" : "bg-[#879d88]"}`}>{(m.displayName || "?").slice(0, 1)}</div><span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${m.online ? "bg-[#79ad74]" : "bg-[#c3ccc1]"}`} title={m.online ? "在线" : "离线"} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 truncate text-sm font-medium">{m.displayName || "未命名"}{isMe && <span className="text-[9px] font-normal text-[#849083]">我</span>}{m.isAdmin && <span className="rounded bg-[#e9f0e7] px-1 py-0.5 text-[9px] text-[#3d6043]">管理</span>}</div><div className="mt-0.5 truncate text-[10px] text-[#849083]">{m.online ? "在线" : "离线"}{m.joinedAt ? ` · 加入 ${formatJoined(m.joinedAt)}` : ""}</div></div>{canManage && <div className="flex shrink-0 flex-col gap-1"><button type="button" className="rounded-lg border border-[#e4b8b8] bg-[#fffafa] px-2 py-1 text-[11px] text-[#a33c3c]" onClick={() => { if (confirm(`确定将「${m.displayName}」移出本群？\n成员变动后会自动轮换群密钥。`)) onKick(m.deviceId); }}>移出</button>{onMute && <button type="button" className="rounded-lg border border-[#e8dcc8] bg-[#fff8ec] px-2 py-1 text-[11px] text-[#806322]" onClick={() => onMute(m.deviceId)}>禁言</button>}{onShareHistory && <button type="button" className="rounded-lg border border-[#dfe5d9] bg-[#edf1e8] px-2 py-1 text-[11px] text-[#3d6043]" onClick={() => onShareHistory(m.deviceId)}>分享历史</button>}</div>}</li>;
    })}</ul>}
    <p className="mt-4 text-[10px] leading-relaxed text-[#71806f]">说明：移出成员后，管理员会轮换群密钥；被移出的设备无法解密轮换后发送的新消息。历史消息仍受当时密钥的保护范围影响。</p>
    <button type="button" className="mt-3 w-full rounded-xl border border-[#cfdcc9] bg-[#fffef9] py-2.5 text-sm text-[#3d6043]" onClick={onClose}>关闭</button>
  </div></div>;
}
