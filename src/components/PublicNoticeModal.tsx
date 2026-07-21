import { useState } from "react";

type NoticeCategory = "devotion" | "hymn" | "verse";

const notices: Record<
  NoticeCategory,
  { label: string; icon: string; title: string; body: string; footer: string }
> = {
  devotion: {
    label: "每日圣经灵修",
    icon: "📖",
    title: "每日圣经灵修",
    body: "这里将显示后台每天发布的灵修主题、经文出处、默想引导与祷告方向。",
    footer: "每日更新 · 当前为界面演示内容",
  },
  hymn: {
    label: "赞美诗歌",
    icon: "🎵",
    title: "赞美诗歌",
    body: "这里将显示当天的授权诗歌、简介和播放入口。后台配置授权音频后，用户可直接在此播放。",
    footer: "音频播放待后台配置授权来源",
  },
  verse: {
    label: "每日金句",
    icon: "✨",
    title: "每日金句",
    body: "这里将显示当天的经文内容、出处和简短默想。内容由后台每日定时更新。",
    footer: "每日更新 · 当前为界面演示内容",
  },
};

export function PublicNoticeModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<NoticeCategory>("devotion");
  const notice = notices[active];

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-[94vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#30363d] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">公开公告</h2>
            <p className="mt-1 text-xs text-slate-500">无需登录即可查看的每日信息栏目。</p>
          </div>
          <button type="button" className="px-2 py-1 text-slate-400" onClick={onClose}>关闭</button>
        </header>

        <div className="grid grid-cols-3 gap-2 border-b border-[#30363d] p-3">
          {(Object.keys(notices) as NoticeCategory[]).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActive(category)}
              className={
                "rounded-xl px-2 py-3 text-center text-xs " +
                (active === category
                  ? "bg-indigo-600 text-white"
                  : "bg-[#21262d] text-slate-300")
              }
            >
              <span className="mb-1 block text-xl">{notices[category].icon}</span>
              {notices[category].label}
            </button>
          ))}
        </div>

        <main className="min-h-[310px] overflow-y-auto p-5">
          <p className="mb-3 text-3xl">{notice.icon}</p>
          <h3 className="text-xl font-semibold text-white">{notice.title}</h3>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-300">{notice.body}</p>
          {active === "hymn" && (
            <div className="mt-6 rounded-xl border border-[#30363d] bg-[#0d1117] p-4 text-sm text-slate-400">
              播放器会在后台配置合法音频地址后显示；不会内置未经授权的诗歌文件。
            </div>
          )}
          <p className="mt-8 text-xs text-slate-500">{notice.footer}</p>
        </main>
      </div>
    </div>
  );
}
