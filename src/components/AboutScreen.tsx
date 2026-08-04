import { useRef, useState } from "react";
import { APP_NAME, APP_UPDATE_MANIFEST_URL, APP_VERSION_CODE, APP_VERSION_NAME } from "../config/appConfig";
import { checkForAppUpdate, type AppUpdateStatus } from "../lib/appUpdate";

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
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
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

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try {
      setUpdateStatus(await checkForAppUpdate());
    } catch {
      setUpdateStatus({ state: "not_published", message: "更新信息格式不正确" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#fbfaf4] text-[#29362b]">
      <header className="h-14 flex items-center px-2 border-b border-[#e4eadf] bg-[#fffef9]">
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
          版本 {APP_VERSION_NAME}（{APP_VERSION_CODE}）
        </button>
      </div>

      <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#dfe5d9] bg-white divide-y divide-[#edf0e9] shadow-sm">
        <AboutRow icon="!" label="隐私说明" detail="联系人、会话偏好与备份只保存在本机加密存储。" />
        <AboutRow icon="</>" label="开源信息" detail="此版本未提供应用内许可证浏览；请以项目仓库文件为准。" />
        <AboutRow icon="🔒" label="安全说明" detail="服务器只保留有限期限内的密文，不保存明文或群密钥；成员变动时管理员会轮换群密钥。" />
      </section>

      <section className="mx-4 mt-3 rounded-2xl border border-[#dfe5d9] bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="w-5 text-center text-[#3d6b4f]">↻</span>
          <div className="flex-1">
            <h2 className="text-sm font-medium">在线更新</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#849083]">
              检查 {APP_UPDATE_MANIFEST_URL}；只有发布了带 SHA-256 校验值的 HTTPS 安装包时才显示下载。
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={checkingUpdate}
          onClick={() => void checkUpdate()}
          className="mt-4 w-full rounded-xl bg-[#3d6b4f] py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {checkingUpdate ? "正在检查…" : "检查更新"}
        </button>
        {updateStatus?.state === "not_published" && (
          <p className="mt-3 rounded-xl border border-[#e8dcc8] bg-[#fff8ec] px-3 py-2 text-xs text-[#836536]">
            {updateStatus.message}
          </p>
        )}
        {updateStatus?.state === "up_to_date" && (
          <p className="mt-3 rounded-xl border border-[#dfe5d9] bg-[#f5faf1] px-3 py-2 text-xs text-[#3d6b4f]">
            当前已是最新版本。
          </p>
        )}
        {updateStatus?.state === "update_available" && (
          <div className="mt-3 rounded-xl border border-[#dfe5d9] bg-[#f5faf1] p-3 text-xs text-[#415044]">
            <p className="font-medium">发现新版本 {updateStatus.manifest.versionName}</p>
            {updateStatus.manifest.releaseNotes?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {updateStatus.manifest.releaseNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            ) : null}
            <p className="mt-2 break-all text-[#6f7c70]">SHA-256：{updateStatus.manifest.sha256}</p>
            <a
              href={updateStatus.manifest.apkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block rounded-xl bg-[#3d6b4f] py-3 text-center text-sm font-medium text-white"
            >
              下载更新包
            </a>
          </div>
        )}
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

function AboutRow({ icon, label, detail }: { icon: string; label: string; detail: string }) {
  return (
    <div className="w-full flex items-start gap-3 px-4 py-3.5 text-left">
      <span className="w-5 text-center text-[#3d6b4f]">{icon}</span>
      <span className="flex-1"><b className="block text-sm font-medium">{label}</b><small className="mt-0.5 block text-xs leading-relaxed text-[#849083]">{detail}</small></span>
    </div>
  );
}
