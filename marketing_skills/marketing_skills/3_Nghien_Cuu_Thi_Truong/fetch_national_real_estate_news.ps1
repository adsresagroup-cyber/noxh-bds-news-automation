# PowerShell Wrapper calling Node.js implementation for National Real Estate News Crawler
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsPath = Join-Path $scriptDir "fetch_national_real_estate_news.js"
node $jsPath
