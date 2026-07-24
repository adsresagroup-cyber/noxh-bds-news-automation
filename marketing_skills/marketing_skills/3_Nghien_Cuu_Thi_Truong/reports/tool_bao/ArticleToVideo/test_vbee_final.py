import requests

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODE3NDQ2NTV9.1VD87cKZqr1q6QNnT0xq-5rwAurTjh2pHWWsRNPHBAg"
app_id = "b070e1fe-68d9-4866-854e-a208232a4da4"
voice_id = "n_hanoi_male_nhabaohoangnam_news_vc"
text = "Xin chào các bạn."

endpoints = [
    "https://vbee.vn/api/v1/convert-tts",
    "https://api.vbee.vn/api/v1/convert-tts",
    "https://api.vbee.vn/v1/api/tts"
]

for url in endpoints:
    headers = {
        "Authorization": f"Bearer {token}",
        "AppID": app_id,
        "app_id": app_id,
        "Content-Type": "application/json"
    }
    payload = {
        "input_text": text,
        "voice": voice_id,
        "app_id": app_id
    }
    try:
        resp = requests.post(url, json=payload, headers=headers)
        print(f"{url} -> {resp.status_code}")
        if resp.status_code == 200:
            print("SUCCESS:", resp.text[:200])
    except Exception as e:
        pass
