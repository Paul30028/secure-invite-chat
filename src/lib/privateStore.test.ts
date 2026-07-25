import { describe, expect, it } from "vitest";
import { decryptBackupPayload, encryptBackupPayload, type PrivateData } from "./privateStore";
const data: PrivateData = { contacts: { d: { deviceId: "d", displayName: "Alice", remark: "研发", safetyStatus: "unverified", groupIds: ["g"], addedAt: 1 } }, conversationPrefs: { g: { muted: true } }, pendingInvites: [], settings: { notifications: true, safetyReminders: true } };
describe("local private backup", () => {
  it("round-trips a password-encrypted local payload", async () => expect(await decryptBackupPayload(await encryptBackupPayload(data, "password"), "password")).toEqual(data));
  it("rejects a wrong password", async () => await expect(decryptBackupPayload(await encryptBackupPayload(data, "password"), "wrong")).rejects.toThrow());
});
