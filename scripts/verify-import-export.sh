#!/bin/bash

# Base URL
BASE_URL="http://127.0.0.1:3000"

# 1. Export Data
echo "Exporting data..."
curl -v "$BASE_URL/api/settings/export" > export.json 2> curl_output.txt

# Check if export was successful
if [ ! -s export.json ]; then
    echo "Export failed: Empty file"
    cat curl_output.txt
    exit 1
fi

echo "Export successful. Checking content..."
cat export.json | head -n 20

# 2. Modify Data (Change Event Name)
echo "Modifying data..."
# Use sed to replace "My Event" with "Updated Dynamic Event"
# We assume the event name is "My Event" or whatever is current. 
# Let's just use jq if available, or simple sed.
# Assuming "name": "..." in the event object.

sed -i '' 's/"name": ".*"/"name": "Updated Dynamic Event"/' export.json

# 3. Import Data
echo "Importing data..."
curl -s -X POST -F "file=@export.json" "$BASE_URL/api/settings/import"

# 4. Verify Update
echo "Verifying update..."
# We can check the settings API or just export again
curl -s "$BASE_URL/api/settings" > settings.json

if grep -q "Updated Dynamic Event" settings.json; then
    echo "SUCCESS: Event name updated dynamically!"
else
    echo "FAILURE: Event name not updated."
    cat settings.json
    exit 1
fi
