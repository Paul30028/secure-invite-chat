/**
 * 设备长期身份密钥（ECDSA P-256）
 * - 用于对消息内容签名，防止同群其它设备伪造你的昵称/身份（TOFU 信任模型）
 * - 私钥永不离开本机；公钥随加密信封发给群成员
 * - 首次看到某 deviceId 的公钥时自动记忆；若之后公钥变化 → 安全警告
 */

const ID_KEY = "sic_device_identity_v1";
const KNOWN_KEYS = "sic_known_device_pubs_v1";

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export type DeviceIdentity = {
  publicKeySpkiB64: string;
  privateKeyPkcs8B64: string;
};

export async function getOrCreateDeviceIdentity(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpkiB64: string;
}> {
  const raw = localStorage.getItem(ID_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as DeviceIdentity;
    const publicKey = await crypto.subtle.importKey(
      "spki",
      fromB64(saved.publicKeySpkiB64) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      fromB64(saved.privateKeyPkcs8B64) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    return { publicKey, privateKey, publicKeySpkiB64: saved.publicKeySpkiB64 };
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const publicKeySpkiB64 = toB64(spki);
  localStorage.setItem(
    ID_KEY,
    JSON.stringify({
      publicKeySpkiB64,
      privateKeyPkcs8B64: toB64(pkcs8),
    } satisfies DeviceIdentity)
  );
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeySpkiB64,
  };
}

/** 签名内容：规范化字符串，收发双方一致 */
export function buildSignPayload(parts: {
  body: string;
  deviceId: string;
  ts: number;
  groupId: string;
}): string {
  return `${parts.groupId}|${parts.deviceId}|${parts.ts}|${parts.body}`;
}

export async function signPayload(
  privateKey: CryptoKey,
  payload: string
): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(payload)
  );
  return toB64(sig);
}

export async function verifyPayload(
  publicKeySpkiB64: string,
  payload: string,
  sigB64: string
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "spki",
      fromB64(publicKeySpkiB64) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromB64(sigB64) as BufferSource,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

type KnownMap = Record<string, string>; // deviceId -> pubB64

function loadKnown(): KnownMap {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_KEYS) || "{}") as KnownMap;
  } catch {
    return {};
  }
}

function saveKnown(m: KnownMap) {
  localStorage.setItem(KNOWN_KEYS, JSON.stringify(m));
}

export type TrustResult =
  | { status: "ok" | "first_seen" | "no_sig" | "bad_sig" | "key_changed"; knownPub?: string };

/**
 * TOFU：首次记住公钥；之后公钥变化报警
 */
export function rememberDeviceKey(
  deviceId: string,
  publicKeySpkiB64: string | undefined
): TrustResult {
  if (!publicKeySpkiB64) return { status: "no_sig" };
  const known = loadKnown();
  const prev = known[deviceId];
  if (!prev) {
    known[deviceId] = publicKeySpkiB64;
    saveKnown(known);
    return { status: "first_seen", knownPub: publicKeySpkiB64 };
  }
  if (prev !== publicKeySpkiB64) {
    return { status: "key_changed", knownPub: prev };
  }
  return { status: "ok", knownPub: prev };
}

export function getKnownDevicePub(deviceId: string): string | undefined {
  return loadKnown()[deviceId];
}
