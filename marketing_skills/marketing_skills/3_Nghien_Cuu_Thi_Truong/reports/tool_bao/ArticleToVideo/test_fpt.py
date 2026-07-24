import os
from dotenv import load_dotenv
import requests
import time

load_dotenv(override=True)
fpt_key = os.getenv("FPT_API_KEY")
url = "https://api.fpt.ai/hmi/tts/v5"
headers = {"api-key": fpt_key, "voice": "thuminh"}
payload = "Xin chào, tôi là thu minh."
print("Requesting...")
resp = requests.post(url, data=payload.encode('utf-8'), headers=headers)
print("Status:", resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    print("Response JSON:", data)
    if "async" in data:
        audio_url = data["async"]
        for _ in range(10):
            time.sleep(2)
            audio_res = requests.get(audio_url)
            print("Poll status:", audio_res.status_code, "Content-Type:", audio_res.headers.get("Content-Type"))
            if "application/json" not in audio_res.headers.get("Content-Type", ""):
                print("Got audio! Size:", len(audio_res.content))
                break
