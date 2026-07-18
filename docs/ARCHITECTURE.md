# 邀群密聊 · 架构说明（中国区直连阶段）

## 阶段目标

| 现在 | 以后 |
|------|------|
| Client **直连** Python WebSocket 后端 | 可选 TLS 中继 / 反代（`wss://`） |
| 地址：环境变量 / 设置页 / 邀请码内嵌 | 只换 URL，业务协议与 E2EE 不变 |
| 邀请制群、AES-GCM 群密钥 | 可升级 Double Ratchet 等 |

## 拓扑（当前）

```
┌─────────────┐         WebSocket          ┌──────────────────┐
│ 桌面/手机 App │  ◄── ws://host:8765 ──►  │  server.py       │
│ React + TS  │     JSON + 密文帧          │  SQLite 只存密文  │
└─────────────┘                            └──────────────────┘
        │
        └── 本地：groupSecret → PBKDF2 → AES-GCM
            信封 envelope v1 + 设备 ECDSA（可选校验）
```

## 未来中继（设计预留，未实现）

```
App ──wss://relay.example.com──► TLS 终止/转发 ──► server.py:8765
```

- 客户端：`getWsUrl()` / `VITE_WS_URL` 改为 `wss://…` 即可  
- 线协议：`src/lib/protocol.ts` 的 `v` 字段便于多版本  
- 邀请码：`SIC1.code.secret|wss://…` 可选内嵌地址  

## 关键模块

```
src/
  config/appConfig.ts   # 默认地址、功能开关、协议版本号
  lib/
    protocol.ts         # 线协议约定
    settings.ts         # 运行时 URL（localStorage）
    wsClient.ts         # 传输
    crypto.ts           # AES-GCM / PBKDF2
    envelope.ts         # 密文业务信封
    invite.ts           # SIC1 邀请串
    deviceIdentity.ts   # 设备密钥 TOFU
  hooks/useChatEngine.ts
  components/…          # UI
server/
  config.py             # SIC_HOST / SIC_PORT
  server.py / db.py
```

## 安全模型（务实版）

| 项 | 状态 |
|----|------|
| 服务器读明文 | 否 |
| 群密钥 | 邀请串中的 `groupSecret` + `groupId` → PBKDF2 → AES-GCM |
| 入群 | 服务器 `invite_code`（可轮换，不换密钥） |
| 发送者身份 | 信封内 ECDSA + TOFU 安全码；非完整 Signal |
| 前向保密 | **无**（后续 Phase） |
| 账号体系 | **无**手机号；设备 ID + 邀请制 |

## 身份与「登录」

无传统注册登录。等价模型：

1. 首次启动生成本地 `deviceId` + 设备密钥对  
2. 创建群 → 成为管理端，持有 `admin_token`  
3. 他人持邀请串加入 → 服务器登记成员，客户端用 `groupSecret` 解密  

## 配置优先级

1. 设置页 / 邀请码内嵌 → localStorage  
2. `VITE_WS_URL`（构建时）  
3. `appConfig.DEFAULT_WS_URL`  

后端：`SIC_HOST` / `SIC_PORT` / `SIC_PUBLIC_URL`（日志）。
