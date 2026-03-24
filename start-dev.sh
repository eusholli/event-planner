#!/usr/bin/env bash
# start-dev.sh — Start a local dev environment for event-planner.
# Spins up an isolated PostgreSQL container on port 5433, runs migrations,
# then starts 'npm run dev' with hot reload on port 3000.
#
# Remote access: SSH tunnel from your local machine:
#   ssh -N -L 3000:localhost:3000 eusholli@<server-ip>
# Then open http://localhost:3000 in your browser.

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Activate dev environment file
echo "Switching to dev environment..."
cp .env.dev .env

# Start dev database (idempotent — safe to call when already running)
echo "Starting dev database (port 5433)..."
docker compose -f docker-compose.dev.yml up -d

# Wait for Postgres to accept connections
echo "Waiting for dev DB to be ready..."
until docker compose -f docker-compose.dev.yml exec -T event-planner-dev-db \
      pg_isready -U postgres -q 2>/dev/null; do
  sleep 1
done
echo "Dev DB ready."

# Apply any pending migrations (creates schema on first run)
echo "Running migrations..."
npx prisma migrate dev --skip-seed

# Start Next.js dev server with hot reload
echo ""
echo "Starting dev server on http://localhost:3000"
echo "Remote access: ssh -N -L 3000:localhost:3000 eusholli@<server-ip>"
echo ""
npm run dev
