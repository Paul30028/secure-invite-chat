import type { ConnStatus } from "../hooks/useChatEngine";
import { getWsUrl } from "../lib/settings";

export function ConnectionDiagnosticsScreen({ status, onBack, onReconnect }: { status: ConnStatus; onBack: () => void; onReconnect: () => void }) {
  const networkAvailable = typeof navigator === "undefined" ? false : navigator.onLine;
  const websocketConnected = status === "online" || status === "local";
  const secureTransport = getWsUrl().startsWith("wss://");
  const report = () => {
    const payload = { created_at: new Date().toISOString(), network_available: networkAvailable, websocket_connected: websocketConnected, secure_transport: secureTransport, connection_state: status };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "sic-diagnostics.json"; a.click(); URL.revokeObjectURL(url);
  };
  const rows = [["网络可用", networkAvailable], ["WebSocket 已连接", websocketConnected], ["安全连接已建立", secureTransport]];
  return <main className="fixed inset-0 z-[76] flex flex-col bg-[#fbfaf4] text-[#29362b]"><header className="h-14 px-5 flex items-center"><button type="button" className="text-2xl text-[#506551]" onClick={onBack} aria-label="返回">‹</button><h1 className="ml-3 text-base font-semibold">连接诊断</h1></header><div className="flex-1 overflow-y-auto px-5 pt-8"><div className="text-center"><div className={`mx-auto grid h-16 w-16 place-items-center rounded-full border text-3xl ${websocketConnected ? "border-[#8eb88d] bg-[#edf5eb] text-[#3d6b4f]" : "border-[#d9c49a] bg-[#fff8e8] text-[#806322]"}`}>{websocketConnected ? "✓" : "!"}</div><h2 className="mt-3 text-lg font-semibold">{websocketConnected ? "连接正常" : "连接需要恢复"}</h2><p className="mt-1 text-xs text-[#71806f]">仅显示脱敏状态，不包含服务器或聊天数据。</p></div><section className="mt-7 overflow-hidden rounded-2xl border border-[#dfe5d9] bg-white divide-y divide-[#edf0e9]">{rows.map(([label, ok]) => <div key={label as string} className="flex items-center justify-between px-4 py-4"><span className="text-sm">{label}</span><span className={`text-xs font-medium ${ok ? "text-[#3d6b4f]" : "text-[#a33c3c]"}`}>{ok ? "正常" : "不可用"}</span></div>)}</section><button type="button" className="mt-5 w-full rounded-xl bg-[#557c5b] py-3 text-sm font-medium text-white" onClick={onReconnect}>重新连接</button><button type="button" className="mt-3 w-full rounded-xl border border-[#9bad99] py-3 text-sm text-[#4d7452]" onClick={report}>导出脱敏诊断报告</button></div></main>;
}
