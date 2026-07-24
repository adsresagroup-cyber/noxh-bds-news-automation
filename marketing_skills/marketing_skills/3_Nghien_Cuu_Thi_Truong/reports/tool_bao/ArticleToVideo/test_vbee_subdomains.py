import requests

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODE3NDQ2NTV9.1VD87cKZqr1q6QNnT0xq-5rwAurTjh2pHWWsRNPHBAg"
voice_id = "n_hanoi_male_nhabaohoangnam_news_vc"
text = "Xin chào các bạn."

subdomains = ["studio-api", "backend", "api-studio", "v2-api", "app-api", "gw"]
for sub in subdomains:
    url = f"https://{sub}.vbee.vn/api/v1/text-to-speech"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"input_text": text, "voice": voice_id}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=2)
        print(f"{url} -> {resp.status_code}")
    except Exception as e:
        print(f"{url} -> failed")
