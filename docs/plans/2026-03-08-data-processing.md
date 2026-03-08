# Data Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `db-json/process-data.py` — a Python script that prunes old events, replaces MWC BCN 2026 data from the single-event export, cleans up orphaned records, enriches descriptions via Tavily, and writes a valid v5.0-simplified-roi export file.

**Architecture:** Single script with five sequential stages: prune → replace MWC → orphan cleanup → Tavily enrichment (with resume-safe cache) → validate and write. Each stage is a pure function operating on the in-memory data dict, making them independently testable.

**Tech Stack:** Python 3, `requests` (Tavily API), `uuid` (stdlib), `pytest` for tests.

---

## Pre-flight

```bash
pip install requests pytest
```

Input files (must exist):
- `db-json/master-data-030826.json`
- `db-json/mwc-030826.json`

Output files:
- `db-json/master-data-030826-v2.json`
- `db-json/.enrichment-cache.json` (auto-created, add to `.gitignore`)

---

## Task 1: Script Skeleton and Input Loading

**Files:**
- Create: `db-json/process-data.py`
- Create: `db-json/test_process.py`

### Step 1: Create test file with loading test

```python
# db-json/test_process.py
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import process_data as p

def test_load_master():
    data = p.load_json("db-json/master-data-030826.json")
    assert data["version"] == "5.0-simplified-roi"
    assert isinstance(data["events"], list)
    assert isinstance(data["attendees"], list)
    assert isinstance(data["companies"], list)

def test_load_mwc():
    data = p.load_json("db-json/mwc-030826.json")
    assert "event" in data
    assert isinstance(data["attendees"], list)
    assert isinstance(data["meetings"], list)
    assert isinstance(data["rooms"], list)
```

### Step 2: Run test to verify it fails

```bash
cd /Users/eusholli/dev/event-planner
pytest db-json/test_process.py::test_load_master -v
```

Expected: `ModuleNotFoundError: No module named 'process_data'`

### Step 3: Create script skeleton

```python
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
```

### Step 4: Run tests

```bash
pytest db-json/test_process.py -v
```

Expected: Both tests PASS.

### Step 5: Commit

```bash
git add db-json/process-data.py db-json/test_process.py
git commit -m "feat: add data processing script skeleton with input loading"
```

---

## Task 2: Prune Old Events

**Files:**
- Modify: `db-json/process-data.py`
- Modify: `db-json/test_process.py`

### Step 1: Write failing test

Add to `test_process.py`:

```python
def test_prune_old_events():
    data = {
        "events": [
            {"id": "e1", "name": "Old Event", "startDate": "2026-01-15T00:00:00.000Z", "attendeeIds": ["a1"]},
            {"id": "e2", "name": "New Event", "startDate": "2026-03-01T00:00:00.000Z", "attendeeIds": ["a2"]},
            {"id": "e3", "name": "Border Event", "startDate": "2026-02-28T00:00:00.000Z", "attendeeIds": ["a3"]},
        ],
        "attendees": [
            {"id": "a1", "email": "a1@x.com", "companyId": "c1"},
            {"id": "a2", "email": "a2@x.com", "companyId": "c1"},
            {"id": "a3", "email": "a3@x.com", "companyId": "c1"},
        ],
        "companies": [{"id": "c1", "name": "Acme"}]
    }
    result, deleted_ids = p.prune_old_events(data, "2026-02-28T00:00:00.000Z")
    event_names = [e["name"] for e in result["events"]]
    assert "Old Event" not in event_names
    assert "New Event" in event_names
    assert "Border Event" in event_names  # >= cutoff is kept
    assert "e1" in deleted_ids
    assert "e2" not in deleted_ids
```

### Step 2: Run to verify it fails

```bash
pytest db-json/test_process.py::test_prune_old_events -v
```

Expected: `AttributeError: module 'process_data' has no attribute 'prune_old_events'`

### Step 3: Implement

Add to `process-data.py`:

```python
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
```

### Step 4: Run tests

```bash
pytest db-json/test_process.py -v
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add db-json/process-data.py db-json/test_process.py
git commit -m "feat: implement event pruning by cutoff date"
```

---

## Task 3: Orphan Attendee and Company Cleanup

**Files:**
- Modify: `db-json/process-data.py`
- Modify: `db-json/test_process.py`

### Step 1: Write failing tests

Add to `test_process.py`:

```python
def test_cleanup_orphans_removes_unlinked_attendees():
    data = {
        "events": [
            {"id": "e2", "attendeeIds": ["a2"]},
        ],
        "attendees": [
            {"id": "a1", "companyId": "c1"},  # only was in e1 (deleted)
            {"id": "a2", "companyId": "c2"},  # still in e2
        ],
        "companies": [
            {"id": "c1", "name": "Orphan Co"},
            {"id": "c2", "name": "Live Co"},
        ]
    }
    result = p.cleanup_orphans(data)
    attendee_ids = [a["id"] for a in result["attendees"]]
    company_ids = [c["id"] for c in result["companies"]]
    assert "a1" not in attendee_ids
    assert "a2" in attendee_ids
    assert "c1" not in company_ids  # orphaned company removed
    assert "c2" in company_ids

def test_cleanup_orphans_keeps_shared_attendees():
    data = {
        "events": [
            {"id": "e2", "attendeeIds": ["a1", "a2"]},
        ],
        "attendees": [
            {"id": "a1", "companyId": "c1"},
            {"id": "a2", "companyId": "c1"},
        ],
        "companies": [{"id": "c1", "name": "Shared Co"}]
    }
    result = p.cleanup_orphans(data)
    assert len(result["attendees"]) == 2
    assert len(result["companies"]) == 1
```

### Step 2: Run to verify failure

```bash
pytest db-json/test_process.py::test_cleanup_orphans_removes_unlinked_attendees -v
```

Expected: `AttributeError`

### Step 3: Implement

```python
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
```

### Step 4: Run tests

```bash
pytest db-json/test_process.py -v
```

Expected: All PASS.

### Step 5: Commit

```bash
git add db-json/process-data.py db-json/test_process.py
git commit -m "feat: implement orphan attendee and company cleanup"
```

---

## Task 4: Replace MWC BCN 2026 Data

**Files:**
- Modify: `db-json/process-data.py`
- Modify: `db-json/test_process.py`

This is the most complex task. The mwc source file uses a different format:
- `event` (metadata, no `id`)
- `attendees` (have `company` string, not `companyId`)
- `rooms` (have `name`, `capacity` — no `id`, no `eventId`)
- `meetings` (have `room` string name, `attendees` as email list)

### Step 1: Write failing tests

Add to `test_process.py`:

```python
def make_mwc_source():
    return {
        "event": {
            "name": "MWC BCN 2026",
            "startDate": "2026-03-02T00:00:00.000Z",
            "endDate": "2026-03-05T00:00:00.000Z",
            "tags": ["Cloud"],
            "meetingTypes": ["Sales/Customer"],
            "attendeeTypes": ["Sales"],
            "timezone": "Europe/Madrid",
            "boothLocation": "Hall 2",
        },
        "rooms": [
            {"name": "Room A", "capacity": 10},
        ],
        "attendees": [
            {"name": "Alice", "email": "alice@ext.com", "title": "CTO", "bio": "Bio",
             "company": "ExtCo", "companyDescription": "ExtCo desc",
             "linkedin": "li/alice", "imageUrl": "", "isExternal": True, "type": "Customer"},
            {"name": "Bob", "email": "bob@rakuten.com", "title": "Sales", "bio": "",
             "company": "Rakuten Symphony", "companyDescription": "",
             "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Sales"},
        ],
        "meetings": [
            {"title": "MTG Alice", "purpose": "Discuss", "date": "2026-03-03",
             "startTime": "10:00", "endTime": "11:00", "sequence": 1,
             "status": "OCCURRED", "tags": [], "createdBy": "bob@rakuten.com",
             "requesterEmail": "bob@rakuten.com", "meetingType": "Sales/Customer",
             "location": None, "otherDetails": None, "isApproved": True,
             "calendarInviteSent": False, "room": "Room A",
             "attendees": ["alice@ext.com", "bob@rakuten.com"]},
        ]
    }

def make_master_with_mwc():
    return {
        "version": "5.0-simplified-roi",
        "events": [{
            "id": "mwc-uuid",
            "name": "MWC BCN 2026",
            "startDate": "2026-03-02T00:00:00.000Z",
            "endDate": "2026-03-05T00:00:00.000Z",
            "slug": "mwc-bcn-2026",
            "status": "OCCURRED",
            "authorizedUserIds": ["user1"],
            "roiTargets": {"id": "roi1", "eventId": "mwc-uuid", "expectedPipeline": 1000000},
            "timezone": "Europe/Madrid",
            "boothLocation": "",
            "url": "", "address": "", "region": "", "budget": 0,
            "targetCustomers": "", "password": "", "description": "",
            "latitude": None, "longitude": None,
            "tags": ["Old"], "meetingTypes": ["Old"], "attendeeTypes": ["Old"],
            "rooms": [{"id": "old-room", "name": "Old Room", "capacity": 5, "eventId": "mwc-uuid"}],
            "meetings": [{"id": "old-mtg", "title": "Old Meeting", "eventId": "mwc-uuid", "attendees": ["old-att"]}],
            "attendeeIds": ["old-att"],
        }],
        "attendees": [
            {"id": "old-att", "email": "old@old.com", "name": "Old Person",
             "title": "", "bio": "", "companyId": "old-co",
             "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Sales", "seniorityLevel": None},
        ],
        "companies": [
            {"id": "old-co", "name": "Old Co", "description": "", "pipelineValue": 0},
        ],
        "systemSettings": {},
        "exportedAt": "2026-03-08T00:00:00.000Z",
    }

def test_replace_mwc_rooms_and_meetings():
    data = make_master_with_mwc()
    mwc_src = make_mwc_source()
    result = p.replace_mwc_data(data, mwc_src)
    mwc_event = next(e for e in result["events"] if e["name"] == "MWC BCN 2026")
    assert len(mwc_event["rooms"]) == 1
    assert mwc_event["rooms"][0]["name"] == "Room A"
    assert len(mwc_event["meetings"]) == 1
    assert mwc_event["meetings"][0]["title"] == "MTG Alice"
    # Room reference resolved in meeting
    assert mwc_event["meetings"][0]["roomId"] == mwc_event["rooms"][0]["id"]

def test_replace_mwc_attendees_new():
    data = make_master_with_mwc()
    mwc_src = make_mwc_source()
    result = p.replace_mwc_data(data, mwc_src)
    emails = [a["email"] for a in result["attendees"]]
    assert "alice@ext.com" in emails
    assert "bob@rakuten.com" in emails
    # Old attendee only in old MWC → removed
    assert "old@old.com" not in emails

def test_replace_mwc_preserves_roi_and_meta():
    data = make_master_with_mwc()
    mwc_src = make_mwc_source()
    result = p.replace_mwc_data(data, mwc_src)
    mwc_event = next(e for e in result["events"] if e["name"] == "MWC BCN 2026")
    assert mwc_event["id"] == "mwc-uuid"
    assert mwc_event["slug"] == "mwc-bcn-2026"
    assert mwc_event["roiTargets"]["expectedPipeline"] == 1000000
    assert mwc_event["tags"] == ["Cloud"]  # updated from source

def test_replace_mwc_meeting_attendees_resolved_to_uuids():
    data = make_master_with_mwc()
    mwc_src = make_mwc_source()
    result = p.replace_mwc_data(data, mwc_src)
    mwc_event = next(e for e in result["events"] if e["name"] == "MWC BCN 2026")
    meeting = mwc_event["meetings"][0]
    # Attendees should be UUIDs, not email strings
    attendee_ids = {a["id"] for a in result["attendees"]}
    for att_id in meeting["attendees"]:
        assert att_id in attendee_ids
```

### Step 2: Run to verify failure

```bash
pytest db-json/test_process.py::test_replace_mwc_rooms_and_meetings -v
```

Expected: `AttributeError`

### Step 3: Implement

Add to `process-data.py`:

```python
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
    # Build email -> existing attendee map
    email_to_existing = {a["email"]: a for a in data["attendees"]}

    # Build company name -> existing company map
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
        # Resolve attendee emails to UUIDs
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
```

### Step 4: Run all tests

```bash
pytest db-json/test_process.py -v
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add db-json/process-data.py db-json/test_process.py
git commit -m "feat: implement MWC BCN 2026 data replacement from single-event source"
```

---

## Task 5: Tavily Enrichment with Caching

**Files:**
- Modify: `db-json/process-data.py`
- Modify: `db-json/test_process.py`

### Step 1: Write failing tests

Add to `test_process.py`:

```python
import unittest.mock as mock

def test_enrich_uses_cache(tmp_path):
    cache_file = str(tmp_path / "cache.json")
    # Pre-populate cache
    cache = {"event:e1": "Cached description"}
    with open(cache_file, "w") as f:
        json.dump(cache, f)

    data = {
        "events": [{"id": "e1", "name": "Test Conf", "description": ""}],
        "companies": [],
        "attendees": [],
    }

    call_count = {"n": 0}
    def fake_search(query, api_key):
        call_count["n"] += 1
        return "Fresh result"

    result = p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test")
    assert call_count["n"] == 0  # cache hit, no API call
    assert result["events"][0]["description"] == "Cached description"

def test_enrich_calls_api_on_cache_miss(tmp_path):
    cache_file = str(tmp_path / "cache.json")

    data = {
        "events": [{"id": "e1", "name": "Test Conf", "description": ""}],
        "companies": [],
        "attendees": [],
    }

    def fake_search(query, api_key):
        return "Fresh description from Tavily"

    result = p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test")
    assert result["events"][0]["description"] == "Fresh description from Tavily"
    # Cache should be saved
    with open(cache_file) as f:
        cache = json.load(f)
    assert "event:e1" in cache

def test_enrich_skips_internal_attendees(tmp_path):
    cache_file = str(tmp_path / "cache.json")
    data = {
        "events": [],
        "companies": [],
        "attendees": [
            {"id": "a1", "name": "Internal", "title": "Dev", "bio": "",
             "isExternal": False, "companyId": "c1"},
            {"id": "a2", "name": "External", "title": "CTO", "bio": "",
             "isExternal": True, "companyId": "c1"},
        ],
    }
    # Add a fake company lookup helper
    data["_company_names"] = {"c1": "ExtCo"}

    calls = []
    def fake_search(query, api_key):
        calls.append(query)
        return "Result"

    p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test")
    # Only external attendee should be searched
    assert any("External" in q for q in calls)
    assert not any("Internal" in q for q in calls)
```

### Step 2: Run to verify failure

```bash
pytest db-json/test_process.py::test_enrich_uses_cache -v
```

Expected: `AttributeError`

### Step 3: Implement

Add to `process-data.py`:

```python
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
    # Store temporarily for test access
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
```

### Step 4: Run all tests

```bash
pytest db-json/test_process.py -v
```

Expected: All PASS.

### Step 5: Commit

```bash
git add db-json/process-data.py db-json/test_process.py
git commit -m "feat: implement Tavily enrichment with resume-safe caching"
```

---

## Task 6: Validation and Final Output

**Files:**
- Modify: `db-json/process-data.py`
- Modify: `db-json/test_process.py`

### Step 1: Write failing tests

Add to `test_process.py`:

```python
def test_validate_passes_clean_data():
    data = {
        "events": [{
            "id": "e1", "name": "Conf", "status": "OCCURRED",
            "attendeeIds": ["a1"],
            "rooms": [{"id": "r1", "name": "Room"}],
            "meetings": [{"id": "m1", "roomId": "r1", "attendees": ["a1"]}],
        }],
        "attendees": [{"id": "a1", "companyId": "c1", "email": "a@b.com"}],
        "companies": [{"id": "c1"}],
    }
    errors = p.validate(data)
    assert errors == []

def test_validate_catches_bad_attendee_id():
    data = {
        "events": [{"id": "e1", "name": "Conf", "status": "OCCURRED",
                    "attendeeIds": ["missing"], "rooms": [], "meetings": []}],
        "attendees": [],
        "companies": [],
    }
    errors = p.validate(data)
    assert any("attendeeId" in e for e in errors)

def test_validate_catches_duplicate_emails():
    data = {
        "events": [],
        "attendees": [
            {"id": "a1", "email": "same@x.com", "companyId": None},
            {"id": "a2", "email": "same@x.com", "companyId": None},
        ],
        "companies": [],
    }
    errors = p.validate(data)
    assert any("duplicate" in e.lower() for e in errors)

def test_validate_mwc_still_present():
    data = {
        "events": [{"id": "e1", "name": "Other", "status": "PIPELINE",
                    "attendeeIds": [], "rooms": [], "meetings": []}],
        "attendees": [], "companies": [],
    }
    errors = p.validate(data)
    assert any("MWC BCN 2026" in e for e in errors)
```

### Step 2: Run to verify failure

```bash
pytest db-json/test_process.py::test_validate_passes_clean_data -v
```

Expected: `AttributeError`

### Step 3: Implement validation and main block

```python
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
```

Update the `if __name__ == "__main__":` block:

```python
if __name__ == "__main__":
    import copy
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
```

### Step 4: Run all tests

```bash
pytest db-json/test_process.py -v
```

Expected: All PASS.

### Step 5: Add cache file to .gitignore

```bash
echo "db-json/.enrichment-cache.json" >> .gitignore
```

### Step 6: Commit

```bash
git add db-json/process-data.py db-json/test_process.py .gitignore
git commit -m "feat: add validation and main execution block to data processing script"
```

---

## Task 7: End-to-End Smoke Test

**No new code — verify the full script runs correctly against real data.**

### Step 1: Run unit tests one final time

```bash
pytest db-json/test_process.py -v
```

Expected: All PASS.

### Step 2: Run the script without API key (structural pass)

```bash
cd /Users/eusholli/dev/event-planner
python db-json/process-data.py
```

Expected output (approximate):
```
Loaded: 66 events, 175 attendees, 73 companies
Step 1: Pruning old events...
  Pruning: PTC '26 (2026-01-18)
  ... (9 events pruned)
Step 2: Replacing MWC BCN 2026...
  MWC rooms: 6 replaced
  MWC meetings: 321 replaced
  MWC attendees: 274 linked
Step 3: Skipping enrichment (no API key)
Step 4: Validating...
Validation passed.
Written: db-json/master-data-030826-v2.json
Done. 57 events, ~270 attendees, ~X companies
```

### Step 3: Run with API key for full enrichment

```bash
TAVILY_API_KEY=your_key python db-json/process-data.py
```

Expected: Enrichment progress printed, final file written with populated descriptions.

### Step 4: Verify output is importable

Open the app and use **Admin → System → Import** to load `master-data-030826-v2.json`. Confirm no import errors.

### Step 5: Commit output file (if desired)

```bash
git add db-json/master-data-030826-v2.json
git commit -m "data: add processed master export v2 with MWC replacement and enrichment"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Script skeleton, input loading |
| 2 | Event pruning (9 events deleted) |
| 3 | Orphan attendee/company cleanup |
| 4 | MWC BCN 2026 full data replacement |
| 5 | Tavily enrichment with resume-safe cache |
| 6 | Validation + main execution block |
| 7 | End-to-end smoke test |
