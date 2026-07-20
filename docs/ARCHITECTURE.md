# 邀群密聊 · 系统架构总览

> 本文是总入口。当前仓库仍是可运行原型；目标架构中的 MLS、安全存储、透明性目录、分块文件和媒体帧 E2EE 尚未全部实现。不得把“目标”描述为当前能力。

## 当前与目标

| 维度 | 当前原型 | 正式目标 |
| --- | --- | --- |
| 客户端密钥 | WebView localStorage 中的迁移期材料 | Android Keystore、iOS Keychain、桌面安全存储 |
| 消息协议 | 共享 AES-GCM 群密钥 + 签名信封 | MLS 私密会话与可验证成员变更 |
| 身份 | deviceId、迁移期 ECDSA、可选挑战认证 | 无手机号 root identity、设备 credential、透明性目录 |
| 中继 | Python WebSocket + SQLite 密文存储 | 认证投递服务、分片、分页、背压与端点目录 |
| 文件 | 小文件内嵌在 WebSocket 密文 | 独立 fileKey、分块加密、短期能力 URL |
| 公告 | 未实现 | 独立发布者签名、客户端验签、公开缓存 |
| 通话 | 未实现 | WebRTC、TURN/SFU、编码帧 E2EE |
| 发布 | 基础 CI | 签名、SBOM、来源证明、可验证更新 |

## 目标拓扑

~~~
                      ┌─────────────────────────┐
                      │  已验证设备客户端         │
                      │ Tauri / Android / iOS    │
                      └───────────┬─────────────┘
     ┌────────────────────────────┼────────────────────────────┐
     │                            │                            │
     ▼                            ▼                            ▼
消息投递域                    文件对象域                    公告域
认证 WSS 中继                短期能力 URL                 签名公开内容
密文队列/分页                 密文分块/TTL                 CDN/缓存
     │                            │                            │
     └───────────────┐            │            ┌───────────────┘
                     ▼            ▼            ▼
                 身份目录域     推送域       通话域
                 credential/    不透明唤醒   TURN / SFU
                 KeyPackage/                编码帧 E2EE
                 透明性 proof
~~~

所有域都使用独立域名、凭证、日志、部署账户和最小权限。服务间不共享可用于构建用户画像的全局标识符。

## 核心数据流

### 私密消息

1. 客户端通过安全存储取得设备身份与 MLS state。
2. MLS Core 生成 application ciphertext；应用只把不透明密文、版本和最小投递字段发送给中继。
3. 中继验证传输 schema、认证、速率和成员投递资格，保存/转发密文，但不解密。
4. 接收端验证目录/MLS state 后解密；无效签名、错误 epoch、重放或目录异常内容不作为普通消息显示。

### 文件

1. 客户端生成独立 fileKey，流式分块 AEAD 加密。
2. 当前 MLS epoch 只用于保护 fileKey package；对象存储只接收密文块。
3. 文件 descriptor 以私聊消息发送；下载者先验证 descriptor/manifest，再逐块校验完整性。
4. 过期/撤回删除服务端密文和能力，但无法收回成员已保存副本。

### 公告

1. 发布后台使用专用发布者密钥签名公开公告。
2. 客户端从独立公告域拉取，验证可信目录、签名、顺序和撤回记录。
3. 推送仅唤醒客户端；不携带公告或私聊正文。
4. 公告订阅和阅读不复用私聊身份或群 ID。

### 通话

1. 已验证设备通过私聊信令协商 callId、候选和短期 TURN/SFU 令牌。
2. WebRTC 提供传输保护；私密通话还要求编码帧级 E2EE 和当前成员/身份验证。
3. TURN/SFU 转发包和最小网络元数据，不拥有媒体解密密钥。

## 信任边界

| 组件 | 可信范围 | 可能看到 | 不可看到/不可做 |
| --- | --- | --- | --- |
| 用户设备 | 明文与本机密钥使用 | 本会话内容、已授权状态 | 保护被控系统上的明文 |
| 消息中继 | 投递完整性/可用性 | 密文、时间、大小、在线关系 | 解密消息、生成用户私钥 |
| 文件服务 | 密文对象可用性 | 分块大小、请求时间、短期能力 | 解密文件、读取文件名明文 |
| 身份目录 | 公开密钥绑定 | credential、撤销、查询元数据 | 读取聊天内容或 MLS 私密 state |
| 公告服务 | 公开签名内容分发 | 公告内容、请求元数据 | 关联私聊身份或代签私聊 |
| TURN/SFU | 实时转发 | 网络元数据、媒体包大小/时序 | 在媒体 E2EE 正确启用时解密媒体 |
| 发布系统 | 签名软件产物 | 源码/依赖/构建证据 | 访问用户聊天或恢复材料 |

端到端加密不自动隐藏 IP、时序、流量大小、在线状态或终端被控风险。详见 NETWORK_PRIVACY_AND_RESILIENCE.md。

## 部署模式

### 本地演示

允许本机或同 Wi-Fi 使用非 TLS WebSocket，明确显示为开发模式；不包含真实敏感数据，不作安全承诺。

### 受控测试

使用 WSS、独立测试域名、短期凭证、合成数据和受限成员；启用认证、限流、分页、日志最小化和签名候选构建。

### 正式生产

只在 SecureKeyStore、MLS、目录透明性、加密文件、签名公告、可验证发布、独立审计和验证矩阵满足后开放。生产客户端拒绝本地 debug、明文传输、未知端点、未验证更新和安全能力静默降级。

## 关键设计文档

- 协议决策：ADR-001-MLS_PROTOCOL_DECISION.md
- 中继线协议：WIRE_PROTOCOL_V2.md
- 安全存储：SECURE_STORAGE_MIGRATION.md
- 设备与恢复：DEVICE_IDENTITY_AND_RECOVERY.md
- 目录透明性：KEY_DIRECTORY_TRANSPARENCY.md
- 文件与链接：FILES_AND_LINKS_PROTOCOL.md
- 通话：CALLS_MEDIA_ARCHITECTURE.md
- 公告：PUBLIC_NOTICES_PROTOCOL.md
- 网络隐私：NETWORK_PRIVACY_AND_RESILIENCE.md
- 发布供应链：RELEASE_AND_SUPPLY_CHAIN_SECURITY.md
- 验证矩阵：SECURITY_VERIFICATION_PLAN.md
- 产品路线：PRODUCT_MVP_AND_ROADMAP.md
