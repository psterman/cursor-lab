# 修复美国地图点击数据显示问题

## 问题描述
当用户点击 `stats2.html` 中的美国地图时,右侧抽屉里加载的以下数值都不正常,没有对应地区是 US 的用户数据:
- 受虐人数
- 语义爆发
- 高分图谱  
- 全球占比

## 问题根源

### 后端数据结构
当传入 `country_code=US` 时,后端 Worker (`src/worker/index.ts`) 会:
1. 调用 `applyUsStatsToGlobalRow(baseRow)` 函数
2. 该函数从 `row.us_stats` 中提取美国数据并"平替"到顶层字段:
   ```javascript
   return {
     ...row,
     totalUsers: us.totalUsers,      // 美国用户数
     totalAnalysis: us.totalAnalysis, // 美国分析次数
     avg_l: us.avg_l,                // 美国 L 维度平均分
     // ... 其他字段
   };
   ```
3. 返回的 `data.totalUsers`、`data.avg_l` 等顶层字段**已经是美国过滤后的数据**

### 前端错误逻辑
前端 `stats2.html` 的 `updateCountryDashboard` 函数仍然优先从 `data.us_stats` 读取数据:
```javascript
// 旧的错误逻辑
let localTotalUsers = Number(
    data.us_stats?.totalUsers ??           // ❌ 优先读取,但可能不存在
    data.us_stats?.total_users ??
    (isUS ? (data.totalUsers ?? ...) : null) // 降级逻辑
);
```

**问题:** 当 `data.us_stats` 不存在时,会读取到错误的全球数据或 null。

## 修复方案

### 核心修复 - 数据提取逻辑

#### 1. 雷达图数据 (avg_l, avg_p, avg_d, avg_e, avg_f)
```javascript
// 修复前
const avg_l = data.avg_l ?? data.avgL ?? data.us_stats?.avg_l ?? null;

// 修复后 - 直接从顶层读取
const avg_l = data.avg_l ?? data.avgL ?? null;
```

#### 2. 本地/全球用户数
```javascript
// 修复前 - 复杂的嵌套逻辑
let localTotalUsers = Number(
    data.us_stats?.totalUsers ??
    data.us_stats?.total_users ??
    (isGlobal ? (data.totalUsers ?? ...) : null) ??
    (isUS ? (data.totalUsers ?? ...) : null) ??
    null
);

// 修复后 - 清晰的分支逻辑
let localTotalUsers;
let globalTotalUsers;

if (isGlobal) {
    // 全网模式: data.totalUsers 是全网数据
    localTotalUsers = globalTotalUsers = Number(data.totalUsers);
} else {
    // 国家模式: data.totalUsers 已经是该国数据
    localTotalUsers = Number(data.totalUsers);
    
    // 重新请求全网数据用于占比计算
    const gResp = await fetch(`${API_ENDPOINT}api/global-average`);
    const gData = await gResp.json();
    globalTotalUsers = Number(gData.totalUsers);
}
```

#### 3. 全球占比计算
```javascript
// 修复前 - 使用 data.totalUsers 和 data.globalTotalUsers
const ratioPct = (data.globalTotalUsers > 0)
    ? (data.totalUsers / data.globalTotalUsers) * 100
    : ...;

// 修复后 - 使用修复的 localTotalUsers 和 globalTotalUsers
const ratioPct = (globalTotalUsers > 0)
    ? (localTotalUsers / globalTotalUsers) * 100
    : ...;
```

## 修复文件
- `stats2.html` (第 2119-2344 行)

## 测试验证

### 验证点
1. ✅ 点击美国地图,检查"受虐人数"是否显示美国用户数(而非全球用户数)
2. ✅ 检查"全球占比"是否显示正确的百分比(美国用户数/全球用户数)
3. ✅ 检查雷达图是否显示美国平均分(而非全球平均分)
4. ✅ 检查"语义爆发"词云是否加载美国地区数据

### 预期行为
- **全网模式** (`api/global-average`): 所有数据都是全网口径
- **国家模式** (`api/global-average?country_code=US`):
  - 本地数据(雷达图、受虐人数等)显示该国数据
  - 全球占比 = 该国用户数 / 全网用户数

## 相关代码位置

### 前端
- `stats2.html`: `updateCountryDashboard()` 函数 (第 1854-2406 行)
- `stats2.html`: 地图点击事件 (第 4157-4260 行)

### 后端
- `src/worker/index.ts`: `/api/global-average` 路由 (第 3489-3630 行)
- `src/worker/index.ts`: `applyUsStatsToGlobalRow()` 函数 (第 201-217 行)

## 备注
- "高分图谱" (`top_talents`) 数据目前后端可能尚未返回,显示为 `--` 是正常的
- "语义爆发" 词云数据来自 `data.monthly_vibes` / `data.monthlyVibes`,已通过 `loadWordCloud()` 函数正确加载
