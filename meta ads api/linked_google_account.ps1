# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   LIÊN KẾT TÀI KHOẢN GOOGLE (OAUTH 2.0)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ask user for Client ID & Client Secret
$clientId = Read-Host "Nhập Google Client ID của bạn"
$clientSecret = Read-Host "Nhập Google Client Secret của bạn"

if ([string]::IsNullOrEmpty($clientId) -or [string]::IsNullOrEmpty($clientSecret)) {
    Write-Host "❌ Lỗi: Client ID và Client Secret không được để trống!" -ForegroundColor Red
    exit 1
}

$port = 8080
$redirectUri = "http://localhost:$port/"
$scopes = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/adwords"

# 2. Build auth URL
$authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + `
    "client_id=$([Uri]::EscapeDataString($clientId))&" + `
    "redirect_uri=$([Uri]::EscapeDataString($redirectUri))&" + `
    "response_type=code&" + `
    "scope=$([Uri]::EscapeDataString($scopes))&" + `
    "access_type=offline&" + `
    "prompt=consent"

# 3. Start local HTTP listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($redirectUri)
try {
    $listener.Start()
} catch {
    Write-Host "❌ Lỗi: Không thể khởi động cổng $port. Đảm bảo cổng này chưa bị sử dụng hoặc chạy dưới quyền Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "`nĐang mở trình duyệt để xác thực..." -ForegroundColor Yellow
Start-Process $authUrl

Write-Host "Đang chờ xác thực từ trình duyệt..." -ForegroundColor Yellow
$context = $listener.GetContext()
$request = $context.Request
$response = $context.Response

$code = $request.QueryString["code"]

if ([string]::IsNullOrEmpty($code)) {
    $html = "<html><body><h2>Xác thực thất bại! Không lấy được mã code.</h2></body></html>"
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
    $listener.Stop()
    Write-Host "❌ Xác thực thất bại: Không tìm thấy authorization code." -ForegroundColor Red
    exit 1
}

# Send success response to browser
$html = "<html><head><meta charset='utf-8'></head><body style='font-family: Arial, sans-serif; text-align: center; margin-top: 50px;'><h2 style='color: #0f9d58;'>Liên kết tài khoản thành công!</h2><p>Bạn có thể đóng tab này và quay lại màn hình PowerShell để tiếp tục.</p></body></html>"
$buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
$response.ContentLength64 = $buffer.Length
$response.OutputStream.Write($buffer, 0, $buffer.Length)
$response.Close()
$listener.Stop()

Write-Host "`nĐã nhận Authorization Code. Đang lấy Access Token và Refresh Token..." -ForegroundColor Green

# 4. Exchange code for token
$tokenBody = @{
    code          = $code
    client_id     = $clientId
    client_secret = $clientSecret
    redirect_uri  = $redirectUri
    grant_type    = "authorization_code"
}

try {
    $tokenRes = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method Post -Body $tokenBody
    
    $tokenJson = @{
        token         = $tokenRes.access_token
        client_id     = $clientId
        client_secret = $clientSecret
        refresh_token = $tokenRes.refresh_token
    } | ConvertTo-Json -Depth 10
    
    # Save to token.json in the same directory as script
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = Get-Location }
    $tokenPath = Join-Path $scriptDir "token.json"
    
    # Save with UTF-8 with BOM to ensure PowerShell parses it stably
    [System.IO.File]::WriteAllText($tokenPath, $tokenJson, [System.Text.Encoding]::UTF8)
    
    Write-Host "`n🎉 LIÊN KẾT TÀI KHOẢN THÀNH CÔNG!" -ForegroundColor Green
    Write-Host "File token.json đã được lưu tại: $tokenPath" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Lỗi khi trao đổi token: $_" -ForegroundColor Red
    if ($null -ne $_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Chi tiết: $($reader.ReadToEnd())" -ForegroundColor Red
    }
}
