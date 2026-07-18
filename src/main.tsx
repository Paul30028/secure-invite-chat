import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { randomUUID } from "./lib/uuid";

// 旧版 Android System WebView 无 crypto.randomUUID，启动前打补丁
try {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (c && typeof c.randomUUID !== "function") {
    // @ts-expect-error polyfill
    c.randomUUID = randomUUID;
  }
} catch {
  /* ignore */
}

function showFatal(msg: string) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;font-size:14px;line-height:1.6;white-space:pre-wrap">
      <b>邀群密聊启动失败</b><br/><br/>${msg}<br/><br/>
      <span style="color:#8b949e;font-size:12px">请把以上文字截图反馈</span>
    </div>`;
  }
  console.error(msg);
}

window.addEventListener("unhandledrejection", (e) => {
  console.error("unhandledrejection", e.reason);
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root 节点不存在");

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  showFatal(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack || ""}` : String(e));
}
