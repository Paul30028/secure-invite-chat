/**
 * 密码学安全随机数（兼容旧 WebView）
 * 避免部分环境 getRandomValues 异常导致“密钥每次相同”
 */

/** 填充 n 字节密码学安全随机数。安全随机不可用时必须失败，不能降级到 Math.random。 */
export function randomBytes(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 65_536) {
    throw new Error("invalid random byte length");
  }
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("secure random source unavailable");
  }
  const out = new Uint8Array(n);
  c.getRandomValues(out);
  return out;
}

/** URL-safe Base64（无填充） */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 生成群密钥材料：32 字节 CSPRNG，每次调用必不同 */
export function generateRandomSecret(byteLen = 32): string {
  const bytes = randomBytes(byteLen);
  return bytesToBase64Url(bytes);
}

/** 短邀请码用随机串 */
export function generateRandomToken(byteLen = 12): string {
  return bytesToBase64Url(randomBytes(byteLen));
}
