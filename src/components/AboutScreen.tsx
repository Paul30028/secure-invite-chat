import { useRef, useState } from "react";
import { APP_NAME } from "../config/appConfig";

const APP_VERSION = "0.2.0";
const TAP_THRESHOLD = 7;
const TAP_WINDOW_MS = 3000;

export function AboutScreen({
  onBack,
  onOpenAdminSettings,
  hasAdminGroups,
}: {
  onBack: () => void;
  onOpenAdminSettings: () => void;
  hasAdminGroups: boolean;
}) {
  const [tapCount, setTapCount] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const firstTapAt = useRef<number | null>(null);

  const handleVersionTap = () => {
    const now = Date.now();
    if (firstTapAt.current === null || now - firstTapAt.current > TAP_WINDOW_MS) {
      firstTapAt.current = now;
      setTapCount(1);
      return;
    }
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= TAP_THRESHOLD) {
      setUnlocked(true);
      firstTapAt.current = null;
      setTapCount(0);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#f3efe6]">
      <header className="h-14 flex items-center px-2 border-b border-black/5 bg-white">
        <button type="button" className="px-2 py-1 text-[#3d6b4f]" onClick={onBack}>
          {"‹"}
        </button>
        <h1 className="text-base font-semibold mx-auto pr-8">关于邀群密聊</h1>
      </header>

      <div className="flex flex-col items-center pt-8 pb-4">
        <img src="/icon-192.png" alt={APP_NAME} className="w-20 h-20 rounded-2xl shadow-sm" />
        <h2 className="text-lg font-semibold mt-3">{APP_NAME}</h2>
        <button
          type="button"
          onClick={handleVersionTap}
          className="text-sm text-[#8a8a8a] mt-1 select-none"
        >
          版本 {APP_VERSION}
        </button>
      </div>

      <section className="bg-white mt-3 divide-y divide-black/5">
        <AboutRow icon="!" label="隐私政策" />
        <AboutRow icon="</>" label="开源许可" />
        <AboutRow icon="🔒" label="安全说明" />
        <AboutRow icon="↻" label="检查更新" />
      </section>

      {unlocked && hasAdminGroups && (
        <section className="mt-3 px-4">
          <button
            type="button"
            onClick={onOpenAdminSettings}
            className="w-full bg-[#3d6b4f] text-white rounded-xl py-3 text-sm font-medium"
          >
            管理员模式已开启 · 进入管理员设置
          </button>
        </section>
      )}

      {unlocked && !hasAdminGroups && (
        <p className="text-center text-xs text-[#8a8a8a] mt-4 px-6">
          管理员模式已解锁，但当前设备不是任何群的管理员。
        </p>
      )}
    </main>
  );
}

function AboutRow({ icon, label }: { icon: string; label: string }) {
  return (
    <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm">
      <span className="w-5 text-center text-[#3d6b4f]">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-[#c9ccd2]">{">"}</span>
    </button>
  );
}
