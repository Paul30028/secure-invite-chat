# VPS 安全安装 Sing-box（一键）

脚本路径：`scripts/vps-secure-singbox-install.sh`  
仓库：https://github.com/Paul30028/secure-invite-chat

---

## 测过什么（本机环境）

| 检查项 | 结果 |
|--------|------|
| 脚本在 GitHub raw 可下载 | 通过 |
| 已去掉 `ufw --force reset`（防锁 SSH） | 通过 |
| 含 `sing-box check` 配置校验 | 通过 |
| 含 GitHub 下载镜像回退 | 通过 |
| 官方 release 存在 `linux-amd64.tar.gz` | 通过（当前 latest 1.13.x） |
| 真实 VPS root 全量安装 | **需你在 VPS 上执行一次确认** |

结论：**脚本逻辑已按「一次装成功」修过**；完整实装取决于 VPS 能否访问 GitHub、安全组是否放行端口。

---

## 安装前准备

1. 一台 **Ubuntu 20.04/22.04/24.04** 或 **Debian 11/12** VPS  
2. **root** 登录（或 `sudo -i`）  
3. 记下当前 **SSH 端口**（默认 22；若改过，安装时必须声明）  
4. 云厂商 **安全组 / 防火墙** 稍后要放行：  
   - SSH 端口（如 22）  
   - 脚本打印的代理端口（随机高端口）

---

## 一键安装

在 VPS 上执行（与常见一键脚本格式相同）：

```bash
bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
```

或：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
```

### 可选参数

| 变量 | 含义 | 默认 |
|------|------|------|
| `SSH_PORT` | 当前 SSH 端口（**填错会锁死**） | `22` |
| `PROXY_PORT` | 代理端口；`0` = 自动随机 | `0` |
| `REALITY_SNI` | Reality 伪装域名（勿用 microsoft，证书过大易失败） | `www.cloudflare.com` |
| `SKIP_HARDEN` | `1` = 跳过 fail2ban/sysctl | `0` |
| `SINGBOX_VERSION` | 固定版本，如 `1.13.14` | 自动最新 |

示例（SSH 已改成 2222）：

```bash
SSH_PORT=2222 bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
```

固定代理端口：

```bash
PROXY_PORT=44333 bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
```

---

## 安装后做什么

### 1. 保存节点

终端会打印 **vless://…** 链接，并写入：

```bash
cat /etc/s-box-secure/client-link.txt
```

### 2. 云安全组

放行：

- `TCP` **你的 SSH 端口**
- `TCP` **脚本显示的代理端口**

### 3. 客户端

用支持 **VLESS + Reality + Vision** 的客户端导入该链接（如 v2rayN、NekoBox、sing-box 客户端等）。

### 4. 常用命令

```bash
systemctl status sing-box-secure
systemctl restart sing-box-secure
journalctl -u sing-box-secure -f
```

---

## 脚本会做什么 / 不会做什么

| 会 | 不会 |
|----|------|
| 装官方 sing-box | 关闭整机防火墙 / ACCEPT ALL |
| 只开 SSH + 一个代理端口 | 默认装一堆协议 / WARP / Argo |
| 随机 UUID、Reality 密钥 | 使用第三方超大交互菜单脚本 |
| 配置校验后启动 systemd 服务 | 自动改你的 SSH 端口 |

---

## 失败排查

| 现象 | 处理 |
|------|------|
| 下载失败 | VPS 访问不了 GitHub；脚本会试镜像，仍失败则换有外网的机器或设代理后再装 |
| 缺少 jq/curl | 检查系统源：`apt update && apt install -y jq curl` 后重跑 |
| 服务启动失败 | `journalctl -u sing-box-secure -n 50` |
| 客户端连不上 | 见下方「连不通排查」 |
| SSH 连不上 | 是否误设 `SSH_PORT`；用云厂商 VNC/救援控制台恢复 |

---

## 连不通排查（已装好仍无法连接）

### 1. 端口是否通

在你电脑 PowerShell：

```powershell
Test-NetConnection 你的VPS_IP -Port 代理端口
```

`TcpTestSucceeded : True` 说明安全组/防火墙基本 OK。

### 2. 服务是否在跑

VPS 上：

```bash
systemctl status sing-box-secure
ss -lntp | grep -E '28826|sing-box'   # 端口改成你的
journalctl -u sing-box-secure -n 50 --no-pager
```

### 3. Reality 伪装站（常见坑）

**不要用 `www.microsoft.com`**：证书过大，sing-box 容易握手失败  
（[issue #4234](https://github.com/SagerNet/sing-box/issues/4234)）。

推荐改为：`www.cloudflare.com` / `www.apple.com` / `gateway.icloud.com`

**不重装，只改配置：**

```bash
# 备份
cp /etc/s-box-secure/config.json /etc/s-box-secure/config.json.bak

# 把 microsoft 换成 cloudflare
sed -i 's/www.microsoft.com/www.cloudflare.com/g' /etc/s-box-secure/config.json

# 校验并重启
/etc/s-box-secure/sing-box check -c /etc/s-box-secure/config.json
systemctl restart sing-box-secure
systemctl status sing-box-secure
```

客户端链接里的 **sni=** 也要改成同一个：

```text
...&sni=www.cloudflare.com&...
```

### 4. 客户端要求

- 必须支持 **VLESS + Reality + xtls-rprx-vision**
- `pbk`（公钥）、`sid`（short_id）、`uuid`、端口必须与服务器一致
- 不要开「允许不安全」之类乱改 Reality 参数

### 5. 本机网络

部分网络拦截非常规端口；可换手机 4G 试一次，或把 `PROXY_PORT` 设为 `443` 重装（注意与 HTTPS 冲突时需空闲）。

---

## 与「邀群密聊」的关系

| 组件 | 用途 |
|------|------|
| 本脚本 | VPS **代理出口**（科学上网类，合法用途） |
| `server/server.py` | 聊天中继（以后公网互通再部署） |

可装在同一台 VPS，端口分开（聊天如 `8765`，代理为脚本随机端口）。

---

## 合规

请遵守所在地法律与 VPS 服务条款，仅用于合法用途。节点链接勿发公开群。
