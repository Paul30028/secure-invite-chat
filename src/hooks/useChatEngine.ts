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
import type { ChatMessage, GroupMember, LocalGroup, TrustBadge } from "../lib/types";
import type { ServerMember } from "../lib/wsClient";

function mapServerMembers(list: ServerMember[]): GroupMember[] {
  return list.map((m) => ({
    deviceId: m.device_id,
    displayName: m.display_name,
    joinedAt: m.joined_at,
    isAdmin: !!m.is_admin,
    online: !!m.online,
  }));
}

export type ConnStatus = "connecting" | "online" | "offline" | "local";

export const MAX_FILE_BYTES = LIMITS.maxFileBytes;

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
  const localModeRef = useRef(isLocalMode());

  const [groups, setGroups] = useState<LocalGroup[]>(() => getLocalGroups());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() =>
    isLocalMode() ? loadAllCachedMessages() : {}
  );
  const [status, setStatus] = useState<ConnStatus>(() =>
    isLocalMode() ? "local" : "connecting"
  );
  const [localMode, setLocalModeState] = useState(() => isLocalMode());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [securityAlert, setSecurityAlert] = useState<string | null>(null);
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
    groupSecret: string;
    displayName: string;
  } | null>(null);

  const getKey = useCallback(async (group: LocalGroup): Promise<CryptoKey> => {
    const cached = keyCache.current.get(group.groupId);
    if (cached) return cached;
    const key = await importKeyFromString(group.keyJwk);
    keyCache.current.set(group.groupId, key);
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
        const key = await getKey(group);
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
            dataB64: string;
          };
          return {
            id: m.id,
            groupId: m.group_id,
            senderDeviceId,
            senderName,
            msgType: "file",
            text: `📎 ${meta.name}`,
            ts,
            isMine: senderDeviceId === deviceId || m.sender_device_id === deviceId,
            file: meta,
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
      } catch {
        return {
          id: m.id,
          groupId: m.group_id,
          senderDeviceId: m.sender_device_id,
          senderName: m.sender_name,
          msgType: m.msg_type,
          text: "[解密失败：密钥不匹配或消息已损坏]",
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
        groupSecret: secret,
        lastKnownInviteCode: payload.invite_code,
      };
      saveLocalGroup(localGroup);
      keyCache.current.set(payload.group_id, key);
      setGroups(getLocalGroups());
      setActiveGroupId(payload.group_id);
      setMessages((prev) => ({ ...prev, [payload.group_id]: prev[payload.group_id] || [] }));
    });

    const offJoined = wsClient.on("joined", async (payload) => {
      const pending = pendingJoin.current;
      pendingJoin.current = null;
      if (!pending) return;
      const key = await deriveGroupKey(pending.groupSecret, payload.group_id);
      const keyJwk = await exportKeyToString(key);
      const localGroup: LocalGroup = {
        groupId: payload.group_id,
        name: payload.name,
        displayName: pending.displayName,
        isAdmin: false,
        keyJwk,
        groupSecret: pending.groupSecret,
        lastKnownInviteCode: pending.serverInviteCode,
      };
      saveLocalGroup(localGroup);
      keyCache.current.set(payload.group_id, key);
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
      setMessages((prev) => ({ ...prev, [payload.group_id]: decrypted }));
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

    const offMembers = wsClient.on("members", (payload) => {
      setMembersByGroup((prev) => ({
        ...prev,
        [payload.group_id]: mapServerMembers(payload.members || []),
      }));
    });

    const offMemberKicked = wsClient.on("member_kicked", (payload) => {
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
      };
      setErrorMsg(map[payload.message] || payload.message);
      setTimeout(() => setErrorMsg(null), 4500);
    });

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
      offCodeRegen();
      offMembers();
      offMemberKicked();
      offKicked();
      offError();
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
      keyCache.current.set(groupId, key);
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
          groupSecret: parsed.groupSecret,
          lastKnownInviteCode: parsed.serverInviteCode,
        };
        saveLocalGroup(localGroup);
        keyCache.current.set(groupId, key);
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

  const sendMessage = useCallback(
    async (groupId: string, text: string) => {
      const group = getLocalGroups().find((g) => g.groupId === groupId);
      if (!group || !text.trim()) return;
      const key = await getKey(group);
      const sealed = await sealEnvelope({
        kind: "text",
        body: text,
        senderName: group.displayName,
        deviceId,
        groupId,
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
      });
      const key = await getKey(group);
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

  const leaveGroup = useCallback(
    (groupId: string) => {
      removeLocalGroup(groupId);
      keyCache.current.delete(groupId);
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
    [activeGroupId]
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

  return {
    deviceId,
    groups,
    activeGroupId,
    setActiveGroupId,
    messages,
    membersByGroup,
    phoneHints,
    status,
    localMode,
    errorMsg,
    securityAlert,
    clearSecurityAlert,
    createGroup,
    joinGroup,
    sendMessage,
    sendFile,
    simulatePeerMessage,
    regenerateCode,
    leaveGroup,
    refreshMembers,
    kickMember,
    getShareInvite,
    getGroupSecret,
    reconnect,
    applyModeFromSettings,
  };
}
