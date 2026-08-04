import type { ConnStatus } from "../hooks/useChatEngine";

/** Deliberately simple: the team either reconnects or can copy useful diagnostics. */
export function ConnectionStatusScreen({ status, onReconnect, onBack, onOpenDiagnostics }: { status: ConnStatus; onReconnect: () => void; onBack: () => void; onOpenDiagnostics: () => void }) {
  const connecting = status === "connecting";
  return <div className="fixed inset-0 z-[75] bg-[#fbfaf4] text-[#2c382d] flex flex-col">
    <header className="h-14 px-5 flex items-center"><button type="button" className="text-2xl text-[#506551]" onClick={onBack} aria-label="返回">‹</button></header>
    <main className="flex-1 flex flex-col items-center justify-center px-8 pb-20 text-center"><div className="w-40 h-40 rounded-full bg-[#edf1e8] border border-[#dce4d6] grid place-items-center text-6xl text-[#788d76]">!</div><h1 className="mt-9 text-[28px] font-semibold">{connecting ? "正在连接" : "暂时无法连接"}</h1><p className="mt-3 text-sm leading-relaxed text-[#849083]">消息将保留，连接恢复后会自动重试。</p><button type="button" className="w-full max-w-xs mt-9 rounded-xl bg-[#557c5b] text-white py-4 font-medium" onClick={onReconnect}>{connecting ? "继续等待" : "⟳ 重新连接"}</button><button type="button" className="w-full max-w-xs mt-3 rounded-xl border border-[#9bad99] text-[#547558] py-3.5 text-sm" onClick={onOpenDiagnostics}>查看诊断</button><button type="button" className="w-full max-w-xs mt-3 text-[#71806f] py-2 text-sm" onClick={onBack}>返回离线消息</button></main>
  </div>;
}
