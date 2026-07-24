---
name: Cào tin tức BĐS tỉnh thành
description: Quy trình thiết lập tự động cào tin tức BĐS, phân tích AI, viết kịch bản video ngắn và xuất trực tiếp lên Google Sheets hàng ngày theo lịch trình Task Scheduler cho một tỉnh thành bất kỳ.
---

# Quy Trình Thiết Lập Cào Tin Tức BĐS Cho Tỉnh Thành Mới

Tài liệu này hướng dẫn chi tiết cách nhân bản hệ thống tự động cào tin tức BĐS Nghệ An cho một tỉnh thành mới (ví dụ: Thanh Hóa, Khánh Hòa, Bình Dương...) chỉ với vài bước đơn giản.

---

## BƯỚC 1: Thu Thập Thông Tin Của Tỉnh Thành Mới

Xác định các thông tin cốt lõi sau để cấu hình bộ lọc:
1.  **Tên tỉnh thành** (bằng tiếng Việt có dấu và không dấu, ví dụ: `thanh hóa`, `thanh hoa`).
2.  **Danh sách các quận, huyện, thị xã** để làm bộ lọc địa bàn (ví dụ: `sầm sơn`, `bỉm sơn`, `tĩnh gia`, `thọ xuân`...).
3.  **Từ khóa thủ phủ (Thành phố)** và các cụm từ cần loại trừ (nếu cần thiết để tránh trùng lặp, ví dụ: từ khóa `thanh` trong "Thanh Hóa" hoặc "Thanh Chương" dễ bị trùng, hoặc tên thành phố trùng với từ phổ thông).
4.  **Nguồn tin RSS của Báo địa phương** (ví dụ: Báo Thanh Hóa `baothanhhoa.vn/rss` có các chuyên mục Kinh tế, Thời sự).

---

## BƯỚC 2: Tạo File Cào Tin Node.js (`fetch_[tên_tỉnh]_news.js`)

Nhân bản từ file mẫu và thay đổi các cấu hình sau:
-   **Đường dẫn file**: Lưu tại thư mục `3_Nghien_Cuu_Thi_Truong` với tên `fetch_[province]_news.js`.
-   **Chỉnh sửa các biến đầu tệp**:
    1.  **`rssFeeds`**: Thêm RSS của Báo địa phương mới vào đầu mảng.
    2.  **`specificKeywords`** trong hàm `matches[Province]`: Thay bằng danh sách huyện/thành phố của tỉnh mới.
    3.  **`vinhRegex` & `excludes`** (nếu có): Tinh chỉnh lọc rác cho tên thành phố của tỉnh đó.
    4.  **`isRealEstateOrInfrastructure`**: Giữ nguyên danh mục từ khóa BĐS để lọc tin chất lượng.
    5.  **`historyPath`**: Đổi tên file lịch sử thành `scraped_articles_history_[province].json` để tránh trùng chéo với các tỉnh khác.
    6.  **`sheetName`**: Định dạng tên bảng tính: `` `${pad(h)}h${pad(min)} - ${pad(d)}/${pad(m)} - Tin tức BĐS [Tên Tỉnh]` ``.
    7.  **Đường dẫn thư mục con trên Drive**: Nếu muốn lưu vào thư mục riêng, hãy chỉnh sửa phần tìm kiếm/tạo thư mục con trên Google Drive (Ví dụ: Tìm `OANH` -> tạo `Antigravity AI lam viec` -> tạo `Tin tức [Tên Tỉnh]`).
    8.  **Định dạng Google Sheet**: Bảng tính cần có 7 cột: `STT`, `Tiêu đề bài báo`, `Đường dẫn [URL]`, `Tóm tắt nội dung`, `Góc nhìn phân tích`, `Kịch bản video`, `Nội dung đăng Facebook (Content FB)`.
    9.  **Facebook Footer**: Nối cố định chân trang thông tin liên hệ và hashtag quảng cáo của TongkhoBDS.com ở cuối trường `fb_content` khi lưu vào Google Sheets.

---

## BƯỚC 3: Tạo File Chạy PowerShell (`fetch_[tên_tỉnh]_news.ps1`)

Tạo tệp PowerShell wrapper để Task Scheduler chạy ngầm và ghi log:
```powershell
# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = Get-Location }

$today = Get-Date -Format "yyyyMMdd"
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "scrape_[province]_$today.log"

$jsScript = Join-Path $scriptDir "fetch_[province]_news.js"

Start-Transcript -Path $logFile -Append | Out-Null
node $jsScript
Stop-Transcript | Out-Null
```

---

## BƯỚC 4: Đăng Ký Lịch Chạy Task Scheduler (`setup_[tên_tỉnh]_schedule.ps1`)

Đăng ký hệ thống chạy tự động vào lúc **7:00 AM hàng ngày (Thứ 2 - Thứ 7)**:
*   Đặt tên tác vụ: `Daily_[Province]_Real_Estate_News_Crawler`.
*   Đặt đường dẫn tới file `.ps1` vừa tạo ở Bước 3.
*   Chạy script đăng ký dưới quyền Administrator trên máy tính của người dùng để lưu lịch biểu vào hệ thống Windows.

---

## BƯỚC 5: Kiểm Tra và Bàn Giao
*   Chạy thử tệp Node.js bằng lệnh `node fetch_[province]_news.js` để kiểm tra khả năng quét bài, kết nối API Gemini, tạo Sheet và định dạng trực tiếp trên Google Drive.
*   Gửi liên kết tệp Google Sheet đã tạo trên Drive cho người dùng kiểm tra kết quả.
