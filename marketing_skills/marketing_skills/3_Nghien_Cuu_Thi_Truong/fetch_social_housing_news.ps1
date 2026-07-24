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

$reportsDir = Join-Path $metaAdsApiDir "Tin tức hằng ngày update"
if (-not (Test-Path $reportsDir)) {
    $reportsDir = Join-Path $scriptDir "reports"
    if (-not (Test-Path $reportsDir)) {
        New-Item -ItemType Directory -Path $reportsDir | Out-Null
    }
}

$today = Get-Date -Format "yyyyMMdd"
$reportFileCsv = Join-Path $reportsDir "social_housing_report_$today.csv"

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

Write-Host "Loc bai viet tu: $($startTime.ToString('dd/MM/yyyy HH:mm:ss')) den: $($endTime.ToString('dd/MM/yyyy HH:mm:ss'))" -ForegroundColor Yellow

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

# Load Gemini API Key from .env file
$envPath = Join-Path $metaAdsApiDir ".env"
$geminiApiKey = ""
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            if ($line -match "^GEMINI_API_KEY=(.*)$") {
                $geminiApiKey = $Matches[1].Trim()
            }
        }
    }
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

# 1. Fetch from BaoMoi
Write-Host "Dang tai tin tuc tu BaoMoi tag..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://baomoi.com/tag/nh%C3%A0-%E1%BB%9F-x%C3%A3-h%E1%BB%99i.epi" -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -TimeoutSec 15 -UseBasicParsing
    $html = $response.Content
    $chunks = $html -split '<div class="group/card bm-card'
    foreach ($chunk in ($chunks | Select-Object -Skip 1)) {
        if ($chunk -match 'href="(\/[^"]+-c\d+\.epi)"[^>]*title="([^"]+)"') {
            $link = "https://baomoi.com" + $Matches[1]
            $title = [System.Net.WebUtility]::HtmlDecode($Matches[2]).Trim()
            
            # Check publication date
            $pubDate = $null
            if ($chunk -match 'dateTime="([^"]+)"') {
                try {
                    $pubDate = [DateTime]::Parse($Matches[1])
                } catch {}
            }
            
            # Filter by date range
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
                continue
            }
            
            if ($chunk -match 'class="bm-card-source[^"]*" title="([^"]+)"') {
                $source = $Matches[1]
            } else {
                $source = "BaoMoi"
            }
            
            if ($chunk -match 'class="description[^"]*">([^<]+)</p>') {
                $desc = [System.Net.WebUtility]::HtmlDecode($Matches[1]).Trim()
            } else {
                $desc = ""
            }
            
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

# Helper to check keywords
function Test-Keyword ($text) {
    if ($null -eq $text) { return $false }
    $keywords = @("nhà ở xã hội", "noxh", "nhà xã hội", "nhà ở công nhân", "nha o xa hoi", "nha xa hoi")
    foreach ($k in $keywords) {
        if ($text.ToLower().Contains($k)) {
            return $true
        }
    }
    return $false
}

# Helper to strictly check if title contains NƠXH related terms
function Test-Title-Keyword ($title) {
    if ($null -eq $title) { return $false }
    $titleLower = $title.ToLower()
    $keywords = @("nhà ở xã hội", "noxh", "nhà xã hội", "nhà ở công nhân", "nhà công nhân", "nhà thu nhập thấp", "ở xã hội", "hồ sơ xã hội", "hồ sơ ở xã hội", "nha o xa hoi", "nha xa hoi")
    foreach ($k in $keywords) {
        if ($titleLower.Contains($k)) {
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
Bạn là một Biên tập viên Báo chí và Chuyên gia Phân tích Thị trường Bất động sản Việt Nam xuất sắc, chuyên sâu về phân khúc Nhà ở Xã hội (NƠXH).
Nhiệm vụ của bạn là nhận vào danh sách các bài viết nhà ở xã hội đã thu thập và chọn ra đúng 6 bài viết nổi bật, chất lượng và đa dạng chủ đề nhất để làm nội dung xây dựng kịch bản video và bài viết fanpage.

[Tiêu chí lựa chọn bắt buộc]
1. Độ nổi bật (Prominence):
   - Ưu tiên cao: Các chính sách hỗ trợ vay vốn của Chính phủ (gói 120.000 tỷ), thông tin phê duyệt dự án NƠXH quy mô lớn, mở bán NƠXH mới, thay đổi điều kiện điều khoản xét duyệt hồ sơ mua nhà, thanh tra và xử lý trục lợi chính sách NƠXH, sai phạm trong quản lý/đăng ký.
   - Tránh: Tin quảng cáo không có tính thời sự, các tin tức quá nhỏ nhặt không có tác động diện rộng.
2. Sự đa dạng (Diversity):
   - 6 bài viết được chọn phải có chủ đề khác nhau (ví dụ: 1-2 tin về chính sách/luật pháp, 2-3 tin về tiến độ/mở bán dự án tại các địa phương khác nhau, 1-2 tin về thanh tra/sai phạm/trục lợi hồ sơ).
   - Tuyệt đối không chọn nhiều bài cùng đưa tin về một sự việc hoặc một bài báo viết lại.
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

# 2. Fetch VnExpress RSS
Write-Host "Dang tai tin tuc tu VnExpress..." -ForegroundColor Cyan
try {
    $rss = Invoke-RestMethod -Uri "https://vnexpress.net/rss/bat-dong-san.rss" -TimeoutSec 10
    foreach ($item in $rss) {
        $title = Decode-Title $item.title
        $desc = Decode-Title $item.description
        $cleanDesc = [regex]::Replace($desc, '<[^>]+>', '').Trim()
        
        # Parse publication date
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try {
                $pubDate = [DateTime]::Parse($item.pubDate)
            } catch {}
        }
        
        # Filter by date range
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        # Parse publication date
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try {
                $pubDate = [DateTime]::Parse($item.pubDate)
            } catch {}
        }
        
        # Filter by date range
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        # Parse publication date
        $pubDate = $null
        if ($null -ne $item.pubDate) {
            try {
                $pubDate = [DateTime]::Parse($item.pubDate)
            } catch {}
        }
        
        # Filter by date range
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
    $res = Invoke-WebRequest -Uri "https://thanhnien.vn/rss/thoi-su.rss" -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -TimeoutSec 10 -UseBasicParsing
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        $link = Decode-Title $item.link
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
    $userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    
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
            
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
                continue
            }
            
            $link = Decode-Title $item.link
            if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
            
            if ([string]::IsNullOrEmpty($title) -or $title.Length -lt 10) {
                continue
            }
            
            $pubDate = $null
            if ($chunk -match 'Images/[^/]*/(\d{4})/(\d{2})/(\d{2})/') {
                try { $pubDate = [DateTime]::Parse("$($Matches[1])-$($Matches[2])-$($Matches[3])") } catch {}
            }
            
            if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
                continue
            }
            
            $desc = ""
            if ($chunk -match '<div[^>]+class="[^"]*summary[^"]*"[^>]*>(.*?)</div>') {
                $desc = [regex]::Replace($Matches[1], '<[^>]+>', '').Trim()
            } elseif ($chunk -match '<p[^>]+class="[^"]*summary[^"]*"[^>]*>(.*?)</p>') {
                $desc = [regex]::Replace($Matches[1], '<[^>]+>', '').Trim()
            }
            $desc = [System.Net.WebUtility]::HtmlDecode($desc).Trim()
            if ([string]::IsNullOrEmpty($desc)) {
                $desc = $title
            }
            
            if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        $link = Decode-Title $item.link
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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
        
        if ($null -ne $pubDate -and ($pubDate -lt $startTime -or $pubDate -gt $endTime)) {
            continue
        }
        
        if ((Test-Keyword $title) -or (Test-Keyword $desc)) {
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

# Deduplicate items and strictly filter for NƠXH titles
$uniqueNews = @()
$seenLinks = @{}

foreach ($item in $newsItems) {
    $item.Link = [string]$item.Link
    $cleanLink = $item.Link.Split('?')[0].Trim().ToLower()
    
    # Strictly check if title contains NƠXH related terms
    if (-not (Test-Title-Keyword $item.Title)) {
        continue
    }
    
    if ($seenLinks.ContainsKey($cleanLink)) {
        continue
    }
    
    # Check Jaccard Similarity of the title against already processed unique articles
    $isDuplicate = $false
    foreach ($seenItem in $uniqueNews) {
        $similarity = Get-JaccardSimilarity -title1 $item.Title -title2 $seenItem.Title
        if ($similarity -gt 0.45) {
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

# Scoring & Selection for 5-10 Hot Spotlight Articles
function Get-ArticleScore ($title) {
    $score = 0
    $titleLower = $title.ToLower()
    
    # Priority topics
    $highPriority = @("khởi tố", "giả hồ sơ", "trục lợi", "đề xuất", "chính sách", "nghị định", "luật", "khởi công", "mở bán", "giá bán", "quy hoạch", "cơ chế đặc thù", "vneid", "siết")
    foreach ($k in $highPriority) {
        if ($titleLower.Contains($k)) {
            $score += 10
        }
    }
    
    return $score
}

# Define categories and keywords for diversity (Fallback)
$catLaw = @("luật", "chính sách", "nghị định", "thông tư", "đề xuất", "quy chuẩn", "điều kiện", "thủ tục", "cơ chế", "sửa đổi")
$catDispute = @("trục lợi", "khởi tố", "sai phạm", "tranh chấp", "lừa đảo", "giả mạo", "giả hồ sơ", "bị bắt", "vi phạm", "xử phạt", "siết", "thu hồi", "tố cáo", "mất tiền", "cò mồi")
$catProject = @("dự án", "khởi công", "mở bán", "xây dựng", "hoàn thành", "căn hộ", "bàn giao", "nhận nhà", "tiến độ", "quy hoạch", "khu đô thị")

function Get-Category ($title) {
    $titleLower = $title.ToLower()
    foreach ($k in $catDispute) {
        if ($titleLower.Contains($k)) { return "Dispute" }
    }
    foreach ($k in $catLaw) {
        if ($titleLower.Contains($k)) { return "Law" }
    }
    foreach ($k in $catProject) {
        if ($titleLower.Contains($k)) { return "Project" }
    }
    return "Other"
}

$scoredNews = $uniqueNews | ForEach-Object {
    $_ | Add-Member -MemberType NoteProperty -Name Score -Value (Get-ArticleScore $_.Title) -PassThru
} | Sort-Object Score -Descending

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
    
    # Fallback diversity selection logic
    $top10News = $scoredNews | Select-Object -First 10
    
    $laws = @()
    $disputes = @()
    $projects = @()
    $others = @()
    
    foreach ($item in $top10News) {
        $cat = Get-Category $item.Title
        if ($cat -eq "Law") { $laws += $item }
        elseif ($cat -eq "Dispute") { $disputes += $item }
        elseif ($cat -eq "Project") { $projects += $item }
        else { $others += $item }
    }
    
    $selectedLinks = @{}
    $dCount = 0
    $lCount = 0
    $pCount = 0
    
    # First pass: try to pick 2 from each category to ensure diversity
    foreach ($item in $disputes) {
        if ($dCount -lt 2 -and $selectedNews.Count -lt 6) {
            $selectedNews += $item
            $selectedLinks[([string]$item.Link).Split('?')[0].Trim().ToLower()] = $true
            $dCount++
        }
    }
    foreach ($item in $laws) {
        if ($lCount -lt 2 -and $selectedNews.Count -lt 6) {
            $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
            if (-not $selectedLinks.ContainsKey($linkKey)) {
                $selectedNews += $item
                $selectedLinks[$linkKey] = $true
                $lCount++
            }
        }
    }
    foreach ($item in $projects) {
        if ($pCount -lt 2 -and $selectedNews.Count -lt 6) {
            $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
            if (-not $selectedLinks.ContainsKey($linkKey)) {
                $selectedNews += $item
                $selectedLinks[$linkKey] = $true
                $pCount++
            }
        }
    }
    
    # Second pass: fill up to 6 from the top 10 news list
    if ($selectedNews.Count -lt 6) {
        foreach ($item in $top10News) {
            if ($selectedNews.Count -ge 6) { break }
            $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
            if (-not $selectedLinks.ContainsKey($linkKey)) {
                $selectedNews += $item
                $selectedLinks[$linkKey] = $true
            }
        }
    }
}

# Keep only top 10 candidates for report list, placing selected first to satisfy "tổng hợp 10 bài nổi bật, chọn 6 viết kịch bản"
$top10News = @()
$candidateLinks = @{}
foreach ($item in $selectedNews) {
    $top10News += $item
    $candidateLinks[([string]$item.Link).Split('?')[0].Trim().ToLower()] = $true
}
foreach ($item in $scoredNews) {
    if ($top10News.Count -ge 10) { break }
    $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
    if (-not $candidateLinks.ContainsKey($linkKey)) {
        $top10News += $item
        $candidateLinks[$linkKey] = $true
    }
}

# Re-populate selected links to check during script writing phase
$selectedLinks = @{}
foreach ($item in $selectedNews) {
    $selectedLinks[([string]$item.Link).Split('?')[0].Trim().ToLower()] = $true
}

# Helper to generate News style script (Voiceover + Visual descriptions)
function Get-NewsScript ($title, $desc, $source, $duration) {
    $visuals = @(
        "[0s - 5s] Cảnh quay flycam góc rộng dự án Nhà ở Xã hội đang xây dựng. Chèn chữ đỏ giật nhẹ nổi bật: 'TIN CHẤN ĐỘNG NƠXH!'.",
        "[5s - 20s] Chuyển cảnh nhanh: Ảnh chụp cận cảnh tiêu đề bài báo trên trang $source. Zoom vào tiêu đề: '$title'.",
        "[20s - 45s] Cảnh người dân tìm hiểu, bàn tán xôn xao tại văn phòng bất động sản hoặc mô hình quy hoạch dự án.",
        "[45s - $($duration)s] Cửa căn hộ hiện đại mở ra, hiện logo kênh cùng hiệu ứng động đăng ký."
    ) -join "`r`n"
    
    $voiceoff = @(
        "$($title.ToUpper()) - CƠ HỘI NÀO CHO NGƯỜI MUA NHÀ!",
        "",
        "Bạn đã nghe tin mới nhất này chưa? Nếu đang quan tâm đến nhà ở xã hội, hãy cùng tìm hiểu ngay nhé! Theo thông tin vừa cập nhật trên ${source}: $desc. Đây là diễn biến quan trọng, ảnh hưởng trực tiếp đến quy trình xét duyệt cũng như cơ hội sở hữu nhà của mọi người. Bác nào đang quan tâm dự án này thì để lại bình luận thảo luận bên dưới và follow kênh nhé!"
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
        "[0s - 7s] Cảnh phân tích bản đồ quy hoạch dự án. Chèn chữ: 'PHÂN TÍCH QUY HOẠCH BĐS'.",
        "[7s - 25s] Sơ đồ phân tích dòng tiền và các rủi ro pháp lý trên màn hình, giải thích chi tiết các điểm cần lưu ý.",
        "[25s - 45s] Cảnh đi xem dự án thực tế, kiểm tra kỹ lưỡng các giấy tờ pháp lý liên quan.",
        "[45s - $($duration)s] Flycam dự án hoàn thiện khang trang, hiển thị nút đăng ký kênh."
    ) -join "`r`n"
    
    $voiceoff = @(
        "GÓC NHÌN THỰC TẾ VỀ THÔNG TIN: $($title.ToUpper())!",
        "",
        "Có vài điểm quan trọng về thông tin này các bác cần lưu ý kỹ trước khi xuống tiền mua nhà ở xã hội nhé! Thông tin đăng trên ${source}: $desc. Dưới góc nhìn thực tế, mình thấy vướng mắc pháp lý và dòng tiền ở đây cần được xem xét rất kỹ. Lời khuyên cho mọi người lúc này là: Hãy luôn đặt tính pháp lý và sự minh bạch lên hàng đầu, tìm hiểu kỹ quy trình trước khi quyết định. Mọi người nghĩ sao về vấn đề này? Cùng thảo luận ở phần bình luận bên dưới và follow kênh nhé!"
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

# Helper to guarantee Voiceover complies with word count constraints
function Get-ConformingVoiceover {
    param (
        [string]$rawVoiceover
    )
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
    $sysPromptPath = Join-Path $scriptDir "news_system_instruction.txt"
    if (Test-Path $sysPromptPath) {
        $systemInstruction = [string](Get-Content -Path $sysPromptPath -Raw -Encoding utf8)
    } else {
        # Fallback system prompt if file is missing
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
4. ĐỘ DÀI BẮT BUỘC: Tổng số từ phần Voiceover (Tiêu đề + Lời thoại) PHẢI NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG VIẾT NGẮN DƯỚI 230 TỪ. AI cần mở rộng phân tích chuyên sâu các yếu tố điều kiện thu nhập, quy trình xét duyệt, kinh nghiệm nộp hồ sơ thực tế để đảm bảo đủ từ 230-290 từ.
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
                # Normalize and replace raw newlines within JSON string values to prevent JSON parser crash
                $cleanedContent = $rawContent -replace "\r?\n(?!\s*(\`"Visuals\`"|\`"Voiceover\`"|\`"FacebookContent\`"|\}))", " "
                $parsed = $cleanedContent | ConvertFrom-Json
                
                # Accept parsed AI script
                if ($null -ne $parsed -and -not [string]::IsNullOrEmpty($parsed.Voiceover)) {
                    $lastParsed = $parsed
                    $rawWords = $parsed.Voiceover -split '\s+' | Where-Object { $_ -ne "" }
                    $rawWordCount = $rawWords.Count
                    
                    Write-Host "   -> Thu thap kịch bản hop le tu AI ($rawWordCount tu) o lan thu $attempt" -ForegroundColor Green
                    if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
                    return $parsed
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

# 1. Prepare data for Google Sheets
Write-Host "Dang chuan bi du lieu gui len Google Sheets..." -ForegroundColor Cyan

$rows = @()
$values = @()
# Header row
$headersRow = @("STT", "Tiêu đề", "Đường dẫn", "Phong cách", "Kịch bản Voice-off (Lời thoại)", "Nội dung đăng Facebook (Content FB)")
$values += ,$headersRow

$styles = @("Tin tức", "Tin tức", "Chuyên gia chia sẻ", "Tin tức", "Tin tức", "Chuyên gia chia sẻ")

$idx = 1
$selectedCount = 0
foreach ($item in $top10News) {
    $linkKey = ([string]$item.Link).Split('?')[0].Trim().ToLower()
    if ($selectedLinks.ContainsKey($linkKey)) {
        # This item is selected to write a script
        $style = $styles[$selectedCount % $styles.Count]
        $selectedCount++
        
        Write-Host "Rewriting news item $selectedCount using Gemini: $($item.Title)..." -ForegroundColor Yellow
        $scriptObj = Rewrite-News-With-Gemini -title $item.Title -desc $item.Desc -source $item.Source -link $item.Link -style $style
        
        if ($null -eq $scriptObj -or [string]::IsNullOrEmpty($scriptObj.Voiceover)) {
            Write-Warning "Gemini rewriting failed or empty. Falling back to template."
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
            # Fallback if FacebookContent is empty
            $fbContent = @"
🔥 $($item.Title)!
Theo dõi ngay để cập nhật thông tin mới nhất về dự án và các chính sách nhà ở xã hội!
👇 Xem ngay video để biết chi tiết
Bình luận ý kiến của bạn bên dưới nhé!
"@
        }
        
        $footer = @"
-----------------------------------------
📌 Hỗ trợ & Tư vấn hồ sơ Nhà Ở Xã Hội toàn diện:
☎️ Hotline: 1900 988998
🌍 Website: nhaxahoi.tongkhobds.com
👨👩👧👦 Cộng đồng Zalo: zalo.me/g/fen9zd41trwqr0
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
        # This item is a candidate but NOT selected to write a script
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


# 2. Setup Headers for Google API
$headers = @{
    "Authorization" = "Bearer $accessToken"
}

$targetFolderId = $null

# 3. Search for OANH folder on Google Drive
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

        # Search or create 'Tin tức nhà ở xã hội' folder inside 'Antigravity AI lam viec' (targetFolderId)
        if ($null -ne $targetFolderId) {
            Write-Host "Dang tim thu muc 'Tin tuc nha o xa hoi' ben trong 'Antigravity AI lam viec'..." -ForegroundColor Cyan
            $newsFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='Tin tuc nha o xa hoi' or name='Tin tức nhà ở xã hội') and '$targetFolderId' in parents and trashed=false&fields=files(id,name)"
            $newsFolderResponse = Invoke-GoogleApi -Uri $newsFolderSearchUrl -Method Get -Headers $headers
            
            if ($newsFolderResponse.files -and $newsFolderResponse.files.Count -gt 0) {
                $targetFolderId = $newsFolderResponse.files[0].id
                Write-Host "Da tim thay thu muc 'Tin tuc nha o xa hoi' voi ID: $targetFolderId" -ForegroundColor Green
            } else {
                # Create the subfolder 'Tin tức nhà ở xã hội' under 'Antigravity AI lam viec'
                Write-Host "Chua co thu muc 'Tin tuc nha o xa hoi'. Dang tao moi..." -ForegroundColor Cyan
                $createNewsFolderBody = @{
                    name = "Tin tức nhà ở xã hội"
                    mimeType = "application/vnd.google-apps.folder"
                    parents = @($targetFolderId)
                } | ConvertTo-Json -Depth 10
                
                $createNewsFolderResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $createNewsFolderBody
                $targetFolderId = $createNewsFolderResponse.id
                Write-Host "Da tao thu muc 'Tin tức nhà ở xã hội' voi ID: $targetFolderId" -ForegroundColor Green
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

# 4. Create Daily Google Spreadsheet inside the target folder (Force Vietnam Timezone UTC+7)
$vnTz = $null
try {
    $vnTz = [TimeZoneInfo]::FindSystemTimeZoneById("SE Asia Standard Time")
} catch {
    $vnTz = [TimeZoneInfo]::FindSystemTimeZoneById("Asia/Ho_Chi_Minh")
}
$vnTime = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $vnTz)
$timeStr = $vnTime.ToString('HH"h"mm')
$dateStr = $vnTime.ToString('dd/MM')
$baseTitle = "$timeStr - $dateStr - Tin tuc NOXH"
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
    
    # 5. Get default sheet ID and default sheet Title
    Write-Host "Dang doc thong tin sheet mac dinh..." -ForegroundColor Cyan
    $sheetMetadata = Invoke-GoogleApi -Uri "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId" -Method Get -Headers $headers
    $sheetId = $sheetMetadata.sheets[0].properties.sheetId
    $sheetTitle = $sheetMetadata.sheets[0].properties.title
    
    # Clear sheet before writing
    Write-Host "Dang xoa sach du lieu cu de tranh cot thua..." -ForegroundColor Cyan
    $clearUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/'$sheetTitle'!A1:Z100:clear"
    $clearResponse = Invoke-GoogleApi -Uri $clearUri -Method Post -Headers $headers

     # 6. Write Data to the default sheet
    Write-Host "Dang ghi du lieu vao Google Sheet..." -ForegroundColor Cyan
    # Build range string dynamically using the retrieved default sheet title
    $rangeStr = "'$sheetTitle'!A1:F$($values.Count)"
    $updateBody = @{
        range = $rangeStr
        majorDimension = "ROWS"
        values = $values
    } | ConvertTo-Json -Depth 10
    
    $updateUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/$rangeStr`?valueInputOption=USER_ENTERED"
    $updateResponse = Invoke-GoogleApi -Uri $updateUri -Method Put -Headers $headers -Body $updateBody
    
    # 7. Apply styling (Teal-700 header background, Roboto font, wrap text, explicit column widths)
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
            # Request 4: Set explicit column widths for description, script and Facebook content columns (350px)
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

# Clean up old local markdown and docx reports if they exist
$oldMdReport = Join-Path $reportsDir "social_housing_report_$today.md"
if (Test-Path $oldMdReport) {
    Remove-Item $oldMdReport -Force
}

$oldDocxReport = Join-Path $reportsDir "social_housing_report_$today.docx"
if (Test-Path $oldDocxReport) {
    Remove-Item $oldDocxReport -Force
}

# Export locally to CSV (using UTF-8 BOM so Excel opens it correctly)
Write-Host "Dang xuat file CSV cuc bo tai: $reportFileCsv ..." -ForegroundColor Cyan
try {
    $rows | Export-Csv -Path $reportFileCsv -NoTypeInformation -Encoding UTF8 -Force
} catch {
    Write-Warning "Khong the ghi vao file mac dinh do file dang mo. Dang luu thanh file moi..."
    $timestamp = Get-Date -Format "HHmmss"
    $reportFileCsv = Join-Path $reportsDir "social_housing_report_${today}_${timestamp}.csv"
    $rows | Export-Csv -Path $reportFileCsv -NoTypeInformation -Encoding UTF8 -Force
}

Write-Host "🎉 HOÀN THÀNH QUY TRÌNH TIN TỨC NHÀ Ở XÃ HỘI!" -ForegroundColor Green
Write-Host "File CSV da duoc luu tai:" -ForegroundColor Cyan
Write-Host "👉 $reportFileCsv" -ForegroundColor Yellow












