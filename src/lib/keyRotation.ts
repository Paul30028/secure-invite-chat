import { b64ToBytes, bytesToB64 } from "./crypto";
import { getOrCreateDeviceIdentity } from "./deviceIdentity";
import { generateRandomSecret } from "./random";

export type WrappedSecret = { iv: string; ciphertext: string };
export type RotationMember = { deviceId: string; ecdhPub?: string };
export type KeyDelivery = { target_device_id: string; wrapped_blob: string };

export async function deriveSharedWrapKey(myEcdhPrivate: CryptoKey, peerEcdhPublicSpkiB64: string): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey("spki", b64ToBytes(peerEcdhPublicSpkiB64), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, myEcdhPrivate, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function wrapGroupSecret(newSecret: string, sharedWrapKey: CryptoKey): Promise<WrappedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedWrapKey, new TextEncoder().encode(newSecret));
  return { iv: bytesToB64(iv.buffer), ciphertext: bytesToB64(ciphertext) };
}

export async function unwrapGroupSecret(blob: WrappedSecret, sharedWrapKey: CryptoKey): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(blob.iv) }, sharedWrapKey, b64ToBytes(blob.ciphertext));
  return new TextDecoder().decode(plain);
}

/** Generate one fresh group secret and opaque per-device deliveries. */
export async function rotateGroupKey(groupId: string, remainingMembers: RotationMember[]): Promise<{ groupId: string; newSecret: string; deliveries: KeyDelivery[] }> {
  const identity = await getOrCreateDeviceIdentity();
  const newSecret = generateRandomSecret(32);
  const deliveries = await Promise.all(remainingMembers.map(async (member) => {
    if (!member.ecdhPub) return null;
    const wrapKey = await deriveSharedWrapKey(identity.ecdhPrivateKey, member.ecdhPub);
    const wrapped = await wrapGroupSecret(newSecret, wrapKey);
    return { target_device_id: member.deviceId, wrapped_blob: JSON.stringify(wrapped) };
  }));
  return { groupId, newSecret, deliveries: deliveries.filter((x): x is KeyDelivery => x !== null) };
}
