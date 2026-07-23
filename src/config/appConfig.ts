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
 * 正式发布默认连接 wss://secureinchat.com。
 * 如需临时切换测试服务器，可在构建时设置 VITE_WS_URL，或在设置页修改。
 */

/** 当前连接架构阶段（仅文档/埋点用，不改变传输） */
export type ConnectionArchitecture = "direct" | "relay_ready";

export const APP_NAME = "邀群密聊";
export const APP_ID = "sic";

/** 协议版本：消息信封 / 邀请串 */
export const PROTOCOL = {
  /** 传输层 JSON 消息无版本字段时默认 1 */
  wire: 1,
  /** 密文信封 EnvelopeV1 */
  envelope: 1,
  /** 邀请串 SIC1 */
  invite: "SIC1",
} as const;

/**
 * 构建默认后端地址（直连）
 * 正式 APK 默认使用已启用 TLS 的 wss://secureinchat.com；构建时可用 VITE_WS_URL 覆盖。
 */
const buildEnv = (import.meta as unknown as {
  env?: Record<string, string | boolean | undefined>;
}).env;

export const DEFAULT_WS_URL: string = (() => {
  const configuredUrl = typeof buildEnv?.VITE_WS_URL === "string" ? buildEnv.VITE_WS_URL.trim() : "";
  if (configuredUrl) return configuredUrl;
  // 桌面开发默认本机；原生端无 env 时用占位，启动后由用户填或设置页引导
  return "wss://secureinchat.com";
})();

/**
 * 默认「写入邀请码」的服务器（直连阶段通常与 DEFAULT 相同）
 * 日后管理端在内网、成员走中继时，可单独配置 VITE_INVITE_WS_URL
 */
export const DEFAULT_INVITE_WS_URL: string = (() => {
  const env = buildEnv;
  const configuredUrl = typeof env?.VITE_INVITE_WS_URL === "string" ? env.VITE_INVITE_WS_URL.trim() : "";
  if (configuredUrl) return configuredUrl;
  return "";
})();

export const FEATURES = {
  /** 本地单机调试（不连服务器）— 真机互通时请关闭 */
  localDebug: buildEnv?.DEV === true,
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
