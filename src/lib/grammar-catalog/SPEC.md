# Grammar catalogue specification

A grammar catalogue is the fixed list of grammatical constructs of one language, like the table of contents of a learner's grammar book. The app classifies grammar in the learner's texts against it instead of inventing names, so the same construct always gets the same name, at the same granularity.

One file per language: `src/lib/grammar-catalog/<code>.json` (ISO 639-1 code), in the format of `schema.ts`. It is built by the `/grammar-catalog <code> <phase>` command, reviewed by a person, and committed. It is not regenerated automatically.

Follow this spec exactly, so catalogues of different languages and different runs are consistent.

## Sources

Base the catalogue on authoritative sources, in this order of weight:

1. **CEFR reference level descriptions** for the language (the Council of Europe's "Reference Level Descriptions"), e.g. *Niveau A1/A2/B1/B2 pour le français* (Beacco et al.), *Plan curricular del Instituto Cervantes*, *Profile deutsch*, *English Grammar Profile*. These decide which constructs exist for learners and at which level.
2. **Official curricula and syllabi** of national language institutes or certification exams (e.g. DELF/DALF, Goethe, DELE).
3. **Reference grammars** for learners of the language, and their tables of contents.

Record every source you use in `sources`, with its type. Every construct cites at least one source. Prefer sources you could actually consult (online text, tables of contents, publisher pages, academic summaries); do not cite a source for content you have not seen. When sources disagree about a level, use the reference level description.

Never copy text from a source. Descriptions and cards are your own words, based on the sources: rules are facts, their wording is not.

## Scope and granularity

- Levels **A1 to C1**. Include C2 only for constructs that are common in ordinary written texts (newspapers, novels).
- **One entry = one form with its meaning or use, at the level of a section or subsection of a learner's grammar book.** The test: would a grammar book give it its own heading with its own explanation and exercises?
- Split **formation** from **use** when grammar books teach them separately and the use is triggered by a class of contexts. Example: "subjonctif présent (formation)" is one entry, "subjonctif après expressions de volonté" and "subjonctif après conjonctions de concession" are entries of their own.
- Do not split by individual words. A construct triggered by a class of words is one entry ("subjonctif après conjonctions de concession", not one entry each for "bien que" and "quoique").
- Do not include vocabulary, idioms, fixed expressions, spelling or pronunciation.
- Typical size: 150 to 300 entries for A1 to C1. Fewer means the entries are too broad; more means they are split by words or by details a grammar book would not separate.

## Fields

- **id**: a lowercase ASCII slug of the name, e.g. `subjonctif-apres-concession`. Ids are permanent: never change, reuse or remove an id once committed (see Updating).
- **name**: the canonical name, in the language's own grammatical terminology, lowercase except where the language requires capitals. Format: `<usual grammatical term>` or `<usual grammatical term> (<pattern or use>)`. The pattern uses grammatical categories (infinitif, participe passé, que + subjonctif), never example words.
  - **Never put a specific word form in the name**, unless the construct exists only with that word. Wrong: "participe présent (étant)". Right: "participe présent".
  - Use the term learners meet in grammar books, not a linguist's term.
- **aliases**: other names a learner or a grammar book might use, in the language and in English (e.g. "gerund" for "gérondif"). They help classification.
- **category**: one of `schema.ts`'s categories: tense_aspect (tenses, aspect), mood (subjunctive, conditional, imperative), non_finite (infinitive, participles, gerund), voice (passive, causative, reflexive voice), pronouns, determiners (articles, partitives, possessives, quantifiers), agreement, prepositions, negation, questions, clauses (subordination, conjunctions, conditionals, reported speech), comparison, word_order, other.
- **level**: the CEFR level at which the construct is introduced, from the reference level description.
- **description**: what the construct is, in one line, in the explanation language.
- **lexical**: true only if the construct exists only with specific words, e.g. "ne … que", "il y a", "venir de + infinitif". Then the name may and should contain those words.
- **sources**: ids of the sources that list it.

## Phases

### Phase `list`

Build the entries without cards.

1. Find the sources for the language. Start with its reference level description; record what you consulted.
2. Collect candidate constructs from the sources' inventories and tables of contents, level by level.
3. Merge duplicates and apply the granularity rules. Check every name against the naming rules.
4. Order entries by category (in the order listed above), then by level, then by how grammar books order them.
5. Write the file with `"explanationLanguage": "en"`, run `npm run grammar:validate -- <code>`, and fix every problem.
6. Report: the sources used, the number of entries per category and per level, and the entries you were unsure about (granularity, level, lexical), so the reviewer can check them first.

### Phase `cards`

Add a `card` to every entry that has none, category by category. Do not change ids, names or levels; if one looks wrong, list it in the report instead.

- **formation**: how it is built, 1-3 sentences.
- **use**: what it expresses and when it is used, 1-3 sentences.
- **pitfalls**: up to 5 typical learner mistakes or traps, one short sentence each.
- **contrasts**: up to 5 related constructs of this catalogue it is easily confused with, by id, each with how they differ.
- **examples**: 2-4 short, everyday sentences (at most 12 words) showing the construct clearly, with no other difficult grammar. `form` is the part that shows the construct, copied exactly from the sentence; `translation` is in the explanation language.

Run the validator after each category. Report entries whose card you were unsure about.

## Updating

When the catalogue exists, update it in place:

- Keep all ids. Add new entries with new ids.
- To retire an entry, set `deprecated` with a reason and, if another entry replaces it, `replacedBy`. Never delete an entry: saved grammar items refer to its id.
- Renaming an entry keeps its id; put the old name in `aliases`.
- Report every change, so the diff can be reviewed.
