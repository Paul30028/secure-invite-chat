"""
server.py - 邀群密聊 WebSocket 后端（中国区直连）

安全模型：
- 只转发/存储密文；无密钥
- invite_code / admin_token 为入群与管理凭证，非加密密钥
- list_members 只返回昵称/设备 ID/是否在线，无密钥材料

客户端 -> 服务器:
  create_group / join_group / resume_group / sync_history
  send_message / regenerate_code
  list_members {group_id, device_id}
  kick_member  {group_id, admin_token, target_device_id}

服务器 -> 客户端:
  group_created / joined / resumed / history / message
  code_regenerated / members / member_kicked / kicked / error
"""

import asyncio
import json
import logging

import websockets
from websockets.asyncio.server import serve

import db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("server")

# group_id -> set of (websocket, device_id)
GROUP_CONNECTIONS: dict[str, set] = {}
CONNECTION_GROUPS: dict[object, set] = {}


async def register(group_id: str, ws, device_id: str):
    GROUP_CONNECTIONS.setdefault(group_id, set()).add((ws, device_id))
    CONNECTION_GROUPS.setdefault(ws, set()).add(group_id)


async def unregister_device_from_group(group_id: str, device_id: str):
    """踢人时断开该设备在本群的连接"""
    conns = GROUP_CONNECTIONS.get(group_id)
    if not conns:
        return
    to_remove = [item for item in list(conns) if item[1] == device_id]
    for item in to_remove:
        conns.discard(item)
        ws = item[0]
        groups = CONNECTION_GROUPS.get(ws)
        if groups:
            groups.discard(group_id)
    if conns is not None and not conns:
        del GROUP_CONNECTIONS[group_id]


async def unregister_all(ws):
    for group_id in CONNECTION_GROUPS.get(ws, set()):
        conns = GROUP_CONNECTIONS.get(group_id)
        if conns:
            to_remove = [item for item in conns if item[0] is ws]
            for item in to_remove:
                conns.discard(item)
            if not conns:
                del GROUP_CONNECTIONS[group_id]
    CONNECTION_GROUPS.pop(ws, None)


def online_device_ids(group_id: str) -> set:
    return {did for _, did in GROUP_CONNECTIONS.get(group_id, set())}


def members_payload(group_id: str) -> dict:
    online = online_device_ids(group_id)
    members = []
    for m in db.list_members(group_id):
        members.append(
            {
                "device_id": m["device_id"],
                "display_name": m["display_name"],
                "joined_at": m["joined_at"],
                "is_admin": bool(m.get("is_admin")),
                "online": m["device_id"] in online,
            }
        )
    return {"type": "members", "group_id": group_id, "members": members}


async def broadcast(group_id: str, payload: dict):
    conns = GROUP_CONNECTIONS.get(group_id, set())
    dead = []
    data = json.dumps(payload)
    for ws, device_id in list(conns):
        try:
            await ws.send(data)
        except websockets.ConnectionClosed:
            dead.append((ws, device_id))
    for item in dead:
        conns.discard(item)


async def send_to_device(group_id: str, device_id: str, payload: dict):
    data = json.dumps(payload)
    for ws, did in list(GROUP_CONNECTIONS.get(group_id, set())):
        if did != device_id:
            continue
        try:
            await ws.send(data)
        except websockets.ConnectionClosed:
            pass


async def send_error(ws, message: str):
    await ws.send(json.dumps({"type": "error", "message": message}))


async def handle_connection(ws):
    try:
        # 仅在显式开发配置下公布局域网地址，避免公网服务泄露内部网络信息。
        import config as cfg

        try:
            if not cfg.ADVERTISE_LAN_HINTS:
                raise RuntimeError("LAN hints disabled")
            await ws.send(
                json.dumps(
                    {
                        "type": "server_info",
                        "port": cfg.PORT,
                        "suggested_urls": cfg.suggested_ws_urls(),
                        "hint": "手机请与电脑同一 Wi-Fi，填 suggested_urls 之一",
                    }
                )
            )
        except Exception:
            pass

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await send_error(ws, "invalid_json")
                continue

            if not isinstance(msg, dict):
                await send_error(ws, "invalid_message")
                continue

            mtype = msg.get("type")
            if not isinstance(mtype, str) or len(mtype) > 64:
                await send_error(ws, "invalid_type")
                continue

            if mtype == "create_group":
                name = (msg.get("name") or "").strip()
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "Admin"
                if not name or not device_id:
                    await send_error(ws, "name_and_device_id_required")
                    continue
                if not display_name:
                    await send_error(ws, "empty_display_name")
                    continue
                result = db.create_group(name, device_id, display_name)
                await register(result["group_id"], ws, device_id)
                await ws.send(json.dumps({"type": "group_created", **result}))
                await ws.send(json.dumps(members_payload(result["group_id"])))
                log.info(f"群组已创建: {result['group_id']} name={name}")

            elif mtype == "join_group":
                invite_code = msg.get("invite_code")
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "成员"
                if not invite_code or not device_id:
                    await send_error(ws, "invite_code_and_device_id_required")
                    continue
                group = db.find_group_by_invite_code(invite_code)
                if not group:
                    await send_error(ws, "invalid_invite_code")
                    continue
                err = db.add_member(group["id"], device_id, display_name)
                if err:
                    await send_error(ws, err)
                    continue
                await register(group["id"], ws, device_id)
                await ws.send(
                    json.dumps(
                        {"type": "joined", "group_id": group["id"], "name": group["name"]}
                    )
                )
                history = db.get_history(group["id"])
                await ws.send(
                    json.dumps({"type": "history", "group_id": group["id"], "messages": history})
                )
                # 全员刷新成员列表
                await broadcast(group["id"], members_payload(group["id"]))
                log.info(f"设备 {device_id} 加入群组 {group['id']}")

            elif mtype == "resume_group":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not device_id or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                await register(group_id, ws, device_id)
                await ws.send(json.dumps({"type": "resumed", "group_id": group_id}))
                history = db.get_history(group_id)
                await ws.send(
                    json.dumps({"type": "history", "group_id": group_id, "messages": history})
                )
                await ws.send(json.dumps(members_payload(group_id)))
                # 在线状态变化通知他人
                await broadcast(group_id, members_payload(group_id))
                log.info(f"设备 {device_id} 恢复群组 {group_id}")

            elif mtype == "sync_history":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not db.is_member(group_id, device_id or ""):
                    await send_error(ws, "not_a_member")
                    continue
                history = db.get_history(group_id)
                await ws.send(
                    json.dumps({"type": "history", "group_id": group_id, "messages": history})
                )

            elif mtype == "list_members":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not device_id or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                await ws.send(json.dumps(members_payload(group_id)))

            elif mtype == "kick_member":
                group_id = msg.get("group_id")
                admin_token = msg.get("admin_token")
                target = msg.get("target_device_id")
                group = db.find_group_by_id(group_id) if group_id else None
                if not group or group["admin_token"] != admin_token:
                    await send_error(ws, "not_authorized")
                    continue
                if not target:
                    await send_error(ws, "missing_fields")
                    continue
                if db.is_admin_member(group_id, target):
                    await send_error(ws, "cannot_kick_admin")
                    continue
                if not db.remove_member(group_id, target):
                    await send_error(ws, "member_not_found")
                    continue
                # 通知被踢者
                await send_to_device(
                    group_id,
                    target,
                    {"type": "kicked", "group_id": group_id, "reason": "kicked_by_admin"},
                )
                await unregister_device_from_group(group_id, target)
                # 通知其余成员
                await broadcast(
                    group_id,
                    {
                        "type": "member_kicked",
                        "group_id": group_id,
                        "target_device_id": target,
                    },
                )
                await broadcast(group_id, members_payload(group_id))
                log.info(f"群 {group_id} 踢出设备 {target}")

            elif mtype == "send_message":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                ciphertext = msg.get("ciphertext")
                iv = msg.get("iv")
                msg_type = msg.get("msg_type", "text")
                sender_name = msg.get("sender_name") or "未知"

                if not (group_id and device_id and ciphertext and iv):
                    await send_error(ws, "missing_fields")
                    continue
                if not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue

                saved = db.save_message(
                    group_id, device_id, sender_name, msg_type, ciphertext, iv
                )
                await broadcast(group_id, {"type": "message", **saved})

            elif mtype == "regenerate_code":
                group_id = msg.get("group_id")
                admin_token = msg.get("admin_token")
                group = db.find_group_by_id(group_id) if group_id else None
                if not group or group["admin_token"] != admin_token:
                    await send_error(ws, "not_authorized")
                    continue
                new_code = db.regenerate_invite_code(group_id)
                await ws.send(
                    json.dumps(
                        {
                            "type": "code_regenerated",
                            "group_id": group_id,
                            "invite_code": new_code,
                        }
                    )
                )
                log.info(f"群组 {group_id} 邀请码已重新生成")

            else:
                await send_error(ws, f"unknown_type:{mtype}")

    except websockets.ConnectionClosed:
        pass
    finally:
        # 断开前记录所属群，离线后刷新在线状态
        groups = list(CONNECTION_GROUPS.get(ws, set()))
        await unregister_all(ws)
        for gid in groups:
            try:
                await broadcast(gid, members_payload(gid))
            except Exception:
                pass


async def main():
    import config as cfg

    db.init_db()
    log.info("=== 邀群密聊 · 先跑通（同 Wi-Fi 直连）===")
    log.info(f"WebSocket 监听: ws://{cfg.HOST}:{cfg.PORT}")
    urls = cfg.suggested_ws_urls()
    if urls:
        log.info("手机请连同一 Wi-Fi，在 App 里填下面地址之一：")
        for u in urls:
            log.info("  → %s", u)
    else:
        log.info("手机填: ws://<电脑局域网IP>:%s  （电脑运行 ipconfig 查看）", cfg.PORT)
    log.info("公网/流量接入：最后再设计，当前不强制")
    async with serve(
        handle_connection,
        cfg.HOST,
        cfg.PORT,
        max_size=cfg.MAX_WS_MESSAGE_BYTES,
        max_queue=16,
        ping_interval=20,
        ping_timeout=20,
        compression=None,
        origins=cfg.ALLOWED_ORIGINS,
    ):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
