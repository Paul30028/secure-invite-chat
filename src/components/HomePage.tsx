type DailyNotice = {
  dailyDevotion: string;
  hymn: string;
  scripture: string;
  privacyReminder: string;
};

function Artwork({
  kind,
  className = "",
}: {
  kind: "main" | "wheat" | "fish";
  className?: string;
}) {
  const crop =
    kind === "main"
      ? { width: 500, left: -70, top: -52 }
      : kind === "wheat"
        ? { width: 280, left: -149, top: -34 }
        : { width: 280, left: -204, top: -34 };

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <img
        src="/assets/wheat-fish.jpg"
        alt=""
        aria-hidden="true"
        className="absolute max-w-none"
        style={{ width: crop.width, left: crop.left, top: crop.top }}
      />
    </span>
  );
}

function ActionCard({
  title,
  art,
  onClick,
}: {
  title: string;
  art: "wheat" | "fish";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 items-center justify-between rounded-[18px] border border-[#e5e8dd] bg-[#fffef9]/95 px-4 text-left shadow-[0_8px_22px_rgba(61,74,54,0.08)] active:scale-[0.99]"
    >
      <span className="text-[17px] font-semibold tracking-wide text-[#2f392f]">{title}</span>
      <Artwork kind={art} className="h-12 w-12 rounded-2xl" />
    </button>
  );
}

export function HomePage({
  notice,
  groupCount,
  onOpenDevotion,
  onOpenHymn,
  onOpenCommunity,
}: {
  notice: DailyNotice;
  groupCount: number;
  onOpenDevotion: () => void;
  onOpenHymn: () => void;
  onOpenCommunity: () => void;
}) {
  const scripture = notice.scripture || "看哪，弟兄和睦同居，是何等地善，何等地美。";

  return (
    <main className="relative flex-1 overflow-y-auto bg-[#fbfaf4] px-4 pb-8 pt-6 text-[#29362b]">
      <img
        src="/assets/wheat-fish.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-full w-full scale-110 object-cover opacity-[0.12] blur-xl"
      />
      <div className="relative mx-auto max-w-md">
        <header className="flex flex-col items-center text-center">
          <Artwork
            kind="main"
            className="h-40 w-40 rounded-[34px] border border-[#dfe5d9] bg-[#f6f4ea] shadow-[0_14px_32px_rgba(64,74,54,0.14)]"
          />
          <h1 className="mt-6 text-[34px] font-semibold tracking-[0.12em] text-[#35523a]">邀群密聊</h1>
          <p className="mt-2 text-sm tracking-[0.34em] text-[#5f6b5e]">安全 · 隐私 · 专属</p>
          <blockquote className="mt-6 max-w-[315px] text-[15px] font-medium leading-relaxed text-[#5b4637]">
            “{scripture}”
          </blockquote>
          <p className="mt-2 text-xs text-[#8f958a]">{notice.scripture ? "今日金句" : "诗篇 133:1"}</p>
        </header>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <ActionCard title="今日灵修" art="wheat" onClick={onOpenDevotion} />
          <ActionCard title="赞美诗歌" art="fish" onClick={onOpenHymn} />
        </div>

        <button
          type="button"
          onClick={onOpenCommunity}
          className="mt-4 flex w-full items-center gap-3 rounded-[18px] border border-[#e5e8dd] bg-[#fffef9]/95 p-4 text-left shadow-[0_8px_22px_rgba(61,74,54,0.08)] active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e9f0e7] text-lg text-[#3d6b4f]">
            👥
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[17px] font-semibold tracking-wide text-[#2f392f]">丰收社区</b>
            <small className="mt-1 block text-xs text-[#849083]">
              {groupCount ? `你已加入 ${groupCount} 个群聊` : "创建或加入群聊，与同伴同行"}
            </small>
          </span>
          <span className="text-xl text-[#789077]">›</span>
        </button>
      </div>
    </main>
  );
}
