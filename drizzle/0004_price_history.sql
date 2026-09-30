CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`date` text NOT NULL,
	`close_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_history_asset_date` ON `price_history` (`asset_id`,`date`);--> statement-breakpoint
CREATE INDEX `price_history_date` ON `price_history` (`date`);
