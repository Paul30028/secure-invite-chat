import tempfile
import unittest
import tempfile
from pathlib import Path

from server import db


class HistoryPaginationTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "history.sqlite3"
        db.init_db()
        self.group = db.create_group("Test", "admin-device", "Admin")
        conn = db.get_conn()
        for index in range(1, 6):
            conn.execute(
                """INSERT INTO messages
                   (id, group_id, sender_device_id, sender_name, msg_type, ciphertext, iv, ts)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    f"message-{index}",
                    self.group["group_id"],
                    "admin-device",
                    "e2ee",
                    "text",
                    f"cipher-{index}",
                    "iv",
                    index,
                ),
            )
        conn.commit()
        conn.close()

    def tearDown(self):
        db.DB_PATH = self.original_path
        self.tempdir.cleanup()

    def test_returns_newest_page_then_stable_older_page(self):
        first, has_more, cursor = db.get_history_page(
            self.group["group_id"], limit=2
        )
        self.assertEqual([message["id"] for message in first], ["message-4", "message-5"])
        self.assertTrue(has_more)
        self.assertEqual(cursor, (4, "message-4"))

        second, has_more, cursor = db.get_history_page(
            self.group["group_id"],
            limit=2,
            before_ts=cursor[0],
            before_id=cursor[1],
        )
        self.assertEqual([message["id"] for message in second], ["message-2", "message-3"])
        self.assertTrue(has_more)
        self.assertEqual(cursor, (2, "message-2"))

        third, has_more, cursor = db.get_history_page(
            self.group["group_id"],
            limit=2,
            before_ts=cursor[0],
            before_id=cursor[1],
        )
        self.assertEqual([message["id"] for message in third], ["message-1"])
        self.assertFalse(has_more)
        self.assertIsNone(cursor)

    def test_rejects_incomplete_cursor(self):
        with self.assertRaises(ValueError):
            db.get_history_page(self.group["group_id"], limit=1, before_ts=1)
        with self.assertRaises(ValueError):
            db.get_history_page(self.group["group_id"], limit=0)

    def test_retry_with_same_client_message_id_is_idempotent(self):
        first = db.save_message(
            self.group["group_id"], "admin-device", "e2ee", "text", "opaque-a", "iv-a", 1, "retry-1"
        )
        second = db.save_message(
            self.group["group_id"], "admin-device", "e2ee", "text", "opaque-a", "iv-a", 1, "retry-1"
        )
        self.assertEqual(first["id"], second["id"])
        conn = db.get_conn()
        count = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE client_message_id=?", ("retry-1",)
        ).fetchone()[0]
        conn.close()
        self.assertEqual(count, 1)

    def test_revoked_and_expired_invites_are_not_active(self):
        group = db.find_group_by_id(self.group["group_id"])
        self.assertTrue(db.invite_is_active(group))
        self.assertIsNotNone(db.find_active_group_by_invite_code(group["invite_code"]))
        db.revoke_invite(self.group["group_id"])
        self.assertFalse(db.invite_is_active(db.find_group_by_id(self.group["group_id"])))
        self.assertIsNone(db.find_active_group_by_invite_code(group["invite_code"]))
        db.regenerate_invite_code(self.group["group_id"])
        active_code = db.find_group_by_id(self.group["group_id"])["invite_code"]
        db.set_invite_expiry(self.group["group_id"], 1)
        self.assertFalse(db.invite_is_active(db.find_group_by_id(self.group["group_id"])))
        self.assertIsNone(db.find_active_group_by_invite_code(active_code))

    def test_limited_ciphertext_retention_deletes_old_messages(self):
        deleted = db.delete_expired_messages(3)
        self.assertEqual(deleted, 2)
        messages, has_more, cursor = db.get_history_page(self.group["group_id"], limit=10)
        self.assertEqual([message["id"] for message in messages], ["message-3", "message-4", "message-5"])
        self.assertFalse(has_more)
        self.assertIsNone(cursor)

    def test_message_storage_quota_counts_only_ciphertext_and_iv(self):
        used = db.message_storage_chars(self.group["group_id"])
        self.assertEqual(used, sum(len(f"cipher-{index}") + len("iv") for index in range(1, 6)))
        device_used = db.message_storage_chars(self.group["group_id"], "admin-device")
        self.assertEqual(device_used, used)
        self.assertEqual(db.message_storage_chars(self.group["group_id"], "other-device"), 0)


if __name__ == "__main__":
    unittest.main()
