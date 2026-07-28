import { useState } from "react";
import { getWsUrl, isLocalMode } from "../lib/settings";
import type { ConnStatus } from "../hooks/useChatEngine";

export type TestPhase = "A" | "B";

/**
 * 双端联调向导：先 桌面↔手机，再 手机↔手机
 */
export function MultiDeviceGuide({
  status,
  localMode,
  onClose,
  onOpenSettings,
  onEnableRelay,
  onCreate,
  onJoin,
}: {
  status: ConnStatus;
  localMode: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  /** 关闭本地模式并准备连中继 */
  onEnableRelay: () => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const [phase, setPhase] = useState<TestPhase>("A");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const ws = getWsUrl();
  const relayOk = !localMode && status === "online";

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  const Check = ({ id, children }: { id: string; children: import("react").ReactNode }) => (
    <label className="flex gap-2 items-start text-[12px] text-[#1f2329] leading-relaxed cursor-pointer py-1">
      <input
        type="checkbox"
        className="mt-0.5 accent-[#3d6b4f] shrink-0"
        checked={!!checked[id]}
        onChange={() => toggle(id)}
      />
      <span>{children}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-3 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-black/5 px-4 py-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">双端联调向导</h2>
            <p className="text-[11px] text-[#8a8a8a] mt-0.5">
              顺序：① 桌面 ↔ 手机 → ② 手机 ↔ 手机
            </p>
          </div>
          <button type="button" className="text-[#8a8a8a] hover:text-[#1f2329] px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 状态 */}
          <div
            className={`rounded-lg px-3 py-2.5 text-[12px] border ${
              relayOk
                ? "bg-[#eaf1ec] border-[#c3d6c8] text-[#2f5c40]"
                : localMode || isLocalMode()
                  ? "bg-amber-950/40 border-amber-800 text-amber-100"
                  : "bg-red-950/40 border-red-900 text-red-100"
            }`}
          >
            {relayOk ? (
              <>中继已连接 · {ws}</>
            ) : localMode ? (
              <>
                当前是<strong> 本地调试</strong>，两台设备无法互聊。请先切换到中继模式。
              </>
            ) : (
              <>中继未连接 · 请确认电脑已跑 server，地址正确</>
            )}
          </div>

          {!relayOk && (
            <button
              type="button"
              className="w-full py-3 rounded-xl bg-[#3d6b4f] text-white text-sm font-medium"
              onClick={onEnableRelay}
            >
              关闭本地调试 · 连接中继
            </button>
          )}

          {/* 阶段切换 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPhase("A")}
              className={`py-2.5 rounded-lg text-xs font-medium border ${
                phase === "A"
                  ? "bg-[#3d6b4f] border-[#3d6b4f] text-white"
                  : "bg-white border-black/10 text-[#8a8a8a]"
              }`}
            >
              ① 桌面 ↔ 手机
            </button>
            <button
              type="button"
              onClick={() => setPhase("B")}
              className={`py-2.5 rounded-lg text-xs font-medium border ${
                phase === "B"
                  ? "bg-[#3d6b4f] border-[#3d6b4f] text-white"
                  : "bg-white border-black/10 text-[#8a8a8a]"
              }`}
            >
              ② 手机 ↔ 手机
            </button>
          </div>

          {phase === "A" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-black/10 bg-[#f9f7f2] p-3">
                <p className="text-xs font-semibold text-[#2f5c40] mb-2">阶段 A · 桌面管理 + 手机成员</p>
                <p className="text-[11px] text-[#8a8a8a] mb-3 leading-relaxed">
                  电脑同时跑<strong className="text-[#3d6b4f]">中继</strong>和<strong className="text-[#3d6b4f]">桌面客户端</strong>；
                  手机装 APK，同一 Wi‑Fi。
                </p>

                <p className="text-[11px] text-[#6b7280] font-medium mb-1">电脑上</p>
                <Check id="a1">
                  终端启动中继：
                  <code className="text-[#2f5c40] ml-1">cd server → python server.py</code>
                </Check>
                <Check id="a2">
                  再开客户端：
                  <code className="text-[#2f5c40] ml-1">npm run dev</code>
                  （浏览器打开提示地址）
                </Check>
                <Check id="a3">
                  桌面设置：关闭「本地调试」；WS 用
                  <code className="text-[#2f5c40] mx-1">ws://127.0.0.1:8765</code>
                </Check>
                <Check id="a4">
                  桌面顶栏显示「中继在线」后，点「创建群」
                </Check>
                <Check id="a5">
                  弹出管理端 →「复制邀请串」或「系统分享」
                </Check>
                <Check id="a6">
                  用 <code className="text-[#2f5c40]">ipconfig</code> 记下电脑局域网 IP
                  （如 192.168.1.8）
                </Check>

                <p className="text-[11px] text-[#6b7280] font-medium mt-3 mb-1">手机上</p>
                <Check id="a7">
                  设置：关闭本地调试；WS 填
                  <code className="text-[#2f5c40] ml-1">ws://电脑IP:8765</code>
                  （不要用 127.0.0.1）
                </Check>
                <Check id="a8">顶栏变绿「中继在线」后 →「加入群」粘贴完整 SIC1 邀请串</Check>
                <Check id="a9">双方互发：文字、链接、图片、文件</Check>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs rounded-lg bg-[#3d6b4f] text-white"
                  onClick={() => {
                    onClose();
                    onCreate();
                  }}
                >
                  本机创建群（桌面当管理）
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs rounded-lg bg-[#f3efe6] text-[#1f2329]"
                  onClick={() => {
                    onClose();
                    onJoin();
                  }}
                >
                  本机加入群（手机）
                </button>
              </div>
            </div>
          )}

          {phase === "B" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-black/10 bg-[#f9f7f2] p-3">
                <p className="text-xs font-semibold text-sky-300 mb-2">阶段 B · 手机 ↔ 手机</p>
                <p className="text-[11px] text-[#8a8a8a] mb-3 leading-relaxed">
                  电脑<strong className="text-[#3d6b4f]">只跑中继</strong>
                  （可关掉浏览器客户端）。两台手机都连同一台电脑的 IP。
                </p>

                <p className="text-[11px] text-[#6b7280] font-medium mb-1">电脑上（只当服务器）</p>
                <Check id="b1">
                  保持
                  <code className="text-[#2f5c40] mx-1">python server/server.py</code>
                  运行；防火墙放行 8765
                </Check>
                <Check id="b2">两台手机与电脑同一 Wi‑Fi（或都用可访问的公网 wss）</Check>

                <p className="text-[11px] text-[#6b7280] font-medium mt-3 mb-1">手机 A（管理端）</p>
                <Check id="b3">
                  设置：关闭本地调试；WS =
                  <code className="text-[#2f5c40] ml-1">ws://电脑IP:8765</code>
                </Check>
                <Check id="b4">「创建群」→ 管理端复制 / 分享邀请串</Check>

                <p className="text-[11px] text-[#6b7280] font-medium mt-3 mb-1">手机 B（成员）</p>
                <Check id="b5">同样 WS 地址，确认中继在线</Check>
                <Check id="b6">「加入群」粘贴 A 的完整邀请串</Check>
                <Check id="b7">A↔B 互发文字、链接、图片、文件；核对安全码一致</Check>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs rounded-lg bg-[#3d6b4f] text-white"
                  onClick={() => {
                    onClose();
                    onCreate();
                  }}
                >
                  本机创建群（手机 A）
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs rounded-lg bg-[#f3efe6] text-[#1f2329]"
                  onClick={() => {
                    onClose();
                    onJoin();
                  }}
                >
                  本机加入群（手机 B）
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-black/10 p-3 text-[11px] text-[#8a8a8a] space-y-1.5 leading-relaxed">
            <p className="text-[#1f2329] font-medium">联调注意</p>
            <p>· 多设备互聊必须<strong className="text-[#3d6b4f]">关闭本地调试</strong></p>
            <p>· 邀请串必须整段复制（SIC1. 开头），不能只拷一半</p>
            <p>· 手机永远不要填 127.0.0.1（那是手机自己）</p>
            <p>· 建议先做完阶段 A，再做阶段 B</p>
            <button type="button" className="text-[#3d6b4f] underline pt-1" onClick={onOpenSettings}>
              打开连接设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
