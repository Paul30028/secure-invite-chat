/**
 * crypto.ts - 端到端加密核心
 *
 * ============ 安全模型 ============
 * - 群组共享 AES-256-GCM 密钥，由 groupSecret + groupId 经 PBKDF2 派生。
 * - 服务器只存/转 ciphertext+iv，永不接触密钥与明文。
 * - groupSecret 与服务器 invite_code 分离（见 invite.ts），管理员轮换邀请码
 *   不会更换群密钥，已在群成员可继续解密。
 * - 发送者身份：envelope.ts 的设备签名用于迁移期验签；它不替代群 epoch、
 *   前向保密或强制设备认证。
 * - 局限：无前向保密；群共享密钥持有者仍可读取全部历史，成员移除尚未触发
 *   新群密钥 epoch。
 */

const PBKDF2_ITERATIONS = 100_000;

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Avoid quadratic string concatenation for encrypted file chunks. 32 KiB is
  // safe for apply() in browsers and keeps peak memory bounded on mobile.
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += 0x8000) {
    const part = bytes.subarray(start, Math.min(start + 0x8000, bytes.length));
    parts.push(String.fromCharCode(...part));
  }
  return btoa(parts.join(""));
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 从群密钥材料派生 AES-GCM 密钥（不是从 invite_code） */
export async function deriveGroupKey(groupSecret: string, groupId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(groupSecret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`sic-salt-${groupId}`),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyToString(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function importKeyFromString(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return { ciphertext: toB64(cipherBuf), iv: toB64(iv.buffer as ArrayBuffer) };
}

export async function decryptText(
  key: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<string> {
  const cipherBytes = fromB64(ciphertext);
  const ivBytes = fromB64(iv);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  return new TextDecoder().decode(plainBuf);
}

/** 加密任意二进制（文件） */
export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return { ciphertext: toB64(cipherBuf), iv: toB64(iv.buffer as ArrayBuffer) };
}

export async function decryptBytes(
  key: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<ArrayBuffer> {
  const cipherBytes = fromB64(ciphertext);
  const ivBytes = fromB64(iv);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource
  );
}

export function bytesToB64(buf: ArrayBuffer): string {
  return toB64(buf);
}

export function b64ToBytes(b64: string): Uint8Array {
  return fromB64(b64);
}
