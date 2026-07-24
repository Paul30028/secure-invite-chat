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
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import websockets
from websockets.asyncio.server import serve

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


async def send_error(ws, message: str):
    await ws.send(json.dumps({"type": "error", "message": message}))


NOTICE_CATEGORIES = ("devotion", "hymn", "verse")
NOTICE_FILE = Path(__file__).resolve().parent / "public" / "daily-notices.json"


def normalize_notice_entry(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("invalid_notice_payload")

    limits = {"title": 160, "summary": 400, "body": 6000, "reference": 400}
    entry: dict[str, str] = {}
    for key, limit in limits.items():
        raw = value.get(key)
        if not isinstance(raw, str) or not raw.strip() or len(raw.strip()) > limit:
            raise ValueError("invalid_notice_payload")
        entry[key] = raw.strip()

    for key in ("audio_url", "audio_title"):
        raw = value.get(key, "")
        if raw is None:
            raw = ""
        if not isinstance(raw, str) or len(raw.strip()) > 2048:
            raise ValueError("invalid_notice_payload")
        cleaned = raw.strip()
        if key == "audio_url" and cleaned and not cleaned.startswith("https://"):
            raise ValueError("invalid_notice_audio_url")
        if cleaned:
            entry[key] = cleaned
    return entry


def publish_public_notices(notice_date: object, payload: object) -> None:
    if not isinstance(notice_date, str):
        raise ValueError("invalid_notice_date")
    try:
        datetime.strptime(notice_date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("invalid_notice_date") from exc
    if not isinstance(payload, dict):
        raise ValueError("invalid_notice_payload")

    entries = {
        category: normalize_notice_entry(payload.get(category))
        for category in NOTICE_CATEGORIES
    }
    try:
        current = json.loads(NOTICE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("notice_store_unavailable") from exc
    if not isinstance(current, dict):
        raise RuntimeError("notice_store_unavailable")

    for category, entry in entries.items():
        existing = current.get(category)
        items = [item for item in existing if isinstance(item, dict)] if isinstance(existing, list) else []
        current[category] = [item for item in items if item.get("date") != notice_date] + [
            {"date": notice_date, **entry}
        ]

    current["updated_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    NOTICE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_path = NOTICE_FILE.with_name(f".{NOTICE_FILE.name}.tmp")
    temp_path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_path, NOTICE_FILE)


async def handle_connection(ws):
    try:
        # 仅在显式开发配置下公布局域网地址，避免公网服务泄露内部网络信息。
        import config as cfg

        CONNECTION_CHALLENGES[ws] = auth.new_challenge()
        await ws.send(json.dumps({"type": "auth_challenge", "challenge": CONNECTION_CHALLENGES[ws]}))

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

            if mtype == "create_group":
                name = (msg.get("name") or "").strip()
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "Admin"
                identity_pub = msg.get("identity_pub")
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
                    name, device_id, display_name, identity_pub if isinstance(identity_pub, str) else None
                )
                await register(result["group_id"], ws, device_id)
                await ws.send(json.dumps({"type": "group_created", **result}))
                await ws.send(json.dumps(members_payload(result["group_id"])))
                log.info(f"群组已创建: {result['group_id']} name={name}")

            elif mtype == "join_group":
                invite_code = msg.get("invite_code")
                device_id = msg.get("device_id")
                display_name = (msg.get("display_name") or "").strip() or "成员"
                identity_pub = msg.get("identity_pub")
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
                group_id = msg.get("group_id")
                admin_token = msg.get("admin_token")
                target = msg.get("target_device_id")
                group = db.find_group_by_id(group_id) if group_id else None
                if not group or group["admin_token"] != admin_token:
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

            elif mtype == "publish_public_notices":
                import config as cfg

                # Password is the current public-admin credential.  The legacy
                # token field is accepted temporarily so older APKs keep working.
                password = msg.get("notice_admin_password") or msg.get("notice_admin_token")
                expected_password = cfg.NOTICE_ADMIN_PASSWORD or cfg.NOTICE_ADMIN_TOKEN
                if not expected_password:
                    await send_error(ws, "notice_publishing_disabled")
                    continue
                if not isinstance(password, str) or not hmac.compare_digest(password, expected_password):
                    await send_error(ws, "notice_not_authorized")
                    continue
                try:
                    publish_public_notices(msg.get("date"), msg.get("notices"))
                except ValueError as exc:
                    await send_error(ws, str(exc))
                    continue
                except RuntimeError as exc:
                    await send_error(ws, str(exc))
                    continue
                await ws.send(json.dumps({"type": "public_notices_published", "date": msg.get("date")}))
                log.info("管理员已发布 %s 的公开公告", msg.get("date"))

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
                if cfg.REQUIRE_DEVICE_AUTH and not is_registered(ws, group_id, device_id):
                    await send_error(ws, "not_authenticated")
                    continue
                if not message_rate_allowed(ws):
                    await send_error(ws, "rate_limited")
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
