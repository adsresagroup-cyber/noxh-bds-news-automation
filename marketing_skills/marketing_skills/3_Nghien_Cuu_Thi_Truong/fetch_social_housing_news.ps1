# PowerShell Wrapper calling Node.js implementation for Social Housing News Crawler
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsPath = Join-Path $scriptDir "fetch_social_housing_news.js"
node $jsPath
