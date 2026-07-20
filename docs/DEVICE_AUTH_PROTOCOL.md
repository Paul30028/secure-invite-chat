# 设备挑战签名协议 v1

## 目标

设备恢复群组或发送敏感操作前，必须证明它持有建群/入群时登记的设备私钥。服务端保存公钥，不保存私钥或群密钥。

## 连接流程

1. 服务端为每个 WebSocket 连接生成 256-bit 随机 `challenge`，下发 `auth_challenge`。
2. 客户端在 `resume_group` 中提供 `device_id`、`group_id` 与 `auth_sig`。
3. 签名输入为五个 UTF-8 字符串的长度前缀拼接：`sic-device-auth-v1`、challenge、action、group_id、device_id。
4. 服务端从成员记录读取该设备的 P-256 SPKI 公钥，验证 Web Crypto 原始 ECDSA `r || s` 签名。
5. 成功后，服务端将该 WebSocket 与该组、该设备绑定；发消息、读取历史、列成员和管理操作只接受该绑定身份。

## 迁移

- 新建群和新成员加入时登记 `identity_pub`。
- 同一 `group_id + device_id` 的公钥不可被更新覆盖；设备迁移必须走显式新增设备流程。
- `SIC_REQUIRE_DEVICE_AUTH=1` 时拒绝未提供有效身份公钥或挑战签名的旧客户端。
- 此协议认证设备持有者，不能撤销已经泄露的群共享密钥；成员移除仍必须触发新 epoch 的群密钥轮换。

## 非目标

本协议不是群组密钥协议，也不替代后续 MLS/双棘轮迁移。
