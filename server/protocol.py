"""Wire-message schema guards for the relay.

These guards deliberately validate only the transport envelope.  Content
ciphertext remains opaque to the server and is never parsed here.
"""

from collections.abc import Mapping

MAX_CIPHERTEXT_CHARS = 5_800_000

# Field limits protect SQLite, logs and JSON handling before a message reaches a
# handler.  Limits include Base64 representations, not decoded byte lengths.
STRING_LIMITS: dict[str, int] = {
    "type": 64,
    "name": 160,
    "display_name": 96,
    "group_id": 128,
    "device_id": 128,
    "target_device_id": 128,
    "invite_code": 256,
    "admin_token": 256,
    "identity_pub": 2_048,
    "auth_sig": 512,
    "ciphertext": MAX_CIPHERTEXT_CHARS,
    "iv": 128,
    "msg_type": 32,
    "sender_name": 96,
    "before_id": 128,
    "call_id": 128,
    "signal": 16,
    "mode": 16,
}


def validate_message(message: object) -> str | None:
    """Return a stable public error code, or None for a safe transport shape."""

    if not isinstance(message, Mapping):
        return "invalid_message"

    for field, max_length in STRING_LIMITS.items():
        if field not in message or message[field] is None:
            continue
        value = message[field]
        if not isinstance(value, str):
            return "invalid_field_type"
        if not value:
            return "invalid_field_value"
        if len(value) > max_length:
            return "invalid_field_length"
        if any(ord(ch) < 0x20 for ch in value):
            return "invalid_field_value"

    before_ts = message.get("before_ts")
    if before_ts is not None and (
        not isinstance(before_ts, int) or isinstance(before_ts, bool) or before_ts < 0
    ):
        return "invalid_field_type"

    return None
