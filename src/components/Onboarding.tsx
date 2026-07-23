import { useMemo, useState } from "react";
import type { ConnStatus } from "../hooks/useChatEngine";
import { APP_NAME } from "../config/appConfig";
import {
  classifyWsUrl,
  getPhoneWsHints,
  getWsUrl,
  isNativeApp,
  setLocalMode,
  setWsUrl,
} from "../lib/settings";

/**
 * 先跑通：同一 Wi‑Fi 直连。公网/流量最后再做。
 */
export function Onboarding({
  status,
  phoneHints = [],
  onConnectedSetup,
  onOpenSettings,
  onCreate,
  onJoin,
  onOpenDemo,
}: {
  status: ConnStatus;
  phoneHints?: string[];
  onConnectedSetup: () => void;
  onOpenSettings: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onOpenDemo: () => void;
}) {
  const [url, setUrl] = useState(getWsUrl());
  const ready = status === "online" || status === "local";
  const needServer = status !== "online" && status !== "local";
  const info = useMemo(() => classifyWsUrl(url), [url]);
  const hints = phoneHints.length ? phoneHints : getPhoneWsHints();
  const isPhone = isNativeApp();

  const connect = (u: string) => {
    setLocalMode(false);
    setWsUrl(u);
    setUrl(u);
    onConnectedSetup();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] overflow-y-auto">
      <div className="px-5 pt-10 pb-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl mb-4">
          💬
        </div>
        <h1 className="text-xl font-bold text-white mb-1">{APP_NAME}</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          先跑通：手机与电脑<strong className="text-slate-200">同一 Wi‑Fi</strong>
          ，填地址即可聊天。
          <br />
          <span className="text-slate-600">公网/流量以后再说</span>
        </p>
      </div>

      <div
        className={`mx-4 mb-4 rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
          ready
            ? "bg-emerald-950/50 border border-emerald-800 text-emerald-300"
            : status === "connecting"
              ? "bg-amber-950/40 border border-amber-800 text-amber-200"
              : "bg-red-950/40 border border-red-900 text-red-200"
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            ready
              ? "bg-emerald-400"
              : status === "connecting"
                ? "bg-amber-400 animate-pulse"
                : "bg-red-400"
          }`}
        />
        {status === "online"
          ? "已连接 · 可以创建群或加入"
          : status === "connecting"
            ? "正在连接… 请保持 Wi‑Fi 打开"
            : status === "local"
              ? "单机模式 · 请改连服务器才能手机互通"
              : "未连接 · 按下面步骤填写"}
      </div>


      <div className="mx-4 mb-4">
        <button
          type="button"
          onClick={onOpenDemo}
          className="w-full rounded-2xl bg-[#07c160] px-5 py-4 text-left text-white shadow-sm hover:bg-[#06ad58]"
        >
          <span className="block text-base font-semibold">直接体验聊天界面</span>
          <span className="mt-1 block text-[12px] text-white/80">无需服务器；仅在本机显示示例消息</span>
        </button>
      </div>

      {/* 三步跑通 */}
      <div className="mx-4 mb-4 rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-[12px] text-slate-400 leading-relaxed space-y-2">
        <p className="text-slate-200 font-semibold text-sm">三步跑通</p>
        <p>
          <b className="text-slate-300">1.</b> 电脑运行{" "}
          <code className="text-indigo-300">python server/server.py</code>
        </p>
        <p>
          <b className="text-slate-300">2.</b> 电脑打开本网页，应自动连上；看是否出现
          「手机请填…」地址
        </p>
        <p>
          <b className="text-slate-300">3.</b> 手机连<strong className="text-slate-300">同一 Wi‑Fi</strong>
          ，填 <code className="text-indigo-300">ws://电脑IP:8765</code> 后点连接
        </p>
      </div>

      {/* 桌面：显示给手机的地址 */}
      {!isPhone && status === "online" && hints.length > 0 && (
        <div className="mx-4 mb-4 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
          <p className="text-xs font-semibold text-emerald-300 mb-2">手机请填这个地址</p>
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              className="w-full text-left font-mono text-sm text-emerald-100 bg-[#0d1117] border border-emerald-900/40 rounded-lg px-3 py-2.5 mb-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(h);
                } catch {
                  /* ignore */
                }
              }}
            >
              {h}
              <span className="block text-[10px] text-slate-500 mt-0.5">点击复制，发到手机</span>
            </button>
          ))}
        </div>
      )}

      {needServer && (
        <div className="mx-4 mb-4 rounded-xl border border-[#30363d] bg-[#161b22] p-4">
          <p className="text-xs text-slate-400 mb-2">
            {isPhone ? "填写电脑的局域网地址（同一 Wi‑Fi）" : "服务器地址"}
          </p>
          {isPhone && hints.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {hints.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="text-left text-[12px] font-mono px-3 py-2 rounded-lg bg-indigo-950/40 border border-indigo-800 text-indigo-200"
                  onClick={() => connect(h)}
                >
                  一键连接 {h}
                </button>
              ))}
            </div>
          )}
          <input
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 text-sm font-mono mb-2 outline-none focus:border-indigo-500"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ws://192.168.x.x:8765"
          />
          <p className="text-[10px] text-slate-500 mb-3">{info.hint}</p>
          <button
            type="button"
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
            onClick={() => connect(url)}
          >
            连接
          </button>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="flex-1 py-2 text-[11px] rounded-lg bg-[#21262d] text-slate-400"
              onClick={() => setUrl("ws://192.168.1.")}
            >
              192.168.1. 模板
            </button>
            <button
              type="button"
              className="flex-1 py-2 text-[11px] rounded-lg bg-[#21262d] text-slate-400"
              onClick={onOpenSettings}
            >
              设置
            </button>
          </div>
        </div>
      )}

      <div className="mx-4 mb-4 flex flex-col gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={onCreate}
          className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-left px-5"
        >
          <span className="block text-base font-semibold">创建群 · 发邀请码</span>
          <span className="block text-[12px] text-indigo-100/80 mt-1">管理端</span>
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={onJoin}
          className="w-full py-4 rounded-2xl bg-[#21262d] border border-[#30363d] disabled:opacity-40 text-white text-left px-5"
        >
          <span className="block text-base font-semibold">输入邀请码 · 加入</span>
          <span className="block text-[12px] text-slate-400 mt-1">成员端</span>
        </button>
      </div>

      {ready && (
        <div className="mx-4 mb-8 text-center">
          <button type="button" className="text-[11px] text-slate-500 underline" onClick={onOpenSettings}>
            改服务器地址
          </button>
        </div>
      )}
    </div>
  );
}
