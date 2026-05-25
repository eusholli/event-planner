#!/usr/bin/env bash
# stop-dev.sh — Stop the dev containers.
# Stops redis-dev and event-planner-db.
# Data is preserved in Docker volumes; run start-dev.sh to resume.

set -e

for name in redis-dev event-planner-db; do
    if docker ps -q -f "name=^${name}$" | grep -q .; then
        echo "Stopping ${name}..."
        docker stop "${name}"
    else
        echo "${name}: not running, skipping"
    fi
done

echo "Done. Run ./start-dev.sh to restart."
