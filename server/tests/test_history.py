import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
