"""Small deterministic token bucket used by the relay hot path."""

from __future__ import annotations

import time


class TokenBucket:
    """Allow a bounded average rate while permitting a short initial burst."""

    def __init__(self, *, per_minute: int, burst: int):
        if per_minute <= 0 or burst <= 0:
            raise ValueError("rate and burst must be positive")
        self._per_second = per_minute / 60.0
        self._burst = float(burst)
        self._tokens = float(burst)
        self._last = time.monotonic()

    def allow(self, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else now
        elapsed = max(0.0, current - self._last)
        self._tokens = min(self._burst, self._tokens + elapsed * self._per_second)
        self._last = current
        if self._tokens < 1.0:
            return False
        self._tokens -= 1.0
        return True
