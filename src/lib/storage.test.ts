import {
  getPendingOutboundMessages,
  removePendingOutboundMessage,
  savePendingOutboundMessage,
} from "./storage";
import { beforeEach, describe, expect, it } from "vitest";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe("encrypted outbound queue", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  });

  it("persists only the opaque encrypted transport envelope", () => {
    savePendingOutboundMessage({
      clientMessageId: "client-1",
      localMessageId: "tmp_client-1",
      groupId: "group-1",
      deviceId: "device-1",
      msgType: "text",
      ciphertext: "opaque-ciphertext",
      iv: "opaque-iv",
      keyVersion: 2,
      senderName: "e2ee",
      createdAt: 1,
    });
    expect(getPendingOutboundMessages()).toEqual([
      expect.objectContaining({
        clientMessageId: "client-1",
        ciphertext: "opaque-ciphertext",
        iv: "opaque-iv",
        keyVersion: 2,
      }),
    ]);
    expect(JSON.stringify(getPendingOutboundMessages())).not.toContain("明文内容");
  });

  it("removes a queued item only after its client id is acknowledged", () => {
    savePendingOutboundMessage({
      clientMessageId: "client-2", localMessageId: "tmp_client-2", groupId: "g", deviceId: "d",
      msgType: "text", ciphertext: "c", iv: "i", keyVersion: 1, senderName: "e2ee", createdAt: 1,
    });
    removePendingOutboundMessage("client-2");
    expect(getPendingOutboundMessages()).toEqual([]);
  });
});
