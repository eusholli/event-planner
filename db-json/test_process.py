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
