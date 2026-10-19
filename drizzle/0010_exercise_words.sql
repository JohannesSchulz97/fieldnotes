ALTER TABLE `extractions` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `exercises` DROP COLUMN `unknown_words`;--> statement-breakpoint
ALTER TABLE `exercises` ADD `words` text DEFAULT '[]' NOT NULL;