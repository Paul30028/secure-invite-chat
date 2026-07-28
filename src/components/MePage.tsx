import { useState } from "react";
import { decryptBackupPayload, encryptBackupPayload, type PrivateData } from "../lib/privateStore";

export function MePage({
  deviceId,
  data,
  onRestore,
  onSettings,
  onOpenAbout,
}: {
  deviceId: string;
  data: PrivateData;
  onRestore: (data: PrivateData) => void;
  onSettings: () => void;
  onOpenAbout: () => void;
}) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const download = async () => {
    if (!password) return setMessage("请先设置备份口令");
    const blob = new Blob([await encryptBackupPayload(data, password)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sic-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage("已导出加密备份");
  };

  const restore = async (file: File | null) => {
    if (!file || !password) return setMessage("请选择文件并输入备份口令");
    try {
      onRestore(await decryptBackupPayload(await file.text(), password));
      setMessage("恢复完成");
    } catch {
      setMessage("无法恢复：口令或备份文件不正确");
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#f3efe6] p-4">
      <h1 className="text-lg font-semibold mb-3">我的</h1>

      <section className="bg-white rounded-xl p-4 text-sm space-y-2">
        <p>
          设备：<span className="font-mono text-xs">{deviceId}</span>
        </p>
        <button className="text-[#3d6b4f]" onClick={onSettings}>
          隐私与通知
        </button>
      </section>

      <section className="bg-white rounded-xl p-4 mt-3 text-sm leading-relaxed">
        <h2 className="font-medium mb-2">安全说明</h2>
        <p>
          服务器只转发密文，不保存群密钥。群成员被移出或退出后，群密钥会自动更新。请在线下核对安全码；本应用不承诺"无法破解"。
        </p>
      </section>

      <section className="bg-white rounded-xl p-4 mt-3">
        <h2 className="text-sm font-medium mb-2">数据与存储</h2>
        <input
          className="w-full border rounded px-2 py-2 text-sm"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="备份口令"
        />
        <div className="flex gap-3 mt-2">
          <button className="text-sm text-[#3d6b4f]" onClick={() => void download()}>
            导出备份
          </button>
          <label className="text-sm text-[#3d6b4f] cursor-pointer">
            恢复备份
            <input
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(e) => void restore(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        {message && <p className="text-xs text-[#8a8a8a] mt-2">{message}</p>}
      </section>

      <section className="bg-white rounded-xl mt-3">
        <button
          type="button"
          onClick={onOpenAbout}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-left"
        >
          <span>关于邀群密聊</span>
          <span className="text-[#c9ccd2]">{">"}</span>
        </button>
      </section>
    </main>
  );
}
