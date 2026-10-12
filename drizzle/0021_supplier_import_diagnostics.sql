ALTER TABLE supplier_import_jobs ADD COLUMN last_response TEXT;
UPDATE supplier_import_jobs SET status='running',last_error=NULL WHERE status='paused_review' AND last_error LIKE 'Error: listing_not_verified%';
