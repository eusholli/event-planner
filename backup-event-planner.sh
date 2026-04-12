#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

# 1. Define Paths
# IMPORTANT: Change this to the directory where your docker-compose.yml and .env file live
PROJECT_DIR="/opt/event-planner"
cd "$PROJECT_DIR"

# 2. Load Environment Variables from .env
# This safely exports your secrets without printing them to the screen
set -a
source .env
set +a

# 3. Set Variables
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
SQL_FILENAME="backup-${TIMESTAMP}.sql.gz"

echo "Starting backup process at $(date)..."

# 4. Generate SQL Backup via Docker Exec
# We run pg_dump inside the running DB container and pipe it out to the host
echo "Creating SQL dump..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" event-planner-db pg_dump -U postgres eventplanner | gzip > "$SQL_FILENAME"

# 5. Upload to Cloudflare R2 using a temporary AWS CLI Docker container
# This mounts the current directory into the container, uploads the files, and then destroys the container
echo "Uploading to Cloudflare R2..."
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="us-east-1" \
  amazon/aws-cli \
  s3 cp "$SQL_FILENAME" "s3://db-backups/$SQL_FILENAME" --endpoint-url "$R2_ENDPOINT"

# 6. Clean up local files to save disk space on the Hetzner VPS
echo "Cleaning up local files..."
rm "$SQL_FILENAME"

echo "Backup completed successfully at $(date)."
