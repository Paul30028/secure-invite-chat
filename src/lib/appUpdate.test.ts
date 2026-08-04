import { describe, expect, it } from "vitest";
import { checkForAppUpdate, parseAppUpdateManifest } from "./appUpdate";

const validHash = "a".repeat(64);

describe("app update manifest", () => {
  it("accepts a HTTPS APK manifest with a sha256 hash", () => {
    expect(parseAppUpdateManifest({
      versionCode: 3,
      versionName: "0.3.0",
      apkUrl: "https://chat.secureinchat.com/downloads/app.apk",
      sha256: validHash.toUpperCase(),
      releaseNotes: ["更新连接体验"],
    })).toEqual(expect.objectContaining({
      versionCode: 3,
      versionName: "0.3.0",
      sha256: validHash,
      releaseNotes: ["更新连接体验"],
    }));
  });

  it("rejects non-HTTPS downloads and invalid hashes", () => {
    expect(() => parseAppUpdateManifest({
      versionCode: 3,
      versionName: "0.3.0",
      apkUrl: "http://chat.secureinchat.com/downloads/app.apk",
      sha256: validHash,
    })).toThrow("invalid_update_manifest");
    expect(() => parseAppUpdateManifest({
      versionCode: 3,
      versionName: "0.3.0",
      apkUrl: "https://chat.secureinchat.com/downloads/app.apk",
      sha256: "not-a-hash",
    })).toThrow("invalid_update_hash");
  });

  it("reports 404 as not published instead of pretending an update exists", async () => {
    const status = await checkForAppUpdate(
      async () => new Response("missing", { status: 404 }),
      2,
      "https://chat.secureinchat.com/app-update.json",
    );
    expect(status).toEqual({ state: "not_published", message: "暂未发布可用更新" });
  });

  it("returns update_available only when the server version is newer", async () => {
    const status = await checkForAppUpdate(
      async () => Response.json({
        versionCode: 4,
        versionName: "0.4.0",
        apkUrl: "https://chat.secureinchat.com/downloads/app.apk",
        sha256: validHash,
      }),
      2,
      "https://chat.secureinchat.com/app-update.json",
    );
    expect(status.state).toBe("update_available");
  });
});
