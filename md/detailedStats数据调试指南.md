# detailedStats 数据调试指南

## 问题描述

用户反馈：数据没有传入到 `detailedStats`

## 调试步骤

### 1. 检查适配器函数调用

**位置**：`src/worker/index.ts` 第 1233-1236 行

**日志输出**：
```
[Worker] 🔍 开始调用适配器函数 matchLPDEFContent: {
  dimensions: { L: 85, P: 60, D: 70, E: 30, F: 75 },
  lang: 'zh-CN',
  dimensionsKeys: ['L', 'P', 'D', 'E', 'F'],
  dimensionsValues: [85, 60, 70, 30, 75]
}
```

**检查点**：
- ✅ 确认 `dimensions` 对象包含所有 5 个维度（L, P, D, E, F）
- ✅ 确认维度值在 0-100 范围内
- ✅ 确认 `lang` 参数正确传递

### 2. 检查适配器函数内部处理

**位置**：`src/worker/index.ts` 第 253-403 行

**日志输出**：
```
[Adapter] 🔍 开始匹配维度，输入: {
  dimensionsKeys: ['L', 'P', 'D', 'E', 'F'],
  dimensionsValues: [85, 60, 70, 30, 75],
  dimensionMapping: { L: 'word', P: 'no', D: 'say', E: 'ai', F: 'please' },
  availableResources: ['ai', 'say', 'day', 'please', 'no', 'word']
}

[Adapter] 🔍 处理维度 L, 分数: 85
[Adapter] 🔍 维度 L 映射到 rankId: word
[Adapter] ✅ 找到资源 word, levels 数量: 3
[Adapter] ✅ 维度 L 匹配成功: {
  rankId: 'word',
  rankValue: 85,
  label: '代码重度使用者',
  roast: '你的代码比例高达85%...',
  matchedLevelRange: '51-100'
}
```

**检查点**：
- ✅ 确认维度映射正确（L -> 'word', P -> 'no', D -> 'say', E -> 'ai', F -> 'please'）
- ✅ 确认 `RANK_RESOURCES` 中包含所有需要的资源
- ✅ 确认每个维度都能找到匹配的 level
- ✅ 确认每个维度都能获取到 label 和 roast

### 3. 检查适配器函数返回值

**位置**：`src/worker/index.ts` 第 1235-1236 行

**日志输出**：
```
[Worker] ✅ 通过适配器函数生成详细统计数据: {
  count: 5,
  dimensions: [
    { dimension: 'L', score: 85, hasLabel: true, hasRoast: true, ... },
    { dimension: 'P', score: 60, hasLabel: true, hasRoast: true, ... },
    { dimension: 'D', score: 70, hasLabel: true, hasRoast: true, ... },
    { dimension: 'E', score: 30, hasLabel: true, hasRoast: true, ... },
    { dimension: 'F', score: 75, hasLabel: true, hasRoast: true, ... }
  ]
}
```

**检查点**：
- ✅ 确认返回数组长度为 5
- ✅ 确认每个维度都有 label 和 roast
- ✅ 确认 roast 不是 '暂无吐槽文案'

### 4. 检查最终 detailedStats

**位置**：`src/worker/index.ts` 第 1307 行

**日志输出**：
```
[Worker] ✅ 详细统计数据已生成（最终）: {
  count: 5,
  dimensions: [
    { dimension: 'L', score: 85, label: '代码重度使用者', roastLength: 45, ... },
    { dimension: 'P', score: 60, label: '中等耐心', roastLength: 38, ... },
    ...
  ],
  allDimensionsPresent: true
}
```

**检查点**：
- ✅ 确认最终数组长度为 5
- ✅ 确认所有维度都存在
- ✅ 确认每个维度都有有效的 label 和 roast

### 5. 检查 Payload 构建

**位置**：`src/worker/index.ts` 第 1538-1570 行

**日志输出**：
```
[Worker] 🔍 Payload 数据验证: {
  hasDetailedStats: true,
  detailedStatsLength: 5,
  hasPersonality: true,
  personalityDetailedStatsLength: 5,
  hasPersonalityData: true,
  personalityDataLength: 5,
  personalityDataPreview: [
    { dimension: 'L', score: 85, hasLabel: true, hasRoast: true },
    { dimension: 'P', score: 60, hasLabel: true, hasRoast: true }
  ]
}
```

**检查点**：
- ✅ 确认 `detailedStats` 变量存在且长度正确
- ✅ 确认 `payload.personality.detailedStats` 存在且长度正确
- ✅ 确认 `payload.personality_data` 存在且长度正确

### 6. 检查 Supabase 上传

**位置**：`src/worker/index.ts` 第 1600-1630 行

**日志输出**：
```
[Supabase] ✅ 数据已成功写入: {
  fingerprint: 'abc123...',
  hasPersonality: true,
  detailedStatsCount: 5,
  hasPersonalityData: true,
  personalityDataLength: 5,
  l_score: 85,
  p_score: 60,
  ...
}
```

**检查点**：
- ✅ 确认上传成功（状态码 200/201）
- ✅ 确认 payload 中包含所有必要字段
- ✅ 确认 `personality_data` 字段存在

## 常见问题排查

### 问题 1：适配器函数返回空数组

**可能原因**：
- `RANK_RESOURCES` 未正确导入
- 维度映射失败
- `rank-content.ts` 数据结构不匹配

**解决方案**：
1. 检查 `RANK_RESOURCES` 导入：`import { RANK_RESOURCES } from '../rank-content';`
2. 检查维度映射：确认 `dimensionMapping` 对象正确
3. 检查 `rank-content.ts` 数据结构：确认包含 `levels` 数组

### 问题 2：适配器函数返回数据不完整（< 5 个维度）

**可能原因**：
- 某些维度的 `RANK_RESOURCES` 配置缺失
- 某些维度的匹配逻辑失败

**解决方案**：
1. 检查日志中的警告信息
2. 确认所有维度都能找到对应的资源
3. 检查降级方案是否正常工作

### 问题 3：数据没有传递到 payload

**可能原因**：
- `detailedStats` 变量作用域问题
- payload 构建时 `detailedStats` 未定义

**解决方案**：
1. 确认 `detailedStats` 在 payload 构建之前已赋值
2. 检查变量作用域，确保 `detailedStats` 在正确的作用域内
3. 添加调试日志验证数据传递

### 问题 4：Supabase 上传失败

**可能原因**：
- 数据库字段不存在
- 数据格式不正确
- 权限问题

**解决方案**：
1. 检查数据库表结构，确认 `personality_data` 字段存在（JSONB 类型）
2. 检查数据格式，确认是有效的 JSON 数组
3. 检查 Supabase 权限配置

## 调试命令

### 查看 Worker 日志

在 Cloudflare Workers 控制台查看实时日志：
```
[Worker] 🔍 开始调用适配器函数 matchLPDEFContent
[Adapter] 🔍 开始匹配维度，输入
[Adapter] ✅ 维度 L 匹配成功
...
[Worker] ✅ 详细统计数据已生成（最终）
[Worker] 🔍 Payload 数据验证
[Supabase] ✅ 数据已成功写入
```

### 检查数据库

在 Supabase SQL Editor 中查询：
```sql
-- 检查最新记录
SELECT 
  fingerprint,
  l_score,
  p_score,
  d_score,
  e_score,
  f_score,
  personality_data,
  personality->>'detailedStats' as personality_detailed_stats
FROM user_analysis
ORDER BY updated_at DESC
LIMIT 1;

-- 检查 personality_data 字段
SELECT 
  fingerprint,
  jsonb_array_length(personality_data) as personality_data_length,
  personality_data
FROM user_analysis
WHERE personality_data IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;
```

## 修复建议

如果数据确实没有传入，请检查：

1. **确认适配器函数被调用**：查看日志中是否有 `[Worker] 🔍 开始调用适配器函数` 的输出
2. **确认适配器函数返回数据**：查看日志中是否有 `[Adapter] ✅ 维度 X 匹配成功` 的输出
3. **确认数据传递到 payload**：查看日志中是否有 `[Worker] 🔍 Payload 数据验证` 的输出
4. **确认 Supabase 上传成功**：查看日志中是否有 `[Supabase] ✅ 数据已成功写入` 的输出

如果以上步骤都正常，但数据库中仍然没有数据，可能是：
- 数据库字段名不匹配
- 数据格式问题
- Supabase 权限问题

请根据日志输出定位具体问题。
