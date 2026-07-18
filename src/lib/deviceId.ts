/**
 * deviceId.ts
 * 没有账号系统，多设备/断线重连靠"设备ID"识别（不是身份认证，只是连接标识）。
 * 首次运行生成一次，之后一直复用。
 */
import { randomUUID } from "./uuid";

const DEVICE_ID_KEY = "sic_device_id";

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
