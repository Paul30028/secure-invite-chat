import type { AppUpdate } from "../lib/appUpdate";

export function AppUpdatePrompt({
  update,
  onClose,
}: {
  update: AppUpdate;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/45 p-4 sm:items-center sm:justify-center">
      <section className="w-full max-w-sm rounded-2xl bg-white p-5 text-[#1f2329] shadow-2xl">
        <p className="text-xs font-semibold text-[#07c160]">发现新版本</p>
        <h2 className="mt-1 text-xl font-bold">邀群密聊 {update.version}</h2>
        <p className="mt-3 text-sm leading-6 text-[#545860]">{update.releaseNotes}</p>
        <p className="mt-3 text-xs leading-5 text-[#8a8f98]">
          下载后由 Android 系统确认安装。为保护设备安全，普通 APK 不会静默自动安装。
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-xl border border-[#dfe3e8] py-3 text-sm text-[#545860]"
            onClick={onClose}
          >
            稍后再说
          </button>
          <a
            className="flex-1 rounded-xl bg-[#07c160] py-3 text-center text-sm font-semibold text-white"
            href={update.apkUrl}
            target="_blank"
            rel="noreferrer"
          >
            下载更新
          </a>
        </div>
      </section>
    </div>
  );
}
