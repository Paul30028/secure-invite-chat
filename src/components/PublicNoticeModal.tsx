const notices = [
  { icon: "📖", title: "每日圣经灵修", summary: "每日灵修主题、经文出处与祷告引导。", tag: "每日更新" },
  { icon: "🎵", title: "赞美诗歌", summary: "当日授权诗歌与在线播放入口。", tag: "聆听与赞美" },
  { icon: "✨", title: "每日金句", summary: "每日经文、出处与简短默想。", tag: "每日更新" },
];

export function PublicNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <main className="fixed inset-0 z-[55] overflow-y-auto bg-[#f7f8fa] px-5 py-10 text-[#1f2329]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <header className="mb-8">
          <p className="text-sm font-medium text-[#07c160]">SECURE INVITE CHAT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">今日公告</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#7a7f87]">每日灵修、诗歌与金句，打开应用即可查看。</p>
        </header>
        <section className="space-y-3">
          {notices.map((notice) => (
            <article key={notice.title} className="rounded-2xl bg-white p-4 shadow-[0_4px_18px_rgba(0,0,0,0.05)]">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf9f0] text-xl">{notice.icon}</span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{notice.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#70757d]">{notice.summary}</p>
                  <span className="mt-2 inline-block text-xs text-[#07c160]">{notice.tag}</span>
                </div>
              </div>
            </article>
          ))}
        </section>
        <div className="mt-auto pt-8">
          <button type="button" className="w-full rounded-xl bg-[#07c160] py-3.5 text-base font-semibold text-white shadow-sm active:bg-[#06ad58]" onClick={onClose}>进入聊天</button>
          <p className="mt-3 text-center text-xs text-[#9aa0a8]">公告内容将由后台每日更新</p>
        </div>
      </div>
    </main>
  );
}
