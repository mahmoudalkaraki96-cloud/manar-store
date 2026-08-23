CREATE TABLE IF NOT EXISTS `product_custom_fields` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `product_id` integer NOT NULL,
  `label` text NOT NULL,
  `placeholder` text,
  `max_length` integer DEFAULT 60 NOT NULL,
  `required` integer DEFAULT false NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `customization_json` text;
