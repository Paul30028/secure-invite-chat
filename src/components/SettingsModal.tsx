import { useMemo, useState } from "react";
import {
  getMatrixHomeserverUrl,
  normalizeMatrixHomeserverUrl,
  probeMatrixHomeserver,
  setMatrixHomeserverUrl,
  type MatrixProbeResult,
} from "../lib/matrixConfig";
import {
  classifyWsUrl,
  getDefaultWsUrl,
  getPhoneWsHints,
  getWsUrl,
  isLocalMode,
  setLocalMode,
  setWsUrl,
} from "../lib/settings";

type MatrixProbeState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; result: MatrixProbeResult }
  | { status: "error"; message: string };

export function SettingsModal({
  onClose,
  onSaved,
  onOpenMatrixDemo,
  onOpenPublicNotices,
}: {
  onClose: () => void;
  onSaved: () => void;
  onOpenMatrixDemo: () => void;
  onOpenPublicNotices: () => void;
}) {
  const [url, setUrl] = useState(getWsUrl());
  const [localOn, setLocalOn] = useState(() => isLocalMode());
  const [matrixUrl, setMatrixUrl] = useState(getMatrixHomeserverUrl());
  const [matrixProbe, setMatrixProbe] = useState<MatrixProbeState>({ status: "idle" });
  const [wsError, setWsError] = useState("");
  const info = useMemo(() => classifyWsUrl(url), [url]);
  const matrixInfo = useMemo(() => {
    try {
      const normalized = normalizeMatrixHomeserverUrl(matrixUrl);
      return {
        valid: true as const,
        normalized,
        hint: normalized.startsWith("https://")
          ? "HTTPS 家服务器地址，可用于正式联网测试"
          : "HTTP 仅建议本机或可信局域网 Demo 使用",
      };
    } catch (error) {
      return {
        valid: false as const,
        normalized: "",
        hint: error instanceof Error ? error.message : "Matrix 地址无效",
      };
    }
  }, [matrixUrl]);
  const hints = getPhoneWsHints();

  const save = () => {
    if (!localOn && !info.ready) {
      setWsError(info.hint);
      return;
    }
    setWsError("");
    setLocalMode(localOn);
    if (!localOn) setWsUrl(info.normalized);
    if (matrixInfo.valid) setMatrixHomeserverUrl(matrixInfo.normalized);
    onSaved();
    onClose();
  };

  const testMatrix = async () => {
    if (!matrixInfo.valid) return;
    setMatrixProbe({ status: "testing" });
    try {
      const result = await probeMatrixHomeserver(matrixInfo.normalized);
      setMatrixHomeserverUrl(result.homeserverUrl);
      setMatrixUrl(result.homeserverUrl);
      setMatrixProbe({ status: "success", result });
    } catch (error) {
      setMatrixProbe({
        status: "error",
        message: error instanceof Error ? error.message : "无法连接 Matrix 服务器",
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 sm:p-6 w-full max-w-[440px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">连接与功能设置</h2>
        <p className="text-xs text-slate-500 mb-4">
          先保留现有聊天 Demo，同时验证 Matrix 家服务器，为下一步迁移房间与消息同步做准备。
        </p>

        <button
          type="button"
          className="mb-4 w-full rounded-xl border border-amber-700/60 bg-amber-950/20 px-4 py-3 text-left"
          onClick={onOpenPublicNotices}
        >
          <span className="block text-sm font-semibold text-amber-100">📢 公开公告</span>
          <span className="mt-1 block text-[11px] text-amber-200/70">每日圣经灵修、赞美诗歌、每日金句</span>
        </button>

        <section className="rounded-xl border border-indigo-800/60 bg-indigo-950/20 p-4 mb-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-indigo-100">Matrix 接入测试</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                只访问标准 versions 接口，不发送账号、密钥或聊天内容。
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200">
              迁移阶段
            </span>
          </div>

          <label className="text-xs text-slate-400 mb-1 block">Matrix 家服务器</label>
          <input
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 mb-1 text-sm font-mono outline-none focus:border-indigo-500"
            value={matrixUrl}
            onChange={(event) => {
              setMatrixUrl(event.target.value);
              setMatrixProbe({ status: "idle" });
            }}
            placeholder="https://matrix.example.com"
          />
          <p className={`text-[11px] mb-3 ${matrixInfo.valid ? "text-slate-500" : "text-red-300"}`}>
            {matrixInfo.hint}
          </p>

          <button
            type="button"
            disabled={!matrixInfo.valid || matrixProbe.status === "testing"}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            onClick={() => void testMatrix()}
          >
            {matrixProbe.status === "testing" ? "正在检测…" : "测试 Matrix 服务器"}
          </button>

          {matrixProbe.status === "success" && (
            <div className="mt-3 rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2.5 text-[11px] text-emerald-200">
              <p className="font-semibold">连接成功 · {matrixProbe.result.latencyMs} ms</p>
              <p className="mt-1 text-emerald-300/80">
                支持 {matrixProbe.result.versions.length} 个 API 版本
                {matrixProbe.result.versions.length > 0
                  ? `（最新报告：${matrixProbe.result.versions[matrixProbe.result.versions.length - 1]}）`
                  : ""}
              </p>
            </div>
          )}
          {matrixProbe.status === "error" && (
            <div className="mt-3 rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2.5 text-[11px] text-red-200">
              {matrixProbe.message}
            </div>
          )}

          <button
            type="button"
            disabled={!matrixInfo.valid}
            className="mt-3 w-full rounded-lg border border-indigo-600/70 bg-transparent px-3 py-2 text-xs text-indigo-200 disabled:opacity-40"
            onClick={onOpenMatrixDemo}
          >
            打开 Matrix 房间与消息 Demo
          </button>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
            此 Demo 支持登录、房间、同步和文字消息；端到端加密将在安全阶段接入。
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">聊天中继服务器</h3>
          <p className="text-xs text-slate-500 mb-4">
            输入服务器地址会自动退出单机演示；保存后立即尝试连接。
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-[#21262d] text-slate-300"
              onClick={() => {
                setLocalOn(false);
                setUrl("ws://127.0.0.1:8765");
              }}
            >
              电脑本机
            </button>
            <button
              type="button"
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-[#21262d] text-slate-300"
              onClick={() => {
                setLocalOn(false);
                setUrl("ws://192.168.1.");
              }}
            >
              手机模板
            </button>
            <button
              type="button"
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-[#21262d] text-slate-300"
              onClick={() => {
                setLocalOn(false);
                setUrl(getDefaultWsUrl());
              }}
            >
              默认
            </button>
          </div>

          {hints.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-500 mb-1">检测到的手机地址（点选用）</p>
              {hints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  className="block w-full text-left font-mono text-[11px] text-indigo-300 py-1"
                  onClick={() => {
                    setLocalOn(false);
                    setUrl(hint);
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          )}

          <label className="text-xs text-slate-400 mb-1 block">WebSocket 地址</label>
          <input
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 mb-1 text-sm font-mono outline-none focus:border-indigo-500"
            value={url}
            onFocus={() => setLocalOn(false)}
            onChange={(event) => {
              setLocalOn(false);
              setWsError("");
              setUrl(event.target.value);
            }}
            placeholder="ws://212.135.212.22:8765"
          />
          <p className={`text-[11px] mb-4 ${wsError ? "text-red-300" : "text-slate-500"}`}>{wsError || info.hint}</p>

          <label className="flex items-center justify-between gap-3 text-xs text-slate-400 mb-5">
            <span>单机调试（仅在本设备演示）</span>
            <button
              type="button"
              role="switch"
              aria-checked={localOn}
              onClick={() => {
              setWsError("");
              setLocalOn((value) => !value);
            }}
              className={`shrink-0 w-11 h-6 rounded-full relative ${
                localOn ? "bg-amber-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  localOn ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </section>

        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2.5 mb-5 text-[10px] leading-relaxed text-amber-200/80">
          安全状态：这是功能原型，尚未达到 Signal 级保护。不要用于高风险通信，也不要在此处保存 Matrix 密码或访问令牌。
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg text-slate-300"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white"
            onClick={save}
          >
            {localOn ? "保存单机设置" : "保存并连接"}
          </button>
        </div>
      </div>
    </div>
  );
}
