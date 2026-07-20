# 安全存储迁移设计

> 状态：设计已冻结，尚未全部实现。当前版本仍把群密钥、管理凭证和设备私钥写入 WebView 的 `localStorage`，因此不得把它当作高风险通信的生产客户端。

## 目标

让业务代码只拿到“可用的密钥句柄”，而不是可序列化的私钥或群密钥字符串。正式客户端必须保证：

- 私钥、群 epoch 状态和管理员能力令牌不进入 `localStorage`、日志、分析事件、剪贴板或普通备份。
- 正常运行时私钥不可导出；迁移或恢复不能绕过这项限制。
- 平台安全存储不可用时，产品明确停止受保护功能；不静默降级到明文存储。
- 聊天记录可被本地加密数据库保存，但其数据库密钥必须受平台安全存储保护。

## 分层与职责

```
UI / useChatEngine
  └─ KeyMaterialService
       ├─ SecureKeyStore（设备私钥、包装密钥、管理员能力）
       ├─ EncryptedStateStore（群状态、密文缓存、协议状态）
       └─ LegacyMigration（仅一次、可撤销前检查）
```

### SecureKeyStore 最小接口

```ts
type SecretPurpose = "device-signing" | "device-agreement" | "state-wrapping" | "admin-capability";

interface SecureKeyStore {
  availability(): Promise<"available" | "locked" | "unavailable">;
  createKey(input: { id: string; purpose: SecretPurpose; extractable: false }): Promise<void>;
  sign(input: { id: string; payload: Uint8Array }): Promise<Uint8Array>;
  deriveOrUnwrap(input: { id: string; wrapped: Uint8Array; context: Uint8Array }): Promise<Uint8Array>;
  putSecret(input: { id: string; value: Uint8Array; requireUserPresence?: boolean }): Promise<void>;
  getSecret(input: { id: string }): Promise<Uint8Array | null>;
  delete(input: { id: string }): Promise<void>;
}
```

业务层不获得设备私钥。群密钥只在解密/加密的短生命周期内进入内存；后续 MLS 状态或 epoch 密钥由 `EncryptedStateStore` 保存。

## 平台实现

| 运行环境 | 根密钥 / 设备私钥 | 加密状态 | 是否可作为正式客户端 |
| --- | --- | --- | --- |
| Android | Android Keystore；按风险选择硬件支持与用户认证 | SQLCipher 或等价加密数据库 | 可以，完成测试后 |
| iOS | Keychain；高风险操作可结合 Secure Enclave | 加密数据库 | 可以，完成测试后 |
| Tauri 桌面 | Rust 后端调用系统凭据库；不得留在 WebView | 加密 SQLite | 可以，完成测试后 |
| 浏览器 Web | 不承诺防 XSS/本机恶意软件；仅演示 | IndexedDB 最小化保存 | 不可作为高风险正式客户端 |

桌面与移动壳通过受限 IPC 暴露上述接口。IPC 必须使用固定方法集合、参数 schema 和调用方来源校验，不能提供任意“读 secret”命令。

## 旧数据迁移流程

1. **预检**：检测旧版 `sic_device_identity_v1`、`sic_groups` 与群消息缓存；用户看到迁移摘要和不可逆提示。
2. **创建新根**：在目标平台安全存储生成不可导出的新设备签名/协商密钥及状态包装密钥。
3. **导入最小数据**：仅把仍需使用的旧群材料加密写入 `EncryptedStateStore`；管理员 token 同时转入安全存储。
4. **重新认证**：将新设备公钥作为新设备注册，或由现有可信设备批准。旧版身份公钥不能被无提示地替换。
5. **核验**：关闭并重启应用，确认能恢复群状态、不能导出私钥，且本地密文可解。
6. **清除旧数据**：只在第 5 步成功后删除旧 localStorage 的私钥、JWK、群 secret、管理员 token 与明文缓存。
7. **失败处理**：保持旧数据不变并报告失败原因；不得写入“已迁移”标记。用户可取消、重试或通过已认证设备重新配对。

迁移完成标记必须由新存储中的带认证状态记录，而不是 localStorage 布尔值。

## 版本与回滚

- 每个安全状态记录携带 `formatVersion`、`createdAt`、`keyId` 和认证标签。
- 新版本只能向前读取；若发生降级，客户端提示用户恢复受支持版本，不尝试把安全状态导回 localStorage。
- 密钥删除采用“先删除访问能力、后清除密文状态”的顺序；删除群时一并吊销该群的会话和推送令牌。
- 平台重装、系统凭据库清除或安全硬件重置视为新设备，不尝试自动恢复私钥。

## 验收用例

- 设备私钥、群 secret、admin token 不出现在 localStorage、普通 SQLite、日志、崩溃报告或导出的诊断包。
- 设备锁定时，签名、群解密和管理员操作失败且 UI 显示可理解的恢复路径。
- 旧数据迁移中断、重复运行、磁盘空间不足、密钥库锁定和版本降级均不会丢失或裸露密钥。
- 系统备份恢复到另一台设备后，不能直接冒充原设备；必须重新配对/认证。
- Android、iOS、桌面端各自具备自动化集成测试与人工安全验证记录。

## 现在不做的事

本设计不把普通 IndexedDB、浏览器不可导出 `CryptoKey` 或混淆后的 localStorage 当作安全存储方案。它们不能抵御同源脚本注入，也不能满足移动端和桌面端对本机秘密材料的保护要求。
