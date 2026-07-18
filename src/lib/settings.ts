/**
 * 运行时连接配置（可覆盖构建默认）
 * 持久化在 localStorage，便于中国区改 IP、后期改 wss 中继。
 */

import {
  DEFAULT_INVITE_WS_URL,
  DEFAULT_WS_URL,
  FEATURES,
} from "../config/appConfig";

const WS_KEY = "sic_ws_url";
const INVITE_RELAY_KEY = "sic_invite_relay_url";
const LOCAL_MODE_KEY = "sic_local_mode_v2";
/** 桌面连上服务器后缓存的「给手机用的地址」 */
const PHONE_HINT_KEY = "sic_phone_ws_hints";

function isNative(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function builtInDefault(): string {
  // 原生且未配置过：给可编辑的局域网模板，避免写死 127.0.0.1
  if (isNative() && !DEFAULT_WS_URL.includes("127.0.0.1")) {
    return DEFAULT_WS_URL;
  }
  if (isNative()) {
    return "ws://192.168.1.1:8765";
  }
  return DEFAULT_WS_URL;
}

/** 规范化 ws/wss；为未来 wss 中继预留 */
export function normalizeWsUrl(raw: string): string {
  let u = raw.trim().replace(/\s+/g, "");
  if (!u) return u;
  if (!/^wss?:\/\//i.test(u)) {
    u = u.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
    if (!/^wss?:\/\//i.test(u)) {
      if (
        /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u) ||
        /:8765\b/.test(u)
      ) {
        u = `ws://${u}`;
      } else {
        // 域名默认 wss（未来中继）；纯 IP 无端口时也先 ws
        if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(u)) {
          u = u.includes(":") ? `ws://${u}` : `ws://${u}:8765`;
        } else {
          u = `wss://${u}`;
        }
      }
    }
  }
  return u.replace(/\/+$/, "");
}

export type UrlKind = "local" | "lan" | "direct_ip" | "wss" | "incomplete";

export function classifyWsUrl(url: string): {
  normalized: string;
  kind: UrlKind;
  hint: string;
  /** 当前阶段：直连是否可用（非空完整地址） */
  ready: boolean;
} {
  const n = normalizeWsUrl(url);
  if (!n || n === "wss://" || n === "ws://") {
    return {
      normalized: n,
      kind: "incomplete",
      hint: "请填写完整地址，如 ws://192.168.1.8:8765",
      ready: false,
    };
  }
  if (n.includes("127.0.0.1") || n.includes("localhost")) {
    return {
      normalized: n,
      kind: "local",
      hint: "本机直连（仅电脑上的客户端）",
      ready: true,
    };
  }
  if (/ws:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(n)) {
    return {
      normalized: n,
      kind: "lan",
      hint: "局域网直连（同一 Wi‑Fi / 内网）",
      ready: true,
    };
  }
  if (n.toLowerCase().startsWith("wss://")) {
    return {
      normalized: n,
      kind: "wss",
      hint: "TLS 地址（未来中继/公网）；当前阶段若已有证书也可直用",
      ready: true,
    };
  }
  return {
    normalized: n,
    kind: "direct_ip",
    hint: "直连服务器（中国区常用：机房/公网 IP + 端口）",
    ready: true,
  };
}

/** @deprecated 使用 classifyWsUrl；保留兼容旧组件 */
export function describeRelayUrl(url: string) {
  const c = classifyWsUrl(url);
  return {
    normalized: c.normalized,
    kind:
      c.kind === "wss"
        ? ("wss" as const)
        : c.kind === "local"
          ? ("local" as const)
          : c.kind === "lan"
            ? ("lan" as const)
            : c.kind === "incomplete"
              ? ("incomplete" as const)
              : ("ws_public" as const),
    hint: c.hint,
    okForCellular: c.kind === "wss" || c.kind === "direct_ip",
  };
}

export function getWsUrl(): string {
  try {
    return localStorage.getItem(WS_KEY) || builtInDefault();
  } catch {
    return builtInDefault();
  }
}

export function setWsUrl(url: string) {
  localStorage.setItem(WS_KEY, normalizeWsUrl(url));
}

export function getDefaultWsUrl(): string {
  return builtInDefault();
}

/**
 * 写入邀请码的服务器（可选）
 * 直连同网：可留空，双方各自配置同一地址
 * 跨网/未来中继：填成员应连接的 URL
 */
export function getInviteRelayUrl(): string {
  if (!FEATURES.inviteEmbedServer) return "";
  try {
    const v = localStorage.getItem(INVITE_RELAY_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  if (DEFAULT_INVITE_WS_URL) return normalizeWsUrl(DEFAULT_INVITE_WS_URL);
  const cur = getWsUrl();
  const c = classifyWsUrl(cur);
  // 本机 127 不要写进邀请码
  if (c.kind === "local") return "";
  if (c.ready) return c.normalized;
  return "";
}

export function setInviteRelayUrl(url: string) {
  const n = normalizeWsUrl(url);
  if (!n || n === "wss://" || n === "ws://") {
    localStorage.removeItem(INVITE_RELAY_KEY);
  } else {
    localStorage.setItem(INVITE_RELAY_KEY, n);
  }
}

export function guessLanWsUrl(port = 8765): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${host}:${port}`;
}

export function isLocalMode(): boolean {
  if (!FEATURES.localDebug) return false;
  try {
    const v = localStorage.getItem(LOCAL_MODE_KEY);
    if (v === null) return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function setLocalMode(on: boolean) {
  localStorage.setItem(LOCAL_MODE_KEY, on ? "1" : "0");
}

export function isNativeApp(): boolean {
  return isNative();
}

export function setPhoneWsHints(urls: string[]) {
  try {
    localStorage.setItem(PHONE_HINT_KEY, JSON.stringify(urls.filter(Boolean)));
  } catch {
    /* ignore */
  }
}

export function getPhoneWsHints(): string[] {
  try {
    const raw = localStorage.getItem(PHONE_HINT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function isWssUrl(url: string): boolean {
  return normalizeWsUrl(url).toLowerCase().startsWith("wss://");
}

export function isLanOrLocalUrl(url: string): boolean {
  const k = classifyWsUrl(url).kind;
  return k === "local" || k === "lan";
}
