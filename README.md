# 邀群密聊 · Secure Invite Chat

邀请制、端到端加密的私密群聊。  
**当前主线：中国区直连后端**（Client ↔ `ws://服务器:8765`）。  
公网 TLS 中继为后续阶段；地址已做成可配置，换 `wss://` 即可接中继。

详见 **`docs/ARCHITECTURE.md`**、**`docs/SECURITY_ARCHITECTURE_V2.md`** 与 **`docs/SECURE_STORAGE_MIGRATION.md`**。

## 怎么用

1. **管理端**（电脑或手机）：创建群 → 得到邀请码 → 分享  
2. **成员**：输入邀请码 → 进入该码对应加密群  

无手机号注册：本地设备 ID + 邀请制。

| 角色 | 说明 |
|------|------|
| 后端 | `python server/server.py`，只存/转密文 |
| 管理端 | 谁创建群谁是管理端，可发邀请码 |
| 成员 | 粘贴 `SIC1.…` 加入 |

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面 | Tauri 2 + React 19 + TypeScript + Vite |
| 中继 | Python websockets + SQLite（仅密文） |
| 移动 | 同一 Web UI + Capacitor（Android / iOS） |
| 加密 | Web Crypto：AES-256-GCM + PBKDF2 |

## 怎么用（核心就两步）

1. **管理端**（电脑或手机）：创建群 → 得到**邀请码** → 复制/分享  
2. **其他人**：打开 App → **输入邀请码** → 进入**该码对应的群**

### 同一 Wi‑Fi

- 电脑：`python server/server.py`，客户端 `ws://127.0.0.1:8765`  
- 手机：`ws://电脑局域网IP:8765`

### 手机流量（4G/5G，不同网）

必须公网 **`wss://`** 中继（见 **`docs/DEPLOY_WSS.md`**）。

最快试用（电脑已跑 server）：

```bat
scripts\start-public-tunnel.bat
```

把打印的 `https://xxx.trycloudflare.com` 改成 `wss://xxx.trycloudflare.com`，  
填到 App **「邀请用公网地址」**，再发邀请码。  
邀请码会带 `|wss://…`，对方**用流量粘贴即可自动连接入群**。

## 推荐：电脑管理台 + 手机成员（同一 Wi‑Fi）

### 1. 电脑启动中继

```bash
cd server
pip install -r requirements.txt
python server.py
```

默认监听 `0.0.0.0:8765`。用 `ipconfig` 查看电脑局域网 IP（如 `192.168.1.8`）。

### 2. 电脑打开客户端（管理台）

```bash
cd ..
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:1420`（桌面壳：`npm run tauri dev`）。

1. 点 **「创建群（管理）」** → 填群名与昵称  
2. 成功后弹出 **管理端** → **复制邀请串** 或 **系统分享 / 二维码**  
3. 在群里可发：文字、**链接卡片**、**图片/文件**（桌面可拖文件进窗口）

### 3. 手机 APK 加入

1. 设置 → WebSocket 填 `ws://192.168.1.8:8765`（改成你的电脑 IP）→ 保存并重连  
2. **「加入群」** → 粘贴完整 `SIC1.…` 邀请串  
3. 与电脑互发消息 / 文件 / 链接  

防火墙放行 **8765**（开发时还有 **1420**）。

### 4. 也可以手机当管理端

手机连上中继后点「创建群」即可；再把邀请串分享给电脑加入。  
两端能力相同，只是**谁先创建**谁管邀请码。

## 邀请串格式（重要）

```
SIC1.<服务器入群码>.<群密钥材料>
```

- 前半：服务器校验能否进群，管理员可「轮换」  
- 后半：客户端派生 AES 密钥，**轮换入群码不会更换**  
- 必须整段分享，否则新成员解不开消息  

## 安全模型与局限

- ✅ 服务器只存 `ciphertext` + `iv`，不能解密  
- ✅ 无全局用户目录，仅邀请入群  
- ⚠️ 群共享密钥：密钥泄露则历史密文可解（无前向保密）；成员移除尚未触发群密钥轮换  
- ⚠️ 迁移分支已加入设备签名与可选的挑战认证，但旧群兼容期不能视为强制身份认证  
- ⚠️ 当前客户端仍使用 localStorage 保存敏感材料；正式移动/桌面版必须完成安全存储迁移  
- ⚠️ 文件经 WebSocket 传输，单文件建议 ≤4MB  

详见 `ROADMAP.md`、`docs/SECURITY_ARCHITECTURE_V2.md` 与 `docs/SECURE_STORAGE_MIGRATION.md`。

## 移动端 Android APK

**一键（推荐）**：

```bat
scripts\build-android-apk.bat
```

产物：`android\app\build\outputs\apk\debug\app-debug.apk`

详细步骤、流量/Wi‑Fi 连接、防截屏：见 **`docs/ANDROID_APK.md`**  
公网手机流量：见 **`docs/DEPLOY_WSS.md`**  
与 Signal 安全对照：见 **`docs/SECURITY_SIGNAL_LIKE.md`**

### 手机连网两种模式

| 模式 | 适用 | 设置示例 |
|------|------|----------|
| Wi‑Fi 局域网 | 办公室/家里同一路由 | `ws://192.168.1.8:8765` |
| 手机流量 | 外出、4G/5G | `wss://chat.你的域名.com`（需 VPS） |

App → **设置** → 保存并重连。

### iOS

需 macOS + Xcode：`npx cap add ios` 后 `cap open ios`。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Web 开发 |
| `npm run build` | 类型检查 + 构建 |
| `npm run tauri` | Tauri CLI |
| `python server/server.py` | 中继 |

## 目录

```
src/           React 客户端
src/lib/       crypto / invite / wsClient / settings
server/        Python 中继 + SQLite
src-tauri/     Windows 桌面壳
```

## 版本

- Phase 1–2：演示 + 真实中继  
- **Phase 3（当前）**：密钥与邀请码分离、加密文件、WS 设置、移动布局  
