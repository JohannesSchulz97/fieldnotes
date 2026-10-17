<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hosting and future multi-user path

Currently a single-user app. Planned hosting: Vercel + hosted Turso (libSQL), protected by Cloudflare Access, on a subdomain of johannesschulz.dev. Multi-user accounts with paid AI usage are only a possible future; do not build for it now, but avoid choices that make it hard.

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
