export type NoticeCategory = "devotion" | "hymn" | "verse";
export type NoticeMode = "test" | "daily";

export type DailyNotice = {
  id: string;
  category: NoticeCategory;
  icon: string;
  title: string;
  summary: string;
  body: string;
  reference?: string;
  audioUrl?: string;
  audioTitle?: string;
  date?: string;
};

export type DailyNoticeBundle = {
  date: string;
  updatedAt?: string;
  notices: DailyNotice[];
  source: "remote" | "built_in";
  mode: NoticeMode;
};

type NoticeEntry = {
  date?: string;
  title: string;
  summary: string;
  body: string;
  reference?: string;
  audio_url?: string;
  audio_title?: string;
};
type NoticeFeed = {
  updated_at?: string;
  mode?: unknown;
  devotion?: unknown;
  hymn?: unknown;
  verse?: unknown;
};

const NOTICE_URL = "https://secureinchat.com/notices.json";

const categoryMeta: Record<NoticeCategory, { icon: string; title: string }> = {
  devotion: { icon: "📖", title: "每日圣经灵修" },
  hymn: { icon: "🎵", title: "赞美诗歌" },
  verse: { icon: "✨", title: "每日金句" },
};

const builtInFeed: NoticeFeed = {
  updated_at: "内置轮换内容",
  devotion: [
    {
      title: "安静与交托",
      summary: "以三分钟安静开始今天的祷告。",
      body: "先感谢一件已经领受的恩典，再把今天最挂心的一件事交托。安静片刻，写下一句你愿意实践的回应。",
      reference: "诗篇 46:10",
    },
    {
      title: "彼此扶持",
      summary: "今天主动关怀一位身边的人。",
      body: "在祷告中记念一位需要安慰的人，并用一句真诚的话语或一次具体帮助回应他。",
      reference: "加拉太书 6:2",
    },
    {
      title: "盼望的脚步",
      summary: "在不确定中学习持守盼望。",
      body: "回顾今天的一件难事，分辨其中自己能做的一小步，并为下一步所需的智慧祷告。",
      reference: "罗马书 12:12",
    },
  ],
  hymn: [
    {
      title: "今日赞美诗歌",
      summary: "等待后台发布拥有授权的音频链接。",
      body: "管理员可在 notices.json 的 hymn 栏目填写 audio_url。发布后，本页面会自动显示在线播放器。",
      reference: "仅发布拥有传播授权的音频",
    },
  ],
  verse: [
    {
      title: "今日金句",
      summary: "在主里得着安稳与引导。",
      body: "今天把经文的提醒带进一件具体的决定，并在晚间回顾这份引导。",
      reference: "箴言 3:5–6",
    },
    {
      title: "今日金句",
      summary: "以恩慈回应身边的人。",
      body: "选择一次耐心倾听，或向一位需要鼓励的人表达感谢与祝福。",
      reference: "歌罗西书 3:12",
    },
    {
      title: "今日金句",
      summary: "把忧虑交托，持守平安。",
      body: "写下今天的忧虑，为它祷告，并把注意力转向当下能够完成的一件善事。",
      reference: "腓立比书 4:6–7",
    },
  ],
};

function shanghaiDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const lookup = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value || "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

function validEntry(value: unknown): value is NoticeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return ["title", "summary", "body"].every(
    (key) => typeof entry[key] === "string" && entry[key].trim().length > 0
  );
}

function listFor(feed: NoticeFeed, category: NoticeCategory): NoticeEntry[] {
  const raw = feed[category];
  return Array.isArray(raw) ? raw.filter(validEntry) : [];
}

function dayNumber(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : 0;
}

function selectEntry(entries: NoticeEntry[], date: string): NoticeEntry | null {
  if (!entries.length) return null;
  const dated = entries.find((entry) => entry.date === date);
  return dated || entries[Math.abs(dayNumber(date)) % entries.length] || null;
}

function buildNotice(
  category: NoticeCategory,
  entry: NoticeEntry,
  date: string
): DailyNotice {
  const meta = categoryMeta[category];
  return {
    id: `${category}-${entry.date || date}-${entry.title}`,
    category,
    icon: meta.icon,
    title: entry.title.trim() || meta.title,
    summary: entry.summary.trim(),
    body: entry.body.trim(),
    reference: typeof entry.reference === "string" ? entry.reference.trim() : undefined,
    audioUrl: typeof entry.audio_url === "string" ? entry.audio_url.trim() : undefined,
    audioTitle: typeof entry.audio_title === "string" ? entry.audio_title.trim() : undefined,
    date: entry.date,
  };
}

function bundleFrom(feed: NoticeFeed, source: DailyNoticeBundle["source"]): DailyNoticeBundle {
  const date = shanghaiDateKey();
  const notices = (Object.keys(categoryMeta) as NoticeCategory[])
    .map((category) => {
      const entry = selectEntry(listFor(feed, category), date);
      return entry ? buildNotice(category, entry, date) : null;
    })
    .filter((notice): notice is DailyNotice => notice !== null);
  return {
    date,
    updatedAt: feed.updated_at,
    notices,
    source,
    mode: feed.mode === "test" ? "test" : "daily",
  };
}

export function builtInDailyNotices(): DailyNoticeBundle {
  return bundleFrom(builtInFeed, "built_in");
}

/**
 * 公告按上海日期自动挑选当天条目。服务器文件不可用时仍使用内置轮换内容，
 * 所以离线打开 App 也会每天显示不同栏目内容。
 */
export async function fetchDailyNotices(): Promise<DailyNoticeBundle> {
  try {
    const response = await fetch(NOTICE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("invalid notice feed");
    const remote = bundleFrom(payload as NoticeFeed, "remote");
    if (remote.notices.length === 3) return remote;
  } catch {
    // 不影响聊天：网络、证书或后台内容暂不可用时走内置内容。
  }
  return builtInDailyNotices();
}
