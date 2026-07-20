"""设备挑战签名认证的共享原语。

本模块不处理会话或成员资格；它只验证“持有已登记 P-256 私钥的设备”
对本连接随机挑战作出的证明。线协议的规范见 docs/DEVICE_AUTH_PROTOCOL.md。
"""

from __future__ import annotations

import base64
import binascii
import secrets

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils


AUTH_DOMAIN = "sic-device-auth-v1"


def new_challenge() -> str:
    """返回可在 JSON 中安全传输、且不可预测的单连接挑战。"""
    return secrets.token_urlsafe(32)


def build_auth_payload(challenge: str, action: str, group_id: str, device_id: str) -> bytes:
    """生成跨平台稳定的、带长度边界的签名输入。"""
    values = (AUTH_DOMAIN, challenge, action, group_id, device_id)
    if any(not isinstance(value, str) or not value for value in values):
        raise ValueError("authentication fields must be non-empty strings")
    return b"".join(
        len(value.encode("utf-8")).to_bytes(4, "big") + value.encode("utf-8")
        for value in values
    )


def verify_p256_signature(
    public_key_spki_b64: str,
    signature_b64: str,
    payload: bytes,
) -> bool:
    """验证 Web Crypto ECDSA P-256 原始 r||s 签名。输入异常一律拒绝。"""
    try:
        public_key_bytes = base64.b64decode(public_key_spki_b64, validate=True)
        signature = base64.b64decode(signature_b64, validate=True)
        if len(signature) != 64:
            return False
        public_key = serialization.load_der_public_key(public_key_bytes)
        if not isinstance(public_key, ec.EllipticCurvePublicKey):
            return False
        if not isinstance(public_key.curve, ec.SECP256R1):
            return False
        r = int.from_bytes(signature[:32], "big")
        s = int.from_bytes(signature[32:], "big")
        der_signature = utils.encode_dss_signature(r, s)
        public_key.verify(der_signature, payload, ec.ECDSA(hashes.SHA256()))
        return True
    except (
        ValueError,
        TypeError,
        binascii.Error,
        InvalidSignature,
    ):
        return False
