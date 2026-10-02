ALTER TABLE store_settings ADD COLUMN site_name_ar TEXT DEFAULT 'منار بارتي ستور' NOT NULL;
ALTER TABLE store_settings ADD COLUMN site_name_en TEXT DEFAULT 'Manar Party Store' NOT NULL;
ALTER TABLE store_settings ADD COLUMN seo_description TEXT DEFAULT 'قطع وإكسسوارات التوزيعات بالجملة والتجزئة' NOT NULL;
ALTER TABLE store_settings ADD COLUMN favicon_url TEXT DEFAULT '' NOT NULL;
UPDATE store_settings SET store_name='منار بارتي ستور | Manar Party Store',site_name_ar='منار بارتي ستور',site_name_en='Manar Party Store',seo_description='قطع وإكسسوارات التوزيعات بالجملة والتجزئة',favicon_url=CASE WHEN COALESCE(favicon_url,'')='' THEN COALESCE(logo_url,'') ELSE favicon_url END WHERE id=1;
