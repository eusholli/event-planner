# db-json/process_data.py
"""
Generate master-data-030926-v5.json in V5 canonical system export format.

Inputs:
  - master-data-030926-v4.json  (V4 custom multi-event format)
  - mwc-final-031226.json       (single-event format, latest MWC BCN 2026 data)

Output:
  - master-data-030926-v5.json  (V5 system export format, name-based references)
"""
import json, os, sys, copy
from datetime import datetime, timezone

MASTER_FILE = "db-json/master-data-030926-v4.json"
MWC_FILE = "db-json/mwc-final-031226.json"
OUTPUT_FILE = "db-json/master-data-030926-v5.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Written: {path}")


def build_company_id_to_name(v4_data):
    """Return dict: companyId -> companyName from V4 companies list (names stripped)."""
    return {c["id"]: c["name"].strip() for c in v4_data.get("companies", [])}


def convert_companies(v4_data):
    """Strip ids from companies; return list of {name, description, pipelineValue} (names stripped)."""
    return [
        {"name": c["name"].strip(), "description": c.get("description"), "pipelineValue": c.get("pipelineValue")}
        for c in v4_data.get("companies", [])
    ]


def convert_system_settings(v4_data):
    """Rename systemSettings key and return V5 system object."""
    ss = v4_data.get("systemSettings", {})
    return {
        "geminiApiKey": ss.get("geminiApiKey"),
        "defaultTags": ss.get("defaultTags", []),
        "defaultMeetingTypes": ss.get("defaultMeetingTypes", []),
        "defaultAttendeeTypes": ss.get("defaultAttendeeTypes", []),
    }


def convert_attendees(v4_data, company_id_to_name, mwc_src=None):
    """
    Convert V4 attendees to V5 format (companyId -> companyName, strip id).
    For attendees in mwc_src, use mwc_src data as source of truth (matched by email).
    New attendees in mwc_src not present in V4 are added to the result.
    """
    # Build email -> mwc attendee map (mwc-final is the authoritative source)
    mwc_by_email = {}
    if mwc_src:
        for a in mwc_src.get("attendees", []):
            mwc_by_email[a["email"]] = a

    result = []
    seen_emails = set()

    for att in v4_data.get("attendees", []):
        email = att["email"]
        seen_emails.add(email)
        company_name = company_id_to_name.get(att.get("companyId", ""), "")

        if email in mwc_by_email:
            src = mwc_by_email[email]
            # mwc-final uses 'company' string for company name; strip whitespace
            company_name = (src.get("company", "") or company_name).strip()
            result.append({
                "name": src.get("name", att.get("name", "")),
                "email": email,
                "title": src.get("title", att.get("title", "")),
                "bio": src.get("bio", att.get("bio", "")),
                "companyName": company_name,
                "linkedin": src.get("linkedin", att.get("linkedin", "")),
                "imageUrl": src.get("imageUrl", att.get("imageUrl", "")),
                "isExternal": src.get("isExternal", att.get("isExternal", False)),
                "type": src.get("type", att.get("type", "")),
                "seniorityLevel": att.get("seniorityLevel"),
            })
        else:
            result.append({
                "name": att.get("name", ""),
                "email": email,
                "title": att.get("title", ""),
                "bio": att.get("bio", ""),
                "companyName": company_name,
                "linkedin": att.get("linkedin", ""),
                "imageUrl": att.get("imageUrl", ""),
                "isExternal": att.get("isExternal", False),
                "type": att.get("type", ""),
                "seniorityLevel": att.get("seniorityLevel"),
            })

    # Add new attendees from mwc-final not present in V4
    for email, src in mwc_by_email.items():
        if email in seen_emails:
            continue
        company_name = src.get("company", "").strip()
        result.append({
            "name": src.get("name", ""),
            "email": email,
            "title": src.get("title", ""),
            "bio": src.get("bio", ""),
            "companyName": company_name,
            "linkedin": src.get("linkedin", ""),
            "imageUrl": src.get("imageUrl", ""),
            "isExternal": src.get("isExternal", False),
            "type": src.get("type", ""),
            "seniorityLevel": None,
        })
        # Also ensure company is in companies list (add if new)
        if company_name and not any(c["name"].strip() == company_name for c in v4_data.get("companies", [])):
            v4_data["companies"].append({
                "id": f"__new__{email}",
                "name": company_name,
                "description": src.get("companyDescription", ""),
                "pipelineValue": None,
            })
        print(f"  New attendee from mwc-final: {email} ({company_name})")

    return result


def convert_roi_targets(roi, company_id_to_name):
    """Strip internal ids from ROI targets; replace targetCompanyIds with targetCompanyNames."""
    if not roi:
        return None
    result = {k: v for k, v in roi.items()
              if k not in ("id", "eventId", "event", "targetCompanyIds", "targetCompanies")}
    # V4 stores targetCompanyIds as a list of UUIDs inside the ROI object
    target_ids = roi.get("targetCompanyIds", [])
    result["targetCompanyNames"] = [
        company_id_to_name[cid] for cid in target_ids if cid in company_id_to_name
    ]
    return result


def convert_events(v4_data, company_id_to_name):
    """
    Convert V4 events to V5 format.
    Strips id, authorizedUserIds (set authorizedEmails=[]).
    Rooms and meetings are NOT included here — they go to top-level lists.
    """
    result = []
    for e in v4_data.get("events", []):
        roi = convert_roi_targets(e.get("roiTargets"), company_id_to_name)
        event_out = {k: v for k, v in e.items()
                     if k not in ("id", "authorizedUserIds", "rooms", "meetings",
                                  "attendeeIds", "roiTargets")}
        event_out["authorizedEmails"] = []  # Cannot resolve offline without Clerk
        if roi is not None:
            event_out["roiTargets"] = roi
        result.append(event_out)
    return result


def build_rooms_for_event(event_name, rooms_src):
    """Convert room list (from mwc-final or V4 nested) to V5 top-level format."""
    result = []
    for r in rooms_src:
        result.append({
            "name": r["name"],
            "capacity": r.get("capacity", 0),
            "eventName": event_name,
        })
    return result


def build_meetings_for_event(event_name, meetings_src):
    """
    Convert meeting list from mwc-final (already email+name-based) to V5 top-level format.
    mwc-final meetings already have: room (name), attendees (emails).
    """
    result = []
    for m in meetings_src:
        mtg = {k: v for k, v in m.items() if k not in ("id", "eventId", "roomId")}
        mtg["eventName"] = event_name
        result.append(mtg)
    return result


def merge_mwc_into_v5_events(v5_events, mwc_src):
    """Update the MWC BCN 2026 event in v5_events list with metadata from mwc_src."""
    src_event = mwc_src.get("event", {})
    for e in v5_events:
        if e["name"] == "MWC BCN 2026":
            e["tags"] = src_event.get("tags", e.get("tags", []))
            e["meetingTypes"] = src_event.get("meetingTypes", e.get("meetingTypes", []))
            e["attendeeTypes"] = src_event.get("attendeeTypes", e.get("attendeeTypes", []))
            e["timezone"] = src_event.get("timezone") or e.get("timezone", "")
            e["boothLocation"] = src_event.get("boothLocation") or e.get("boothLocation", "")
            e["startDate"] = src_event.get("startDate", e.get("startDate"))
            e["endDate"] = src_event.get("endDate", e.get("endDate"))
            break
    return v5_events


def validate_v5(data):
    """Validate V5 output for referential integrity."""
    errors = []

    company_names = {c["name"] for c in data.get("companies", [])}
    event_names = {e["name"] for e in data.get("events", [])}
    attendee_emails = {a["email"] for a in data.get("attendees", [])}
    # Build set of (eventName, roomName) pairs for meeting->room checks
    room_keys = {(r.get("eventName", ""), r["name"]) for r in data.get("rooms", [])}

    # Check MWC present
    if "MWC BCN 2026" not in event_names:
        errors.append("MWC BCN 2026 event missing from output")

    # Check attendee company references
    for att in data.get("attendees", []):
        if att.get("companyName") and att["companyName"] not in company_names:
            errors.append(f"Attendee '{att['email']}': companyName '{att['companyName']}' not in companies")

    # Check room event references
    for room in data.get("rooms", []):
        if room.get("eventName") and room["eventName"] not in event_names:
            errors.append(f"Room '{room['name']}': eventName '{room['eventName']}' not in events")

    # Check meeting references (event, room, attendees)
    for mtg in data.get("meetings", []):
        event_name = mtg.get("eventName", "")
        if event_name and event_name not in event_names:
            errors.append(f"Meeting '{mtg['title']}': eventName '{event_name}' not in events")
        if mtg.get("room"):
            if (event_name, mtg["room"]) not in room_keys:
                errors.append(f"Meeting '{mtg['title']}': room '{mtg['room']}' not in rooms for event '{event_name}'")
        for email in mtg.get("attendees", []):
            if email not in attendee_emails:
                errors.append(f"Meeting '{mtg['title']}': attendee email '{email}' not in attendees")

    # Duplicate emails
    seen = set()
    for att in data.get("attendees", []):
        em = att["email"]
        if em in seen:
            errors.append(f"Duplicate email: {em}")
        seen.add(em)

    return errors


if __name__ == "__main__":
    print("Loading input files...")
    v4 = load_json(MASTER_FILE)
    mwc_src = load_json(MWC_FILE)
    print(f"V4: {len(v4['events'])} events, {len(v4['attendees'])} attendees, {len(v4['companies'])} companies")
    print(f"MWC source: {len(mwc_src.get('attendees', []))} attendees, "
          f"{len(mwc_src.get('meetings', []))} meetings, {len(mwc_src.get('rooms', []))} rooms")

    print("\nStep 1: Building lookup maps...")
    company_id_to_name = build_company_id_to_name(v4)

    print("Step 2: Converting system settings...")
    system_out = convert_system_settings(v4)

    print("Step 3: Converting events to V5 format...")
    events_out = convert_events(v4, company_id_to_name)

    print("Step 4: Merging MWC BCN 2026 metadata from source...")
    events_out = merge_mwc_into_v5_events(events_out, mwc_src)

    print("Step 5: Building MWC rooms and meetings from source...")
    mwc_rooms = build_rooms_for_event("MWC BCN 2026", mwc_src.get("rooms", []))
    mwc_meetings = build_meetings_for_event("MWC BCN 2026", mwc_src.get("meetings", []))

    print("Step 6: Converting attendees (MWC attendees from source, adds new attendees and companies)...")
    attendees_out = convert_attendees(v4, company_id_to_name, mwc_src)

    # Step 7 must run AFTER convert_attendees: new companies for new attendees may have been appended to v4["companies"]
    print("Step 7: Converting companies (includes any new ones added for new attendees)...")
    companies_out = convert_companies(v4)

    print("Step 8: Assembling V5 output...")
    v5 = {
        "version": "5.0",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "system": system_out,
        "companies": companies_out,
        "events": events_out,
        "attendees": attendees_out,
        "rooms": mwc_rooms,
        "meetings": mwc_meetings,
    }

    print("Step 9: Validating...")
    errors = validate_v5(v5)
    if errors:
        print(f"VALIDATION FAILED ({len(errors)} errors):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("Validation passed.")

    save_json(v5, OUTPUT_FILE)
    print(f"\nDone. {len(v5['events'])} events, {len(v5['attendees'])} attendees, "
          f"{len(v5['companies'])} companies, {len(v5['rooms'])} rooms, {len(v5['meetings'])} meetings")
