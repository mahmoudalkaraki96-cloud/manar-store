-- Resume jobs that stopped before making any supplier request.
UPDATE supplier_import_jobs SET status='running',last_error=NULL,next_attempt_at=0 WHERE status='paused_review' AND last_error LIKE '%Invalid redirect value%';
