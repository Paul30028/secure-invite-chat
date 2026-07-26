import { b64ToBytes, bytesToB64, decryptBytes, encryptBytes } from "./crypto";

/** Small enough for reverse proxies and mobile WebViews, large enough for photos. */
export const FILE_CHUNK_BYTES = 256 * 1024;

export type EncryptedFileChunk = {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  ciphertext: string;
  iv: string;
  keyVersion: number;
};

export type FileManifest = {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  totalChunks: number;
  sha256: string;
};

export async function sha256B64(data: ArrayBuffer): Promise<string> {
  return bytesToB64(await crypto.subtle.digest("SHA-256", data));
}

export async function makeEncryptedChunks(
  file: Blob,
  key: CryptoKey,
  fileId: string,
  keyVersion: number,
  onChunk?: (done: number, total: number) => void,
): Promise<{ chunks: EncryptedFileChunk[]; sha256: string }> {
  const totalChunks = Math.max(1, Math.ceil(file.size / FILE_CHUNK_BYTES));
  const chunks: EncryptedFileChunk[] = [];
  const chunkDigests: Uint8Array[] = [];
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * FILE_CHUNK_BYTES;
    const plaintext = await file.slice(start, Math.min(start + FILE_CHUNK_BYTES, file.size)).arrayBuffer();
    const { ciphertext, iv } = await encryptBytes(key, plaintext);
    chunkDigests.push(new Uint8Array(await crypto.subtle.digest("SHA-256", plaintext)));
    chunks.push({ fileId, chunkIndex, totalChunks, ciphertext, iv, keyVersion });
    onChunk?.(chunkIndex + 1, totalChunks);
  }
  const digestInput = new Uint8Array(chunkDigests.length * 32);
  chunkDigests.forEach((digest, index) => digestInput.set(digest, index * 32));
  const sha256 = await sha256B64(digestInput.buffer);
  return { chunks, sha256 };
}

export async function decryptAndAssembleChunks(
  chunks: EncryptedFileChunk[],
  key: CryptoKey,
  expectedHash: string,
): Promise<ArrayBuffer> {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const plaintext: ArrayBuffer[] = [];
  const chunkDigests: Uint8Array[] = [];
  let size = 0;
  for (const chunk of ordered) {
    const part = await decryptBytes(key, chunk.ciphertext, chunk.iv);
    plaintext.push(part);
    size += part.byteLength;
    chunkDigests.push(new Uint8Array(await crypto.subtle.digest("SHA-256", part)));
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of plaintext) { out.set(new Uint8Array(part), offset); offset += part.byteLength; }
  const digestInput = new Uint8Array(chunkDigests.length * 32);
  chunkDigests.forEach((digest, index) => digestInput.set(digest, index * 32));
  const assembled = out.buffer;
  if (await sha256B64(digestInput.buffer) !== expectedHash) throw new Error("file_hash_mismatch");
  return assembled;
}

export function fileDataB64(data: ArrayBuffer): string { return bytesToB64(data); }

export function chunkFromWire(chunk: Omit<EncryptedFileChunk, "keyVersion"> & { key_version?: number }): EncryptedFileChunk {
  return { ...chunk, keyVersion: chunk.key_version || 1 };
}

export function chunkCiphertextIsOpaque(value: string): boolean {
  // Contract test helper: transport only requires a non-empty opaque string.
  return typeof value === "string" && value.length > 0 && b64ToBytes(value).byteLength > 0;
}
