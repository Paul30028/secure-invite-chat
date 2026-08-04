import { useState } from "react";
import type { LocalGroup } from "../lib/types";
import type { PendingInvite } from "../lib/privateStore";

export function InvitesPage({
  pending,
  groups,
  onStage,
  onAccept,
  onRemove,
  onCreate,
  onOpenAdmin,
}: {
  pending: PendingInvite[];
  groups: LocalGroup[];
  onStage: (raw: string) => void;
  onAccept: (raw: string) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
  onOpenAdmin: (group: LocalGroup) => void;
}) {
  const [raw, setRaw] = useState("");
  const adminGroups = groups.filter((group) => group.isAdmin);

  const stageInvite = () => {
    const clean = raw.trim();
    if (!clean) return;
    onStage(clean);
    setRaw("");
  };

  return (
    <main className="relative flex-1 overflow-y-auto bg-[#fbfaf4] px-4 pb-8 pt-6 text-[#29362b]">
      <img
        src="/assets/wheat-fish.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-full w-full scale-110 object-cover opacity-[0.08] blur-xl"
      />
      <div className="relative mx-auto max-w-md">
        <header className="mt-8 flex flex-col items-center text-center">
          <div className="grid h-24 w-24 place-items-center rounded-[28px] border border-[#dfe5d9] bg-[#eef4ea] text-4xl text-[#3d6b4f] shadow-sm">
            👥
          </div>
          <h1 className="mt-5 text-[30px] font-semibold tracking-wide text-[#2f5036]">加入群聊</h1>
          <p className="mt-2 text-sm text-[#7b8579]">输入群聊邀请码即可加入</p>
        </header>

        <section className="mt-8 rounded-[18px] border border-[#dfe5d9] bg-[#fffef9]/95 p-4 shadow-[0_8px_22px_rgba(61,74,54,0.08)]">
          <p className="text-sm font-semibold text-[#344236]">通过邀请码加入</p>
          <p className="mt-1 text-xs leading-relaxed text-[#849083]">粘贴后会先进入待确认列表，确认时再走真实入群流程。</p>
          <div className="mt-4 flex items-stretch rounded-xl border border-[#dfe5d9] bg-white focus-within:border-[#66876b]">
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="请输入邀请码"
            />
            <button
              type="button"
              className="px-4 text-sm font-medium text-[#4d7452] disabled:text-[#b5baaf]"
              disabled={!raw.trim()}
              onClick={stageInvite}
            >
              粘贴
            </button>
          </div>
          <button
            type="button"
            disabled={!raw.trim()}
            className="mt-5 w-full rounded-xl bg-[#557c5b] py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-45"
            onClick={stageInvite}
          >
            加入群聊
          </button>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#344236]">待确认邀请</h2>
            <span className="text-xs text-[#8f988c]">{pending.length} 个</span>
          </div>
          {pending.length ? (
            <ul className="space-y-2">
              {pending.map((invite) => (
                <li
                  key={invite.id}
                  className="rounded-2xl border border-[#dfe5d9] bg-[#fffef9]/95 p-3 shadow-sm"
                >
                  <p className="break-all text-xs leading-relaxed text-[#657165]">{invite.raw}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-[#557c5b] py-2.5 text-xs font-medium text-white"
                      onClick={() => onAccept(invite.raw)}
                    >
                      确认加入
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[#d9e0d4] py-2.5 text-xs font-medium text-[#6d776b]"
                      onClick={() => onRemove(invite.id)}
                    >
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-[#dfe5d9] bg-[#fffef9]/80 p-4 text-center text-xs text-[#849083]">
              暂无待确认邀请
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-[#344236]">群聊管理</h2>
          <button
            type="button"
            className="w-full rounded-xl border border-[#9bad99] bg-[#fffef9] py-3 text-sm font-semibold text-[#3d6b4f]"
            onClick={onCreate}
          >
            创建群聊
          </button>
          {adminGroups.map((group) => (
            <button
              key={group.groupId}
              type="button"
              onClick={() => onOpenAdmin(group)}
              className="mt-2 flex w-full items-center rounded-2xl border border-[#dfe5d9] bg-[#fffef9]/95 p-3 text-left shadow-sm"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e9f0e7] text-sm font-semibold text-[#3d6b4f]">
                {group.name.slice(0, 1)}
              </span>
              <span className="ml-3 min-w-0 flex-1">
                <b className="block truncate text-sm font-medium">{group.name}</b>
                <small className="mt-0.5 block text-xs text-[#849083]">管理当前有效邀请码</small>
              </span>
              <span className="text-[#789077]">›</span>
            </button>
          ))}
          {!adminGroups.length && (
            <p className="mt-3 rounded-2xl border border-[#dfe5d9] bg-[#fffef9]/75 px-4 py-3 text-xs leading-relaxed text-[#849083]">
              你还不是任何群聊的管理员；创建群聊后，这里会显示真实的邀请码管理入口。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
