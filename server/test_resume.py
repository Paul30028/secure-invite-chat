import asyncio
import json
import time
import websockets

URI = "ws://localhost:8765"


async def recv_type(ws, wanted_types, timeout=5):
    """持续接收直到拿到目标 type 之一，忽略 server_info/members 等旁路广播消息"""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"等待 {wanted_types} 超时")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        msg = json.loads(raw)
        if msg.get("type") in wanted_types:
            return msg


async def test_basic_flow():
    async with websockets.connect(URI) as ws_a:
        await ws_a.send(json.dumps({
            "type": "create_group", "name": "测试小队",
            "device_id": "device-A", "display_name": "管理员小明"
        }))
        created = await recv_type(ws_a, {"group_created"})
        group_id = created["group_id"]
        invite_code = created["invite_code"]
        admin_token = created["admin_token"]
        print(f"[OK] 建群成功: {group_id}")

        async with websockets.connect(URI) as ws_b:
            await ws_b.send(json.dumps({
                "type": "join_group", "invite_code": invite_code,
                "device_id": "device-B", "display_name": "成员小红"
            }))
            await recv_type(ws_b, {"joined"})
            await recv_type(ws_b, {"history"})
            print("[OK] B加入成功")

        async with websockets.connect(URI) as ws_b2:
            await ws_b2.send(json.dumps({
                "type": "resume_group", "group_id": group_id, "device_id": "device-B"
            }))
            await recv_type(ws_b2, {"resumed"})
            await recv_type(ws_b2, {"history"})
            print("[OK] B断线重连后 resume_group 成功，无需邀请码")

            await ws_a.send(json.dumps({
                "type": "send_message", "group_id": group_id, "device_id": "device-A",
                "msg_type": "text", "ciphertext": "CIPHER_X", "iv": "IV_X",
                "sender_name": "管理员小明"
            }))
            await recv_type(ws_a, {"message"})
            msg_on_b2 = await recv_type(ws_b2, {"message"})
            assert msg_on_b2["ciphertext"] == "CIPHER_X"
            print("[OK] 重连后的连接依然能收到实时广播（resume_group 生效）")

        async with websockets.connect(URI) as ws_x:
            await ws_x.send(json.dumps({
                "type": "resume_group", "group_id": group_id, "device_id": "device-STRANGER"
            }))
            err = await recv_type(ws_x, {"error"})
            assert err["message"] == "not_a_member"
            print("[OK] 非成员 resume_group 被正确拒绝")

        return group_id, invite_code, admin_token


async def test_rate_limit(group_id):
    """验证 send_message 限流生效：短时间内狂发应该在某个点被拒绝"""
    async with websockets.connect(URI) as ws_a:
        await ws_a.send(json.dumps({
            "type": "resume_group", "group_id": group_id, "device_id": "device-A"
        }))
        await recv_type(ws_a, {"resumed"})
        await recv_type(ws_a, {"history"})

        rejected = False
        for i in range(40):  # 桶容量20，超过后必然触发限流
            await ws_a.send(json.dumps({
                "type": "send_message", "group_id": group_id, "device_id": "device-A",
                "msg_type": "text", "ciphertext": f"FLOOD_{i}", "iv": "IV",
                "sender_name": "管理员小明"
            }))
            resp = await recv_type(ws_a, {"message", "error"})
            if resp.get("type") == "error" and resp.get("message") == "rate_limited":
                rejected = True
                print(f"[OK] 第 {i+1} 条消息触发限流（rate_limited），限流生效")
                break
        assert rejected, "发了40条消息都没有被限流，限流没生效！"


async def test_constant_time_admin_check(group_id, admin_token):
    """验证错误/正确的 admin_token 分别被拒绝/通过"""
    async with websockets.connect(URI) as ws:
        await ws.send(json.dumps({
            "type": "regenerate_code", "group_id": group_id, "admin_token": "totally-wrong-token"
        }))
        err = await recv_type(ws, {"error"})
        assert err["message"] == "not_authorized"
        print("[OK] 错误的 admin_token 被正确拒绝")

        await ws.send(json.dumps({
            "type": "regenerate_code", "group_id": group_id, "admin_token": admin_token
        }))
        ok = await recv_type(ws, {"code_regenerated", "error"})
        assert ok["type"] == "code_regenerated"
        print("[OK] 正确的 admin_token 通过校验，邀请码重新生成成功")


async def main():
    group_id, invite_code, admin_token = await test_basic_flow()
    await test_constant_time_admin_check(group_id, admin_token)
    await test_rate_limit(group_id)
    print("\n=== 全部测试通过（含限流 + 权限校验回归）===")


asyncio.run(main())
