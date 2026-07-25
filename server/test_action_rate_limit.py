"""验证 create_group/join_group/kick_member 等低频操作的限流是否生效（本次新增回归测试）"""
import asyncio
import json
import time
import websockets

URI = "ws://localhost:8765"


async def recv_type(ws, wanted_types, timeout=5):
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"等待 {wanted_types} 超时")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        msg = json.loads(raw)
        if msg.get("type") in wanted_types:
            return msg


async def main():
    async with websockets.connect(URI) as ws:
        rejected = False
        for i in range(30):  # ACTION_RATE_BURST 默认5，超过后必然触发
            await ws.send(json.dumps({
                "type": "create_group", "name": f"压测群{i}",
                "device_id": f"device-flood-{i}", "display_name": "flooder"
            }))
            resp = await recv_type(ws, {"group_created", "error"})
            if resp.get("type") == "error" and resp.get("message") == "rate_limited":
                rejected = True
                print(f"[OK] 第 {i+1} 次 create_group 触发限流（rate_limited）")
                break
        assert rejected, "连续create_group 30次都没有被限流，action限流没生效！"
    print("=== action级别限流回归测试通过 ===")


asyncio.run(main())
