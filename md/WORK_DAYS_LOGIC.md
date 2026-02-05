# work_days / 上岗天数 逻辑归纳

## 结论速览

| 场景 | 数据来源 | 含义 | 是否“真实天数” |
|------|----------|------|----------------|
| **stats2 本地展示** | `localStorage.last_analysis_data.stats.earliestFileTime` 或 `usageDays` | 从「最早使用 Cursor」到「今天」的天数 | ✅ 是（本地算的对） |
| **Supabase user_analysis.work_days** | 上报时的 `body.stats.work_days` 或 Worker 用消息日期推算 | 当前多为「本次上传的聊天时间跨度」或 1 | ❌ 多数不是真实上岗天数 |

---

## 1. 本地 stats2 为什么是“对的”

stats2 里「上岗天数」(day 维度) 的取值顺序在 **stats2.html** 的 `extractDimensionValues` 里（约 16496–16587 行）：

1. **优先**：`localStorage.last_analysis_data.stats.earliestFileTime`  
   - 用「当前时间 - earliestFileTime」算出天数。  
   - `earliestFileTime` 来自本地 workspace 最早文件时间（或 main.js 里 `globalStats.earliestFileTime`），代表「最早开始用 Cursor」的时间。  
   - 所以这里展示的是 **从首次使用 Cursor 到今天的真实天数**。

2. **其次**：`localStorage.last_analysis_data.stats.usageDays` / `work_days`  
   - main.js 在分析结束后，若已有 `globalStats.earliestFileTime`，会算一遍 `usageDays = (now - earliestFileTime) / 86400000` 并写入 `last_analysis_data.stats`。  
   - 因此本地 stats2 读到的也是「真实使用天数」。

3. **再其次**：云端 `userData.stats.usageDays` / `earliestFileTime` / `first_chat_at` 等。  
4. **兜底**：`userData.work_days` / `usage_days` / `days`（即 Supabase 里存的 `work_days` 等）。

所以：**本地加载 stats2 时，只要 last_analysis_data 里有 earliestFileTime 或已算好的 usageDays，显示的就是“真实上岗天数”。**

---

## 2. Supabase 里 work_days 为什么不对

### 2.1 写入 Supabase 的值从哪来

- **Worker**（`src/worker/index.ts`）收到上报后，会算一个 `workDays` 并写入 `user_analysis.work_days`。  
- 计算顺序是：
  1. 优先用 **请求体**：`body.stats.work_days` / `body.stats.usageDays` / `body.stats.usage_days` / `body.stats.days`；
  2. 再不然用 **body 顶层**：`body.usageDays` / `body.days` / `body.workDays`；
  3. 再不然用 **本次上传消息的时间戳**：对 `userMessages` 里每条消息的 `timestamp` 去重日期，`workDays = max(1, uniqueDates.size)`；
  4. 否则默认为 **1**。

- 而上报里的 `body.stats.work_days` 来自 **前端分析结果**，前端又来自 **vibeAnalyzerWorker**。

### 2.2 前端上报的 work_days 实际是什么

- 在 **vibeAnalyzerWorker.js**（约 1244–1248 行）里，`work_days` 是这样算的：
  - 遍历本次上传的聊天消息，取每条消息的 `timestamp`，得到 **minTs** 和 **maxTs**；
  - `workDays = Math.max(1, Math.ceil((maxTs - minTs) / 86400000))`。
- 也就是说：**上报的 work_days = 本次上传的聊天文件中「第一条消息」到「最后一条消息」的日历跨度（天数）**，不是「从最早用 Cursor 到今天的总天数」。

因此：

- 若用户只上传了「最近 3 天的聊天」，Supabase 里就会是 3（或更小）；
- 若上传的聊天没有有效 timestamp，或 Worker 拿不到 body.stats，就会退化为「消息去重日期数」或 **1**；
- **earliestFileTime / usageDays（从首次使用到今天的真实天数）** 只在 main.js 里算过并写入 `localStorage.last_analysis_data`，**没有随上报 body 传给 Worker**，所以 Supabase 里几乎没有“真实上岗天数”这一说。

---

## 3. 数据流简图

```
[ 本地分析 ]
  vibeAnalyzerWorker: workDays = (maxTs - minTs) 天（仅限本次聊天）
       ↓
  VibeCodingerAnalyzer: statsToUpload.work_days = 上面这个值（或 1）
       ↓
  POST /api/v2/analyze: body.stats.work_days = 同上
       ↓
  Worker: workDays = body.stats.work_days ?? … ?? 1
       ↓
  user_analysis.work_days = workDays   ← 存的是「本次聊天跨度」或 1

[ 本地展示 ]
  main.js 分析后: 若有 globalStats.earliestFileTime
    → usageDays = (now - earliestFileTime) / 86400000
    → 写入 last_analysis_data.stats.usageDays / work_days
  stats2 extractDimensionValues: 优先读 earliestFileTime / usageDays
    → 展示「从最早用到今天」的天数  ← 本地是对的
```

---

## 4. 已实施的修改（✅ 已完成）

1. **前端 VibeCodingerAnalyzer**  
   - 构建 `statsToUpload` 时：**优先使用 `usageDays`**（main.js 从 earliestFileTime 合并的真实上岗天数），其次 `work_days`（聊天跨度）；  
   - 同时写入 `work_days` 和 `usageDays` 到 stats，确保上报给 Worker 的为真实值。

2. **Worker**  
   - 已优先使用 `body.stats.work_days` / `body.stats.usageDays`，并补充注释说明语义。

3. **Worker 兜底（已实施）**  
   - 当 `work_days=1` 时，Worker 查询该用户（fingerprint 或 id）在 `user_analysis` 中的最早 `created_at`，计算 `days_since_first = floor((now - created_at) / 86400000)`，用 `max(1, days_since_first)` 覆盖。  
   - 解决 Cloudflare 部署环境下前端无法获取 `earliestFileTime` 导致 work_days 恒为 1 的问题。

4. **增量更新 / 首次创建时间保护（已实施）**  
   - **问题**：每次 upsert 用完整 payload 覆盖，若本次计算的 `work_days=1` 会覆盖已有更大值（如 5）。  
   - **方案**：写入前查询已有记录的 `work_days`（含 `stats.work_days`），使用 `work_days = max(已有值, 本次计算值)` 作为最终写入值。  
   - 确保「永不将 work_days 覆盖为更小值」，避免重复上报导致上岗天数回退。

---

## 5. 部署与验证

### 部署 Worker

```bash
npm run build
wrangler deploy
```

### 验证步骤

1. **首次分析**：新用户第一次分析，work_days 可能仍为 1（无历史记录可推算）。
2. **二次分析**：同一用户再次分析或刷新，Worker 会查到最早 `created_at` 与已有 `work_days`，work_days 应变为「距今天数」或保留已有更大值。  
3. **增量保护**：若某次上报算出 work_days=1 而库中已有 5，Worker 会保留 5，不会被覆盖为 1。
4. **Supabase 检查**：
   ```sql
   SELECT id, fingerprint, work_days, stats->>'work_days' AS stats_work_days, created_at
   FROM user_analysis
   WHERE fingerprint = '你的fingerprint'
   ORDER BY created_at DESC LIMIT 5;
   ```
5. **stats2 检查**：打开 Cloudflare 部署的 stats2 页面，确认上岗天数不再恒为 1。
