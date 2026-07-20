import unittest

from server.protocol import MAX_CIPHERTEXT_CHARS, validate_message


class RelayProtocolTests(unittest.TestCase):
    def test_accepts_opaque_ciphertext_and_valid_transport_fields(self):
        message = {
            "type": "send_message",
            "group_id": "group-1",
            "device_id": "device-1",
            "ciphertext": "A" * MAX_CIPHERTEXT_CHARS,
            "iv": "iv-value",
            "msg_type": "text",
            "sender_name": "e2ee",
        }
        self.assertIsNone(validate_message(message))

    def test_rejects_non_object_and_non_string_fields(self):
        self.assertEqual(validate_message(["send_message"]), "invalid_message")
        self.assertEqual(
            validate_message({"type": "send_message", "group_id": 42}),
            "invalid_field_type",
        )

    def test_rejects_empty_control_and_oversize_fields(self):
        self.assertEqual(
            validate_message({"type": "send_message", "group_id": ""}),
            "invalid_field_value",
        )
        self.assertEqual(
            validate_message({"type": "send_message", "device_id": "device\nname"}),
            "invalid_field_value",
        )
        self.assertEqual(
            validate_message(
                {
                    "type": "send_message",
                    "ciphertext": "A" * (MAX_CIPHERTEXT_CHARS + 1),
                }
            ),
            "invalid_field_length",
        )


if __name__ == "__main__":
    unittest.main()
