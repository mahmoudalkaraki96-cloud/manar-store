ALTER TABLE `store_settings` ADD `show_offers` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `show_most_ordered` integer DEFAULT false NOT NULL;
ALTER TABLE `store_settings` ADD `show_top_rated` integer DEFAULT false NOT NULL;
ALTER TABLE `store_settings` ADD `show_newest` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `show_featured` integer DEFAULT true NOT NULL;
ALTER TABLE `store_settings` ADD `home_products_limit` integer DEFAULT 6 NOT NULL;
