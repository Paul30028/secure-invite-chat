"""
后端配置（中国区直连阶段）

环境变量：
  SIC_HOST   监听地址，默认 0.0.0.0（允许局域网手机直连）
  SIC_PORT   端口，默认 8765
  SIC_PUBLIC_URL  可选，仅日志提示，如 ws://x.x.x.x:8765
  SIC_MESSAGE_RATE_PER_MINUTE  每连接每分钟允许的密文消息数，默认 60
  SIC_MESSAGE_RATE_BURST  每连接短时突发消息数，默认 12
  SIC_HISTORY_PAGE_SIZE  每次历史同步的最大消息数，默认 100

未来中继：本进程仍可只监听 127.0.0.1，由前面的 TLS 反代转发；
业务协议不变，见客户端 src/lib/protocol.ts。
"""

import os
import socket


def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


HOST = os.environ.get("SIC_HOST", "0.0.0.0")
PORT = _positive_int_env("SIC_PORT", 8765)
PUBLIC_URL = os.environ.get("SIC_PUBLIC_URL", "").strip()
MAX_WS_MESSAGE_BYTES = _positive_int_env("SIC_MAX_WS_MESSAGE_BYTES", 6 * 1024 * 1024)
# 每连接的密文消息限流。边缘代理仍需承担跨连接/IP 的 DDoS 防护。
MESSAGE_RATE_PER_MINUTE = _positive_int_env("SIC_MESSAGE_RATE_PER_MINUTE", 60)
MESSAGE_RATE_BURST = _positive_int_env("SIC_MESSAGE_RATE_BURST", 12)
HISTORY_PAGE_SIZE = _positive_int_env("SIC_HISTORY_PAGE_SIZE", 100)
ADVERTISE_LAN_HINTS = os.environ.get("SIC_ADVERTISE_LAN_HINTS", "0") == "1"
# 生产环境设为 1：拒绝无设备公钥或无挑战签名的旧客户端。
REQUIRE_DEVICE_AUTH = os.environ.get("SIC_REQUIRE_DEVICE_AUTH", "0") == "1"

# 浏览器客户端可通过 Origin 约束跨站 WebSocket 连接；原生客户端通常没有
# Origin，因此公开部署应在 TLS 反代层另行限制来源和速率。
_allowed_origins = os.environ.get("SIC_ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [v.strip() for v in _allowed_origins.split(",") if v.strip()] or None

# --- 限流参数（令牌桶）---
# 每个 (group_id, device_id) 独立计数，防止单个成员刷屏/刷爆SQLite
RATE_LIMIT_MSG_CAPACITY = int(os.environ.get("SIC_RATE_MSG_CAPACITY", "20"))  # 桶容量（突发上限）
RATE_LIMIT_MSG_REFILL_PER_SEC = float(os.environ.get("SIC_RATE_MSG_REFILL", "2"))  # 每秒回填令牌数
# 建群/加群等低频操作，按连接（ws对象）计数，防止连接建立后疯狂刷 create_group
RATE_LIMIT_ACTION_CAPACITY = int(os.environ.get("SIC_RATE_ACTION_CAPACITY", "10"))
RATE_LIMIT_ACTION_REFILL_PER_SEC = float(os.environ.get("SIC_RATE_ACTION_REFILL", "1"))


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
