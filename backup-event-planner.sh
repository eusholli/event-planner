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
JSON_FILENAME="backup-${TIMESTAMP}.json"

# Set the APP URL to hit your live domain for the JSON export
APP_URL="https://www.aieventplanner.work"

echo "Starting backup process at $(date)..."

# 4. Generate SQL Backup via Docker Exec
# We run pg_dump inside the running DB container and pipe it out to the host
echo "Creating SQL dump..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" event-planner-db pg_dump -U postgres eventplanner | gzip > "$SQL_FILENAME"

# 5. Generate JSON Backup via curl
echo "Fetching JSON export from $APP_URL..."
curl -f -s "$APP_URL/api/settings/export" \
  -H "x-backup-key: $BACKUP_SECRET_KEY" \
  -o "$JSON_FILENAME"

# 6. Upload to Cloudflare R2 using a temporary AWS CLI Docker container
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

docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="us-east-1" \
  amazon/aws-cli \
  s3 cp "$JSON_FILENAME" "s3://db-backups/$JSON_FILENAME" --endpoint-url "$R2_ENDPOINT"

# 7. Clean up local files to save disk space on the Hetzner VPS
echo "Cleaning up local files..."
rm "$SQL_FILENAME" "$JSON_FILENAME"

echo "Backup completed successfully at $(date)."
