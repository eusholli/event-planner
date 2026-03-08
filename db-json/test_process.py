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
