#!/bin/bash

# scripts/compare-backups.sh
# Compares two .sql.gz backup files to verify database contents are identical.
# Strips the \restrict/\unrestrict nonce lines that differ between every dump
# even when the underlying data is the same.

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <file1.sql.gz> <file2.sql.gz>"
    exit 1
fi

FILE1="$1"
FILE2="$2"

for f in "$FILE1" "$FILE2"; do
    if [ ! -f "$f" ]; then
        echo "Error: File not found: $f"
        exit 1
    fi
    if [[ "$f" != *.sql.gz ]]; then
        echo "Error: File must be a .sql.gz: $f"
        exit 1
    fi
done

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Decompressing..."
gunzip -c "$FILE1" | grep -v '^\\\(restrict\|unrestrict\)' > "$TMPDIR/a.sql"
gunzip -c "$FILE2" | grep -v '^\\\(restrict\|unrestrict\)' > "$TMPDIR/b.sql"

echo "File 1: $FILE1 ($(wc -l < "$TMPDIR/a.sql") lines)"
echo "File 2: $FILE2 ($(wc -l < "$TMPDIR/b.sql") lines)"
echo ""

if diff -u "$TMPDIR/a.sql" "$TMPDIR/b.sql"; then
    echo "✓ Files are identical (ignoring session nonce)"
else
    echo ""
    echo "✗ Files differ — see diff above"
    exit 1
fi
