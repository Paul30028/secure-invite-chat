import asyncio
import json
import websockets

URI = "ws://localhost:8765"


async def recv_json(ws):
    raw = await asyncio.wait_for(ws.recv(), timeout=5)
    return json.loads(raw)


async def main():
    async with websockets.connect(URI) as ws_a:
        await ws_a.send(json.dumps({
            "type": "create_group", "name": "测试小队",
            "device_id": "device-A", "display_name": "管理员小明"
        }))
        created = await recv_json(ws_a)
        group_id = created["group_id"]
        invite_code = created["invite_code"]
        print(f"[OK] 建群成功: {group_id}")

        async with websockets.connect(URI) as ws_b:
            await ws_b.send(json.dumps({
                "type": "join_group", "invite_code": invite_code,
                "device_id": "device-B", "display_name": "成员小红"
            }))
            await recv_json(ws_b)  # joined
            await recv_json(ws_b)  # empty history
            print("[OK] B加入成功")

        # 模拟B断线重连（不再持有旧的ws连接，重新连一次新的socket）
        async with websockets.connect(URI) as ws_b2:
            await ws_b2.send(json.dumps({
                "type": "resume_group", "group_id": group_id, "device_id": "device-B"
            }))
            resumed = await recv_json(ws_b2)
            assert resumed["type"] == "resumed", resumed
            hist = await recv_json(ws_b2)
            assert hist["type"] == "history"
            print("[OK] B断线重连后 resume_group 成功，无需邀请码")

            # A 发消息，B（重连后的新连接）应该能实时收到广播
            await ws_a.send(json.dumps({
                "type": "send_message", "group_id": group_id, "device_id": "device-A",
                "msg_type": "text", "ciphertext": "CIPHER_X", "iv": "IV_X",
                "sender_name": "管理员小明"
            }))
            msg_on_a = await recv_json(ws_a)
            msg_on_b2 = await recv_json(ws_b2)
            assert msg_on_b2["ciphertext"] == "CIPHER_X"
            print("[OK] 重连后的连接依然能收到实时广播（resume_group 生效）")

        # 非法设备尝试 resume 一个自己没加入过的群，应该被拒绝
        async with websockets.connect(URI) as ws_x:
            await ws_x.send(json.dumps({
                "type": "resume_group", "group_id": group_id, "device_id": "device-STRANGER"
            }))
            err = await recv_json(ws_x)
            assert err["type"] == "error" and err["message"] == "not_a_member"
            print("[OK] 非成员 resume_group 被正确拒绝")

    print("\n=== 全部测试通过 ===")


asyncio.run(main())
