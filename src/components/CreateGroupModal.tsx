import { useState } from "react";

export function CreateGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, displayName: string) => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 sm:p-6 w-full max-w-[400px] shadow-2xl">
        <h2 className="text-lg font-semibold mb-1 text-[#1f2329]">创建群并发邀请码</h2>
        <p className="text-[12px] text-[#6b7280] mb-4 leading-relaxed">
          创建成功后立刻显示邀请码，发给别人即可加入<strong className="text-[#1f2329]">这个群</strong>
        </p>
        <label className="text-xs text-[#8a8a8a] mb-1 block">群名称</label>
        <input
          className="w-full bg-white border border-black/10 rounded-lg px-3 py-2.5 mb-3 text-sm outline-none focus:border-[#3d6b4f]"
          placeholder="例如：项目组"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="text-xs text-[#8a8a8a] mb-1 block">你的昵称（群内唯一）</label>
        <input
          className="w-full bg-white border border-black/10 rounded-lg px-3 py-2.5 mb-2 text-sm outline-none focus:border-[#3d6b4f]"
          placeholder="群里显示的名字，勿与他人重复"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="text-[10px] text-[#8a8a8a] mb-4">
          群密钥材料将<strong className="text-[#6b7280]">随机生成</strong>
          （每次建群不同）；仅入群码可轮换。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 py-3 text-sm rounded-xl text-[#1f2329] bg-[#f3efe6]"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="flex-[1.4] py-3 text-sm rounded-xl bg-[#3d6b4f] text-white font-semibold disabled:opacity-40"
            disabled={!name.trim() || !displayName.trim()}
            onClick={() => {
              onCreate(name.trim(), displayName.trim());
              onClose();
            }}
          >
            创建并生成邀请码
          </button>
        </div>
      </div>
    </div>
  );
}
