# db-json/process_data.py
import json, uuid, time, os, sys, copy
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

def prune_old_events(data, cutoff_iso):
    """Remove events with startDate < cutoff_iso. Returns (data, deleted_event_ids)."""
    keep = []
    deleted_ids = set()
    for event in data["events"]:
        if event["startDate"] < cutoff_iso:
            deleted_ids.add(event["id"])
            print(f"  Pruning: {event['name']} ({event['startDate'][:10]})")
        else:
            keep.append(event)
    data["events"] = keep
    print(f"Pruned {len(deleted_ids)} events. Remaining: {len(keep)}")
    return data, deleted_ids

def cleanup_orphans(data):
    """Remove attendees not linked to any event, and companies with no attendees."""
    # Collect all attendee IDs referenced by remaining events
    referenced_attendee_ids = set()
    for event in data["events"]:
        referenced_attendee_ids.update(event.get("attendeeIds", []))

    before_a = len(data["attendees"])
    data["attendees"] = [a for a in data["attendees"] if a["id"] in referenced_attendee_ids]
    removed_a = before_a - len(data["attendees"])

    # Collect company IDs still referenced by surviving attendees
    referenced_company_ids = {a["companyId"] for a in data["attendees"] if a.get("companyId")}

    before_c = len(data["companies"])
    data["companies"] = [c for c in data["companies"] if c["id"] in referenced_company_ids]
    removed_c = before_c - len(data["companies"])

    print(f"Cleanup: removed {removed_a} orphan attendees, {removed_c} orphan companies")
    return data

if __name__ == "__main__":
    master = load_json(MASTER_FILE)
    mwc_src = load_json(MWC_FILE)
    data = copy.deepcopy(master)
    print(f"Loaded {len(data['events'])} events, {len(data['attendees'])} attendees, {len(data['companies'])} companies")
