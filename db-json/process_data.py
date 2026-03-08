# db-json/process-data.py
import json, uuid, time, os, sys
from datetime import datetime, timezone

MASTER_FILE = "db-json/master-data-030826.json"
MWC_FILE = "db-json/mwc-030826.json"
OUTPUT_FILE = "db-json/master-data-030826-v2.json"
CACHE_FILE = "db-json/.enrichment-cache.json"
CUTOFF_DATE = "2026-02-28T00:00:00.000Z"

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Written: {path}")

def new_uuid():
    return str(uuid.uuid4())

if __name__ == "__main__":
    import copy
    master = load_json(MASTER_FILE)
    mwc_src = load_json(MWC_FILE)
    data = copy.deepcopy(master)
    print(f"Loaded {len(data['events'])} events, {len(data['attendees'])} attendees, {len(data['companies'])} companies")
