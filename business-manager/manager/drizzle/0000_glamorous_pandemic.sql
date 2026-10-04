CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_business_kind` ON `records` (`business`,`kind`);