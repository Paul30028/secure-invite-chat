#!/usr/bin/env bash
# =============================================================================
#  VPS 安全一键安装 · Sing-box (VLESS Reality 单协议)
#  适用：Ubuntu 20.04/22.04/24.04 · Debian 11/12 · root
#
#  一键（VPS root）：
#    bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
#    bash <(curl -fsSL https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-secure-singbox-install.sh)
#
#  可选环境变量：
#    SSH_PORT=22
#    PROXY_PORT=0          # 0=自动随机
#    REALITY_SNI=www.microsoft.com
#    SKIP_HARDEN=0
#    SINGBOX_VERSION=      # 空=自动取最新
# =============================================================================
set -euo pipefail

export LANG=C.UTF-8
export DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; NC='\033[0m'
info(){ echo -e "${GRN}[INFO]${NC} $*"; }
warn(){ echo -e "${YLW}[WARN]${NC} $*"; }
err(){ echo -e "${RED}[ERR ]${NC} $*" >&2; exit 1; }

[[ ${EUID:-} -eq 0 ]] || err "请用 root 运行（sudo -i 后再执行）"

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

# ---------- 架构 ----------
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) err "不支持架构: $(uname -m)，仅支持 amd64 / arm64" ;;
esac

if command -v apt-get >/dev/null 2>&1; then
  PKG=apt
elif command -v dnf >/dev/null 2>&1; then
  PKG=dnf
elif command -v yum >/dev/null 2>&1; then
  PKG=yum
else
  err "需要 Ubuntu/Debian（apt）或 CentOS/RHEL（yum/dnf）"
fi

# ---------- 依赖（可选包失败不中断） ----------
info "安装基础依赖…"
if [[ $PKG == apt ]]; then
  apt-get update -y -qq || warn "apt update 部分源失败，继续尝试安装"
  apt-get install -y -qq curl wget ca-certificates jq openssl iproute2 ca-certificates 2>/dev/null || true
  # 可选：失败不退出
  apt-get install -y -qq ufw 2>/dev/null || warn "ufw 安装失败，将尝试 iptables"
  apt-get install -y -qq fail2ban 2>/dev/null || warn "fail2ban 跳过"
  apt-get install -y -qq qrencode 2>/dev/null || warn "qrencode 跳过（不影响安装）"
else
  $PKG install -y curl wget ca-certificates jq openssl iproute2 2>/dev/null || true
  $PKG install -y firewalld fail2ban qrencode 2>/dev/null || true
fi

command -v curl >/dev/null || err "缺少 curl"
command -v openssl >/dev/null || err "缺少 openssl"
command -v jq >/dev/null || err "缺少 jq（请检查网络/软件源后重试）"

# ---------- 加固（失败不中断） ----------
if [[ "$SKIP_HARDEN" != "1" ]]; then
  info "基础安全加固…"
  cat >/etc/sysctl.d/99-sbox-secure.conf <<'SYS' || true
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
  if grep -qE '^PermitRootLogin yes' /etc/ssh/sshd_config 2>/dev/null; then
    warn "SSH 允许 root 密码登录。建议改用密钥并设置 PermitRootLogin prohibit-password"
  fi
fi

# ---------- 选端口 ----------
port_in_use() {
  local p=$1
  if command -v ss >/dev/null 2>&1; then
    ss -lntu 2>/dev/null | awk '{print $5}' | grep -qE "[:.]${p}$" && return 0
    return 1
  fi
  return 1
}

if [[ "$PROXY_PORT" == "0" || -z "$PROXY_PORT" ]]; then
  for _ in $(seq 1 100); do
    PROXY_PORT=$((20000 + RANDOM % 40000))
    # 避开常见 SSH 改端口误选
    [[ "$PROXY_PORT" -eq "$SSH_PORT" ]] && continue
    port_in_use "$PROXY_PORT" || break
  done
fi
[[ "$PROXY_PORT" =~ ^[0-9]+$ ]] || err "PROXY_PORT 非法: $PROXY_PORT"
[[ "$PROXY_PORT" -eq "$SSH_PORT" ]] && err "代理端口不能与 SSH 端口相同 ($SSH_PORT)"
port_in_use "$PROXY_PORT" && err "端口 $PROXY_PORT 已被占用，请: PROXY_PORT=xxxxx bash ..."

info "代理端口=${PROXY_PORT} | SSH端口=${SSH_PORT}（请确认你当前就是用这个 SSH 端口登录的）"

# ---------- 防火墙：绝不 reset 清空规则（避免锁死 SSH） ----------
info "配置防火墙（只追加放行，不执行 ufw reset）…"
if command -v ufw >/dev/null 2>&1; then
  ufw default deny incoming >/dev/null 2>&1 || true
  ufw default allow outgoing >/dev/null 2>&1 || true
  ufw allow "${SSH_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow "${PROXY_PORT}/tcp" >/dev/null 2>&1 || true
  # 若 ufw 未启用则启用；已启用则只加规则
  if ! ufw status 2>/dev/null | grep -qi "Status: active"; then
    echo "y" | ufw enable >/dev/null 2>&1 || warn "ufw enable 失败，请手动检查"
  fi
  ufw status | head -n 20 || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  systemctl enable --now firewalld >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port="${SSH_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port="${PROXY_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
else
  iptables -C INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT
  iptables -C INPUT -p tcp --dport "$PROXY_PORT" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$PROXY_PORT" -j ACCEPT
  warn "无 ufw/firewalld，已用 iptables 放行；请同步云安全组"
fi
warn "云厂商安全组务必放行: TCP ${SSH_PORT} 与 TCP ${PROXY_PORT}"

# ---------- 解析版本 + 下载（多镜像回退） ----------
mkdir -p "$INSTALL_DIR"
cd /tmp
rm -f sing-box-*.tar.gz 2>/dev/null || true

get_latest_tag() {
  local tag=""
  # 1) GitHub API
  tag=$(curl -fsSL --max-time 15 https://api.github.com/repos/SagerNet/sing-box/releases/latest 2>/dev/null \
    | jq -r '.tag_name // empty' 2>/dev/null | sed 's/^v//') || true
  if [[ -n "$tag" && "$tag" != "null" ]]; then
    echo "$tag"
    return 0
  fi
  # 2) 跟随 latest 重定向
  tag=$(curl -fsSLI --max-time 15 https://github.com/SagerNet/sing-box/releases/latest 2>/dev/null \
    | tr -d '\r' | awk -F/ '/^location:/I {print $NF; exit}' | sed 's/^v//') || true
  if [[ -n "$tag" ]]; then
    echo "$tag"
    return 0
  fi
  return 1
}

if [[ -z "$SINGBOX_VERSION" ]]; then
  info "获取 sing-box 最新版本…"
  SINGBOX_VERSION=$(get_latest_tag) || SINGBOX_VERSION="1.13.14"
  info "使用版本: v${SINGBOX_VERSION}"
fi

TGZ="sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz"
URLS=(
  "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/${TGZ}"
  "https://ghproxy.net/https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/${TGZ}"
  "https://mirror.ghproxy.com/https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/${TGZ}"
)

DOWNLOAD_OK=0
for u in "${URLS[@]}"; do
  info "下载: $u"
  if curl -fL --retry 3 --connect-timeout 15 --max-time 300 -o "$TGZ" "$u"; then
    # 粗检：gzip 魔数
    if gzip -t "$TGZ" 2>/dev/null; then
      DOWNLOAD_OK=1
      break
    fi
    warn "文件损坏，换源重试…"
    rm -f "$TGZ"
  else
    warn "下载失败，换源…"
    rm -f "$TGZ"
  fi
done
[[ $DOWNLOAD_OK -eq 1 ]] || err "无法下载 sing-box（VPS 需能访问 GitHub 或镜像）"

# 可选：用 GitHub API 返回的 digest 校验
EXPECTED_SHA=$(curl -fsSL --max-time 15 \
  "https://api.github.com/repos/SagerNet/sing-box/releases/tags/v${SINGBOX_VERSION}" 2>/dev/null \
  | jq -r --arg n "$TGZ" '.assets[]? | select(.name==$n) | .digest // empty' 2>/dev/null \
  | sed 's/^sha256://') || true
if [[ -n "$EXPECTED_SHA" ]]; then
  ACTUAL_SHA=$(sha256sum "$TGZ" | awk '{print $1}')
  if [[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]]; then
    info "SHA256 校验通过"
  else
    err "SHA256 不匹配（可能被劫持）。actual=$ACTUAL_SHA expected=$EXPECTED_SHA"
  fi
else
  warn "无官方 digest 可校验，已跳过 SHA256（文件已通过 gzip 完整性检查）"
fi

tar xzf "$TGZ"
# 目录名有时带后缀，用 find
SB_EXTRACT=$(find . -maxdepth 2 -type f -name sing-box -path "./sing-box-*" 2>/dev/null | head -n1)
[[ -n "$SB_EXTRACT" && -f "$SB_EXTRACT" ]] || err "解压后找不到 sing-box 二进制"
install -m 755 "$SB_EXTRACT" "$BIN"
rm -rf sing-box-${SINGBOX_VERSION}-linux-${ARCH}* "$TGZ" 2>/dev/null || true
"$BIN" version || err "二进制无法运行"

# ---------- 密钥 ----------
UUID=$("$BIN" generate uuid)
KEYPAIR=$("$BIN" generate reality-keypair 2>/dev/null || true)
# 兼容 PrivateKey: / Private key: 等格式
PRIVATE_KEY=$(printf '%s\n' "$KEYPAIR" | sed -n 's/.*[Pp]rivate[Kk]ey:[[:space:]]*//p' | head -n1 | tr -d '\r')
PUBLIC_KEY=$(printf '%s\n' "$KEYPAIR" | sed -n 's/.*[Pp]ublic[Kk]ey:[[:space:]]*//p' | head -n1 | tr -d '\r')
# 再兼容 awk
if [[ -z "$PRIVATE_KEY" || -z "$PUBLIC_KEY" ]]; then
  PRIVATE_KEY=$(printf '%s\n' "$KEYPAIR" | awk -F': *' '/[Pp]rivate/{print $2; exit}' | tr -d '\r')
  PUBLIC_KEY=$(printf '%s\n' "$KEYPAIR" | awk -F': *' '/[Pp]ublic/{print $2; exit}' | tr -d '\r')
fi
SHORT_ID=$(openssl rand -hex 8)

[[ -n "$UUID" && -n "$PRIVATE_KEY" && -n "$PUBLIC_KEY" ]] || {
  echo "keypair raw: $KEYPAIR"
  err "密钥生成失败"
}

# ---------- 写配置 + 语法检查 ----------
# 先写临时文件再 check，通过后替换
TMP_CFG=$(mktemp)
cat >"$TMP_CFG" <<EOF
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
      }
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

if ! "$BIN" check -c "$TMP_CFG"; then
  cat "$TMP_CFG"
  rm -f "$TMP_CFG"
  err "配置文件校验失败"
fi
install -m 600 "$TMP_CFG" "$CFG"
rm -f "$TMP_CFG"

# ---------- systemd（避免过严 Protect 导致启动失败） ----------
cat >/etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=Sing-box Secure (VLESS Reality)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=${BIN} run -c ${CFG}
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null 2>&1 || true
systemctl restart "${SERVICE}"
sleep 2

if ! systemctl is-active --quiet "${SERVICE}"; then
  warn "服务未 active，日志如下："
  journalctl -u "${SERVICE}" -n 40 --no-pager || true
  err "sing-box 启动失败，请根据日志排查"
fi
info "服务 ${SERVICE} 已运行"

# 确认端口在听
if command -v ss >/dev/null 2>&1; then
  if ss -lnt | grep -qE "[:.]${PROXY_PORT}\\b"; then
    info "端口 ${PROXY_PORT}/tcp 监听正常"
  else
    warn "未检测到 ${PROXY_PORT} 监听，请: ss -lntp | grep ${PROXY_PORT}"
  fi
fi

# ---------- 输出链接 ----------
IPV4=$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null \
  || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)
IPV6=$(curl -6 -fsS --max-time 8 https://api64.ipify.org 2>/dev/null || true)
HOST_IP="${IPV4:-}"
if [[ -z "$HOST_IP" && -n "$IPV6" ]]; then
  HOST_IP="[$IPV6]"
fi
[[ -n "$HOST_IP" ]] || HOST_IP="你的VPS公网IP"

# URL 编码 fragment 不需要；sni 一般无特殊字符
LINK="vless://${UUID}@${HOST_IP}:${PROXY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${REALITY_SNI}&fp=chrome&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&type=tcp&headerType=none#vps-reality"

{
  echo "=== Sing-box Secure 安装完成 $(date -Iseconds 2>/dev/null || date) ==="
  echo "UUID:       $UUID"
  echo "Port:       $PROXY_PORT"
  echo "SNI:        $REALITY_SNI"
  echo "PublicKey:  $PUBLIC_KEY"
  echo "ShortID:    $SHORT_ID"
  echo "SSH_PORT:   $SSH_PORT"
  echo "Host:       $HOST_IP"
  echo ""
  echo "客户端链接:"
  echo "$LINK"
  echo ""
  echo "配置: $CFG"
  echo "服务: systemctl status $SERVICE"
} | tee "$LINK_FILE"
chmod 600 "$LINK_FILE"

echo
info "================ 客户端链接（请保存） ================"
echo -e "${YLW}${LINK}${NC}"
echo
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$LINK" 2>/dev/null || true
fi
echo
info "已保存: $LINK_FILE"
info "常用命令:"
echo "  systemctl status ${SERVICE}"
echo "  systemctl restart ${SERVICE}"
echo "  journalctl -u ${SERVICE} -f"
echo "  cat ${LINK_FILE}"
echo
warn "请确认云安全组已放行 TCP ${SSH_PORT} 与 TCP ${PROXY_PORT}"
info "安装结束。"
