import { useState } from "react";
import { extractInviteFromText, parseInviteInput } from "../lib/invite";

type InvitePreview = { name: string; expiresAt: number | null };

/** A server-confirmed invite flow: no group metadata is invented on-device. */
export function JoinGroupModal({ onClose, onJoin, onPreview, initialDisplayName = "" }: {
  onClose: () => void;
  onJoin: (inviteCode: string, displayName: string) => void | Promise<void | boolean>;
  onPreview: (inviteCode: string) => Promise<InvitePreview | null>;
  initialDisplayName?: string;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  const applyInviteText = (raw: string) => {
    const code = extractInviteFromText(raw);
    setInviteCode(code);
    setPreview(null);
    const parsed = parseInviteInput(code);
    setHint(parsed ? "已填写邀请码，请先验证。" : code ? "邀请码格式似乎不正确，请检查后重试。" : "");
  };

  const paste = async () => {
    try { applyInviteText(await navigator.clipboard.readText()); }
    catch { setHint("请长按输入框后选择粘贴。"); }
  };

  const verify = async () => {
    const raw = extractInviteFromText(inviteCode);
    if (!parseInviteInput(raw)) return setHint("邀请码格式似乎不正确，请检查后重试。");
    setBusy(true);
    try {
      const result = await onPreview(raw);
      setPreview(result);
      setHint(result ? "邀请有效，请确认加入。" : "无法验证：邀请码无效、已撤销、已过期或暂时无法连接服务器。" );
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!preview) return;
    if (!displayName.trim()) return setHint("请填写你在群里显示的名字。");
    setBusy(true);
    try {
      if (await onJoin(extractInviteFromText(inviteCode), displayName.trim()) !== false) onClose();
      else { setPreview(null); setHint("无法加入：邀请码可能已失效，或网络暂不可用。请重新验证。" ); }
    } finally { setBusy(false); }
  };

  const expiry = preview?.expiresAt
    ? new Date(preview.expiresAt * 1000).toLocaleString("zh-CN", { hour12: false })
    : "未设置到期时间";

  return <div className="fixed inset-0 z-50 flex flex-col bg-[#f3efe6] text-[#29362b]">
    <header className="flex h-14 items-center border-b border-[#e6eadf] px-5">
      <button type="button" onClick={onClose} className="text-2xl leading-none text-[#3d5945]" aria-label="返回">‹</button>
      <h1 className="ml-3 text-base font-semibold">邀请验证</h1>
    </header>
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-10">
      <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border border-[#d5dfcf] bg-[#eaf0e5] shadow-sm">
        <span className="text-3xl text-[#49694e]">♧</span>
      </div>
      <h2 className="mt-6 text-center text-2xl font-semibold">加入群聊</h2>
      <p className="mt-2 text-center text-sm text-[#71806f]">服务器验证邀请后，才会显示群聊信息。</p>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d8ddd2] bg-white shadow-sm">
        <div className="flex items-center">
          <input className="flex-1 px-4 py-4 text-sm outline-none placeholder:text-[#b0b5ad]" autoFocus placeholder="请输入邀请码" value={inviteCode} onChange={(event) => applyInviteText(event.target.value)} />
          <button type="button" className="px-4 text-sm font-medium text-[#4d7452]" onClick={() => void paste()}>粘贴</button>
        </div>
        {preview && <div className="border-t border-[#edf0e9] bg-[#f7fbf6] px-4 py-3 text-sm"><p className="font-medium text-[#2f5c40]">{preview.name}</p><p className="mt-1 text-xs text-[#71806f]">有效期：{expiry}</p></div>}
        <div className="border-t border-[#edf0e9] px-4 py-3">
          <input className="w-full text-sm outline-none placeholder:text-[#b0b5ad]" placeholder="你的名字（群内显示）" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </div>
      </div>
      <p role="status" className={`mt-2 min-h-5 text-xs ${hint.includes("无法") || hint.includes("不正确") ? "text-[#b55348]" : "text-[#71806f]"}`}>{hint}</p>
      <p className="mt-6 text-xs leading-relaxed text-[#889487]">昵称只在此群内显示。确认加入时，服务器会再次检查邀请码是否有效。</p>
      <button type="button" disabled={!inviteCode.trim() || busy || !!preview} onClick={() => void verify()} className="mt-auto w-full rounded-xl border border-[#3d6b4f] py-3.5 font-medium text-[#3d6b4f] disabled:opacity-40">{busy && !preview ? "正在验证…" : "验证邀请"}</button>
      <button type="button" disabled={!preview || !displayName.trim() || busy} onClick={() => void submit()} className="mb-8 mt-3 w-full rounded-xl bg-[#3d6b4f] py-3.5 font-medium text-white disabled:opacity-40">{busy && preview ? "正在加入…" : "确认加入"}</button>
    </main>
  </div>;
}
