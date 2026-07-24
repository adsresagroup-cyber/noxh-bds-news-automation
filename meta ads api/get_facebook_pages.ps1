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

if (-not (Test-Path $envPath)) {
    Write-Host "Loi: Khong tim thay file .env tai $envPath." -ForegroundColor Red
    exit 1
}

# Read META_ACCESS_TOKEN & META_API_VERSION
$accessToken = ""
$apiVersion = "v20.0"

Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        if ($line -match "^META_ACCESS_TOKEN=(.*)$") {
            $accessToken = $Matches[1].Trim()
        }
        if ($line -match "^META_API_VERSION=(.*)$") {
            $apiVersion = $Matches[1].Trim()
        }
    }
}

if ([string]::IsNullOrEmpty($accessToken)) {
    Write-Host "Loi: Khong tim thay META_ACCESS_TOKEN trong file .env." -ForegroundColor Red
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         DANH SACH FANPAGE FACEBOOK CUA BAN" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Try to fetch from /me/accounts
$url = "https://graph.facebook.com/$apiVersion/me/accounts"
$params = @{
    access_token = $accessToken
    limit        = 100
}
$queryUrl = $url + "?" + (($params.Keys | ForEach-Object { "$_=$([Uri]::EscapeDataString($params[$_]))" }) -join [char]38)

$pages = @()
try {
    $response = Invoke-RestMethod -Uri $queryUrl -Method Get
    if ($null -ne $response -and $null -ne $response.data) {
        $pages = $response.data
    }
} catch {
    Write-Host "Khong the goi /me/accounts, se thu qua debug_token..." -ForegroundColor Yellow
}

# 2. If empty, fallback to debug_token granular scopes
if ($pages.Count -eq 0) {
    Write-Host "Khong tim thay Fanpage qua /me/accounts. Dang thu lay danh sach qua debug_token..." -ForegroundColor Yellow
    try {
        $debugUrl = "https://graph.facebook.com/debug_token"
        $debugParams = @{
            input_token  = $accessToken
            access_token = $accessToken
        }
        $debugQuery = $debugUrl + "?" + (($debugParams.Keys | ForEach-Object { "$_=$([Uri]::EscapeDataString($debugParams[$_]))" }) -join [char]38)
        
        $debugResponse = Invoke-RestMethod -Uri $debugQuery -Method Get
        $targetIds = @()
        if ($null -ne $debugResponse -and $null -ne $debugResponse.data -and $null -ne $debugResponse.data.granular_scopes) {
            foreach ($gScope in $debugResponse.data.granular_scopes) {
                if ($gScope.scope -eq "pages_read_engagement" -and $null -ne $gScope.target_ids) {
                    $targetIds += $gScope.target_ids
                }
            }
        }
        
        # Unique target IDs
        $targetIds = $targetIds | Select-Object -Unique
        
        if ($targetIds.Count -gt 0) {
            Write-Host "Tim thay $($targetIds.Count) Page ID duoc phan quyen. Dang lay thong tin chi tiet..." -ForegroundColor Yellow
            foreach ($pageId in $targetIds) {
                try {
                    $pInfoUrl = "https://graph.facebook.com/$apiVersion/$pageId"
                    $pInfoParams = @{
                        fields       = "name"
                        access_token = $accessToken
                    }
                    $pInfoQuery = $pInfoUrl + "?" + (($pInfoParams.Keys | ForEach-Object { "$_=$([Uri]::EscapeDataString($pInfoParams[$_]))" }) -join [char]38)
                    
                    $pInfo = Invoke-RestMethod -Uri $pInfoQuery -Method Get
                    if ($null -ne $pInfo -and $null -ne $pInfo.name) {
                        $pages += [PSCustomObject]@{
                            name = $pInfo.name
                            id   = $pageId
                        }
                    }
                } catch {
                    Write-Warning "Khong the lay thong tin cho Page ID: $pageId"
                }
            }
        }
    } catch {
        Write-Host "Loi khi goi debug_token: $_" -ForegroundColor Red
    }
}

if ($pages.Count -eq 0) {
    Write-Host "Khong tim thay Fanpage nao lien ket voi tai khoan nay." -ForegroundColor Red
    exit 1
}

# 3. Print the page list
$format = "{0,-4} | {1,-35} | {2,-20}"
Write-Host ($format -f "STT", "Ten Trang", "Page ID") -ForegroundColor Green
Write-Host ("-" * 65)

$envParts = @()
$idx = 1
foreach ($page in $pages) {
    $name = $page.name
    $pageId = $page.id
    
    # Clean name for env config format
    $cleanName = $name.Replace(" ", "_").Replace(":", "").Replace(",", "")
    
    # Trim name to fit display width nicely
    $displayName = $name
    if ($displayName.Length -gt 35) {
        $displayName = $name.Substring(0, 32) + "..."
    }
    
    Write-Host ($format -f $idx, $displayName, $pageId)
    $envParts += "$pageId`:$cleanName"
    $idx++
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "GOI Y CAU HINH FILE .env:" -ForegroundColor Yellow
Write-Host "Chi hay copy dong duoi day va dan vao file .env nhe:" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
$envString = "META_PAGES=" + ($envParts -join ",")
Write-Host $envString -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
