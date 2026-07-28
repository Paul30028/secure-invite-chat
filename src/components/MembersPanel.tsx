import type { GroupMember, LocalGroup } from "../lib/types";

function formatJoined(ts: number): string {
  if (!ts) return "";
  // 服务端为秒；兼容毫秒
  const ms = ts > 1e12 ? ts : ts * 1000;
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * 群成员列表；管理员可踢人（不能踢管理员/自己）
 */
export function MembersPanel({
  group,
  members,
  myDeviceId,
  onClose,
  onRefresh,
  onKick,
  onShareHistory,
  onMute,
}: {
  group: LocalGroup;
  members: GroupMember[];
  myDeviceId: string;
  onClose: () => void;
  onRefresh: () => void;
  onKick: (deviceId: string) => void;
  onShareHistory?: (deviceId: string) => void;
  onMute?: (deviceId: string) => void;
}) {
  const onlineCount = members.filter((m) => m.online).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-[400px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h2 className="text-lg font-semibold">群成员</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              「{group.name}」· {members.length} 人 · 在线 {onlineCount}
            </p>
          </div>
          <button type="button" className="text-[#8a8a8a] hover:text-[#1f2329] px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#f3efe6] text-[#1f2329]"
            onClick={onRefresh}
          >
            刷新
          </button>
          {group.isAdmin && (
            <span className="text-[10px] text-[#8a8a8a] self-center">管理员可踢出成员</span>
          )}
        </div>

        {members.length === 0 ? (
          <p className="text-xs text-[#6b7280] py-8 text-center">
            暂无成员数据，点刷新或等待同步
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => {
              const isMe = m.deviceId === myDeviceId;
              const canKick = group.isAdmin && !m.isAdmin && !isMe;
              return (
                <li
                  key={m.deviceId}
                  className="flex items-center gap-3 rounded-xl border border-black/10 bg-[#f9f7f2] px-3 py-2.5"
                >
                  <div className="relative shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                        m.isAdmin ? "bg-[#3d6b4f]" : "bg-[#8a9a82]"
                      }`}
                    >
                      {(m.displayName || "?").slice(0, 1)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#f9f7f2] ${
                        m.online ? "bg-[#3d6b4f]" : "bg-[#c9ccd2]"
                      }`}
                      title={m.online ? "在线" : "离线"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {m.displayName || "未命名"}
                      {isMe && (
                        <span className="text-[9px] text-[#6b7280] font-normal">我</span>
                      )}
                      {m.isAdmin && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-[#eaf1ec] text-[#2f5c40]">
                          管理
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#6b7280] truncate">
                      {m.online ? "在线" : "离线"}
                      {m.joinedAt ? ` · 加入 ${formatJoined(m.joinedAt)}` : ""}
                    </div>
                    <div className="text-[9px] text-[#a3a3a3] font-mono truncate" title={m.deviceId}>
                      {m.deviceId.slice(0, 8)}…
                    </div>
                  </div>
                  {canKick && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#fff2f2] text-[#c0392b] border border-[#f3d4d4] hover:bg-[#ffe6e6]"
                      onClick={() => {
                        if (
                          confirm(
                            `确定将「${m.displayName}」移出本群？\n对方将无法继续收发本群消息。`
                          )
                        ) {
                          onKick(m.deviceId);
                        }
                      }}
                    >
                      踢出
                    </button>
                  )}
                  {canKick && onMute && <button type="button" className="shrink-0 text-[11px] px-2 py-1.5 rounded-lg bg-[#fff8e8] text-[#805d1b]" onClick={() => onMute(m.deviceId)}>禁言</button>}
                  {group.isAdmin && !isMe && onShareHistory && (
                    <button type="button" className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-[#f3efe6] text-[#1f2329]" onClick={() => onShareHistory(m.deviceId)}>
                      分享历史
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[10px] text-[#8a8a8a] mt-4 leading-relaxed">
          说明：踢出会自动为剩余成员轮换群密钥，被踢设备之后无法解密新消息；但对方在被踢前已经收到的历史消息，仍会留存在其本机。
        </p>

        <button
          type="button"
          className="w-full mt-3 py-2.5 text-sm rounded-xl bg-[#f3efe6] text-[#1f2329]"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
