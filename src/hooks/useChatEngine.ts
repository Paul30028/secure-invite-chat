import { useCallback, useEffect, useRef, useState } from "react";
import { wsClient, type IncomingMessage } from "../lib/wsClient";
import {
  deriveGroupKey,
  encryptText,
  decryptText,
  exportKeyToString,
  importKeyFromString,
  bytesToB64,
} from "../lib/crypto";
import { decryptAndAssembleChunks, fileDataB64, makeEncryptedChunks, type EncryptedFileChunk, type FileManifest } from "../lib/fileChunks";
import { sealEnvelope, openEnvelope } from "../lib/envelope";
import { getOrCreateDeviceId } from "../lib/deviceId";
import {
  getLocalGroups,
  saveLocalGroup,
  updateLocalGroup,
  removeLocalGroup,
  getCachedMessages,
  saveCachedMessages,
} from "../lib/storage";
import { buildShareInvite, generateGroupSecret, parseInviteInput } from "../lib/invite";
import {
  getInviteRelayUrl,
  isLocalMode,
  setLocalMode,
  setWsUrl,
  getWsUrl,
  setPhoneWsHints,
  getPhoneWsHints,
} from "../lib/settings";
import { LIMITS } from "../config/appConfig";
import { randomUUID } from "../lib/uuid";
import { generateRandomToken } from "../lib/random";
import { deriveSharedWrapKey, rotateGroupKey, unwrapGroupSecret, wrapGroupSecret } from "../lib/keyRotation";
import { getOrCreateDeviceIdentity } from "../lib/deviceIdentity";
import type { ChatMessage, GroupMember, LocalGroup, TrustBadge } from "../lib/types";
import type { ServerMember } from "../lib/wsClient";

function mapServerMembers(list: ServerMember[]): GroupMember[] {
  return list.map((m) => ({
    deviceId: m.device_id,
    displayName: m.display_name,
    joinedAt: m.joined_at,
    isAdmin: !!m.is_admin,
    online: !!m.online,
    ecdhPub: m.ecdh_pub,
  }));
}

export type ConnStatus = "connecting" | "online" | "offline" | "local";

export const MAX_FILE_BYTES = LIMITS.maxFileBytes;

type HistoryCursor = {
  hasMore: boolean;
  beforeTs?: number;
  beforeId?: string;
};

export type FileSendProgress = {
  percent: number;
  stage: "read" | "encode" | "encrypt" | "send" | "done";
  label: string;
};

function trustToBadge(
  trust: { status: string },
  sigValid: boolean | null,
  legacy: boolean
): TrustBadge {
  if (legacy) return "legacy";
  if (trust.status === "key_changed") return "key_changed";
  if (sigValid === false) return "bad_sig";
  if (trust.status === "first_seen") return "first_seen";
  if (trust.status === "no_sig" || sigValid === null) return "unsigned";
  return "verified";
}

function shortInviteCode(): string {
  return generateRandomToken(12);
}

function loadAllCachedMessages(): Record<string, ChatMessage[]> {
  const out: Record<string, ChatMessage[]> = {};
  for (const g of getLocalGroups()) {
    out[g.groupId] = getCachedMessages(g.groupId);
  }
  return out;
}

export function useChatEngine() {
  const deviceId = useRef(getOrCreateDeviceId()).current;
  const keyCache = useRef<Map<string, CryptoKey>>(new Map());
  const pendingRotations = useRef<Set<string>>(new Set());
  const seenMembers = useRef<Record<string, Set<string>>>({});
  const memberRegistry = useRef<Record<string, GroupMember[]>>({});
  const pendingUploads = useRef<Map<string, { groupId: string; chunks: EncryptedFileChunk[]; senderName: string }>>(new Map());
  const receivedChunks = useRef<Map<string, Map<number, EncryptedFileChunk>>>(new Map());
  const fileManifests = useRef<Map<string, { groupId: string; messageId: string; senderDeviceId: string; senderName: string; ts: number; trust: TrustBadge; manifest: FileManifest }>>(new Map());
  const localModeRef = useRef(isLocalMode());

  const [groups, setGroups] = useState<LocalGroup[]>(() => getLocalGroups());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() =>
    isLocalMode() ? loadAllCachedMessages() : {}
  );
  const [historyCursors, setHistoryCursors] = useState<Record<string, HistoryCursor>>({});
  const [status, setStatus] = useState<ConnStatus>(() =>
    isLocalMode() ? "local" : "connecting"
  );
  const [localMode, setLocalModeState] = useState(() => isLocalMode());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [securityAlert, setSecurityAlert] = useState<string | null>(null);
  const [dailyNotice, setDailyNotice] = useState({ dailyDevotion: "", hymn: "", scripture: "" });
  const [maintenance, setMaintenance] = useState(false);
  /** groupId -> 成员列表 */
  const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMember[]>>({});
  /** 服务器告知的手机连接地址（同 Wi‑Fi） */
  const [phoneHints, setPhoneHints] = useState<string[]>(() => getPhoneWsHints());

  const pendingCreate = useRef<{
    name: string;
    displayName: string;
    groupSecret: string;
  } | null>(null);
  const pendingJoin = useRef<{
    serverInviteCode: string;
    groupSecret?: string;
    displayName: string;
  } | null>(null);

  const getKey = useCallback(async (group: LocalGroup, version = group.keyVersion || 1): Promise<CryptoKey> => {
    const cacheId = `${group.groupId}:${version}`;
    const cached = keyCache.current.get(cacheId);
    if (cached) return cached;
    const keyJwk = group.keyJwks?.[String(version)] || (version === 1 ? group.keyJwk : undefined);
    if (!keyJwk) throw new Error(`missing_key_version:${version}`);
    const key = await importKeyFromString(keyJwk);
    keyCache.current.set(cacheId, key);
    return key;
  }, []);

  const appendMessage = useCallback((groupId: string, msg: ChatMessage) => {
    setMessages((prev) => {
      const list = prev[groupId] || [];
      if (list.some((x) => x.id === msg.id)) return prev;
      const next = { ...prev, [groupId]: [...list, msg] };
      if (localModeRef.current) {
        saveCachedMessages(groupId, next[groupId]!);
      }
      return next;
    });
  }, []);

  const decryptIncoming = useCallback(
    async (group: LocalGroup, m: IncomingMessage): Promise<ChatMessage> => {
      try {
        const keyVersion = m.key_version || 1;
        const key = await getKey(group, keyVersion);
        const plain = await decryptText(key, m.ciphertext, m.iv);
        const opened = await openEnvelope(plain, m.group_id);

        // 密文能被群密钥解开并不等于发送者可信：任一群成员都可能构造
        // 无效签名。此类内容必须隔离，不能作为文字、链接或文件渲染。
        if (!opened.legacy && opened.sigValid !== true) {
          setSecurityAlert("已阻止一条签名无效的消息；它不会作为聊天内容显示。");
          return {
            id: m.id,
            groupId: m.group_id,
            senderDeviceId: "",
            senderName: "安全系统",
            msgType: "blocked",
            text: "[已阻止签名无效的消息]",
            ts: m.ts,
            isMine: false,
            trust: "bad_sig",
            blocked: true,
          };
        }
        const badge = trustToBadge(opened.trust, opened.sigValid, opened.legacy);

        if (badge === "key_changed") {
          setSecurityAlert(
            `安全警告：设备「${opened.senderName || m.sender_name}」的身份密钥发生变化，可能被仿冒，请线下确认。`
          );
        }

        const senderName =
          opened.senderName && opened.senderName !== "未知"
            ? opened.senderName
            : m.sender_name || "成员";
        const senderDeviceId = opened.deviceId || m.sender_device_id;
        const ts = opened.ts || m.ts;

        if (opened.kind === "file") {
          const meta = JSON.parse(opened.body) as {
            name: string;
            mime: string;
            size: number;
            dataB64?: string;
            fileId?: string;
            totalChunks?: number;
            sha256?: string;
          };
          // Legacy whole-file messages remain readable. New manifests only carry
          // metadata; encrypted chunks are fetched independently.
          if (meta.fileId && meta.totalChunks && meta.sha256) {
            const manifest: FileManifest = { fileId: meta.fileId, name: meta.name, mime: meta.mime,
              size: meta.size, totalChunks: meta.totalChunks, sha256: meta.sha256 };
            fileManifests.current.set(meta.fileId, { groupId: m.group_id, messageId: m.id,
              senderDeviceId, senderName, ts, trust: badge, manifest });
            setTimeout(() => void tryCompleteReceivedFile(meta.fileId!), 0);
            if (!localModeRef.current) wsClient.syncFileChunks(m.group_id, deviceId, meta.fileId);
            return {
              id: m.id, groupId: m.group_id, senderDeviceId, senderName, msgType: "file",
              text: `📎 ${meta.name}（接收中 0/${meta.totalChunks}）`, ts,
              isMine: senderDeviceId === deviceId || m.sender_device_id === deviceId,
              file: { name: meta.name, mime: meta.mime, size: meta.size, transfer: { received: 0, total: meta.totalChunks } }, trust: badge,
            };
          }
          return {
            id: m.id,
            groupId: m.group_id,
            senderDeviceId,
            senderName,
            msgType: "file",
            text: `📎 ${meta.name}`,
            ts,
            isMine: senderDeviceId === deviceId || m.sender_device_id === deviceId,
            file: meta as { name: string; mime: string; size: number; dataB64: string },
            trust: badge,
          };
        }

        return {
          id: m.id,
          groupId: m.group_id,
          senderDeviceId,
          senderName,
          msgType: "text",
          text: opened.body,
          ts,
          isMine: senderDeviceId === deviceId || m.sender_device_id === deviceId,
          trust: badge,
        };
      } catch (error) {
        const keyVersion = m.key_version || 1;
        const missing = error instanceof Error && error.message === `missing_key_version:${keyVersion}`;
        return {
          id: m.id,
          groupId: m.group_id,
          senderDeviceId: m.sender_device_id,
          senderName: m.sender_name,
          msgType: m.msg_type,
          text: missing ? `[无法解密（密钥版本 ${keyVersion} 缺失）]` : "[解密失败：密钥不匹配或消息已损坏]",
          ts: m.ts,
          isMine: m.sender_device_id === deviceId,
          decryptError: true,
          trust: "unsigned",
        };
      }
    },
    [deviceId, getKey]
  );

  // 中继模式：WS 事件；本地模式：不连网
  useEffect(() => {
    localModeRef.current = localMode;

    if (localMode) {
      wsClient.disconnect();
      setStatus("local");
      setMessages(loadAllCachedMessages());
      return;
    }

    setStatus("connecting");

    const offConnected = wsClient.on("connected", () => {
      setStatus("online");
      // 连上即关闭本地调试，保证真机互通
      try {
        setLocalMode(false);
        localModeRef.current = false;
      } catch {
        /* ignore */
      }
      getLocalGroups().forEach((g) => {
        void wsClient.resumeGroup(g.groupId, deviceId).catch(() => {
          setErrorMsg("设备认证未完成，无法恢复群会话。请重新连接或检查设备身份。");
          setTimeout(() => setErrorMsg(null), 5000);
        });
      });
      for (const [fileId, upload] of pendingUploads.current) {
        wsClient.fileChunkStatus(upload.groupId, deviceId, fileId);
      }
    });
    const offDisconnected = wsClient.on("disconnected", () => {
      if (!localModeRef.current) setStatus("offline");
    });

    const offServerInfo = wsClient.on("server_info", (payload) => {
      const urls = (payload.suggested_urls || []).filter(Boolean);
      if (urls.length) {
        setPhoneWsHints(urls);
        setPhoneHints(urls);
      }
    });

    const offCreated = wsClient.on("group_created", async (payload) => {
      const pending = pendingCreate.current;
      pendingCreate.current = null;
      const secret = pending?.groupSecret || generateGroupSecret();
      const key = await deriveGroupKey(secret, payload.group_id);
      const keyJwk = await exportKeyToString(key);
      const localGroup: LocalGroup = {
        groupId: payload.group_id,
        name: payload.name,
        displayName: pending?.displayName || "管理员",
        isAdmin: true,
      adminToken: payload.admin_token,
      keyJwk,
      keyVersion: 1,
      keyJwks: { "1": keyJwk },
        groupSecret: secret,
        lastKnownInviteCode: payload.invite_code,
      };
      saveLocalGroup(localGroup);
      keyCache.current.set(`${payload.group_id}:1`, key);
      setGroups(getLocalGroups());
      setActiveGroupId(payload.group_id);
      setMessages((prev) => ({ ...prev, [payload.group_id]: prev[payload.group_id] || [] }));
    });

    const offJoined = wsClient.on("joined", async (payload) => {
      const pending = pendingJoin.current;
      pendingJoin.current = null;
      if (!pending) return;
      const hasLegacySecret = !!pending.groupSecret;
      const key = hasLegacySecret ? await deriveGroupKey(pending.groupSecret!, payload.group_id) : null;
      const keyJwk = key ? await exportKeyToString(key) : "";
      const localGroup: LocalGroup = {
        groupId: payload.group_id,
        name: payload.name,
        displayName: pending.displayName,
        isAdmin: false,
        keyJwk,
        keyVersion: 1,
        keyJwks: key ? { "1": keyJwk } : {},
        groupSecret: pending.groupSecret,
        lastKnownInviteCode: pending.serverInviteCode,
      };
      saveLocalGroup(localGroup);
      if (key) keyCache.current.set(`${payload.group_id}:1`, key);
      setGroups(getLocalGroups());
      setActiveGroupId(payload.group_id);
    });

    const offResumed = wsClient.on("resumed", () => {});

    const offHistory = wsClient.on("history", async (payload) => {
      const group = getLocalGroups().find((g) => g.groupId === payload.group_id);
      if (!group) return;
      const decrypted = await Promise.all(
        payload.messages.map((m) => decryptIncoming(group, m))
      );
      setMessages((prev) => {
        const merged = new Map<string, ChatMessage>();
        for (const message of prev[payload.group_id] || []) merged.set(message.id, message);
        for (const message of decrypted) merged.set(message.id, message);
        const ordered = [...merged.values()].sort(
          (a, b) => a.ts - b.ts || a.id.localeCompare(b.id)
        );
        return { ...prev, [payload.group_id]: ordered };
      });
      const hasCursor =
        payload.has_more === true &&
        typeof payload.next_before_ts === "number" &&
        typeof payload.next_before_id === "string";
      setHistoryCursors((prev) => ({
        ...prev,
        [payload.group_id]: hasCursor
          ? {
              hasMore: true,
              beforeTs: payload.next_before_ts,
              beforeId: payload.next_before_id,
            }
          : { hasMore: false },
      }));
    });

    const offMessage = wsClient.on("message", async (m) => {
      const group = getLocalGroups().find((g) => g.groupId === m.group_id);
      if (!group) return;
      const decrypted = await decryptIncoming(group, m);
      setMessages((prev) => {
        const list = prev[m.group_id] || [];
        // 去掉乐观发送的临时消息（同内容、自己发的）
        const withoutTmp = list.filter((x) => {
          if (!x.id.startsWith("tmp_") || !x.isMine) return true;
          if (decrypted.isMine && decrypted.msgType === x.msgType) {
            if (x.msgType === "text" && x.text === decrypted.text) return false;
            if (x.msgType === "file" && x.file?.name === decrypted.file?.name) return false;
          }
          return true;
        });
        if (withoutTmp.some((x) => x.id === decrypted.id)) {
          return { ...prev, [m.group_id]: withoutTmp };
        }
        return { ...prev, [m.group_id]: [...withoutTmp, decrypted] };
      });
    });

    const offCodeRegen = wsClient.on("code_regenerated", (payload) => {
      updateLocalGroup(payload.group_id, { lastKnownInviteCode: payload.invite_code });
      setGroups(getLocalGroups());
    });

    const offFileChunk = wsClient.on("file_chunk", (chunk) => {
      const map = receivedChunks.current.get(chunk.file_id) || new Map<number, EncryptedFileChunk>();
      map.set(chunk.chunk_index, { fileId: chunk.file_id, chunkIndex: chunk.chunk_index,
        totalChunks: chunk.total_chunks, ciphertext: chunk.ciphertext, iv: chunk.iv,
        keyVersion: chunk.key_version || 1 });
      receivedChunks.current.set(chunk.file_id, map);
      void tryCompleteReceivedFile(chunk.file_id);
    });

    const offFileStatus = wsClient.on("file_chunk_status", (payload) => {
      const pending = pendingUploads.current.get(payload.file_id);
      if (!pending) return;
      const received = new Set(payload.received_indexes);
      for (const chunk of pending.chunks) {
        if (!received.has(chunk.chunkIndex)) wsClient.sendFileChunk({ groupId: pending.groupId, deviceId,
          senderName: pending.senderName, fileId: chunk.fileId, chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks, ciphertext: chunk.ciphertext, iv: chunk.iv, keyVersion: chunk.keyVersion });
      }
    });

    const sendCurrentKey = async (group: LocalGroup, targets: GroupMember[], version = group.keyVersion || 1) => {
      const secret = group.groupSecret;
      if (!secret) return;
      const identity = await getOrCreateDeviceIdentity();
      for (const target of targets) {
        if (target.deviceId === deviceId || !target.ecdhPub) continue;
        const wrapKey = await deriveSharedWrapKey(identity.ecdhPrivateKey, target.ecdhPub);
        const wrapped = await wrapGroupSecret(secret, wrapKey);
        wsClient.deliverKey({ groupId: group.groupId, deviceId, targetDeviceId: target.deviceId, keyVersion: version, wrappedBlob: JSON.stringify(wrapped) });
      }
    };

    const rotateAndDistribute = async (group: LocalGroup, members: GroupMember[]) => {
      const nextVersion = (group.keyVersion || 1) + 1;
      const result = await rotateGroupKey(group.groupId, members.filter((m) => m.deviceId !== deviceId));
      const key = await deriveGroupKey(result.newSecret, group.groupId);
      const keyJwk = await exportKeyToString(key);
      const keyJwks = { ...(group.keyJwks || { "1": group.keyJwk }), [String(nextVersion)]: keyJwk };
      updateLocalGroup(group.groupId, { groupSecret: result.newSecret, keyVersion: nextVersion, keyJwk, keyJwks });
      keyCache.current.set(`${group.groupId}:${nextVersion}`, key);
      setGroups(getLocalGroups());
      for (const delivery of result.deliveries) {
        wsClient.deliverKey({ groupId: group.groupId, deviceId, targetDeviceId: delivery.target_device_id, keyVersion: nextVersion, wrappedBlob: delivery.wrapped_blob });
      }
    };

    const offMembers = wsClient.on("members", (payload) => {
      const members = mapServerMembers(payload.members || []);
      memberRegistry.current[payload.group_id] = members;
      setMembersByGroup((prev) => ({
        ...prev,
        [payload.group_id]: members,
      }));
      const group = getLocalGroups().find((g) => g.groupId === payload.group_id);
      const previous = seenMembers.current[payload.group_id];
      const now = new Set(members.map((m) => m.deviceId));
      seenMembers.current[payload.group_id] = now;
      if (!group?.isAdmin) return;
      if (pendingRotations.current.delete(payload.group_id)) {
        void rotateAndDistribute(group, members).catch(() => setErrorMsg("群密钥轮换失败，请在管理面板重试"));
      } else if (previous) {
        const additions = members.filter((m) => !previous.has(m.deviceId));
        if (additions.length) void sendCurrentKey(group, additions).catch(() => setErrorMsg("无法向新成员下发群密钥"));
      }
    });

    const offMemberKicked = wsClient.on("member_kicked", (payload) => {
      const group = getLocalGroups().find((g) => g.groupId === payload.group_id);
      if (group?.isAdmin) pendingRotations.current.add(payload.group_id);
      // 列表随后会收到 members 广播；此处兜底
      setMembersByGroup((prev) => {
        const list = prev[payload.group_id];
        if (!list) return prev;
        return {
          ...prev,
          [payload.group_id]: list.filter((m) => m.deviceId !== payload.target_device_id),
        };
      });
    });

    const offMemberLeft = wsClient.on("member_left", (payload) => {
      const group = getLocalGroups().find((g) => g.groupId === payload.group_id);
      if (group?.isAdmin) pendingRotations.current.add(payload.group_id);
    });

    const offKeyDelivery = wsClient.on("key_delivery", async (payload) => {
      const group = getLocalGroups().find((g) => g.groupId === payload.group_id);
      if (!group) return;
      try {
        const admin = (memberRegistry.current[payload.group_id] || []).find((m) => m.deviceId === payload.from_device_id && m.isAdmin);
        if (!admin?.ecdhPub) throw new Error("untrusted_key_sender");
        const identity = await getOrCreateDeviceIdentity();
        const secret = await unwrapGroupSecret(JSON.parse(payload.wrapped_blob), await deriveSharedWrapKey(identity.ecdhPrivateKey, admin.ecdhPub));
        const isHistoricalJwk = secret.startsWith("jwk:");
        const keyJwk = isHistoricalJwk ? secret.slice(4) : await exportKeyToString(await deriveGroupKey(secret, payload.group_id));
        const key = await importKeyFromString(keyJwk);
        const keyJwks = { ...(group.keyJwks || (group.keyJwk ? { "1": group.keyJwk } : {})), [String(payload.key_version)]: keyJwk };
        const isCurrent = payload.key_version >= (group.keyVersion || 1);
        updateLocalGroup(payload.group_id, { keyJwks, ...(isCurrent && !isHistoricalJwk ? { keyVersion: payload.key_version, keyJwk, groupSecret: secret } : {}) });
        keyCache.current.set(`${payload.group_id}:${payload.key_version}`, key);
        setGroups(getLocalGroups());
        wsClient.ackKeyDelivery(payload.group_id, deviceId, payload.delivery_id);
      } catch {
        setErrorMsg("收到的群密钥无法验证或解密");
      }
    });

    const offKicked = wsClient.on("kicked", (payload) => {
      setErrorMsg("你已被管理员移出该群");
      setTimeout(() => setErrorMsg(null), 5000);
      removeLocalGroup(payload.group_id);
      keyCache.current.delete(payload.group_id);
      setGroups(getLocalGroups());
      setMessages((prev) => {
        const { [payload.group_id]: _d, ...rest } = prev;
        return rest;
      });
      setMembersByGroup((prev) => {
        const { [payload.group_id]: _d, ...rest } = prev;
        return rest;
      });
      setActiveGroupId((cur) => (cur === payload.group_id ? null : cur));
    });

    const offError = wsClient.on("error", (payload) => {
      const map: Record<string, string> = {
        invalid_invite_code: "邀请码无效或已失效",
        not_a_member: "你不是该群成员",
        not_authorized: "无管理员权限",
        name_and_device_id_required: "请填写群名称",
        invite_code_and_device_id_required: "请填写邀请码",
        missing_fields: "消息字段不完整",
        cannot_kick_admin: "不能踢出管理员",
        member_not_found: "成员不存在",
        display_name_taken: "昵称已被占用，请换一个",
        empty_display_name: "请填写昵称",
        rate_limited: "发送过于频繁，请稍后再试",
        invalid_history_cursor: "历史记录分页参数无效，请重新同步",
      };
      setErrorMsg(map[payload.message] || payload.message);
      setTimeout(() => setErrorMsg(null), 4500);
    });

    const offNotice = wsClient.on("daily_notice", (payload) => {
      setDailyNotice(payload);
      try { localStorage.setItem("sic_daily_notice", JSON.stringify(payload)); } catch { /* ignore */ }
    });
    const offMaintenance = wsClient.on("maintenance", (payload) => setMaintenance(payload.enabled));
    try {
      const cached = localStorage.getItem("sic_daily_notice");
      if (cached) setDailyNotice(JSON.parse(cached));
    } catch { /* ignore */ }
    void wsClient.reconnectNow();

    return () => {
      offConnected();
      offDisconnected();
      offServerInfo();
      offCreated();
      offJoined();
      offResumed();
      offHistory();
      offMessage();
      offFileChunk();
      offFileStatus();
      offCodeRegen();
      offMembers();
      offMemberKicked();
      offMemberLeft();
      offKeyDelivery();
      offKicked();
      offError();
      offNotice();
      offMaintenance();
    };
  }, [localMode, decryptIncoming, deviceId]);

  const createGroupLocal = useCallback(
    async (name: string, displayName: string) => {
      const groupSecret = generateGroupSecret();
      const groupId = `local-${randomUUID()}`;
      const inviteCode = shortInviteCode();
      const key = await deriveGroupKey(groupSecret, groupId);
      const keyJwk = await exportKeyToString(key);
      const localGroup: LocalGroup = {
        groupId,
        name,
        displayName,
        isAdmin: true,
        adminToken: `local-admin-${randomUUID()}`,
        keyJwk,
        groupSecret,
        lastKnownInviteCode: inviteCode,
      };
      saveLocalGroup(localGroup);
      keyCache.current.set(`${groupId}:1`, key);
      saveCachedMessages(groupId, []);
      setGroups(getLocalGroups());
      setActiveGroupId(groupId);
      setMessages((prev) => ({ ...prev, [groupId]: [] }));
      setMembersByGroup((prev) => ({
        ...prev,
        [groupId]: [
          {
            deviceId,
            displayName,
            joinedAt: Math.floor(Date.now() / 1000),
            isAdmin: true,
            online: true,
          },
        ],
      }));
    },
    [deviceId]
  );

  /** 不连服务器即可打开的界面演示；仅本机保存，不会向任何人发送消息。 */
  const openDemoChat = useCallback(async () => {
    const groupId = "local-ui-demo";
    setLocalMode(true);
    localModeRef.current = true;
    setLocalModeState(true);
    wsClient.disconnect();
    setStatus("local");

    let group = getLocalGroups().find((item) => item.groupId === groupId);
    if (!group) {
      const secret = generateGroupSecret();
      const key = await deriveGroupKey(secret, groupId);
      const keyJwk = await exportKeyToString(key);
      group = {
        groupId,
        name: "聊天示例",
        displayName: "我",
        isAdmin: true,
        adminToken: "local-demo-admin",
        keyJwk,
        keyVersion: 1,
        keyJwks: { "1": keyJwk },
        groupSecret: secret,
        lastKnownInviteCode: "LOCAL-DEMO",
      };
      saveLocalGroup(group);
      keyCache.current.set(`${groupId}:1`, key);
    }

    const cached = getCachedMessages(groupId);
    const demoMessages: ChatMessage[] =
      cached.length > 0
        ? cached
        : [
            {
              id: "demo-welcome",
              groupId,
              senderDeviceId: "demo-friend",
              senderName: "小助手",
              msgType: "text",
              text: "欢迎来到聊天演示。这里不需要连接服务器，也不会向外发送消息。",
              ts: Date.now() - 60_000,
              isMine: false,
              trust: "first_seen",
            },
            {
              id: "demo-own-message",
              groupId,
              senderDeviceId: deviceId,
              senderName: "我",
              msgType: "text",
              text: "这是新的微信式聊天界面。",
              ts: Date.now() - 20_000,
              isMine: true,
              trust: "verified",
            },
          ];
    if (cached.length === 0) saveCachedMessages(groupId, demoMessages);
    setGroups(getLocalGroups());
    setMessages((prev) => ({ ...prev, [groupId]: demoMessages }));
    setMembersByGroup((prev) => ({
      ...prev,
      [groupId]: [
        { deviceId, displayName: "我", joinedAt: Math.floor(Date.now() / 1000), isAdmin: true, online: true },
        { deviceId: "demo-friend", displayName: "小助手", joinedAt: Math.floor(Date.now() / 1000), isAdmin: false, online: true },
      ],
    }));
    setActiveGroupId(groupId);
  }, [deviceId]);


  const createGroup = useCallback(
    (name: string, displayName: string) => {
      if (localModeRef.current) {
        void createGroupLocal(name, displayName).catch(() => {
          setErrorMsg("无法初始化本地加密材料，请检查设备的安全随机数支持。");
          setTimeout(() => setErrorMsg(null), 5000);
        });
        return;
      }
      let groupSecret: string;
      try {
        groupSecret = generateGroupSecret();
      } catch {
        setErrorMsg("无法获取安全随机数，已停止创建群。");
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }
      const pending = { name, displayName, groupSecret };
      pendingCreate.current = pending;
      void wsClient.createGroup(name, deviceId, displayName).catch(() => {
        if (pendingCreate.current === pending) pendingCreate.current = null;
        setErrorMsg("无法初始化设备身份或发送建群请求，请重试。");
        setTimeout(() => setErrorMsg(null), 5000);
      });
    },
    [createGroupLocal, deviceId]
  );

  const joinGroup = useCallback(
    async (inviteRaw: string, displayName: string): Promise<boolean> => {
      const name = displayName.trim();
      if (!name) {
        setErrorMsg("请填写昵称");
        setTimeout(() => setErrorMsg(null), 3000);
        return false;
      }
      const parsed = parseInviteInput(inviteRaw);
      if (!parsed) {
        setErrorMsg("邀请码格式不正确");
        setTimeout(() => setErrorMsg(null), 3000);
        return false;
      }

      if (localModeRef.current) {
        if (!parsed.groupSecret) {
          setErrorMsg("SIC2 邀请需要连接服务器，由管理员定向下发群密钥");
          return false;
        }
        // 本地：用密钥材料派生稳定 groupId
        const material = `${parsed.serverInviteCode}:${parsed.groupSecret}`;
        const enc = new TextEncoder().encode(material);
        const hash = await crypto.subtle.digest("SHA-256", enc);
        const hex = [...new Uint8Array(hash)]
          .slice(0, 16)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const groupId = `local-join-${hex}`;
        const existing = getLocalGroups().find((g) => g.groupId === groupId);
        if (existing) {
          setActiveGroupId(groupId);
          return true;
        }
        const key = await deriveGroupKey(parsed.groupSecret, groupId);
        const keyJwk = await exportKeyToString(key);
        const localGroup: LocalGroup = {
          groupId,
          name: "本地加入的群",
          displayName: name,
          isAdmin: false,
          keyJwk,
          keyVersion: 1,
          keyJwks: { "1": keyJwk },
          groupSecret: parsed.groupSecret,
          lastKnownInviteCode: parsed.serverInviteCode,
        };
        saveLocalGroup(localGroup);
        keyCache.current.set(`${groupId}:1`, key);
        setGroups(getLocalGroups());
        setActiveGroupId(groupId);
        setMessages((prev) => ({
          ...prev,
          [groupId]: getCachedMessages(groupId),
        }));
        return true;
      }

      // 邀请内嵌服务器 → 自动切换（手机开流量跨网时）
      if (parsed.relayUrl) {
        const cur = getWsUrl();
        if (cur !== parsed.relayUrl) {
          setWsUrl(parsed.relayUrl);
          setStatus("connecting");
          const ok = await wsClient.waitUntilConnected(15000);
          if (!ok) {
            setErrorMsg(
              `无法连接 ${parsed.relayUrl}。手机流量需服务器公网可达（IP:8765 或 wss）。`
            );
            setTimeout(() => setErrorMsg(null), 6000);
            return false;
          }
          setStatus("online");
        }
      } else if (!wsClient.isOpen()) {
        setStatus("connecting");
        const ok = await wsClient.waitUntilConnected(12000);
        if (!ok) {
          setErrorMsg(
            "未连接服务器。请设置中填写电脑公网/局域网 IP；或使用带 |ws://… 的邀请码。"
          );
          setTimeout(() => setErrorMsg(null), 5500);
          return false;
        }
        setStatus("online");
      }

      pendingJoin.current = {
        serverInviteCode: parsed.serverInviteCode,
        groupSecret: parsed.groupSecret,
        displayName: name,
      };

      // 等待 joined / error，昵称冲突时不关加入弹窗
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          offJoined();
          offErr();
          resolve(ok);
        };
        const timer = setTimeout(() => {
          // 超时仍可能已成功，交给后续事件；不误关时可再试
          done(true);
        }, 10000);
        const offJoined = wsClient.on("joined", () => done(true));
        const offErr = wsClient.on("error", (payload) => {
          if (
            payload.message === "display_name_taken" ||
            payload.message === "invalid_invite_code" ||
            payload.message === "empty_display_name"
          ) {
            pendingJoin.current = null;
            done(false);
          }
        });
        void wsClient.joinGroup(parsed.serverInviteCode, deviceId, name).catch(() => {
          pendingJoin.current = null;
          setErrorMsg("无法初始化设备身份或发送入群请求，请重试。");
          setTimeout(() => setErrorMsg(null), 5000);
          done(false);
        });
      });
    },
    [deviceId]
  );

  const loadOlderMessages = useCallback(
    (groupId: string) => {
      if (localModeRef.current) return;
      const cursor = historyCursors[groupId];
      if (!cursor?.hasMore || cursor.beforeTs === undefined || !cursor.beforeId) return;
      wsClient.syncHistory(groupId, deviceId, {
        beforeTs: cursor.beforeTs,
        beforeId: cursor.beforeId,
      });
    },
    [deviceId, historyCursors]
  );

  const sendMessage = useCallback(
    async (groupId: string, text: string) => {
      const group = getLocalGroups().find((g) => g.groupId === groupId);
      if (!group || !text.trim()) return;
      const keyVersion = group.keyVersion || 1;
      const key = await getKey(group, keyVersion);
      const sealed = await sealEnvelope({
        kind: "text",
        body: text,
        senderName: group.displayName,
        deviceId,
        groupId,
        keyVersion,
      });
      const { ciphertext, iv } = await encryptText(key, sealed);

      // 乐观显示（本地调试与中继均立即可见）
      const tmpId = `tmp_${randomUUID()}`;
      const localMsg: ChatMessage = {
        id: tmpId,
        groupId,
        senderDeviceId: deviceId,
        senderName: group.displayName,
        msgType: "text",
        text,
        ts: Date.now(),
        isMine: true,
        trust: "verified",
      };
      appendMessage(groupId, localMsg);

      // 本地调试：再走一遍解密，验证加解密路径
      if (localModeRef.current) {
        try {
          const plain = await decryptText(key, ciphertext, iv);
          await openEnvelope(plain, groupId);
        } catch {
          setErrorMsg("本地加解密自检失败");
          setTimeout(() => setErrorMsg(null), 3000);
        }
        return;
      }

      wsClient.sendMessage({
        groupId,
        deviceId,
        msgType: "text",
        ciphertext,
        iv,
        senderName: "e2ee",
        keyVersion,
      });
    },
    [deviceId, getKey, appendMessage]
  );

  const sendFile = useCallback(
    async (
      groupId: string,
      file: File,
      onProgress?: (p: FileSendProgress) => void
    ) => {
      const group = getLocalGroups().find((g) => g.groupId === groupId);
      if (!group) return;
      if (file.size > MAX_FILE_BYTES) {
        setErrorMsg(`文件过大（上限 ${MAX_FILE_BYTES / 1024 / 1024}MB）`);
        setTimeout(() => setErrorMsg(null), 4000);
        return;
      }

      const report = (percent: number, stage: FileSendProgress["stage"], label: string) => {
        onProgress?.({ percent, stage, label });
      };

      // Network transfers use one AES-GCM operation per 256 KiB piece. The old
      // one-message implementation below is retained only for local UI demo mode.
      if (!localModeRef.current) {
        const keyVersion = group.keyVersion || 1;
        const key = await getKey(group, keyVersion);
        const fileId = randomUUID();
        report(5, "read", "正在分块读取文件");
        const { chunks, sha256 } = await makeEncryptedChunks(file, key, fileId, keyVersion, (done, total) => {
          report(5 + Math.round((done / total) * 65), "encrypt", `正在加密 ${done}/${total} 块`);
        });
        const manifest: FileManifest = { fileId, name: file.name, mime: file.type || "application/octet-stream",
          size: file.size, totalChunks: chunks.length, sha256 };
        pendingUploads.current.set(fileId, { groupId, chunks, senderName: group.displayName });
        appendMessage(groupId, { id: `tmp_${fileId}`, groupId, senderDeviceId: deviceId,
          senderName: group.displayName, msgType: "file", text: `📎 ${file.name}`, ts: Date.now(), isMine: true,
          file: { name: manifest.name, mime: manifest.mime, size: manifest.size,
            transfer: { received: 0, total: manifest.totalChunks } }, trust: "verified" });
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index]!;
          wsClient.sendFileChunk({ groupId, deviceId, senderName: group.displayName, fileId,
            chunkIndex: chunk.chunkIndex, totalChunks: chunk.totalChunks, ciphertext: chunk.ciphertext,
            iv: chunk.iv, keyVersion });
          report(70 + Math.round(((index + 1) / chunks.length) * 20), "send", `正在发送 ${index + 1}/${chunks.length} 块`);
        }
        const sealed = await sealEnvelope({ kind: "file", body: JSON.stringify(manifest), senderName: group.displayName,
          deviceId, groupId, keyVersion });
        const { ciphertext, iv } = await encryptText(key, sealed);
        wsClient.sendMessage({ groupId, deviceId, msgType: "file", ciphertext, iv, senderName: "e2ee", keyVersion });
        pendingUploads.current.delete(fileId);
        report(100, "done", "已发送，等待接收方校验");
        return;
      }

      report(5, "read", "读取文件…");
      await new Promise((r) => setTimeout(r, 16));
      const buf = await file.arrayBuffer();

      report(30, "encode", "编码中…");
      await new Promise((r) => setTimeout(r, 0));
      const dataB64 = bytesToB64(buf);
      const fileMeta = {
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        dataB64,
      };
      const fileBody = JSON.stringify(fileMeta);

      report(55, "encrypt", "端到端加密…");
      await new Promise((r) => setTimeout(r, 0));
      const sealed = await sealEnvelope({
        kind: "file",
        body: fileBody,
        senderName: group.displayName,
        deviceId,
        groupId,
        keyVersion: group.keyVersion || 1,
      });
      const keyVersion = group.keyVersion || 1;
      const key = await getKey(group, keyVersion);
      const { ciphertext, iv } = await encryptText(key, sealed);

      report(85, "send", localModeRef.current ? "写入本地会话…" : "发送密文…");
      await new Promise((r) => setTimeout(r, 0));

      const tmpId = `tmp_${randomUUID()}`;
      const localMsg: ChatMessage = {
        id: tmpId,
        groupId,
        senderDeviceId: deviceId,
        senderName: group.displayName,
        msgType: "file",
        text: `📎 ${file.name}`,
        ts: Date.now(),
        isMine: true,
        file: fileMeta,
        trust: "verified",
      };
      appendMessage(groupId, localMsg);

      if (localModeRef.current) {
        try {
          const plain = await decryptText(key, ciphertext, iv);
          await openEnvelope(plain, groupId);
        } catch {
          setErrorMsg("文件加解密自检失败");
          setTimeout(() => setErrorMsg(null), 3000);
        }
        report(100, "done", "已保存到本群");
        return;
      }

      wsClient.sendMessage({
        groupId,
        deviceId,
        msgType: "file",
        ciphertext,
        iv,
        senderName: "e2ee",
        keyVersion,
      });
      report(100, "done", "已发送");
    },
    [deviceId, getKey, appendMessage]
  );

  /** 本地调试：模拟对方发来一条文字（测接收气泡） */
  const simulatePeerMessage = useCallback(
    async (groupId: string, text?: string) => {
      const group = getLocalGroups().find((g) => g.groupId === groupId);
      if (!group) return;
      const body =
        text?.trim() ||
        `（模拟对方）${new Date().toLocaleTimeString("zh-CN")} 你好，这是测试消息。`;
      const peerId = "sim-peer-device";
      const msg: ChatMessage = {
        id: `sim_${randomUUID()}`,
        groupId,
        senderDeviceId: peerId,
        senderName: "测试对方",
        msgType: "text",
        text: body,
        ts: Date.now(),
        isMine: false,
        trust: "first_seen",
      };
      appendMessage(groupId, msg);
    },
    [appendMessage]
  );

  const regenerateCode = useCallback((groupId: string) => {
    const group = getLocalGroups().find((g) => g.groupId === groupId);
    if (!group?.adminToken) return;
    if (localModeRef.current) {
      const code = shortInviteCode();
      updateLocalGroup(groupId, { lastKnownInviteCode: code });
      setGroups(getLocalGroups());
      return;
    }
    wsClient.regenerateCode(groupId, group.adminToken);
  }, []);

  const updateMessage = useCallback((groupId: string, id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] || []).map((message) => message.id === id ? { ...message, ...patch } : message),
    }));
  }, []);

  async function tryCompleteReceivedFile(fileId: string) {
    const entry = fileManifests.current.get(fileId);
    if (!entry) return;
    const chunks = receivedChunks.current.get(fileId);
    const received = chunks?.size || 0;
    if (received < entry.manifest.totalChunks) {
      updateMessage(entry.groupId, entry.messageId, {
        file: { name: entry.manifest.name, mime: entry.manifest.mime, size: entry.manifest.size,
          transfer: { received, total: entry.manifest.totalChunks } },
      });
      return;
    }
    const group = getLocalGroups().find((candidate) => candidate.groupId === entry.groupId);
    if (!group || !chunks) return;
    try {
      const key = await getKey(group, [...chunks.values()][0]?.keyVersion || group.keyVersion || 1);
      const bytes = await decryptAndAssembleChunks([...chunks.values()], key, entry.manifest.sha256);
      updateMessage(entry.groupId, entry.messageId, {
        msgType: "file", text: `📎 ${entry.manifest.name}`,
        file: { name: entry.manifest.name, mime: entry.manifest.mime, size: entry.manifest.size, dataB64: fileDataB64(bytes) },
        decryptError: false,
      });
      receivedChunks.current.delete(fileId);
    } catch {
      updateMessage(entry.groupId, entry.messageId, {
        msgType: "file", text: "[文件损坏/传输不完整]", decryptError: true,
        file: { name: entry.manifest.name, mime: entry.manifest.mime, size: entry.manifest.size,
          transfer: { received, total: entry.manifest.totalChunks, error: "文件损坏/传输不完整" } },
      });
    }
  }

  const revokeInvite = useCallback((groupId: string) => { const g = getLocalGroups().find(x => x.groupId === groupId); if (g?.adminToken && !localModeRef.current) wsClient.revokeInvite(groupId, g.adminToken); }, []);
  const setInviteExpiry = useCallback((groupId: string, hours: number | null) => { const g = getLocalGroups().find(x => x.groupId === groupId); if (g?.adminToken && !localModeRef.current) wsClient.setInviteExpiry(groupId, g.adminToken, hours ? Math.floor(Date.now() / 1000) + hours * 3600 : null); }, []);

  const rotateGroupKeyNow = useCallback(async (groupId: string) => {
    const group = getLocalGroups().find((g) => g.groupId === groupId);
    if (!group?.isAdmin || localModeRef.current) return;
    const members = memberRegistry.current[groupId] || [];
    const version = (group.keyVersion || 1) + 1;
    const rotation = await rotateGroupKey(groupId, members.filter((m) => m.deviceId !== deviceId));
    const key = await deriveGroupKey(rotation.newSecret, groupId);
    const keyJwk = await exportKeyToString(key);
    updateLocalGroup(groupId, { groupSecret: rotation.newSecret, keyVersion: version, keyJwk, keyJwks: { ...(group.keyJwks || { "1": group.keyJwk }), [String(version)]: keyJwk } });
    keyCache.current.set(`${groupId}:${version}`, key);
    setGroups(getLocalGroups());
    rotation.deliveries.forEach((delivery) => wsClient.deliverKey({ groupId, deviceId, targetDeviceId: delivery.target_device_id, keyVersion: version, wrappedBlob: delivery.wrapped_blob }));
  }, [deviceId]);

  const shareHistoryWithMember = useCallback(async (groupId: string, targetDeviceId: string) => {
    const group = getLocalGroups().find((g) => g.groupId === groupId);
    const target = (memberRegistry.current[groupId] || []).find((m) => m.deviceId === targetDeviceId);
    if (!group?.isAdmin || !target?.ecdhPub || !group.keyJwks) return;
    const identity = await getOrCreateDeviceIdentity();
    const wrapKey = await deriveSharedWrapKey(identity.ecdhPrivateKey, target.ecdhPub);
    for (const [rawVersion, jwk] of Object.entries(group.keyJwks)) {
      const version = Number(rawVersion);
      if (version === (group.keyVersion || 1)) continue;
      // History entries store AES keys; re-exporting a secret is avoided by wrapping the JWK JSON itself.
      const wrapped = await wrapGroupSecret(`jwk:${jwk}`, wrapKey);
      wsClient.deliverKey({ groupId, deviceId, targetDeviceId, keyVersion: version, wrappedBlob: JSON.stringify(wrapped) });
    }
  }, [deviceId]);

  const leaveGroup = useCallback(
    (groupId: string) => {
      if (!localModeRef.current) wsClient.leaveGroup(groupId, deviceId);
      removeLocalGroup(groupId);
      for (const key of keyCache.current.keys()) if (key.startsWith(`${groupId}:`)) keyCache.current.delete(key);
      setGroups(getLocalGroups());
      setMessages((prev) => {
        const { [groupId]: _drop, ...rest } = prev;
        return rest;
      });
      setMembersByGroup((prev) => {
        const { [groupId]: _d, ...rest } = prev;
        return rest;
      });
      if (activeGroupId === groupId) setActiveGroupId(null);
    },
    [activeGroupId, deviceId]
  );

  const refreshMembers = useCallback(
    (groupId: string) => {
      if (localModeRef.current) return;
      wsClient.listMembers(groupId, deviceId);
    },
    [deviceId]
  );

  const kickMember = useCallback(
    (groupId: string, targetDeviceId: string) => {
      const group = getLocalGroups().find((g) => g.groupId === groupId);
      if (!group?.adminToken) {
        setErrorMsg("无管理员权限");
        setTimeout(() => setErrorMsg(null), 3000);
        return;
      }
      if (targetDeviceId === deviceId) {
        setErrorMsg("不能踢出自己");
        setTimeout(() => setErrorMsg(null), 3000);
        return;
      }
      if (localModeRef.current) {
        setMembersByGroup((prev) => ({
          ...prev,
          [groupId]: (prev[groupId] || []).filter((m) => m.deviceId !== targetDeviceId),
        }));
        return;
      }
      wsClient.kickMember(groupId, group.adminToken, targetDeviceId);
    },
    [deviceId]
  );
  const muteMember = useCallback((groupId: string, targetDeviceId: string, muted: boolean) => { const g = getLocalGroups().find(x => x.groupId === groupId); if (g?.adminToken) wsClient.muteMember(groupId, g.adminToken, targetDeviceId, muted); }, []);

  const getShareInvite = useCallback((groupId: string): string => {
    const g = getLocalGroups().find((x) => x.groupId === groupId);
    if (!g) return "";
    const secret = g.groupSecret || g.lastKnownInviteCode;
    // 自动附带「发给手机的公网地址」，流量用户扫码/粘贴即可
    return buildShareInvite(g.lastKnownInviteCode, secret, getInviteRelayUrl() || null);
  }, []);

  const getGroupSecret = useCallback((groupId: string): string => {
    const g = getLocalGroups().find((x) => x.groupId === groupId);
    return g?.groupSecret || g?.lastKnownInviteCode || "";
  }, []);

  const reconnect = useCallback(() => {
    if (isLocalMode()) {
      setStatus("local");
      setLocalModeState(true);
      localModeRef.current = true;
      return Promise.resolve();
    }
    setStatus("connecting");
    return wsClient.reconnectNow();
  }, []);

  /** 设置页切换本地/中继后调用 */
  const applyModeFromSettings = useCallback(() => {
    const on = isLocalMode();
    localModeRef.current = on;
    setLocalModeState(on);
    if (on) {
      wsClient.disconnect();
      setStatus("local");
      setMessages(loadAllCachedMessages());
    } else {
      setStatus("connecting");
      void wsClient.reconnectNow();
    }
  }, []);

  const clearSecurityAlert = useCallback(() => setSecurityAlert(null), []);
  const publishDailyNotice = useCallback((groupId: string, notice: { dailyDevotion: string; hymn: string; scripture: string }) => { const g = getLocalGroups().find(x => x.groupId === groupId); if (g?.adminToken) wsClient.publishDailyNotice(groupId, g.adminToken, notice); }, []);
  const setMaintenanceMode = useCallback((groupId: string, enabled: boolean) => { const g = getLocalGroups().find(x => x.groupId === groupId); if (g?.adminToken) wsClient.setMaintenance(groupId, g.adminToken, enabled); }, []);

  return {
    deviceId,
    groups,
    activeGroupId,
    setActiveGroupId,
    messages,
    membersByGroup,
    historyHasMore: Object.fromEntries(
      Object.entries(historyCursors).map(([groupId, cursor]) => [groupId, cursor.hasMore])
    ),
    phoneHints,
    status,
    localMode,
    errorMsg,
    securityAlert,
    dailyNotice,
    maintenance,
    clearSecurityAlert,
    createGroup,
    openDemoChat,
    joinGroup,
    loadOlderMessages,
    sendMessage,
    sendFile,
    simulatePeerMessage,
    regenerateCode,
    revokeInvite,
    setInviteExpiry,
    publishDailyNotice,
    setMaintenanceMode,
    rotateGroupKeyNow,
    shareHistoryWithMember,
    leaveGroup,
    refreshMembers,
    kickMember,
    muteMember,
    getShareInvite,
    getGroupSecret,
    reconnect,
    applyModeFromSettings,
  };
}
