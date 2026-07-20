const MATRIX_HOMESERVER_KEY = "sic_matrix_homeserver_url";

export const DEFAULT_MATRIX_HOMESERVER_URL = "http://127.0.0.1:8008";

export type MatrixProbeResult = {
  homeserverUrl: string;
  endpoint: string;
  versions: string[];
  unstableFeatures: number;
  latencyMs: number;
};

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Matrix Client-Server API uses an HTTP(S) homeserver URL.
 * Production should use HTTPS; HTTP remains available for local demo servers.
 */
export function normalizeMatrixHomeserverUrl(raw: string): string {
  let candidate = raw.trim();
  if (!candidate) throw new Error("请填写 Matrix 家服务器地址");

  if (!/^https?:\/\//i.test(candidate)) {
    const local =
      /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(candidate);
    candidate = `${local ? "http" : "https"}://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Matrix 地址格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Matrix 地址必须使用 http:// 或 https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Matrix 地址不能包含用户名或密码");
  }

  parsed.hash = "";
  parsed.search = "";
  const normalized = parsed.toString().replace(/\/+$/, "");
  if (!normalized) throw new Error("Matrix 地址格式无效");
  return normalized;
}

export function getMatrixHomeserverUrl(): string {
  return browserStorage()?.getItem(MATRIX_HOMESERVER_KEY) || DEFAULT_MATRIX_HOMESERVER_URL;
}

export function setMatrixHomeserverUrl(raw: string): string {
  const normalized = normalizeMatrixHomeserverUrl(raw);
  browserStorage()?.setItem(MATRIX_HOMESERVER_KEY, normalized);
  return normalized;
}

/**
 * Calls the standard Matrix versions endpoint. This verifies reachability and
 * Client-Server API compatibility without sending credentials or chat data.
 */
export async function probeMatrixHomeserver(
  rawUrl: string,
  timeoutMs = 8_000
): Promise<MatrixProbeResult> {
  const homeserverUrl = normalizeMatrixHomeserverUrl(rawUrl);
  const endpoint = `${homeserverUrl}/_matrix/client/versions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Matrix 服务器返回 HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      versions?: unknown;
      unstable_features?: unknown;
    };
    if (
      !Array.isArray(payload.versions) ||
      !payload.versions.every((version) => typeof version === "string")
    ) {
      throw new Error("服务器响应不是有效的 Matrix Client-Server API");
    }

    const unstableFeatures =
      payload.unstable_features &&
      typeof payload.unstable_features === "object" &&
      !Array.isArray(payload.unstable_features)
        ? Object.keys(payload.unstable_features).length
        : 0;

    return {
      homeserverUrl,
      endpoint,
      versions: payload.versions,
      unstableFeatures,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("连接 Matrix 服务器超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
