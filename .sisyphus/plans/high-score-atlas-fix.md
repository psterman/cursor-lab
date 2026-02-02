# 修复高分图谱卡片空白数据问题

## TL;DR

> **快速摘要**: 修复 stats2.html 中"高分图谱卡片"（高分图谱）显示空白数据的问题，确保六个国家排行榜（total_messages, total_chars, total_user_chars, avg_user_message_length, jiafang_count, ketao_count）正确显示用户数据和排名
> 
> **交付物**: 
> - 修复 API 调用逻辑，确保 country-summary 返回 topByMetrics 数据
> - 修复前端数据提取和渲染逻辑
> - 确保 GitHub 头像和 lpdef 分数正确显示
> 
> **预估 effort**: Short
> **并行执行**: NO - sequential (依赖关系明确)
> **关键路径**: API 调试 → 数据提取修复 → 渲染验证

---

## Context

### Original Request
用户报告：高分图谱卡片中没有相关的用户数据和六个排行榜，需要确保该国用户对应 lpdef 对应的高分选手在这个卡片中依次序，已有 github 头像的用户保留 github 的头像图标

### Interview Summary
**关键讨论**:
- 问题确认: 六个国家排行榜完全空白，没有显示任何用户数据
- 影响范围: 仅限高分图谱卡片，其他功能正常
- 期望结果: 按分数顺序显示前10名用户，包含 GitHub 头像和 lpdef 分数

**研究结果**:
- ✅ 数据库视图 v_unified_analysis_v2 包含 lpdef 列
- ✅ 后端 API /api/country-summary 应该返回 topByMetrics 数组
- ✅ 前端渲染逻辑已实现（轮播图 + 指示器）
- ✅ GitHub 头像处理逻辑正确

### Metis Review
(由于系统限制，Metis 咨询未能完成，基于自主调查进行分析)

**已识别问题区域**:
1. 国家代码验证可能失败（必须恰好 2 个字符）
2. API 返回错误被前端静默捕获
3. 前端可能未正确从响应中提取 topByMetrics

---

## Work Objectives

### Core Objective
修复高分图谱卡片显示空白数据的问题，确保六个国家排行榜正确显示用户排名数据

### Concrete Deliverables
- 修复 stats2.html 中的 API 调用逻辑
- 确保 topByMetrics 数据正确获取和提取
- 修复前端渲染逻辑（轮播图 + 用户列表）
- 验证 GitHub 头像和 lpdef 分数显示

### Definition of Done
- [ ] 打开 stats2.html，进入任意国家视图
- [ ] 高分图谱卡片显示 6 个排行榜指示器
- [ ] 点击任意指示器，轮播图切换并显示该指标的 Top 10 用户
- [ ] 每个用户显示：排名徽章、头像（GitHub 或默认）、用户名、lpdef 分数、指标分数
- [ ] GitHub 用户头像正确显示（来自 github.com/{username}.png）

### Must Have
- 六个排行榜都能显示数据（即使数据为空也应显示占位符）
- GitHub 用户名正确解析并链接到 GitHub 个人资料
- lpdef 分数正确显示（如果用户有该字段）

### Must NOT Have (Guardrails)
- 不修改地图或其他组件的功能
- 不改变现有的 global-average 或其他 API 行为
- 不修改数据库 schema（视图已包含 lpdef）
- 不添加新的 API 端点

---

## Verification Strategy

> 由于是前端修复，使用 Playwright 进行自动化验证。

### Automated Verification (Playwright)

```javascript
// Agent executes via playwright browser automation:
1. Navigate to: http://localhost:3000/stats2.html
2. Wait for: selector "#rtTopTalentsList" to be visible
3. Click on: first indicator button (e.g., "Messages")
4. Wait for: selector ".lpdef-page[data-page-index='0']" to be visible
5. Check: ".lpdef-rank-row" elements count > 0
6. Check: each row has avatar image (not broken)
7. Check: GitHub usernames have links to github.com
8. Click through all 6 indicators and verify each shows data
9. Screenshot: .sisyphus/evidence/high-score-atlas-verification.png
```

**Evidence to Capture**:
- [ ] Console logs from API calls
- [ ] Screenshot of high-score atlas card with data
- [ ] API response validation (topByMetrics present)

---

## Execution Strategy

### Sequential Execution

```
Step 1: 调试 API 调用
├── 1.1: 添加调试日志，跟踪 country-summary API 调用
├── 1.2: 验证国家代码参数正确传递
├── 1.3: 检查 API 响应结构和状态码
└── 1.4: 识别并修复 API 调用失败原因

Step 2: 修复前端数据提取
├── 2.1: 检查 topByMetrics 从响应中提取的逻辑
├── 2.2: 修复数据提取失败的情况
└── 2.3: 确保错误处理正确显示占位符

Step 3: 修复渲染逻辑
├── 3.1: 验证轮播图指示器渲染
├── 3.2: 修复用户列表渲染（头像、名字、lpdef）
└── 3.3: 验证 GitHub 头像链接正确

Step 4: 端到端测试
├── 4.1: 测试所有 6 个排行榜的数据显示
└── 4.2: 验证 GitHub 头像加载
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1.1 | None | 1.2, 1.3 | None |
| 1.2 | 1.1 | 1.3 | None |
| 1.3 | 1.2 | 1.4 | None |
| 1.4 | 1.3 | 2.1 | None |
| 2.1 | 1.4 | 2.2 | None |
| 2.2 | 2.1 | 2.3 | None |
| 2.3 | 2.2 | 3.1 | None |
| 3.1 | 2.3 | 3.2 | None |
| 3.2 | 3.1 | 3.3 | None |
| 3.3 | 3.2 | 4.1 | None |
| 4.1 | 3.3 | None | None |

### Agent Dispatch Summary

| Step | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1.1-1.4 | delegate_task(category="ultrabrain", ...) - 需要调试复杂 API 调用 |
| 2 | 2.1-2.3 | delegate_task(category="deep", ...) - 需要仔细分析数据流 |
| 3 | 3.1-3.3 | delegate_task(category="visual-engineering", ...) - 前端渲染修复 |
| 4 | 4.1 | delegate_task(category="quick", ...) - 端到端验证 |

---

## TODOs

- [ ] 1. 调试 API 调用，添加调试日志

  **What to do**:
  - 在 stats2.html 中添加调试日志，跟踪 country-summary API 调用
  - 记录：请求 URL、国家代码、响应状态、响应数据
  - 使用 console.log 便于在浏览器控制台查看

  **Must NOT do**:
  - 不修改生产代码的日志级别（仅调试用）
  - 不删除现有日志

  **Recommended Agent Profile**:
  - **Category**: ultrabrain
    - Reason: 需要调试复杂的 API 调用和数据流问题
  - **Skills**: []
    - Not needed for this debugging task

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 1.2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2696` - API URL 构建模式
  - `stats2.html:2710-2722` - API 调用和响应处理

  **API/Type References** (contracts to implement against):
  - API endpoint: `/api/country-summary?country={cc}`
  - Expected response: `{ topByMetrics: [...] }`

  **Documentation References** (specs and requirements):
  - Backend spec: `src/worker/index.ts:4611` - /api/country-summary endpoint

  **WHY Each Reference Matters**:
  - stats2.html:2696: 展示如何构建 API 请求 URL
  - stats2.html:2710-2722: 展示当前 API 调用和响应处理逻辑

  **Acceptance Criteria**:

  **Automated Verification**:
  - Open browser console
  - Navigate to stats2.html with a country selected
  - Observe debug logs showing:
    - API request URL
    - Country code being sent
    - Response status (200/400/500)
    - topByMetrics in response (if present)

  **Evidence to Capture**:
  - [ ] Console output with debug logs

  **Commit**: YES
  - Message: `fix(high-score-atlas): add debug logging for API calls`
  - Files: `stats2.html`

- [ ] 2. 验证国家代码参数正确传递

  **What to do**:
  - 检查 countryCode 变量的来源和类型
  - 确保在调用 API 前转换为正确的格式（大写，2字符）
  - 添加类型检查和默认值处理

  **Must NOT do**:
  - 不修改 countryCode 的来源逻辑
  - 不影响其他使用 countryCode 的功能

  **Recommended Agent Profile**:
  - **Category**: ultrabrain
    - Reason: 需要分析数据流和类型转换逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 1.3
  - **Blocked By**: Task 1.1

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2696` - countryCode.toUpperCase() 使用
  - `src/worker/index.ts:4615` - 后端验证逻辑（必须恰好2字符）

  **Code Flow**:
  - countryCode 来源: `currentUser.country_code` 或 `ip_location`
  - 转换: `String(countryCode || '').toUpperCase()`
  - 验证: 长度必须为 2

  **Acceptance Criteria**:

  **Automated Verification**:
  - Open browser console
  - Check that country code is:
    - Exactly 2 characters
    - Uppercase (e.g., "US", "CN")
    - Not empty/null

  **Evidence to Capture**:
  - [ ] Console log showing validated country code

  **Commit**: YES
  - Message: `fix(high-score-atlas): validate country code before API call`
  - Files: `stats2.html`

- [ ] 3. 检查 API 响应结构和状态码

  **What to do**:
  - 在浏览器中检查 API 响应
  - 验证响应状态码（应为 200）
  - 检查响应体是否包含 topByMetrics 字段
  - 验证 topByMetrics 是否为包含 6 个指标的数组
  - 检查每个指标的 leaders 数组是否包含数据

  **Must NOT do**:
  - 不修改 API 响应格式（如果后端返回正确）
  - 不绕过错误处理

  **Recommended Agent Profile**:
  - **Category**: ultrabrain
    - Reason: 需要详细分析 API 响应结构
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 1.4
  - **Blocked By**: Task 1.2

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2710-2722` - 当前响应处理逻辑
  - `src/worker/index.ts:4884-4999` - 后端返回数据结构

  **Expected API Response**:
  ```json
  {
    "success": true,
    "topByMetrics": [
      {
        "key": "total_messages",
        "labelZh": "调戏AI次数",
        "labelEn": "Messages",
        "leaders": [
          {
            "rank": 1,
            "score": 100,
            "user": {
              "id": "...",
              "user_name": "...",
              "github_username": "...",
              "lpdef": "..."
            }
          }
        ]
      }
    ]
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:
  - Check Network tab in browser DevTools
  - Verify API response status is 200
  - Verify response contains topByMetrics array with 6 items
  - Verify each item has leaders array with data (or empty array if no data)

  **Evidence to Capture**:
  - [ ] Screenshot of API response in Network tab
  - [ ] Console log showing parsed response

  **Commit**: NO (debug only)
  - Message: `chore(high-score-atlas): debug API response structure`
  - Files: `stats2.html`

- [ ] 4. 识别并修复 API 调用失败原因

  **What to do**:
  - 根据调试结果，识别 API 调用失败的具体原因
  - 可能的问题：
    - 国家代码无效（后端返回 400）
    - API 返回错误格式
    - 数据库查询返回空数据
  - 修复识别到的问题

  **Must NOT do**:
  - 不修改不相关功能
  - 不引入新的 bug

  **Recommended Agent Profile**:
  - **Category**: ultrabrain
    - Reason: 需要分析根本原因并实施修复
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2.1
  - **Blocked By**: Task 1.3

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker/index.ts:4615` - 后端国家代码验证
  - `src/worker/index.ts:4893-4999` - 后端数据查询逻辑

  **Common Issues and Fixes**:
  - 400 Bad Request: 确保国家代码恰好 2 个字符
  - 500 Internal Error: 检查后端日志
  - 空数据: 检查数据库视图是否有数据

  **Acceptance Criteria**:

  **Automated Verification**:
  - API returns 200 status
  - API response contains topByMetrics array
  - No errors in console

  **Evidence to Capture**:
  - [ ] Console log showing successful API response
  - [ ] topByMetrics data structure verified

  **Commit**: YES
  - Message: `fix(high-score-atlas): resolve API call failures`
  - Files: `stats2.html` or `src/worker/index.ts` (as needed)

- [ ] 5. 检查 topByMetrics 数据提取逻辑

  **What to do**:
  - 检查 stats2.html:2722 的数据提取逻辑
  - 验证 payload2.topByMetrics 或 payload2.data.topByMetrics 都能正确提取
  - 确保数据提取失败时有适当的错误处理

  **Must NOT do**:
  - 不破坏现有的数据提取逻辑
  - 不移除错误处理

  **Recommended Agent Profile**:
  - **Category**: deep
    - Reason: 需要仔细分析数据流和错误处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2.2
  - **Blocked By**: Task 1.4

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2722` - 当前 topByMetrics 提取逻辑
  - `stats2.html:2716-2719` - 其他数据字段的提取模式

  **Current Code** (line 2722):
  ```javascript
  data.topByMetrics = payload2.topByMetrics || payload2.data?.topByMetrics || [];
  ```

  **Acceptance Criteria**:

  **Automated Verification**:
  - Check that data.topByMetrics is populated after API response
  - Verify topByMetrics has 6 items
  - Each item has key, labelZh, labelEn, leaders properties

  **Evidence to Capture**:
  - [ ] Console log showing extracted topByMetrics data

  **Commit**: YES
  - Message: `fix(high-score-atlas): improve topByMetrics extraction`
  - Files: `stats2.html`

- [ ] 6. 修复数据提取失败的情况

  **What to do**:
  - 添加更详细的数据提取日志
  - 修复提取逻辑中的潜在问题
  - 确保空数据情况正确处理（显示占位符而非空白）

  **Must NOT do**:
  - 不修改不相关的提取逻辑
  - 不影响其他卡片的数据处理

  **Recommended Agent Profile**:
  - **Category**: deep
    - Reason: 需要修复数据处理逻辑而不破坏其他功能
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2.3
  - **Blocked By**: Task 2.1

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2720-2723` - 当前 topByMetrics 提取
  - `stats2.html:2870-2871` - 空数据处理

  **Empty Data Handling** (line 2870-2871):
  ```javascript
  if (!topBy || topBy.length === 0) {
      topTalentsEl.innerHTML = `<div class="text-zinc-500 text-xs text-center">${escapeHtml(getI18nText('lpdef.none') || 'No data')}</div>`;
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:
  - Even with no data, the card should show a placeholder message
  - No console errors related to topByMetrics extraction

  **Evidence to Capture**:
  - [ ] Console log showing extraction result
  - [ ] Screenshot of empty state placeholder

  **Commit**: YES
  - Message: `fix(high-score-atlas): handle empty topByMetrics gracefully`
  - Files: `stats2.html`

- [ ] 7. 验证轮播图指示器渲染

  **What to do**:
  - 检查 stats2.html:2886-2893 的指示器渲染逻辑
  - 验证 6 个指标的指示器都正确显示
  - 验证指示器的 active 状态切换正常

  **Must NOT do**:
  - 不修改指示器的样式（除非必要）
  - 不改变指示器的数量（必须是 6 个）

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
    - Reason: 前端渲染修复
  - **Skills**: ["frontend-ui-ux"]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3.2
  - **Blocked By**: Task 2.2

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2886-2893` - 当前指示器渲染逻辑
  - `stats2.html:2935-2975` - 指示器交互逻辑

  **Expected Output**:
  - 6 indicator buttons (Messages, Total Chars, User Chars, Avg Len, Jiafang, Ketao)
  - First indicator has "active" class
  - Clicking indicator changes active state

  **Acceptance Criteria**:

  **Automated Verification**:
  - Check #rtTopTalentsHeroes contains 6 indicator buttons
  - Each button has data-lpdef-idx attribute (0-5)
  - First button has "active" class

  **Evidence to Capture**:
  - [ ] Screenshot of indicators row
  - [ ] Console log showing indicator count

  **Commit**: NO (verify only)
  - Message: `chore(high-score-atlas): verify indicator rendering`
  - Files: `stats2.html`

- [ ] 8. 修复用户列表渲染（头像、名字、lpdef）

  **What to do**:
  - 检查 stats2.html:2895-2931 的用户列表渲染逻辑
  - 验证每个用户行正确显示：
    - 排名徽章（rank badge）
    - 头像（GitHub 或默认）
    - 用户名（链接或文本）
    - lpdef 分数（如果可用）
    - 指标分数
  - 修复渲染问题

  **Must NOT do**:
  - 不改变用户列表的整体结构
  - 不修改不相关的渲染逻辑

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
    - Reason: 前端渲染修复
  - **Skills**: ["frontend-ui-ux"]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3.3
  - **Blocked By**: Task 3.1

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2898-2920` - 当前用户列表渲染逻辑
  - `stats2.html:2396-2416` - _resolveUserMeta 函数

  **Expected Row Structure**:
  ```html
  <div class="lpdef-rank-row">
      <div class="lpdef-rank-left">
          <span class="lpdef-rank-badge">1</span>
          <img class="lpdef-rank-avatar" src="https://github.com/user.png" alt="" />
          <a class="lpdef-rank-name" href="https://github.com/user">@user</a>
          <span class="text-[10px] text-zinc-500 font-mono ml-1">lpdef_value</span>
      </div>
      <div class="lpdef-rank-score">100</div>
  </div>
  ```

  **Acceptance Criteria**:

  **Automated Verification**:
  - Each .lpdef-rank-row contains all required elements
  - GitHub avatars load correctly (no broken images)
  - GitHub usernames link to correct profile URLs
  - lpdef text displays when available

  **Evidence to Capture**:
  - [ ] Screenshot of user list with data
  - [ ] Console log showing rendered row count

  **Commit**: YES
  - Message: `fix(high-score-atlas): fix user list rendering`
  - Files: `stats2.html`

- [ ] 9. 验证 GitHub 头像链接正确

  **What to do**:
  - 检查 GitHub 头像 URL 构建逻辑
  - 验证 `https://github.com/{username}.png?size=64` 格式正确
  - 确保 GitHub 用户名正确编码（encodeURIComponent）
  - 测试 GitHub 头像加载（处理 onerror 回退）

  **Must NOT do**:
  - 不修改 GitHub 头像 URL 的基本格式
  - 不移除 onerror 回退逻辑

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
    - Reason: 前端渲染修复
  - **Skills**: ["frontend-ui-ux"]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4.1
  - **Blocked By**: Task 3.2

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2411-2414` - _resolveUserMeta 中的头像构建
  - `stats2.html:2914` - 头像在渲染中的使用

  **Avatar URL Construction**:
  ```javascript
  const avatar = github
      ? `https://github.com/${encodeURIComponent(github)}.png?size=64`
      : DEFAULT_AVATAR;
  ```

  **Acceptance Criteria**:

  **Automated Verification**:
  - GitHub avatar URLs are correctly formatted
  - Avatar images load without errors
  - onerror fallback shows DEFAULT_AVATAR for broken images

  **Evidence to Capture**:
  - [ ] Network tab showing GitHub avatar requests
  - [ ] Screenshot of avatars loading correctly

  **Commit**: NO (verify only)
  - Message: `chore(high-score-atlas): verify GitHub avatar URLs`
  - Files: `stats2.html`

- [ ] 10. 测试所有 6 个排行榜的数据显示

  **What to do**:
  - 依次点击 6 个指示器
  - 验证每个排行榜都显示数据（即使数据为空）
  - 验证轮播图切换流畅
  - 记录每个排行榜的用户数量

  **Must NOT do**:
  - 不修改轮播图的基础逻辑
  - 不删除任何排行榜

  **Recommended Agent Profile**:
  - **Category**: quick
    - Reason: 端到端验证任务
  - **Skills**: ["playwright"]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 3.3

  **References**:

  **Pattern References** (existing code to follow):
  - `stats2.html:2937-2975` - 轮播图滚动和指示器同步

  **6 Metrics to Test**:
  1. total_messages - 调戏AI次数
  2. total_chars - 对话字符数
  3. total_user_chars - 废话输出
  4. avg_user_message_length - 平均长度
  5. jiafang_count - 甲方上身
  6. ketao_count - 磕头

  **Acceptance Criteria**:

  **Automated Verification** (Playwright):
  ```javascript
  // 遍历所有 6 个指示器
  const indicators = document.querySelectorAll('[data-lpdef-idx]');
  for (let i = 0; i < indicators.length; i++) {
      indicators[i].click();
      await page.waitForTimeout(500);
      const pageElement = document.querySelector(`.lpdef-page[data-page-index="${i}"]`);
      const rows = pageElement.querySelectorAll('.lpdef-rank-row');
      console.log(`Metric ${i}: ${rows.length} users`);
  }
  ```

  **Evidence to Capture**:
  - [ ] Console output showing 6 metrics with user counts
  - [ ] Screenshot of each metric's leaderboard

  **Commit**: NO (verification only)
  - Message: `test(high-score-atlas): end-to-end verification`
  - Files: `stats2.html`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(high-score-atlas): add debug logging` | stats2.html | Console logs |
| 2 | `fix(high-score-atlas): validate country code` | stats2.html | Console logs |
| 4 | `fix(high-score-atlas): resolve API failures` | stats2.html/src/worker/index.ts | API returns 200 |
| 5 | `fix(high-score-atlas): improve data extraction` | stats2.html | topByMetrics populated |
| 6 | `fix(high-score-atlas): handle empty data` | stats2.html | No console errors |
| 8 | `fix(high-score-atlas): fix user rendering` | stats2.html | Users display correctly |

---

## Success Criteria

### Verification Commands
```bash
# Open browser DevTools and check:
# 1. Console has no errors related to high-score-atlas
# 2. Network tab shows successful /api/country-summary response
# 3. topByMetrics array has 6 items in console

# In browser console:
console.log(window.data?.topByMetrics?.length); // Should output: 6
```

### Final Checklist
- [ ] All 6 indicators display correctly
- [ ] All 6 leaderboards show user data (or placeholder if empty)
- [ ] GitHub avatars load correctly for users with GitHub usernames
- [ ] GitHub profile links work correctly
- [ ] lpdef scores display when available
- [ ] No console errors related to high-score atlas
- [ ] API returns 200 status and contains topByMetrics
