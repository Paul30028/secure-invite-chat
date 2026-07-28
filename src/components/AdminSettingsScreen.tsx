import type { LocalGroup } from "../lib/types";

export function AdminSettingsScreen({
  group,
  onBack,
  onOpenNotice,
  onOpenMembers,
  onOpenInvite,
  onOpenKeys,
  onOpenMaintenance,
  onOpenDiagnostics,
  onOpenAuditLog,
}: {
  group: LocalGroup;
  onBack: () => void;
  onOpenNotice: () => void;
  onOpenMembers: () => void;
  onOpenInvite: () => void;
  onOpenKeys: () => void;
  onOpenMaintenance: () => void;
  onOpenDiagnostics: () => void;
  onOpenAuditLog: () => void;
}) {
  const rows: Array<{ icon: string; label: string; desc: string; onClick: () => void }> = [
    { icon: "📣", label: "每日公告管理", desc: "编辑并发布今日公告", onClick: onOpenNotice },
    { icon: "👥", label: "群组与成员管理", desc: "查看成员、移除或禁言", onClick: onOpenMembers },
    { icon: "🎟️", label: "邀请码管理", desc: "有效期、撤销与重新生成", onClick: onOpenInvite },
    { icon: "🔑", label: "密钥管理", desc: "立即轮换群组密钥", onClick: onOpenKeys },
    { icon: "🛠️", label: "维护模式", desc: "暂停普通成员收发消息", onClick: onOpenMaintenance },
    { icon: "📶", label: "连接与服务器诊断", desc: "WebSocket、TURN 与延迟检测", onClick: onOpenDiagnostics },
    { icon: "📄", label: "管理员操作记录", desc: "查看本机审计日志", onClick: onOpenAuditLog },
  ];

  return (
    <main className="flex-1 overflow-y-auto bg-[#f3efe6]">
      <header className="h-14 flex items-center px-2 border-b border-black/5 bg-white">
        <button type="button" className="px-2 py-1 text-[#3d6b4f]" onClick={onBack}>
          {"‹"}
        </button>
        <h1 className="text-base font-semibold mx-auto pr-8">管理员设置</h1>
      </header>

      <div className="mx-4 mt-3 bg-[#fff8e8] text-[#805d1b] rounded-xl px-4 py-2.5 text-xs">
        「{group.name}」· 仅限授权管理员使用
      </div>

      <section className="bg-white mt-3 divide-y divide-black/5">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={row.onClick}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          >
            <span className="text-lg w-7 text-center">{row.icon}</span>
            <span className="flex-1">
              <div className="text-sm">{row.label}</div>
              <div className="text-xs text-[#8a8a8a] mt-0.5">{row.desc}</div>
            </span>
            <span className="text-[#c9ccd2]">{">"}</span>
          </button>
        ))}
      </section>

      <div className="px-4 mt-4 pb-8">
        <button
          type="button"
          onClick={onBack}
          className="w-full border border-[#d33] text-[#d33] rounded-xl py-3 text-sm"
        >
          退出管理员模式
        </button>
      </div>
    </main>
  );
}
