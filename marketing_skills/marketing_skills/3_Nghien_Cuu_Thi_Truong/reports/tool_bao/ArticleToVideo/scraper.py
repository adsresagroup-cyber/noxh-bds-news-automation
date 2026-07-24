import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

def scrape_article(url, output_img_dir="images"):
    if not os.path.exists(output_img_dir):
        os.makedirs(output_img_dir)
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Extract title
    title = soup.find('title').text if soup.find('title') else 'No title'
    
    # Extract text (simple approach: extract paragraphs)
    paragraphs = soup.find_all(['p', 'h3', 'h4'])
    text_content = "\n".join([p.text.strip() for p in paragraphs if len(p.text.strip()) > 20 and 'http' not in p.text])
    
    # Try to find the main article container
    main_content = soup.find('div', class_=lambda c: c and any(x in c.lower() for x in ['detail-content', 'article-content', 'post-content', 'content-detail', 'main-content', 'detail__content']))
    if not main_content:
        main_content = soup.find('article')
    if not main_content:
        main_content = soup
    
    # Extract images from main content
    images = main_content.find_all('img')
    
    # Also grab the og:image as it's guaranteed to be the high-quality thumbnail
    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content'):
        # prepend to images list if it's not already there
        # we can just create a dummy tag
        dummy = soup.new_tag('img', src=og_img.get('content'))
        images.insert(0, dummy)
        
    downloaded_images = []
    seen_urls = set()
    
    for i, img in enumerate(images):
        img_url = img.get('data-original') or img.get('data-src') or img.get('src')
        if not img_url or img_url.startswith('data:'):
            continue
            
        img_url = urljoin(url, img_url)
        
        if img_url in seen_urls:
            continue
        seen_urls.add(img_url)
        
        # Filter out small icons or tracking pixels
        if 'icon' in img_url.lower() or 'logo' in img_url.lower() or 'avatar' in img_url.lower():
            continue
            
        try:
            img_response = requests.get(img_url, headers=headers, stream=True)
            if img_response.status_code == 200:
                content_type = img_response.headers.get('content-type', '')
                if 'image' not in content_type:
                    continue
                
                # Check size if possible (increase to 15KB to avoid tiny thumbnails)
                content_length = img_response.headers.get('content-length')
                if content_length and int(content_length) < 15000:
                    continue

                filename = f"image_{len(downloaded_images)}.jpg"
                filepath = os.path.join(output_img_dir, filename)
                
                with open(filepath, 'wb') as f:
                    for chunk in img_response.iter_content(1024):
                        f.write(chunk)
                downloaded_images.append(filepath)
                
                # Limit to 10 images max
                if len(downloaded_images) >= 10:
                    break
        except Exception as e:
            print(f"Error downloading image {img_url}: {e}")
            continue
            
    return {
        "title": title,
        "text": text_content,
        "images": downloaded_images
    }
