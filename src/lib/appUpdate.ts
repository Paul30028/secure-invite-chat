export const APP_VERSION = "0.1.1";

export type AppUpdate = {
  version: string;
  releaseNotes: string;
  apkUrl: string;
  publishedAt?: string;
};

type UpdateManifest = {
  version?: unknown;
  apk_url?: unknown;
  release_notes?: unknown;
  published_at?: unknown;
};

const UPDATE_URL = "https://secureinchat.com/app-update.json";

function versionParts(value: string): number[] | null {
  if (!/^\d+(\.\d+){1,3}$/.test(value)) return null;
  return value.split(".").map((part) => Number(part));
}

function isNewer(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const now = versionParts(current);
  if (!next || !now) return false;
  const count = Math.max(next.length, now.length);
  for (let index = 0; index < count; index += 1) {
    const a = next[index] || 0;
    const b = now[index] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Android 的普通安装包不能静默覆盖安装；此函数只做安全的版本检测，
 * 有新版本时由系统安装界面让用户确认安装。
 */
export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  try {
    const response = await fetch(UPDATE_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const raw = (await response.json()) as UpdateManifest;
    if (
      typeof raw.version !== "string" ||
      typeof raw.apk_url !== "string" ||
      !raw.apk_url.startsWith("https://") ||
      !isNewer(raw.version, APP_VERSION)
    ) {
      return null;
    }
    return {
      version: raw.version,
      apkUrl: raw.apk_url,
      releaseNotes: typeof raw.release_notes === "string" ? raw.release_notes : "包含功能改进与问题修复。",
      publishedAt: typeof raw.published_at === "string" ? raw.published_at : undefined,
    };
  } catch {
    return null;
  }
}
