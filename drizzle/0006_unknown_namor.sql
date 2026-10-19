CREATE TABLE `grammar_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`grammar_item_id` text NOT NULL,
	`origin` text NOT NULL,
	`sentence` text NOT NULL,
	`form` text NOT NULL,
	`translation` text,
	`extraction_id` text,
	`sentence_index` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`grammar_item_id`) REFERENCES `grammar_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grammar_examples_item_sentence_idx` ON `grammar_examples` (`grammar_item_id`,`sentence`);--> statement-breakpoint
CREATE TABLE `grammar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`explanation` text NOT NULL,
	`explanation_language` text NOT NULL,
	`status` text DEFAULT 'to_work_on' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grammar_items_language_name_idx` ON `grammar_items` (`language`,`name`);