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
  onRotateKey,
  onRevoke,
  onSetExpiry,
  onPublishNotice,
  onMaintenance,
}: {
  group: LocalGroup;
  shareInvite: string;
  groupSecret: string;
  onClose: () => void;
  onRegenerate: () => void;
  onRotateKey: () => void;
  onRevoke: () => void;
  onSetExpiry: (hours: number | null) => void;
  onPublishNotice: (notice: { dailyDevotion: string; hymn: string; scripture: string; privacyReminder: string }) => void;
  onMaintenance: (enabled: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [safety, setSafety] = useState("");
  const [qr, setQr] = useState("");
  const [embedServer, setEmbedServer] = useState(() => getInviteRelayUrl());
  const [showEmbed, setShowEmbed] = useState(!!getInviteRelayUrl());
  const [dailyDevotion, setDailyDevotion] = useState("");
  const [hymn, setHymn] = useState("");
  const [scripture, setScripture] = useState("");
  const [privacyReminder, setPrivacyReminder] = useState("邀请码请通过可信渠道发送，并与群友核对安全码。");
  const [maintenance, setMaintenance] = useState(false);

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
      <div className="bg-white rounded-xl p-5 sm:p-6 w-full max-w-[440px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h2 className="text-lg font-semibold">本群邀请码</h2>
            <p className="text-xs text-[#8a8a8a] mt-1">
              「{group.name}」· 对方填入后进入本加密群
            </p>
          </div>
          <button type="button" className="text-[#8a8a8a] hover:text-[#1f2329] px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center my-4">
          <div className="bg-white p-3 rounded-xl">
            {qr ? (
              <img src={qr} alt="邀请二维码" width={200} height={200} className="block" />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-[#8a8a8a] text-xs">
                生成中…
              </div>
            )}
          </div>
        </div>

        <label className="text-xs text-[#8a8a8a] mb-1 block">邀请码（整段复制）</label>
        <div className="bg-[#f9f7f2] border border-black/10 rounded-lg px-3 py-3 mb-3 font-mono text-[11px] break-all select-all max-h-28 overflow-y-auto text-[#1f2329]">
          {liveInvite}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            className="px-3 py-3.5 text-sm rounded-xl bg-[#3d6b4f] text-white font-semibold"
            onClick={doShare}
          >
            {shared ? "已分享 ✓" : "分享"}
          </button>
          <button
            type="button"
            className="px-3 py-3.5 text-sm rounded-xl bg-[#f3efe6] hover:bg-[#e9e2d3] text-[#1f2329] font-semibold"
            onClick={copyCode}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
        </div>

        <button
          type="button"
          className="w-full px-3 py-2 text-xs rounded-lg text-[#805d1b] hover:bg-[#fff8e8] mb-2"
          onClick={onRegenerate}
        >
          作废旧入群码（群密钥不变，已在群成员仍可聊天）
        </button>
        <div className="flex gap-2 mb-3">
          <button type="button" className="flex-1 text-xs py-2 rounded-lg bg-[#f3efe6] text-[#1f2329]" onClick={() => onSetExpiry(24)}>有效期 24 小时</button>
          <button type="button" className="flex-1 text-xs py-2 rounded-lg bg-[#f3efe6] text-[#1f2329]" onClick={() => onSetExpiry(null)}>长期有效</button>
          <button type="button" className="text-xs py-2 px-3 rounded-lg text-[#c0392b] bg-[#fff2f2]" onClick={onRevoke}>撤销</button>
        </div>
        <button
          type="button"
          className="w-full px-3 py-2 text-xs rounded-lg text-[#805d1b] hover:bg-[#fff8e8] mb-2"
          onClick={onRotateKey}
        >
          立即轮换群密钥（在线成员即时更新，离线成员重连后补收）
        </button>
        <p className="text-[10px] text-[#8a8a8a] mb-3 leading-relaxed">
          邀请串 = 入群码（可换）+ 群密钥材料（建群时<strong className="text-[#6b7280]">随机生成</strong>
          ，每个群不同）。
        </p>

        <section className="border border-black/10 rounded-lg p-3 mb-4">
          <h3 className="text-sm font-semibold text-[#1f2329] mb-2">每日公告发布</h3>
          <textarea className="w-full mb-2 rounded bg-white border border-black/10 p-2 text-xs" placeholder="每日灵修" value={dailyDevotion} onChange={e => setDailyDevotion(e.target.value)} />
          <input className="w-full mb-2 rounded bg-white border border-black/10 p-2 text-xs" placeholder="赞美诗歌 / 链接" value={hymn} onChange={e => setHymn(e.target.value)} />
          <textarea className="w-full mb-2 rounded bg-white border border-black/10 p-2 text-xs" placeholder="今日金句（必填）" value={scripture} onChange={e => setScripture(e.target.value)} />
          <textarea className="w-full mb-2 rounded bg-white border border-black/10 p-2 text-xs" placeholder="隐私提醒" value={privacyReminder} onChange={e => setPrivacyReminder(e.target.value)} />
          <button type="button" className="w-full py-2 rounded bg-[#3d6b4f] text-xs text-white disabled:opacity-40" disabled={!scripture.trim()} onClick={() => onPublishNotice({ dailyDevotion, hymn, scripture, privacyReminder })}>发布并广播</button>
          <label className="mt-3 flex justify-between text-xs text-[#805d1b]">维护模式<button type="button" className={`px-2 py-1 rounded ${maintenance ? "bg-red-600" : "bg-[#f3efe6] text-[#1f2329]"}`} onClick={() => { const next = !maintenance; setMaintenance(next); onMaintenance(next); }}>{maintenance ? "已开启" : "已关闭"}</button></label>
        </section>

        {FEATURES.inviteEmbedServer && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-[11px] text-[#8a8a8a] mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showEmbed}
                onChange={(e) => setShowEmbed(e.target.checked)}
              />
              邀请码内附带服务器地址（成员与你不在同一配置时勾选）
            </label>
            {showEmbed && (
              <input
                className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-mono"
                value={embedServer}
                onChange={(e) => setEmbedServer(e.target.value)}
                onBlur={persist}
                placeholder={getWsUrl()}
              />
            )}
          </div>
        )}

        <div className="border border-black/10 rounded-lg p-3 mb-4">
          <div className="text-[11px] text-[#8a8a8a] mb-1">安全码（可选，当面核对）</div>
          <div className="font-mono text-[11px] text-[#1f2329] break-all">{safety || "…"}</div>
        </div>

        <p className="text-[10px] text-[#8a8a8a] mb-3">
          本机连接：{classifyWsUrl(getWsUrl()).normalized} · {classifyWsUrl(getWsUrl()).hint}
        </p>

        <button
          type="button"
          className="w-full py-3 rounded-xl bg-[#3d6b4f] text-white text-sm font-medium"
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
