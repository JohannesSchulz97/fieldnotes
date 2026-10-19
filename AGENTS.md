<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hosting and future multi-user path

Currently a single-user app. Planned hosting: Vercel + hosted Turso (libSQL), protected by Cloudflare Access, on a subdomain of johannesschulz.dev. Multi-user accounts with paid AI usage are only a possible future; do not build for it now, but avoid choices that make it hard.

# Language-generic vision

Currently French (source) to English (target), but the app is meant to become language-generic. Treat French as the first instance of a general design, not as the design.

- Store linguistic facts as data, not as formatting: e.g. a noun's grammatical gender is its own field and the lemma stays bare. How a word is shown (articles, gender markers, elision) is a per-language display rule, kept in one place, not baked into stored lemmas or prompts.
- Lemma strings are match keys across extraction, normalization and stored vocab. They must be deterministic: never let the model make a presentational choice that ends up inside a lemma.
- Do not hard-code French in prompts, schema or UI where it is cheap to parameterize (language codes, article systems, gender sets, e.g. m/f/n/common or none).
- Features should degrade for languages without the concept (no gender, no articles).

## Habits that keep migration cheap

- Keep all DB access in `src/lib/db/*` so adding `user_id` scoping touches few places.
- Avoid app-wide global state for things that would become per-user (settings, language, export config).
- Treat language and prompt config as data, not hard-coded constants, where it is already being touched.
- Keep the OpenAI key server-side only.

## If going multi-user

1. Auth: replace Cloudflare Access with app-level auth (Auth.js, Better Auth or Clerk).
2. Schema: add `user_id` to vocab, extractions, settings and usage; scope every query; backfill existing rows to the owner.
3. Per-user settings and languages; prompts and schema stop assuming French.
4. Billing: Stripe with usage metering (the `usage` table is the base); prefer pay-per-use credits over subscriptions.
5. Abuse and cost control: rate limits and per-user caps.
6. Database: Turso/SQLite is fine at small to medium scale. Switching to Postgres (Neon/Supabase) is a Drizzle dialect swap plus a one-time data export, roughly 1-2 days.
