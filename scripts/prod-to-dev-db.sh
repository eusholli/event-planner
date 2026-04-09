#!/usr/bin/env bash
set -euo pipefail

DUMP_FILE="${1:-}"
DB_NAME="mwc26"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
PGPASSWORD="password"

if [[ -z "$DUMP_FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Error: file not found: $DUMP_FILE"
  exit 1
fi

export PGPASSWORD

echo "Dropping and recreating database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME;"

echo "Restoring from $DUMP_FILE..."
gunzip -c "$DUMP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

echo "Done. Database '$DB_NAME' restored successfully."
