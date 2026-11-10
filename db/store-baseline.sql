-- New-store schema only. No existing-store data or historical seeding is copied.

-- Apply only to a newly created empty database. Existing tables deliberately cause failure.

CREATE TABLE admin_audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, actor_label TEXT NOT NULL,
 action TEXT NOT NULL, target TEXT NOT NULL, status INTEGER NOT NULL,
 details TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);

CREATE TABLE admin_customer_orders (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  customer_id INTEGER NOT NULL REFERENCES admin_customers(id),
  linked_at INTEGER NOT NULL,
  request_id TEXT UNIQUE,
  request_hash TEXT
);

CREATE TABLE admin_customer_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES admin_customers(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount_agorot INTEGER NOT NULL CHECK(amount_agorot > 0),
  note TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE admin_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  account_id INTEGER,
  request_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE admin_group_members (
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES admin_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE admin_group_permissions (
  group_id INTEGER NOT NULL REFERENCES admin_groups(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (group_id, permission)
);

CREATE TABLE admin_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE admin_login_limits (
 key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);

CREATE TABLE admin_mutation_guards (
 token TEXT PRIMARY KEY,
 valid INTEGER NOT NULL CHECK(valid=1)
);

CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id),
 auth_version INTEGER NOT NULL, method TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);

CREATE TABLE admin_user_permissions (
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  password_expires_at INTEGER,
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_number` integer NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`banner_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `icon_url` text);

CREATE TABLE customer_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);

CREATE TABLE customer_addresses (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL,label TEXT NOT NULL,recipient_name TEXT NOT NULL,phone TEXT NOT NULL,city TEXT NOT NULL,address TEXT NOT NULL,shipping_zone TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE);

CREATE TABLE customer_auth_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start INTEGER NOT NULL);

CREATE TABLE customer_password_resets (
 account_id INTEGER PRIMARY KEY,
 expires_at INTEGER NOT NULL
);

CREATE TABLE customer_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,revoked_at INTEGER);

CREATE TABLE highlight_image_numbers (id INTEGER PRIMARY KEY AUTOINCREMENT,highlight_id INTEGER NOT NULL,url TEXT NOT NULL,image_number INTEGER, view_count INTEGER NOT NULL DEFAULT 0,UNIQUE(highlight_id,url));

CREATE TABLE highlight_visibility (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1, interval_ms INTEGER NOT NULL DEFAULT 5000);

CREATE TABLE image_processing_status (
  media_id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  original_url TEXT,
  processed_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(media_id) REFERENCES product_media(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE jabari_variant_audit (
 source_id INTEGER NOT NULL, mode TEXT NOT NULL, product_id INTEGER NOT NULL,
 status TEXT NOT NULL, detail TEXT NOT NULL, token TEXT NOT NULL,
 updated_at INTEGER NOT NULL, PRIMARY KEY(source_id,mode));

CREATE TABLE jabari_variant_audit_lock (
 id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,expires_at INTEGER NOT NULL);

CREATE TABLE marketing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  local_hour INTEGER NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  visitor_hash TEXT NOT NULL,
  product_id INTEGER,
  order_number TEXT,
  category TEXT,
  route TEXT,
  referrer_host TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  value_agorot INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE marketing_search_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  local_hour INTEGER NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6)
);

CREATE TABLE order_edit_guards(token TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));

CREATE TABLE order_extra_fees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 label TEXT NOT NULL,
 amount_agorot INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer,
	`variant_id` integer,
	`item_number` integer,
	`product_name` text NOT NULL,
	`variant_label` text,
	`quantity` integer NOT NULL,
	`unit_price_agorot` integer NOT NULL,
	`line_total_agorot` integer NOT NULL,
	`notes` text, `customization_json` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` integer NOT NULL,
	`customer_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_name` text,
	`phone` text,
	`address` text,
	`city` text,
	`shipping_zone_id` integer,
	`subtotal_agorot` integer DEFAULT 0 NOT NULL,
	`shipping_agorot` integer DEFAULT 0 NOT NULL,
	`discount_agorot` integer DEFAULT 0 NOT NULL,
	`total_agorot` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT 'cash_on_delivery' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, order_source TEXT NOT NULL DEFAULT 'storefront', order_source_channel TEXT, edit_version INTEGER NOT NULL DEFAULT 0, inventory_committed INTEGER DEFAULT 0, accepted_policy_version INTEGER, policy_accepted_at INTEGER, customer_account_id INTEGER,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shipping_zone_id`) REFERENCES `shipping_zones`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `popups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`body` text,
	`image_url` text,
	`target_url` text,
	`active` integer DEFAULT false NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `product_custom_fields` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `product_id` integer NOT NULL,
  `label` text NOT NULL,
  `placeholder` text,
  `max_length` integer DEFAULT 60 NOT NULL,
  `required` integer DEFAULT false NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade
);

CREATE TABLE product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);

CREATE TABLE `product_keywords` (
	`product_id` integer NOT NULL,
	`keyword` text NOT NULL,
	PRIMARY KEY(`product_id`, `keyword`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `product_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`media_type` text DEFAULT 'image' NOT NULL,
	`url` text NOT NULL,
	`alt_text` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `product_option_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`option_id` integer NOT NULL,
	`value` text NOT NULL,
	`color_hex` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`option_id`) REFERENCES `product_options`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `product_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_type` text DEFAULT 'text' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE product_suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,supplier_id INTEGER NOT NULL,source_product_id TEXT,source_url TEXT,supplier_price_agorot INTEGER,preferred INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(product_id,supplier_id),FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE);

CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text,
	`price_agorot` integer,
	`wholesale_price_agorot` integer,
	`purchase_price_agorot` integer,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_number` integer NOT NULL,
	`category_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`short_description` text,
	`description` text,
	`specifications` text,
	`price_agorot` integer NOT NULL,
	`wholesale_price_agorot` integer,
	`purchase_price_agorot` integer,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`offer_price_agorot` integer,
	`offer_starts_at` integer,
	`offer_ends_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`order_count` integer DEFAULT 0 NOT NULL,
	`rating_average_x100` integer DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `purchase_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`product_id` integer,
	`variant_id` integer,
	`item_number` integer,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_agorot` integer NOT NULL,
	`line_total_agorot` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_number` integer NOT NULL,
	`supplier_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`invoice_reference` text,
	`purchased_at` integer NOT NULL,
	`total_agorot` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE push_config(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_jwk TEXT NOT NULL);

CREATE TABLE push_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,subscription_id TEXT NOT NULL,payload TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,created_at INTEGER NOT NULL,sent_at INTEGER, last_error TEXT);

CREATE TABLE push_order_links(order_id INTEGER NOT NULL,subscription_id TEXT NOT NULL,PRIMARY KEY(order_id,subscription_id));

CREATE TABLE push_subscriptions(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','customer')),origin TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,account_id INTEGER,orders_enabled INTEGER NOT NULL DEFAULT 1,offers_enabled INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);

CREATE TABLE pwa_installations (
  installation_id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK(surface IN ('storefront','admin')),
  source TEXT NOT NULL CHECK(source IN ('appinstalled','standalone')),
  installed_at INTEGER NOT NULL
);

CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`user_id` integer,
	`rating` integer NOT NULL,
	`comment` text,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `shipping_zones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`price_agorot` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `sliders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`image_url` text NOT NULL,
	`product_id` integer,
	`category_id` integer,
	`external_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE store_browser_activity (
 cart_id TEXT PRIMARY KEY,
 device_type TEXT NOT NULL,
 browser TEXT NOT NULL,
 country TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL
);

CREATE TABLE store_cart_details (
 cart_id TEXT PRIMARY KEY,
 items_json TEXT NOT NULL CHECK(json_valid(items_json))
);

CREATE TABLE store_cart_snapshots (
 cart_id TEXT PRIMARY KEY,
 quantity INTEGER NOT NULL CHECK(quantity >= 0),
 products_count INTEGER NOT NULL CHECK(products_count >= 0),
 updated_at INTEGER NOT NULL
);

CREATE TABLE store_daily_visitors (day TEXT NOT NULL,visitor_hash TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,PRIMARY KEY(day,visitor_hash));

CREATE TABLE store_highlights (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,cover_url TEXT NOT NULL,images_json TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL, view_count INTEGER NOT NULL DEFAULT 0);

CREATE TABLE store_policies (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 1,receiving TEXT NOT NULL,shipping TEXT NOT NULL,cancellation TEXT NOT NULL,exchange_policy TEXT NOT NULL,updated_at INTEGER NOT NULL);

CREATE TABLE store_profile (
  id integer PRIMARY KEY NOT NULL DEFAULT 1,
  settings_json text NOT NULL DEFAULT '{}',
  updated_at integer NOT NULL DEFAULT 0
);

CREATE TABLE `store_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`store_name` text DEFAULT '' NOT NULL,
	`logo_url` text,
	`watermark_url` text,
	`primary_color` text DEFAULT '#475569' NOT NULL,
	`secondary_color` text DEFAULT '#94a3b8' NOT NULL,
	`currency` text DEFAULT 'ILS' NOT NULL,
	`whatsapp` text,
	`facebook_url` text,
	`instagram_url` text,
	`tiktok_url` text,
	`slider_enabled` integer DEFAULT true NOT NULL,
	`popup_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `background_color` text DEFAULT '#ffffff' NOT NULL, `whatsapp_enabled` integer DEFAULT true NOT NULL, `facebook_enabled` integer DEFAULT true NOT NULL, `instagram_enabled` integer DEFAULT true NOT NULL, `tiktok_enabled` integer DEFAULT true NOT NULL, `slider_interval_ms` integer DEFAULT 5000 NOT NULL, `show_out_of_stock` integer DEFAULT true NOT NULL, `show_offers` integer DEFAULT true NOT NULL, `show_most_ordered` integer DEFAULT false NOT NULL, `show_top_rated` integer DEFAULT false NOT NULL, `show_newest` integer DEFAULT true NOT NULL, `show_featured` integer DEFAULT true NOT NULL, `home_products_limit` integer DEFAULT 6 NOT NULL, `watermark_opacity` integer DEFAULT 25 NOT NULL, `show_subcategory_products_in_parent` integer DEFAULT 1 NOT NULL, site_name_ar TEXT DEFAULT '' NOT NULL, site_name_en TEXT DEFAULT '' NOT NULL, seo_description TEXT DEFAULT '' NOT NULL, favicon_url TEXT DEFAULT '' NOT NULL, watermark_enabled integer DEFAULT 1 NOT NULL, watermark_x real DEFAULT 90 NOT NULL, watermark_y real DEFAULT 90 NOT NULL, watermark_size real DEFAULT 24 NOT NULL, meta_pixel_id text DEFAULT '' NOT NULL, meta_pixel_enabled integer DEFAULT 0 NOT NULL);

CREATE TABLE supplier_import_jobs(source TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'running',next_page INTEGER NOT NULL DEFAULT 1,pages_scanned INTEGER NOT NULL DEFAULT 0,created_count INTEGER NOT NULL DEFAULT 0,skipped_count INTEGER NOT NULL DEFAULT 0,last_fingerprint TEXT,last_error TEXT,next_attempt_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0, last_response TEXT);

CREATE TABLE supplier_import_lock(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT,expires_at INTEGER NOT NULL DEFAULT 0);

CREATE TABLE supplier_import_seed(source TEXT NOT NULL,source_id INTEGER NOT NULL,data TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(source,source_id));

CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_number` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`full_name` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`wholesale_enabled` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `variant_option_values` (
	`variant_id` integer NOT NULL,
	`option_value_id` integer NOT NULL,
	PRIMARY KEY(`variant_id`, `option_value_id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_value_id`) REFERENCES `product_option_values`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `wishlists` (
	`user_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX admin_audit_time ON admin_audit_log(created_at);

CREATE UNIQUE INDEX admin_customer_account_unique ON admin_customers(account_id) WHERE account_id IS NOT NULL;

CREATE INDEX admin_customer_orders_customer ON admin_customer_orders(customer_id);

CREATE INDEX admin_customer_payments_order ON admin_customer_payments(order_id);

CREATE INDEX admin_sessions_user ON admin_sessions(user_id);

CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);

CREATE UNIQUE INDEX `categories_number_unique` ON `categories` (`category_number`);

CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);

CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);

CREATE INDEX idx_marketing_events_campaign ON marketing_events(source,medium,campaign,occurred_at);

CREATE INDEX idx_marketing_events_day ON marketing_events(local_day,event_name);

CREATE INDEX idx_marketing_events_product ON marketing_events(product_id,event_name,occurred_at);

CREATE INDEX idx_marketing_events_time ON marketing_events(occurred_at);

CREATE INDEX idx_marketing_events_visitor ON marketing_events(visitor_hash,occurred_at);

CREATE UNIQUE INDEX idx_marketing_purchase_order ON marketing_events(order_number) WHERE event_name='purchase' AND order_number IS NOT NULL;

CREATE INDEX idx_marketing_search_terms_term_time ON marketing_search_terms(term,occurred_at);

CREATE INDEX idx_marketing_search_terms_time ON marketing_search_terms(occurred_at);

CREATE INDEX idx_store_browser_activity_seen ON store_browser_activity(last_seen_at);

CREATE INDEX idx_store_cart_snapshots_updated ON store_cart_snapshots(updated_at);

CREATE INDEX image_processing_status_product_idx ON image_processing_status(product_id);

CREATE INDEX image_processing_status_status_idx ON image_processing_status(status);

CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);

CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);

CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);

CREATE INDEX `orders_status_idx` ON `orders` (`status`);

CREATE UNIQUE INDEX `policies_slug_unique` ON `policies` (`slug`);

CREATE INDEX `product_keywords_keyword_idx` ON `product_keywords` (`keyword`);

CREATE INDEX `product_media_product_idx` ON `product_media` (`product_id`);

CREATE INDEX `product_media_variant_idx` ON `product_media` (`variant_id`);

CREATE INDEX `product_option_values_option_idx` ON `product_option_values` (`option_id`);

CREATE INDEX `product_options_product_idx` ON `product_options` (`product_id`);

CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);

CREATE UNIQUE INDEX `product_variants_sku_unique` ON `product_variants` (`sku`);

CREATE INDEX `products_active_idx` ON `products` (`active`);

CREATE INDEX `products_category_idx` ON `products` (`category_id`);

CREATE UNIQUE INDEX `products_item_number_unique` ON `products` (`item_number`);

CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);

CREATE INDEX `purchase_items_purchase_idx` ON `purchase_items` (`purchase_id`);

CREATE UNIQUE INDEX `purchases_number_unique` ON `purchases` (`purchase_number`);

CREATE INDEX `purchases_supplier_idx` ON `purchases` (`supplier_id`);

CREATE INDEX push_jobs_pending ON push_jobs(status,next_attempt);

CREATE INDEX push_subscriptions_account ON push_subscriptions(account_id,role,disabled);

CREATE INDEX pwa_installations_surface ON pwa_installations(surface);

CREATE INDEX `reviews_product_idx` ON `reviews` (`product_id`);

CREATE UNIQUE INDEX `suppliers_number_unique` ON `suppliers` (`supplier_number`);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE INDEX `users_phone_idx` ON `users` (`phone`);

INSERT INTO store_settings(id,store_name,created_at,updated_at) VALUES(1,'المتجر',0,0);

INSERT INTO store_profile(id,settings_json,updated_at) VALUES(1,'{}',0);

CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);

INSERT INTO d1_migrations(name) VALUES('0000_solid_toad.sql');

INSERT INTO d1_migrations(name) VALUES('0001_manual_order_source.sql');

INSERT INTO d1_migrations(name) VALUES('0001_storefront_settings.sql');

INSERT INTO d1_migrations(name) VALUES('0002_product_customization.sql');

INSERT INTO d1_migrations(name) VALUES('0003_category_icon.sql');

INSERT INTO d1_migrations(name) VALUES('0004_home_sections.sql');

INSERT INTO d1_migrations(name) VALUES('0005_watermark_opacity.sql');

INSERT INTO d1_migrations(name) VALUES('0006_subcategory_products_in_parent.sql');

INSERT INTO d1_migrations(name) VALUES('0007_image_processing_status.sql');

INSERT INTO d1_migrations(name) VALUES('0008_clear_fake_orders.sql');

INSERT INTO d1_migrations(name) VALUES('0009_highlight_views.sql');

INSERT INTO d1_migrations(name) VALUES('0010_highlight_image_views.sql');

INSERT INTO d1_migrations(name) VALUES('0011_store_identity_seo.sql');

INSERT INTO d1_migrations(name) VALUES('0012_clear_imported_error_descriptions.sql');

INSERT INTO d1_migrations(name) VALUES('0013_web_push.sql');

INSERT INTO d1_migrations(name) VALUES('0014_cart_snapshots.sql');

INSERT INTO d1_migrations(name) VALUES('0015_import_new_dofesh_oct11.sql');

INSERT INTO d1_migrations(name) VALUES('0016_cart_details.sql');

INSERT INTO d1_migrations(name) VALUES('0017_staged_supplier_imports.sql');

INSERT INTO d1_migrations(name) VALUES('0018_supplier_discount_snapshot.sql');

INSERT INTO d1_migrations(name) VALUES('0019_resume_supplier_imports.sql');

INSERT INTO d1_migrations(name) VALUES('0020_supplier_response_format.sql');

INSERT INTO d1_migrations(name) VALUES('0021_supplier_import_diagnostics.sql');

INSERT INTO d1_migrations(name) VALUES('0022_complete_supplier_card_parser.sql');

INSERT INTO d1_migrations(name) VALUES('0023_browser_activity.sql');

INSERT INTO d1_migrations(name) VALUES('0024_push_job_errors.sql');

INSERT INTO d1_migrations(name) VALUES('0025_pwa_install_tracking.sql');

INSERT INTO d1_migrations(name) VALUES('0026_admin_order_edit.sql');

INSERT INTO d1_migrations(name) VALUES('0027_jabari_variant_audit.sql');

INSERT INTO d1_migrations(name) VALUES('0028_internal_marketing_analytics.sql');

INSERT INTO d1_migrations(name) VALUES('0029_marketing_search_terms.sql');

INSERT INTO d1_migrations(name) VALUES('0030_customer_ledger.sql');

INSERT INTO d1_migrations(name) VALUES('0031_admin_permissions.sql');

INSERT INTO d1_migrations(name) VALUES('0032_nonexpiring_user_passwords.sql');

INSERT INTO d1_migrations(name) VALUES('0033_store_profile.sql');

CREATE TABLE IF NOT EXISTS order_inventory_policies(order_id INTEGER PRIMARY KEY,tracking_enabled INTEGER NOT NULL CHECK(tracking_enabled IN (0,1)),FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
INSERT INTO d1_migrations(name) VALUES('0034_order_inventory_policy.sql');
