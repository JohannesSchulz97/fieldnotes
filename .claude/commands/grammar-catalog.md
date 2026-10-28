---
description: Build or update the grammar catalogue of a language from authoritative sources
argument-hint: <language code> <list|cards>
---

Build or update the grammar catalogue for these arguments: $ARGUMENTS

The first argument is the ISO 639-1 language code (e.g. `fr`), the second the phase (`list` or `cards`). If either is missing, ask for it.

1. Read `src/lib/grammar-catalog/SPEC.md` and `src/lib/grammar-catalog/schema.ts` completely, and follow the spec exactly. It is what keeps catalogues consistent across languages and runs.
2. If `src/lib/grammar-catalog/<code>.json` exists, read it and update it in place following the spec's "Updating" rules. Otherwise create it.
3. Research the sources on the web as the spec describes. Do not rely on memory alone for which constructs a reference level description lists or at which level.
4. Run the phase. Run `npm run grammar:validate -- <code>` until it reports no problems.
5. End with the report the phase asks for. Do not commit; the catalogue is reviewed first.
