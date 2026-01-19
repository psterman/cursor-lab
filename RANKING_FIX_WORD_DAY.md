# 修复 word.json 和 day.json 排名文字说明不显示问题

## 问题描述

全网横向排名区域的"平均长度排名"（word.json）和"上岗天数排名"（day.json）没有加载文字版说明，只显示排名数字。

## 问题原因

`getRankingComment` 函数在匹配 range 格式时有问题：

1. **day.json** 的最后一个 range 是 `"181+"` 而不是 `"181+天"`
2. **word.json** 的最后一个 range 是 `"1001+"` 而不是 `"1001+字"`

之前的正则表达式匹配逻辑只检查 `range.includes('天')` 或 `range.includes('字')`，导致 `"181+"` 和 `"1001+"` 无法被正确识别。

## 修复内容

### 1. 修复 day.json 匹配逻辑

```javascript
// 修复前
else if (range.includes('天')) {
    if (range === '181+') {
        if (rankPercent <= 20) matched = true;
    }
    // ...
}

// 修复后
else if (range.includes('天') || range === '181+') {
    if (range === '181+' || range === '181+天') {
        if (rankPercent <= 20) matched = true;
    }
    // ...
}
```

### 2. 修复 word.json 匹配逻辑

```javascript
// 修复前
else if (range === '1001+' || (range.includes('字') && (range.includes('1001') || ...))) {
    // 这个条件太复杂，包含了不必要的检查
}

// 修复后
else if (range === '1001+' || range === '1001+字' || (range.includes('字') && (range.includes('501-1000') || range.includes('201-500') || range.includes('51-200') || range.includes('1-50')))) {
    if (range === '1001+' || range === '1001+字') {
        if (rankPercent <= 20) matched = true;
    }
    // ...
}
```

### 3. 添加调试日志

在 `getRankingComment` 函数中添加了详细的调试日志，方便追踪匹配过程：

```javascript
console.log('[getRankingComment] 开始匹配:', {
    rank, 
    total, 
    percent: percent.toFixed(1) + '%',
    rankPercent: rankPercent.toFixed(1) + '%',
    lang,
    hasLevels: !!data.levels,
    levelsCount: data.levels?.length
});

// 匹配成功时
console.log(`[getRankingComment] 匹配成功:`, {
    range: range,
    rank: rank,
    total: total,
    rankPercent: rankPercent.toFixed(1) + '%',
    title: randomComment.title,
    content: randomComment.content?.substring(0, 50) + '...'
});

// 未找到匹配时
console.warn('[getRankingComment] 未找到匹配的level:', {
    rank,
    total,
    rankPercent: rankPercent.toFixed(1) + '%',
    levels: data.levels?.map(l => l.range)
});
```

## 测试方法

1. 刷新页面，重新生成报告
2. 查看"全网横向排名"区域的六个卡片
3. 确认"平均长度排名"和"上岗天数排名"显示了文字说明（如"短促电击"、"新官上任"等）
4. 打开浏览器控制台，查看 `[getRankingComment]` 日志，确认匹配成功

## 排名百分比说明

排名数据基于 `total_users` 的 `value`（总测试人数），而不是 `allStats.length`（实际提交统计数据的用户数）。

### 排名百分比分段（day.json 和 word.json）：

- **前 20%**：最高level（181+天、1001+字）
- **20-40%**：第二level（91-180天、501-1000字）
- **40-60%**：第三level（31-90天、201-500字）
- **60-80%**：第四level（8-30天、51-200字）
- **80-100%**：最低level（1-7天、1-50字）

## 相关文件

- `index.html` - 修复了 `getRankingComment` 函数
- `src/word.json` - 平均长度排名数据
- `src/day.json` - 上岗天数排名数据
- `src/index.js` - Cloudflare Worker（已修复排名计算）
- `work.js` - 本地测试版 Worker（已修复排名计算）

## 提交信息

```bash
git add index.html
git commit -m "fix: 修复 word.json 和 day.json 排名文字说明不显示的问题

- 修复 getRankingComment 中 day.json 的 '181+' 匹配逻辑
- 修复 getRankingComment 中 word.json 的 '1001+' 匹配逻辑
- 添加详细的调试日志，方便追踪匹配过程
- 确保所有排名卡片都能正确显示文字说明"
```

## 注意事项

1. 确保已经部署最新的 `src/index.js` 到 Cloudflare Worker
2. 如果排名数据仍然不显示，检查浏览器控制台的日志输出
3. 排名计算使用的是 `rankPercent = (rank / total) * 100`，而不是 `percent = ((total - rank + 1) / total * 100)`
