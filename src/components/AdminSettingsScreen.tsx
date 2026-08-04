import type { LocalGroup } from "../lib/types";

export function AdminSettingsScreen({
  group,
  onBack,
  onOpenNotice,
  onOpenMembers,
  onOpenInvite,
  onOpenKeys,
  onOpenMaintenance,
}: {
  group: LocalGroup;
  onBack: () => void;
  onOpenNotice: () => void;
  onOpenMembers: () => void;
  onOpenInvite: () => void;
  onOpenKeys: () => void;
  onOpenMaintenance: () => void;
}) {
  const rows: Array<{ icon: string; label: string; desc: string; onClick: () => void }> = [
    { icon: "📣", label: "每日公告管理", desc: "编辑并发布今日公告", onClick: onOpenNotice },
    { icon: "👥", label: "群组与成员管理", desc: "查看成员、移除或禁言", onClick: onOpenMembers },
    { icon: "🎟️", label: "邀请码管理", desc: "有效期、撤销与重新生成", onClick: onOpenInvite },
    { icon: "🔑", label: "密钥管理", desc: "立即轮换群组密钥", onClick: onOpenKeys },
    { icon: "🛠️", label: "维护模式", desc: "暂停普通成员收发消息", onClick: onOpenMaintenance },
  ];

  return (
    <main className="flex-1 overflow-y-auto bg-[#fbfaf4] text-[#29362b]">
      <header className="h-14 flex items-center px-2 border-b border-[#e4eadf] bg-[#fffef9]">
        <button type="button" className="px-2 py-1 text-[#3d6b4f]" onClick={onBack}>
          {"‹"}
        </button>
        <h1 className="text-base font-semibold mx-auto pr-8">管理员设置</h1>
      </header>

      <div className="mx-4 mt-3 rounded-xl border border-[#dfe5d9] bg-[#edf1e8] px-4 py-2.5 text-xs text-[#3d6043]">
        「{group.name}」· 仅限授权管理员使用
      </div>

      <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#dfe5d9] bg-white divide-y divide-[#edf0e9] shadow-sm">
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
          className="w-full border border-[#d9a5a5] bg-[#fffafa] text-[#a33c3c] rounded-xl py-3 text-sm"
        >
          退出管理员模式
        </button>
      </div>
    </main>
  );
}
