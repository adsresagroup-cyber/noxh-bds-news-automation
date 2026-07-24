# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Set paths dynamically
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = Get-Location
}

$current = $scriptDir
$antigravityIdePath = $null
while ($current -and (Split-Path $current -Leaf) -ne "") {
    if ((Split-Path $current -Leaf) -eq ".antigravity-ide") {
        $antigravityIdePath = $current
        break
    }
    $current = Split-Path $current -Parent
}

if ($env:GITHUB_WORKSPACE) {
    $metaAdsApiDir = Join-Path $env:GITHUB_WORKSPACE "meta ads api"
    if (-not (Test-Path $metaAdsApiDir)) {
        $metaAdsApiDir = Join-Path $env:GITHUB_WORKSPACE "meta_ads_api"
    }
} elseif ($null -ne $antigravityIdePath) {
    $metaAdsApiDir = Join-Path $antigravityIdePath "meta ads api"
    if (-not (Test-Path $metaAdsApiDir)) {
        $metaAdsApiDir = Join-Path $antigravityIdePath "meta_ads_api"
    }
} else {
    $metaAdsApiDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\..\meta ads api"))
    if (-not (Test-Path $metaAdsApiDir)) {
        $metaAdsApiDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\..\meta_ads_api"))
    }
}

$reportsDir = Join-Path $scriptDir "reports"
if (-not (Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
}

$today = Get-Date -Format "yyyyMMdd"
$reportFileCsv = Join-Path $reportsDir "national_real_estate_report_$today.csv"

# Calculate the 7:30 AM to 7:30 AM date window for filtering (Monday includes Sunday/weekend)
$now = Get-Date
$today730AM = Get-Date -Hour 7 -Minute 30 -Second 0

if ($now -ge $today730AM) {
    $endTime = $today730AM
    if ($now.DayOfWeek -eq [System.DayOfWeek]::Monday) {
        $startTime = $today730AM.AddDays(-2)
    } else {
        $startTime = $today730AM.AddDays(-1)
    }
} else {
    $endTime = $today730AM.AddDays(-1)
    if ($now.DayOfWeek -eq [System.DayOfWeek]::Monday) {
        $startTime = $today730AM.AddDays(-3)
    } else {
        $startTime = $today730AM.AddDays(-2)
    }
}

Write-Host "--- QUY TRÌNH TIN TỨC BẤT ĐỘNG SẢN TOÀN QUỐC ---" -ForegroundColor Green
Write-Host "Lọc bài viết từ: $($startTime.ToString('dd/MM/yyyy HH:mm:ss')) đến: $($endTime.ToString('dd/MM/yyyy HH:mm:ss'))" -ForegroundColor Yellow

# Google Sheets API Config & Token Setup
$tokenPath = Join-Path $metaAdsApiDir "token.json"

if (-not (Test-Path $tokenPath)) {
    Write-Host "X Loi: Chua tim thay file token.json tai $tokenPath." -ForegroundColor Red
    Write-Host "Goi y: Vui long chay kich ban lien ket tai khoan truoc bang lenh:" -ForegroundColor Yellow
    Write-Host "   cd '$metaAdsApiDir'" -ForegroundColor Yellow
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\linked_google_account.ps1" -ForegroundColor Yellow
    exit 1
}

$tokenData = Get-Content $tokenPath -Raw | ConvertFrom-Json
$accessToken = $tokenData.token

# Load Gemini API Key from environment or .env file
$geminiApiKey = $env:GEMINI_API_KEY
if ([string]::IsNullOrEmpty($geminiApiKey)) {
    $envPath = Join-Path $metaAdsApiDir ".env"
    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                if ($line -match "^GEMINI_API_KEY=(.*)$") {
                    $geminiApiKey = $Matches[1].Trim().Trim('"').Trim("'")
                }
            }
        }
    }
}
if ([string]::IsNullOrEmpty($geminiApiKey)) {
    Write-Warning "X CANH BAO: GEMINI_API_KEY rong! Khong the goi AI!"
} else {
    Write-Host "Da ket noi GEMINI_API_KEY (Do dai: $($geminiApiKey.Length) ky tu)." -ForegroundColor Green
}

# Helper to automatically refresh Google OAuth token if expired (401 Unauthorized)
function Refresh-GoogleToken {
    param ($tData)
    Write-Host "Access Token het han. Dang tu dong lam moi bang Refresh Token..." -ForegroundColor Yellow
    try {
        $refreshBody = @{
            client_id     = $tData.client_id
            client_secret = $tData.client_secret
            refresh_token = $tData.refresh_token
            grant_type    = "refresh_token"
        }
        
        $refreshRes = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method Post -Body $refreshBody
        $newAccessToken = $refreshRes.access_token
        
        # Save updated token
        $tData.token = $newAccessToken
        $tData | ConvertTo-Json -Depth 10 | Out-File $tokenPath -Encoding utf8
        
        Write-Host "Lam moi Access Token thanh cong!" -ForegroundColor Green
        return $newAccessToken
    } catch {
        Write-Host "X Khong the tu dong lam moi Token. Vui long chay lai script lien ket tai khoan." -ForegroundColor Red
        throw $_
    }
}

# Helper to invoke Google REST API and retry on 401
function Invoke-GoogleApi {
    param (
        [string]$Uri,
        [string]$Method,
        [hashtable]$Headers,
        [string]$Body
    )
    
    try {
        if ($Body) {
            return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -Body $Body -ContentType "application/json; charset=utf-8"
        } else {
            return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers
        }
    } catch {
        $statusCode = 0
        if ($null -ne $_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode
        }
        
        if ($statusCode -eq [System.Net.HttpStatusCode]::Unauthorized -and $null -ne $tokenData.refresh_token) {
            $newAccessToken = Refresh-GoogleToken -tData $tokenData
            $Headers["Authorization"] = "Bearer $newAccessToken"
            if ($Body) {
                return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -Body $Body -ContentType "application/json; charset=utf-8"
            } else {
                return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers
            }
        } else {
            throw $_
        }
    }
}


# List of items
$newsItems = @()

# Helper to check real estate keywords
function Test-RE-Keyword ($text) {
    if ($null -eq $text) { return $false }
    $textLower = $text.ToLower()
    $keywords = @("bất động sản", "nhà đất", "chung cư", "đất nền", "quy hoạch", "bđs", "dự án", "căn hộ", "biệt thự", "shophouse", "nhà ở", "đô thị", "đầu tư bđs")
    foreach ($k in $keywords) {
        if ($textLower.Contains($k)) {
            return $true
        }
    }
    return $false
}

# Helper to check target cities
function Get-Matched-Cities ($title, $desc) {
    $text = ($title + " " + $desc).ToLower()
    $matched = @()
    
    # 1. Hà Nội
    $hnKeywords = @("hà nội", "hn", "long biên", "thanh trì", "hoàng mai", "bồ đề", "cầu giấy", "nam từ liêm", "bắc từ liêm", "đông anh", "gia lâm", "mê linh", "thường tín", "hoài đức", "đống đa", "ba đình", "hoàn kiếm", "thanh xuân", "hai bà trưng")
    foreach ($k in $hnKeywords) {
        if ($text.Contains($k)) {
            $matched += "Hà Nội"
            break
        }
    }
    
    # 2. HCM
    $hcmKeywords = @("hồ chí minh", "tp.hcm", "tphcm", "sài gòn", "thủ đức", "quận 2", "quận 9", "bình chánh", "nhà bè", "quận 1", "quận 7", "quận 3", "quận 10", "bình tân", "gò vấp", "tân bình", "hóc môn", "củ chi")
    foreach ($k in $hcmKeywords) {
        if ($text.Contains($k)) {
            $matched += "HCM"
            break
        }
    }
    
    # 3. Nghệ An
    $naKeywords = @("nghệ an", "vinh", "diễn châu", "cửa lò", "nghe an", "quỳnh lưu", "thanh chương", "đô lương", "yên thành", "nghĩa đàn")
    foreach ($k in $naKeywords) {
        if ($text.Contains($k)) {
            $matched += "Nghệ An"
            break
        }
    }
    
    # 4. Hải Phòng
    $hpKeywords = @("hải phòng", "hp", "vũ yên", "thủy nguyên", "đồ sơn", "an dương", "an lão", "kiến thụy", "cát hải", "cát bà", "lê chân", "hồng bàng", "ngô quyền")
    foreach ($k in $hpKeywords) {
        if ($text.Contains($k)) {
            $matched += "Hải Phòng"
            break
        }
    }
    
    # 5. Đà Nẵng
    $dnKeywords = @("đà nẵng", "da nang", "ngũ hành sơn", "liên chiểu", "sơn trà", "hải châu", "thanh khê", "hòa vang")
    foreach ($k in $dnKeywords) {
        if ($text.Contains($k)) {
            $matched += "Đà Nẵng"
            break
        }
    }
    
    return $matched
}

# Helper to calculate Jaccard Similarity between two titles (word-based)
function Get-JaccardSimilarity ($title1, $title2) {
    if ([string]::IsNullOrEmpty($title1) -or [string]::IsNullOrEmpty($title2)) { return 0.0 }
    
    # Extract words with 2 or more chars
    $words1 = [regex]::Matches($title1.ToLower(), '\w{2,}') | ForEach-Object { $_.Value }
    $words2 = [regex]::Matches($title2.ToLower(), '\w{2,}') | ForEach-Object { $_.Value }
    
    if ($words1.Count -eq 0 -or $words2.Count -eq 0) { return 0.0 }
    
    # Create HashSets for fast intersection/union
    $set1 = [System.Collections.Generic.HashSet[string]]::new([string[]]$words1)
    $set2 = [System.Collections.Generic.HashSet[string]]::new([string[]]$words2)
    
    $intersection = 0
    foreach ($w in $set1) {
        if ($set2.Contains($w)) { $intersection++ }
    }
    
    $union = $set1.Count + $set2.Count - $intersection
    if ($union -eq 0) { return 0.0 }
    
    return $intersection / $union
}

# Helper to select top 6 most prominent and diverse articles using Gemini API
function Select-ProminentNews-WithAI {
    param (
        [array]$candidates
    )
    
    if ([string]::IsNullOrEmpty($geminiApiKey)) {
        Write-Warning "GEMINI_API_KEY is empty. Cannot use AI selection."
        return $null
    }
    
    if ($candidates.Count -lt 6) {
        Write-Warning "So luong ung vien ($($candidates.Count)) it hon 6. Tu dong lay tat ca."
        return $candidates
    }
    
    Write-Host "Dang gui $($candidates.Count) tin tuc ung vien sang Gemini de lua chon 6 tin noi bat va da dang..." -ForegroundColor Yellow
    
    $candText = @()
    $idx = 1
    foreach ($c in $candidates) {
        $candText += "[$idx] Tieu de: $($c.Title)`n    Nguon: $($c.Source)`n    Tom tat: $($c.Desc)"
        $idx++
    }
    $candidateListStr = $candText -join "`n`n"
    
    $url = "https://openrouter.ai/api/v1/chat/completions"
    
    $systemInstruction = @"
Bạn là một Biên tập viên Báo chí và Chuyên gia Phân tích Thị trường Bất động sản Việt Nam xuất sắc.
Nhiệm vụ của bạn là nhận vào danh sách các bài viết bất động sản đã thu thập và chọn ra đúng 6 bài viết nổi bật, chất lượng và đa dạng chủ đề nhất để làm nội dung xây dựng kịch bản video và bài viết fanpage.

[Tiêu chí lựa chọn bắt buộc]
1. Độ nổi bật (Prominence):
   - Ưu tiên cao: Các thay đổi chính sách vĩ mô (Luật Đất đai, Luật Nhà ở, Luật Kinh doanh BĐS), quyết định quy hoạch lớn (đường vành đai, cao tốc, sân bay), biến động lãi suất ngân hàng, dòng tiền lớn, số liệu thống kê từ Bộ Xây dựng hoặc tổ chức uy tín.
   - Tránh: Tin giao dịch nhỏ lẻ cá nhân, tin PR giới thiệu sản phẩm của một dự án nhỏ, các tin tức giật gân không mang giá trị vĩ mô/thị trường.
2. Sự đa dạng (Diversity):
   - 6 bài viết được chọn phải có chủ đề khác nhau (ví dụ: 1-2 tin về hạ tầng/quy hoạch, 1 tin về chính sách/luật pháp, 1 tin về tài chính/lãi suất ngân hàng, 1-2 tin về xu hướng giá cả/thị trường căn hộ/đất nền).
   - Tuyệt đối không chọn nhiều bài cùng đưa tin về một sự việc hoặc một bài báo viết lại (Dù tiêu đề và nguồn khác nhau).
3. Đầu ra:
   - BẮT BUỘC trả về kết quả định dạng JSON chuẩn:
   {
     "SelectedIndices": [số_thứ_tự_1, số_thứ_tự_2, số_thứ_tự_3, số_thứ_tự_4, số_thứ_tự_5, số_thứ_tự_6]
   }
   Trong đó, số_thứ_tự là số nằm trong dấu ngoặc vuông [] ở danh sách đầu vào (1-indexed). Sắp xếp mảng SelectedIndices theo thứ tự độ nổi bật giảm dần (bài nổi bật nhất đứng đầu).
"@

    $userPrompt = @"
[Danh sách tin ứng viên]
$candidateListStr

Hãy chọn ra chính xác 6 tin tức tốt nhất theo các tiêu chí trên và trả về kết quả dạng JSON.
"@

    $bodyObj = @{
        model = "openai/gpt-4o-mini"
        messages = @(
            @{
                role = "system"
                content = $systemInstruction
            },
            @{
                role = "user"
                content = $userPrompt
            }
        )
        response_format = @{
            type = "json_object"
        }
        temperature = 0.1
    }
    
    $bodyJson = ConvertTo-Json -InputObject $bodyObj -Depth 10
    $headers = @{
        "Authorization" = "Bearer $geminiApiKey"
        "Content-Type" = "application/json; charset=utf-8"
    }
    
    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson)) -ContentType "application/json; charset=utf-8" -OutFile $tempFile -TimeoutSec 45 -UseBasicParsing
        $jsonText = Get-Content -Path $tempFile -Raw -Encoding UTF8
        $res = $jsonText | ConvertFrom-Json
        $rawContent = $res.choices[0].message.content
        if ($null -ne $rawContent) {
            # Clean possible formatting
            $cleanedContent = $rawContent -replace "\r?\n(?!\s*(\`"SelectedIndices\`"|\}))", " "
            $parsed = $cleanedContent | ConvertFrom-Json
            if ($null -ne $parsed -and $null -ne $parsed.SelectedIndices -and $parsed.SelectedIndices.Count -eq 6) {
                $selected = @()
                foreach ($idx in $parsed.SelectedIndices) {
                    $itemIndex = $idx - 1
                    if ($itemIndex -ge 0 -and $itemIndex -lt $candidates.Count) {
                        $selected += $candidates[$itemIndex]
                    }
                }
                if ($selected.Count -eq 6) {
                    Write-Host "   -> Gemini da chon thanh cong 6 tin tuc noi bat." -ForegroundColor Green
                    if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
                    return $selected
                }
            }
        }
        Write-Warning "Phan hoi tu Gemini khong khop cau truc mong muon hoac so luong khong du 6 bai."
    } catch {
        Write-Warning "Loi khi goi Gemini API de chon tin: $_"
    } finally {
        if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
    }
    return $null
}

# Helper to check if news is social housing
function Test-Is-Social-Housing ($title, $desc) {
    $text = ($title + " " + $desc).ToLower()
    $noxhKeywords = @("nhà ở xã hội", "noxh", "nhà xã hội", "nhà ở công nhân", "nhà công nhân", "nhà thu nhập thấp", "ở xã hội", "hồ sơ xã hội", "nha o xa hoi", "nha xa hoi", "happy home")
    foreach ($k in $noxhKeywords) {
        if ($text.Contains($k)) {
            return $true
        }
    }
    return $false
}

# Helper to decode CDATA or raw title
function Decode-Title ($titleObj) {
    if ($null -eq $titleObj) { return "" }
    if ($titleObj -is [System.Xml.XmlElement]) {
        return [System.Net.WebUtility]::HtmlDecode($titleObj.InnerText).Trim()
    }
    return [System.Net.WebUtility]::HtmlDecode($titleObj.ToString()).Trim()
}

# Helper to generate News style script (Voiceover + Visual descriptions)
function Get-NewsScript ($title, $desc, $source, $duration) {
    $visuals = @(
        "[0s - 5s] Cảnh quay flycam góc rộng khu đô thị hiện đại. Chèn chữ nổi bật: 'TIN NÓNG BẤT ĐỘNG SẢN!'.",
        "[5s - 20s] Chuyển cảnh nhanh: Ảnh chụp cận cảnh tiêu đề bài báo trên trang $source. Zoom vào tiêu đề: '$title'.",
        "[20s - 45s] Cảnh người dân tham quan dự án hoặc văn phòng giao dịch bất động sản đông đúc.",
        "[45s - $($duration)s] Cảnh toàn cảnh thành phố rực rỡ, hiển thị nút đăng ký kênh."
    ) -join "`r`n"
    
    $voiceoff = @(
        "XU HƯỚNG MỚI: $($title.ToUpper()) - CƠ HỘI NÀO CHO NHÀ ĐẦU TƯ!",
        "",
        "Các bác đã nghe thông tin nóng hổi này về thị trường bất động sản chưa? Theo nguồn tin mới nhận từ ${source}: $desc. Đây là thông tin cực kỳ quan trọng, tác động trực tiếp đến xu hướng dòng tiền và các quyết định mua bán lúc này. Các bác đánh giá thế nào về diễn biến này? Hãy để lại bình luận thảo luận bên dưới và theo dõi kênh nhé!"
    ) -join "`r`n"

    $fbContent = @"
🔥 $title!
Theo thông tin vừa cập nhật trên ${source}: $desc
👇 Xem ngay video để biết chi tiết
Theo bạn, chính sách này đã đủ hấp dẫn chưa? Bình luận bên dưới nhé!
"@
    
    return [PSCustomObject]@{
        Visuals         = $visuals
        Voiceover       = $voiceoff
        FacebookContent = $fbContent
    }
}

# Helper to generate Expert sharing style script (Voiceover + Visual descriptions)
function Get-ExpertScript ($title, $desc, $source, $duration) {
    $visuals = @(
        "[0s - 7s] Cảnh phân tích sơ đồ quy hoạch hạ tầng giao thông. Chèn chữ: 'GÓC NHÌN CHUYÊN GIA BĐS'.",
        "[7s - 25s] Sơ đồ phân tích dòng tiền và các yếu tố vĩ mô tăng trưởng bất động sản trên màn hình.",
        "[25s - 45s] Hình ảnh thực địa dự án đang triển khai, kiểm tra các hạng mục thi công.",
        "[45s - $($duration)s] Flycam dự án hoàn thiện khang trang, hiển thị nút đăng ký kênh."
    ) -join "`r`n"
    
    $voiceoff = @(
        "GÓC NHÌN CHUYÊN GIA VỀ THÔNG TIN: $($title.ToUpper())!",
        "",
        "Có vài khía cạnh sâu sắc về thông tin này mà nhà đầu tư cần biết rõ để tối ưu dòng tiền của mình nhé! Thông tin đăng trên ${source}: $desc. Dưới góc phân tích của mình, đây vừa là cơ hội nhưng cũng đi kèm rủi ro pháp lý cần cân nhắc kỹ. Lời khuyên cho các bác lúc này là: Hãy bám sát quy hoạch hạ tầng thực tế và pháp lý dự án trước khi xuống tiền. Các bác nghĩ sao về góc nhìn này? Cùng thảo luận dưới bình luận và follow kênh nhé!"
    ) -join "`r`n"

    $fbContent = @"
🔥 GÓC NHÌN THỰC TẾ: $title!
Theo thông tin trên ${source}: $desc. Dưới góc nhìn chuyên gia, chúng ta cần lưu ý kỹ các quy định pháp lý.
👇 Xem ngay video để biết chi tiết
Theo các bác, đây đã phải là thời điểm vàng để xuống tiền? Bình luận bên dưới nhé!
"@
    
    return [PSCustomObject]@{
        Visuals         = $visuals
        Voiceover       = $voiceoff
        FacebookContent = $fbContent
    }
}

# 1. Fetch from BaoMoi (Bất động sản tag)
Write-Host "Dang tai tin tuc tu BaoMoi tag Bất động sản..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://baomoi.com/tag/b%E1%BA%A5t-%C4%91%E1%BB%99ng-s%E1%BA%A3n.epi" -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -TimeoutSec 15 -UseBasicParsing
    $html = $response.Content
    $chunks = $html -split '<div class="group/card bm-card'
    foreach ($chunk in ($chunks | Select-Object -Skip 1)) {
        if ($chunk -match 'href="(\/[^"]+-c\d+\.epi)"[^>]*title="([^"]+)"') {
            $link = "https://baomoi.com" + $Matches[1]
            $title = [System.Net.WebUtility]::HtmlDecode($Matches[2]).Trim()
            
            # Check publication date
            $pubDate = $null
            if ($chunk -match 'dateTime="([^"]+)"') {
                try { $pubDate = [DateTime]::Parse($Matches[1]) } catch {}
            }
            
            # Filter by date range
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
            
            if ($chunk -match 'class="bm-card-source[^"]*" title="([^"]+)"') { $source = $Matches[1] } else { $source = "BaoMoi" }
            if ($chunk -match 'class="description[^"]*">([^<]+)</p>') { $desc = [System.Net.WebUtility]::HtmlDecode($Matches[1]).Trim() } else { $desc = "" }
            
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = $link
                Source = $source
                Desc   = $desc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { (Get-Date).ToString("dd/MM/yyyy HH:mm") }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu BaoMoi: $_"
}

# 2. Fetch VnExpress RSS
Write-Host "Dang tai tin tuc tu VnExpress..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://vnexpress.net/rss/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "VnExpress"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu VnExpress: $_"
}

# 3. Fetch VietnamNet RSS
Write-Host "Dang tai tin tuc tu VietnamNet..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://vietnamnet.vn/rss/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "VietnamNet"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu VietnamNet: $_"
}

# 4. Fetch CafeF RSS
Write-Host "Dang tai tin tuc tu CafeF..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://cafef.vn/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "CafeF"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu CafeF: $_"
}

# 5. Fetch Dan Tri RSS
Write-Host "Dang tai tin tuc tu Dan Tri..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://dantri.com.vn/rss/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "Dan Tri"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Dan Tri: $_"
}

# 6. Fetch Thanh Nien RSS
Write-Host "Dang tai tin tuc tu Thanh Nien..." -ForegroundColor Cyan
try {
    $res = Invoke-WebRequest -Uri "https://thanhnien.vn/rss/thoi-su.rss" -UserAgent "Mozilla/5.0" -TimeoutSec 10 -UseBasicParsing
    $xml = [xml]$res.Content.Trim()
    $items = $xml.GetElementsByTagName("item")
    foreach ($item in $items) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate.InnerText) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        $link = Decode-Title $item.link
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = $link
                Source = "Thanh Nien"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { (Decode-Title $item.pubDate) }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Thanh Nien: $_"
}

# 7. Fetch Tuoi Tre RSS
Write-Host "Dang tai tin tuc tu Tuoi Tre..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://tuoitre.vn/rss/kinh-doanh.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "Tuoi Tre"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Tuoi Tre: $_"
}

# 8. Fetch Lao Dong RSS
Write-Host "Dang tai tin tuc tu Lao Dong..." -ForegroundColor Cyan
try {
    $laodongUrl = "https://laodong.vn/rss/bat-dong-san.rss"
    $userAgent = "Mozilla/5.0"
    $res1 = Invoke-WebRequest -Uri $laodongUrl -UserAgent $userAgent -TimeoutSec 10 -UseBasicParsing
    if ($res1.Content -match 'document\.cookie="([^"]+)"') {
        $cookieStr = $Matches[1]
        $parts = $cookieStr -split '='
        $cookieName = $parts[0]
        $cookieVal = $parts[1]
        
        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $cookie = New-Object System.Net.Cookie($cookieName, $cookieVal, "/", "laodong.vn")
        $session.Cookies.Add($cookie)
        
        $rss = Invoke-RestMethod -Uri $laodongUrl -UserAgent $userAgent -WebSession $session -TimeoutSec 10
        foreach ($item in $rss) {
            $title = Decode-Title $item.title
            $desc = Decode-Title $item.description
            $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
            
            $pubDate = $null
            if ($null -ne $item.pubDate) {
                try { $pubDate = [DateTime]::Parse((Decode-Title $item.pubDate)) } catch {}
            }
            
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
            
            $link = Decode-Title $item.link
            if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
                $newsItems += [PSCustomObject]@{
                    Title  = $title
                    Link   = $link
                    Source = "Lao Dong"
                    Desc   = $cleanDesc
                    Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { (Decode-Title $item.pubDate) }
                }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Lao Dong: $_"
}

# 9. Fetch Bao Xay dung RSS
Write-Host "Dang tai tin tuc tu Bao Xay dung..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://baoxaydung.vn/rss/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "Bao Xay dung"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Bao Xay dung: $_"
}

# 10. Fetch Bao Dau tu
Write-Host "Dang tai tin tuc tu Bao Dau tu..." -ForegroundColor Cyan
try {
    $res = Invoke-WebRequest -Uri "https://baodautu.vn/bat-dong-san-c30/" -UserAgent "Mozilla/5.0" -TimeoutSec 10 -UseBasicParsing
    $html = $res.Content
    $chunks = $html -split '<article'
    foreach ($chunk in ($chunks | Select-Object -Skip 1)) {
        if ($chunk -match 'href="([^"]+-d\d+\.html)"') {
            $link = $Matches[1]
            if (-not $link.StartsWith("http")) {
                $link = "https://baodautu.vn" + $link
            }
            
            $escLink = [regex]::Escape($link)
            $title = ""
            $aMatches = [regex]::Matches($chunk, "<a[^>]+href=""$escLink""[^>]*>(.*?)</a>")
            foreach ($am in $aMatches) {
                $innerText = [regex]::Replace($am.Groups[1].Value, '<[^>]+>', '').Trim()
                if ($innerText.Length -gt $title.Length) {
                    $title = $innerText
                }
            }
            $title = [System.Net.WebUtility]::HtmlDecode($title).Trim()
            
            if ([string]::IsNullOrEmpty($title) -or $title.Length -lt 10) { continue }
            
            $pubDate = $null
            if ($chunk -match 'Images/[^/]*/(\d{4})/(\d{2})/(\d{2})/') {
                try { $pubDate = [DateTime]::Parse("$($Matches[1])-$($Matches[2])-$($Matches[3])") } catch {}
            }
            
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
            
            $desc = ""
            if ($chunk -match '<div[^>]+class="[^"]*summary[^"]*"[^>]*>(.*?)</div>') {
                $desc = [regex]::Replace($Matches[1], '<[^>]+>', '').Trim()
            }
            $desc = [System.Net.WebUtility]::HtmlDecode($desc).Trim()
            if ([string]::IsNullOrEmpty($desc)) { $desc = $title }
            
            if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
                $newsItems += [PSCustomObject]@{
                    Title  = $title
                    Link   = $link
                    Source = "Bao Dau tu"
                    Desc   = $desc
                    Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { (Get-Date).ToString("dd/MM/yyyy HH:mm") }
                }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Bao Dau tu: $_"
}

# 11. Fetch Bao Chinh phu RSS
Write-Host "Dang tai tin tuc tu Bao Chinh phu..." -ForegroundColor Cyan
try {
    $res = Invoke-WebRequest -Uri "https://baochinhphu.vn/home.rss" -UserAgent "Mozilla/5.0" -TimeoutSec 10 -UseBasicParsing
    $xml = [xml]$res.Content.Trim()
    $items = $xml.GetElementsByTagName("item")
    foreach ($item in $items) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate.InnerText) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        $link = Decode-Title $item.link
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = $link
                Source = "Bao Chinh phu"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { (Decode-Title $item.pubDate) }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu Bao Chinh phu: $_"
}

# 12. Fetch QDND RSS
Write-Host "Dang tai tin tuc tu QDND..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://www.qdnd.vn/rss/cate/kinh-te.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try { $pubDate = [DateTime]::Parse($item.pubDate) } catch {}
        }
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) { continue }
        
        if ((Test-RE-Keyword $title) -or (Test-RE-Keyword $desc)) {
            $newsItems += [PSCustomObject]@{
                Title  = $title
                Link   = Decode-Title $item.link
                Source = "QDND"
                Desc   = $cleanDesc
                Date   = if ($null -ne $pubDate) { $pubDate.ToString("dd/MM/yyyy HH:mm") } else { $item.pubDate }
            }
        }
    }
} catch {
    Write-Warning "Loi khi tai tu QDND: $_"
}

# Deduplicate items using exact link match and Jaccard similarity for titles
$uniqueNews = @()
$seenLinks = @{}

foreach ($item in $newsItems) {
    $item.Link = [string]$item.Link
    $cleanLink = $item.Link.Split('?')[0].Trim().ToLower()
    
    # Exclude social housing news to prevent duplication
    if (Test-Is-Social-Housing -title $item.Title -desc $item.Desc) {
        continue
    }
    
    if ($seenLinks.ContainsKey($cleanLink)) {
        continue
    }
    
    # Check Jaccard Similarity of the title against already processed unique articles
    $isDuplicate = $false
    foreach ($seenItem in $uniqueNews) {
        $similarity = Get-JaccardSimilarity -title1 $item.Title -title2 $seenItem.Title
        if ($similarity -gt 0.45) { # Threshold of 45% word overlap to catch similar news
            $isDuplicate = $true
            Write-Host "   [Loc trung] Phat hien trung lap tieu de ($([Math]::Round($similarity * 100))%): '$($item.Title)' va '$($seenItem.Title)'" -ForegroundColor DarkGray
            break
        }
    }
    
    if (-not $isDuplicate) {
        $seenLinks[$cleanLink] = $true
        $uniqueNews += $item
    }
}

# Scoring function (Fallback)
function Get-ArticleScore ($title) {
    $score = 0
    $titleLower = $title.ToLower()
    
    # Priority 1: High prominence topics (Macro policies, core law changes, major infra) - 15 points
    $highPriority = @(
        "luật đất đai", "luật nhà ở", "luật kinh doanh bất động sản", "luật kinh doanh bđs", 
        "quy hoạch", "khởi công", "mở bán", "lãi suất ngân hàng", "vành đai", "cao tốc", 
        "sân bay", "thông qua", "phê duyệt", "gỡ vướng", "thanh tra", "vi phạm", "thu hồi đất",
        "sốt đất", "tăng giá", "giảm giá", "đấu giá", "sai phạm", "hạ nhiệt", "vỡ nợ", "siết nợ"
    )
    # Priority 2: General real estate topics - 10 points
    $mediumPriority = @(
        "giá nhà", "chung cư", "đất nền", "ngân hàng", "lãi suất", "biệt thự", "nhà liền kề", 
        "nhà phố", "bất động sản", "bđs", "dự án", "căn hộ", "thị trường", "giao dịch"
    )
    
    foreach ($k in $highPriority) {
        if ($titleLower.Contains($k)) {
            $score += 15
        }
    }
    foreach ($k in $mediumPriority) {
        if ($titleLower.Contains($k)) {
            $score += 10
        }
    }
    return $score
}

# Attach MatchedCities and Score to all unique news candidates
$uniqueNewsScored = @()
foreach ($item in $uniqueNews) {
    $matchedCities = Get-Matched-Cities -title $item.Title -desc $item.Desc
    $item | Add-Member -MemberType NoteProperty -Name MatchedCities -Value $matchedCities -Force
    $score = Get-ArticleScore -title $item.Title
    $item | Add-Member -MemberType NoteProperty -Name Score -Value $score -Force
    $uniqueNewsScored += $item
}

# Sort all candidates by Score descending for fallback and pool filling
$scoredNews = $uniqueNewsScored | Sort-Object Score -Descending

$selectedNews = @()
$usingAISelection = $false

# Attempt AI selection first
$aiSelected = Select-ProminentNews-WithAI -candidates $scoredNews
if ($null -ne $aiSelected -and $aiSelected.Count -eq 6) {
    $selectedNews = $aiSelected
    $usingAISelection = $true
    Write-Host ">> Da su dung ket qua chon tin tu Gemini AI." -ForegroundColor Green
} else {
    Write-Warning ">> Tuyen chon AI that bai hoac khong du tin. Dang chuyen sang bo loc fallback tu dong..."
    
    # Fallback selection logic: simply select the top 6 highest-scoring articles
    $selectedLinks = @{}
    foreach ($item in $scoredNews) {
        if ($selectedNews.Count -ge 6) { break }
        $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
        if (-not $selectedLinks.ContainsKey($linkKey)) {
            $selectedNews += $item
            $selectedLinks[$linkKey] = $true
            Write-Host ">> (Fallback) Chon tin theo diem so: $($item.Title) (Diem: $($item.Score))" -ForegroundColor Gray
        }
    }
}

# Keep only top 10 candidates for report list, placing selected first
$candidatePool = @()
$candidateLinks = @{}
foreach ($item in $selectedNews) {
    $candidatePool += $item
    $candidateLinks[([string]$item.Link).Split('?')[0].Trim().ToLower()] = $true
}
foreach ($item in $scoredNews) {
    if ($candidatePool.Count -ge 10) { break }
    $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
    if (-not $candidateLinks.ContainsKey($linkKey)) {
        $candidatePool += $item
        $candidateLinks[$linkKey] = $true
    }
}

# Helper to guarantee Voiceover complies with word count constraints
function Get-ConformingVoiceover {
    param (
        [string]$rawVoiceover
    )
    
    if ([string]::IsNullOrEmpty($rawVoiceover)) {
        return $rawVoiceover
    }
    
    # Split into words to check current count
    $words = $rawVoiceover -split '\s+' | Where-Object { $_ -ne "" }
    $count = $words.Count
    
    $minWords = 230
    $maxWords = 290
    
    # If already in range, return as-is
    if ($count -ge $minWords -and $count -le $maxWords) {
        return $rawVoiceover
    }
    
    # Padding sentences if too short
    $paddingSentences = @(
        "Thị trường bất động sản thời điểm này đang ghi nhận những chuyển biến rất nhanh chóng và khó lường từ chính sách vĩ mô.",
        "Do đó, việc cập nhật tin tức hàng ngày một cách chính xác là vô cùng quan trọng đối với mỗi nhà đầu tư chuyên nghiệp.",
        "Chúng ta cần phải tỉnh táo phân tích kỹ lưỡng các yếu tố từ vị trí, hạ tầng cho đến tiềm năng tăng giá dài hạn.",
        "Bên cạnh đó, việc đa dạng hóa danh mục đầu tư và phân bổ nguồn vốn hợp lý sẽ giúp giảm thiểu rủi ro đáng kể.",
        "Đừng ngần ngại để lại những thắc mắc của bạn bên dưới để chúng ta có thể cùng trao đổi và hỗ trợ lẫn nhau.",
        "Mỗi thông tin chính sách mới đều có thể là chìa khóa mở ra những cơ hội đầu tư sinh lời vượt trội sắp tới."
    )
    
    if ($count -lt $minWords) {
        # Split by newline
        $lines = $rawVoiceover -split '\r?\n' | Where-Object { $_.Trim() -ne "" }
        if ($lines.Length -gt 1) {
            # Insert padding sentences before the CTA (last line)
            $cta = $lines[-1]
            $bodyLines = $lines[0..($lines.Length - 2)]
            
            $currentVoiceover = ($bodyLines -join "`r`n")
            foreach ($sentence in $paddingSentences) {
                $currentFull = $currentVoiceover + "`r`n" + $cta
                $currentWords = $currentFull -split '\s+' | Where-Object { $_ -ne "" }
                if ($currentWords.Count -ge $minWords) {
                    return $currentFull
                }
                $currentVoiceover = $currentVoiceover + " " + $sentence
            }
            return $currentVoiceover + "`r`n" + $cta
        } else {
            # Single line/paragraph
            $currentVoiceover = $rawVoiceover
            foreach ($sentence in $paddingSentences) {
                $currentWords = $currentVoiceover -split '\s+' | Where-Object { $_ -ne "" }
                if ($currentWords.Count -ge $minWords) {
                    return $currentVoiceover
                }
                $currentVoiceover = $currentVoiceover + " " + $sentence
            }
            return $currentVoiceover
        }
    }
    
    if ($count -gt $maxWords) {
        $lines = $rawVoiceover -split '\r?\n' | Where-Object { $_.Trim() -ne "" }
        
        if ($lines.Length -le 1) {
            # Single line: split by sentences
            $sentences = $rawVoiceover -split '(?<=[.!?])\s+' | Where-Object { $_.Trim() -ne "" }
            $selectedSentences = @()
            $currentWordsCount = 0
            
            foreach ($s in $sentences) {
                $sWords = $s -split '\s+' | Where-Object { $_ -ne "" }
                if ($currentWordsCount + $sWords.Count -le 280) { # Aim for 280 words max
                    $selectedSentences += $s
                    $currentWordsCount += $sWords.Count
                } else {
                    break
                }
            }
            
            # If empty (first sentence too long), just take first sentence
            if ($selectedSentences.Count -eq 0 -and $sentences.Count -gt 0) {
                return $sentences[0]
            }
            
            return ($selectedSentences -join " ")
        }
        
        # Multiple lines
        $cta = $lines[-1]
        $header = $lines[0]
        
        $ctaWords = $cta -split '\s+' | Where-Object { $_ -ne "" }
        $headerWords = $header -split '\s+' | Where-Object { $_ -ne "" }
        
        # Check if header + cta alone already exceeds max
        if (($headerWords.Count + $ctaWords.Count) -ge $maxWords) {
            return $header + "`r`n" + $cta
        }
        
        if ($lines.Length -eq 2) {
            # Only header and cta, no body lines
            return $header + "`r`n" + $cta
        }
        
        # More than 2 lines, so there are body lines in between
        $bodyLines = $lines[1..($lines.Length - 2)]
        $bodyText = $bodyLines -join " "
        $bodySentences = $bodyText -split '(?<=[.!?])\s+' | Where-Object { $_.Trim() -ne "" }
        
        $selectedBodySentences = @()
        $currentCount = $headerWords.Count + $ctaWords.Count
        
        foreach ($s in $bodySentences) {
            $sWords = $s -split '\s+' | Where-Object { $_ -ne "" }
            # Keep adding body sentences as long as we don't exceed 280 words total
            if ($currentCount + $sWords.Count -le 280) {
                $selectedBodySentences += $s
                $currentCount += $sWords.Count
            } else {
                break
            }
        }
        
        # Reconstruct: Header + Body + CTA
        $bodyPart = $selectedBodySentences -join " "
        return $header + "`r`n" + $bodyPart + "`r`n" + $cta
    }
    
    return $rawVoiceover
}



# Helper to rewrite scraped news into a structured kịch bản via Gemini API (OpenRouter)
function Rewrite-News-With-Gemini {
    param (
        [string]$title,
        [string]$desc,
        [string]$source,
        [string]$link,
        [string]$style
    )
    
    if ([string]::IsNullOrEmpty($geminiApiKey)) {
        Write-Warning "GEMINI_API_KEY is empty. Cannot use AI rewriting."
        return $null
    }
    
    $url = "https://openrouter.ai/api/v1/chat/completions"
    
    [string]$systemInstruction = ""
    $sysPromptPath = Join-Path $scriptDir "national_news_system_instruction.txt"
    if (Test-Path $sysPromptPath) {
        $systemInstruction = [string](Get-Content -Path $sysPromptPath -Raw -Encoding utf8)
    } else {
        $systemInstruction = "[Bối cảnh & Vai trò]`nBạn là một Biên kịch nội dung Video ngắn xuất sắc và là một Nhà môi giới Bất động sản chuyên nghiệp tại Việt Nam."
    }

    $maxAttempts = 3
    $attempt = 1
    $additionalHint = ""
    $lastParsed = $null
    
    while ($attempt -le $maxAttempts) {
        [string]$userPrompt = @"
[Thông tin đầu vào]
Tiêu đề bài báo: $title
Đường dẫn: $link
Nguồn tin: $source
Mô tả tóm tắt: $desc
Phong cách: $style

[YÊU CẦU BẮT BUỘC VỀ ĐỘ DÀI & ĐỊNH DẠNG]
1. Dòng 1: CÂU TIÊU ĐỀ IN HOA TOÀN BỘ KÈM DẤU CHẤM CẢM (!).
2. Xuống dòng 2 lần, viết phần LỜI THOẠI ĐỌC VOICE-OFF LIỀN MẠCH từ đầu đến cuối.
3. TUYỆT ĐỐI KHÔNG GHI CÁC TỪ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' TRONG NỘI DUNG KỊCH BẢN.
4. ĐỘ DÀI BẮT BUỘC: Tổng số từ phần Voiceover (Tiêu đề + Lời thoại) PHẢI NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG VIẾT NGẮN DƯỚI 230 TỪ. AI cần mở rộng phân tích chuyên sâu các yếu tố tác động vĩ mô, pháp lý, bài học kinh nghiệm và góc nhìn đa chiều để đảm bảo đủ từ 230-290 từ.
5. Nội dung bài đăng Facebook "FacebookContent" phải từ 3 đến 5 dòng.
$additionalHint
"@
     
        $bodyObj = @{
            model = "openai/gpt-4o-mini"
            messages = @(
                @{
                    role = "system"
                    content = $systemInstruction
                },
                @{
                    role = "user"
                    content = $userPrompt
                }
            )
            response_format = @{
                type = "json_object"
            }
            temperature = 0.1
        }
        
        $bodyJson = ConvertTo-Json -InputObject $bodyObj -Depth 10
        $headers = @{
            "Authorization" = "Bearer $geminiApiKey"
            "Content-Type" = "application/json; charset=utf-8"
        }
        
        $tempFile = [System.IO.Path]::GetTempFileName()
        try {
            Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson)) -ContentType "application/json; charset=utf-8" -OutFile $tempFile -TimeoutSec 60 -UseBasicParsing
            $jsonText = Get-Content -Path $tempFile -Raw -Encoding UTF8
            $res = $jsonText | ConvertFrom-Json
            $rawContent = $res.choices[0].message.content
            if ($null -ne $rawContent) {
                $cleanedContent = $rawContent -replace "\r?\n(?!\s*(\`"Visuals\`"|\`"Voiceover\`"|\`"FacebookContent\`"|\}))", " "
                $parsed = $cleanedContent | ConvertFrom-Json
                
                # Accept parsed AI script and enforce 230-290 words
                if ($null -ne $parsed -and -not [string]::IsNullOrEmpty($parsed.Voiceover)) {
                    $lastParsed = $parsed
                    $rawWords = $parsed.Voiceover -split '\s+' | Where-Object { $_ -ne "" }
                    $rawWordCount = $rawWords.Count
                    
                    if ($rawWordCount -ge 230 -and $rawWordCount -le 290) {
                        Write-Host "   -> Thu thap kịch bản dat chuan 230-290 tu tu AI ($rawWordCount tu) o lan thu $attempt" -ForegroundColor Green
                        if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
                        return $parsed
                    } else {
                        Write-Host "   -> Kich ban o lan $attempt co $rawWordCount tu (chua dat 230-290 tu). Dang gui AI dieu chinh..." -ForegroundColor Yellow
                        if ($rawWordCount -lt 230) {
                            $additionalHint = "[YÊU CẦU ĐIỀU CHỈNH ĐỘ DÀI]`nKịch bản vừa viết chỉ có $rawWordCount từ (dưới 230 từ). Vui lòng bổ sung thêm các phân tích chuyên sâu tác động thực tế, cơ hội đầu tư, rủi ro pháp lý để tổng số từ NẰM CHÍNH XÁC TRONG KHOẢNG TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT."
                        } else {
                            $additionalHint = "[YÊU CẦU ĐIỀU CHỈNH ĐỘ DÀI]`nKịch bản vừa viết có $rawWordCount từ (vượt quá 290 từ). Vui lòng cô đọng lại lời thoại để tổng số từ NẰM CHÍNH XÁC TRONG KHOẢNG TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT."
                        }
                    }
                }
            }
        } catch {
            Write-Warning "Gemini API error during news rewriting on attempt ${attempt}: $_"
        } finally {
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -Force
            }
        }
        
        $attempt++
    }
    
    if ($null -ne $lastParsed) {
        return $lastParsed
    }
    
    Write-Warning "Khong the sinh kịch bản nao sau $maxAttempts lan thu. Tra ve null."
    return $null
}

# Prepare rows for local export and values for Google Sheet
$rows = @()
$values = @()
$headersRow = @("STT", "Tiêu đề", "Đường dẫn", "Phong cách", "Kịch bản Voice-off (Lời thoại)", "Nội dung đăng Facebook (Content FB)")
$values += ,$headersRow

$styles = @("Tin tức", "Tin tức", "Chuyên gia chia sẻ", "Tin tức", "Tin tức", "Chuyên gia chia sẻ")
$idx = 1
$selectedCount = 0

foreach ($item in $candidatePool) {
    $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
    $isSelected = $false
    foreach ($selected in $selectedNews) {
        if (([string]$selected.Link).Split('?')[0].Trim().ToLower() -eq $linkKey) {
            $isSelected = $true
            break
        }
    }
    
    if ($isSelected) {
        $style = $styles[$selectedCount % $styles.Count]
        $selectedCount++
        
        Write-Host "Dang phan tich & viet kich ban bai $($selectedCount): $($item.Title)..." -ForegroundColor Yellow
        $scriptObj = Rewrite-News-With-Gemini -title $item.Title -desc $item.Desc -source $item.Source -link $item.Link -style $style
        
        if ($null -eq $scriptObj -or [string]::IsNullOrEmpty($scriptObj.Voiceover)) {
            Write-Warning "Gemini rewriting failed. Falling back to template."
            if ($style -eq "Chuyên gia chia sẻ") {
                $scriptObj = Get-ExpertScript -title $item.Title -desc $item.Desc -source $item.Source -duration 60
            } else {
                $scriptObj = Get-NewsScript -title $item.Title -desc $item.Desc -source $item.Source -duration 60
            }
        }
        
        $fbContent = ""
        if ($null -ne $scriptObj.FacebookContent -and -not [string]::IsNullOrEmpty($scriptObj.FacebookContent)) {
            $fbContent = $scriptObj.FacebookContent.Trim()
        } else {
            $fbContent = @"
🔥 $($item.Title)!
Theo dõi ngay để cập nhật những chuyển động và cơ hội đầu tư bất động sản toàn quốc mới nhất!
👇 Xem ngay video để biết chi tiết
Bình luận ý kiến thảo luận của bạn bên dưới nhé!
"@
        }
        
        # General TongKhoBDS footer for national news
        $footer = @"
-----------------------------------------
🏠 TongkhoBDS.com - Kho Bất động sản lớn nhất Việt Nam
🏢 Địa chỉ: 51 Kim Mã, Phường Giảng Võ, Hà Nội
☎️ Hotline: 1900.988.998
⚡ Youtube: https://www.youtube.com/@tongkhobatdongsan
#batdongsan #tongkhobatdongsan #tintuc #24h
"@
        $fbContent = $fbContent + "`r`n" + $footer
        
        $rows += [PSCustomObject]@{
            "STT" = $idx
            "Tiêu đề" = $item.Title
            "Đường dẫn" = $item.Link
            "Phong cách" = $style
            "Kịch bản Voice-off (Lời thoại)" = $scriptObj.Voiceover
            "Nội dung đăng Facebook (Content FB)" = $fbContent
        }

        $row = @(
            $idx,
            $item.Title,
            $item.Link,
            $style,
            $scriptObj.Voiceover,
            $fbContent
        )
    } else {
        $rows += [PSCustomObject]@{
            "STT" = $idx
            "Tiêu đề" = $item.Title
            "Đường dẫn" = $item.Link
            "Phong cách" = ""
            "Kịch bản Voice-off (Lời thoại)" = ""
            "Nội dung đăng Facebook (Content FB)" = ""
        }

        $row = @(
            $idx,
            $item.Title,
            $item.Link,
            "",
            "",
            ""
        )
    }
    $values += ,$row
    $idx++
}

# Setup Headers for Google API
$headers = @{
    "Authorization" = "Bearer $accessToken"
}

$targetFolderId = $null

# Search for OANH folder on Google Drive
Write-Host "Dang tim thu muc 'OANH' tren Google Drive..." -ForegroundColor Cyan
$oanhSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false&fields=files(id,name)"
try {
    $searchResponse = Invoke-GoogleApi -Uri $oanhSearchUrl -Method Get -Headers $headers
    if ($searchResponse.files -and $searchResponse.files.Count -gt 0) {
        $oanhFolderId = $searchResponse.files[0].id
        Write-Host "Da tim thay thu muc 'OANH' voi ID: $oanhFolderId" -ForegroundColor Green
        
        # Search for 'Antigravity AI lam viec' inside 'OANH'
        Write-Host "Dang tim thu muc 'Antigravity AI lam viec' ben trong 'OANH'..." -ForegroundColor Cyan
        $subFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='Antigravity AI lam viec' and '$oanhFolderId' in parents and trashed=false&fields=files(id,name)"
        $subFolderResponse = Invoke-GoogleApi -Uri $subFolderSearchUrl -Method Get -Headers $headers
        
        if ($subFolderResponse.files -and $subFolderResponse.files.Count -gt 0) {
            $targetFolderId = $subFolderResponse.files[0].id
            Write-Host "Da tim thay thu muc 'Antigravity AI lam viec' voi ID: $targetFolderId" -ForegroundColor Green
        } else {
            # Create the subfolder 'Antigravity AI lam viec' under 'OANH'
            Write-Host "Chua co thu muc 'Antigravity AI lam viec'. Dang tao moi..." -ForegroundColor Cyan
            $createFolderBody = @{
                name = "Antigravity AI lam viec"
                mimeType = "application/vnd.google-apps.folder"
                parents = @($oanhFolderId)
            } | ConvertTo-Json -Depth 10
            
            $createFolderResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $createFolderBody
            $targetFolderId = $createFolderResponse.id
            Write-Host "Da tao thu muc 'Antigravity AI lam viec' voi ID: $targetFolderId" -ForegroundColor Green
        }

        # Search or create 'Tin tức bất động sản toàn quốc' folder inside 'Antigravity AI lam viec'
        if ($null -ne $targetFolderId) {
            Write-Host "Dang tim thu muc 'Tin tuc bat dong san toan quoc' ben trong 'Antigravity AI lam viec'..." -ForegroundColor Cyan
            $newsFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='Tin tuc bat dong san toan quoc' or name='Tin tức bất động sản toàn quốc') and '$targetFolderId' in parents and trashed=false&fields=files(id,name)"
            $newsFolderResponse = Invoke-GoogleApi -Uri $newsFolderSearchUrl -Method Get -Headers $headers
            
            if ($newsFolderResponse.files -and $newsFolderResponse.files.Count -gt 0) {
                $targetFolderId = $newsFolderResponse.files[0].id
                Write-Host "Da tim thay thu muc 'Tin tuc bat dong san toan quoc' voi ID: $targetFolderId" -ForegroundColor Green
            } else {
                # Create the subfolder 'Tin tức bất động sản toàn quốc' under 'Antigravity AI lam viec'
                Write-Host "Chua co thu muc 'Tin tuc bat dong san toan quoc'. Dang tao moi..." -ForegroundColor Cyan
                $createNewsFolderBody = @{
                    name = "Tin tức bất động sản toàn quốc"
                    mimeType = "application/vnd.google-apps.folder"
                    parents = @($targetFolderId)
                } | ConvertTo-Json -Depth 10
                
                $createNewsFolderResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $createNewsFolderBody
                $targetFolderId = $createNewsFolderResponse.id
                Write-Host "Da tao thu muc 'Tin tức bất động sản toàn quốc' voi ID: $targetFolderId" -ForegroundColor Green
            }
        }
    } else {
        Write-Warning "Khong tim thay thu muc 'OANH' tren Google Drive. File se duoc tao o thu muc goc (Root)."
    }
} catch {
    Write-Warning "Gap loi khi tim/tao thu muc tren Google Drive: $_. File se duoc tao o thu muc goc (Root)."
}

# Helper to get unique title with suffix if file already exists
function Get-NextSpreadsheetTitle ($baseTitle, $folderId) {
    $searchUrl = "https://www.googleapis.com/drive/v3/files?q=name contains '$baseTitle' and '$folderId' in parents and trashed=false&fields=files(name)"
    try {
        $res = Invoke-GoogleApi -Uri $searchUrl -Method Get -Headers $headers
        if (-not $res.files -or $res.files.Count -eq 0) {
            return $baseTitle
        }
        
        $maxSuffix = 0
        foreach ($file in $res.files) {
            if ($file.name -match "$baseTitle - (\d+)") {
                $suffix = [int]$Matches[1]
                if ($suffix -gt $maxSuffix) {
                    $maxSuffix = $suffix
                }
            }
        }
        
        $nextSuffix = $maxSuffix + 1
        return "$baseTitle - $nextSuffix"
    } catch {
        return $baseTitle
    }
}

# Create Daily Google Spreadsheet inside the target folder (Force Vietnam Timezone UTC+7)
$vnTz = $null
try {
    $vnTz = [TimeZoneInfo]::FindSystemTimeZoneById("SE Asia Standard Time")
} catch {
    $vnTz = [TimeZoneInfo]::FindSystemTimeZoneById("Asia/Ho_Chi_Minh")
}
$vnTime = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $vnTz)
$timeStr = $vnTime.ToString('HH"h"mm')
$dateStr = $vnTime.ToString('dd/MM')
$baseTitle = "$timeStr - $dateStr - Tin tuc BDS Toan Quoc"
$spreadsheetTitle = Get-NextSpreadsheetTitle -baseTitle $baseTitle -folderId $targetFolderId

$createSpreadsheetBody = @{
    name = $spreadsheetTitle
    mimeType = "application/vnd.google-apps.spreadsheet"
}
if ($null -ne $targetFolderId) {
    $createSpreadsheetBody.Add("parents", @($targetFolderId))
}
$createSpreadsheetJson = $createSpreadsheetBody | ConvertTo-Json -Depth 10

try {
    Write-Host "Dang tao Google Spreadsheet: $spreadsheetTitle ..." -ForegroundColor Cyan
    $createResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $createSpreadsheetJson
    $spreadsheetId = $createResponse.id
    $spreadsheetUrl = "https://docs.google.com/spreadsheets/d/$spreadsheetId/edit"
    Write-Host "Da tao Spreadsheet thanh cong: $spreadsheetUrl" -ForegroundColor Green
    
    # Get default sheet ID and default sheet Title
    Write-Host "Dang doc thong tin sheet mac dinh..." -ForegroundColor Cyan
    $sheetMetadata = Invoke-GoogleApi -Uri "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId" -Method Get -Headers $headers
    $sheetId = $sheetMetadata.sheets[0].properties.sheetId
    $sheetTitle = $sheetMetadata.sheets[0].properties.title
    
    # Clear sheet before writing
    Write-Host "Dang xoa sach du lieu cu de tranh cot thua..." -ForegroundColor Cyan
    $clearUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/'$sheetTitle'!A1:Z100:clear"
    $clearResponse = Invoke-GoogleApi -Uri $clearUri -Method Post -Headers $headers

    # Write Data to the default sheet
    Write-Host "Dang ghi du lieu vao Google Sheet..." -ForegroundColor Cyan
    $rangeStr = "'$sheetTitle'!A1:F$($values.Count)"
    $updateBody = @{
        range = $rangeStr
        majorDimension = "ROWS"
        values = $values
    } | ConvertTo-Json -Depth 10
    
    $updateUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/$rangeStr`?valueInputOption=USER_ENTERED"
    $updateResponse = Invoke-GoogleApi -Uri $updateUri -Method Put -Headers $headers -Body $updateBody
    
    # Apply styling (Teal-700 header background, wrap text, Arial font)
    # and rename the sheet to "Bao cao Tin tuc"
    Write-Host "Dang dinh dang va doi ten Google Sheet..." -ForegroundColor Cyan
    $batchBody = @{
        requests = @(
            # Request 1: Rename the default sheet to "Bao cao Tin tuc"
            @{
                updateSheetProperties = @{
                    properties = @{
                        sheetId = $sheetId
                        title = "Bao cao Tin tuc"
                    }
                    fields = "title"
                }
            },
            # Request 2: Header row formatting (Teal-700 background, bold white text, size 11, font Arial)
            @{
                repeatCell = @{
                    range = @{
                        sheetId = $sheetId
                        startRowIndex = 0
                        endRowIndex = 1
                        startColumnIndex = 0
                        endColumnIndex = 6
                    }
                    cell = @{
                        userEnteredFormat = @{
                            backgroundColor = @{
                                red = 0.0588
                                green = 0.4627
                                blue = 0.4314
                            }
                            textFormat = @{
                                foregroundColor = @{
                                    red = 1.0
                                    green = 1.0
                                    blue = 1.0
                                }
                                bold = $true
                                fontSize = 11
                                fontFamily = "Arial"
                            }
                            horizontalAlignment = "CENTER"
                            verticalAlignment = "MIDDLE"
                        }
                    }
                    fields = "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            # Request 3: Cell alignment and text wrap (vertical top, wrap text, size 10, font Arial)
            @{
                repeatCell = @{
                    range = @{
                        sheetId = $sheetId
                        startRowIndex = 1
                        endRowIndex = $values.Count
                        startColumnIndex = 0
                        endColumnIndex = 6
                    }
                    cell = @{
                        userEnteredFormat = @{
                            verticalAlignment = "TOP"
                            wrapStrategy = "WRAP"
                            textFormat = @{
                                fontSize = 10
                                fontFamily = "Arial"
                            }
                        }
                    }
                    fields = "userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)"
                }
            },
            # Request 4: Set explicit column widths for description, script, and FB content columns (350px)
            @{
                updateDimensionProperties = @{
                    range = @{
                        sheetId = $sheetId
                        dimension = "COLUMNS"
                        startIndex = 4
                        endIndex = 7
                    }
                    properties = @{
                        pixelSize = 350
                    }
                    fields = "pixelSize"
                }
            },
            # Request 5: Auto resize columns 0 to 4
            @{
                autoResizeDimensions = @{
                    dimensions = @{
                        sheetId = $sheetId
                        dimension = "COLUMNS"
                        startIndex = 0
                        endIndex = 4
                    }
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    $batchUri = "https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate"
    $batchResponse = Invoke-GoogleApi -Uri $batchUri -Method Post -Headers $headers -Body $batchBody
    
    Write-Host "`n🎉 DA DAY BAO CAO LEN GOOGLE SHEETS THANH CONG!" -ForegroundColor Green
    Write-Host "Link Google Sheet:" -ForegroundColor Cyan
    Write-Host "👉 $spreadsheetUrl" -ForegroundColor Yellow
    
} catch {
    $errBody = ""
    if ($null -ne $_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
    }
    Write-Error "Loi khi thao tac voi Google Sheets API: $_. Chi tiet loi: $errBody"
}

# Export locally to CSV (using UTF-8 BOM so Excel opens it correctly)
Write-Host "Dang xuat file CSV cuc bo tai: $reportFileCsv ..." -ForegroundColor Cyan
try {
    $rows | Export-Csv -Path $reportFileCsv -NoTypeInformation -Encoding UTF8 -Force
} catch {
    Write-Warning "Khong the ghi vao file mac dinh do file dang mo. Dang luu thanh file moi..."
    $timestamp = Get-Date -Format "HHmmss"
    $reportFileCsv = Join-Path $reportsDir "national_real_estate_report_${today}_${timestamp}.csv"
    $rows | Export-Csv -Path $reportFileCsv -NoTypeInformation -Encoding UTF8 -Force
}

Write-Host "🎉 HOÀN THÀNH QUY TRÌNH TIN TỨC BẤT ĐỘNG SẢN TOÀN QUỐC!" -ForegroundColor Green
Write-Host "File CSV da duoc luu tai:" -ForegroundColor Cyan
Write-Host "👉 $reportFileCsv" -ForegroundColor Yellow






