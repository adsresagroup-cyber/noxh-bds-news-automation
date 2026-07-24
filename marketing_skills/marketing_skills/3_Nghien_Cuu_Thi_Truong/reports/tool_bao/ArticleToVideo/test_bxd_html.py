import requests
from bs4 import BeautifulSoup
url = "https://baoxaydung.vn/bat-dong-san-16-6-cuoi-thang-6-ha-noi-mo-ban-276-can-nha-o-xa-hoi-gia-duoi-1-ty-dong-19226061602472683.htm"
headers = {'User-Agent': 'Mozilla/5.0'}
resp = requests.get(url, headers=headers)
soup = BeautifulSoup(resp.content, 'html.parser')
main_content = soup.find('div', class_='detail-content') or soup.find('article') or soup.find('div', id='content') or soup.find('div', class_='content-detail') or soup.find('div', class_='post-content')
if not main_content: main_content = soup
imgs = main_content.find_all('img')
for img in imgs:
    print(img.get('src'))
