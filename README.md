# Fieldnotes

**Fieldnotes is a language-learning tool for curious people, not curriculum followers.**

Children don’t learn from lesson plans. They pick up a language from songs, stories and conversations, following their curiosity. Fieldnotes is built for learning that way. Hear a lyric, read an article, catch a line from a film: drop it in and take it apart. The new words, the grammar holding it together, what it really means.

However, freedom doesn’t mean chaos. Underneath runs a systematic engine.
Every find feeds a living map of what you know: your vocabulary, your grammar, measured against a full catalogue, and the mistakes you keep making. Based on that map, an AI integration will support your learning journey, by creating exercises that target your actual errors using words you already know.

And when you just want to talk, you can chat in the language you’re learning with an AI that knows exactly where you are. It uses the words and grammar you know and stretches you a little beyond them.

No streaks, no fixed path. Just your own notes from the field, with real structure behind them.

## Development

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database

The hosted Turso database is the source of truth. Local development uses `data/vocab.db`, a throwaway copy of it:

```bash
npm run db:pull            # replace data/vocab.db with a fresh copy of the hosted database
npm run db:migrate         # apply new migrations to data/vocab.db
npm run db:migrate:remote  # apply them to the hosted database (reads .env.turso)
```

Pull before working locally; local changes are overwritten by the next pull. Needs the [Turso CLI](https://docs.turso.tech/cli/installation), logged in.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
