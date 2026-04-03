#!/bin/bash
set -e

# Configuration
DB_CONTAINER_NAME="event-planner-test-upgrade-db"
DB_PORT=5433
DB_USER="postgres"
DB_PASS="test"
DB_NAME="eventplanner"

if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_db_dump.sql.gz>"
  echo "Example: $0 ./prod-backup-2026.sql.gz"
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Error: File $DUMP_FILE not found."
  exit 1
fi

echo "🚀 [1/6] Starting temporary isolated database container..."
# Temporarily disable exit on error in case the container doesn't exist
set +e
docker rm -f $DB_CONTAINER_NAME >/dev/null 2>&1
set -e

docker run --name $DB_CONTAINER_NAME \
  -e POSTGRES_PASSWORD=$DB_PASS \
  -e POSTGRES_DB=$DB_NAME \
  -p $DB_PORT:5432 \
  -d postgres:15-alpine >/dev/null

echo "⏳ Waiting for database to be ready..."
# Loop until pg_isready returns 0
while ! docker exec -i $DB_CONTAINER_NAME pg_isready -U $DB_USER -d $DB_NAME >/dev/null 2>&1; do
    sleep 1
done
# Give it an extra second after pg_isready passes to ensure fully capable state
sleep 1 

echo "📦 [2/6] Restoring database from $DUMP_FILE into test container..."
# Using gunzip -c to stream the decompression directly via pipe to docker container
gunzip -c "$DUMP_FILE" | docker exec -i $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME > /dev/null

echo "📊 [3/6] Counting rows BEFORE migration..."
# We use a dynamic SQL query to get exact count of all tables in the `public` schema
# Note: Since PostgreSQL count(*) can be slow on massive tables, an exact count like this is optimal for this test footprint.
SQL_QUERY=$(cat << 'EOF'
SELECT table_name,
       (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
FROM (
  SELECT table_name, query_to_xml(format('select count(*) as cnt from %I', table_name), false, true, '') as xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
) t ORDER BY table_name;
EOF
)

docker exec -i $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -t -A -c "$SQL_QUERY" > /tmp/before_counts.txt

echo "🧬 [3.5/6] Generating Deep Checksums for all original values..."
# We set inline connection URLs for both the Node shell and Prisma
export POSTGRES_PRISMA_URL="postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME"
export POSTGRES_URL_NON_POOLING="postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME"
node scripts/deep-checksum.js before

echo "🔄 [4/6] Running Prisma Migrations (migrate deploy)..."

npx prisma migrate deploy

echo "📊 [5/6] Counting rows AFTER migration..."
docker exec -i $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -t -A -c "$SQL_QUERY" > /tmp/after_counts.txt

echo "🔍 Comparing before and after states..."
if cmp -s /tmp/before_counts.txt /tmp/after_counts.txt; then
   echo ""
   echo "========================================================="
   echo "✅ SUCCESS: All table row counts match exactly."
   echo "========================================================="
   echo ""
else
   echo ""
   echo "⚠️  Differences found. Here is what changed:"
   echo "---------------------------------------------------------"
   awk -F'|' '
     FNR==NR { before[$1]=$2; next }
     {
       after[$1]=$2
       if (!($1 in before)) {
         print "🆕 NEW TABLE: " $1 " (Created with " $2 " initial rows)"
       } else if (before[$1] != $2) {
         diff = $2 - before[$1]
         sign = diff > 0 ? "+" : ""
         print "📈 ROWS CHANGED: " $1 " (" before[$1] " -> " $2 " | " sign diff " rows)"
       }
     }
     END {
       for (t in before) {
         if (!(t in after)) print "❌ TABLE DELETED: " t " (Had " before[t] " rows)"
       }
     }
   ' /tmp/before_counts.txt /tmp/after_counts.txt
   echo "---------------------------------------------------------"
   echo ""
fi

echo "🧬 GENERATING MATHEMATICAL PROOF OF NO DATA LOSS..."
node scripts/deep-checksum.js after

# Step 6: Manual Testing Intercept
echo "⏸️  [6/6] PAUSED FOR MANUAL TESTING"
echo "The database is still running on port $DB_PORT."
echo "To test the application locally against this upgraded DB, open a NEW terminal tab and run:"
echo ""
echo "POSTGRES_PRISMA_URL=\"postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME\" POSTGRES_URL_NON_POOLING=\"postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME\" npm run dev"
echo ""

# The crucial read that pauses execution
read -p "Press [ENTER] when you are finished testing to clean up the database..."

echo "🧹 Cleaning up container and temporary snapshots..."
docker rm -f $DB_CONTAINER_NAME >/dev/null
rm -rf /tmp/eventplanner_snapshots

echo "✅ Test completed successfully."
