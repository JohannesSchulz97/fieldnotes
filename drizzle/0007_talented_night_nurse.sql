ALTER TABLE `vocab_entries` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `plural_only` integer DEFAULT false NOT NULL;