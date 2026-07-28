import type { ConnStatus } from "../hooks/useChatEngine";
import { APP_NAME } from "../config/appConfig";

export type DailyNotice = {
  dailyDevotion: string;
  hymn: string;
  scripture: string;
  privacyReminder: string;
};

export function WelcomeScreen({
  status,
  notice,
  onEnter,
}: {
  status: ConnStatus;
  notice: DailyNotice;
  onEnter: () => void;
}) {
  const connected = status === "online" || status === "local";
  const hasNotice = notice.scripture || notice.dailyDevotion || notice.hymn;

  return (
    <main className="flex-1 overflow-y-auto bg-[#f3efe6] flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-6">
        <img src="/icon-192.png" alt={APP_NAME} className="w-11 h-11 rounded-xl" />
        <div>
          <h1 className="text-base font-semibold text-[#1f2329]">{APP_NAME}</h1>
          <p className="text-xs text-[#6b8a6f] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3d6b4f] inline-block" />
            {connected ? "安全服务器已连接" : "连接中…"}
          </p>
        </div>
      </header>

      <div className="px-5 mt-6 flex-1">
        {hasNotice ? (
          <>
            {notice.scripture && (
              <section className="bg-[#fff8e8] border border-[#f1d8a5] rounded-xl px-4 py-4">
                <p className="text-xs text-[#805d1b] font-medium">今日金句</p>
                <p className="text-lg text-[#3d2f10] leading-relaxed mt-2">“{notice.scripture}”</p>
              </section>
            )}

            <section className="bg-white rounded-xl mt-4 divide-y divide-black/5">
              {notice.dailyDevotion && <Row icon="✦" title="每日灵修" desc={notice.dailyDevotion} />}
              {notice.hymn && <Row icon="♪" title="赞美诗歌" desc={notice.hymn} />}
              {notice.privacyReminder && <Row icon="⚡" title="隐私提醒" desc={notice.privacyReminder} />}
            </section>
          </>
        ) : (
          <section className="bg-white rounded-xl px-4 py-8 text-center">
            <p className="text-sm text-[#6b7280]">今天还没有公告，进入应用继续</p>
          </section>
        )}
      </div>

      <div className="px-5 pb-8 pt-4">
        <button
          type="button"
          onClick={onEnter}
          className="w-full bg-[#3d6b4f] text-white rounded-xl py-3.5 text-sm font-medium flex items-center justify-center gap-2"
        >
          进入{APP_NAME} <span>→</span>
        </button>
        <p className="text-center text-[11px] text-[#8a9a82] mt-3">
          服务器只转发密文，不保存群密钥
        </p>
      </div>
    </main>
  );
}

function Row({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="text-[#3d6b4f] w-5 text-center mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium text-[#1f2329]">{title}</p>
        <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
