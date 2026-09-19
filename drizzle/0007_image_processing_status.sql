CREATE TABLE IF NOT EXISTS image_processing_status (
  media_id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  original_url TEXT,
  processed_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(media_id) REFERENCES product_media(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS image_processing_status_product_idx ON image_processing_status(product_id);
CREATE INDEX IF NOT EXISTS image_processing_status_status_idx ON image_processing_status(status);

INSERT OR IGNORE INTO image_processing_status
(media_id,product_id,original_url,processed_url,status,attempts,last_error,processed_at,created_at,updated_at)
SELECT id,product_id,
  CASE WHEN url LIKE '/media/products/ai/%' OR url LIKE '/media/ai-previews/%' THEN NULL ELSE url END,
  CASE WHEN url LIKE '/media/products/ai/%' OR url LIKE '/media/ai-previews/%' THEN url ELSE NULL END,
  CASE WHEN url LIKE '/media/products/ai/%' OR url LIKE '/media/ai-previews/%' THEN 'processed' ELSE 'pending' END,
  0,NULL,
  CASE WHEN url LIKE '/media/products/ai/%' OR url LIKE '/media/ai-previews/%' THEN updated_at ELSE NULL END,
  created_at,updated_at
FROM product_media
WHERE media_type='image';

UPDATE image_processing_status
SET status='processed',
    processed_url=(SELECT pm.url FROM product_media pm WHERE pm.id=image_processing_status.media_id),
    processed_at=COALESCE(processed_at,(SELECT pm.updated_at FROM product_media pm WHERE pm.id=image_processing_status.media_id)),
    updated_at=(SELECT pm.updated_at FROM product_media pm WHERE pm.id=image_processing_status.media_id)
WHERE EXISTS (
  SELECT 1 FROM product_media pm
  WHERE pm.id=image_processing_status.media_id
    AND (pm.url LIKE '/media/products/ai/%' OR pm.url LIKE '/media/ai-previews/%')
);
