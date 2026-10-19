CREATE TABLE `exercise_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercise_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`grammar_item_id` text NOT NULL,
	`language` text NOT NULL,
	`level` text NOT NULL,
	`cost_usd` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`grammar_item_id`) REFERENCES `grammar_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`position` integer NOT NULL,
	`before` text NOT NULL,
	`answer` text NOT NULL,
	`after` text NOT NULL,
	`alternatives` text NOT NULL,
	`cue` text NOT NULL,
	`translation` text NOT NULL,
	`reason` text NOT NULL,
	`unknown_words` text NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `exercise_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
