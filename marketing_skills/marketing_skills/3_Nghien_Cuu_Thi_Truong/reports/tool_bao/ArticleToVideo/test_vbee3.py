import requests
import os
from dotenv import load_dotenv
load_dotenv()
vbee_key = os.getenv("VBEE_API_KEY")
url = "https://iamapi.vbee.vn/api/v1/text-to-speech"
headers = {"Authorization": f"Bearer {vbee_key}", "Content-Type": "application/json"}
payload = {"input_text": "Xin chào", "voice": "hn_female_thutrang_news_48k-hsmm", "rate": 1.0, "bit_rate": 128000}
try:
    response = requests.post(url, json=payload, headers=headers)
    print("iamapi:", response.status_code, response.text[:200])
except Exception as e: print("iamapi err:", e)
