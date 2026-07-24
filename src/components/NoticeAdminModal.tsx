import { useEffect, useRef, useState } from "react";
import { builtInDailyNotices, fetchDailyNotices, type DailyNotice } from "../lib/publicNotices";
import { wsClient, type NoticePublishEntry } from "../lib/wsClient";

type NoticeDraft = Record<"devotion" | "hymn" | "verse", NoticePublishEntry>;
const DRAFT_KEY = "sic_notice_admin_draft_v1";

function emptyEntry(): NoticePublishEntry {
  return { title: "", summary: "", body: "", reference: "", audio_url: "", audio_title: "" };
}

function entryFromNotice(notice?: DailyNotice): NoticePublishEntry {
  if (!notice) return emptyEntry();
  return {
    title: notice.title,
    summary: notice.summary,
    body: notice.body,
    reference: notice.reference || "",
    audio_url: notice.audioUrl || "",
    audio_title: notice.audioTitle || "",
  };
}

function draftFromNotices(notices: DailyNotice[]): NoticeDraft {
  const find = (category: DailyNotice["category"]) => notices.find((notice) => notice.category === category);
  return {
    devotion: entryFromNotice(find("devotion")),
    hymn: entryFromNotice(find("hymn")),
    verse: entryFromNotice(find("verse")),
  };
}

function loadDraft(): NoticeDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as NoticeDraft;
      if (saved.devotion && saved.hymn && saved.verse) return saved;
    }
  } catch {
    // 保持空草稿即可。
  }
  return draftFromNotices(builtInDailyNotices().notices);
}

function Editor({
  label,
  value,
  onChange,
  hymn,
}: {
  label: string;
  value: NoticePublishEntry;
  onChange: (key: keyof NoticePublishEntry, next: string) => void;
  hymn?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-700 bg-[#10151c] p-3">
      <h3 className="mb-3 text-sm font-semibold text-white">{label}</h3>
      <label className="mb-2 block text-[11px] text-slate-400">标题</label>
      <input className="mb-3 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-emerald-500" value={value.title} onChange={(event) => onChange("title", event.target.value)} />
      <label className="mb-2 block text-[11px] text-slate-400">卡片简介</label>
      <input className="mb-3 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-emerald-500" value={value.summary} onChange={(event) => onChange("summary", event.target.value)} />
      <label className="mb-2 block text-[11px] text-slate-400">正文</label>
      <textarea className="mb-3 min-h-24 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500" value={value.body} onChange={(event) => onChange("body", event.target.value)} />
      <label className="mb-2 block text-[11px] text-slate-400">经文 / 来源</label>
      <input className="w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-emerald-500" value={value.reference} onChange={(event) => onChange("reference", event.target.value)} />
      {hymn && (
        <>
          <label className="mb-2 mt-3 block text-[11px] text-slate-400">授权音频 HTTPS 地址（可留空）</label>
          <input className="mb-3 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-emerald-500" value={value.audio_url || ""} placeholder="https://…" onChange={(event) => onChange("audio_url", event.target.value)} />
          <label className="mb-2 block text-[11px] text-slate-400">播放器标题（可留空）</label>
          <input className="w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-emerald-500" value={value.audio_title || ""} onChange={(event) => onChange("audio_title", event.target.value)} />
        </>
      )}
    </section>
  );
}

export function NoticeAdminModal({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(() => builtInDailyNotices().date);
  const [publishMode, setPublishMode] = useState<"test" | "daily">("test");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<NoticeDraft>(loadDraft);
  const [status, setStatus] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const publishTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // 草稿保存失败仍可提交。
    }
  }, [draft]);

  useEffect(() => {
    let alive = true;
    void fetchDailyNotices().then((bundle) => {
      if (alive && !localStorage.getItem(DRAFT_KEY)) {
        setDate(bundle.date);
        setDraft(draftFromNotices(bundle.notices));
      }
    });
    const offDone = wsClient.on("public_notices_published", (event) => {
      if (!alive) return;
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
      setIsPublishing(false);
      setStatus(`${event.date} 已${event.notice_mode === "test" ? "测试发布" : "每日发布"}，返回公告页后点“刷新公告”即可查看。`);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    });
    const offError = wsClient.on("error", (event) => {
      if (!alive || !event.message.startsWith("notice_") && !event.message.startsWith("invalid_notice")) return;
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
      setIsPublishing(false);
      const messages: Record<string, string> = {
        notice_publishing_disabled: "服务器尚未启用公告管理员密码。",
        notice_not_authorized: "管理员密码不正确。",
        invalid_notice_date: "日期格式应为 YYYY-MM-DD。",
        invalid_notice_audio_url: "音频地址必须以 https:// 开头。",
        invalid_notice_payload: "请完整填写三个栏目的必填内容。",
        notice_store_unavailable: "服务器公告文件不可写，请检查部署。",
      };
      setStatus(messages[event.message] || "发布失败，请稍后重试。");
    });
    return () => {
      alive = false;
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current);
      offDone();
      offError();
    };
  }, []);

  const update = (category: keyof NoticeDraft, key: keyof NoticePublishEntry, value: string) => {
    setDraft((current) => ({ ...current, [category]: { ...current[category], [key]: value } }));
  };

  const publish = () => {
    if (!wsClient.isOpen()) {
      setStatus("尚未连接中继服务器，无法提交。");
      return;
    }
    if (!password.trim()) {
      setStatus("请输入公告管理员密码。");
      return;
    }
    setIsPublishing(true);
    setStatus("正在提交，请稍候…");
    wsClient.publishPublicNotices({ adminPassword: password.trim(), date, mode: publishMode, notices: draft });
    publishTimerRef.current = window.setTimeout(() => {
      setIsPublishing(false);
      setStatus("服务器未在 15 秒内回应。请检查 App 是否已连接 wss://secureinchat.com，以及服务器服务是否正常。");
      publishTimerRef.current = null;
    }, 15_000);
  };

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-black/65 p-4 sm:flex sm:items-center sm:justify-center">
      <main className="mx-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-[#161b22] p-4 text-slate-100 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-400">ADMIN AREA</p>
            <h2 className="mt-1 text-xl font-bold">今日公告管理</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">草稿只保存在本机；管理员密码不会写入本地存储。</p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-slate-300 active:bg-slate-800" onClick={onClose}>← 返回</button>
        </div>

        <label className="mt-5 block text-xs text-slate-400">发布日期</label>
        <input type="date" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2.5 text-sm outline-none focus:border-emerald-500" value={date} onChange={(event) => setDate(event.target.value)} />

        <label className="mt-4 block text-xs text-slate-400">发布方式</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPublishMode("test")} className={`rounded-lg px-3 py-2 text-sm ${publishMode === "test" ? "bg-amber-500 text-white" : "bg-slate-800 text-slate-300"}`}>测试发布</button>
          <button type="button" onClick={() => setPublishMode("daily")} className={`rounded-lg px-3 py-2 text-sm ${publishMode === "daily" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}>每日模式</button>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">{publishMode === "test" ? "测试内容会立即写入今天的公告；确认无误后再选择“每日模式”。" : "每日模式会按上海日期显示当天内容；可提前为未来日期分别发布。"}</p>

        <div className="mt-4 space-y-3">
          <Editor label="📖 每日圣经灵修" value={draft.devotion} onChange={(key, value) => update("devotion", key, value)} />
          <Editor label="🎵 赞美诗歌" value={draft.hymn} onChange={(key, value) => update("hymn", key, value)} hymn />
          <Editor label="✨ 每日金句" value={draft.verse} onChange={(key, value) => update("verse", key, value)} />
        </div>

        <label className="mt-4 block text-xs text-slate-400">公告管理员密码</label>
        <input type="password" autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b0f14] px-3 py-2.5 text-sm outline-none focus:border-emerald-500" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="仅本次提交使用" />
        {status && <p className="mt-3 text-sm leading-5 text-amber-200">{status}</p>}

        <button type="button" disabled={isPublishing} className="mt-4 w-full rounded-xl bg-[#07c160] py-3.5 text-sm font-semibold text-white disabled:opacity-50" onClick={publish}>
          {isPublishing ? "提交中…" : publishMode === "test" ? "测试发布并立即查看" : "发布每日公告"}
        </button>
      </main>
    </div>
  );
}
