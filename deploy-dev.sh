#!/usr/bin/env bash
# start-dev.sh — Start a local dev environment for event-planner.
# Ensures event-planner-db (PostgreSQL) and redis-dev are running,
# applies pending migrations, then starts 'npm run dev'. Uses .env as-is.
#
# event-planner-db is the local dev database, managed via docker-compose.yml.
# redis-dev is a standalone container managed by this script.
# Production runs a separate database on Hetzner — no shared state.

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# ── Ensure event-planner-db (PostgreSQL) ─────────────────────────────────────
# Managed by docker-compose.yml — use docker compose to create if missing
# so it gets the correct volume, network, and healthcheck config.
if docker ps -q -f "name=^event-planner-db$" | grep -q .; then
    echo "event-planner-db: already running"
elif docker ps -aq -f "name=^event-planner-db$" | grep -q .; then
    echo "event-planner-db: starting existing container"
    docker start event-planner-db
else
    echo "event-planner-db: not found — starting via docker compose"
    docker compose -f docker-compose.yml up -d event-planner-db
fi

# ── Ensure redis-dev ──────────────────────────────────────────────────────────
# Standalone container; required for mcp-handler SSE transport.
if docker ps -q -f "name=^redis-dev$" | grep -q .; then
    echo "redis-dev: already running"
elif docker ps -aq -f "name=^redis-dev$" | grep -q .; then
    echo "redis-dev: starting existing container"
    docker start redis-dev
else
    echo "redis-dev: creating container"
    docker run -d \
        --name redis-dev \
        -p "127.0.0.1:6379:6379" \
        --restart unless-stopped \
        redis:alpine
fi

# ── Apply pending migrations ──────────────────────────────────────────────────
# Applies any pending migration files; creates schema on first run.
# Prompts for a name if schema.prisma has changed without a migration file.
echo "Applying pending migrations..."
npx prisma migrate dev

# ── Start Next.js dev server ──────────────────────────────────────────────────
echo "Starting dev server on http://localhost:3000"
npm run dev
