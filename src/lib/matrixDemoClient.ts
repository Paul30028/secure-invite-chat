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
        content?: { msgtype?: unknown; body?: unknown };
      };
      if (
        event.type !== "m.room.message" ||
        event.content?.msgtype !== "m.text" ||
        typeof event.event_id !== "string" ||
        typeof event.sender !== "string" ||
        typeof event.content.body !== "string"
      ) {
        continue;
      }
      messages.push({
        eventId: event.event_id,
        roomId,
        sender: event.sender,
        body: event.content.body,
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
