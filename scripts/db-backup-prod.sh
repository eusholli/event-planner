#!/bin/bash

# scripts/db-backup-prod.sh
# Creates a pg_dump backup in the same format as the System Export (*.sql.gz).

echo "Please paste your connection string (e.g., postgresql://postgres:password@localhost:5432/eventplanner):"
read -r DB_URL

if [ -z "$DB_URL" ]; then
    echo "Error: No connection string provided."
    exit 1
fi

# Parse connection components
DB_HOST=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@[^/]+/([^?]+).*|\1|')

# Default port if not specified
if [ "$DB_PORT" = "$DB_URL" ]; then
    DB_PORT="5432"
fi

# Generate filename matching lib/db-shell.ts getBackupFilename()
# Format: <dbname>-YYYY-MM-DD-HH-MM-SS.sql.gz
TIMESTAMP=$(date -u '+%Y-%m-%d-%H-%M-%S')
FILENAME="${DB_NAME}-${TIMESTAMP}.sql.gz"

echo ""
echo "Database : $DB_NAME"
echo "Host     : $DB_HOST:$DB_PORT"
echo "User     : $DB_USER"
echo "Output   : $FILENAME"
echo ""

PG_DUMP=$(command -v pg_dump)
for candidate in /opt/homebrew/opt/postgresql@15/bin/pg_dump /usr/local/opt/postgresql@15/bin/pg_dump; do
    if [ -x "$candidate" ]; then PG_DUMP="$candidate"; break; fi
done

PGPASSWORD="$DB_PASS" "$PG_DUMP" \
    --clean \
    --if-exists \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    "$DB_NAME" \
    | gzip > "$FILENAME"

if [ $? -eq 0 ]; then
    echo "Backup complete: $FILENAME"
else
    echo "Error: pg_dump failed."
    rm -f "$FILENAME"
    exit 1
fi
