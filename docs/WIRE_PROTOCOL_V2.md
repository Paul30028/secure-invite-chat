# 客户端—中继线协议 v2（设计稿）

> 状态：尚未实现。当前原型使用宽松 JSON v1；本规范定义正式中继控制面如何版本化、认证、分页和失败。MLS、文件与公告的密码学对象保持不透明字节，不在中继层重新解释。

## 设计目标

- 让旧客户端能被明确拒绝或降级到只读迁移模式，而不是未知字段静默改变安全语义。
- 让中继在不解密内容的前提下执行认证、大小限制、幂等、分页、背压和错误处理。
- 每个请求/事件都可绑定协议版本、会话、设备和最小重试语义。
- 防止 JSON 宽松解析、字段歧义、浮点时间、无限列表和自由错误文本带来的兼容/安全问题。

## 传输

- 生产使用 TLS WebSocket；WebSocket subprotocol 固定为 sic.wire.v2。
- 一条连接先完成 hello、challenge、authenticate，再执行需身份的动作。
- 文本帧使用 UTF-8 JSON，最大帧由服务端配置；密文/KeyPackage/MLS 对象使用 base64url，无换行。
- 每个帧必须是单一 JSON object，最大嵌套深度、字段数、字符串长度、数组长度由 schema 固定。
- 时间使用整数 Unix 毫秒；布尔值仅 true/false；禁止 NaN、Infinity、重复 JSON key 和未声明的数字格式。

## 通用信封

~~~
{
  "v": 2,
  "type": "message.send",
  "requestId": "128-bit base64url random",
  "body": { ... }
}
~~~

- v 和 type 必填。未知主版本返回 unsupported_version 并关闭/停止会话；未知 type 返回 unknown_type，不执行任何副作用。
- requestId 对有副作用请求必填，保留固定窗口的去重记录；重试同一 requestId 返回原结果或幂等确认。
- 客户端不得把 requestId 用作用户、群或设备的长期标识。
- 服务器事件也使用 v/type，但不要求 requestId；关联响应使用 replyTo。

## 连接与认证

### hello

~~~
{ "v": 2, "type": "hello", "body": { "clientVersion": "...", "capabilities": ["mls-v1"] } }
~~~

服务端返回 challenge、服务能力、端点/目录版本与会话限制。能力声明只是协商输入，不能替代安全验证。

### authenticate

~~~
{
  "v": 2,
  "type": "authenticate",
  "requestId": "...",
  "body": {
    "deviceCredential": "...",
    "challengeSignature": "...",
    "directoryCheckpoint": "..."
  }
}
~~~

签名覆盖 domain、challenge、连接会话 ID、协议版本、请求 type 与 device credential hash。challenge 一次性、短期、连接绑定；成功后服务端生成短期 session capability。服务端不接受裸 deviceId 作为认证。

## 核心操作

| type | 作用 | 中继验证 |
| --- | --- | --- |
| session.resume | 恢复已授权会话/群投递订阅 | session、目录/成员状态、请求幂等 |
| group.create | 创建 MLS 群索引 | 设备认证、创建能力、MLS 初始化对象大小 |
| group.join | 投递 Welcome/外部加入请求 | 邀请授权、目标 credential、目录状态 |
| group.commit | 投递 MLS Commit/成员变更 | 已认证发送者、群订阅、对象上限 |
| message.send | 投递 MLS application ciphertext | 会话资格、限流、requestId 去重、大小 |
| history.page | 拉取受限密文页 | 会话资格、稳定 cursor、页上限 |
| file.capability | 请求上传/下载短期能力 | MLS 会话资格、配额、对象范围 |
| device.revoke | 吊销自己的设备/恢复授权设备 | root/recovery 授权、目录版本 |
| push.register | 注册不透明唤醒 token | 设备认证、token 格式/过期 |
| call.signal | 投递认证通话信令 | 会话资格、callId、短期/大小/序号 |

中继不解码 MLS application ciphertext、fileKey package、媒体 key 或公告正文。对这些对象只执行长度、编码、版本和投递资格检查。

## 历史分页

~~~
request body:
{ "conversationId": "...", "cursor": { "before": "opaque-signed-cursor" }? }

response body:
{
  "items": [opaque message envelopes],
  "nextCursor": "opaque-signed-cursor" | null,
  "hasMore": true | false
}
~~~

- cursor 由服务端签名/认证，绑定 conversation、排序锚点、过期时间和版本；客户端不构造内部时间/id 字段。
- 页面按稳定顺序返回，客户端按 messageId 去重。新消息与历史页并发到达不造成丢失或重复显示。
- 最大 page size 由服务端固定或在小范围协商；不提供无限 limit、OFFSET 或全量导出接口。
- 删除/过期项目不会让 cursor 穿越到其他会话；失效 cursor 返回 cursor_expired，并要求从最新页重新同步。

## 错误模型

~~~
{
  "v": 2,
  "type": "error",
  "replyTo": "...",
  "body": {
    "code": "rate_limited",
    "retryAfterMs": 1000?,
    "safeDetail": "..."
  }
}
~~~

错误 code 是有限枚举，例如 invalid_schema、unsupported_version、authentication_failed、not_authorized、stale_membership、rate_limited、cursor_expired、service_unavailable。safeDetail 不包含数据库异常、内部拓扑、token、credential 或内容。

客户端对错误的规则：

- authentication_failed、directory_unverified、stale_membership：停止敏感发送并刷新安全状态。
- rate_limited、service_unavailable：遵守 retryAfterMs 加抖动，不建立重试风暴。
- invalid_schema、unsupported_version：停止当前操作并提示升级/兼容路径。
- 不因任一错误回退到旧共享密钥、明文传输或未认证成员资格。

## 兼容与迁移

- v1 原型仅用于受控迁移；服务端在正式环境通过明确 capability/版本策略拒绝新 v1 写入。
- v2 引入字段时使用新 type 或可选 capability，不能改变已有字段的加密/认证含义。
- 重大密码学、目录或身份语义变更使用新的 protocol major 与独立测试向量。
- 每个版本有最短支持窗口、弃用公告、只读迁移期限与签名更新要求。

## 验收门槛

- JSON schema、requestId 幂等、challenge 重放、capability 过期、分页 cursor、错误枚举和未知字段具备跨端测试向量。
- 模糊测试覆盖解析、极限长度、嵌套、重复键、乱序事件、并发重试和连接重建。
- 生产中继拒绝未认证写入、无界历史、自由错误文本和未知版本的隐式执行。
- 所有客户端在安全状态不满足时显示可理解的阻断原因，而不是协议静默失败。
