# 排名功能调试指南

## 🔍 问题排查步骤

### 步骤 1：检查 Cloudflare Worker 是否已更新

**最重要**：排名功能需要 Cloudflare Worker 支持 `submit_stats` 动作。

1. 打开浏览器开发者工具（F12）
2. 切换到 **Console（控制台）** 标签
3. 刷新页面并生成报告
4. 查看控制台日志，寻找以下信息：

```
[React] 准备上传统计数据: {...}
[React] POST 请求成功，计数值和排名已更新: {...}
```

如果看到 `rankings: undefined`，说明 Worker 还没有更新。

### 步骤 2：检查 API 响应

在浏览器控制台运行以下代码，检查 API 是否返回排名数据：

```javascript
// 测试上传统计数据
fetch('https://cursor-clinical-analysis.psterman.workers.dev/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        action: 'submit_stats',
        stats: {
            qingCount: 153,
            buCount: 285,
            userMessages: 882,
            totalUserChars: 267000,
            avgUserMessageLength: 302,
            usageDays: 99,
            timestamp: Date.now()
        }
    })
})
.then(res => res.json())
.then(data => {
    console.log('✅ API 响应:', data);
    console.log('📊 排名数据:', data.rankings);
    
    if (data.rankings) {
        console.log('✅ 排名数据存在！');
        console.log('赛博磕头排名:', data.rankings.qingCount);
        console.log('甲方上身排名:', data.rankings.buCount);
    } else {
        console.error('❌ API 没有返回排名数据！');
        console.log('可能原因：');
        console.log('1. Cloudflare Worker 代码未更新');
        console.log('2. Worker 代码有错误');
        console.log('3. 请检查 Worker 日志');
    }
})
.catch(error => {
    console.error('❌ 请求失败:', error);
});
```

### 步骤 3：检查 DOM 元素

确认排名徽章元素是否存在：

```javascript
// 检查排名徽章元素
const badges = [
    'rankingQingCountBadge',
    'rankingBuCountBadge',
    'rankingUserMessagesBadge',
    'rankingTotalCharsBadge',
    'rankingAvgLengthBadge',
    'rankingUsageDaysBadge'
];

badges.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        console.log(`✅ ${id} 存在:`, el.textContent);
    } else {
        console.error(`❌ ${id} 不存在！`);
    }
});
```

### 步骤 4：手动触发排名更新

如果排名数据已保存但未显示，可以手动触发更新：

```javascript
// 检查是否有排名数据
if (window.userRankings) {
    console.log('✅ 排名数据存在:', window.userRankings);
    
    // 手动更新排名徽章
    const updateRankingBadges = (rankings) => {
        if (!rankings) return;
        
        const updateBadge = (badgeId, rank, total) => {
            const badge = document.getElementById(badgeId);
            if (!badge) {
                console.warn(`⚠️ 未找到元素: ${badgeId}`);
                return;
            }
            
            if (rank !== null && rank !== undefined && total > 0) {
                const percent = ((total - rank + 1) / total * 100).toFixed(1);
                badge.textContent = `#${rank} (前${percent}%)`;
                badge.classList.add('has-rank');
                console.log(`✅ ${badgeId} 已更新: #${rank} (前${percent}%)`);
            } else {
                badge.textContent = '--';
                badge.classList.remove('has-rank');
            }
        };
        
        updateBadge('rankingQingCountBadge', rankings.qingCount?.rank, rankings.qingCount?.total);
        updateBadge('rankingBuCountBadge', rankings.buCount?.rank, rankings.buCount?.total);
        updateBadge('rankingUserMessagesBadge', rankings.userMessages?.rank, rankings.userMessages?.total);
        updateBadge('rankingTotalCharsBadge', rankings.totalUserChars?.rank, rankings.totalUserChars?.total);
        updateBadge('rankingAvgLengthBadge', rankings.avgUserMessageLength?.rank, rankings.avgUserMessageLength?.total);
        updateBadge('rankingUsageDaysBadge', rankings.usageDays?.rank, rankings.usageDays?.total);
    };
    
    updateRankingBadges(window.userRankings);
} else {
    console.error('❌ 未找到排名数据！');
    console.log('请确保：');
    console.log('1. 已更新 Cloudflare Worker 代码');
    console.log('2. 已生成报告并上传统计数据');
    console.log('3. API 返回了 rankings 字段');
}
```

## 🛠️ 常见问题及解决方案

### 问题 1：排名显示为 `--`

**原因**：
- Cloudflare Worker 代码未更新
- API 没有返回 `rankings` 字段
- 排名数据格式不正确

**解决方案**：
1. 按照 `CLOUDFLARE_WORKER_RANKING.md` 更新 Worker 代码
2. 检查浏览器控制台的 API 响应
3. 确认 Worker 代码中的 `calculateRankings` 函数正常工作

### 问题 2：API 返回错误

**可能错误**：
- `500 Internal Server Error` - Worker 代码有错误
- `400 Bad Request` - 请求格式不正确
- CORS 错误 - Worker CORS 配置问题

**解决方案**：
1. 检查 Cloudflare Dashboard 中的 Worker 日志
2. 确认 Worker 代码语法正确
3. 检查 KV 命名空间绑定是否正确

### 问题 3：排名数据存在但不显示

**原因**：
- DOM 元素还未创建
- 更新函数执行时机不对

**解决方案**：
1. 使用上面的手动更新代码
2. 检查控制台是否有错误信息
3. 确认 Dashboard 已完全渲染

### 问题 4：排名计算不正确

**原因**：
- 统计数据格式不匹配
- 排名算法有误

**解决方案**：
1. 检查上传统计数据的格式
2. 查看 Worker 代码中的 `calculateRankings` 函数
3. 确认排序逻辑正确

## 📋 检查清单

在报告问题前，请确认：

- [ ] Cloudflare Worker 代码已更新（参考 `CLOUDFLARE_WORKER_RANKING.md`）
- [ ] Worker 已成功部署（看到 "Successfully deployed"）
- [ ] KV 命名空间 `STATS_STORE` 已正确绑定
- [ ] 浏览器控制台没有错误信息
- [ ] API 请求返回了 `rankings` 字段
- [ ] DOM 元素（排名徽章）已创建
- [ ] 已生成报告并上传统计数据

## 🔧 快速修复

如果所有检查都通过但排名仍不显示，尝试：

```javascript
// 1. 清除缓存并重新加载
localStorage.clear();
location.reload();

// 2. 强制更新排名（在 Dashboard 页面运行）
if (window.userRankings) {
    // 使用页面中的 updateRankingBadges 函数
    // 或者使用上面提供的手动更新代码
}
```

## 📞 获取帮助

如果问题仍未解决，请提供：

1. 浏览器控制台的完整日志
2. Network 标签中 API 请求的响应内容
3. Cloudflare Worker 的日志（如果有）
4. 截图显示问题
