import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN')
API_VERSION = os.getenv('META_API_VERSION', 'v20.0')

def get_pages():
    if not ACCESS_TOKEN:
        print("❌ Lỗi: Thiếu META_ACCESS_TOKEN trong file .env.")
        sys.exit(1)
        
    url = f"https://graph.facebook.com/{API_VERSION}/me/accounts"
    params = {
        "access_token": ACCESS_TOKEN,
        "limit": 100
    }
    
    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"❌ API Meta trả về lỗi (Mã: {response.status_code}):")
            print(response.text)
            sys.exit(1)
            
        data = response.json()
        pages = data.get('data', [])
        
        if not pages:
            print("ℹ️ Không tìm thấy Fanpage nào liên kết với tài khoản này.")
            return
            
        print("==========================================================")
        print("         DANH SÁCH FANPAGE FACEBOOK CỦA BẠN")
        print("==========================================================")
        print(f"{'STT':<4} | {'Tên Trang':<30} | {'Page ID':<20}")
        print("-" * 62)
        
        env_parts = []
        for idx, page in enumerate(pages, 1):
            name = page.get('name', 'N/A')
            page_id = page.get('id', 'N/A')
            # Clean page name for env format (replace space with underscore and remove colon)
            clean_name = name.replace(' ', '_').replace(':', '').replace(',', '')
            print(f"{idx:<4} | {name[:30]:<30} | {page_id:<20}")
            env_parts.append(f"{page_id}:{clean_name}")
            
        print("\n==========================================================")
        print("GỢI Ý CẤU HÌNH FILE .env:")
        print("Chị hãy copy dòng dưới đây và dán vào file .env nhé:")
        print("==========================================================")
        print(f"META_PAGES={','.join(env_parts)}")
        print("==========================================================")
        
    except Exception as e:
        print(f"❌ Gặp lỗi kết nối: {e}")

if __name__ == '__main__':
    get_pages()
