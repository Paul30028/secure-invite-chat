import type { GroupMember } from "../lib/types";

export function CallPeerPicker({
  mode,
  peers,
  onSelect,
  onClose,
}: {
  mode: "audio" | "video";
  peers: GroupMember[];
  onSelect: (peer: GroupMember) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <section className="w-full rounded-t-2xl bg-[#f7f7f7] p-4 pb-6 sm:max-w-sm sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#191919]">选择{mode === "video" ? "视频" : "语音"}通话对象</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-xl text-[#666] active:bg-[#e8e8e8]" aria-label="关闭">×</button>
        </div>
        <div className="overflow-hidden rounded-xl bg-white">
          {peers.map((peer) => (
            <button key={peer.deviceId} type="button" onClick={() => onSelect(peer)} className="flex w-full items-center gap-3 border-b border-[#f0f0f0] px-3 py-3 text-left last:border-0 active:bg-[#f5f5f5]">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[#8aa1b5] text-base font-medium text-white">{peer.displayName.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[#191919]">{peer.displayName}</span>
                <span className="mt-0.5 block text-[11px] text-[#3d6b4f]">在线</span>
              </span>
              <span className="text-lg text-[#999]">›</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
