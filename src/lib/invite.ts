/**
 * 邀请串：
 *   SIC1.<入群码>.<群密钥材料>
 *   SIC1.<入群码>.<群密钥材料>|ws(s)://服务器   ← 可选，手机跨网自动连
 *
 * 入群码：服务器侧，可轮换
 * 群密钥材料：客户端 CSPRNG 生成，建群时一次随机，与入群码分离
 */

import { getInviteRelayUrl, normalizeWsUrl } from "./settings";
import { generateRandomSecret } from "./random";

export type ParsedInvite = {
  serverInviteCode: string;
  /** SIC2 deliberately has no group secret. SIC1 is legacy-only. */
  groupSecret?: string;
  legacy: boolean;
  relayUrl?: string;
};

const PREFIX = "SIC2.";
const LEGACY_PREFIX = "SIC1.";

/** 每次建群调用：新的随机群密钥材料（绝不应固定） */
export function generateGroupSecret(): string {
  return generateRandomSecret(32);
}

/**
 * 组装邀请串。
 * @param relayUrl 成员应连接的服务器（跨 Wi‑Fi / 手机流量时建议写入）
 */
export function buildShareInvite(
  serverInviteCode: string,
  _groupSecret?: string,
  relayUrl?: string | null
): string {
  let s = `${PREFIX}${serverInviteCode}`;
  const r = relayUrl?.trim() || getInviteRelayUrl();
  if (r) {
    const n = normalizeWsUrl(r);
    if (n && n !== "wss://" && n !== "ws://") {
      s += `|${n}`;
    }
  }
  return s;
}

export function buildShareMessage(groupName: string, invite: string, relayUrl?: string): string {
  const lines = [
    `【邀群密聊】邀请你加入「${groupName}」`,
    "",
    "打开 App →「输入邀请码加入」→ 粘贴整段：",
    "",
    invite,
  ];
  const r = relayUrl || getInviteRelayUrl();
  if (r && !invite.includes("|")) {
    lines.push("", `服务器：${normalizeWsUrl(r)}`);
  }
  return lines.join("\n");
}

export function extractInviteFromText(raw: string): string {
  const withRelay = raw.match(
    /SIC[12]\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\|wss?:\/\/[^\s|]+/i
  );
  if (withRelay) return withRelay[0];

  const basic = raw.match(/SIC2\.[A-Za-z0-9_-]+|SIC1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (basic) {
    const wss = raw.match(/wss?:\/\/[^\s|]+/i);
    if (wss && !basic[0].includes("|")) {
      return `${basic[0]}|${normalizeWsUrl(wss[0])}`;
    }
    return basic[0];
  }
  return raw.trim();
}

export function parseInviteInput(raw: string): ParsedInvite | null {
  let s = extractInviteFromText(raw).replace(/\s+/g, "");
  if (!s) return null;

  let relayUrl: string | undefined;
  const pipe = s.indexOf("|");
  if (pipe > 0) {
    relayUrl = normalizeWsUrl(s.slice(pipe + 1));
    s = s.slice(0, pipe);
  }

  const at = s.search(/@wss?:\/\//i);
  if (at > 0) {
    relayUrl = normalizeWsUrl(s.slice(at + 1));
    s = s.slice(0, at);
  }

  if (s.startsWith(PREFIX)) {
    const serverInviteCode = s.slice(PREFIX.length);
    if (!serverInviteCode) return null;
    return {
      serverInviteCode,
      legacy: false,
      relayUrl: relayUrl && relayUrl !== "wss://" && relayUrl !== "ws://" ? relayUrl : undefined,
    };
  }

  if (s.startsWith(LEGACY_PREFIX)) {
    const rest = s.slice(LEGACY_PREFIX.length);
    const dot = rest.indexOf(".");
    if (dot <= 0 || dot === rest.length - 1) return null;
    return { serverInviteCode: rest.slice(0, dot), groupSecret: rest.slice(dot + 1), legacy: true, relayUrl };
  }

  // 旧版兼容：整段既是 invite 也是 secret（不推荐）
  return {
    serverInviteCode: s,
    groupSecret: s,
    legacy: true,
    relayUrl,
  };
}
