"""
ratelimit.py - 简单的内存令牌桶限流器

设计说明：
- 单进程内存实现，够用于"小团队自托管单机部署"场景；不支持多进程/多机共享状态
  （如果以后要横向扩展到多进程部署，需要换成 Redis 等外部存储）
- 每个 key（例如 f"{group_id}:{device_id}"）维护一个独立令牌桶：
  capacity = 桶最大容量（允许的突发上限）
  refill_per_sec = 每秒回填的令牌数（长期平均速率上限）
- 每次请求消耗 1 个令牌，桶空了就拒绝，符合"允许短时突发、限制长期速率"的直觉
"""

import time


class TokenBucket:
    def __init__(self, capacity: float, refill_per_sec: float):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_ts)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        tokens, last_ts = self._buckets.get(key, (self.capacity, now))
        # 按经过的时间回填令牌，不超过桶容量
        tokens = min(self.capacity, tokens + (now - last_ts) * self.refill_per_sec)
        if tokens < 1:
            self._buckets[key] = (tokens, now)
            return False
        tokens -= 1
        self._buckets[key] = (tokens, now)
        return True

    def sweep(self, max_idle_sec: float = 3600):
        """定期清理长时间未活动的 key，防止内存无限增长（应用层可选调用）"""
        now = time.monotonic()
        stale = [k for k, (_, ts) in self._buckets.items() if now - ts > max_idle_sec]
        for k in stale:
            del self._buckets[k]
