import base64
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

from auth import build_auth_payload, verify_p256_signature


class DeviceAuthTests(unittest.TestCase):
    def setUp(self):
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        spki = self.private_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.public_key_b64 = base64.b64encode(spki).decode("ascii")
        self.payload = build_auth_payload("challenge", "resume_group", "group", "device")

    def sign_raw(self, payload):
        der = self.private_key.sign(payload, ec.ECDSA(hashes.SHA256()))
        r, s = utils.decode_dss_signature(der)
        return base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode("ascii")

    def test_accepts_valid_web_crypto_compatible_signature(self):
        self.assertTrue(
            verify_p256_signature(self.public_key_b64, self.sign_raw(self.payload), self.payload)
        )

    def test_rejects_modified_payload_and_malformed_signature(self):
        signature = self.sign_raw(self.payload)
        self.assertFalse(
            verify_p256_signature(
                self.public_key_b64,
                signature,
                build_auth_payload("other", "resume_group", "group", "device"),
            )
        )
        self.assertFalse(verify_p256_signature(self.public_key_b64, "not-base64", self.payload))


if __name__ == "__main__":
    unittest.main()
