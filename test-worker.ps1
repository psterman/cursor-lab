# Worker 测试脚本 (PowerShell)
# 使用方法：在项目根目录运行 .\test-worker.ps1

$baseUrl = "http://localhost:8787"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Worker API 测试脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 测试 1: 存活检查
Write-Host "[测试 1] 存活检查 (GET /)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    Write-Host "   总用户数: $($response.totalUsers)" -ForegroundColor Gray
    Write-Host "   消息: $($response.message)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
}
Write-Host ""

# 测试 2: 答案之书 (中文)
Write-Host "[测试 2] 答案之书 - 中文 (GET /api/random_prompt?lang=cn)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/random_prompt?lang=cn" -Method Get
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    if ($response.data) {
        Write-Host "   内容: $($response.data.content.Substring(0, [Math]::Min(50, $response.data.content.Length)))..." -ForegroundColor Gray
        Write-Host "   作者: $($response.data.author)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
}
Write-Host ""

# 测试 3: 答案之书 (英文)
Write-Host "[测试 3] 答案之书 - 英文 (GET /api/random_prompt?lang=en)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/random_prompt?lang=en" -Method Get
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    if ($response.data) {
        Write-Host "   内容: $($response.data.content.Substring(0, [Math]::Min(50, $response.data.content.Length)))..." -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
}
Write-Host ""

# 测试 4: 全局平均值
Write-Host "[测试 4] 全局平均值 (GET /api/global-average)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/global-average" -Method Get
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    Write-Host "   总用户数: $($response.totalUsers)" -ForegroundColor Gray
    if ($response.globalAverage) {
        Write-Host "   全局平均分:" -ForegroundColor Gray
        Write-Host "     L: $($response.globalAverage.L)" -ForegroundColor Gray
        Write-Host "     P: $($response.globalAverage.P)" -ForegroundColor Gray
        Write-Host "     D: $($response.globalAverage.D)" -ForegroundColor Gray
        Write-Host "     E: $($response.globalAverage.E)" -ForegroundColor Gray
        Write-Host "     F: $($response.globalAverage.F)" -ForegroundColor Gray
    }
    Write-Host "   数据源: $($response.source)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
}
Write-Host ""

# 测试 5: 分析接口 (POST /api/analyze)
Write-Host "[测试 5] 分析接口 (POST /api/analyze)" -ForegroundColor Yellow
$testData = @{
    dimensions = @{
        L = 75
        P = 60
        D = 80
        E = 70
        F = 65
    }
    vibeIndex = "75608"
    personalityType = "TEST"
    userMessages = 100
    totalChars = 5000
    days = 10
    jiafang = 5
    ketao = 3
    avgLength = 50
    deviceId = "test-device-123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/analyze" -Method Post -Body $testData -ContentType "application/json"
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    Write-Host "   总用户数: $($response.totalUsers)" -ForegroundColor Gray
    Write-Host "   排名百分比: $($response.rankPercent)%" -ForegroundColor Gray
    if ($response.ranks) {
        Write-Host "   详细排名:" -ForegroundColor Gray
        Write-Host "     消息数: $($response.ranks.messageRank)%" -ForegroundColor Gray
        Write-Host "     字符数: $($response.ranks.charRank)%" -ForegroundColor Gray
        Write-Host "     使用天数: $($response.ranks.daysRank)%" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   错误详情: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
Write-Host ""

# 测试 6: V2 分析接口 (POST /api/v2/analyze)
Write-Host "[测试 6] V2 分析接口 (POST /api/v2/analyze)" -ForegroundColor Yellow
$testChatData = @{
    chatData = @(
        @{
            role = "USER"
            text = "如何实现快速排序算法？"
        },
        @{
            role = "ASSISTANT"
            text = "快速排序是一种高效的排序算法..."
        },
        @{
            role = "USER"
            text = "能给我一个 Python 示例吗？"
        }
    )
    lang = "zh-CN"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v2/analyze" -Method Post -Body $testChatData -ContentType "application/json"
    Write-Host "✅ 成功" -ForegroundColor Green
    Write-Host "   状态: $($response.status)" -ForegroundColor Gray
    if ($response.dimensions) {
        Write-Host "   维度得分:" -ForegroundColor Gray
        Write-Host "     L: $($response.dimensions.L)" -ForegroundColor Gray
        Write-Host "     P: $($response.dimensions.P)" -ForegroundColor Gray
        Write-Host "     D: $($response.dimensions.D)" -ForegroundColor Gray
        Write-Host "     E: $($response.dimensions.E)" -ForegroundColor Gray
        Write-Host "     F: $($response.dimensions.F)" -ForegroundColor Gray
    }
    Write-Host "   人格类型: $($response.personalityType)" -ForegroundColor Gray
    Write-Host "   人格名称: $($response.personalityName)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 失败: $_" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   错误详情: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
