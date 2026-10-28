-- Retain the existing hashes; remove only forced rotation and password expiry.
UPDATE admin_users SET must_change_password=0,password_expires_at=NULL;
DELETE FROM customer_password_resets;
