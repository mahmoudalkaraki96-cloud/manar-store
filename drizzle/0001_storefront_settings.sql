ALTER TABLE `store_settings` ADD `background_color` text DEFAULT '#ffffff' NOT NULL;
ALTER TABLE `store_settings` ADD `whatsapp_enabled` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `facebook_enabled` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `instagram_enabled` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `tiktok_enabled` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `slider_interval_ms` integer DEFAULT 5000 NOT NULL;

