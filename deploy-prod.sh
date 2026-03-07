#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Deploying event-planner to production..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "Deployment complete. App available at https://events.maximh.us"
