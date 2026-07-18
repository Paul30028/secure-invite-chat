import { useMemo, useState } from "react";
import {
  classifyWsUrl,
  getDefaultWsUrl,
  getPhoneWsHints,
  getWsUrl,
  isLocalMode,
  setLocalMode,
  setWsUrl,
} from "../lib/settings";

export function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(getWsUrl());
  const [localOn, setLocalOn] = useState(() => isLocalMode());
  const info = useMemo(() => classifyWsUrl(url), [url]);
  const hints = getPhoneWsHints();

  const save = () => {
    setLocalMode(localOn);
    if (!localOn) setWsUrl(url);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 sm:p-6 w-full max-w-[400px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">连接服务器</h2>
        <p className="text-xs text-slate-500 mb-4">
          现阶段：手机与电脑<strong className="text-slate-300">同一 Wi‑Fi</strong> 即可。
          公网以后再配置。
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
            {hints.map((h) => (
              <button
                key={h}
                type="button"
                className="block w-full text-left font-mono text-[11px] text-indigo-300 py-1"
                onClick={() => {
                  setLocalOn(false);
                  setUrl(h);
                }}
              >
                {h}
              </button>
            ))}
          </div>
        )}

        <label className="text-xs text-slate-400 mb-1 block">地址</label>
        <input
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 mb-1 text-sm font-mono outline-none focus:border-indigo-500"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="ws://192.168.x.x:8765"
          disabled={localOn}
        />
        <p className="text-[11px] text-slate-500 mb-4">{info.hint}</p>

        <label className="flex items-center justify-between gap-3 text-xs text-slate-400 mb-5">
          <span>单机调试（不要开，否则手机连不上群）</span>
          <button
            type="button"
            role="switch"
            aria-checked={localOn}
            onClick={() => setLocalOn((v) => !v)}
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
            保存并连接
          </button>
        </div>
      </div>
    </div>
  );
}
