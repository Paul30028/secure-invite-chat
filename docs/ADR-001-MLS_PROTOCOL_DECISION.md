# ADR-001：群聊与一对一消息协议选型

- 状态：接受为目标架构；实现前须完成 PoC、许可证审查和独立安全评审。
- 日期：2026-07-20
- 决策范围：私聊消息、群成员变更、文件密钥包和通话媒体密钥导出；不覆盖账号恢复、网络匿名或服务端元数据。

## 背景

当前原型使用由邀请码材料派生的共享 AES-GCM 群密钥。它便于演示，但不具备成员移除后的新消息保密、前向保密、失陷后恢复、多设备一致状态或标准化群成员变更。继续在 TypeScript 中手写“群 epoch + 自定义逐设备加密 + 消息链”会形成未经审计的新密码协议，风险不可接受。

## 决策

正式客户端以 **MLS（Messaging Layer Security，RFC 9420）** 作为所有私密会话的群密钥与应用消息协议：

- 群聊：一个 MLS group 对应一个私密群。
- 一对一：使用成员数为 2 的 MLS group；不额外引入另一套自研双棘轮状态机。
- 文件：独立 fileKey 由 MLS exporter/当前 epoch 保护，详见 FILES_AND_LINKS_PROTOCOL.md。
- 通话：媒体帧密钥由 MLS exporter 以 callId、发送者和 generation 做域隔离，详见 CALLS_MEDIA_ARCHITECTURE.md。
- 服务端：只存储/投递 MLS ciphertext、Commit、Welcome、KeyPackage 和公开成员目录；不得解密或合成 MLS 消息。

实现候选为基于 Rust 的 OpenMLS，封装在一个自有的最小 sic-crypto-core 层中，由 Tauri 直接调用、Capacitor 走窄 FFI、Web 演示端走受限 WASM。这个决策选择的是 MLS 标准与接口边界，**不等同于立即将某个库直接接入生产**。

## 为什么不直接采用 libsignal

Signal 的 libsignal 包含双棘轮等实现，但其官方仓库明确写明“在 Signal 之外使用不受支持”，并采用 AGPLv3 许可。因此在没有法律审查、长期维护承诺和完整平台兼容性验证前，本项目不把它作为默认生产依赖。

这不是对 Signal 协议安全性的否定；而是针对本项目跨 Tauri、Capacitor、Web 的发布、维护和许可证风险作出的工程选择。若未来法律与维护条件满足，可另立 ADR 比较“libsignal 用于一对一 + MLS 用于群聊”的双栈方案。

## sic-crypto-core 边界

业务层只调用版本化的高层操作，不接触 MLS 私钥、epoch secret 或可序列化原始 state：

~~~
createIdentity() / registerDevice()
createKeyPackage() / consumeWelcome()
createGroup() / addMembers() / removeMembers()
encryptApplicationMessage() / decryptApplicationMessage()
exportSecret(label, context)
serializeEncryptedState() / restoreEncryptedState()
~~~

- Core 将 MLS group state 加密后交给平台 EncryptedStateStore；明文 state 和私钥不穿过 WebView JS API。
- 所有调用返回结构化错误，如 stale_epoch、unknown_sender、invalid_commit、state_locked。UI 不将异常内容作为消息展示。
- 输入/输出都有协议版本、最大长度和固定编码；禁止把 JSON 自由对象直接传入 MLS。
- 任何 content-debug、密钥导出或测试 provider 均不能出现在生产构建。

## 身份与设备注册

MLS credential 绑定设备级签名身份，而不是昵称、裸 deviceId 或邀请码：

1. 安全存储生成独立的长期身份签名键和 MLS 所需 key package。
2. 客户端将设备公钥、credential、KeyPackage 和最小化设备元数据发布到目录服务。
3. 新设备/新 KeyPackage 要么经已有设备批准，要么经用户控制的恢复流程批准。
4. 加入者收到 Welcome 后验证 group context、成员 credential、目录证明和邀请授权，再安装 group state。
5. 用户可比对安全码；密钥变化触发阻断/重新验证，而不是静默 TOFU 覆盖。

目录服务中的 KeyPackage 是公开密钥材料，并不等于聊天内容密钥。长期目标是可审计 key transparency，以发现服务端对不同用户返回不一致身份目录。

## 服务端协议职责

| 对象 | 服务端可做 | 服务端不得做 |
| --- | --- | --- |
| KeyPackage | 限量存储、一次领取、过期删除 | 生成私钥、替换设备 credential |
| Welcome / Commit | 按 recipient 或 group 投递、持久化密文 | 解密、合并、重写、伪造签名 |
| application message | 按群投递、去重、短期密文缓存 | 读取正文、决定 MLS epoch 有效性 |
| 成员目录 | 返回带签名/透明性证明的公开 credential | 用群 admin token 直接冒充设备 |
| 推送 | 发送不透明唤醒 | 包含消息、群名或 MLS state |

服务端的成员表只是一份投递索引。客户端以 MLS Commit 和 credential 验证为准；二者不一致时停止发送并要求同步，不能“为了可用性”继续使用旧共享密钥。

## 迁移路径

1. **冻结旧协议扩展**：不再给 keyJwk/groupSecret 共享密钥方案加入新功能；界面标注“旧会话（迁移前）”。
2. **安全存储先行**：完成 SecureKeyStore 与加密状态库，参见 SECURE_STORAGE_MIGRATION.md。
3. **跨平台 PoC**：同一测试向量在 Rust、Android、iOS、Tauri 与 WASM 演示端创建/加入/移除成员、离线恢复、乱序投递。
4. **目录与邀请服务**：发布 KeyPackage、发送 Welcome、证明设备身份；全流程可审计。
5. **新建 MLS 会话**：只有新版客户端能创建正式会话；旧共享群不能就地声称已升级。
6. **受控迁移**：管理员创建新的 MLS 群并向已验证成员分发一次性迁移邀请；旧历史保持只读并明确缺少新安全属性。
7. **关闭旧写入**：在用户迁移窗口后禁用旧协议发送，最后移除旧密钥导出与 localStorage 状态。

## 需要验证的安全属性

- 移除成员后的 Commit 被正确处理后，旧成员不能解密后续 application message、文件 key package 或通话新 generation。
- 单条消息泄露、设备状态泄露、离线后恢复和成员并发变更都符合 MLS 预期，不出现 nonce/epoch 重用。
- Welcome、Commit、application message 的篡改、重放、乱序、fork、旧 state 回滚和目录替换被检测并隔离。
- 多设备添加/移除、密钥轮换、恢复/重装和网络切换不会让同一设备产生两个冲突 group state。
- 所有平台对同一固定 MLS 测试向量产生一致结果；不可用平台拒绝进入正式私密会话，而不是退回旧共享密钥。

## 发布门槛

- 选定实现的许可证、维护状态、依赖 SBOM、已知漏洞和编译供应链完成审查。
- Core、FFI、WASM、状态存储和服务端投递接口经独立密码学/应用安全评估。
- 完成端到端互操作、模糊测试、恢复测试、性能/电量测试和故障注入。
- 公开安全白皮书准确说明 MLS 覆盖的内容保密属性，以及仍会暴露的网络元数据与终端风险。
