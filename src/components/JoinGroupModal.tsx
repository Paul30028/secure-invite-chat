import { useState } from "react";
import { extractInviteFromText, parseInviteInput } from "../lib/invite";

export function JoinGroupModal({
  onClose,
  onJoin,
}: {
  onClose: () => void;
  onJoin: (inviteCode: string, displayName: string) => void | Promise<void | boolean>;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  const applyInviteText = (raw: string) => {
    const extracted = extractInviteFromText(raw);
    setInviteCode(extracted);
    const p = parseInviteInput(extracted);
    if (p?.relayUrl) {
      setHint(`将自动连接：${p.relayUrl}（支持手机流量）`);
    } else if (p && extracted.startsWith("SIC1.")) {
      setHint("邀请码有效 · 未含服务器，需本机已配置中继地址");
    } else if (extracted.startsWith("SIC1.")) {
      setHint("邀请码格式正确");
    } else {
      setHint("");
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) applyInviteText(t);
      else setHint("剪贴板为空");
    } catch {
      setHint("请长按输入框粘贴");
    }
  };

  const submit = async () => {
    if (!displayName.trim()) {
      setHint("请填写昵称（群内不能重名）");
      return;
    }
    setBusy(true);
    try {
      const ok = await onJoin(extractInviteFromText(inviteCode), displayName.trim());
      // 失败时（昵称占用等）保持弹窗，错误由顶部/底部提示
      if (ok !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 sm:p-6 w-full max-w-[400px] shadow-2xl">
        <h2 className="text-lg font-semibold mb-1">输入邀请码加入</h2>
        <p className="text-[12px] text-slate-500 mb-4 leading-relaxed">
          粘贴管理端发来的整段内容。若含{" "}
          <code className="text-sky-300">|wss://…</code>
          ，会<strong className="text-slate-300">自动连公网</strong>（流量可用）。
        </p>

        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-slate-400">邀请码</label>
          <button
            type="button"
            className="text-[12px] text-indigo-400"
            onClick={() => void pasteFromClipboard()}
          >
            粘贴
          </button>
        </div>
        <textarea
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-3 mb-1 text-sm outline-none focus:border-indigo-500 font-mono min-h-[100px] resize-y"
          placeholder={"SIC1.xxxx.yyyy\n或带服务器：SIC1.xxxx.yyyy|wss://域名"}
          value={inviteCode}
          onChange={(e) => applyInviteText(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
        {hint && (
          <p
            className={`text-[11px] mb-3 ${
              hint.includes("wss") || hint.includes("流量") ? "text-sky-400" : "text-emerald-400"
            }`}
          >
            {hint}
          </p>
        )}
        {!hint && <div className="mb-3" />}

        <label className="text-xs text-slate-400 mb-1 block">你的昵称（群内唯一，不能重名）</label>
        <input
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 mb-5 text-sm outline-none focus:border-indigo-500"
          placeholder="与群内其他人不同的名字"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 py-3 text-sm rounded-xl text-slate-300 bg-[#21262d]"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="flex-[1.4] py-3 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-40"
            disabled={!inviteCode.trim() || !displayName.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? "连接并加入…" : "加入该群"}
          </button>
        </div>
      </div>
    </div>
  );
}
