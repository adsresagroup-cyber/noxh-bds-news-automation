# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Find .env file dynamically
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

if ($null -ne $antigravityIdePath) {
    $metaAdsApiDir = Join-Path $antigravityIdePath "meta ads api"
    if (-not (Test-Path $metaAdsApiDir)) {
        $metaAdsApiDir = Join-Path $antigravityIdePath "meta_ads_api"
    }
} else {
    $metaAdsApiDir = $scriptDir
}

$envPath = Join-Path $metaAdsApiDir ".env"
$tokenPath = Join-Path $metaAdsApiDir "token.json"

if (-not (Test-Path $envPath)) {
    Write-Host "Loi: Khong tim thay file .env tai $envPath." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $tokenPath)) {
    Write-Host "Loi: Chua tim thay file token.json. Hay lien ket tai khoan truoc." -ForegroundColor Red
    exit 1
}

# Read META Configurations
$accessToken = ""
$apiVersion = "v20.0"
$metaPagesConfig = ""

Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        if ($line -match "^META_ACCESS_TOKEN=(.*)$") { $accessToken = $Matches[1].Trim() }
        if ($line -match "^META_API_VERSION=(.*)$") { $apiVersion = $Matches[1].Trim() }
        if ($line -match "^META_PAGES=(.*)$") { $metaPagesConfig = $Matches[1].Trim() }
    }
}

if ([string]::IsNullOrEmpty($accessToken) -or [string]::IsNullOrEmpty($metaPagesConfig)) {
    Write-Host "Loi: Thieu META_ACCESS_TOKEN hoac META_PAGES trong file .env." -ForegroundColor Red
    exit 1
}

# Load Google Token details
$tokenData = Get-Content $tokenPath -Raw | ConvertFrom-Json
$googleAccessToken = $tokenData.token

# Helper to automatically refresh Google OAuth token if expired
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
        Write-Host "Loi: Khong the tu dong lam moi Token Google. Vui long chay lai script lien ket tai khoan." -ForegroundColor Red
        throw $_
    }
}

# Helper to invoke Google REST API
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
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errBody = $reader.ReadToEnd()
                Write-Host "Google API Error Response ($statusCode): $errBody" -ForegroundColor Red
            } catch {}
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

# 1. Parse pages config
$pages = @()
$metaPagesConfig -split "," | ForEach-Object {
    $parts = $_ -split ":"
    if ($parts.Count -eq 2) {
        $pages += [PSCustomObject]@{
            Id   = $parts[0].Trim()
            Name = $parts[1].Trim()
        }
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       DANG THU THAP BAO CAO CAC FANPAGE FACEBOOK" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Calculate weekly date range (Monday to Sunday of last week)
$today = Get-Date
$dayOfWeek = [int]$today.DayOfWeek
$daysToSunday = $dayOfWeek
if ($daysToSunday -eq 0) { $daysToSunday = 7 }
$lastSundayEnd = (Get-Date -Hour 0 -Minute 0 -Second 0).AddDays(-($daysToSunday - 1))
$lastMondayStart = $lastSundayEnd.AddDays(-7)

$sinceSec = [DateTimeOffset]::new($lastMondayStart).ToUnixTimeSeconds()
$untilSec = [DateTimeOffset]::new($lastSundayEnd).ToUnixTimeSeconds()

$mondayStr = $lastMondayStart.ToString("dd-MM")
$sundayStr = $lastSundayEnd.AddDays(-1).ToString("dd-MM")

# Helper function to safely query individual metrics over a range
function Get-PageMetric {
    param(
        [string]$targetPageId,
        [string]$pToken,
        [string]$metricName,
        [string]$pPeriod = "day",
        [string]$since = "",
        [string]$until = "",
        [string]$aggregate = "sum"
    )
    if ([string]::IsNullOrEmpty($pToken)) {
        return 0
    }
    try {
        $url = "https://graph.facebook.com/$apiVersion/$targetPageId/insights"
        $params = @{
            metric       = $metricName
            period       = $pPeriod
            access_token = $pToken
        }
        if (-not [string]::IsNullOrEmpty($since)) { $params.Add("since", $since) }
        if (-not [string]::IsNullOrEmpty($until)) { $params.Add("until", $until) }
        
        $query = $url + "?" + (($params.Keys | ForEach-Object { "$_=$([Uri]::EscapeDataString($params[$_]))" }) -join [char]38)
        $response = Invoke-RestMethod -Uri $query -Method Get
        if ($response.data -and $response.data.Count -gt 0) {
            $values = $response.data[0].values
            if ($values -and $values.Count -gt 0) {
                if ($aggregate -eq "last") {
                    return $values[-1].value
                }
                elseif ($aggregate -eq "feedback_comment") {
                    $sum = 0
                    foreach ($v in $values) {
                        if ($null -ne $v.value -and $null -ne $v.value.comment) {
                            $sum += $v.value.comment
                        }
                    }
                    return $sum
                }
                else {
                    $sum = 0
                    foreach ($v in $values) {
                        if ($null -ne $v.value) {
                            $sum += [int]$v.value
                        }
                    }
                    return $sum
                }
            }
        }
    } catch {
        # Quiet fail on individual metric error to keep execution robust
    }
    return 0
}

$values = @()
# Header row
$headersRow = @(
    "STT", 
    "Ten Trang", 
    "Page ID", 
    "Luot thich (Likes)", 
    "Luot theo doi (Followers)", 
    "Luot xem Trang (Tuan qua)", 
    "Tuong tac (Tuan qua)", 
    "Tong binh luan", 
    "Tin nhan moi", 
    "Luot theo doi moi", 
    "Xem video tu Ads", 
    "Xem video Tu nhien"
)
$values += ,$headersRow

$idx = 1
foreach ($page in $pages) {
    $pageId = $page.Id
    $pageName = $page.Name
    
    Write-Host "Dang lay so lieu cho trang: $pageName ($pageId)..." -ForegroundColor Yellow
    
    $fanCount = 0
    $followerCount = 0
    $pageViews = 0
    $engagement = 0
    $comments = 0
    $newMessages = 0
    $newFollowers = 0
    $videoViewsPaid = 0
    $videoViewsOrganic = 0
    $realName = $pageName
    $pageAccessToken = $accessToken
    
    try {
        # Get basic info and page-specific access_token
        $pInfoUrl = "https://graph.facebook.com/$apiVersion/$pageId"
        $pInfoParams = @{
            fields       = "name,fan_count,followers_count,access_token"
            access_token = $accessToken
        }
        $pInfoQuery = $pInfoUrl + "?" + (($pInfoParams.Keys | ForEach-Object { "$_=$([Uri]::EscapeDataString($pInfoParams[$_]))" }) -join [char]38)
        
        $pageNode = Invoke-RestMethod -Uri $pInfoQuery -Method Get
        $realName = $pageNode.name
        $fanCount = if ($null -ne $pageNode.fan_count) { $pageNode.fan_count } else { 0 }
        $followerCount = if ($null -ne $pageNode.followers_count) { $pageNode.followers_count } else { 0 }
        if ($null -ne $pageNode.access_token) {
            $pageAccessToken = $pageNode.access_token
        }
    } catch {
        Write-Warning "Khong lay duoc thong tin co ban cho trang $pageId"
    }
    
    # Query metrics individually using helper function
    $valViews = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_views_total" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valViews) { $pageViews = $valViews }
    
    $valEng = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_post_engagements" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valEng) { $engagement = $valEng }
    
    $valFeedback = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_positive_feedback_by_type" -since $sinceSec -until $untilSec -aggregate "feedback_comment"
    if ($null -ne $valFeedback) { $comments = $valFeedback }
    
    $valMsg = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_messages_new_conversations_unique" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valMsg) { $newMessages = $valMsg }
    
    $valFollows = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_daily_follows" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valFollows) { $newFollowers = $valFollows }
    
    $valVideoPaid = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_video_views_paid" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valVideoPaid) { $videoViewsPaid = $valVideoPaid }
    
    $valVideoOrg = Get-PageMetric -targetPageId $pageId -pToken $pageAccessToken -metricName "page_video_views_organic" -since $sinceSec -until $untilSec -aggregate "sum"
    if ($null -ne $valVideoOrg) { $videoViewsOrganic = $valVideoOrg }
    
    $row = @(
        $idx,
        $realName,
        $pageId,
        $fanCount,
        $followerCount,
        $pageViews,
        $engagement,
        $comments,
        $newMessages,
        $newFollowers,
        $videoViewsPaid,
        $videoViewsOrganic
    )
    $values += ,$row
    $idx++
}

# 2. Push report to Google Sheets
Write-Host "`nDang chuan bi gui bao cao len Google Drive..." -ForegroundColor Cyan

$googleHeaders = @{
    "Authorization" = "Bearer $googleAccessToken"
}

$targetFolderId = $null

try {
    # Search for 'OANH' folder
    $oanhSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false&fields=files(id,name)"
    $searchResponse = Invoke-GoogleApi -Uri $oanhSearchUrl -Method Get -Headers $googleHeaders
    
    if ($searchResponse.files -and $searchResponse.files.Count -gt 0) {
        $oanhFolderId = $searchResponse.files[0].id
        
        # Search for 'Antigravity AI lam viec' inside 'OANH'
        $subFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='Antigravity AI lam viec' and '$oanhFolderId' in parents and trashed=false&fields=files(id,name)"
        $subFolderResponse = Invoke-GoogleApi -Uri $subFolderSearchUrl -Method Get -Headers $googleHeaders
        
        if ($subFolderResponse.files -and $subFolderResponse.files.Count -gt 0) {
            $targetFolderId = $subFolderResponse.files[0].id
        } else {
            # Create subfolder
            $createFolderBody = @{
                name = "Antigravity AI lam viec"
                mimeType = "application/vnd.google-apps.folder"
                parents = @($oanhFolderId)
            } | ConvertTo-Json -Depth 10
            $createFolderResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $googleHeaders -Body $createFolderBody
            $targetFolderId = $createFolderResponse.id
        }
        
        # Search or create 'Bao cao Fanpage' folder inside 'Antigravity AI lam viec'
        if ($null -ne $targetFolderId) {
            $reportFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='Bao cao Fanpage' or name='Bao cao Fanpage') and '$targetFolderId' in parents and trashed=false&fields=files(id,name)"
            $reportFolderResponse = Invoke-GoogleApi -Uri $reportFolderSearchUrl -Method Get -Headers $googleHeaders
            
            if ($reportFolderResponse.files -and $reportFolderResponse.files.Count -gt 0) {
                $targetFolderId = $reportFolderResponse.files[0].id
            } else {
                # Create 'BÃƒÂ¡o cÃƒÂ¡o Fanpage' folder
                $createReportFolderBody = @{
                    name = "Bao cao Fanpage"
                    mimeType = "application/vnd.google-apps.folder"
                    parents = @($targetFolderId)
                } | ConvertTo-Json -Depth 10
                $createReportFolderResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $googleHeaders -Body $createReportFolderBody
                $targetFolderId = $createReportFolderResponse.id
            }
        }
    }
} catch {
    Write-Warning "Khong tim thay/tao duoc thu muc bao cao tren Google Drive. Tep se duoc luu o Thu muc goc."
}

# 3. Create Spreadsheet Title in weekly format
$spreadsheetTitle = "Bao cao Fanpage Tuan (Tu $mondayStr den $sundayStr)"

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
    $createResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $googleHeaders -Body $createSpreadsheetJson
    $spreadsheetId = $createResponse.id
    $spreadsheetUrl = "https://docs.google.com/spreadsheets/d/$spreadsheetId/edit"
    
    # Get sheet metadata
    $sheetMetadata = Invoke-GoogleApi -Uri "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId" -Method Get -Headers $googleHeaders
    $sheetId = $sheetMetadata.sheets[0].properties.sheetId
    $sheetTitle = $sheetMetadata.sheets[0].properties.title
    
    # Clear default data
    $clearUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/'$sheetTitle'!A1:Z100:clear"
    $null = Invoke-GoogleApi -Uri $clearUri -Method Post -Headers $googleHeaders
    
    # Write Data
    $rangeStr = "'$sheetTitle'!A1:L$($values.Count)"
    $updateBody = @{
        range = $rangeStr
        majorDimension = "ROWS"
        values = $values
    } | ConvertTo-Json -Depth 10
    
    $updateUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/$rangeStr`?valueInputOption=USER_ENTERED"
    $null = Invoke-GoogleApi -Uri $updateUri -Method Put -Headers $googleHeaders -Body $updateBody
    
    # 4. Apply Styling (Navy Blue header, clean table formatting)
    Write-Host "Dang dinh dang trang tinh..." -ForegroundColor Cyan
    $batchBody = @{
        requests = @(
            # Rename sheet
            @{
                updateSheetProperties = @{
                    properties = @{
                        sheetId = $sheetId
                        title = "Bao cao Fanpage"
                    }
                    fields = "title"
                }
            },
            # Header Row Styling (Navy Blue background, white bold text)
            @{
                repeatCell = @{
                    range = @{
                        sheetId = $sheetId
                        startRowIndex = 0
                        endRowIndex = 1
                        startColumnIndex = 0
                        endColumnIndex = 12
                    }
                    cell = @{
                        userEnteredFormat = @{
                            backgroundColor = @{
                                red = 0.1176
                                green = 0.2235
                                blue = 0.4157
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
            # Data cell alignment
            @{
                repeatCell = @{
                    range = @{
                        sheetId = $sheetId
                        startRowIndex = 1
                        endRowIndex = $values.Count
                        startColumnIndex = 0
                        endColumnIndex = 12
                    }
                    cell = @{
                        userEnteredFormat = @{
                            verticalAlignment = "MIDDLE"
                            textFormat = @{
                                fontSize = 10
                                fontFamily = "Arial"
                            }
                        }
                    }
                    fields = "userEnteredFormat(verticalAlignment,textFormat)"
                }
            },
            # Alignment for numbers (columns 3 to 11 center aligned)
            @{
                repeatCell = @{
                    range = @{
                        sheetId = $sheetId
                        startRowIndex = 1
                        endRowIndex = $values.Count
                        startColumnIndex = 3
                        endColumnIndex = 12
                    }
                    cell = @{
                        userEnteredFormat = @{
                            horizontalAlignment = "CENTER"
                        }
                    }
                    fields = "userEnteredFormat(horizontalAlignment)"
                }
            },
            # Auto-resize columns
            @{
                autoResizeDimensions = @{
                    dimensions = @{
                        sheetId = $sheetId
                        dimension = "COLUMNS"
                        startIndex = 0
                        endIndex = 12
                    }
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    $batchUri = "https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate"
    $null = Invoke-GoogleApi -Uri $batchUri -Method Post -Headers $googleHeaders -Body $batchBody
    
    Write-Host "`n[THANH CONG] DA DAY BAO CAO FANPAGE LEN GOOGLE SHEETS!" -ForegroundColor Green
    Write-Host "Link Google Sheet:" -ForegroundColor Cyan
    Write-Host "[LINK] $spreadsheetUrl" -ForegroundColor Yellow
} catch {
    Write-Error "Loi khi tuong tac voi Google Sheets API: $_"
}
