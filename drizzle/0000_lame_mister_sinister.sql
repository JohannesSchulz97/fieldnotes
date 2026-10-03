CREATE TABLE `vocab_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`lemma` text NOT NULL,
	`part_of_speech` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`translation` text,
	`translation_language` text NOT NULL,
	`example_sentence` text,
	`exported_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_entries_language_lemma_idx` ON `vocab_entries` (`language`,`lemma`);