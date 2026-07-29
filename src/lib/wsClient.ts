/**
 * wsClient.ts - WebSocket 传输客户端
 * 当前：直连后端；未来：URL 改为 wss 中继即可，本模块 API 不变。
 * 只传输密文；加解密在 crypto / envelope。
 */

import { getWsUrl } from "./settings";
import { withWireVersion } from "./protocol";
import {
  buildAuthPayload,
  getOrCreateDeviceIdentity,
  signPayload,
} from "./deviceIdentity";

export type IncomingMessage = {
  id: string;
  group_id: string;
  sender_device_id: string;
  sender_name: string;
  msg_type: string;
  ciphertext: string;
  iv: string;
  key_version?: number;
  ts: number;
};

export type IncomingFileChunk = {
  group_id: string;
  sender_device_id: string;
  sender_name: string;
  file_id: string;
  chunk_index: number;
  total_chunks: number;
  ciphertext: string;
  iv: string;
  key_version?: number;
};

export type ServerMember = {
  device_id: string;
  display_name: string;
  joined_at: number;
  is_admin: boolean;
  online: boolean;
  ecdh_pub?: string;
};

export type CallSignal = {
  group_id: string;
  call_id: string;
  from_device_id: string;
  from_name: string;
  signal: "offer" | "answer" | "ice" | "hangup" | "reject";
  mode: "audio" | "video";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type ServerEventMap = {
  group_created: { group_id: string; name: string; invite_code: string; admin_token: string };
  joined: { group_id: string; name: string };
  resumed: { group_id: string };
  history: {
    group_id: string;
    messages: IncomingMessage[];
    has_more?: boolean;
    next_before_ts?: number;
    next_before_id?: string;
  };
  message: IncomingMessage;
  file_chunk: IncomingFileChunk;
  file_chunk_status: { group_id: string; file_id: string; received_indexes: number[] };
  code_regenerated: { group_id: string; invite_code: string };
  members: { group_id: string; members: ServerMember[] };
  member_kicked: { group_id: string; target_device_id: string };
  member_left: { group_id: string; target_device_id: string };
  key_delivery: { delivery_id: string; group_id: string; from_device_id: string; key_version: number; wrapped_blob: string };
  kicked: { group_id: string; reason?: string };
  call_signal: CallSignal;
  /** 服务器主动下发：手机同 Wi‑Fi 建议地址 */
  auth_challenge: { challenge: string };
  server_info: {
    port?: number;
    suggested_urls?: string[];
    hint?: string;
  };
  error: { message: string };
  daily_notice: { dailyDevotion: string; hymn: string; scripture: string; privacyReminder: string };
  maintenance: { enabled: boolean };
  member_muted: { group_id: string; target_device_id: string; muted: boolean };
  connected: undefined;
  disconnected: undefined;
};

type EventName = keyof ServerEventMap;
type Listener<K extends EventName> = (payload: ServerEventMap[K]) => void;

export class SicWsClient {
  private ws: WebSocket | null = null;
  private listeners: Record<string, Set<Listener<any>>> = {};
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private connectPromise: Promise<void> | null = null;
  private netHooksInstalled = false;
  private authChallenge: string | null = null;

  /** 每次连接读取最新 URL（设置面板可改） */
  private get url(): string {
    return getWsUrl();
  }

  /**
   * 手机开/关流量、切网络、App 回前台时自动重连
   */
  installNetworkHooks() {
    if (this.netHooksInstalled || typeof window === "undefined") return;
    this.netHooksInstalled = true;

    const tryReconnect = () => {
      if (!this.shouldReconnect) return;
      if (this.isOpen()) return;
      console.info("[SicWsClient] 网络恢复/回前台，尝试重连…");
      this.reconnectDelay = 1000;
      void this.reconnectNow();
    };

    window.addEventListener("online", tryReconnect);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tryReconnect();
    });
    // 部分 WebView：pageshow / focus
    window.addEventListener("pageshow", tryReconnect);
    window.addEventListener("focus", tryReconnect);
  }

  connect(): Promise<void> {
    this.installNetworkHooks();
    if (this.connectPromise) return this.connectPromise;
    this.shouldReconnect = true;
    const target = this.url;
    // 空地址或未写完的模板
    if (!target || target === "wss://" || target === "ws://") {
      this.connectPromise = null;
      this.emit("disconnected", undefined);
      return Promise.resolve();
    }
    this.connectPromise = new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(target);
      } catch (e) {
        console.warn("[SicWsClient] WebSocket construct failed", target, e);
        this.connectPromise = null;
        this.emit("disconnected", undefined);
        resolve();
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectDelay = 1000;
        this.emit("connected", undefined);
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.onmessage = (evt) => {
        if (this.ws !== ws) return;
        try {
          const data = JSON.parse(String(evt.data));
          const { type, ...payload } = data;
          if (type === "auth_challenge" && typeof payload.challenge === "string") {
            this.authChallenge = payload.challenge;
          }
          this.emit(type as EventName, payload);
        } catch (e) {
          console.error("[SicWsClient] 消息解析失败", e);
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.emit("disconnected", undefined);
        this.connectPromise = null;
        if (!settled) {
          settled = true;
          resolve();
        }
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000);
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    });
    return this.connectPromise;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 更换服务器地址后强制重连 */
  reconnectNow() {
    this.shouldReconnect = true;
    this.connectPromise = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    return this.connect();
  }

  /**
   * 切换地址后等待连上（手机流量换 wss 再入群）
   * @returns 是否在超时内连上
   */
  async waitUntilConnected(timeoutMs = 12000): Promise<boolean> {
    if (this.isOpen()) return true;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        offConn();
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const offConn = this.on("connected", () => finish(true));
      void this.reconnectNow().then(() => {
        if (this.isOpen()) finish(true);
      });
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
  }

  on<K extends EventName>(event: K, cb: Listener<K>): () => void {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(cb as Listener<any>);
    return () => this.listeners[event]?.delete(cb as Listener<any>);
  }

  private emit<K extends EventName>(event: K, payload: ServerEventMap[K]) {
    this.listeners[event]?.forEach((cb) => cb(payload));
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("[SicWsClient] 连接未就绪", payload.type);
      return;
    }
    // 带上 wire 版本，便于未来中继/多版本协商；旧服务端忽略未知字段
    this.ws.send(JSON.stringify(withWireVersion(payload)));
  }

  async createGroup(name: string, deviceId: string, displayName: string) {
    const identity = await getOrCreateDeviceIdentity();
    this.send({
      type: "create_group",
      name,
      device_id: deviceId,
      display_name: displayName,
      identity_pub: identity.publicKeySpkiB64,
      ecdh_pub: identity.ecdhPublicKeySpkiB64,
    });
  }

  async joinGroup(inviteCode: string, deviceId: string, displayName: string) {
    const identity = await getOrCreateDeviceIdentity();
    this.send({
      type: "join_group",
      invite_code: inviteCode,
      device_id: deviceId,
      display_name: displayName,
      identity_pub: identity.publicKeySpkiB64,
      ecdh_pub: identity.ecdhPublicKeySpkiB64,
    });
  }

  async resumeGroup(groupId: string, deviceId: string) {
    if (!this.authChallenge) {
      const off = this.on("auth_challenge", () => {
        off();
        void this.resumeGroup(groupId, deviceId);
      });
      return;
    }
    const identity = await getOrCreateDeviceIdentity();
    const authSig = await signPayload(
      identity.privateKey,
      buildAuthPayload({
        challenge: this.authChallenge,
        action: "resume_group",
        groupId,
        deviceId,
      })
    );
    this.send({
      type: "resume_group",
      group_id: groupId,
      device_id: deviceId,
      auth_sig: authSig,
    });
  }

  syncHistory(
    groupId: string,
    deviceId: string,
    cursor?: { beforeTs: number; beforeId: string }
  ) {
    this.send({
      type: "sync_history",
      group_id: groupId,
      device_id: deviceId,
      ...(cursor
        ? { before_ts: cursor.beforeTs, before_id: cursor.beforeId }
        : {}),
    });
  }

  sendMessage(params: {
    groupId: string;
    deviceId: string;
    msgType: string;
    ciphertext: string;
    iv: string;
    keyVersion: number;
    senderName: string;
  }) {
    this.send({
      type: "send_message",
      group_id: params.groupId,
      device_id: params.deviceId,
      msg_type: params.msgType,
      ciphertext: params.ciphertext,
      iv: params.iv,
      key_version: params.keyVersion,
      sender_name: params.senderName,
    });
  }

  sendCallSignal(params: {
    groupId: string;
    deviceId: string;
    targetDeviceId: string;
    callId: string;
    signal: CallSignal["signal"];
    mode: CallSignal["mode"];
    senderName: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) {
    this.send({
      type: "call_signal",
      group_id: params.groupId,
      device_id: params.deviceId,
      target_device_id: params.targetDeviceId,
      call_id: params.callId,
      signal: params.signal,
      mode: params.mode,
      sender_name: params.senderName,
      ...(params.sdp ? { sdp: params.sdp } : {}),
      ...(params.candidate ? { candidate: params.candidate } : {}),
    });
  }

  regenerateCode(groupId: string, adminToken: string) {
    this.send({ type: "regenerate_code", group_id: groupId, admin_token: adminToken });
  }

  listMembers(groupId: string, deviceId: string) {
    this.send({ type: "list_members", group_id: groupId, device_id: deviceId });
  }

  kickMember(groupId: string, adminToken: string, targetDeviceId: string) {
    this.send({
      type: "kick_member",
      group_id: groupId,
      admin_token: adminToken,
      target_device_id: targetDeviceId,
    });
  }

  sendFileChunk(params: {
    groupId: string; deviceId: string; senderName: string; fileId: string;
    chunkIndex: number; totalChunks: number; ciphertext: string; iv: string; keyVersion: number;
  }) {
    this.send({ type: "file_chunk", group_id: params.groupId, device_id: params.deviceId,
      sender_name: params.senderName, file_id: params.fileId, chunk_index: params.chunkIndex,
      total_chunks: params.totalChunks, ciphertext: params.ciphertext, iv: params.iv,
      key_version: params.keyVersion });
  }

  fileChunkStatus(groupId: string, deviceId: string, fileId: string) {
    this.send({ type: "file_chunk_status", group_id: groupId, device_id: deviceId, file_id: fileId });
  }

  syncFileChunks(groupId: string, deviceId: string, fileId: string, missingIndexes?: number[]) {
    this.send({ type: "sync_file_chunks", group_id: groupId, device_id: deviceId, file_id: fileId,
      ...(missingIndexes?.length ? { missing_indexes: missingIndexes } : {}) });
  }

  revokeInvite(groupId: string, adminToken: string) { this.send({ type: "revoke_invite", group_id: groupId, admin_token: adminToken }); }
  setInviteExpiry(groupId: string, adminToken: string, expiresAt: number | null) { this.send({ type: "set_invite_expiry", group_id: groupId, admin_token: adminToken, ...(expiresAt ? { expires_at: expiresAt } : {}) }); }

  leaveGroup(groupId: string, deviceId: string) {
    this.send({ type: "leave_group", group_id: groupId, device_id: deviceId });
  }

  deliverKey(params: { groupId: string; deviceId: string; targetDeviceId: string; keyVersion: number; wrappedBlob: string }) {
    this.send({ type: "deliver_key", group_id: params.groupId, device_id: params.deviceId, target_device_id: params.targetDeviceId, key_version: params.keyVersion, wrapped_blob: params.wrappedBlob });
  }

  ackKeyDelivery(groupId: string, deviceId: string, deliveryId: string) {
    this.send({ type: "ack_key_delivery", group_id: groupId, device_id: deviceId, delivery_id: deliveryId });
  }
  getDailyNotice() { this.send({ type: "get_daily_notice" }); }
  publishDailyNotice(groupId: string, adminToken: string, notice: { dailyDevotion: string; hymn: string; scripture: string; privacyReminder: string }) { this.send({ type: "publish_daily_notice", group_id: groupId, admin_token: adminToken, ...notice }); }
  setMaintenance(groupId: string, adminToken: string, enabled: boolean) { this.send({ type: "set_maintenance", group_id: groupId, admin_token: adminToken, enabled }); }
  muteMember(groupId: string, adminToken: string, targetDeviceId: string, muted: boolean) { this.send({ type: "mute_member", group_id: groupId, admin_token: adminToken, target_device_id: targetDeviceId, muted }); }
}

export const wsClient = new SicWsClient();
