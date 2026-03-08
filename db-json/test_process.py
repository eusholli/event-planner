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
