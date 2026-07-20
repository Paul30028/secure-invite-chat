"""
后端配置（中国区直连阶段）

环境变量：
  SIC_HOST   监听地址，默认 0.0.0.0（允许局域网手机直连）
  SIC_PORT   端口，默认 8765
  SIC_PUBLIC_URL  可选，仅日志提示，如 ws://x.x.x.x:8765

未来中继：本进程仍可只监听 127.0.0.1，由前面的 TLS 反代转发；
业务协议不变，见客户端 src/lib/protocol.ts。
"""

import os
import socket

HOST = os.environ.get("SIC_HOST", "0.0.0.0")
PORT = int(os.environ.get("SIC_PORT", "8765"))
PUBLIC_URL = os.environ.get("SIC_PUBLIC_URL", "").strip()
MAX_WS_MESSAGE_BYTES = int(os.environ.get("SIC_MAX_WS_MESSAGE_BYTES", str(6 * 1024 * 1024)))
ADVERTISE_LAN_HINTS = os.environ.get("SIC_ADVERTISE_LAN_HINTS", "0") == "1"
# 生产环境设为 1：拒绝无设备公钥或无挑战签名的旧客户端。
REQUIRE_DEVICE_AUTH = os.environ.get("SIC_REQUIRE_DEVICE_AUTH", "0") == "1"

# 浏览器客户端可通过 Origin 约束跨站 WebSocket 连接；原生客户端通常没有
# Origin，因此公开部署应在 TLS 反代层另行限制来源和速率。
_allowed_origins = os.environ.get("SIC_ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [v.strip() for v in _allowed_origins.split(",") if v.strip()] or None


def list_lan_ips() -> list[str]:
    """本机局域网 IPv4，供手机同一 Wi‑Fi 连接（先跑通，暂不要求公网）"""
    ips: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    try:
        # 连外网 UDP 不真正发包，用于取默认路由网卡 IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and ip not in ips:
            ips.insert(0, ip)
    except OSError:
        pass
    return ips


def suggested_ws_urls() -> list[str]:
    return [f"ws://{ip}:{PORT}" for ip in list_lan_ips()]
