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
import secrets as secrets_mod

import websockets
from websockets.asyncio.server import serve

try:  # package import for tests; direct import for `python server.py`
    from . import auth, db, protocol
    from .rate_limit import TokenBucket
except ImportError:
    import auth
    import db
    import protocol
    from rate_limit import TokenBucket

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("server")

# group_id -> set of (websocket, device_id)
GROUP_CONNECTIONS: dict[str, set] = {}
CONNECTION_GROUPS: dict[object, set] = {}
# websocket -> 单连接随机挑战；挑战绝不跨连接复用。
CONNECTION_CHALLENGES: dict[object, str] = {}
# websocket -> token bucket; this limits one authenticated transport connection.
MESSAGE_LIMITERS: dict[object, TokenBucket] = {}
FILE_LIMITERS: dict[object, TokenBucket] = {}
FILE_SYNC_LIMITERS: dict[object, TokenBucket] = {}


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


def message_rate_allowed(ws) -> bool:
    import config as cfg

    bucket = MESSAGE_LIMITERS.get(ws)
    if bucket is None:
        bucket = TokenBucket(
            per_minute=cfg.MESSAGE_RATE_PER_MINUTE,
            burst=cfg.MESSAGE_RATE_BURST,
        )
        MESSAGE_LIMITERS[ws] = bucket
    return bucket.allow()


ACTION_LIMITERS: dict[object, TokenBucket] = {}


def action_rate_allowed(ws) -> bool:
    """建群/加群/踢人/重新生成邀请码等低频敏感操作的限流，按连接对象计数"""
    import config as cfg

    bucket = ACTION_LIMITERS.get(ws)
    if bucket is None:
        bucket = TokenBucket(
            per_minute=cfg.ACTION_RATE_PER_MINUTE,
            burst=cfg.ACTION_RATE_BURST,
        )
        ACTION_LIMITERS[ws] = bucket
    return bucket.allow()


def _bucket_allowed(store: dict[object, TokenBucket], ws, per_minute: int, burst: int) -> bool:
    bucket = store.get(ws)
    if bucket is None:
        bucket = TokenBucket(per_minute=per_minute, burst=burst)
        store[ws] = bucket
    return bucket.allow()


def file_rate_allowed(ws) -> bool:
    import config as cfg
    return _bucket_allowed(FILE_LIMITERS, ws, cfg.FILE_RATE_PER_MINUTE, cfg.FILE_RATE_BURST)


def file_sync_rate_allowed(ws) -> bool:
    import config as cfg
    return _bucket_allowed(
        FILE_SYNC_LIMITERS, ws, cfg.FILE_SYNC_RATE_PER_MINUTE, cfg.FILE_SYNC_RATE_BURST
    )


def is_registered(ws, group_id: str, device_id: str) -> bool:
    return (ws, device_id) in GROUP_CONNECTIONS.get(group_id, set())


def is_registered_for_group(ws, group_id: str) -> bool:
    return any(item[0] is ws for item in GROUP_CONNECTIONS.get(group_id, set()))


def has_valid_resume_proof(ws, group_id: str, device_id: str, signature: object) -> bool:
    if not isinstance(signature, str):
        return False
    challenge = CONNECTION_CHALLENGES.get(ws)
    public_key = db.get_member_identity_pub(group_id, device_id)
    if not challenge or not public_key:
        return False
    payload = auth.build_auth_payload(challenge, "resume_group", group_id, device_id)
    return auth.verify_p256_signature(public_key, signature, payload)


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
    CONNECTION_CHALLENGES.pop(ws, None)
    MESSAGE_LIMITERS.pop(ws, None)
    ACTION_LIMITERS.pop(ws, None)
    FILE_LIMITERS.pop(ws, None)
    FILE_SYNC_LIMITERS.pop(ws, None)


def online_device_ids(group_id: str) -> set:
    return {did for _, did in GROUP_CONNECTIONS.get(group_id, set())}


def history_payload(
    group_id: str,
    *,
    before_ts: int | None = None,
    before_id: str | None = None,
) -> dict:
    import config as cfg

    messages, has_more, cursor = db.get_history_page(
        group_id,
        limit=cfg.HISTORY_PAGE_SIZE,
        before_ts=before_ts,
        before_id=before_id,
    )
    payload: dict = {
        "type": "history",
        "group_id": group_id,
        "messages": messages,
        "has_more": has_more,
    }
    if cursor:
        payload["next_before_ts"], payload["next_before_id"] = cursor
    return payload


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
                "ecdh_pub": m.get("ecdh_pub"),
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


async def deliver_pending_keys(group_id: str, device_id: str):
    """Forward stored opaque blobs. The relay deliberately never parses wrapped_blob."""
    for delivery in db.list_pending_key_deliveries(group_id, device_id):
        await send_to_device(group_id, device_id, key_delivery_payload(delivery))


def key_delivery_payload(delivery: dict) -> dict:
    """Map delivery metadata only; wrapped_blob is intentionally copied, never decoded."""
    return {
        "type": "key_delivery", "delivery_id": delivery["id"], "group_id": delivery["group_id"],
        "from_device_id": delivery["sender_device_id"], "key_version": delivery["key_version"],
        "wrapped_blob": delivery["wrapped_blob"],
    }


async def send_error(ws, message: str):
    await ws.send(json.dumps({"type": "error", "message": message}))


async def broadcast_app(payload: dict):
    seen = set()
    for conns in GROUP_CONNECTIONS.values():
        for ws, _ in conns:
            if ws not in seen:
                seen.add(ws)
                try: await ws.send(json.dumps(payload))
                except websockets.ConnectionClosed: pass


def valid_admin(msg: dict):
    group_id = msg.get("group_id"); token = msg.get("admin_token"); group = db.find_group_by_id(group_id) if group_id else None
    return group if group and secrets_mod.compare_digest(group["admin_token"], token or "") else None


async def handle_connection(ws):
    try:
        # 仅在显式开发配置下公布局域网地址，避免公网服务泄露内部网络信息。
        import config as cfg

        CONNECTION_CHALLENGES[ws] = auth.new_challenge()
        await ws.send(json.dumps({"type": "auth_challenge", "challenge": CONNECTION_CHALLENGES[ws]}))
        await ws.send(json.dumps({"type": "daily_notice", **db.get_daily_notice()}))
        await ws.send(json.dumps({"type": "maintenance", "enabled": db.is_maintenance()}))

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

            schema_error = protocol.validate_message(msg)
            if schema_error:
                await send_error(ws, schema_error)
                continue

            mtype = msg.get("type")
            if not isinstance(mtype, str):
                await send_error(ws, "invalid_type")
                continue

            if mtype == "get_daily_notice":
                await ws.send(json.dumps({"type": "daily_notice", **db.get_daily_notice()})); continue

            if mtype == "publish_daily_notice":
                if not valid_admin(msg): await send_error(ws, "not_authorized"); continue
                notice = {field: (msg.get(field) or "").strip() for field in ("dailyDevotion", "hymn", "scripture", "privacyReminder")}
                if not notice["scripture"]: await send_error(ws, "missing_fields"); continue
                db.save_daily_notice(notice); await broadcast_app({"type": "daily_notice", **notice}); continue

            if mtype == "set_maintenance":
                if not valid_admin(msg): await send_error(ws, "not_authorized"); continue
                enabled = msg.get("enabled") is True; db.set_maintenance(enabled); await broadcast_app({"type": "maintenance", "enabled": enabled}); continue

            if mtype == "create_group":
                if not action_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
                    continue
                name = (msg.get("name") or "").strip()
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "Admin"
                identity_pub = msg.get("identity_pub")
                ecdh_pub = msg.get("ecdh_pub")
                if not name or not device_id:
                    await send_error(ws, "name_and_device_id_required")
                    continue
                if not display_name:
                    await send_error(ws, "empty_display_name")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and (not isinstance(identity_pub, str) or not identity_pub):
                    await send_error(ws, "identity_pub_required")
                    continue
                result = db.create_group(
                    name, device_id, display_name, identity_pub if isinstance(identity_pub, str) else None,
                    ecdh_pub if isinstance(ecdh_pub, str) else None,
                )
                await register(result["group_id"], ws, device_id)
                await ws.send(json.dumps({"type": "group_created", **result}))
                await ws.send(json.dumps(members_payload(result["group_id"])))
                log.info(f"群组已创建: {result['group_id']} name={name}")

            elif mtype == "join_group":
                if not action_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
                    continue
                invite_code = msg.get("invite_code")
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "成员"
                identity_pub = msg.get("identity_pub")
                ecdh_pub = msg.get("ecdh_pub")
                if not invite_code or not device_id:
                    await send_error(ws, "invite_code_and_device_id_required")
                    continue
                group = db.find_group_by_invite_code(invite_code)
                if not group:
                    await send_error(ws, "invalid_invite_code")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and (not isinstance(identity_pub, str) or not identity_pub):
                    await send_error(ws, "identity_pub_required")
                    continue
                err = db.add_member(
                    group["id"], device_id, display_name,
                    identity_pub if isinstance(identity_pub, str) else None,
                    ecdh_pub if isinstance(ecdh_pub, str) else None,
                )
                if err:
                    await send_error(ws, err)
                    continue
                await register(group["id"], ws, device_id)
                await ws.send(
                    json.dumps(
                        {"type": "joined", "group_id": group["id"], "name": group["name"]}
                    )
                )
                await ws.send(json.dumps(history_payload(group["id"])))
                await deliver_pending_keys(group["id"], device_id)
                # 全员刷新成员列表
                await broadcast(group["id"], members_payload(group["id"]))
                log.info(f"设备 {device_id} 加入群组 {group['id']}")

            elif mtype == "resume_group":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not device_id or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not has_valid_resume_proof(
                    ws, group_id, device_id, msg.get("auth_sig")
                ):
                    await send_error(ws, "authentication_failed")
                    continue
                await register(group_id, ws, device_id)
                await ws.send(json.dumps({"type": "resumed", "group_id": group_id}))
                await ws.send(json.dumps(history_payload(group_id)))
                await ws.send(json.dumps(members_payload(group_id)))
                await deliver_pending_keys(group_id, device_id)
                # 在线状态变化通知他人
                await broadcast(group_id, members_payload(group_id))
                log.info(f"设备 {device_id} 恢复群组 {group_id}")

            elif mtype == "sync_history":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not db.is_member(group_id, device_id or ""):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                before_ts = msg.get("before_ts")
                before_id = msg.get("before_id")
                if (before_ts is None) != (before_id is None):
                    await send_error(ws, "invalid_history_cursor")
                    continue
                await ws.send(
                    json.dumps(
                        history_payload(
                            group_id,
                            before_ts=before_ts,
                            before_id=before_id,
                        )
                    )
                )

            elif mtype == "list_members":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not device_id or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                await ws.send(json.dumps(members_payload(group_id)))

            elif mtype == "kick_member":
                if not action_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
                    continue
                group_id = msg.get("group_id")
                admin_token = msg.get("admin_token")
                target = msg.get("target_device_id")
                group = db.find_group_by_id(group_id) if group_id else None
                if not group or not secrets_mod.compare_digest(group["admin_token"], admin_token or ""):
                    await send_error(ws, "not_authorized")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered_for_group(ws, group_id):
                    await send_error(ws, "not_authenticated")
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

            elif mtype == "mute_member":
                group_id = msg.get("group_id"); target = msg.get("target_device_id")
                if not valid_admin(msg) or not target: await send_error(ws, "not_authorized"); continue
                if db.is_admin_member(group_id, target): await send_error(ws, "cannot_mute_admin"); continue
                db.set_member_muted(group_id, target, msg.get("muted") is True)
                await broadcast(group_id, {"type": "member_muted", "group_id": group_id, "target_device_id": target, "muted": msg.get("muted") is True})

            elif mtype == "leave_group":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                if not group_id or not device_id or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if not db.invite_is_active(group):
                    await send_error(ws, "invite_expired_or_revoked")
                    continue
                if db.is_admin_member(group_id, device_id):
                    await send_error(ws, "admin_cannot_leave")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                db.remove_member(group_id, device_id)
                await unregister_device_from_group(group_id, device_id)
                await broadcast(group_id, {"type": "member_left", "group_id": group_id, "target_device_id": device_id})
                await broadcast(group_id, members_payload(group_id))

            elif mtype == "deliver_key":
                group_id = msg.get("group_id")
                sender = msg.get("device_id")
                target = msg.get("target_device_id")
                blob = msg.get("wrapped_blob")
                version = msg.get("key_version")
                if not all(isinstance(value, str) and value for value in (group_id, sender, target, blob)) or not isinstance(version, int):
                    await send_error(ws, "missing_fields")
                    continue
                # Only the fixed administrator device coordinates epochs; the blob itself stays opaque.
                if not db.is_member(group_id, sender) or not db.is_member(group_id, target) or not db.is_admin_member(group_id, sender):
                    await send_error(ws, "not_authorized")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, sender):
                    await send_error(ws, "not_authenticated")
                    continue
                delivery = db.save_pending_key_delivery(group_id, target, sender, version, blob)
                await send_to_device(group_id, target, key_delivery_payload(delivery))

            elif mtype == "ack_key_delivery":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                delivery_id = msg.get("delivery_id")
                if not all(isinstance(value, str) and value for value in (group_id, device_id, delivery_id)) or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                db.delete_pending_key_delivery(delivery_id, device_id)

            elif mtype == "call_signal":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                target = msg.get("target_device_id")
                call_id = msg.get("call_id")
                signal = msg.get("signal")
                mode = msg.get("mode")
                valid_signals = {"offer", "answer", "ice", "hangup", "reject"}
                if (
                    not isinstance(group_id, str)
                    or not isinstance(device_id, str)
                    or not isinstance(target, str)
                    or not isinstance(call_id, str)
                    or signal not in valid_signals
                    or mode not in {"audio", "video"}
                ):
                    await send_error(ws, "invalid_call_signal")
                    continue
                if not db.is_member(group_id, device_id) or not db.is_member(group_id, target):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if target not in online_device_ids(group_id):
                    await send_error(ws, "call_target_offline")
                    continue

                sdp = msg.get("sdp")
                candidate = msg.get("candidate")
                if signal in {"offer", "answer"} and not isinstance(sdp, dict):
                    await send_error(ws, "invalid_call_signal")
                    continue
                if signal == "ice" and not isinstance(candidate, dict):
                    await send_error(ws, "invalid_call_signal")
                    continue
                if len(json.dumps({"sdp": sdp, "candidate": candidate})) > 48_000:
                    await send_error(ws, "invalid_call_signal")
                    continue

                await send_to_device(
                    group_id,
                    target,
                    {
                        "type": "call_signal",
                        "group_id": group_id,
                        "call_id": call_id,
                        "from_device_id": device_id,
                        "from_name": msg.get("sender_name") or "成员",
                        "signal": signal,
                        "mode": mode,
                        **({"sdp": sdp} if isinstance(sdp, dict) else {}),
                        **({"candidate": candidate} if isinstance(candidate, dict) else {}),
                    },
                )

            elif mtype == "send_message":
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                ciphertext = msg.get("ciphertext")
                iv = msg.get("iv")
                msg_type = msg.get("msg_type", "text")
                key_version = msg.get("key_version", 1)
                sender_name = msg.get("sender_name") or "未知"

                if db.is_maintenance() and not db.is_admin_member(group_id, device_id):
                    await send_error(ws, "maintenance_mode")
                    continue
                if db.is_member_muted(group_id, device_id):
                    await send_error(ws, "member_muted")
                    continue
                if not (group_id and device_id and ciphertext and iv):
                    await send_error(ws, "missing_fields")
                    continue
                if not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if not message_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
                    continue

                saved = db.save_message(
                    group_id, device_id, sender_name, msg_type, ciphertext, iv, key_version
                )
                await broadcast(group_id, {"type": "message", **saved})

            elif mtype == "file_chunk":
                # Chunks are opaque E2EE bytes. The server only validates routing
                # metadata and never decodes ciphertext, IV, hash, or file contents.
                group_id = msg.get("group_id")
                device_id = msg.get("device_id")
                file_id = msg.get("file_id")
                chunk_index = msg.get("chunk_index")
                total_chunks = msg.get("total_chunks")
                ciphertext = msg.get("ciphertext")
                iv = msg.get("iv")
                key_version = msg.get("key_version", 1)
                sender_name = msg.get("sender_name") or "成员"
                if db.is_maintenance() and not db.is_admin_member(group_id, device_id):
                    await send_error(ws, "maintenance_mode")
                    continue
                if db.is_member_muted(group_id, device_id):
                    await send_error(ws, "member_muted")
                    continue
                if (not all(isinstance(value, str) and value for value in (group_id, device_id, file_id, ciphertext, iv))
                        or not isinstance(chunk_index, int) or not isinstance(total_chunks, int)
                        or isinstance(chunk_index, bool) or isinstance(total_chunks, bool)
                        or not isinstance(key_version, int) or isinstance(key_version, bool)
                        or chunk_index < 0 or total_chunks <= 0 or chunk_index >= total_chunks
                        or total_chunks > cfg.MAX_FILE_CHUNKS or len(file_id) > cfg.MAX_FILE_ID_CHARS):
                    await send_error(ws, "invalid_file_chunk")
                    continue
                if not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if len(ciphertext) > cfg.MAX_FILE_CHUNK_B64:
                    await send_error(ws, "file_chunk_too_large")
                    continue
                if not file_rate_allowed(ws):
                    await send_error(ws, "file_rate_limited")
                    continue
                if chunk_index == 0:
                    db.delete_expired_file_chunks(
                        int(__import__("time").time() * 1000)
                        - cfg.FILE_CHUNK_RETENTION_SECONDS * 1000
                    )
                existing = db.get_file_chunk_metadata(group_id, file_id)
                if existing and (
                    existing["sender_device_id"] != device_id
                    or existing["total_chunks"] != total_chunks
                    or existing["key_version"] != key_version
                ):
                    await send_error(ws, "file_metadata_mismatch")
                    continue
                projected = len(ciphertext) + len(iv)
                if (
                    db.file_storage_chars(group_id) + projected > cfg.MAX_GROUP_FILE_STORAGE_B64
                    or db.file_storage_chars(group_id, device_id) + projected > cfg.MAX_DEVICE_FILE_STORAGE_B64
                ):
                    await send_error(ws, "file_storage_quota_exceeded")
                    continue
                saved = db.save_file_chunk(group_id, device_id, sender_name, file_id, chunk_index, total_chunks, ciphertext, iv, key_version)
                await broadcast(group_id, {"type": "file_chunk", **saved})

            elif mtype == "file_chunk_status":
                group_id = msg.get("group_id"); device_id = msg.get("device_id"); file_id = msg.get("file_id")
                if not all(isinstance(value, str) and value for value in (group_id, device_id, file_id)) or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if not file_sync_rate_allowed(ws):
                    await send_error(ws, "file_sync_rate_limited")
                    continue
                await ws.send(json.dumps({"type": "file_chunk_status", "group_id": group_id, "file_id": file_id, "received_indexes": db.file_chunk_indexes(group_id, file_id)}))

            elif mtype == "sync_file_chunks":
                group_id = msg.get("group_id"); device_id = msg.get("device_id"); file_id = msg.get("file_id")
                indexes = msg.get("missing_indexes")
                if not all(isinstance(value, str) and value for value in (group_id, device_id, file_id)) or not db.is_member(group_id, device_id):
                    await send_error(ws, "not_a_member")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if not file_sync_rate_allowed(ws):
                    await send_error(ws, "file_sync_rate_limited")
                    continue
                if indexes is not None and (
                    not isinstance(indexes, list)
                    or len(indexes) > cfg.MAX_FILE_SYNC_INDEXES
                    or not all(isinstance(i, int) and not isinstance(i, bool) and i >= 0 for i in indexes)
                ):
                    await send_error(ws, "invalid_missing_indexes")
                    continue
                requested = indexes
                for chunk in db.list_file_chunks(group_id, file_id, requested):
                    await ws.send(json.dumps({"type": "file_chunk", **chunk}))

            elif mtype == "regenerate_code":
                if not action_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
                    continue
                group_id = msg.get("group_id")
                admin_token = msg.get("admin_token")
                group = db.find_group_by_id(group_id) if group_id else None
                if not group or not secrets_mod.compare_digest(group["admin_token"], admin_token or ""):
                    await send_error(ws, "not_authorized")
                    continue
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered_for_group(ws, group_id):
                    await send_error(ws, "not_authenticated")
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

            elif mtype == "set_invite_expiry":
                group_id = msg.get("group_id"); admin_token = msg.get("admin_token"); group = db.find_group_by_id(group_id) if group_id else None
                if not group or not secrets_mod.compare_digest(group["admin_token"], admin_token or ""):
                    await send_error(ws, "not_authorized"); continue
                expires_at = msg.get("expires_at")
                if expires_at is not None and (not isinstance(expires_at, int) or expires_at < 0):
                    await send_error(ws, "invalid_field_type"); continue
                db.set_invite_expiry(group_id, expires_at)
                await ws.send(json.dumps({"type": "invite_settings", "group_id": group_id, "expires_at": expires_at, "revoked": False}))

            elif mtype == "revoke_invite":
                group_id = msg.get("group_id"); admin_token = msg.get("admin_token"); group = db.find_group_by_id(group_id) if group_id else None
                if not group or not secrets_mod.compare_digest(group["admin_token"], admin_token or ""):
                    await send_error(ws, "not_authorized"); continue
                db.revoke_invite(group_id)
                await ws.send(json.dumps({"type": "invite_settings", "group_id": group_id, "revoked": True}))

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
