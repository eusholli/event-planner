#!/bin/bash

# scripts/db-reset-prod.sh

echo "⚠️  DANGER ZONE: PROD DATABASE RESET ⚠️"
echo "This script will completely WIPE (Delete) all data in the target database and re-apply all migrations."
echo ""
echo "Please paste your connection string (e.g., postgresql://postgres.xxxx:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true):"
read -r -s DB_URL

if [ -z "$DB_URL" ]; then
    echo "Error: No connection string provided."
    exit 1
fi

echo ""
echo "You provided a connection string."
echo "Are you ABSOLUTELY SURE you want to reset this database? (Type 'yes' to confirm)"
read -r CONFIRMATION

if [ "$CONFIRMATION" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

echo "Resetting database..."
DATABASE_URL="$DB_URL" npx prisma migrate reset --force

echo "Database reset complete. Seed data (if any) has been applied."
