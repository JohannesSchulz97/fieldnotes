CREATE TABLE `extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`text_hash` text NOT NULL,
	`text` text NOT NULL,
	`source_language` text NOT NULL,
	`target_language` text NOT NULL,
	`items` text NOT NULL,
	`cost_usd` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extractions_text_hash_idx` ON `extractions` (`text_hash`);