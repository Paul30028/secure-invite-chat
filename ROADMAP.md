# 邀群密聊 · 分阶段路线图

## 核心约束

- 仅邀请码入群，无好友/搜索/全局联系人  
- E2EE：服务器只见密文  
- 连接地址可配置（直连 → 未来中继只换 URL）

---

## Phase CN-Direct · 中国区直连（当前主线）

- [x] 技术栈：React/TS + Tauri + Capacitor；Python WebSocket + SQLite  
- [x] 配置中心 `src/config/appConfig.ts` + `.env.example`  
- [x] 线协议约定 `src/lib/protocol.ts`（带 `v`，便于中继扩展）  
- [x] 后端 `server/config.py`（SIC_HOST/PORT）  
- [x] 邀请制建群/入群、文字/链接/文件 E2EE  
- [x] 设备签名信封、安全码、邀请码/二维码  
- [x] UI 收敛为「直连」主路径（WSS 向导降为可选高级）  
- [x] 群成员列表（在线状态）/ 管理端踢人  
- [x] 真机直连验收清单 `docs/DEVICE_TEST_CHECKLIST.md`  
- [x] 群密钥 CSPRNG 强化（每群随机）  
- [x] 群内昵称唯一  
- [x] 网络恢复 / 开流量后自动重连  
- [ ] 消息送达状态（可选）  
- [ ] 中国区公网 IP 部署一页纸

## 已完成（历史）

- Phase 1–2：UI 演示 + 真实中继密文存储  
- Phase 3–4：移动端 APK、邀请串 SIC1、文件加密、本地调试  

## Phase Relay · 可配置中继（以后）

- [ ] 默认推荐 `wss://` 部署模板（Caddy/Nginx）  
- [ ] 设置页「中继模式」文案与健康检查  
- [ ] 邀请码默认内嵌中继 URL  

## Phase Crypto+ · 更深安全（以后）

- [ ] 群密钥轮换 / 踢人失效  
- [ ] 前向保密（Double Ratchet 级）  
- [ ] 元数据最小化增强  

---

## 安全摘要

| 项目 | 状态 |
|------|------|
| 服务器读明文 | 否 |
| 群密钥 | groupSecret + groupId → PBKDF2 → AES-GCM |
| 入群凭证 | invite_code（可轮换） |
| 前向保密 | 无 |
| 账号 | 无；设备 ID + 邀请制 |
