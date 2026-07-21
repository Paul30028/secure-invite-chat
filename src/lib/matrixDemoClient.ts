import { normalizeMatrixHomeserverUrl } from "./matrixConfig";

export type MatrixDemoSession = {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  nextBatch?: string;
};

export type MatrixDemoMessage = {
  eventId: string;
  roomId: string;
  sender: string;
  body: string;
  timestamp: number;
  kind: "text" | "file";
  mediaUrl?: string;
  mimetype?: string;
  size?: number;
};

export type MatrixDemoRoom = {
  roomId: string;
  name: string;
  messages: MatrixDemoMessage[];
};

type MatrixErrorPayload = {
  errcode?: string;
  error?: string;
};

async function matrixRequest<T>(
  homeserverUrl: string,
  path: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${normalizeMatrixHomeserverUrl(homeserverUrl)}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: MatrixErrorPayload = {};
    try {
      payload = (await response.json()) as MatrixErrorPayload;
    } catch {
      // Keep the HTTP fallback below.
    }
    const detail = payload.error || payload.errcode || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export async function loginMatrixDemo(
  homeserverUrl: string,
  username: string,
  password: string
): Promise<MatrixDemoSession> {
  if (!username.trim() || !password) throw new Error("请输入 Matrix 用户名和密码");

  const result = await matrixRequest<{
    access_token: string;
    user_id: string;
    device_id: string;
  }>(homeserverUrl, "/_matrix/client/v3/login", {
    method: "POST",
    body: JSON.stringify({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: username.trim() },
      password,
      initial_device_display_name: "Secure Invite Chat 功能 Demo",
    }),
  });

  if (!result.access_token || !result.user_id || !result.device_id) {
    throw new Error("Matrix 登录响应缺少会话信息");
  }

  return {
    homeserverUrl: normalizeMatrixHomeserverUrl(homeserverUrl),
    accessToken: result.access_token,
    userId: result.user_id,
    deviceId: result.device_id,
  };
}

function roomName(roomId: string, stateEvents: unknown): string {
  if (!Array.isArray(stateEvents)) return roomId;
  for (const rawEvent of stateEvents) {
    const event = rawEvent as { type?: unknown; content?: { name?: unknown } };
    if (event?.type === "m.room.name" && typeof event.content?.name === "string") {
      return event.content.name;
    }
  }
  return roomId;
}

export async function syncMatrixDemo(
  session: MatrixDemoSession
): Promise<{ rooms: MatrixDemoRoom[]; nextBatch: string }> {
  const query = new URLSearchParams({ timeout: "0" });
  if (session.nextBatch) query.set("since", session.nextBatch);

  const payload = await matrixRequest<{
    next_batch?: string;
    rooms?: {
      join?: Record<
        string,
        {
          state?: { events?: unknown[] };
          timeline?: { events?: unknown[] };
        }
      >;
    };
  }>(
    session.homeserverUrl,
    `/_matrix/client/v3/sync?${query.toString()}`,
    {},
    session.accessToken
  );

  if (!payload.next_batch) throw new Error("Matrix 同步响应缺少 next_batch");

  const rooms = Object.entries(payload.rooms?.join || {}).map(([roomId, room]) => {
    const events = Array.isArray(room.timeline?.events) ? room.timeline.events : [];
    const messages: MatrixDemoMessage[] = [];

    for (const rawEvent of events) {
      const event = rawEvent as {
        event_id?: unknown;
        sender?: unknown;
        origin_server_ts?: unknown;
        type?: unknown;
        content?: {
          msgtype?: unknown;
          body?: unknown;
          url?: unknown;
          info?: { mimetype?: unknown; size?: unknown };
        };
      };
      const isText = event.content?.msgtype === "m.text";
      const isFile =
        event.content?.msgtype === "m.file" ||
        event.content?.msgtype === "m.image" ||
        event.content?.msgtype === "m.video" ||
        event.content?.msgtype === "m.audio";
      if (
        event.type !== "m.room.message" ||
        (!isText && !isFile) ||
        typeof event.event_id !== "string" ||
        typeof event.sender !== "string" ||
        typeof event.content?.body !== "string"
      ) {
        continue;
      }
      messages.push({
        eventId: event.event_id,
        roomId,
        sender: event.sender,
        body: event.content.body,
        kind: isFile ? "file" : "text",
        mediaUrl:
          isFile && typeof event.content.url === "string"
            ? matrixMediaDownloadUrl(session.homeserverUrl, event.content.url)
            : undefined,
        mimetype:
          typeof event.content.info?.mimetype === "string"
            ? event.content.info.mimetype
            : undefined,
        size: typeof event.content.info?.size === "number" ? event.content.info.size : undefined,
        timestamp:
          typeof event.origin_server_ts === "number" ? event.origin_server_ts : Date.now(),
      });
    }

    return {
      roomId,
      name: roomName(roomId, room.state?.events),
      messages,
    };
  });

  return { rooms, nextBatch: payload.next_batch };
}

export async function createMatrixDemoRoom(
  session: MatrixDemoSession,
  name: string
): Promise<string> {
  if (!name.trim()) throw new Error("请输入房间名称");
  const result = await matrixRequest<{ room_id?: string }>(
    session.homeserverUrl,
    "/_matrix/client/v3/createRoom",
    {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        preset: "private_chat",
        visibility: "private",
      }),
    },
    session.accessToken
  );
  if (!result.room_id) throw new Error("Matrix 建房响应缺少 room_id");
  return result.room_id;
}

export const MAX_MATRIX_DEMO_FILE_BYTES = 10 * 1024 * 1024;

function matrixMediaDownloadUrl(homeserverUrl: string, mxcUrl: string): string | undefined {
  if (!mxcUrl.startsWith("mxc://")) return undefined;
  const mediaId = mxcUrl.slice("mxc://".length).split("/");
  if (mediaId.length !== 2 || !mediaId[0] || !mediaId[1]) return undefined;
  return `${normalizeMatrixHomeserverUrl(homeserverUrl)}/_matrix/media/v3/download/${encodeURIComponent(
    mediaId[0]
  )}/${encodeURIComponent(mediaId[1])}`;
}

async function uploadMatrixDemoFile(session: MatrixDemoSession, file: File): Promise<string> {
  if (file.size > MAX_MATRIX_DEMO_FILE_BYTES) {
    throw new Error("文件不能超过 10 MB");
  }
  const query = new URLSearchParams({ filename: file.name });
  const response = await fetch(
    `${normalizeMatrixHomeserverUrl(session.homeserverUrl)}/_matrix/media/v3/upload?${query.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error(`文件上传失败（HTTP ${response.status}）`);
  const payload = (await response.json()) as { content_uri?: unknown };
  if (typeof payload.content_uri !== "string" || !payload.content_uri.startsWith("mxc://")) {
    throw new Error("Matrix 上传响应无效");
  }
  return payload.content_uri;
}

export async function sendMatrixDemoText(
  session: MatrixDemoSession,
  roomId: string,
  body: string
): Promise<void> {
  if (!roomId) throw new Error("请先选择房间");
  if (!body.trim()) throw new Error("消息不能为空");
  const transactionId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;

  await matrixRequest(
    session.homeserverUrl,
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(
      transactionId
    )}`,
    {
      method: "PUT",
      body: JSON.stringify({ msgtype: "m.text", body: body.trim() }),
    },
    session.accessToken
  );
}


export async function sendMatrixDemoFile(
  session: MatrixDemoSession,
  roomId: string,
  file: File
): Promise<void> {
  if (!roomId) throw new Error("请先选择房间");
  if (!file.name || file.size <= 0) throw new Error("请选择有效文件");
  const mxcUrl = await uploadMatrixDemoFile(session, file);
  const transactionId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
  await matrixRequest(
    session.homeserverUrl,
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(
      transactionId
    )}`,
    {
      method: "PUT",
      body: JSON.stringify({
        msgtype: file.type.startsWith("image/") ? "m.image" : "m.file",
        body: file.name,
        url: mxcUrl,
        info: { mimetype: file.type || "application/octet-stream", size: file.size },
      }),
    },
    session.accessToken
  );
}
