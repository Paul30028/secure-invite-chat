/**
 * 设备长期身份密钥（ECDSA P-256）
 * - 用于对消息内容签名，防止同群其它设备伪造你的昵称/身份（TOFU 信任模型）
 * - 私钥永不离开本机；公钥随加密信封发给群成员
 * - 首次看到某 deviceId 的公钥时自动记忆；若之后公钥变化 → 安全警告
 */

const ID_KEY = "sic_device_identity_v1";
const KEY_DB = "sic_device_keys_v2";
const KEY_STORE = "identities";
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
  /** Only used to migrate the old localStorage representation once. */
  privateKeyPkcs8B64?: string;
};

type StoredIdentity = {
  id: "current";
  publicKeySpkiB64: string;
  privateKey: CryptoKey;
  ecdhPublicKeySpkiB64: string;
  ecdhPrivateKey: CryptoKey;
};

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("secure_key_store_unavailable"));
  });
}

async function readStoredIdentity(): Promise<StoredIdentity | undefined> {
  const db = await openKeyDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get("current");
      request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveStoredIdentity(value: StoredIdentity): Promise<void> {
  const db = await openKeyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(KEY_STORE, "readwrite").objectStore(KEY_STORE).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function generateIdentity(): Promise<StoredIdentity> {
  // Export only during creation, then immediately re-import private keys as non-extractable.
  const signPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const ecdhPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const [signSpki, signPkcs8, ecdhSpki, ecdhPkcs8] = await Promise.all([
    crypto.subtle.exportKey("spki", signPair.publicKey),
    crypto.subtle.exportKey("pkcs8", signPair.privateKey),
    crypto.subtle.exportKey("spki", ecdhPair.publicKey),
    crypto.subtle.exportKey("pkcs8", ecdhPair.privateKey),
  ]);
  return {
    id: "current",
    publicKeySpkiB64: toB64(signSpki),
    privateKey: await crypto.subtle.importKey("pkcs8", signPkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
    ecdhPublicKeySpkiB64: toB64(ecdhSpki),
    ecdhPrivateKey: await crypto.subtle.importKey("pkcs8", ecdhPkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]),
  };
}

export async function getOrCreateDeviceIdentity(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpkiB64: string;
  ecdhPrivateKey: CryptoKey;
  ecdhPublicKeySpkiB64: string;
}> {
  let saved = await readStoredIdentity();
  if (!saved) {
    // One-way migration removes the previous plaintext private key from localStorage.
    const legacyRaw = localStorage.getItem(ID_KEY);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as DeviceIdentity;
        if (legacy.privateKeyPkcs8B64 && legacy.publicKeySpkiB64) {
          const fresh = await generateIdentity();
          fresh.publicKeySpkiB64 = legacy.publicKeySpkiB64;
          fresh.privateKey = await crypto.subtle.importKey("pkcs8", fromB64(legacy.privateKeyPkcs8B64), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
          saved = fresh;
        }
      } catch { /* generate a clean identity below */ }
      localStorage.removeItem(ID_KEY);
    }
    saved ||= await generateIdentity();
    await saveStoredIdentity(saved);
  }
  const publicKey = await crypto.subtle.importKey("spki", fromB64(saved.publicKeySpkiB64), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return { publicKey, privateKey: saved.privateKey, publicKeySpkiB64: saved.publicKeySpkiB64, ecdhPrivateKey: saved.ecdhPrivateKey, ecdhPublicKeySpkiB64: saved.ecdhPublicKeySpkiB64 };
}

/** 签名内容：规范化字符串，收发双方一致 */
export function buildSignPayload(parts: {
  body: string;
  deviceId: string;
  ts: number;
  groupId: string;
  keyVersion?: number;
}): string {
  const base = `${parts.groupId}|${parts.deviceId}|${parts.ts}|${parts.body}`;
  return parts.keyVersion === undefined ? base : `${base}|${parts.keyVersion}`;
}

export async function signPayload(
  privateKey: CryptoKey,
  payload: string | BufferSource
): Promise<string> {
  const data =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return toB64(sig);
}

/** 与 server/auth.py 保持一致的长度前缀认证载荷。 */
export function buildAuthPayload(parts: {
  challenge: string;
  action: string;
  groupId: string;
  deviceId: string;
}): Uint8Array {
  const values = ["sic-device-auth-v1", parts.challenge, parts.action, parts.groupId, parts.deviceId];
  const encoded = values.map((value) => new TextEncoder().encode(value));
  if (values.some((value) => !value || /[\r\n]/.test(value))) {
    throw new Error("invalid authentication payload");
  }
  const length = encoded.reduce((total, value) => total + 4 + value.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const value of encoded) {
    new DataView(out.buffer).setUint32(offset, value.length, false);
    offset += 4;
    out.set(value, offset);
    offset += value.length;
  }
  return out;
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
