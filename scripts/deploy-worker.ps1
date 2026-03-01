# 非交互部署 Worker。在 PowerShell 下 wrangler 有时无输出，改用 CMD 可正常显示并完成部署
# 用法: .\scripts\deploy-worker.ps1  或  npm run worker:deploy:ci
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cmd = "cd /d `"$root`" && set CI=1 && node node_modules\wrangler\wrangler-dist\cli.js deploy"
Write-Host "[deploy-worker] 通过 CMD 执行部署 (CI=1)..." -ForegroundColor Cyan
cmd /c $cmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[deploy-worker] 完成." -ForegroundColor Green
