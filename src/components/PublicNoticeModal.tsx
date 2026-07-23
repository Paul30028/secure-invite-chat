import { useState } from "react";

type Notice = {
  icon: string;
  title: string;
  summary: string;
  tag: string;
  detail: string;
};

const notices: Notice[] = [
  {
    icon: "📖",
    title: "每日圣经灵修",
    summary: "每日灵修主题、经文出处与祷告引导。",
    tag: "每日更新",
    detail: "今日灵修内容将在这里显示。后台发布后，可包含经文出处、默想问题和简短祷告引导。",
  },
  {
    icon: "🎵",
    title: "赞美诗歌",
    summary: "当日授权诗歌与在线播放入口。",
    tag: "聆听与赞美",
    detail: "今日诗歌的标题、简介与播放按钮将在这里显示。仅接入拥有传播权的音频来源。",
  },
  {
    icon: "✨",
    title: "每日金句",
    summary: "每日经文、出处与简短默想。",
    tag: "每日更新",
    detail: "今日金句的正文、出处和简短默想将在这里显示，由后台按日更新。",
  },
];

export function PublicNoticeModal({
  onClose,
  onEnterChat,
}: {
  onClose: () => void;
  onEnterChat: () => void;
}) {
  const [selected, setSelected] = useState<Notice | null>(null);
  const enterChat = () => {
    onEnterChat();
    onClose();
  };

  if (selected) {
    return (
      <main className="fixed inset-0 z-[55] overflow-y-auto bg-[#f7f8fa] px-5 py-10 text-[#1f2329]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
          <button type="button" className="mb-8 w-fit text-sm text-[#07c160]" onClick={() => setSelected(null)}>‹ 返回公告</button>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf9f0] text-2xl">{selected.icon}</span>
          <p className="mt-5 text-xs font-medium text-[#07c160]">{selected.tag}</p>
          <h1 className="mt-2 text-2xl font-bold">{selected.title}</h1>
          <p className="mt-5 rounded-2xl bg-white p-5 text-sm leading-7 text-[#545860] shadow-[0_4px_18px_rgba(0,0,0,0.05)]">{selected.detail}</p>
          <div className="mt-auto pt-8">
            <button type="button" className="w-full rounded-xl bg-[#07c160] py-3.5 text-base font-semibold text-white" onClick={enterChat}>进入聊天</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[55] overflow-y-auto bg-[#f7f8fa] px-5 py-10 text-[#1f2329]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <header className="mb-8">
          <p className="text-sm font-medium text-[#07c160]">SECURE INVITE CHAT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">今日公告</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#7a7f87]">点开栏目查看每日内容，再进入聊天。</p>
        </header>
        <section className="space-y-3">
          {notices.map((notice) => (
            <button key={notice.title} type="button" onClick={() => setSelected(notice)} className="w-full rounded-2xl bg-white p-4 text-left shadow-[0_4px_18px_rgba(0,0,0,0.05)] active:bg-[#f4fbf5]">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf9f0] text-xl">{notice.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{notice.title}</h2><span className="text-[#07c160]">›</span></div>
                  <p className="mt-1 text-sm leading-6 text-[#70757d]">{notice.summary}</p>
                  <span className="mt-2 inline-block text-xs text-[#07c160]">{notice.tag}</span>
                </div>
              </div>
            </button>
          ))}
        </section>
        <div className="mt-auto pt-8">
          <button type="button" className="w-full rounded-xl bg-[#07c160] py-3.5 text-base font-semibold text-white shadow-sm active:bg-[#06ad58]" onClick={enterChat}>进入聊天</button>
        </div>
      </div>
    </main>
  );
}
