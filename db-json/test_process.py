# db-json/test_process.py
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import process_data as p


# --- Fixtures ---

def make_v4_master():
    return {
        "version": "6.0-intelligence-subscriptions",
        "exportedAt": "2026-03-09T00:00:00.000Z",
        "systemSettings": {
            "geminiApiKey": "key-123",
            "defaultTags": ["RAN"],
            "defaultMeetingTypes": ["Sales/Customer"],
            "defaultAttendeeTypes": ["Sales"],
        },
        "events": [{
            "id": "mwc-uuid",
            "name": "MWC BCN 2026",
            "startDate": "2026-03-02T00:00:00.000Z",
            "endDate": "2026-03-05T00:00:00.000Z",
            "slug": "mwc-bcn-2026",
            "status": "OCCURRED",
            "authorizedUserIds": ["user1"],
            "roiTargets": {
                "id": "roi1", "eventId": "mwc-uuid",
                "expectedPipeline": 1000000,
                "targetCompanyIds": ["old-co"],
            },
            "timezone": "CET", "boothLocation": "Hall 2",
            "url": "", "address": "", "region": "EU/UK", "budget": 0,
            "targetCustomers": "", "password": None, "description": "",
            "latitude": None, "longitude": None,
            "tags": ["Old"], "meetingTypes": ["Old"], "attendeeTypes": ["Old"],
            "rooms": [{"id": "old-room", "name": "Old Room", "capacity": 5, "eventId": "mwc-uuid"}],
            "meetings": [],
            "attendeeIds": ["old-att"],
        }],
        "attendees": [
            {"id": "old-att", "email": "old@old.com", "name": "Old Person",
             "title": "Dev", "bio": "", "companyId": "old-co",
             "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Sales", "seniorityLevel": None},
        ],
        "companies": [
            {"id": "old-co", "name": "Old Co", "description": "Old desc", "pipelineValue": 0},
        ],
        "intelligenceSubscriptions": [],
    }


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
            "boothLocation": "Hall 2 Updated",
        },
        "rooms": [{"name": "Room A", "capacity": 10}],
        "attendees": [
            {"name": "Alice", "email": "alice@ext.com", "title": "CTO", "bio": "Bio",
             "company": "ExtCo", "companyDescription": "ExtCo desc",
             "linkedin": "li/alice", "imageUrl": "", "isExternal": True, "type": "Customer"},
            {"name": "Bob", "email": "bob@rakuten.com", "title": "Sales", "bio": "",
             "company": "Old Co", "companyDescription": "",
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
        ],
    }


# --- Unit tests ---

def test_convert_system_settings():
    v4 = make_v4_master()
    system = p.convert_system_settings(v4)
    assert system["geminiApiKey"] == "key-123"
    assert system["defaultTags"] == ["RAN"]
    assert system["defaultMeetingTypes"] == ["Sales/Customer"]
    assert system["defaultAttendeeTypes"] == ["Sales"]


def test_convert_companies_strips_id():
    v4 = make_v4_master()
    companies = p.convert_companies(v4)
    assert len(companies) == 1
    assert companies[0]["name"] == "Old Co"
    assert "id" not in companies[0]
    assert companies[0]["description"] == "Old desc"


def test_build_company_id_to_name():
    v4 = make_v4_master()
    mapping = p.build_company_id_to_name(v4)
    assert mapping["old-co"] == "Old Co"


def test_convert_events_strips_id_and_authorized_user_ids():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    assert len(events) == 1
    e = events[0]
    assert "id" not in e
    assert "authorizedUserIds" not in e
    assert e["authorizedEmails"] == []
    assert "rooms" not in e
    assert "meetings" not in e
    assert "attendeeIds" not in e


def test_convert_events_roi_targets_uses_company_names():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    roi = events[0]["roiTargets"]
    assert "id" not in roi
    assert "eventId" not in roi
    assert roi["targetCompanyNames"] == ["Old Co"]
    assert "targetCompanyIds" not in roi


def test_convert_attendees_uses_company_name():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    attendees = p.convert_attendees(v4, cmap)
    assert len(attendees) == 1
    att = attendees[0]
    assert att["companyName"] == "Old Co"
    assert "companyId" not in att
    assert "id" not in att


def test_convert_attendees_merges_mwc_source():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    mwc_src = make_mwc_source()

    # Add alice to V4 attendees (even though she's not there originally — simulate overlap)
    v4["attendees"].append({
        "id": "alice-id", "email": "alice@ext.com", "name": "Alice Old",
        "title": "Old Title", "bio": "", "companyId": "old-co",
        "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Old", "seniorityLevel": None,
    })
    cmap = p.build_company_id_to_name(v4)
    attendees = p.convert_attendees(v4, cmap, mwc_src)

    alice = next(a for a in attendees if a["email"] == "alice@ext.com")
    assert alice["name"] == "Alice"  # updated from mwc_src
    assert alice["title"] == "CTO"
    assert alice["companyName"] == "ExtCo"  # from mwc_src company field


def test_merge_mwc_updates_metadata():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    mwc_src = make_mwc_source()
    events = p.merge_mwc_into_v5_events(events, mwc_src)
    mwc = next(e for e in events if e["name"] == "MWC BCN 2026")
    assert mwc["tags"] == ["Cloud"]
    assert mwc["timezone"] == "Europe/Madrid"
    assert mwc["boothLocation"] == "Hall 2 Updated"


def test_build_rooms_for_event():
    rooms = p.build_rooms_for_event("MWC BCN 2026", [{"name": "Room A", "capacity": 10}])
    assert rooms[0]["eventName"] == "MWC BCN 2026"
    assert rooms[0]["name"] == "Room A"
    assert "id" not in rooms[0]


def test_build_meetings_for_event():
    mwc_src = make_mwc_source()
    meetings = p.build_meetings_for_event("MWC BCN 2026", mwc_src["meetings"])
    assert len(meetings) == 1
    mtg = meetings[0]
    assert mtg["eventName"] == "MWC BCN 2026"
    assert mtg["room"] == "Room A"
    assert "alice@ext.com" in mtg["attendees"]
    assert "id" not in mtg
    assert "eventId" not in mtg
    assert "roomId" not in mtg


def test_validate_v5_passes_clean_data():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Acme"}],
        "rooms": [{"name": "Room A", "eventName": "MWC BCN 2026"}],
        "meetings": [{"title": "MTG", "eventName": "MWC BCN 2026", "attendees": ["a@b.com"]}],
    }
    errors = p.validate_v5(v5)
    assert errors == []


def test_validate_v5_catches_missing_company_name():
    v5 = {
        "companies": [],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Missing Co"}],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("Missing Co" in e for e in errors)


def test_validate_v5_catches_missing_event_name_in_meeting():
    v5 = {
        "companies": [],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [],
        "rooms": [],
        "meetings": [{"title": "MTG", "eventName": "Unknown Event", "attendees": []}],
    }
    errors = p.validate_v5(v5)
    assert any("Unknown Event" in e for e in errors)


def test_validate_v5_catches_duplicate_emails():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [
            {"email": "same@x.com", "companyName": "Acme"},
            {"email": "same@x.com", "companyName": "Acme"},
        ],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("duplicate" in e.lower() for e in errors)


def test_validate_v5_catches_missing_mwc():
    v5 = {
        "companies": [],
        "events": [{"name": "Other Event"}],
        "attendees": [],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("MWC BCN 2026" in e for e in errors)


def test_validate_v5_catches_bad_room_reference():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Acme"}],
        "rooms": [{"name": "Room A", "eventName": "MWC BCN 2026"}],
        "meetings": [{"title": "MTG", "eventName": "MWC BCN 2026",
                      "room": "Room B",  # does not exist
                      "attendees": ["a@b.com"]}],
    }
    errors = p.validate_v5(v5)
    assert any("Room B" in e for e in errors)


def test_convert_attendees_adds_new_mwc_attendees():
    """New attendees in mwc-final not in V4 must be added to the output."""
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    mwc_src = make_mwc_source()
    # Alice and Bob are in mwc_src but NOT in v4 attendees
    attendees = p.convert_attendees(v4, cmap, mwc_src)
    emails = [a["email"] for a in attendees]
    assert "alice@ext.com" in emails
    assert "bob@rakuten.com" in emails
    # old@old.com is in V4 but not in mwc_src — should still be included
    assert "old@old.com" in emails
