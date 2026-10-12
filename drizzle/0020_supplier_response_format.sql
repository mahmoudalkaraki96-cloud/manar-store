UPDATE supplier_import_jobs SET status='running',last_error=NULL WHERE status='paused_review' AND last_error='Error: listing_not_verified';
