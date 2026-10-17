import io
import unittest

from PIL import Image

import supplier_product_batches as batches


class SupplierProductBatchTests(unittest.TestCase):
    def test_hamming_distance_and_review_cutoffs(self):
        base = "0000000000000000"
        self.assertEqual(batches.hamming(base, base), 0)
        self.assertEqual(batches.hamming(base, "000000000000000f"), 4)
        self.assertEqual(batches.hamming(base, "0000000000000fff"), 12)
        self.assertEqual(batches.PHASH_DUPLICATE_BITS, 4)
        self.assertEqual(batches.PHASH_REVIEW_BITS, 12)

    def test_processing_converts_image_to_webp_and_returns_stable_hash(self):
        source = Image.new("RGB", (640, 900), (223, 211, 195))
        source_bytes = io.BytesIO()
        source.save(source_bytes, format="JPEG", quality=90)
        first_hash, webp = batches.make_image(source_bytes.getvalue())
        second_hash, _ = batches.make_image(source_bytes.getvalue())
        self.assertEqual(first_hash, second_hash)
        self.assertTrue(webp.startswith(b"RIFF") and webp[8:12] == b"WEBP")
        with Image.open(io.BytesIO(webp)) as result:
            self.assertEqual(result.format, "WEBP")
            self.assertLessEqual(max(result.size), 1600)

    def test_supplier_host_validation(self):
        self.assertEqual(batches.SOURCE_HOSTS, {"jabaristore.com", "www.jabaristore.com"})


if __name__ == "__main__":
    unittest.main()

