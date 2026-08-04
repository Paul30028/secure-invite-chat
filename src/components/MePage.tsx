import { useState } from "react";
import { decryptBackupPayload, encryptBackupPayload, type PrivateData } from "../lib/privateStore";
import { AVATAR_CHOICES, getLocalProfile, saveLocalProfile } from "../lib/localProfile";

type Detail = "notice" | "privacy" | null;

export function MePage({ deviceId, data, onRestore, onOpenAbout, onOpenAdminSettings, hasAdminGroups, onBack }: {
  deviceId: string; data: PrivateData; onRestore: (data: PrivateData) => void;
  onOpenAbout: () => void; onOpenAdminSettings: () => void; hasAdminGroups: boolean; onBack: () => void;
}) {
  const profile = getLocalProfile() || { avatar: AVATAR_CHOICES[0], nickname: "未命名" };
  const [editingProfile, setEditingProfile] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [detail, setDetail] = useState<Detail>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const download = async () => {
    if (!password) return setMessage("请先设置备份口令");
    const url = URL.createObjectURL(new Blob([await encryptBackupPayload(data, password)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sic-backup.json"; anchor.click(); URL.revokeObjectURL(url);
    setMessage("已导出加密备份");
  };
  const restore = async (file: File | null) => {
    if (!file || !password) return setMessage("请选择备份文件并输入口令");
    try { onRestore(await decryptBackupPayload(await file.text(), password)); setMessage("恢复完成"); }
    catch { setMessage("无法恢复：口令或备份文件不正确"); }
  };
  const Row = ({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) => <button type="button" onClick={onClick} className="w-full flex items-center text-left gap-4 px-4 py-4 hover:bg-[#fafbf7]"><span className="w-7 text-center text-xl text-[#527657]">{icon}</span><span className="flex-1"><b className="block text-sm font-medium">{title}</b><small className="block text-xs mt-0.5 text-[#849083]">{desc}</small></span><span className="text-[#98a096]">›</span></button>;
  return <main className="flex-1 overflow-y-auto bg-[#fbfaf4] px-4 py-6 text-[#29362b]"><div className="max-w-md mx-auto">
    <button type="button" className="text-xl text-[#516653]" onClick={onBack} aria-label="返回首页">‹</button><h1 className="text-[27px] font-semibold mt-4 mb-8">我的</h1>
    <section className="overflow-hidden rounded-2xl border border-[#dfe5d9] bg-white shadow-sm">
      <Row icon="●" title="个人资料" desc={`${profile.nickname} · 仅保存在本机`} onClick={() => setEditingProfile(true)} />
      <div className="border-t border-[#edf0e9]"><Row icon="♟" title="通知" desc="目前仅支持会话静音；暂未接入系统推送" onClick={() => setDetail("notice")} /></div>
      <div className="border-t border-[#edf0e9]"><Row icon="◇" title="隐私与安全" desc="联系人与会话偏好保存在本机加密存储" onClick={() => setDetail("privacy")} /></div>
      <div className="border-t border-[#edf0e9]"><Row icon="ⓘ" title="关于" desc="版本、安全说明与开源信息" onClick={onOpenAbout} /></div>
      {hasAdminGroups && <div className="border-t border-[#edf0e9]"><Row icon="⚙" title="管理员设置" desc="仅限你管理的群聊" onClick={onOpenAdminSettings} /></div>}
    </section>
    <section className="mt-5 rounded-2xl border border-[#dfe5d9] bg-white p-4 shadow-sm"><h2 className="text-sm font-medium">数据与存储</h2><p className="mt-1 text-xs text-[#849083]">备份只包含本机加密数据；恢复会替换当前本机数据。</p><input className="w-full mt-3 border border-[#dfe5d9] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#66876b]" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="备份口令" /><div className="flex gap-4 mt-3"><button type="button" className="text-sm text-[#4d7452]" onClick={() => void download()}>导出备份</button><label className="text-sm text-[#4d7452] cursor-pointer">恢复备份<input className="hidden" type="file" accept="application/json" onChange={(event) => void restore(event.target.files?.[0] || null)} /></label></div>{message && <p className="text-xs text-[#7f8c7d] mt-2">{message}</p>}</section>
    <p className="mt-6 px-2 text-xs leading-relaxed text-[#8a9388]">服务器会在有限期限内保留密文，用于离线恢复、历史同步、文件续传和密钥投递；服务器不保存明文或群密钥。成员变动后会自动更新群密钥；请在线下核对安全码。</p><p className="mt-7 text-center text-xs text-[#a1a79d]">设备 {deviceId.slice(0, 10)}…</p>
    {editingProfile && <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center bg-black/35 p-0 sm:p-4"><section className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-[#dfe5d9] bg-[#fffef9] p-5"><h2 className="text-lg font-semibold">个人资料</h2><p className="mt-1 text-xs text-[#849083]">昵称与头像仅存于本机；之后新建或加入群聊时会使用它。</p><div className="mt-4 flex gap-2">{AVATAR_CHOICES.map(x => <button type="button" key={x} onClick={() => setAvatar(x)} className={`grid h-10 w-10 place-items-center rounded-full border ${avatar === x ? "border-[#557c5b] bg-[#e9f0e7]" : "border-[#dfe5d9]"}`}>{x}</button>)}</div><input className="mt-4 w-full rounded-xl border border-[#dfe5d9] px-3 py-2.5 text-sm" value={nickname} onChange={event => setNickname(event.target.value)} maxLength={32} placeholder="显示名称" /><div className="mt-5 flex justify-end gap-3"><button type="button" className="text-sm text-[#667565]" onClick={() => setEditingProfile(false)}>取消</button><button type="button" className="rounded-xl bg-[#557c5b] px-4 py-2 text-sm text-white" onClick={() => { const clean = nickname.trim(); if (!clean) return; saveLocalProfile({ avatar, nickname: clean }); setEditingProfile(false); }}>保存</button></div></section></div>}
    {detail && <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center bg-black/35 p-0 sm:p-4"><section className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-[#dfe5d9] bg-[#fffef9] p-5"><h2 className="text-lg font-semibold">{detail === "notice" ? "通知说明" : "隐私与安全说明"}</h2><p className="mt-3 text-sm leading-relaxed text-[#526052]">{detail === "notice" ? "当前应用不申请系统推送权限。你可以在消息列表对会话静音；静音偏好只保存于本机。" : "联系人备注、分组、黑名单和会话偏好使用本机 Web Crypto 密钥加密保存，不会随 WebSocket 上传。黑名单只在本机隐藏消息并静音通知，不会改变群成员资格。"}</p><button type="button" className="mt-5 w-full rounded-xl bg-[#557c5b] py-3 text-sm text-white" onClick={() => setDetail(null)}>知道了</button></section></div>}
  </div></main>;
}
