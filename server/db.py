"""
db.py - SQLite 持久化层

重要安全说明：
- 本文件存储的所有 message 内容（ciphertext / iv）均为客户端加密后的密文，
  服务器端【不持有】、【不参与】任何密钥的生成、协商或存储。
- messages 表不存储明文，也不存储任何解密所需的密钥材料。
- invite_code / admin_token 属于"入群凭证"和"管理员凭证"，不是加密密钥，
  它们只用来控制"谁可以连接/管理这个群"，不影响端到端加密的机密性。
"""

import sqlite3
import secrets
import time
import uuid
from pathlib import Path

DB_PATH = Path(__file__).parent / "data.sqlite3"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            invite_code TEXT UNIQUE NOT NULL,
            admin_token TEXT NOT NULL,
            invite_expires_at INTEGER,
            invite_revoked INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            identity_pub TEXT,
            ecdh_pub TEXT,
            joined_at INTEGER NOT NULL,
            UNIQUE(group_id, device_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            sender_device_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            msg_type TEXT NOT NULL,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            key_version INTEGER NOT NULL DEFAULT 1,
            ts INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pending_key_deliveries (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            sender_device_id TEXT NOT NULL,
            key_version INTEGER NOT NULL,
            wrapped_blob TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pending_key_deliveries_device ON pending_key_deliveries(group_id, device_id);

        CREATE INDEX IF NOT EXISTS idx_messages_group_ts ON messages(group_id, ts);

        -- File payloads deliberately live outside messages: a 50 MB upload must not
        -- turn normal chat-history queries into thousands of rows.
        CREATE TABLE IF NOT EXISTS file_chunks (
            file_id TEXT NOT NULL,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            sender_device_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            total_chunks INTEGER NOT NULL,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            key_version INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (file_id, chunk_index)
        );
        CREATE INDEX IF NOT EXISTS idx_file_chunks_group_file ON file_chunks(group_id, file_id, chunk_index);

        CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS muted_members (group_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(group_id, device_id));
        """
    )
    # 兼容旧库：补充身份公钥与管理员标记列。
    try:
        conn.execute("ALTER TABLE members ADD COLUMN identity_pub TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE members ADD COLUMN ecdh_pub TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1")
    except sqlite3.OperationalError:
        pass
    for statement in ("ALTER TABLE groups ADD COLUMN invite_expires_at INTEGER", "ALTER TABLE groups ADD COLUMN invite_revoked INTEGER NOT NULL DEFAULT 0"):
        try:
            conn.execute(statement)
        except sqlite3.OperationalError:
            pass
    # 兼容旧库：补充 is_admin 列
    try:
        conn.execute(
            "ALTER TABLE members ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"
        )
    except sqlite3.OperationalError:
        pass
    # 旧群：尚无管理员标记时，将最早加入者标为管理员
    try:
        conn.execute(
            """
            UPDATE members SET is_admin = 1
            WHERE group_id IN (
              SELECT g.id FROM groups g
              WHERE NOT EXISTS (
                SELECT 1 FROM members m2 WHERE m2.group_id = g.id AND m2.is_admin = 1
              )
            )
            AND (group_id, joined_at) IN (
              SELECT group_id, MIN(joined_at) FROM members GROUP BY group_id
            )
            """
        )
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def create_group(
    name: str,
    admin_device_id: str,
    admin_display_name: str,
    identity_pub: str | None = None,
    ecdh_pub: str | None = None,
) -> dict:
    conn = get_conn()
    group_id = str(uuid.uuid4())
    invite_code = secrets.token_urlsafe(9)  # 12字符左右, 高强度随机
    admin_token = secrets.token_hex(24)
    now = int(time.time())
    conn.execute(
        "INSERT INTO groups (id, name, invite_code, admin_token, created_at) VALUES (?,?,?,?,?)",
        (group_id, name, invite_code, admin_token, now),
    )
    member_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO members
           (id, group_id, device_id, display_name, identity_pub, ecdh_pub, joined_at, is_admin)
           VALUES (?,?,?,?,?,?,?,1)""",
        (member_id, group_id, admin_device_id, admin_display_name, identity_pub, ecdh_pub, now),
    )
    conn.commit()
    conn.close()
    return {
        "group_id": group_id,
        "name": name,
        "invite_code": invite_code,
        "admin_token": admin_token,
    }


def find_group_by_invite_code(invite_code: str):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM groups WHERE invite_code = ?", (invite_code,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def find_group_by_id(group_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def normalize_display_name(name: str) -> str:
    return (name or "").strip()


def is_display_name_taken(
    group_id: str, display_name: str, exclude_device_id: str | None = None
) -> bool:
    """同群内昵称唯一（不区分大小写，去掉首尾空格）"""
    name = normalize_display_name(display_name)
    if not name:
        return False
    conn = get_conn()
    rows = conn.execute(
        "SELECT device_id, display_name FROM members WHERE group_id=?",
        (group_id,),
    ).fetchall()
    conn.close()
    target = name.casefold()
    for r in rows:
        if exclude_device_id and r["device_id"] == exclude_device_id:
            continue
        if normalize_display_name(r["display_name"]).casefold() == target:
            return True
    return False


def add_member(
    group_id: str,
    device_id: str,
    display_name: str,
    identity_pub: str | None = None,
    ecdh_pub: str | None = None,
) -> str | None:
    """
    加入成员。成功返回 None；失败返回错误码：
      display_name_taken / empty_display_name
    同一 device 重连可更新昵称，但新昵称不得与他人冲突。
    """
    name = normalize_display_name(display_name)
    if not name:
        return "empty_display_name"
    if is_display_name_taken(group_id, name, exclude_device_id=device_id):
        return "display_name_taken"

    conn = get_conn()
    existing = conn.execute(
        "SELECT identity_pub, ecdh_pub FROM members WHERE group_id=? AND device_id=?",
        (group_id, device_id),
    ).fetchone()
    if existing and existing["identity_pub"] and existing["identity_pub"] != identity_pub:
        conn.close()
        return "device_identity_mismatch"
    if existing and existing["ecdh_pub"] and existing["ecdh_pub"] != ecdh_pub:
        conn.close()
        return "device_ecdh_mismatch"
    now = int(time.time())
    conn.execute(
        """INSERT INTO members
           (id, group_id, device_id, display_name, identity_pub, ecdh_pub, joined_at, is_admin)
           VALUES (?,?,?,?,?,?,?,0)
           ON CONFLICT(group_id, device_id) DO UPDATE SET
             display_name=excluded.display_name,
             identity_pub=COALESCE(members.identity_pub, excluded.identity_pub),
             ecdh_pub=COALESCE(members.ecdh_pub, excluded.ecdh_pub)""",
        (str(uuid.uuid4()), group_id, device_id, name, identity_pub, ecdh_pub, now),
    )
    conn.commit()
    conn.close()
    return None


def get_member_identity_pub(group_id: str, device_id: str) -> str | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT identity_pub FROM members WHERE group_id=? AND device_id=?",
        (group_id, device_id),
    ).fetchone()
    conn.close()
    return row["identity_pub"] if row and row["identity_pub"] else None


def is_member(group_id: str, device_id: str) -> bool:
    conn = get_conn()
    row = conn.execute(
        "SELECT 1 FROM members WHERE group_id=? AND device_id=?", (group_id, device_id)
    ).fetchone()
    conn.close()
    return row is not None


def is_admin_member(group_id: str, device_id: str) -> bool:
    conn = get_conn()
    row = conn.execute(
        "SELECT is_admin FROM members WHERE group_id=? AND device_id=?",
        (group_id, device_id),
    ).fetchone()
    conn.close()
    if not row:
        return False
    return bool(row["is_admin"]) if "is_admin" in row.keys() else False


def list_members(group_id: str) -> list:
    """返回成员元数据（无密钥）。online 由 server 层填充。"""
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT device_id, display_name, joined_at, is_admin, ecdh_pub
               FROM members WHERE group_id=? ORDER BY is_admin DESC, joined_at ASC""",
            (group_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = conn.execute(
            """SELECT device_id, display_name, joined_at
               FROM members WHERE group_id=? ORDER BY joined_at ASC""",
            (group_id,),
        ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["is_admin"] = bool(d.get("is_admin", 0))
        out.append(d)
    return out


def remove_member(group_id: str, device_id: str) -> bool:
    """踢出成员。不可踢管理员。成功返回 True。"""
    if is_admin_member(group_id, device_id):
        return False
    conn = get_conn()
    cur = conn.execute(
        "DELETE FROM members WHERE group_id=? AND device_id=?", (group_id, device_id)
    )
    conn.commit()
    ok = cur.rowcount > 0
    conn.close()
    return ok


def regenerate_invite_code(group_id: str) -> str:
    new_code = secrets.token_urlsafe(9)
    conn = get_conn()
    conn.execute("UPDATE groups SET invite_code=?, invite_revoked=0 WHERE id=?", (new_code, group_id))
    conn.commit()
    conn.close()
    return new_code


def set_invite_expiry(group_id: str, expires_at: int | None):
    conn = get_conn(); conn.execute("UPDATE groups SET invite_expires_at=? WHERE id=?", (expires_at, group_id)); conn.commit(); conn.close()


def revoke_invite(group_id: str):
    conn = get_conn(); conn.execute("UPDATE groups SET invite_revoked=1 WHERE id=?", (group_id,)); conn.commit(); conn.close()


def invite_is_active(group: dict) -> bool:
    return not bool(group.get("invite_revoked")) and (not group.get("invite_expires_at") or int(group["invite_expires_at"]) > int(time.time()))


def save_message(group_id, sender_device_id, sender_name, msg_type, ciphertext, iv, key_version=1) -> dict:
    conn = get_conn()
    msg_id = str(uuid.uuid4())
    ts = int(time.time() * 1000)
    conn.execute(
        """INSERT INTO messages (id, group_id, sender_device_id, sender_name, msg_type, ciphertext, iv, key_version, ts)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (msg_id, group_id, sender_device_id, sender_name, msg_type, ciphertext, iv, key_version, ts),
    )
    conn.commit()
    conn.close()
    return {
        "id": msg_id,
        "group_id": group_id,
        "sender_device_id": sender_device_id,
        "sender_name": sender_name,
        "msg_type": msg_type,
        "ciphertext": ciphertext,
        "iv": iv,
        "key_version": key_version,
        "ts": ts,
    }


def get_history_page(
    group_id: str,
    *,
    limit: int,
    before_ts: int | None = None,
    before_id: str | None = None,
) -> tuple[list[dict], bool, tuple[int, str] | None]:
    """Return one stable newest-first cursor page, ordered for chat rendering."""

    if limit <= 0:
        raise ValueError("history limit must be positive")
    if (before_ts is None) != (before_id is None):
        raise ValueError("history cursor must include timestamp and id together")

    conn = get_conn()
    if before_ts is None:
        rows = conn.execute(
            """SELECT * FROM messages WHERE group_id=?
               ORDER BY ts DESC, id DESC LIMIT ?""",
            (group_id, limit + 1),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM messages
               WHERE group_id=? AND (ts < ? OR (ts = ? AND id < ?))
               ORDER BY ts DESC, id DESC LIMIT ?""",
            (group_id, before_ts, before_ts, before_id, limit + 1),
        ).fetchall()
    conn.close()

    has_more = len(rows) > limit
    page_desc = rows[:limit]
    next_cursor = None
    if has_more and page_desc:
        oldest = page_desc[-1]
        next_cursor = (oldest["ts"], oldest["id"])
    return [dict(row) for row in reversed(page_desc)], has_more, next_cursor


def save_file_chunk(group_id: str, sender_device_id: str, sender_name: str, file_id: str,
                    chunk_index: int, total_chunks: int, ciphertext: str, iv: str,
                    key_version: int) -> dict:
    """Persist opaque encrypted content. Duplicate chunks are harmless retries."""
    chunk = {
        "group_id": group_id, "sender_device_id": sender_device_id,
        "sender_name": sender_name, "file_id": file_id, "chunk_index": chunk_index,
        "total_chunks": total_chunks, "ciphertext": ciphertext, "iv": iv,
        "key_version": key_version, "created_at": int(time.time() * 1000),
    }
    conn = get_conn()
    conn.execute(
        """INSERT OR IGNORE INTO file_chunks
           (file_id,group_id,sender_device_id,sender_name,chunk_index,total_chunks,ciphertext,iv,key_version,created_at)
           VALUES (:file_id,:group_id,:sender_device_id,:sender_name,:chunk_index,:total_chunks,:ciphertext,:iv,:key_version,:created_at)""",
        chunk,
    )
    conn.commit(); conn.close()
    return chunk


def list_file_chunks(group_id: str, file_id: str, indexes: list[int] | None = None) -> list[dict]:
    conn = get_conn()
    if indexes:
        placeholders = ",".join("?" for _ in indexes)
        rows = conn.execute(
            f"SELECT * FROM file_chunks WHERE group_id=? AND file_id=? AND chunk_index IN ({placeholders}) ORDER BY chunk_index",
            [group_id, file_id, *indexes],
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM file_chunks WHERE group_id=? AND file_id=? ORDER BY chunk_index", (group_id, file_id)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def file_chunk_indexes(group_id: str, file_id: str) -> list[int]:
    conn = get_conn()
    rows = conn.execute("SELECT chunk_index FROM file_chunks WHERE group_id=? AND file_id=? ORDER BY chunk_index", (group_id, file_id)).fetchall()
    conn.close()
    return [int(row["chunk_index"]) for row in rows]


def list_member_group_ids(device_id: str):
    """给定 device_id，返回它已加入的所有 group_id（用于断线重连后自动恢复）"""
    conn = get_conn()
    rows = conn.execute(
        "SELECT group_id FROM members WHERE device_id=?", (device_id,)
    ).fetchall()
    conn.close()
    return [r["group_id"] for r in rows]


def get_app_state(key: str, default: dict) -> dict:
    conn = get_conn(); row = conn.execute("SELECT value FROM app_state WHERE key=?", (key,)).fetchone(); conn.close()
    if not row: return default
    try:
        import json
        return json.loads(row["value"])
    except Exception: return default


def set_app_state(key: str, value: dict):
    import json
    conn = get_conn(); conn.execute("INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value, ensure_ascii=False))); conn.commit(); conn.close()


def get_daily_notice() -> dict:
    return get_app_state("daily_notice", {"dailyDevotion": "", "hymn": "", "scripture": ""})


def save_daily_notice(notice: dict): set_app_state("daily_notice", notice)


def is_maintenance() -> bool: return bool(get_app_state("maintenance", {"enabled": False}).get("enabled"))


def set_maintenance(enabled: bool): set_app_state("maintenance", {"enabled": bool(enabled)})


def save_pending_key_delivery(group_id: str, device_id: str, sender_device_id: str, key_version: int, wrapped_blob: str) -> dict:
    delivery = {"id": str(uuid.uuid4()), "group_id": group_id, "device_id": device_id, "sender_device_id": sender_device_id, "key_version": key_version, "wrapped_blob": wrapped_blob, "created_at": int(time.time() * 1000)}
    conn = get_conn()
    conn.execute("""INSERT INTO pending_key_deliveries (id, group_id, device_id, sender_device_id, key_version, wrapped_blob, created_at)
                    VALUES (:id,:group_id,:device_id,:sender_device_id,:key_version,:wrapped_blob,:created_at)""", delivery)
    conn.commit(); conn.close()
    return delivery


def list_pending_key_deliveries(group_id: str, device_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM pending_key_deliveries WHERE group_id=? AND device_id=? ORDER BY created_at ASC", (group_id, device_id)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_pending_key_delivery(delivery_id: str, device_id: str) -> bool:
    conn = get_conn()
    cur = conn.execute("DELETE FROM pending_key_deliveries WHERE id=? AND device_id=?", (delivery_id, device_id))
    conn.commit(); ok = cur.rowcount > 0; conn.close()
    return ok

def set_member_muted(group_id: str, device_id: str, muted: bool):
    conn = get_conn()
    if muted: conn.execute("INSERT OR IGNORE INTO muted_members(group_id,device_id) VALUES(?,?)", (group_id, device_id))
    else: conn.execute("DELETE FROM muted_members WHERE group_id=? AND device_id=?", (group_id, device_id))
    conn.commit(); conn.close()

def is_member_muted(group_id: str, device_id: str) -> bool:
    conn = get_conn(); row = conn.execute("SELECT 1 FROM muted_members WHERE group_id=? AND device_id=?", (group_id, device_id)).fetchone(); conn.close(); return row is not None
