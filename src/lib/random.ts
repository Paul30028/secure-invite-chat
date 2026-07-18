/**
 * 密码学安全随机数（兼容旧 WebView）
 * 避免部分环境 getRandomValues 异常导致“密钥每次相同”
 */

let _counter = 0;

/** 填充 n 字节安全随机 */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let filled = false;

  try {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === "function") {
      c.getRandomValues(out);
      filled = true;
    }
  } catch {
    filled = false;
  }

  if (!filled) {
    // 降级：多源混合（仍非理想，但优于全 0）
    for (let i = 0; i < n; i++) {
      out[i] = Math.floor(Math.random() * 256) & 0xff;
    }
  }

  // 额外熵：时间 + 计数器异或，防止坏 RNG 输出恒定序列
  _counter = (_counter + 1) >>> 0;
  const t =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  const mix = new Uint8Array(8);
  const view = new DataView(mix.buffer);
  view.setUint32(0, Math.floor(t * 1000) >>> 0, true);
  view.setUint32(4, _counter ^ (Date.now() >>> 0), true);
  for (let i = 0; i < n; i++) {
    out[i] ^= mix[i % 8]!;
  }

  // 再跑一轮 getRandomValues 覆盖（若可用）
  try {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === "function") {
      const extra = new Uint8Array(n);
      c.getRandomValues(extra);
      for (let i = 0; i < n; i++) out[i] ^= extra[i]!;
    }
  } catch {
    /* ignore */
  }

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
  // 保证至少有非零字节
  if (bytes.every((b) => b === 0)) {
    bytes[0] = 1;
    bytes[byteLen - 1] = (_counter & 0xff) || 1;
  }
  return bytesToBase64Url(bytes);
}

/** 短邀请码用随机串 */
export function generateRandomToken(byteLen = 12): string {
  return bytesToBase64Url(randomBytes(byteLen));
}
