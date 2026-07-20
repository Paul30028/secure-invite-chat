/**
 * 加密信封：明文业务数据打包后再 AES-GCM
 * - 发送者昵称放进密文内，服务器 sender_name 仅占位，减少元数据
 * - 附带设备公钥 + ECDSA 签名（Signal 风格身份绑定的简化版）
 * - 可选填充，降低纯长度侧信道
 */

import {
  buildSignPayload,
  getOrCreateDeviceIdentity,
  rememberDeviceKey,
  signPayload,
  verifyPayload,
  type TrustResult,
} from "./deviceIdentity";
import { randomBytes } from "./random";

export type EnvelopeV1 = {
  v: 1;
  kind: "text" | "file";
  /** 文本内容，或 file 时的 JSON 字符串 */
  body: string;
  senderName: string;
  deviceId: string;
  ts: number;
  pub?: string;
  sig?: string;
  /** 随机填充，打乱密文长度 */
  pad?: string;
};

function randomPad(min = 0, max = 48): string {
  const span = max - min + 1;
  const rejectionLimit = 256 - (256 % span);
  let selector = randomBytes(1)[0]!;
  while (selector >= rejectionLimit) selector = randomBytes(1)[0]!;
  const n = min + (selector % span);
  const bytes = randomBytes(n || 1);
  if (n === 0) return "";
  let s = "";
  for (const b of bytes) s += String.fromCharCode(33 + (b % 90));
  return s;
}

export async function sealEnvelope(params: {
  kind: "text" | "file";
  body: string;
  senderName: string;
  deviceId: string;
  groupId: string;
}): Promise<string> {
  const id = await getOrCreateDeviceIdentity();
  const ts = Date.now();
  const toSign = buildSignPayload({
    body: params.body,
    deviceId: params.deviceId,
    ts,
    groupId: params.groupId,
  });
  const sig = await signPayload(id.privateKey, toSign);
  const env: EnvelopeV1 = {
    v: 1,
    kind: params.kind,
    body: params.body,
    senderName: params.senderName,
    deviceId: params.deviceId,
    ts,
    pub: id.publicKeySpkiB64,
    sig,
    pad: randomPad(),
  };
  return JSON.stringify(env);
}

export type OpenedEnvelope = {
  kind: "text" | "file";
  body: string;
  senderName: string;
  deviceId: string;
  ts: number;
  trust: TrustResult;
  sigValid: boolean | null;
  /** 非信封旧消息 */
  legacy: boolean;
};

export async function openEnvelope(
  plain: string,
  groupId: string
): Promise<OpenedEnvelope> {
  // 兼容旧版：直接是纯文本，或以 {name,mime,dataB64} 文件 JSON
  try {
    const obj = JSON.parse(plain) as EnvelopeV1;
    if (obj && obj.v === 1 && obj.kind && obj.body !== undefined) {
      let sigValid: boolean | null = null;
      let trust: TrustResult = { status: "no_sig" };
      if (obj.sig && obj.pub) {
        const payload = buildSignPayload({
          body: obj.body,
          deviceId: obj.deviceId,
          ts: obj.ts,
          groupId,
        });
        // 验签必须发生在写入 TOFU 记录之前；否则恶意成员可用无效签名
        // 污染某个 deviceId 的首次信任公钥。
        sigValid = await verifyPayload(obj.pub, payload, obj.sig);
        trust = sigValid
          ? rememberDeviceKey(obj.deviceId, obj.pub)
          : { status: "bad_sig" };
      } else {
        sigValid = null;
      }
      return {
        kind: obj.kind,
        body: obj.body,
        senderName: obj.senderName,
        deviceId: obj.deviceId,
        ts: obj.ts,
        trust,
        sigValid,
        legacy: false,
      };
    }
  } catch {
    /* legacy path */
  }

  // 旧文件格式
  try {
    const f = JSON.parse(plain) as { name?: string; dataB64?: string };
    if (f?.name && f?.dataB64) {
      return {
        kind: "file",
        body: plain,
        senderName: "未知",
        deviceId: "",
        ts: 0,
        trust: { status: "no_sig" },
        sigValid: null,
        legacy: true,
      };
    }
  } catch {
    /* text */
  }

  return {
    kind: "text",
    body: plain,
    senderName: "未知",
    deviceId: "",
    ts: 0,
    trust: { status: "no_sig" },
    sigValid: null,
    legacy: true,
  };
}
