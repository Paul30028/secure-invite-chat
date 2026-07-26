import { describe, expect, it } from "vitest";
import { bytesToB64, b64ToBytes, deriveGroupKey } from "./crypto";
import { decryptAndAssembleChunks, makeEncryptedChunks } from "./fileChunks";

describe("chunked encrypted file transfer", () => {
  it("receives a 20 MB file beyond the old 4 MB ceiling and verifies its hash", async () => {
    const bytes = new Uint8Array(20 * 1024 * 1024);
    for (let index = 0; index < bytes.length; index += 4096) bytes[index] = index % 251;
    const key = await deriveGroupKey("chunk-test-secret", "group-20mb");
    const { chunks, sha256 } = await makeEncryptedChunks(new Blob([bytes]), key, "file-20mb", 1);
    expect(chunks.length).toBeGreaterThan(4);
    const assembled = await decryptAndAssembleChunks(chunks, key, sha256);
    const output = new Uint8Array(assembled);
    expect(output.byteLength).toBe(bytes.byteLength);
    expect(output[0]).toBe(bytes[0]);
    expect(output[4_194_304]).toBe(bytes[4_194_304]);
    expect(output[output.length - 1]).toBe(bytes[bytes.length - 1]);
  }, 30_000);

  it("resumes by sending only chunk indexes absent from the server", async () => {
    const key = await deriveGroupKey("resume-secret", "group-resume");
    const { chunks, sha256 } = await makeEncryptedChunks(new Blob([new Uint8Array(900_000).fill(7)]), key, "file-resume", 1);
    // A reconnect asks file_chunk_status. The server has these first chunks,
    // so the client computes and sends only the missing indexes.
    const serverHas = new Set(chunks.slice(0, 2).map((chunk) => chunk.chunkIndex));
    const missing = chunks.filter((chunk) => !serverHas.has(chunk.chunkIndex));
    expect(missing.length).toBe(chunks.length - 2);
    const reconstructed = await decryptAndAssembleChunks([...chunks.slice(0, 2), ...missing], key, sha256);
    expect(new Uint8Array(reconstructed)).toHaveLength(900_000);
  });

  it("rejects a tampered encrypted chunk instead of presenting a damaged file", async () => {
    const key = await deriveGroupKey("tamper-secret", "group-tamper");
    const { chunks, sha256 } = await makeEncryptedChunks(new Blob([new Uint8Array(700_000).fill(3)]), key, "file-tamper", 1);
    const altered = chunks.map((chunk) => ({ ...chunk }));
    const bytes = b64ToBytes(altered[1]!.ciphertext);
    bytes[0] ^= 1;
    altered[1]!.ciphertext = bytesToB64(bytes.buffer);
    await expect(decryptAndAssembleChunks(altered, key, sha256)).rejects.toThrow();
  });
});
