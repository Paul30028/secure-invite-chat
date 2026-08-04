export function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section className="w-full max-w-md rounded-2xl border border-[#dfe5d9] bg-[#fffef9] p-5 text-[#29362b] shadow-xl" aria-label="隐私与通知说明">
        <h2 className="text-lg font-semibold">隐私与通知</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="font-medium">连接</h3>
            <p className="mt-1 text-[#71806f]">应用会自动连接团队安全服务器；连接失败时可在状态页重新连接。普通用户无需填写地址或端口。</p>
          </div>
          <div className="border-t border-[#e6eadf] pt-4">
            <h3 className="font-medium">隐私</h3>
            <p className="mt-1 text-[#71806f]">联系人备注、分组、黑名单与会话偏好只保存在本机加密存储中。</p>
          </div>
          <div className="border-t border-[#e6eadf] pt-4">
            <h3 className="font-medium">通知</h3>
            <p className="mt-1 text-[#71806f]">通知偏好和安全码提醒在“我的”中管理。</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" className="rounded-xl bg-[#3d6b4f] px-4 py-2 text-white" onClick={onClose}>知道了</button>
        </div>
      </section>
    </div>
  );
}
