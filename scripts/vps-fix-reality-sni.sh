#!/usr/bin/env bash
# 修复已安装的 sing-box-secure：把 Reality SNI 从 microsoft 改为 cloudflare
# 用法（VPS root）：
#   bash <(wget -qO- https://raw.githubusercontent.com/Paul30028/secure-invite-chat/main/scripts/vps-fix-reality-sni.sh)
set -euo pipefail

CFG=/etc/s-box-secure/config.json
BIN=/etc/s-box-secure/sing-box
LINK_FILE=/etc/s-box-secure/client-link.txt
SERVICE=sing-box-secure
NEW_SNI="${REALITY_SNI:-www.cloudflare.com}"

[[ $EUID -eq 0 ]] || { echo "需要 root"; exit 1; }
[[ -f $CFG ]] || { echo "未找到 $CFG，请先安装"; exit 1; }
[[ -x $BIN ]] || { echo "未找到 $BIN"; exit 1; }

cp -a "$CFG" "${CFG}.bak.$(date +%s)"
# 常见过大证书域名 → 新 SNI
sed -i \
  -e "s/www\\.microsoft\\.com/${NEW_SNI//\//\\/}/g" \
  -e "s/microsoft\\.com/${NEW_SNI//\//\\/}/g" \
  "$CFG"

"$BIN" check -c "$CFG"
systemctl restart "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE" || {
  journalctl -u "$SERVICE" -n 30 --no-pager
  exit 1
}

# 从配置提取参数，重写客户端链接
UUID=$(jq -r '.inbounds[0].users[0].uuid' "$CFG")
PORT=$(jq -r '.inbounds[0].listen_port' "$CFG")
SNI=$(jq -r '.inbounds[0].tls.server_name' "$CFG")
SID=$(jq -r '.inbounds[0].tls.reality.short_id[0]' "$CFG")
# 公钥不在 config 里，从旧 link 文件抠，或要求用户保留
PBK=""
if [[ -f $LINK_FILE ]]; then
  PBK=$(grep -oE 'pbk=[^&]+' "$LINK_FILE" | head -1 | cut -d= -f2 || true)
fi
IPV4=$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)
HOST="${IPV4:-你的VPS公网IP}"

echo "======== 已切换 SNI = ${SNI} ========"
echo "服务状态: $(systemctl is-active $SERVICE)"
if [[ -n "$PBK" && -n "$UUID" && -n "$PORT" ]]; then
  LINK="vless://${UUID}@${HOST}:${PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${SNI}&fp=chrome&pbk=${PBK}&sid=${SID}&type=tcp&headerType=none#vps-reality"
  echo "$LINK" | tee /etc/s-box-secure/client-link-fixed.txt
  echo
  echo "请用上面【新链接】导入客户端（不要用旧的 microsoft 链接）"
else
  echo "请手动把客户端 sni 改为: ${SNI}"
  echo "并确认 pbk/sid/uuid/端口与安装时一致"
fi
echo
echo "验证日志（再连一次客户端后应不再刷 invalid connection）："
echo "  journalctl -u $SERVICE -f"
