/**
 * 应用配置中心（中国区直连阶段）
 *
 * 连接模式：
 * - direct：客户端直连后端 WebSocket（当前默认、主推）
 * - relay：未来经 TLS 中继/反代（地址形态仍是一个 URL，客户端无感）
 *
 * 改地址的优先级（高→低）：
 * 1. 运行时 localStorage（设置页 / 邀请码内嵌服务器）
 * 2. 构建时环境变量 VITE_WS_URL
 * 3. 下方 DEFAULT_WS_URL 常量
 *
 * 中国区部署：把 VITE_WS_URL 或 DEFAULT_WS_URL 改成
 *   ws://你的服务器公网或内网IP:8765
 * 后期上中继时改为 wss://域名 即可，协议层不变。
 */

/** 当前连接架构阶段（仅文档/埋点用，不改变传输） */
export type ConnectionArchitecture = "direct" | "relay_ready";

export const APP_NAME = "邀群密聊";
export const APP_ID = "sic";

/** 协议版本：消息信封 / 邀请串 */
export const PROTOCOL = {
  /** 传输层 JSON 消息无版本字段时默认 1 */
  wire: 1,
  /** 密文信封带 group key epoch */
  envelope: 2,
  /** 邀请串不再携带群密钥 */
  invite: "SIC2",
} as const;

/**
 * 构建默认后端地址（直连）
 * 生产中国区：在 .env 或 CI 中设置 VITE_WS_URL=ws://x.x.x.x:8765
 */
/** Managed service endpoint; users never enter hosts or ports. */
export const DEFAULT_WS_URL = "wss://secureinchat.com";
export const FALLBACK_WS_URL = "ws://212.135.212.22:8765";

/**
 * 默认「写入邀请码」的服务器（直连阶段通常与 DEFAULT 相同）
 * 日后管理端在内网、成员走中继时，可单独配置 VITE_INVITE_WS_URL
 */
export const DEFAULT_INVITE_WS_URL = DEFAULT_WS_URL;

export const FEATURES = {
  /** 本地单机调试（不连服务器）— 真机互通时请关闭 */
  localDebug: false,
  /** 邀请码内嵌服务器：同 Wi‑Fi 时可选 */
  inviteEmbedServer: false,
  /** 公网：最后再做 */
  publicWssWizard: false,
} as const;

export const LIMITS = {
  maxFileBytes: 4 * 1024 * 1024,
  maxCachedMessages: 80,
} as const;

/** 架构说明：给开发者看，不参与运行逻辑 */
export const ARCHITECTURE_NOTES = {
  phase: "cn-direct-v1",
  architecture: "direct" as ConnectionArchitecture,
  description:
    "Client ↔ WebSocket 后端直连；后端只转发/存密文。未来中继=换 URL 为 wss://，协议与 E2EE 不变。",
} as const;
