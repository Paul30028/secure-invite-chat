#!/usr/bin/env bash
# =============================================================================
#  VPS 安全一键安装 · Sing-box (VLESS Reality 单协议)
#  适用：Ubuntu 20.04/22.04/24.04 · Debian 11/12 · root
#
#  相对 yonggekkk/sing-box-yg (sb.sh) 的安全改动：
#  ✗ 不执行「关闭防火墙 / 清空 iptables / ACCEPT ALL」
#  ✗ 不默认 curl | bash 拉第三方交互大脚本
#  ✗ 不从不可信源装内核；仅 GitHub 官方 release + SHA256 校验
#  ✓ 仅开放：SSH 端口 + 一个代理端口
#  ✓ 随机高端口 + 随机 UUID / Reality 密钥
#  ✓ 可选加固：fail2ban、禁 root 密码登录提示
#  ✓ 非交互默认即可完成（可用环境变量覆盖）
#
#  一键安装（VPS root）：
#    bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
#  或：
#    bash <(curl -fsSL https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
#
#  环境变量（可选）：
#    SSH_PORT=22              # 当前 SSH 端口（勿填错，否则锁死）
#    PROXY_PORT=0             # 0=随机 10000-60000
#    REALITY_SNI=www.microsoft.com
#    SKIP_HARDEN=0            # 1=跳过 fail2ban 等
#    SINGBOX_VERSION=         # 空=latest，如 1.11.7
# =============================================================================
set -euo pipefail

export LANG=C.UTF-8
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; NC='\033[0m'
info(){ echo -e "${GRN}[INFO]${NC} $*"; }
warn(){ echo -e "${YLW}[WARN]${NC} $*"; }
err(){ echo -e "${RED}[ERR ]${NC} $*" >&2; exit 1; }

[[ ${EUID:-} -eq 0 ]] || err "请用 root 运行: sudo bash $0"

SSH_PORT="${SSH_PORT:-22}"
PROXY_PORT="${PROXY_PORT:-0}"
REALITY_SNI="${REALITY_SNI:-www.microsoft.com}"
SKIP_HARDEN="${SKIP_HARDEN:-0}"
SINGBOX_VERSION="${SINGBOX_VERSION:-}"
INSTALL_DIR="/etc/s-box-secure"
BIN="${INSTALL_DIR}/sing-box"
CFG="${INSTALL_DIR}/config.json"
LINK_FILE="${INSTALL_DIR}/client-link.txt"
SERVICE="sing-box-secure"

# ---------- 系统检测 ----------
. /etc/os-release 2>/dev/null || true
ID_LIKE="${ID_LIKE:-}${ID:-}"
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) err "不支持架构: $(uname -m)" ;;
esac

if command -v apt-get >/dev/null 2>&1; then
  PKG=apt
elif command -v dnf >/dev/null 2>&1; then
  PKG=dnf
elif command -v yum >/dev/null 2>&1; then
  PKG=yum
else
  err "需要 apt/dnf/yum 系统"
fi

# ---------- 基础依赖 ----------
info "安装基础依赖…"
if [[ $PKG == apt ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq
  apt-get install -y -qq curl wget ca-certificates jq openssl ufw qrencode \
    fail2ban unattended-upgrades >/dev/null
else
  $PKG install -y curl wget ca-certificates jq openssl firewalld qrencode fail2ban 2>/dev/null || true
fi

# ---------- 轻量加固（不关防火墙） ----------
if [[ "$SKIP_HARDEN" != "1" ]]; then
  info "基础安全加固…"
  # 内核网络
  cat >/etc/sysctl.d/99-sbox-secure.conf <<'SYS'
net.ipv4.tcp_syncookies=1
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv6.conf.all.accept_redirects=0
SYS
  sysctl --system >/dev/null 2>&1 || true

  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban >/dev/null 2>&1 || true

  # SSH 提示（不自动改端口，避免锁死）
  if grep -qE '^PermitRootLogin yes' /etc/ssh/sshd_config 2>/dev/null; then
    warn "检测到 PermitRootLogin yes。建议稍后改为 prohibit-password 或 no，并用密钥登录。"
  fi
fi

# ---------- 端口 ----------
port_in_use() {
  local p=$1
  ss -lntu 2>/dev/null | awk '{print $5}' | grep -qE "[:.]${p}$" && return 0
  return 1
}

if [[ "$PROXY_PORT" == "0" || -z "$PROXY_PORT" ]]; then
  for _ in $(seq 1 80); do
    PROXY_PORT=$((10000 + RANDOM % 50000))
    port_in_use "$PROXY_PORT" || break
  done
fi
port_in_use "$PROXY_PORT" && err "端口 $PROXY_PORT 已被占用，请设置 PROXY_PORT=其他端口"

info "代理端口: ${PROXY_PORT}  |  SSH 保持: ${SSH_PORT}（勿关错）"

# ---------- 防火墙：只放行 SSH + 代理 ----------
info "配置防火墙（仅开放必要端口，不会清空 ACCEPT ALL）…"
if command -v ufw >/dev/null 2>&1; then
  ufw --force reset >/dev/null 2>&1 || true
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${SSH_PORT}/tcp" comment 'SSH'
  ufw allow "${PROXY_PORT}/tcp" comment 'sing-box-reality'
  # Reality 仅 TCP；若以后加 hy2 再开 UDP
  echo "y" | ufw enable >/dev/null
  ufw status numbered || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  systemctl enable --now firewalld >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port="${SSH_PORT}/tcp"
  firewall-cmd --permanent --add-port="${PROXY_PORT}/tcp"
  firewall-cmd --reload
else
  # iptables 最小放行
  iptables -C INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT
  iptables -C INPUT -p tcp --dport "$PROXY_PORT" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$PROXY_PORT" -j ACCEPT
  warn "无 ufw/firewalld，已写入 iptables 放行规则；请确认云厂商安全组也放行 ${PROXY_PORT}/tcp"
fi

warn "请在云厂商控制台安全组同步放行：TCP ${SSH_PORT}、TCP ${PROXY_PORT}"

# ---------- 下载官方 sing-box 并校验 ----------
mkdir -p "$INSTALL_DIR"
cd /tmp

if [[ -z "$SINGBOX_VERSION" ]]; then
  info "解析 GitHub 最新版本…"
  SINGBOX_VERSION=$(curl -fsSL https://api.github.com/repos/SagerNet/sing-box/releases/latest \
    | jq -r .tag_name | sed 's/^v//')
  [[ -n "$SINGBOX_VERSION" && "$SINGBOX_VERSION" != null ]] || err "无法获取最新版本（检查 VPS 访问 GitHub）"
fi
info "安装 sing-box v${SINGBOX_VERSION} (${ARCH})"

TGZ="sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz"
BASE_URL="https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}"
curl -fL --retry 3 -o "$TGZ" "${BASE_URL}/${TGZ}" || err "下载失败: ${BASE_URL}/${TGZ}"

# 校验：优先 checksums 文件
if curl -fsSL -o checksums.txt "${BASE_URL}/sing-box-${SINGBOX_VERSION}-checksums.txt" 2>/dev/null \
   || curl -fsSL -o checksums.txt "${BASE_URL}/checksums.txt" 2>/dev/null; then
  if grep -q "$TGZ" checksums.txt 2>/dev/null; then
    grep "$TGZ" checksums.txt | sha256sum -c - || err "SHA256 校验失败"
    info "SHA256 校验通过"
  else
    warn "checksums 中无本文件名，跳过校验（建议手动核对）"
  fi
else
  warn "未找到官方 checksums，跳过校验（网络或 release 页面结构变化）"
fi

tar xzf "$TGZ"
install -m 755 "sing-box-${SINGBOX_VERSION}-linux-${ARCH}/sing-box" "$BIN"
rm -rf "sing-box-${SINGBOX_VERSION}-linux-${ARCH}" "$TGZ" checksums.txt 2>/dev/null || true
"$BIN" version | head -n 2

# ---------- 生成密钥 ----------
UUID=$("$BIN" generate uuid)
KEYPAIR=$("$BIN" generate reality-keypair)
PRIVATE_KEY=$(echo "$KEYPAIR" | awk -F': ' '/PrivateKey/{print $2}' | tr -d '\r')
PUBLIC_KEY=$(echo "$KEYPAIR" | awk -F': ' '/PublicKey/{print $2}' | tr -d '\r')
SHORT_ID=$(openssl rand -hex 8)

[[ -n "$UUID" && -n "$PRIVATE_KEY" && -n "$PUBLIC_KEY" ]] || err "密钥生成失败"

# ---------- 配置（仅 VLESS Reality，无 WARP/无多余入站） ----------
cat >"$CFG" <<EOF
{
  "log": {
    "level": "warn",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-reality",
      "listen": "::",
      "listen_port": ${PROXY_PORT},
      "users": [
        {
          "uuid": "${UUID}",
          "flow": "xtls-rprx-vision"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "${REALITY_SNI}",
        "reality": {
          "enabled": true,
          "handshake": {
            "server": "${REALITY_SNI}",
            "server_port": 443
          },
          "private_key": "${PRIVATE_KEY}",
          "short_id": ["${SHORT_ID}"]
        }
      },
      "sniff": true,
      "sniff_override_destination": true
    }
  ],
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "block", "tag": "block" }
  ],
  "route": {
    "rules": [
      { "protocol": ["quic"], "outbound": "block" }
    ],
    "final": "direct"
  }
}
EOF
chmod 600 "$CFG"

# ---------- systemd（最小权限倾向） ----------
cat >/etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=Sing-box Secure (VLESS Reality)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_NET_ADMIN
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_ADMIN
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ExecStart=${BIN} run -c ${CFG}
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null
systemctl restart "${SERVICE}"
sleep 1
systemctl is-active --quiet "${SERVICE}" || {
  journalctl -u "${SERVICE}" -n 30 --no-pager
  err "服务启动失败"
}
info "服务 ${SERVICE} 运行中"

# ---------- 公网 IP / 分享链接 ----------
IPV4=$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null \
  || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)
IPV6=$(curl -6 -fsS --max-time 8 https://api64.ipify.org 2>/dev/null || true)

HOST_IP="${IPV4:-}"
if [[ -z "$HOST_IP" && -n "$IPV6" ]]; then
  HOST_IP="[$IPV6]"
fi
[[ -n "$HOST_IP" ]] || HOST_IP="你的VPS公网IP"

LINK="vless://${UUID}@${HOST_IP}:${PROXY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${REALITY_SNI}&fp=chrome&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&type=tcp&headerType=none#vps-reality"

{
  echo "=== Sing-box Secure 安装完成 $(date -Iseconds) ==="
  echo "UUID:       $UUID"
  echo "Port:       $PROXY_PORT"
  echo "SNI:        $REALITY_SNI"
  echo "PublicKey:  $PUBLIC_KEY"
  echo "ShortID:    $SHORT_ID"
  echo "SSH_PORT:   $SSH_PORT (务必保持可登录)"
  echo ""
  echo "客户端链接:"
  echo "$LINK"
  echo ""
  echo "配置文件: $CFG"
  echo "服务名:   systemctl status $SERVICE"
} | tee "$LINK_FILE"
chmod 600 "$LINK_FILE"

echo
info "================ 客户端链接（请复制保存） ================"
echo -e "${YLW}${LINK}${NC}"
echo
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$LINK" 2>/dev/null || true
fi
echo
info "已写入: $LINK_FILE"
info "管理命令:"
echo "  systemctl status ${SERVICE}"
echo "  systemctl restart ${SERVICE}"
echo "  journalctl -u ${SERVICE} -f"
echo "  cat ${LINK_FILE}"
echo
warn "安全提醒:"
echo "  1) 云安全组务必只放行 ${SSH_PORT}/tcp 与 ${PROXY_PORT}/tcp"
echo "  2) 本脚本【不会】关闭防火墙或放行全部端口（区别于部分一键脚本）"
echo "  3) 请用密钥登录 SSH，并限制 root 密码登录"
echo "  4) 勿把 UUID/链接发到公开群；泄露即等同账号失窃"
echo "  5) 公网代理仅用于合法用途；遵守当地法律与 VPS 服务条款"
echo
green_done(){ info "安装结束。"; }
green_done
