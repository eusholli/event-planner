#!/bin/bash

echo "🚀 Starting Verification Wrapper..."

# 1. Set Auth Bypass
export NEXT_PUBLIC_DISABLE_CLERK_AUTH=true

# 2. Start Server in Background
echo "Starting Next.js server..."
npm run dev > server.log 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"

# 3. Wait for Server
echo "Waiting for server to be ready on port 3000..."
MAX_RETRIES=30
count=0
while ! nc -z localhost 3000; do   
  sleep 1
  count=$((count+1))
  if [ $count -ge $MAX_RETRIES ]; then
    echo "Timed out waiting for server."
    kill $SERVER_PID
    exit 1
  fi
done
echo "Server is up!"

# 4. Run Test Script
echo "Running verification script..."
# Using npx tsx to execute the TS file
npx tsx scripts/verify-db-export-import.ts
EXIT_CODE=$?

# 5. Cleanup
echo "Stopping server..."
kill $SERVER_PID

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Verification SUCCEEDED"
    exit 0
else
    echo "❌ Verification FAILED"
    exit 1
fi
