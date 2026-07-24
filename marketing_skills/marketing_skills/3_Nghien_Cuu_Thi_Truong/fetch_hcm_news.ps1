# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = Get-Location
}

$today = Get-Date -Format "yyyyMMdd"
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "scrape_hcm_$today.log"

$jsScript = Join-Path $scriptDir "fetch_hcm_news.js"

Write-Host "--- CHẠY TỰ ĐỘNG CÀO TIN TỨC BẤT ĐỘNG SẢN TP.HCM ---"
Write-Host "Log ghi nhận tại: $logFile"

# Run node script and redirect output to log file
try {
    Start-Transcript -Path $logFile -Append | Out-Null
    node $jsScript
    Stop-Transcript | Out-Null
    Write-Host "HOÀN THÀNH QUY TRÌNH TP.HCM!" -ForegroundColor Green
} catch {
    Write-Error "Lỗi khi thực thi quy trình TP.HCM: $_"
    if ($Error.Count -gt 0) {
        Stop-Transcript | Out-Null
    }
}
