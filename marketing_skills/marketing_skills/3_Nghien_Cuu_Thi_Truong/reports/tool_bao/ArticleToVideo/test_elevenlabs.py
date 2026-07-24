import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)
eleven_key = os.getenv("ELEVENLABS_API_KEY")
voice_id = "UsgbMVmY3U59ijwK5mdh"
url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": eleven_key
}
payload = {
    "text": "Kiểm tra hệ thống thành công.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.75
    }
}
resp = requests.post(url, json=payload, headers=headers)
print("Status:", resp.status_code)
if resp.status_code != 200:
    print("Error:", resp.text)
else:
    print("Success, downloaded audio size:", len(resp.content))
