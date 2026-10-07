-- Clear only the exact supplier error text; valid descriptions stay intact.
-- Touch lastmod only for products whose description actually changes.
UPDATE products
SET description = CASE WHEN trim(description) = 'You don''t have permission to access this resource.' || char(10) || char(10) || 'Additionally, a 403' THEN '' ELSE description END,
    short_description = CASE WHEN trim(short_description) = 'You don''t have permission to access this resource.' || char(10) || char(10) || 'Additionally, a 403' THEN '' ELSE short_description END,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE trim(description) = 'You don''t have permission to access this resource.' || char(10) || char(10) || 'Additionally, a 403'
   OR trim(short_description) = 'You don''t have permission to access this resource.' || char(10) || char(10) || 'Additionally, a 403';
