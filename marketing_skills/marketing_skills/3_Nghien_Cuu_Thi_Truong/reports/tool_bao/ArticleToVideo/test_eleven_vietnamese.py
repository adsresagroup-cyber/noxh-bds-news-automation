import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)
eleven_key = os.getenv("ELEVENLABS_API_KEY")
# Let's test the user's requested voice
voice_id = "UsgbMVmY3U59ijwK5mdh"
url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": eleven_key
}
payload = {
    "text": "Xin chào, đây là một bài kiểm tra giọng đọc bằng tiếng Việt.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.75
    }
}
resp = requests.post(url, json=payload, headers=headers)
print("Status:", resp.status_code)
if resp.status_code == 200:
    with open("test_vietnamese_eleven.mp3", "wb") as f:
        f.write(resp.content)
    print("Saved test audio to test_vietnamese_eleven.mp3")
else:
    print("Error:", resp.text)
