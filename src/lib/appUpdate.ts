import { APP_UPDATE_MANIFEST_URL, APP_VERSION_CODE } from "../config/appConfig";

export type AppUpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  sha256: string;
  releaseNotes?: string[];
  required?: boolean;
  minSupportedVersionCode?: number;
  publishedAt?: string;
};

export type AppUpdateStatus =
  | { state: "not_published"; message: string }
  | { state: "up_to_date"; currentVersionCode: number; latestVersionCode: number }
  | { state: "update_available"; manifest: AppUpdateManifest };

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseHttpsUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseAppUpdateManifest(value: unknown): AppUpdateManifest {
  if (!isRecord(value)) throw new Error("invalid_update_manifest");
  const rawVersionCode = value.versionCode;
  const versionName = asString(value.versionName);
  const apkUrl = parseHttpsUrl(value.apkUrl);
  const sha256 = asString(value.sha256);
  if (
    typeof rawVersionCode !== "number"
    || !Number.isInteger(rawVersionCode)
    || rawVersionCode <= 0
    || !versionName
    || !apkUrl
    || !sha256
  ) {
    throw new Error("invalid_update_manifest");
  }
  if (!SHA256_HEX.test(sha256)) throw new Error("invalid_update_hash");
  const versionCode = rawVersionCode;
  const rawMinSupportedVersionCode = value.minSupportedVersionCode;
  const notes = Array.isArray(value.releaseNotes)
    ? value.releaseNotes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  return {
    versionCode,
    versionName,
    apkUrl,
    sha256: sha256.toLowerCase(),
    releaseNotes: notes?.length ? notes : undefined,
    required: value.required === true,
    minSupportedVersionCode: typeof rawMinSupportedVersionCode === "number"
      && Number.isInteger(rawMinSupportedVersionCode)
      ? rawMinSupportedVersionCode
      : undefined,
    publishedAt: asString(value.publishedAt) || undefined,
  };
}

export async function checkForAppUpdate(
  fetcher: typeof fetch = fetch,
  currentVersionCode = APP_VERSION_CODE,
  manifestUrl = APP_UPDATE_MANIFEST_URL,
): Promise<AppUpdateStatus> {
  let response: Response;
  try {
    response = await fetcher(manifestUrl, { cache: "no-store" });
  } catch {
    return { state: "not_published", message: "暂未连接到更新服务" };
  }
  if (response.status === 404) {
    return { state: "not_published", message: "暂未发布可用更新" };
  }
  if (!response.ok) {
    return { state: "not_published", message: `更新服务暂不可用（${response.status}）` };
  }
  const manifest = parseAppUpdateManifest(await response.json());
  if (manifest.versionCode <= currentVersionCode) {
    return {
      state: "up_to_date",
      currentVersionCode,
      latestVersionCode: manifest.versionCode,
    };
  }
  return { state: "update_available", manifest };
}
