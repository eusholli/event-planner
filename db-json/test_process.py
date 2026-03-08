# db-json/test_process.py
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import process_data as p

def test_load_master():
    data = p.load_json(p.MASTER_FILE)
    assert data["version"] == "5.0-simplified-roi"
    assert isinstance(data["events"], list)
    assert isinstance(data["attendees"], list)
    assert isinstance(data["companies"], list)

def test_load_mwc():
    data = p.load_json(p.MWC_FILE)
    assert "event" in data
    assert isinstance(data["attendees"], list)
    assert isinstance(data["meetings"], list)
    assert isinstance(data["rooms"], list)

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

    result = p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test", delay=0)
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

    result = p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test", delay=0)
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

    p.enrich_with_tavily(data, cache_file, search_fn=fake_search, api_key="test", delay=0)
    # Only external attendee should be searched
    assert any("External" in q for q in calls)
    assert not any("Internal" in q for q in calls)

def test_validate_passes_clean_data():
    data = {
        "events": [{
            "id": "e1", "name": "MWC BCN 2026", "status": "OCCURRED",
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
        "events": [{"id": "e1", "name": "MWC BCN 2026", "status": "OCCURRED",
                    "attendeeIds": ["missing"], "rooms": [], "meetings": []}],
        "attendees": [],
        "companies": [],
    }
    errors = p.validate(data)
    assert any("attendeeId" in e for e in errors)

def test_validate_catches_duplicate_emails():
    data = {
        "events": [{"id": "e1", "name": "MWC BCN 2026", "status": "OCCURRED",
                    "attendeeIds": [], "rooms": [], "meetings": []}],
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
