#!/usr/bin/env bash
# stop-dev.sh — Stop the dev database container.
# Data is preserved in the Docker volume; run start-dev.sh to resume.

set -e
cd "$(dirname "$0")"

echo "Stopping dev database..."
docker compose -f docker-compose.dev.yml stop
echo "Done. Data preserved. Run ./start-dev.sh to restart."
