import requests
import os
from dotenv import load_dotenv
load_dotenv()
vbee_key = os.getenv("VBEE_API_KEY")
url = "https://studio.vbee.vn/api/v1/text-to-speech"
headers = {"Authorization": f"Bearer {vbee_key}", "Content-Type": "application/json"}
payload = {"input_text": "Xin chào", "voice": "hn_female_thutrang_news_48k-hsmm", "rate": 1.0, "bit_rate": 128000}
response = requests.post(url, json=payload, headers=headers)
print("Status:", response.status_code)
print("Response:", response.text)
