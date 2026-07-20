# 跨平台加密核心 API 规范（设计稿）

> 状态：尚未实现。该规范定义 sic-crypto-core 与 Tauri/Android/iOS/Web 演示层之间的最小接口。MLS 算法实现来自经过审查的库；本项目不自行实现密码原语或 MLS 状态机。

## 目标与边界

- 私钥、MLS group state、epoch secret、文件 key 和媒体 exporter secret 不以明文形式进入 React、WebView、日志、崩溃报告或普通 IPC。
- 平台层只得到不透明句柄、加密 state blob、公开 credential 和经验证的业务结果。
- 所有 FFI/IPC 输入输出为版本化二进制或严格 schema；不把任意 JSON 直接喂给密码 Core。
- Core 不访问网络、文件系统、数据库、推送或 UI；这些由受限外层负责。
- Core 不承担用户认证/目录透明性政策本身，但要求外层传入已验证的 credential/proof 结果。

## 分层

~~~
React UI / useChatEngine
          │  typed bridge, no secret export
          ▼
Platform adapter
Tauri Rust │ Android JNI │ iOS Swift │ Web demo WASM
          │
          ▼
sic-crypto-core
identity / MLS state / application ciphertext / exporters
          │
          ▼
SecureKeyStore + EncryptedStateStore
platform-owned private key operations and encrypted persistence
~~~

Web WASM 仅用于受限演示/互操作测试。它不能作为高风险正式客户端，也不得通过 localStorage 模拟安全存储。

## 不透明句柄

~~~
DeviceHandle       // 指向平台不可导出的设备身份
ConversationHandle // 指向已加载的加密 MLS state
OperationHandle    // 短生命周期异步操作/配对流程
~~~

- 句柄仅在当前进程/安装中有效，不能序列化、跨设备传输或作为网络标识。
- 应用层不能请求 exportPrivateKey、exportGroupSecret、exportEpochSecret 或 rawState。
- Core 在操作结束、会话锁定、设备吊销或异常时使相关句柄失效并尽可能清零临时内存。
- 错误结果不包含密钥、原始 MLS bytes、远端 credential 或完整输入。

## 最小 API

### 设备与公开材料

~~~
create_device(policy) -> DevicePublicBundle
load_device(reference) -> DeviceHandle
get_device_public_bundle(DeviceHandle) -> DevicePublicBundle
sign(DeviceHandle, context, payload) -> Signature
create_key_packages(DeviceHandle, count, expiry) -> KeyPackageBatch
revoke_device(DeviceHandle, authorization) -> RevocationRecord
~~~

DevicePublicBundle 只包含公开 credential、版本、签名算法、可公开的设备标签与有效期。私钥签名由平台 SecureKeyStore 完成；Core 不要求私钥导出。

### MLS 会话

~~~
create_conversation(DeviceHandle, initialMembers, policy) -> ConversationCreated
consume_welcome(DeviceHandle, welcome, verifiedContext) -> ConversationCreated
load_conversation(encryptedStateRef) -> ConversationHandle
protect_application(ConversationHandle, aad, plaintext) -> MlsCiphertext
unprotect_application(ConversationHandle, aad, ciphertext) -> PlaintextResult
create_commit(ConversationHandle, proposals) -> CommitResult
process_commit(ConversationHandle, commit, verifiedContext) -> CommitApplied
export_secret(ConversationHandle, label, context, length) -> SecretUseHandle
persist_conversation(ConversationHandle) -> EncryptedStateBlob
close_conversation(ConversationHandle)
~~~

- protect/unprotect 的 AAD 固定绑定会话标识、协议版本、消息类型、发送/接收上下文和应用消息 ID；外层不得传入自由拼接字符串。
- create_commit/process_commit 对成员新增、移除、设备变化和群策略使用强类型 proposal，拒绝未知操作。
- PlaintextResult 只有在 epoch、credential、sender、重放和状态一致性验证通过后才返回；失败时提供有限错误 code。
- export_secret 只返回可用于下一步受限操作的 SecretUseHandle，例如文件 key 包装或媒体帧 transform 初始化；不返回裸字节给 UI。

### 加密状态

~~~
seal_state(DeviceHandle, stateType, plaintextState) -> EncryptedStateBlob
open_state(DeviceHandle, blob, expectedType) -> OpaqueStateHandle
migrate_legacy_state(legacyInput, userApproved) -> MigrationResult
delete_state(reference) -> DeleteResult
~~~

- EncryptedStateBlob 包含版本、key reference、认证标签、创建时间和最小回滚保护信息；不含可识别会话名称。
- 只有 SecureKeyStore 能解封 state wrapping key；Core 不保存 state 到任意路径。
- legacy migration 是一次性、可审计、用户批准的过程；成功后由外层删除旧 localStorage 材料，失败不标记已迁移。
- 回滚到旧版本/旧 blob 触发 state_rollback 或 state_version_unsupported，不能静默继续。

## 文件与通话密钥用途

Core 只导出带用途限制的操作：

~~~
wrap_file_key(ConversationHandle, fileId, epoch, fileKeyHandle) -> FileKeyPackage
unwrap_file_key(ConversationHandle, descriptor) -> FileKeyUseHandle
create_media_context(ConversationHandle, callId, generation, sender) -> MediaContextHandle
~~~

- 文件 key 与媒体 key 均由专用 CSPRNG 生成，并使用独立 label/context；绝不重用聊天消息 nonce 或 group secret。
- FileKeyUseHandle 只能传给流式文件加密模块；MediaContextHandle 只能传给编码帧 transform。
- 成员移除、epoch 更新、设备吊销或通话 generation 变化使旧用途句柄失效。

## 错误与审计

有限错误 code：

| code | 外层行为 |
| --- | --- |
| state_locked | 提示解锁设备/安全存储 |
| state_rollback | 阻止会话，刷新/恢复验证 |
| invalid_ciphertext | 隔离内容，不渲染 |
| stale_epoch | 同步 Commit，不继续发送 |
| unknown_credential | 刷新透明性目录/要求验证 |
| membership_changed | 显示成员变更，安装新 state |
| unsupported_version | 提示升级/迁移，不降级 |
| capability_denied | 停止对应文件/通话操作 |

Core 只记录本地、可选、无敏感字段的审计事件枚举；详细诊断必须通过显式开发构建开关，且不能进入生产包。

## FFI/IPC 安全

- 每个桥接方法使用固定 method 名、版本、最大输入大小和强类型参数；拒绝额外字段。
- Android/iOS/Tauri 在 native 层验证调用来源与会话，避免任意网页/插件调用敏感操作。
- 所有长操作支持取消、超时和资源上限；取消后不留下可重用的部分 state/临时 key。
- 二进制输入先验证长度和版本，再交给库；使用模糊测试覆盖 FFI 边界、WASM 和持久化 blob。
- 生产构建关闭 debug provider、测试 RNG、密钥导出、内容日志与不安全 fallback。

## 实施与验收

1. 用固定向量完成 Rust Core 的 create/join/add/remove/encrypt/decrypt/persist 测试。
2. 为 Tauri、Android、iOS 和 WASM adapter 建立相同向量互操作测试。
3. 验证 React 层永远无法读取私钥、MLS state 或 exporter 原始字节。
4. 完成设备锁定、崩溃恢复、状态回滚、升级/降级、成员并发变更和内存压力测试。
5. 经独立审计后，才将 Core 接入正式消息、文件和通话路径。
