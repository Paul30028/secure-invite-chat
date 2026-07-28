import { useState } from "react";
import type { ConnStatus } from "../hooks/useChatEngine";
import type { AppProfile } from "../lib/appProfile";
import { AVATAR_OPTIONS, AvatarBadge, makePhotoAvatar } from "./AvatarBadge";

export function SplashScreen() {
  return <main className="launch-screen splash-screen">
    <img className="splash-icon" src="/brand/wheat-app-icon.png" alt="邀群密聊" />
    <h1>邀群密聊</h1>
    <blockquote>“看哪，弟兄和睦同居，是何等地善，何等地美！”</blockquote>
    <cite>诗篇 133:1</cite>
  </main>;
}

export function NoticeEntrance({ notice, status, onEnter }: {
  notice: string;
  status: ConnStatus;
  onEnter: () => void;
}) {
  return <main className="launch-screen notice-screen">
    <header><img src="/brand/wheat-app-icon.png" alt="" /><span><b>邀群密聊</b><small>端到端加密通信</small></span></header>
    <section className="notice-card">
      <span>每日公告</span>
      <h1>今天，愿我们彼此相顾</h1>
      <p>{notice || "暂无公告。请妥善保管邀请码，并通过可信渠道核对群安全码。"}</p>
      <small>{status === "online" ? "● 安全服务器已连接" : "○ 正在连接安全服务器"}</small>
    </section>
    <button onClick={onEnter}>进入邀群密聊 →</button>
  </main>;
}

export function FirstUserSetup({ onComplete }: {
  onComplete: (profile: Omit<AppProfile, "completedAt">) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("🌾");
  const [notifications, setNotifications] = useState(true);
  const [error, setError] = useState("");
  return <main className="launch-screen setup-screen">
    <header><img src="/brand/wheat-app-icon.png" alt="" /><span><b>首次使用</b><small>无需手机号和邮箱</small></span></header>
    <h1>设置你的个人信息</h1>
    <p>选择头像和昵称，稍后仍可在设置中修改。</p>
    <section className="setup-card">
      <AvatarBadge avatar={avatar} className="setup-avatar" />
      <label>选择头像</label>
      <div className="avatar-options">
        {AVATAR_OPTIONS.map((item) => <button className={item === avatar ? "active" : ""} key={item} onClick={() => setAvatar(item)}>{item}</button>)}
        <label className="photo-avatar">＋<input type="file" accept="image/*" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void makePhotoAvatar(file).then(setAvatar).catch(() => setError("头像处理失败"));
        }} /></label>
      </div>
      <label>群聊昵称</label>
      <input value={displayName} maxLength={24} placeholder="请输入昵称" onChange={(e) => setDisplayName(e.target.value)} />
      <div className="setup-switch"><span><b>消息通知</b><small>新消息和来电提醒</small></span><button className={notifications ? "on" : ""} onClick={() => setNotifications(!notifications)}><i /></button></div>
      <div className="setup-privacy">✓ 头像和设备密钥仅保存在本机。</div>
      {error && <small className="setup-error">{error}</small>}
    </section>
    <button disabled={!displayName.trim()} onClick={() => onComplete({
      displayName: displayName.trim(), avatar, notifications, callRingtone: true,
      readReceipts: true, autoDownloadWifi: false,
    })}>完成设置 →</button>
  </main>;
}
