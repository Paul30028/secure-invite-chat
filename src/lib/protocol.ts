/**
 * 线协议约定（Client ↔ Server）
 *
 * 当前：JSON over WebSocket，直连后端。
 * 未来中继：中继只做字节/帧转发或终止 TLS，业务 JSON 形状不变。
 *
 * 客户端 → 服务器 type：
 *   create_group | join_group | resume_group | sync_history
 *   send_message | regenerate_code | list_members | kick_member
 *
 * 服务器 → 客户端 type：
 *   group_created | joined | resumed | history | message
 *   code_regenerated | members | member_kicked | kicked | error
 *
 * 密文：send_message / history / message 中的 ciphertext+iv 对服务器不透明。
 * E2EE 明文在 envelope（v=1）内。
 */

import { PROTOCOL } from "../config/appConfig";

export const WIRE_VERSION = PROTOCOL.wire;
export const ENVELOPE_VERSION = PROTOCOL.envelope;
export const INVITE_PREFIX = `${PROTOCOL.invite}.`;

/** 客户端发出的业务类型 */
export type ClientMsgType =
  | "create_group"
  | "join_group"
  | "resume_group"
  | "sync_history"
  | "send_message"
  | "regenerate_code";

/** 服务器推送类型 */
export type ServerMsgType =
  | "group_created"
  | "joined"
  | "resumed"
  | "history"
  | "message"
  | "code_regenerated"
  | "error";

/**
 * 未来若加中继元数据，可扩展：
 * { v, route?: "direct"|"via_relay", type, ...payload }
 * 当前服务器忽略未知字段，保持兼容。
 */
export type WireEnvelope = {
  v?: number;
  type: string;
  [key: string]: unknown;
};

export function withWireVersion(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, v: WIRE_VERSION };
}
