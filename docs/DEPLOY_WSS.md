# 手机流量接入（公网 WSS）

手机用 **4G/5G** 时，无法访问家里电脑的 `192.168.x.x`。  
必须把中继暴露到公网，并用 **`wss://`（TLS）**。

```
手机(流量) --wss://你的域名--> 反向代理/隧道 --本机--> server.py:8765
电脑管理端 可继续用 ws://127.0.0.1:8765，但「邀请用公网地址」填 wss://…
```

App 行为：

- 设置里可填 **写入邀请码的公网地址**
- 邀请码格式：`SIC1.入群码.密钥|wss://域名`
- 对方粘贴后 **自动切换服务器并加入**，无需自己填地址

---

## 方案 A · 最快试用：Cloudflare 临时隧道（家用电脑）

电脑已能跑 `server.py` 时：

1. 安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. 启动中继：

```bat
cd server
python server.py
```

3. 另开终端：

```bat
cloudflared tunnel --url http://127.0.0.1:8765
```

4. 终端会打印类似：

```text
https://random-words-xxxx.trycloudflare.com
```

5. 在 App **设置** / **邀请码面板**：

| 项 | 值 |
|----|-----|
| 电脑本机连接 | `ws://127.0.0.1:8765` |
| 邀请用公网地址 | `wss://random-words-xxxx.trycloudflare.com`（https 改成 **wss**） |

6. 创建群 → 复制邀请码（应含 `|wss://…`）→ 发给手机  
7. 手机 **关 Wi‑Fi 用流量** → 粘贴邀请码加入  

注意：免费 trycloudflare 域名会变，重启隧道后要更新「邀请用公网地址」并重新分享邀请码。

---

## 方案 B · 固定域名：VPS + Caddy

1. 买 VPS，解析 `chat.example.com` → VPS IP  
2. 上传并运行 `server.py`（只监听本机或 127.0.0.1:8765）  
3. Caddyfile：

```caddyfile
chat.example.com {
  reverse_proxy 127.0.0.1:8765
}
```

4. App 设置：

- 连接 / 邀请公网：`wss://chat.example.com`

---

## 方案 C · Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name chat.example.com;
  ssl_certificate     /path/fullchain.pem;
  ssl_certificate_key /path/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
  }
}
```

---

## 安全

| 层 | 作用 |
|----|------|
| WSS | 传输加密，防链路窃听明文帧 |
| 客户端 E2EE | 服务器只见密文，不能读聊天内容 |

- 防火墙只开 443；8765 勿对公网裸奔  
- 定期备份 `server/data.sqlite3`（密文库）

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 流量下连不上 | 是否 wss（不是 ws）；域名是否可达 |
| 邀请码加入失败 | 是否整段含 `\|wss://`；中继是否同一台 |
| 能连不能收消息 | 双方是否进同一群；管理端是否也连同一中继库 |
| Android 证书错误 | 必须正规证书或 Cloudflare；自签证书 WebView 常失败 |
