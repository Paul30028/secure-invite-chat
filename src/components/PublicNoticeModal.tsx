import { useEffect, useState } from "react";
import {
  builtInDailyNotices,
  fetchDailyNotices,
  type DailyNotice,
  type DailyNoticeBundle,
} from "../lib/publicNotices";

function noticeTag(notice: DailyNotice): string {
  if (notice.category === "hymn") return notice.audioUrl ? "立即播放" : "等待授权音频";
  return "每日自动更新";
}

export function PublicNoticeModal({
  onClose,
  onEnterChat,
  onOpenAdmin,
  onBack,
}: {
  onClose: () => void;
  onEnterChat: () => void;
  onOpenAdmin: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<DailyNotice | null>(null);
  const [bundle, setBundle] = useState<DailyNoticeBundle>(() => builtInDailyNotices());

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const next = await fetchDailyNotices();
      if (alive) setBundle(next);
    };
    void refresh();
    // 跨过午夜或后台修改内容后，最多一小时自动刷新一次。
    const timer = window.setInterval(() => void refresh(), 60 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const enterChat = () => {
    onEnterChat();
    onClose();
  };

  if (selected) {
    return (
      <main className="fixed inset-0 z-[55] overflow-y-auto bg-[#f7f8fa] px-5 py-10 text-[#1f2329]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
          <button type="button" className="mb-8 w-fit rounded-lg px-1 py-2 text-sm font-medium text-[#07c160] active:bg-[#edf9f0]" onClick={() => setSelected(null)}>
            ← 返回公告
          </button>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf9f0] text-2xl">
            {selected.icon}
          </span>
          <p className="mt-5 text-xs font-medium text-[#07c160]">{noticeTag(selected)} · {bundle.date}</p>
          <h1 className="mt-2 text-2xl font-bold">{selected.title}</h1>
          <p className="mt-5 rounded-2xl bg-white p-5 text-sm leading-7 text-[#545860] shadow-[0_4px_18px_rgba(0,0,0,0.05)]">
            {selected.body}
          </p>
          {selected.reference && (
            <p className="mt-3 text-sm leading-6 text-[#70757d]">经文 / 来源：{selected.reference}</p>
          )}
          {selected.audioUrl ? (
            <section className="mt-5 rounded-2xl bg-white p-4 shadow-[0_4px_18px_rgba(0,0,0,0.05)]">
              <p className="mb-3 text-sm font-semibold">{selected.audioTitle || "授权音频播放"}</p>
              <audio className="w-full" controls preload="none" src={selected.audioUrl}>
                你的设备不支持音频播放，请使用下方链接。
              </audio>
              <a
                href={selected.audioUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-[#07c160]"
              >
                在浏览器打开音频链接
              </a>
            </section>
          ) : selected.category === "hymn" ? (
            <p className="mt-5 rounded-xl border border-[#d8eadb] bg-[#edf9f0] p-4 text-sm leading-6 text-[#4d7656]">
              今日尚未发布授权音频。后台在 hymn 栏目填入 audio_url 后，此处会自动出现播放按钮。
            </p>
          ) : null}
          <div className="mt-auto pt-8">
            <button type="button" className="w-full rounded-xl bg-[#07c160] py-3.5 text-base font-semibold text-white" onClick={enterChat}>
              进入聊天
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[55] overflow-y-auto bg-[#f7f8fa] px-5 py-10 text-[#1f2329]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <header className="mb-8">
          <button type="button" className="mb-5 flex items-center gap-1 rounded-lg px-1 py-2 text-sm font-medium text-[#07c160] active:bg-[#edf9f0]" onClick={onBack}>
            ← 返回聊天
          </button>
          <img
            src="/app-logo.png"
            alt="邀群密聊标识"
            className="mb-4 h-16 w-16 rounded-2xl object-cover shadow-sm"
          />
          <p className="text-sm font-medium text-[#07c160]">SECURE INVITE CHAT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">今日公告</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#7a7f87]">
            每日按上海日期自动更新；点开栏目查看内容，再进入聊天。
          </p>
          <p className="mt-2 text-xs text-[#9aa0a8]">
            {bundle.source === "remote" ? "已读取后台公告" : "暂时使用 App 内置轮换内容"} · {bundle.date}
          </p>
        </header>
        <section className="space-y-3">
          {bundle.notices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              onClick={() => setSelected(notice)}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-[0_4px_18px_rgba(0,0,0,0.05)] active:bg-[#f4fbf5]"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf9f0] text-xl">
                  {notice.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{notice.title}</h2>
                    <span className="text-[#07c160]">›</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#70757d]">{notice.summary}</p>
                  <span className="mt-2 inline-block text-xs text-[#07c160]">{noticeTag(notice)}</span>
                </div>
              </div>
            </button>
          ))}
        </section>
        <div className="mt-auto space-y-3 pt-8">
          <button
            type="button"
            className="w-full rounded-xl bg-[#07c160] py-3.5 text-base font-semibold text-white shadow-sm active:bg-[#06ad58]"
            onClick={enterChat}
          >
            进入聊天
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-[#7a7f87]"
            onClick={onOpenAdmin}
          >
            管理员专区
          </button>
        </div>
      </div>
    </main>
  );
}
