# 国家切换影响聚合 - 迁移指南

## 背景

用户在下拉框/左侧抽屉切换国家后，右侧抽屉应能正确显示该国全体用户统计（含当前用户）。此前存在两处问题：

1. **API 未同步 manual_location**：`update_location` 仅更新 `current_location`，而 `v_unified_analysis_v2` 的 `country_code` 依赖 `manual_location` / `ip_location`，导致切换后用户数据未进入该国聚合。
2. **视图未兜底 current_location**：视图未使用 `current_location` 作为 fallback；且 `ip_location` 若为全名（如 "China"）则 `country_code` 为 NULL。

## 方案概览

| 方案 | 说明 | 状态 |
|------|------|------|
| **方案 1** | `update_location` 同时写入 `manual_location` | ✅ 已完成（Worker 代码） |
| **方案 2** | 视图中加入 `current_location` 兜底 | ✅ 已包含在 SQL 迁移 |
| **方案 3** | 视图中加入全名→ISO2 映射 | ✅ 已包含在 SQL 迁移 |

---

## 迁移步骤

### 步骤 1：部署 Worker 代码（方案 1）

`src/worker/index.ts` 中 `POST /api/v2/update_location` 已修改为同时写入 `manual_location`：

```ts
const patchPayload: any = {
  current_location: currentLocation,
  manual_location: currentLocation,  // 新增
  location_switched_at: switchedAt || new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

**操作**：

```bash
# 构建并部署 Worker
npm run build
wrangler deploy
```

**验证**：切换国家后，在 Supabase 中查询 `user_analysis`，确认 `manual_location` 已更新为所选国家代码。

---

### 步骤 2：执行 Supabase SQL 迁移（方案 2 + 3）

**前置条件**：

- 已执行 `add_manual_location_columns.sql`（`manual_location`, `manual_lat`, `manual_lng` 存在）

**操作**：

1. 打开 Supabase Dashboard → SQL Editor
2. 执行 `md/migrate_country_location_v2.sql` 内容
3. 确认无报错

**迁移内容**：

- 若 `user_analysis` 无 `current_location` 列，则自动添加
- 重建 `v_unified_analysis_v2` 视图：
  - `country_code` 优先级：`manual_location` > `current_location` > `ip_location` > 全名映射
  - 全名映射：China→CN, United States→US, Japan→JP 等

**验证**：

```sql
-- 检查 current_location 列是否存在
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_analysis'
AND column_name IN ('manual_location', 'current_location');

-- 检查 country_code 是否正常
SELECT country_code, COUNT(*) FROM public.v_unified_analysis_v2
WHERE country_code IS NOT NULL GROUP BY 1;
```

---

### 步骤 3：功能自测

1. 打开 stats2 页面，登录/生成 fingerprint
2. 在左侧抽屉国家列表中选择「中国」或其他非美国国家
3. 确认右侧抽屉：
   - 展示该国汇总数据（已诊断开发者、扫描次数等）
   - 不再长期为空或仅显示美国数据
4. 在 Supabase 中检查：`user_analysis` 中对应行的 `manual_location` 应为所选国家代码

---

## 回滚

**Worker 回滚**：将 `manual_location: currentLocation` 从 `patchPayload` 中移除并重新部署。

**视图回滚**：重新执行 `md/create_unified_view_v2.sql` 中的原始视图定义。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/worker/index.ts` | `update_location` 接口实现 |
| `md/migrate_country_location_v2.sql` | 视图迁移脚本 |
| `md/create_unified_view_v2.sql` | 原始视图定义（未含方案 2/3） |
