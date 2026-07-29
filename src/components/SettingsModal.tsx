import { useState } from "react";
import type { ConnStatus } from "../hooks/useChatEngine";
import type { AppProfile } from "../lib/appProfile";
import { AVATAR_OPTIONS, AvatarBadge, makePhotoAvatar } from "./AvatarBadge";

type View = "main" | "profile" | "notifications" | "privacy" | "media" | "storage" | "connection" | "about" | "admin";
export type AdminSettingsAction = "notice" | "members" | "invite" | "keys" | "maintenance";

const groups: Array<Array<{ id: View; icon: string; title: string; subtitle: string }>> = [
  [{ id: "profile", icon: "☺", title: "个人资料", subtitle: "头像、昵称" }, { id: "notifications", icon: "◉", title: "消息与来电通知", subtitle: "提示音、来电提醒" }],
  [{ id: "privacy", icon: "♢", title: "隐私与安全", subtitle: "安全码、已读状态、屏幕保护" }, { id: "media", icon: "▧", title: "聊天与媒体", subtitle: "文件、图片和视频设置" }, { id: "storage", icon: "□", title: "数据与存储", subtitle: "备份、恢复、存储空间" }],
  [{ id: "connection", icon: "⌁", title: "连接诊断", subtitle: "服务器状态与网络检查" }, { id: "about", icon: "i", title: "关于邀群密聊", subtitle: "版本、许可与安全说明" }],
];

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`settings-toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)}><i /></button>;
}

export function SettingsModal({ profile, status, adminAvailable, adminGroupName, onClose, onSaved, onProfileChange, onAdminAction }: {
  profile: AppProfile;
  status: ConnStatus;
  adminAvailable: boolean;
  adminGroupName?: string;
  onClose: () => void;
  onSaved: () => void;
  onProfileChange: (profile: Omit<AppProfile, "completedAt">) => void;
  onAdminAction: (action: AdminSettingsAction) => void;
}) {
  const [view, setView] = useState<View>("main");
  const [draft, setDraft] = useState<Omit<AppProfile, "completedAt">>({ ...profile });
  const [message, setMessage] = useState("");
  const [taps, setTaps] = useState(0);
  const [adminMode, setAdminMode] = useState(false);
  const titles: Record<Exclude<View, "main">, string> = { profile: "个人资料", notifications: "消息与来电通知", privacy: "隐私与安全", media: "聊天与媒体", storage: "数据与存储", connection: "连接诊断", about: "关于邀群密聊", admin: "管理员设置" };
  const save = () => { onProfileChange(draft); onSaved(); onClose(); };
  const tapVersion = () => {
    if (adminMode) return setView("admin");
    const next = taps + 1;
    if (next >= 7) { setTaps(0); setAdminMode(true); setMessage("管理员模式已开启"); setView("admin"); }
    else { setTaps(next); if (next >= 4) setMessage(`再点击 ${7 - next} 次开启管理员模式`); }
  };
  const runAdmin = (action: AdminSettingsAction) => {
    if (!adminAvailable) return setMessage("当前设备没有可管理的群组。");
    onAdminAction(action);
  };
  return <div className="settings-backdrop"><section className="settings-panel">
    <header className="settings-header"><button onClick={() => view === "main" ? onClose() : view === "admin" ? setView("about") : setView("main")}>‹</button><h1>{view === "main" ? "设置" : titles[view]}</h1><button className="done" onClick={save}>完成</button></header>
    <div className="settings-scroll">
      {view === "main" && <>
        <button className="settings-profile-card" onClick={() => setView("profile")}><AvatarBadge avatar={draft.avatar} /><span><b>{draft.displayName}</b><small>设备本地身份 · 点击编辑</small></span><strong>›</strong></button>
        {groups.map((group, index) => <div className="settings-group" key={index}>{group.map(item => <button className="settings-item" key={item.id} onClick={() => setView(item.id)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.subtitle}</small></span><strong>›</strong></button>)}</div>)}
        <p className="settings-version">邀群密聊 v0.2.0 · 端到端加密通信</p>
      </>}
      {view === "profile" && <div className="settings-card"><AvatarBadge avatar={draft.avatar} className="settings-avatar" /><h2>选择头像</h2><div className="settings-avatar-grid">{AVATAR_OPTIONS.map(item => <button className={draft.avatar === item ? "active" : ""} key={item} onClick={() => setDraft(v => ({ ...v, avatar: item }))}>{item}</button>)}<label>＋<input type="file" accept="image/*" onChange={e => { const f=e.target.files?.[0]; if(f) void makePhotoAvatar(f).then(avatar => setDraft(v => ({...v,avatar}))); }} /></label></div><label>昵称</label><input value={draft.displayName} maxLength={24} onChange={e => setDraft(v => ({...v,displayName:e.target.value}))} /><p>头像和昵称保存在本机。</p></div>}
      {view === "notifications" && <div className="settings-group detail"><div className="switch-row"><span><b>新消息通知</b><small>显示新消息提醒</small></span><Toggle value={draft.notifications} onChange={notifications => setDraft(v=>({...v,notifications}))}/></div><div className="switch-row"><span><b>语音与视频来电铃声</b><small>收到通话邀请时播放提示音</small></span><Toggle value={draft.callRingtone} onChange={callRingtone => setDraft(v=>({...v,callRingtone}))}/></div></div>}
      {view === "privacy" && <><div className="settings-group detail"><div className="switch-row"><span><b>显示已读状态</b><small>让群成员知道你已查看消息</small></span><Toggle value={draft.readReceipts} onChange={readReceipts => setDraft(v=>({...v,readReceipts}))}/></div><div className="static-row"><span><b>截屏与录屏保护</b><small>Android 端已强制开启</small></span><em>已开启</em></div><div className="static-row"><span><b>设备密钥</b><small>仅保存在当前设备</small></span><em>安全</em></div></div><div className="info-box">重要操作前请通过可信语音或线下方式核对安全码。</div></>}
      {view === "media" && <div className="settings-group detail"><div className="switch-row"><span><b>仅 Wi‑Fi 自动下载</b><small>图片和小文件</small></span><Toggle value={draft.autoDownloadWifi} onChange={autoDownloadWifi => setDraft(v=>({...v,autoDownloadWifi}))}/></div><div className="static-row"><span><b>单个文件上限</b><small>分块端到端加密传输</small></span><em>50 MB</em></div><div className="static-row"><span><b>通话网络</b><small>点对点或 TURN</small></span><em>自动</em></div></div>}
      {view === "storage" && <div className="settings-group detail"><div className="static-row"><span><b>加密备份</b><small>在“我的”页面导出或恢复</small></span><em>本机</em></div><div className="static-row"><span><b>文件临时保留</b><small>服务器仅保存加密分块</small></span><em>7 天</em></div></div>}
      {view === "connection" && <div className="settings-card connection"><span className={status === "online" ? "orb online" : "orb"}>⌁</span><h2>{status === "online" ? "安全服务器连接正常" : "当前未连接服务器"}</h2><p>wss://ws.secureinchat.com</p><button onClick={() => {onSaved();setMessage("已发起重新连接");}}>重新连接并检测</button></div>}
      {view === "about" && <><div className="settings-card about"><img src="/brand/wheat-app-icon.png" alt="" /><h2>邀群密聊</h2><button className="version-button" onClick={tapVersion}>版本 0.2.0</button></div><div className="settings-group">{[
        ["隐私政策", "♢", "不要求手机号或邮箱，服务器只处理密文和必要连接元数据。"],
        ["开源许可", "⌘", "项目源代码及第三方许可记录保存在官方 GitHub 仓库。"],
        ["安全说明", "▣", "群密钥仅保存在成员设备；重要操作前请核对群安全码。"],
        ["检查更新", "↻", "当前版本 0.2.0。"],
      ].map((item)=><button className="settings-item" key={item[0]} onClick={()=>setMessage(item[2])}><i>{item[1]}</i><span><b>{item[0]}</b></span><strong>›</strong></button>)}</div>{adminMode&&<button className="primary-button" onClick={()=>setView("admin")}>进入管理员设置</button>}</>}
      {view === "admin" && <><div className="admin-warning"><span>!</span><div><b>仅限授权管理员使用</b><small>{adminGroupName ? `当前管理：${adminGroupName}` : "服务器仍会验证管理员令牌"}</small></div></div><div className="settings-group admin-list">{[
        ["notice","◖","每日公告管理","编辑并发布今日公告"],["members","♙","群组与成员管理","查看成员、移除或禁言"],["invite","◇","邀请码管理","有效期、撤销与重新生成"],["keys","⌕","密钥管理","立即轮换群组密钥"],["maintenance","⌁","维护模式","暂停普通成员收发消息"]
      ].map(row=><button className="settings-item" key={row[0]} onClick={()=>runAdmin(row[0] as AdminSettingsAction)}><i>{row[1]}</i><span><b>{row[2]}</b><small>{row[3]}</small></span><strong>›</strong></button>)}<button className="settings-item" onClick={()=>setView("connection")}><i>◉</i><span><b>连接与服务器诊断</b><small>WebSocket、TURN 与延迟检测</small></span><strong>›</strong></button><button className="settings-item" onClick={()=>setMessage("暂无本机管理员操作记录。")}><i>▤</i><span><b>管理员操作记录</b><small>查看本机审计日志</small></span><strong>›</strong></button></div><button className="danger-button" onClick={()=>{setAdminMode(false);setTaps(0);setView("about");}}>退出管理员模式</button></>}
      {message && <button className="settings-message" onClick={()=>setMessage("")}>{message}</button>}
    </div>
  </section></div>;
}
