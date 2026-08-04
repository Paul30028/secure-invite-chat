/**
 * storage.ts - 本地群组元数据 +（本地调试）消息缓存
 * 直连模式：历史权威在服务端密文；本地调试：明文缓存便于刷新。
 */
import type { ChatMessage, LocalGroup } from "./types";
import { LIMITS } from "../config/appConfig";

const GROUPS_KEY = "sic_groups";
const MSGS_PREFIX = "sic_msgs_";
const OUTBOX_KEY = "sic_encrypted_outbox_v1";
const MAX_CACHED_MSGS = LIMITS.maxCachedMessages;

/**
 * Only opaque encrypted envelopes are kept here.  Plaintext, group secrets and
 * contacts are deliberately excluded, so a reconnect never needs to re-read a
 * user message from local storage.
 */
export type PendingOutboundMessage = {
  clientMessageId: string;
  localMessageId: string;
  groupId: string;
  deviceId: string;
  msgType: string;
  ciphertext: string;
  iv: string;
  keyVersion: number;
  senderName: string;
  createdAt: number;
};

export function getPendingOutboundMessages(): PendingOutboundMessage[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as PendingOutboundMessage[] : [];
  } catch {
    return [];
  }
}

export function savePendingOutboundMessage(message: PendingOutboundMessage) {
  const next = getPendingOutboundMessages().filter((item) => item.clientMessageId !== message.clientMessageId);
  next.push(message);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
}

export function removePendingOutboundMessage(clientMessageId: string) {
  try {
    const next = getPendingOutboundMessages().filter((item) => item.clientMessageId !== clientMessageId);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
  } catch {
    /* retry on the next connection */
  }
}

export function getLocalGroups(): LocalGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as LocalGroup[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalGroup(group: LocalGroup) {
  const groups = getLocalGroups().filter((g) => g.groupId !== group.groupId);
  groups.push(group);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function updateLocalGroup(groupId: string, patch: Partial<LocalGroup>) {
  const groups = getLocalGroups().map((g) =>
    g.groupId === groupId ? { ...g, ...patch } : g
  );
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function removeLocalGroup(groupId: string) {
  const groups = getLocalGroups().filter((g) => g.groupId !== groupId);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  try {
    localStorage.removeItem(MSGS_PREFIX + groupId);
  } catch {
    /* ignore */
  }
}

export function getCachedMessages(groupId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MSGS_PREFIX + groupId);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedMessages(groupId: string, list: ChatMessage[]) {
  try {
    const trimmed = list.slice(-MAX_CACHED_MSGS);
    localStorage.setItem(MSGS_PREFIX + groupId, JSON.stringify(trimmed));
  } catch (e) {
    // 配额满时丢掉文件消息重试
    console.warn("[storage] cache messages failed", e);
    try {
      const light = list
        .filter((m) => m.msgType !== "file")
        .slice(-MAX_CACHED_MSGS);
      localStorage.setItem(MSGS_PREFIX + groupId, JSON.stringify(light));
    } catch {
      /* ignore */
    }
  }
}
