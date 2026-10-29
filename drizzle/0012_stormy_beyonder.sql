DROP INDEX `vocab_entries_language_lemma_idx`;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `homograph_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `vocab_entries` SET `part_of_speech` = lower(trim(`part_of_speech`)) WHERE `part_of_speech` IS NOT NULL;--> statement-breakpoint
UPDATE `vocab_entries` SET `part_of_speech` = 'determiner' WHERE `part_of_speech` = 'preposition+determiner';--> statement-breakpoint
UPDATE `vocab_entries` SET `part_of_speech` = NULL WHERE `part_of_speech` NOT IN ('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'determiner', 'preposition', 'conjunction', 'interjection', 'numeral');--> statement-breakpoint
UPDATE `vocab_entries` SET `gender` = NULL WHERE `part_of_speech` IS NOT 'noun' OR `plural_only` = 1;--> statement-breakpoint
UPDATE `vocab_entries` SET `homograph_key` = CASE WHEN `kind` = 'expression' THEN '-|-' ELSE coalesce(`part_of_speech`, '-') || '|' || coalesce(`gender`, '-') END;--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_entries_identity_idx` ON `vocab_entries` (`language`,`lemma`,`homograph_key`);
