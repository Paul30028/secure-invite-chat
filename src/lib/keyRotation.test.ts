import { beforeAll, describe, expect, it } from "vitest";
import { decryptText, deriveGroupKey, encryptText } from "./crypto";
import { deriveSharedWrapKey, unwrapGroupSecret, wrapGroupSecret } from "./keyRotation";

beforeAll(() => {
  // Node's Web Crypto has the same P-256/AES-GCM surface used by browsers.
  if (!globalThis.crypto) throw new Error("Web Crypto is required for these tests");
});

describe("versioned group keys", () => {
  it("a kicked member's old key cannot decrypt a post-rotation message", async () => {
    const oldKey = await deriveGroupKey("old-secret", "group");
    const newKey = await deriveGroupKey("new-secret", "group");
    const encrypted = await encryptText(newKey, "after kick");
    await expect(decryptText(oldKey, encrypted.ciphertext, encrypted.iv)).rejects.toThrow();
    await expect(decryptText(newKey, encrypted.ciphertext, encrypted.iv)).resolves.toBe("after kick");
  });

  it("a newly joined member without a shared history key cannot decrypt history", async () => {
    const historyKey = await deriveGroupKey("epoch-one", "group");
    const currentKey = await deriveGroupKey("epoch-two", "group");
    const encryptedHistory = await encryptText(historyKey, "before B joined");
    await expect(decryptText(currentKey, encryptedHistory.ciphertext, encryptedHistory.iv)).rejects.toThrow();
  });

  it("an offline device can unwrap its queued delivery after resume", async () => {
    const admin = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const offlineMember = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const memberPub = await crypto.subtle.exportKey("spki", offlineMember.publicKey);
    const adminPub = await crypto.subtle.exportKey("spki", admin.publicKey);
    const toB64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
    const delivery = await wrapGroupSecret("epoch-three", await deriveSharedWrapKey(admin.privateKey, toB64(memberPub)));
    // This object is the exact opaque value that may sit in pending_key_deliveries while offline.
    const received = await unwrapGroupSecret(delivery, await deriveSharedWrapKey(offlineMember.privateKey, toB64(adminPub)));
    expect(received).toBe("epoch-three");
  });
});
