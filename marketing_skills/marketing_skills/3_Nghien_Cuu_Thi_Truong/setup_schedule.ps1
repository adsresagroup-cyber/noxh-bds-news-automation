# Ensure UTF-8 Output Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = Get-Location
}
$targetScript = Join-Path $scriptDir "fetch_group_fb_posts.ps1"
$taskName = "Antigravity_Scrape_FB_Groups_Daily"
$taskDescription = "Tu dong cao 10 bai viet ngau nhien tu 4 nhom Facebook va tai len Google Sheets hang ngay luc 9h00 sang."

Write-Host "--- THIET LAP LICH CHAY TU DONG TAC VU CAO GROUP FB ---" -ForegroundColor Green
Write-Host "Duong dan script muc tieu: $targetScript" -ForegroundColor Yellow

# Verify that the target script exists
if (-not (Test-Path $targetScript)) {
    Write-Error "[Loi] Khong tim thay script muc tieu tai $targetScript"
    exit 1
}

# Create Scheduled Task Trigger (Daily at 9:00 AM)
$trigger = New-ScheduledTaskTrigger -Daily -At "9:00 AM"

# Create Action
# Run powershell.exe with bypass policy, hidden window, and execute the target script
$powershellPath = "powershell.exe"
$arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$targetScript`""
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $scriptDir

# Settings: Allow run on battery, wake to run if sleeping, run as soon as possible if schedule missed, stop if running longer than 1 hour
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Register the Scheduled Task
try {
    # Register/overwrite the task
    Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Description $taskDescription -Force | Out-Null
    Write-Host "DA DANG KY TAC VU THANH CONG VOI WINDOWS TASK SCHEDULER!" -ForegroundColor Green
    Write-Host "Ten tac vu: $taskName" -ForegroundColor Yellow
    Write-Host "Thoi gian chay: Hang ngay vao luc 9:00 AM." -ForegroundColor Yellow
    Write-Host "Goi y: Tac vu se tu dong chay an duoi nen (Background) ma khong lam phien cong viec cua chi." -ForegroundColor Green
} catch {
    Write-Host "[Loi] Loi khi dang ky tac vu: $_" -ForegroundColor Red
    Write-Host "Goi y: Chay terminal hoac IDE duoi quyen Administrator (Run as Administrator) de dang ky tac vu he thong." -ForegroundColor Yellow
}
