import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WS_URL } from "../config/appConfig";
import { SicWsClient } from "./wsClient";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = 3;
  }

  closeFromServer() {
    this.readyState = 3;
    this.onclose?.();
  }

  send() {}
}

describe("SicWsClient reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      Capacitor: { isNativePlatform: () => false },
    });
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps retrying the secure primary endpoint after a disconnect", async () => {
    const client = new SicWsClient();
    const firstConnect = client.connect();
    const first = FakeWebSocket.instances[0]!;

    expect(first.url).toBe(DEFAULT_WS_URL);
    first.open();
    await firstConnect;

    first.closeFromServer();
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]!.url).toBe(DEFAULT_WS_URL);
  });
});
