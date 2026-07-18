/** 匹配 http(s) 与 www. 开头的链接 */
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"')\]]+)/gi;

function normalizeUrl(raw: string): string {
  const t = raw.replace(/[.,;:!?)]+$/, ""); // 去掉句尾标点
  if (/^www\./i.test(t)) return `https://${t}`;
  return t;
}

/** 把文本中的 URL 拆分成 {text} 和 {text, url} 片段 */
export function splitLinks(text: string): Array<{ text: string; url?: string }> {
  const parts: Array<{ text: string; url?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    const cleaned = raw.replace(/[.,;:!?)]+$/, "");
    const trailing = raw.slice(cleaned.length);
    parts.push({ text: cleaned, url: normalizeUrl(cleaned) });
    if (trailing) parts.push({ text: trailing });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ text }];
}

/** 从消息中提取第一个链接（用于卡片预览） */
export function firstUrl(text: string): string | null {
  const parts = splitLinks(text);
  for (const p of parts) {
    if (p.url) return p.url;
  }
  return null;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/** 判断整条消息是否「主要是一条链接」 */
export function isMostlyLink(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const url = firstUrl(t);
  if (!url) return false;
  // 去掉链接后剩余很少文字
  const rest = t.replace(url, "").replace(/^https?:\/\//i, "").trim();
  return rest.length < 40;
}
