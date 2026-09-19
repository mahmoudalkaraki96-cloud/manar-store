# Image processing tracking

This migration adds an idempotent status ledger for product images.

Statuses: pending, processing, processed, failed.

The migration does not call any AI API and does not process images. Existing media URLs under /media/products/ai/ or /media/ai-previews/ are reconciled as processed; all other existing product images are pending.

Future batch jobs must select only pending rows, atomically claim them as processing, and mark processed only after the processed file is stored and product_media is updated. Failed rows retain last_error and attempts.

Useful counts after migration:
SELECT status, COUNT(*) AS images FROM image_processing_status GROUP BY status;
