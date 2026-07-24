import scraper
url = "https://baoxaydung.vn/bat-dong-san-16-6-cuoi-thang-6-ha-noi-mo-ban-276-can-nha-o-xa-hoi-gia-duoi-1-ty-dong-19226061602472683.htm"
data = scraper.scrape_article(url)
print(f"Title: {data['title']}")
print(f"Images count: {len(data['images'])}")
print(f"Images: {data['images']}")
