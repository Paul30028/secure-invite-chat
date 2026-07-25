"""Regression tests for opaque, offline key deliveries."""

import tempfile
import unittest
from pathlib import Path

from server import db
from server.protocol import validate_message
from server.server import key_delivery_payload


class PendingKeyDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "keys.sqlite3"
        db.init_db()
        self.group = db.create_group("Test", "admin", "Admin", "sign-pub", "ecdh-admin")
        self.group_id = self.group["group_id"]
        self.assertIsNone(db.add_member(self.group_id, "offline-C", "C", "sign-c", "ecdh-c"))

    def tearDown(self):
        db.DB_PATH = self.original_path
        self.tempdir.cleanup()

    def test_offline_delivery_survives_until_ack_after_resume(self):
        opaque_blob = "not-json; totally opaque bytes represented as text: \\x00? no parser needed"
        delivery = db.save_pending_key_delivery(self.group_id, "offline-C", "admin", 2, opaque_blob)
        pending = db.list_pending_key_deliveries(self.group_id, "offline-C")
        self.assertEqual(pending[0]["wrapped_blob"], opaque_blob)
        self.assertEqual(pending[0]["key_version"], 2)
        # resume_group sends this record unchanged; only the receiving client ACK removes it.
        self.assertTrue(db.delete_pending_key_delivery(delivery["id"], "offline-C"))
        self.assertEqual(db.list_pending_key_deliveries(self.group_id, "offline-C"), [])

    def test_deliver_key_transport_accepts_random_opaque_blob_without_parsing(self):
        random_opaque = "~!@#$%^&*()_+-=[]{};:,.?/" * 80
        self.assertIsNone(validate_message({
            "type": "deliver_key", "group_id": self.group_id, "device_id": "admin",
            "target_device_id": "offline-C", "key_version": 9, "wrapped_blob": random_opaque,
        }))
        forwarded = key_delivery_payload({
            "id": "delivery-id", "group_id": self.group_id, "sender_device_id": "admin",
            "key_version": 9, "wrapped_blob": random_opaque,
        })
        self.assertEqual(forwarded["wrapped_blob"], random_opaque)

    def test_revoked_or_expired_invite_is_not_active(self):
        self.assertTrue(db.invite_is_active(db.find_group_by_id(self.group_id)))
        db.revoke_invite(self.group_id)
        self.assertFalse(db.invite_is_active(db.find_group_by_id(self.group_id)))
        db.regenerate_invite_code(self.group_id)
        db.set_invite_expiry(self.group_id, 1)
        self.assertFalse(db.invite_is_active(db.find_group_by_id(self.group_id)))


if __name__ == "__main__":
    unittest.main()
