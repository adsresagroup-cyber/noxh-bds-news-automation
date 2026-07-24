import scraper
url = "https://cafef.vn/ha-noi-phe-duyet-du-an-hon-30-nghin-ty-dong-cai-tao-ho-tay-va-tuyen-duong-canh-quan-ven-ho-188260616135429384.chn"
data = scraper.scrape_article(url)
print(f"Title: {data['title']}")
print(f"Images count: {len(data['images'])}")
print(f"Images: {data['images']}")
# print snippet of text
print(data['text'][:500])
