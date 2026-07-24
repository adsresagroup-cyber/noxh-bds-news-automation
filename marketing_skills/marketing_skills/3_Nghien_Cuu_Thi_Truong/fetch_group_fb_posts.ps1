# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "--- BAT DAU QUY TRINH CAO BAI VIET FACEBOOK GROUP ---" -ForegroundColor Green

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

if ($null -ne $antigravityIdePath) {
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

# Google OAuth Config & Token Setup
$tokenPath = Join-Path $metaAdsApiDir "token.json"

if (-not (Test-Path $tokenPath)) {
    Write-Host "[Loi] Chua tim thay file token.json tai $tokenPath." -ForegroundColor Red
    Write-Host "Goi y: Vui long chay kich ban lien ket tai khoan truoc bang lenh:" -ForegroundColor Yellow
    Write-Host "   cd '$metaAdsApiDir'" -ForegroundColor Yellow
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\linked_google_account.ps1" -ForegroundColor Yellow
    exit 1
}

$tokenData = Get-Content $tokenPath -Raw | ConvertFrom-Json
$accessToken = $tokenData.token

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
        Write-Host "[Loi] Khong the tu dong lam moi Token. Vui long chay lai script lien ket tai khoan." -ForegroundColor Red
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

# Sanitize Sheet Name (max 31 chars, remove invalid chars: \ / ? * : [ ])
function Sanitize-SheetName ($name) {
    if ([string]::IsNullOrEmpty($name)) { return "Group Facebook" }
    $sanitized = $name -replace '[\\\/\?\*\:\[\]]', ' '
    $sanitized = $sanitized.Trim()
    # Replace multiple spaces with single space
    $sanitized = $sanitized -replace '\s+', ' '
    if ($sanitized.Length -gt 31) {
        $sanitized = $sanitized.Substring(0, 31).Trim()
    }
    return $sanitized
}

# 1. Run Node.js Scraper
$tempJsonPath = Join-Path $scriptDir "fb_scraped_temp.json"
if (Test-Path $tempJsonPath) {
    Remove-Item $tempJsonPath -Force
}

Write-Host "Dang chay script cao bai viet Node.js (Puppeteer)..." -ForegroundColor Cyan
$scraperPath = Join-Path $scriptDir "scrape_fb_groups.js"
& node "$scraperPath" "$tempJsonPath"

if (-not (Test-Path $tempJsonPath)) {
    Write-Error "[Loi] Tien trinh cao bai viet that bai, khong tao duoc file ket qua JSON."
    exit 1
}

Write-Host "Doc ket qua cao bai viet tu file JSON..." -ForegroundColor Green
$scrapedData = Get-Content $tempJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Clean up temp file
Remove-Item $tempJsonPath -Force

# Setup Headers for Google Drive / Sheets APIs
$headers = @{
    "Authorization" = "Bearer $accessToken"
}

# 2. Find/Create folder structure on Google Drive: > Antigravity Ai làm việc > Remake bài GroupFB
$parentId = $null

# Helper to find/create folder under a parent
function Get-OrCreateFolder {
    param (
        [string]$FolderName,
        [string]$ParentFolderId
    )
    
    $query = "mimeType='application/vnd.google-apps.folder' and name='$FolderName' and trashed=false"
    if ($null -ne $ParentFolderId) {
        $query += " and '$ParentFolderId' in parents"
    }
    
    $url = "https://www.googleapis.com/drive/v3/files?q=$([Uri]::EscapeDataString($query))&fields=files(id,name)"
    $res = Invoke-GoogleApi -Uri $url -Method Get -Headers $headers
    
    if ($res.files -and $res.files.Count -gt 0) {
        return $res.files[0].id
    } else {
        Write-Host "Chua co thu muc '$FolderName'. Dang tao moi..." -ForegroundColor Yellow
        $body = @{
            name = $FolderName
            mimeType = "application/vnd.google-apps.folder"
        }
        if ($null -ne $ParentFolderId) {
            $body.Add("parents", @($ParentFolderId))
        }
        $bodyJson = $body | ConvertTo-Json -Depth 10
        $createRes = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $bodyJson
        return $createRes.id
    }
}

Write-Host "Dang thiet lap thu muc luu tru tren Google Drive..." -ForegroundColor Cyan
try {
    # Check if 'OANH' or 'Oanh' folder exists
    $oanhUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false&fields=files(id,name)"
    $oanhRes = Invoke-GoogleApi -Uri $oanhUrl -Method Get -Headers $headers
    if ($oanhRes.files -and $oanhRes.files.Count -gt 0) {
        $parentId = $oanhRes.files[0].id
        Write-Host "Da tim thay thu muc cha 'OANH' (ID: $parentId)" -ForegroundColor Green
    } else {
        Write-Host "Khong tim thay thu muc 'OANH'. Thu muc se duoc tao o thu muc goc." -ForegroundColor Gray
    }
    
    # Search or create 'Antigravity AI lam viec' folder
    $antigravityFolderId = $null
    if ($null -ne $parentId) {
        $subFolderSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='Antigravity AI lam viec' or name='Antigravity Ai làm việc') and '$parentId' in parents and trashed=false&fields=files(id,name)"
        $subFolderResponse = Invoke-GoogleApi -Uri $subFolderSearchUrl -Method Get -Headers $headers
        if ($subFolderResponse.files -and $subFolderResponse.files.Count -gt 0) {
            $antigravityFolderId = $subFolderResponse.files[0].id
            Write-Host "Da tim thay thu muc 'Antigravity AI lam viec' voi ID: $antigravityFolderId" -ForegroundColor Green
        }
    }
    if ($null -eq $antigravityFolderId) {
        $antigravityFolderId = Get-OrCreateFolder -FolderName "Antigravity AI lam viec" -ParentFolderId $parentId
    }

    # Search or create 'Remake bài GroupFB' folder
    $targetFolderId = $null
    if ($null -ne $antigravityFolderId) {
        $remakeSearchUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and (name='Remake bài GroupFB' or name='Remake bai GroupFB') and '$antigravityFolderId' in parents and trashed=false&fields=files(id,name)"
        $remakeResponse = Invoke-GoogleApi -Uri $remakeSearchUrl -Method Get -Headers $headers
        if ($remakeResponse.files -and $remakeResponse.files.Count -gt 0) {
            $targetFolderId = $remakeResponse.files[0].id
            Write-Host "Da tim thay thu muc 'Remake bài GroupFB' voi ID: $targetFolderId" -ForegroundColor Green
        }
    }
    if ($null -eq $targetFolderId) {
        $targetFolderId = Get-OrCreateFolder -FolderName "Remake bài GroupFB" -ParentFolderId $antigravityFolderId
    }
    Write-Host "Thu muc dich luu tru: 'Remake bài GroupFB' (ID: $targetFolderId)" -ForegroundColor Green
} catch {
    Write-Warning "Gap loi khi tim/tao thu muc Google Drive: $_. File se duoc tao o thu muc goc."
    $targetFolderId = $null
}

# 3. Create Daily Google Spreadsheet
$dateStr = Get-Date -Format 'dd/MM/yyyy'
$spreadsheetTitle = "09h00 - $dateStr - Remake bài GroupFB"

$createSpreadsheetBody = @{
    name = $spreadsheetTitle
    mimeType = "application/vnd.google-apps.spreadsheet"
}
if ($null -ne $targetFolderId) {
    $createSpreadsheetBody.Add("parents", @($targetFolderId))
}
$createSpreadsheetJson = $createSpreadsheetBody | ConvertTo-Json -Depth 10

Write-Host "Dang tao Google Spreadsheet moi: $spreadsheetTitle ..." -ForegroundColor Cyan
$createResponse = Invoke-GoogleApi -Uri "https://www.googleapis.com/drive/v3/files" -Method Post -Headers $headers -Body $createSpreadsheetJson
$spreadsheetId = $createResponse.id
$spreadsheetUrl = "https://docs.google.com/spreadsheets/d/$spreadsheetId/edit"
Write-Host "Da tao Spreadsheet thanh cong: $spreadsheetUrl" -ForegroundColor Green

# 4. Configure Multiple Tabs for Facebook Groups
Write-Host "Dang doc thong tin bang tinh mac dinh..." -ForegroundColor Cyan
$sheetMetadata = Invoke-GoogleApi -Uri "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId" -Method Get -Headers $headers
$defaultSheetId = $sheetMetadata.sheets[0].properties.sheetId

# Collect group URLs and determine sheet names
$groupUrls = @()
$groupNamesMap = @{}
$sanitizedNames = @()

foreach ($member in $scrapedData.psobject.properties) {
    $url = $member.Name
    $val = $member.Value
    $groupUrls += $url
    
    $sName = Sanitize-SheetName -name $val.groupName
    # Ensure sheet names are unique
    $uniqName = $sName
    $suffix = 1
    while ($sanitizedNames -contains $uniqName) {
        $uniqName = "$sName $suffix"
        if ($uniqName.Length -gt 31) {
            $uniqName = $uniqName.Substring(0, 28) + " $suffix"
        }
        $suffix++
    }
    $sanitizedNames += $uniqName
    $groupNamesMap[$url] = $uniqName
}

# Ensure we have at least one sheet name (if scraper returned nothing)
if ($sanitizedNames.Count -eq 0) {
    $sanitizedNames += "Facebook Group"
}

# Construct batchUpdate requests to configure tabs
$tabRequests = @()

# Request 1: Rename the default sheet
$tabRequests += @{
    updateSheetProperties = @{
        properties = @{
            sheetId = $defaultSheetId
            title = $sanitizedNames[0]
        }
        fields = "title"
    }
}

# Requests 2+: Add remaining sheets
for ($i = 1; $i -lt $sanitizedNames.Count; $i++) {
    $tabRequests += @{
        addSheet = @{
            properties = @{
                title = $sanitizedNames[$i]
            }
        }
    }
}

Write-Host "Dang khoi tao cac trang tinh tuong ung voi ten nhom Facebook..." -ForegroundColor Cyan
$batchTabBody = @{ requests = $tabRequests } | ConvertTo-Json -Depth 10
$batchTabUri = "https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate"
$batchTabResponse = Invoke-GoogleApi -Uri $batchTabUri -Method Post -Headers $headers -Body $batchTabBody

# Map each group URL to its sheet ID and sanitized title
$sheetMappings = @()

# First group mapped to default sheet ID
$sheetMappings += [PSCustomObject]@{
    GroupUrl = $groupUrls[0]
    SheetName = $sanitizedNames[0]
    SheetId = $defaultSheetId
}

# Remaining groups mapped to addSheet replies
for ($i = 1; $i -lt $groupUrls.Count; $i++) {
    $addedSheetId = $batchTabResponse.replies[$i].addSheet.properties.sheetId
    $sheetMappings += [PSCustomObject]@{
        GroupUrl = $groupUrls[$i]
        SheetName = $sanitizedNames[$i]
        SheetId = $addedSheetId
    }
}

# 5. Populate and Style Data for Each Sheet
$headersRow = @("STT", "Tác giả", "Thời gian", "Nội dung bài viết", "Đường dẫn bài viết", "Ảnh/Media")

foreach ($mapping in $sheetMappings) {
    $url = $mapping.GroupUrl
    $sheetName = $mapping.SheetName
    $sheetId = $mapping.SheetId
    
    $groupData = $scrapedData.$url
    $posts = $groupData.posts
    
    Write-Host "Dang ghi du lieu cho trang tinh: '$sheetName'..." -ForegroundColor Cyan
    
    # Prepare values array
    $values = @()
    $values += ,$headersRow
    
    $idx = 1
    foreach ($post in $posts) {
        $row = @(
            $idx,
            $post.author,
            $post.time,
            $post.content,
            $post.url,
            $post.mediaUrl
        )
        $values += ,$row
        $idx++
    }
    
    # Write values to the sheet
    $rangeStr = "'$sheetName'!A1:F$($values.Count)"
    $updateBody = @{
        range = $rangeStr
        majorDimension = "ROWS"
        values = $values
    } | ConvertTo-Json -Depth 10
    
    $updateUri = "https://sheets.googleapis.com/v4/spreadsheets/$spreadsheetId/values/$rangeStr`?valueInputOption=USER_ENTERED"
    $null = Invoke-GoogleApi -Uri $updateUri -Method Put -Headers $headers -Body $updateBody
    
    # Apply styling & dimension constraints
    Write-Host "Dang dinh dang trang tinh: '$sheetName'..." -ForegroundColor Cyan
    $styleRequests = @(
        # Header Row Styling (Teal-700 background, bold white text, center, Arial 11)
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
        # Body Rows Styling (Vertical align top, Wrap text, Arial 10)
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
        # Set specific column width: STT (50px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 0
                    endIndex = 1
                }
                properties = @{ pixelSize = 50 }
                fields = "pixelSize"
            }
        },
        # Set specific column width: Tác giả (150px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 1
                    endIndex = 2
                }
                properties = @{ pixelSize = 150 }
                fields = "pixelSize"
            }
        },
        # Set specific column width: Thời gian (120px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 2
                    endIndex = 3
                }
                properties = @{ pixelSize = 120 }
                fields = "pixelSize"
            }
        },
        # Set specific column width: Nội dung bài viết (450px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 3
                    endIndex = 4
                }
                properties = @{ pixelSize = 450 }
                fields = "pixelSize"
            }
        },
        # Set specific column width: Đường dẫn bài viết (250px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 4
                    endIndex = 5
                }
                properties = @{ pixelSize = 250 }
                fields = "pixelSize"
            }
        },
        # Set specific column width: Ảnh/Media (250px)
        @{
            updateDimensionProperties = @{
                range = @{
                    sheetId = $sheetId
                    dimension = "COLUMNS"
                    startIndex = 5
                    endIndex = 6
                }
                properties = @{ pixelSize = 250 }
                fields = "pixelSize"
            }
        }
    )
    
    $batchStyleBody = @{ requests = $styleRequests } | ConvertTo-Json -Depth 10
    $batchStyleUri = "https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate"
    $null = Invoke-GoogleApi -Uri $batchStyleUri -Method Post -Headers $headers -Body $batchStyleBody
}

Write-Host ""
Write-Host "DA CAP NHAT TAT CA BAI VIET LEN GOOGLE SHEETS THANH CONG!" -ForegroundColor Green
Write-Host "Link Google Sheet: $spreadsheetUrl" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------" -ForegroundColor Green

