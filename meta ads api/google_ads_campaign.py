import os
import sys
import json
import requests
from dotenv import load_dotenv

# Load configuration from .env file
load_dotenv()

CUSTOMER_ID = os.getenv('GOOGLE_ADS_CUSTOMER_ID')
DEVELOPER_TOKEN = os.getenv('GOOGLE_ADS_DEVELOPER_TOKEN')
LOGIN_CUSTOMER_ID = os.getenv('GOOGLE_ADS_LOGIN_CUSTOMER_ID')

def get_google_ads_report():
    if not CUSTOMER_ID or not DEVELOPER_TOKEN:
        print("❌ Lỗi: Thiếu GOOGLE_ADS_CUSTOMER_ID hoặc GOOGLE_ADS_DEVELOPER_TOKEN trong file .env.")
        sys.exit(1)
        
    # Clean customer ID (remove hyphens)
    clean_customer_id = CUSTOMER_ID.replace('-', '').strip()
    
    # Load token
    token_path = 'token.json'
    if not os.path.exists(token_path) and os.path.exists('meta_ads_api/token.json'):
        token_path = 'meta_ads_api/token.json'
        
    if not os.path.exists(token_path):
        print("❌ Lỗi: Chưa tìm thấy file token.json. Hãy chạy script liên kết tài khoản trước.")
        sys.exit(1)
        
    with open(token_path, 'r') as f:
        token_data = json.load(f)
        
    access_token = token_data.get('token')
    
    # Call Google Ads API REST endpoint (searchStream)
    url = f"https://googleads.googleapis.com/v24/customers/{clean_customer_id}/googleAds:searchStream"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": DEVELOPER_TOKEN,
        "Content-Type": "application/json"
    }
    if LOGIN_CUSTOMER_ID:
        headers["login-customer-id"] = LOGIN_CUSTOMER_ID.replace('-', '').strip()
    
    # Query for campaign name, budget amount, cost, impressions, clicks
    query = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_budget.amount_micros,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks
    FROM campaign
    WHERE segments.date DURING YESTERDAY
    """
    
    payload = {
        "query": query
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        
        # Check if expired and refresh (if status code is 401)
        if response.status_code == 401:
            print("🔄 Access Token hết hạn, đang tự động làm mới bằng Refresh Token...")
            # Perform token refresh
            refresh_url = "https://oauth2.googleapis.com/token"
            refresh_payload = {
                "client_id": token_data.get("client_id"),
                "client_secret": token_data.get("client_secret"),
                "refresh_token": token_data.get("refresh_token"),
                "grant_type": "refresh_token"
            }
            refresh_res = requests.post(refresh_url, data=refresh_payload)
            if refresh_res.status_code == 200:
                new_token_data = refresh_res.json()
                token_data['token'] = new_token_data['access_token']
                # Save it back
                with open(token_path, 'w') as f_out:
                    json.dump(token_data, f_out, indent=4)
                # Retry request
                headers["Authorization"] = f"Bearer {token_data['token']}"
                response = requests.post(url, headers=headers, json=payload)
            else:
                print("❌ Lỗi: Không thể làm mới token. Vui lòng liên kết lại tài khoản.")
                sys.exit(1)
                
        if response.status_code != 200:
            print(f"❌ API Google Ads trả về lỗi (Mã: {response.status_code}):")
            print(response.text)
            sys.exit(1)
            
        # Parse stream response
        results = response.json()
        
        # Print table
        print(f"==========================================================")
        print(f"BÁO CÁO CHIẾN DỊCH GOOGLE ADS (HÔM QUA)")
        print(f"Tài khoản ID: {CUSTOMER_ID}")
        print(f"==========================================================")
        
        header_format = "{:<30} | {:<10} | {:<15} | {:<15} | {:<8} | {:<8}"
        row_format = "{:<30} | {:<10} | {:<15,} | {:<15,} | {:<8,} | {:<8,}"
        
        print(header_format.format("Tên Chiến Dịch", "Trạng Thái", "Ngân Sách/Ngày", "Chi Tiêu (VND)", "Lượt QC", "Lượt Click"))
        print("-" * 105)
        
        for batch in results:
            if 'results' not in batch:
                continue
            for row in batch['results']:
                campaign = row.get('campaign', {})
                metrics = row.get('metrics', {})
                budget = row.get('campaign_budget', {})
                
                name = campaign.get('name', 'N/A')
                status = campaign.get('status', 'N/A')
                
                # convert micros
                budget_amount = int(budget.get('amountMicros', 0)) / 1000000
                cost = int(metrics.get('costMicros', 0)) / 1000000
                impressions = int(metrics.get('impressions', 0))
                clicks = int(metrics.get('clicks', 0))
                
                print(row_format.format(
                    name[:30], 
                    status, 
                    budget_amount, 
                    cost, 
                    impressions, 
                    clicks
                ))
                
    except Exception as e:
        print(f"❌ Gặp lỗi kết nối: {e}")

if __name__ == '__main__':
    get_google_ads_report()
