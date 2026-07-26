"""Storage-level tests: the file relay treats payloads as opaque ciphertext."""

import tempfile
import unittest
from pathlib import Path

from server import db


class FileChunkStoreTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "chunks.sqlite3"
        db.init_db()
        self.group_id = db.create_group("Test", "admin", "Admin")["group_id"]

    def tearDown(self):
        db.DB_PATH = self.original_path
        self.tempdir.cleanup()

    def test_chunks_are_opaque_deduplicated_and_queryable_for_resume(self):
        opaque = "not-base64-and-not-parsed::\x00::random-ciphertext"
        first = db.save_file_chunk(self.group_id, "admin", "Admin", "file-1", 0, 3, opaque, "random-iv", 1)
        db.save_file_chunk(self.group_id, "admin", "Admin", "file-1", 0, 3, "replacement-must-not-win", "iv", 1)
        db.save_file_chunk(self.group_id, "admin", "Admin", "file-1", 2, 3, "opaque-two", "iv2", 1)
        self.assertEqual(first["ciphertext"], opaque)
        self.assertEqual(db.file_chunk_indexes(self.group_id, "file-1"), [0, 2])
        selected = db.list_file_chunks(self.group_id, "file-1", [2])
        self.assertEqual(selected[0]["ciphertext"], "opaque-two")
        stored = db.list_file_chunks(self.group_id, "file-1")
        self.assertEqual(stored[0]["ciphertext"], opaque)

    def test_file_ids_are_scoped_to_a_group(self):
        other_group = db.create_group("Other", "admin-2", "Admin")["group_id"]
        db.save_file_chunk(self.group_id, "admin", "Admin", "same-id", 0, 1, "one", "iv", 1)
        db.save_file_chunk(other_group, "admin-2", "Admin", "same-id", 0, 1, "two", "iv", 1)
        self.assertEqual(db.list_file_chunks(self.group_id, "same-id")[0]["ciphertext"], "one")
        self.assertEqual(db.list_file_chunks(other_group, "same-id")[0]["ciphertext"], "two")

    def test_expired_chunks_are_deleted_and_storage_is_counted(self):
        db.save_file_chunk(self.group_id, "admin", "Admin", "old", 0, 1, "ciphertext", "iv", 1)
        self.assertGreater(db.file_storage_chars(self.group_id), 0)
        self.assertEqual(db.delete_expired_file_chunks(10**15), 1)
        self.assertEqual(db.file_storage_chars(self.group_id), 0)


if __name__ == "__main__":
    unittest.main()
