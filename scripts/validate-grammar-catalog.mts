/**
 * Validates grammar catalogues against the format in src/lib/grammar-catalog/schema.ts.
 *
 *   npm run grammar:validate        # every catalogue
 *   npm run grammar:validate -- fr  # one language
 *
 * Exits with 1 if any catalogue has problems.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogProblems, GrammarCatalog } from "../src/lib/grammar-catalog/schema";

const dir = join(import.meta.dirname, "../src/lib/grammar-catalog");
const languages = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => /^[a-z]{2}\.json$/.test(f))
  .filter((f) => languages.length === 0 || languages.includes(f.slice(0, 2)));

if (files.length === 0) {
  console.error("No catalogue found.");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const parsed = GrammarCatalog.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const problems = parsed.success
    ? catalogProblems(parsed.data)
    : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (parsed.success && parsed.data.language !== file.slice(0, 2)) {
    problems.push(`language "${parsed.data.language}" does not match the file name`);
  }
  if (problems.length > 0) {
    failed = true;
    console.log(`${file}: ${problems.length} problem(s)`);
    for (const p of problems) console.log(`  - ${p}`);
    continue;
  }
  const c = parsed.data!.constructs;
  const active = c.filter((x) => !x.deprecated);
  console.log(`${file}: ok, ${active.length} constructs (${active.filter((x) => x.card).length} with cards)`);
}
process.exit(failed ? 1 : 0);
