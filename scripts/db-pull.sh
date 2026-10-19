#!/usr/bin/env bash
# Replaces the local dev database with a fresh copy of the hosted Turso database.
#
# The hosted database is the source of truth; the local file is a throwaway copy for development.
# Run this before working locally. Local writes are lost on the next pull.
#
#   npm run db:pull                  # database "fieldnotes"
#   TURSO_DB=other npm run db:pull   # another database
#
# Needs the Turso CLI, logged in (`turso auth login`). The previous local file is kept as
# data/vocab.pre-pull.db.
set -euo pipefail

db_name="${TURSO_DB:-fieldnotes}"
target="data/vocab.db"
turso_bin="$(command -v turso || echo "$HOME/.turso/turso")"

if [[ ! -x "$turso_bin" ]]; then
  echo "Turso CLI not found. Install it: https://docs.turso.tech/cli/installation" >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null; then
  echo "sqlite3 not found." >&2
  exit 1
fi

# A process with the old file open (e.g. `next dev`) can no longer write once it is replaced.
if [[ -f "$target" ]] && command -v lsof >/dev/null && lsof "$target" >/dev/null 2>&1; then
  echo "$target is open in another process (probably the dev server). Stop it first, then pull again." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Dumping hosted database \"$db_name\"..."
"$turso_bin" db shell "$db_name" .dump > "$tmp/dump.sql"
grep -q '^COMMIT;' "$tmp/dump.sql" || { echo "Dump looks incomplete, local file left unchanged." >&2; exit 1; }

sqlite3 "$tmp/vocab.db" < "$tmp/dump.sql"

mkdir -p data
if [[ -f "$target" ]]; then
  cp "$target" data/vocab.pre-pull.db
fi
rm -f "$target-wal" "$target-shm"
mv "$tmp/vocab.db" "$target"

echo "Done. $target now matches \"$db_name\":"
sqlite3 "$target" "select '  vocabulary: ' || count(*) from vocab_entries; select '  grammar items: ' || count(*) from grammar_items; select '  sources: ' || count(*) from extractions;"
