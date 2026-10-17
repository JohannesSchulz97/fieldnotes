import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/vocab.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
