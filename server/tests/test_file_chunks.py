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


if __name__ == "__main__":
    unittest.main()
