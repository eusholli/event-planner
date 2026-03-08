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

def replace_mwc_data(data, mwc_src):
    """Replace MWC BCN 2026 event data with content from single-event mwc_src."""
    mwc_event = next((e for e in data["events"] if e["name"] == "MWC BCN 2026"), None)
    if not mwc_event:
        print("WARNING: MWC BCN 2026 not found in master data")
        return data

    mwc_id = mwc_event["id"]
    src_event = mwc_src["event"]

    # --- Update event metadata (keep preserved fields, update content fields) ---
    mwc_event["tags"] = src_event.get("tags", mwc_event.get("tags", []))
    mwc_event["meetingTypes"] = src_event.get("meetingTypes", mwc_event.get("meetingTypes", []))
    mwc_event["attendeeTypes"] = src_event.get("attendeeTypes", mwc_event.get("attendeeTypes", []))
    mwc_event["timezone"] = src_event.get("timezone") or mwc_event.get("timezone", "")
    mwc_event["boothLocation"] = src_event.get("boothLocation") or mwc_event.get("boothLocation", "")
    mwc_event["startDate"] = src_event.get("startDate", mwc_event["startDate"])
    mwc_event["endDate"] = src_event.get("endDate", mwc_event["endDate"])

    # --- Build rooms: generate UUIDs, map name -> id ---
    room_name_to_id = {}
    new_rooms = []
    for room in mwc_src.get("rooms", []):
        room_id = new_uuid()
        room_name_to_id[room["name"]] = room_id
        new_rooms.append({
            "id": room_id,
            "name": room["name"],
            "capacity": room.get("capacity", 0),
            "eventId": mwc_id,
        })
    mwc_event["rooms"] = new_rooms
    print(f"  MWC rooms: {len(new_rooms)} replaced")

    # --- Build attendee pool: match by email ---
    email_to_existing = {a["email"]: a for a in data["attendees"]}
    name_to_company = {c["name"]: c for c in data["companies"]}

    new_attendee_ids = []
    for src_att in mwc_src.get("attendees", []):
        email = src_att["email"]
        company_name = src_att.get("company", "")

        # Resolve or create company
        if company_name:
            if company_name not in name_to_company:
                co = {"id": new_uuid(), "name": company_name,
                      "description": src_att.get("companyDescription", ""),
                      "pipelineValue": 0}
                data["companies"].append(co)
                name_to_company[company_name] = co
            company_id = name_to_company[company_name]["id"]
        else:
            company_id = None

        if email in email_to_existing:
            att = email_to_existing[email]
            att["name"] = src_att.get("name", att["name"])
            att["title"] = src_att.get("title", att.get("title", ""))
            att["bio"] = src_att.get("bio", att.get("bio", ""))
            att["linkedin"] = src_att.get("linkedin", att.get("linkedin", ""))
            att["imageUrl"] = src_att.get("imageUrl", att.get("imageUrl", ""))
            att["isExternal"] = src_att.get("isExternal", att.get("isExternal", False))
            att["type"] = src_att.get("type", att.get("type", ""))
            if company_id:
                att["companyId"] = company_id
        else:
            att = {
                "id": new_uuid(),
                "name": src_att.get("name", ""),
                "email": email,
                "title": src_att.get("title", ""),
                "bio": src_att.get("bio", ""),
                "companyId": company_id,
                "linkedin": src_att.get("linkedin", ""),
                "imageUrl": src_att.get("imageUrl", ""),
                "isExternal": src_att.get("isExternal", False),
                "type": src_att.get("type", ""),
                "seniorityLevel": None,
            }
            data["attendees"].append(att)
            email_to_existing[email] = att

        new_attendee_ids.append(att["id"])

    # Build email -> UUID map for meeting attendee resolution
    email_to_id = {a["email"]: a["id"] for a in data["attendees"]}

    # --- Build meetings ---
    new_meetings = []
    for src_mtg in mwc_src.get("meetings", []):
        room_name = src_mtg.get("room")
        room_id = room_name_to_id.get(room_name) if room_name else None
        mtg_attendee_ids = [
            email_to_id[em] for em in src_mtg.get("attendees", [])
            if em in email_to_id
        ]
        new_meetings.append({
            "id": new_uuid(),
            "title": src_mtg.get("title", ""),
            "purpose": src_mtg.get("purpose", ""),
            "startTime": src_mtg.get("startTime", ""),
            "endTime": src_mtg.get("endTime", ""),
            "date": src_mtg.get("date", ""),
            "roomId": room_id,
            "sequence": src_mtg.get("sequence", 1),
            "status": src_mtg.get("status", "PIPELINE"),
            "tags": src_mtg.get("tags", []),
            "createdBy": src_mtg.get("createdBy", ""),
            "requesterEmail": src_mtg.get("requesterEmail", ""),
            "meetingType": src_mtg.get("meetingType"),
            "location": src_mtg.get("location"),
            "otherDetails": src_mtg.get("otherDetails"),
            "isApproved": src_mtg.get("isApproved", False),
            "calendarInviteSent": src_mtg.get("calendarInviteSent", False),
            "eventId": mwc_id,
            "attendees": mtg_attendee_ids,
        })
    mwc_event["meetings"] = new_meetings
    mwc_event["attendeeIds"] = new_attendee_ids
    print(f"  MWC meetings: {len(new_meetings)} replaced")
    print(f"  MWC attendees: {len(new_attendee_ids)} linked")

    # --- Remove attendees previously in MWC but not in new file ---
    data = cleanup_orphans(data)

    return data

def tavily_search(query, api_key):
    """Call Tavily Search API and return best content snippet (max 300 chars)."""
    import requests
    resp = requests.post(
        "https://api.tavily.com/search",
        json={"query": query, "search_depth": "advanced", "max_results": 3},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return ""
    # Use the highest-scored result
    best = max(results, key=lambda r: r.get("score", 0))
    content = best.get("content", "").strip()
    return content[:300] if content else ""

def load_cache(cache_file):
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache, cache_file):
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

def enrich_with_tavily(data, cache_file, search_fn=None, api_key=None, delay=1.0):
    """Enrich event descriptions, company descriptions, and external attendee bios."""
    if search_fn is None:
        search_fn = tavily_search
    if api_key is None:
        api_key = os.environ.get("TAVILY_API_KEY", "")

    cache = load_cache(cache_file)

    # Build company id -> name map for attendee queries
    company_names = {c["id"]: c["name"] for c in data.get("companies", [])}
    # Support test helper key
    if "_company_names" in data:
        company_names.update(data["_company_names"])

    total = (len(data.get("events", [])) +
             len(data.get("companies", [])) +
             sum(1 for a in data.get("attendees", [])
                 if a.get("isExternal") and a.get("title")))
    done = 0

    def fetch(cache_key, query):
        nonlocal done
        if cache_key in cache:
            done += 1
            return cache[cache_key]
        result = search_fn(query, api_key)
        cache[cache_key] = result
        save_cache(cache, cache_file)
        done += 1
        if delay > 0:
            time.sleep(delay)
        return result

    # Events
    for event in data.get("events", []):
        year = event.get("startDate", "")[:4] or "2026"
        query = f'"{event["name"]}" conference {year} overview agenda description'
        val = fetch(f"event:{event['id']}", query)
        if val:
            event["description"] = val
        print(f"\r  Enriching... {done}/{total}", end="", flush=True)

    # Companies
    for company in data.get("companies", []):
        query = f'"{company["name"]}" company telecom technology overview'
        val = fetch(f"company:{company['id']}", query)
        if val:
            company["description"] = val
        print(f"\r  Enriching... {done}/{total}", end="", flush=True)

    # External attendees with title
    for att in data.get("attendees", []):
        if not att.get("isExternal") or not att.get("title"):
            continue
        co_name = company_names.get(att.get("companyId", ""), "")
        query = f'"{att["name"]}" "{co_name}" "{att["title"]}"'
        val = fetch(f"attendee:{att['id']}", query)
        if val and len(val) >= 100:
            att["bio"] = val
        print(f"\r  Enriching... {done}/{total}", end="", flush=True)

    print(f"\n  Enrichment complete: {done} items processed")
    return data

def validate(data):
    errors = []
    attendee_ids = {a["id"] for a in data.get("attendees", [])}
    company_ids = {c["id"] for c in data.get("companies", [])}

    # Check MWC still present
    if not any(e["name"] == "MWC BCN 2026" for e in data.get("events", [])):
        errors.append("MWC BCN 2026 event missing from output")

    for event in data.get("events", []):
        event_room_ids = {r["id"] for r in event.get("rooms", [])}
        # Check attendeeIds
        for aid in event.get("attendeeIds", []):
            if aid not in attendee_ids:
                errors.append(f"Event '{event['name']}': attendeeId '{aid}' not in global pool")
        # Check meeting roomIds and attendees
        for mtg in event.get("meetings", []):
            if mtg.get("roomId") and mtg["roomId"] not in event_room_ids:
                errors.append(f"Meeting '{mtg.get('title', mtg['id'])}': roomId not in event rooms")
            for mid in mtg.get("attendees", []):
                if mid not in attendee_ids:
                    errors.append(f"Meeting '{mtg.get('title', mtg['id'])}': attendee '{mid}' not in pool")

    # Check companyIds
    for att in data.get("attendees", []):
        if att.get("companyId") and att["companyId"] not in company_ids:
            errors.append(f"Attendee '{att.get('email')}': companyId not in companies")

    # Duplicate emails
    emails = [a["email"] for a in data.get("attendees", [])]
    seen = set()
    for em in emails:
        if em in seen:
            errors.append(f"Duplicate email: {em}")
        seen.add(em)

    return errors

if __name__ == "__main__":
    api_key = os.environ.get("TAVILY_API_KEY", "")
    if not api_key:
        print("WARNING: TAVILY_API_KEY not set — enrichment will be skipped")

    print("Loading input files...")
    master = load_json(MASTER_FILE)
    mwc_src = load_json(MWC_FILE)
    data = copy.deepcopy(master)
    print(f"Loaded: {len(data['events'])} events, {len(data['attendees'])} attendees, {len(data['companies'])} companies")

    print("\nStep 1: Pruning old events...")
    data, deleted_ids = prune_old_events(data, CUTOFF_DATE)

    print("\nStep 2: Replacing MWC BCN 2026...")
    data = replace_mwc_data(data, mwc_src)

    if api_key:
        print("\nStep 3: Tavily enrichment (cache: .enrichment-cache.json)...")
        data = enrich_with_tavily(data, CACHE_FILE, api_key=api_key)
    else:
        print("\nStep 3: Skipping enrichment (no API key)")

    print("\nStep 4: Validating...")
    errors = validate(data)
    if errors:
        print(f"VALIDATION FAILED ({len(errors)} errors):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("Validation passed.")

    data["exportedAt"] = datetime.now(timezone.utc).isoformat()
    save_json(data, OUTPUT_FILE)
    print(f"\nDone. {len(data['events'])} events, {len(data['attendees'])} attendees, {len(data['companies'])} companies")
