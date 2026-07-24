import sys
import os
sys.path.append('/Users/nguyenthithu/Downloads/Claude/ArticleToVideo')
from scraper import scrape_article
from video_generator import create_video

url = "https://cafef.vn/canh-bao-chieu-tro-dat-coc-giu-cho-nha-o-xa-hoi-188260613185002027.chn"
print("Scraping...")
data = scrape_article(url)
print("Images downloaded:", data["images"])

import traceback
from moviepy import ImageClip

for img in data["images"]:
    print(f"Testing image: {img}")
    try:
        clip = ImageClip(img)
        print("Success!")
    except Exception as e:
        print("Error:", e)
        traceback.print_exc()

