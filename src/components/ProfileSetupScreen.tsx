import { useState } from "react";
import { AVATAR_CHOICES, saveLocalProfile } from "../lib/localProfile";
import { updatePrivateData } from "../lib/privateStore";

export function ProfileSetupScreen({ onDone }: { onDone: () => void }) {
  const [avatar, setAvatar] = useState(AVATAR_CHOICES[0]);
  const [nickname, setNickname] = useState("");
  const [notify, setNotify] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updatePrivateData((data) => ({ ...data, settings: { ...data.settings, notifications: notify } }));
      saveLocalProfile({ avatar, nickname: nickname.trim() || avatar });
      onDone();
    } catch {
      setSaveError("资料未能保存到本机，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#f3efe6] flex flex-col px-6 pt-10">
      <h1 className="text-lg font-bold text-[#1f2329]">首次使用</h1>
      <h2 className="text-2xl font-bold text-[#1f2329] mt-1">设置你的个人信息</h2>
      <p className="text-sm text-[#6b7280] mt-3 leading-relaxed">
        无需手机号和邮箱。昵称只用于群聊内识别，可稍后修改。
      </p>

      <div className="bg-white rounded-2xl p-5 mt-6">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-[#3d6b4f] text-white flex items-center justify-center text-2xl font-medium">
            {avatar}
          </div>
        </div>

        <p className="text-xs text-[#6b7280] mt-4 mb-2">选择头像</p>
        <div className="flex gap-2 flex-wrap">
          {AVATAR_CHOICES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-base border ${
                avatar === a
                  ? "bg-[#3d6b4f] text-white border-[#3d6b4f]"
                  : "bg-[#f3efe6] text-[#1f2329] border-transparent"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#6b7280] mt-5 mb-2">群聊昵称</p>
        <input
          className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3d6b4f]"
          placeholder="给自己起个名字"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <p className="text-[11px] text-[#8a9a82] mt-1.5">加入不同群聊时仍可单独修改昵称</p>

        <label className="flex items-center justify-between mt-5">
          <span className="text-sm">
            消息通知
            <span className="block text-[11px] text-[#8a9a82]">新消息和来电提醒</span>
          </span>
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="w-10 h-6 accent-[#3d6b4f]"
          />
        </label>

        <div className="flex items-start gap-2 bg-[#eaf1ec] rounded-lg px-3 py-2.5 mt-4">
          <span className="text-[#3d6b4f] mt-0.5">✓</span>
          <p className="text-xs text-[#2f5c40] leading-relaxed">
            隐私保护：头像仅保存在本机，服务器无法读取聊天内容。
          </p>
        </div>
        {saveError && <p role="alert" className="mt-3 text-xs text-red-600">{saveError}</p>}
      </div>

      <div className="pb-8 pt-6 mt-auto">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={saving}
          className="w-full bg-[#3d6b4f] text-white rounded-xl py-3.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? "正在保存…" : <>完成设置 <span>→</span></>}
        </button>
      </div>
    </main>
  );
}
