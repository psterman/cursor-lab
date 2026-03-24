# 核对全球硬核榜 API：/api/global-aggregate 主路径与 /api/v2/country-stats-global 兜底
# 用法：$env:STATS_API_BASE = "https://your-worker.example.com"; .\scripts\verify-hardcore-api.ps1

param(
    [string] $Base = $env:STATS_API_BASE
)

if (-not $Base) {
    Write-Error "请设置环境变量 STATS_API_BASE（Worker 根 URL，无末尾斜杠）"
    exit 1
}

$Base = $Base.TrimEnd('/')
$t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "=== GET /api/global-aggregate?view=global ===" -ForegroundColor Cyan
try {
    $ga = Invoke-RestMethod -Uri "$Base/api/global-aggregate?view=global&_t=$t" -Method Get
    $keys = @()
    if ($ga.snapshot -and $ga.snapshot.PSObject.Properties) {
        $keys = @($ga.snapshot.PSObject.Properties.Name)
    }
    Write-Host ("success: {0}; snapshot countries: {1}" -f $ga.success, $keys.Count)
    if ($keys.Count -gt 0) {
        $sample = $keys[0]
        $row = $ga.snapshot.$sample
        Write-Host ("sample[{0}] tool_calls_total_sum={1} tasks_executed_sum={2} polyglot_avg={3}" -f `
            $sample, $row.tool_calls_total_sum, $row.tasks_executed_sum, $row.polyglot_avg_languages_per_repo)
    }
} catch {
    Write-Host $_ -ForegroundColor Red
}

Write-Host "`n=== GET /api/v2/country-stats-global ===" -ForegroundColor Cyan
try {
    $cg = Invoke-RestMethod -Uri "$Base/api/v2/country-stats-global?_t=$t" -Method Get
    $n = 0
    if ($cg.data) { $n = $cg.data.Count }
    Write-Host ("status: {0}; country_level rows: {1}" -f $cg.status, $n)
    if ($n -gt 0) {
        $r0 = $cg.data[0]
        Write-Host ("sample country_code={0} openclaw_tool_calls_sum={1} tasks_executed_sum={2} jiafang_rejection_rate={3}" -f `
            $r0.country_code, $r0.openclaw_tool_calls_sum, $r0.tasks_executed_sum, $r0.jiafang_rejection_rate)
    }
} catch {
    Write-Host $_ -ForegroundColor Red
}
