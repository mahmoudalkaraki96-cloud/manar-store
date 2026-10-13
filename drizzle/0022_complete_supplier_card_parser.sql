-- Re-scan from page one after correcting the exact price CSS token. Existing drafts deduplicate by source ID.
UPDATE supplier_import_jobs SET status='running',next_page=1,pages_scanned=0,skipped_count=0,last_fingerprint=NULL,last_error=NULL,next_attempt_at=unixepoch()*1000+300000;
