# 更新 Git 远程仓库的 token
# 使用方法：运行此脚本，然后输入你的新 GitHub Personal Access Token

Write-Host "请确保你已经创建了新的 GitHub Personal Access Token" -ForegroundColor Yellow
Write-Host "访问: https://github.com/settings/tokens" -ForegroundColor Cyan
Write-Host ""

$newToken = Read-Host "请输入你的新 GitHub Personal Access Token"

if ([string]::IsNullOrWhiteSpace($newToken)) {
    Write-Host "错误: Token 不能为空" -ForegroundColor Red
    exit 1
}

# 更新远程 URL
$newUrl = "https://psterman:${newToken}@github.com/psterman/cursor-lab.git"
git remote set-url new $newUrl

Write-Host ""
Write-Host "✅ 远程 URL 已更新" -ForegroundColor Green
Write-Host "新的远程 URL: https://psterman:***@github.com/psterman/cursor-lab.git" -ForegroundColor Gray
Write-Host ""
Write-Host "现在可以尝试推送: git push new main:main" -ForegroundColor Cyan
