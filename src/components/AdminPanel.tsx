import { useEffect, useState } from "react";
import type { LocalGroup } from "../lib/types";
import { buildShareInvite, buildShareMessage } from "../lib/invite";
import { computeGroupSafetyNumber, formatSafetyNumber } from "../lib/safetyNumber";
import { makeQrDataUrl, shareText } from "../lib/qr";
import { FEATURES } from "../config/appConfig";
import {
  classifyWsUrl,
  getInviteRelayUrl,
  getWsUrl,
  setInviteRelayUrl,
} from "../lib/settings";

/**
 * 管理端：邀请码绑定本群；可选内嵌服务器地址
 */
export function AdminPanel({
  group,
  shareInvite,
  groupSecret,
  onClose,
  onRegenerate,
}: {
  group: LocalGroup;
  shareInvite: string;
  groupSecret: string;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [safety, setSafety] = useState("");
  const [qr, setQr] = useState("");
  const [embedServer, setEmbedServer] = useState(() => getInviteRelayUrl());
  const [showEmbed, setShowEmbed] = useState(!!getInviteRelayUrl());

  const liveInvite = buildShareInvite(
    group.lastKnownInviteCode,
    groupSecret || group.groupSecret || group.lastKnownInviteCode,
    showEmbed ? embedServer || null : null
  ) || shareInvite;

  useEffect(() => {
    const secret = groupSecret || group.groupSecret || group.lastKnownInviteCode;
    void computeGroupSafetyNumber(secret, group.groupId).then((d) =>
      setSafety(formatSafetyNumber(d))
    );
  }, [group.groupId, group.groupSecret, group.lastKnownInviteCode, groupSecret]);

  useEffect(() => {
    void makeQrDataUrl(liveInvite, 240).then(setQr);
  }, [liveInvite]);

  const persist = () => {
    if (FEATURES.inviteEmbedServer && showEmbed) setInviteRelayUrl(embedServer);
  };

  const copyCode = async () => {
    persist();
    try {
      await navigator.clipboard.writeText(liveInvite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const doShare = async () => {
    persist();
    const ok = await shareText(
      `加入「${group.name}」`,
      buildShareMessage(group.name, liveInvite, showEmbed ? embedServer : undefined)
    );
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-indigo-700/40 rounded-xl p-5 sm:p-6 w-full max-w-[440px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h2 className="text-lg font-semibold">本群邀请码</h2>
            <p className="text-xs text-slate-400 mt-1">
              「{group.name}」· 对方填入后进入本加密群
            </p>
          </div>
          <button type="button" className="text-slate-400 hover:text-white px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center my-4">
          <div className="bg-white p-3 rounded-xl">
            {qr ? (
              <img src={qr} alt="邀请二维码" width={200} height={200} className="block" />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-slate-400 text-xs">
                生成中…
              </div>
            )}
          </div>
        </div>

        <label className="text-xs text-slate-400 mb-1 block">邀请码（整段复制）</label>
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-3 mb-3 font-mono text-[11px] break-all select-all max-h-28 overflow-y-auto text-indigo-100">
          {liveInvite}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            className="px-3 py-3.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            onClick={doShare}
          >
            {shared ? "已分享 ✓" : "分享"}
          </button>
          <button
            type="button"
            className="px-3 py-3.5 text-sm rounded-xl bg-[#21262d] hover:bg-[#2d333b] text-white font-semibold"
            onClick={copyCode}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
        </div>

        <button
          type="button"
          className="w-full px-3 py-2 text-xs rounded-lg text-amber-400/90 hover:bg-amber-950/30 mb-2"
          onClick={onRegenerate}
        >
          作废旧入群码（群密钥不变，已在群成员仍可聊天）
        </button>
        <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
          邀请串 = 入群码（可换）+ 群密钥材料（建群时<strong className="text-slate-400">随机生成</strong>
          ，每个群不同）。
        </p>

        {FEATURES.inviteEmbedServer && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-[11px] text-slate-400 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showEmbed}
                onChange={(e) => setShowEmbed(e.target.checked)}
              />
              邀请码内附带服务器地址（成员与你不在同一配置时勾选）
            </label>
            {showEmbed && (
              <input
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs font-mono"
                value={embedServer}
                onChange={(e) => setEmbedServer(e.target.value)}
                onBlur={persist}
                placeholder={getWsUrl()}
              />
            )}
          </div>
        )}

        <div className="border border-[#30363d] rounded-lg p-3 mb-4">
          <div className="text-[11px] text-slate-500 mb-1">安全码（可选，当面核对）</div>
          <div className="font-mono text-[11px] text-slate-300 break-all">{safety || "…"}</div>
        </div>

        <p className="text-[10px] text-slate-600 mb-3">
          本机连接：{classifyWsUrl(getWsUrl()).normalized} · {classifyWsUrl(getWsUrl()).hint}
        </p>

        <button
          type="button"
          className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium"
          onClick={() => {
            persist();
            onClose();
          }}
        >
          完成，开始聊天
        </button>
      </div>
    </div>
  );
}
