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
}: {
  group: LocalGroup;
  members: GroupMember[];
  myDeviceId: string;
  onClose: () => void;
  onRefresh: () => void;
  onKick: (deviceId: string) => void;
}) {
  const onlineCount = members.filter((m) => m.online).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 w-full max-w-[400px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h2 className="text-lg font-semibold">群成员</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              「{group.name}」· {members.length} 人 · 在线 {onlineCount}
            </p>
          </div>
          <button type="button" className="text-slate-400 hover:text-white px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#21262d] text-slate-300"
            onClick={onRefresh}
          >
            刷新
          </button>
          {group.isAdmin && (
            <span className="text-[10px] text-slate-600 self-center">管理员可踢出成员</span>
          )}
        </div>

        {members.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
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
                  className="flex items-center gap-3 rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-2.5"
                >
                  <div className="relative shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                        m.isAdmin ? "bg-indigo-600" : "bg-slate-600"
                      }`}
                    >
                      {(m.displayName || "?").slice(0, 1)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d1117] ${
                        m.online ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                      title={m.online ? "在线" : "离线"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {m.displayName || "未命名"}
                      {isMe && (
                        <span className="text-[9px] text-slate-500 font-normal">我</span>
                      )}
                      {m.isAdmin && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-900/60 text-indigo-300">
                          管理
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {m.online ? "在线" : "离线"}
                      {m.joinedAt ? ` · 加入 ${formatJoined(m.joinedAt)}` : ""}
                    </div>
                    <div className="text-[9px] text-slate-700 font-mono truncate" title={m.deviceId}>
                      {m.deviceId.slice(0, 8)}…
                    </div>
                  </div>
                  {canKick && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-red-950/50 text-red-400 border border-red-900/50 hover:bg-red-900/40"
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
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[10px] text-slate-600 mt-4 leading-relaxed">
          说明：踢出仅取消服务器成员资格；历史密文仍可能被已持有密钥的设备解密（当前无前向保密）。
        </p>

        <button
          type="button"
          className="w-full mt-3 py-2.5 text-sm rounded-xl bg-[#21262d] text-slate-200"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
