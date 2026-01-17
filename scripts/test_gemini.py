
import os
import json
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    # Try fetching from Prisma via a quick node call? No, keep it simple.
    print("Error: GEMINI_API_KEY not found in .env.local")
    print("Please ensure .env.local exists or export the key.")
    exit(1)

URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={API_KEY}"

def test_api():
    print(f"Calling Gemini API: {URL}")
    
    payload = {
        "contents": [{
            "parts": [{"text": "When and where is DSP Leaders 2026?"}]
        }],
        "tools": [{"google_search": {}}]
    }

    try:
        response = requests.post(URL, json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print("Error Response:", response.text)
            return

        data = response.json()
        print("\n--- Full Response ---")
        print(json.dumps(data, indent=2))
        
        # Extract candidates
        if 'candidates' in data:
            candidate = data['candidates'][0]
            content_parts = candidate.get('content', {}).get('parts', [])
            
            for part in content_parts:
                print("\n--- Response Part ---")
                print(part.get('text', 'No text'))

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_api()
