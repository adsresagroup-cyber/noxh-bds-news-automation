import requests
from bs4 import BeautifulSoup
url = "https://baoxaydung.vn/bat-dong-san-16-6-cuoi-thang-6-ha-noi-mo-ban-276-can-nha-o-xa-hoi-gia-duoi-1-ty-dong-19226061602472683.htm"
headers = {'User-Agent': 'Mozilla/5.0'}
resp = requests.get(url, headers=headers)
soup = BeautifulSoup(resp.content, 'html.parser')
for img in soup.find_all('img'):
    print(img.get('src') or img.get('data-src'))
