# 每日公告与 App 更新

本功能有两层：

- **App 内置轮换**：即使临时离线，三个公告会按上海日期自动轮换。
- **服务器公告源**：App 每小时读取一次 `https://secureinchat.com/notices.json`；后台保存文件后，所有客户端会在下一次刷新或重启时看到新内容。

> 诗歌只能填写已取得传播授权的 HTTPS 音频链接。不要把私密音频或 Matrix 访问令牌写进公开 JSON。

## 1. 在 VPS 启用公告和更新文件

编辑 `/etc/caddy/Caddyfile`，把站点改为：

```caddyfile
secureinchat.com {
    @publicContent path /notices.json /app-update.json /downloads/*
    handle @publicContent {
        root * /opt/secure-invite-chat/server/public
        header Access-Control-Allow-Origin "*"
        file_server
    }

    handle {
        reverse_proxy 127.0.0.1:8765
    }
}
```

应用配置：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl -fsS https://secureinchat.com/notices.json
```

## 2. 每日公告内容

文件位置：

```text
/opt/secure-invite-chat/server/public/daily-notices.json
```

每个栏目可以写指定日期的内容（`date: YYYY-MM-DD`）；当天没有指定条目时，App 会按日期从该栏目的条目中轮换选择。字段：

```json
{
  "title": "诗歌标题",
  "summary": "卡片简介",
  "body": "详情页正文",
  "reference": "经文或版权来源",
  "audio_url": "https://授权音频地址.mp3",
  "audio_title": "播放器标题"
}
```

修改 JSON 后检查格式并重载 Caddy（Caddy 不重载也可读取文件；重载仅用于确认配置）：

```bash
cd /opt/secure-invite-chat
python3 -m json.tool server/public/daily-notices.json >/dev/null
systemctl reload caddy
```

项目内的 `server/matrix_notices.py` 同样读取这份文件，可在已设置 Matrix 环境变量后每天定时发送三条公告：

```bash
cd /opt/secure-invite-chat
.venv/bin/python server/matrix_notices.py --daemon --time 07:00
```

正式运行时应把它配置为独立 systemd 服务，并将 Matrix 令牌放入仅 root 可读的环境文件。

## 3. App 自动更新

Android 普通 APK 不能静默安装；App 会在启动时读取：

```text
https://secureinchat.com/app-update.json
```

只有当其中的 `version` 高于当前 App 且 `apk_url` 是 HTTPS 地址时，才会弹出“下载更新”。Android 系统会要求用户确认安装。

发布新 APK 的步骤：

1. 将构建出的 `app-debug.apk` 上传到服务器：
   `/opt/secure-invite-chat/server/public/downloads/secureinchat.apk`
2. 编辑 `server/public/app-update.json`：

```json
{
  "version": "0.1.2",
  "published_at": "2026-07-25T09:00:00+08:00",
  "release_notes": "说明本次更新内容。",
  "apk_url": "https://secureinchat.com/downloads/secureinchat.apk"
}
```

3. 用手机重新打开 App；它会自动检测并显示更新提示。

每次 Android 构建使用的调试签名可能不同。若系统拒绝覆盖安装，请卸载旧测试版后再安装；本地群组和缓存消息会随卸载清除。


## 2.1 App 内的管理员专区

新版 App 的「今日公告」首页底部有 **管理员专区**。管理员可本地编辑灵修、诗歌、金句并点击“一键提交今日公告”。提交走现有 `wss://secureinchat.com` WebSocket，不会把管理员令牌存入 App。

先在服务器生成一个随机令牌：

```bash
openssl rand -hex 32
```

将输出的令牌写入聊天服务的 systemd 覆盖配置：

```bash
systemctl edit secure-chat
```

粘贴（把 `替换为刚生成的随机值` 换成真实令牌）：

```ini
[Service]
Environment="SIC_NOTICE_ADMIN_TOKEN=替换为刚生成的随机值"
```

然后重启服务：

```bash
systemctl daemon-reload
systemctl restart secure-chat
systemctl status secure-chat --no-pager
```

在 App 的管理员专区输入同一令牌即可发布。令牌为空时，服务器会拒绝全部公告发布请求。

> 令牌等同于公告后台密码；不要发到群里、截图或提交到 Git。
