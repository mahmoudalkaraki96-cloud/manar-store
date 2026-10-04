CREATE TABLE `ai_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`cost` integer NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_month` ON `ai_usage` (`month`);--> statement-breakpoint
INSERT INTO ai_control (id,enabled) VALUES (1,1);
