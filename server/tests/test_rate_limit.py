import unittest

from server.rate_limit import TokenBucket


class TokenBucketTests(unittest.TestCase):
    def test_allows_initial_burst_then_rejects(self):
        bucket = TokenBucket(per_minute=60, burst=2)
        self.assertTrue(bucket.allow(now=100.0))
        self.assertTrue(bucket.allow(now=100.0))
        self.assertFalse(bucket.allow(now=100.0))

    def test_refills_at_configured_rate_without_exceeding_burst(self):
        bucket = TokenBucket(per_minute=60, burst=2)
        self.assertTrue(bucket.allow(now=100.0))
        self.assertTrue(bucket.allow(now=100.0))
        self.assertFalse(bucket.allow(now=100.0))
        self.assertTrue(bucket.allow(now=101.0))
        self.assertFalse(bucket.allow(now=101.0))

        # A long idle period refills to the burst cap, but no further.
        self.assertTrue(bucket.allow(now=999.0))
        self.assertTrue(bucket.allow(now=999.0))
        self.assertFalse(bucket.allow(now=999.0))

    def test_rejects_invalid_configuration(self):
        with self.assertRaises(ValueError):
            TokenBucket(per_minute=0, burst=1)
        with self.assertRaises(ValueError):
            TokenBucket(per_minute=1, burst=0)


if __name__ == "__main__":
    unittest.main()
