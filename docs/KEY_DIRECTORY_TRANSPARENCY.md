# 设备密钥目录与透明性验证（设计稿）

> 状态：尚未实现。该系统用于防止目录服务对不同用户或不同设备返回相互矛盾的身份公钥/设备列表。它补充端到端加密，不替代安全码、设备确认或终端安全。

## 要解决的问题

仅靠“首次见到公钥就记住”（TOFU）存在窗口：恶意或被入侵的服务端可以在首次联系时向两端分别提供攻击者密钥，随后各自都看到一致的假密钥。设备签名无法独自解决“客户端最初从哪里取得正确公钥”的问题。

透明性目录提供：

- 公开 credential、设备状态、KeyPackage 与撤销记录的可验证历史。
- 客户端可验证当前结果被包含在已签名的全局检查点中。
- 客户端可验证两个检查点之间是追加关系，而非服务端回滚或分叉。
- 目录服务若对不同受众提供不同视图，能由客户端、监视器或交叉日志发现。

它不隐藏用户已注册这一事实，也不防止已获授权的恶意设备读取消息。

## 目录记录

每个用户身份在目录中对应一个版本化条目，不使用手机号、邮箱或可枚举昵称作为查找键。

~~~
DirectoryKey = H("sic-kt-v1" || rootIdentityPublicKey)

DirectoryEntry {
  version
  rootCredential
  devices[]: { deviceCredential, keyPackageRefs, status, validFrom, revokedAt? }
  entrySequence
  previousEntryHash
  rootAuthorizationSignature
}
~~~

- 所有设备增删、KeyPackage 更新、恢复与吊销都产生新条目版本，且由 root identity 或受限恢复策略授权。
- 设备私钥、MLS 私密 state、群成员列表、聊天 ID、联系人、文件密钥和推送 token 不进入目录。
- KeyPackage 可在单独的受控对象中存放；目录记录其哈希/引用与有效期，防止服务端替换。
- 对外展示的联系人标识是用户主动分享的公开凭证或不可枚举别名；客户端不得提供全局用户搜索。

## 透明性结构

采用经审计的 Merkle-map + append-only log 实现，或等价的成熟透明性组件；不自行实现哈希树协议。

每个 epoch 发布：

~~~
Checkpoint {
  directoryId
  treeSize
  mapRoot
  logRoot
  issuedAt
  previousCheckpointHash
  operatorSignature
  witnessSignatures[]
}
~~~

客户端从目录取得条目时，同时取得：

1. 当前条目的 inclusion proof。
2. 条目不存在时的 non-inclusion proof（仅用于用户明确查询的公开凭证）。
3. 上次已见 checkpoint 到当前 checkpoint 的 consistency proof。
4. operator 签名与满足阈值的独立 witness 签名（达到部署阶段后）。

客户端验签失败、proof 不匹配、treeSize 回退、同一 treeSize 的 root 不一致或目录版本逆序时，进入“目录异常”状态：停止向受影响身份发送新密钥材料，并提示用户通过安全码/其他可信通道核验。

## 查询与隐私

- 普通消息发送不需要每次都在线查询目录。客户端缓存已验证 credential、checkpoint 与证明，按风险事件、首次联系、设备变更、恢复、加入群和固定间隔刷新。
- 直接按公开凭证查询会向目录暴露“谁在查谁”。初版如实披露此点；后续可评估隐私代理/PIR，但不能把未审计代理称作匿名保证。
- 群组加入只查询用户明确提供的 credential；不通过电话簿或名称进行批量枚举。
- 监视器验证 checkpoint 追加性，不接触私聊内容。独立 witness/monitor 运营方与目录运营方应分离。

## 客户端决策

| 结果 | 客户端动作 |
| --- | --- |
| 首次、证明有效 | 显示“已由目录验证”；仍可让用户比对安全码 |
| 新设备、根授权有效 | 标记新设备事件；按 MLS 流程确认/加入 |
| 已知设备密钥变更、授权有效 | 显示高优先级安全提示，要求重新验证 |
| 撤销记录有效 | 拒绝对该设备投递 KeyPackage；触发 MLS 移除 |
| 证明无效/目录回滚 | 阻止新会话、新设备和敏感发送；保留只读历史 |
| 暂时离线 | 使用未过期缓存并标注“目录未刷新”；不静默接受新密钥 |

TOFU 只作为历史旧会话的兼容显示，不能是正式 MLS 身份决策的唯一依据。

## 服务端 API 边界

- GET /v1/directory/checkpoint：返回最新签名 checkpoint 与 witness 证据。
- GET /v1/directory/entries/{publicCredential}：仅返回条目、proof 与对应 checkpoint。
- POST /v1/directory/entries：提交 root 授权的新增/变更；服务端先做 schema、签名和版本校验，再写入不可变 log。
- GET /v1/directory/consistency?from=…&to=…：返回追加性证明。
- GET /v1/keypackages/{ref}：只返回仍有效且与已验证目录条目绑定的公开 KeyPackage。

操作员 API 与业务中继、文件服务、公告服务分离。访问日志仅保留运维必需聚合数据；不得把目录查询与私聊投递事件合并成用户画像。

## 部署路线

1. **本地验证期**：客户端只实现 credential 格式、设备变更 UI 和固定测试向量；不开放透明性宣称。
2. **单运营方目录**：引入签名 checkpoint、inclusion 与 consistency 验证；独立安全审计。
3. **交叉日志/见证**：至少两个独立运营方对 checkpoint 见证或交叉记录，客户端验证阈值。
4. **公开监视与事件响应**：提供可复现 proof、告警流程、撤销策略和透明性状态页。
5. **生产强制**：MLS 建群、添加设备、关键包领取和恢复均要求有效透明性状态；旧协议会话不自动升级。

## 验收门槛

- 固定测试向量覆盖 inclusion、non-inclusion、consistency、分叉、回滚、过期 checkpoint、错误 witness 与 entry 版本跳跃。
- 客户端在目录异常时不会继续信任新公钥、生成 Welcome 或悄悄覆盖已知设备。
- 目录实现、哈希/签名算法、监视器、日志保留、访问控制和灾难恢复通过独立评审。
- 隐私文档准确披露目录查询、公开 credential、监视器与网络层仍可能暴露的元数据。
