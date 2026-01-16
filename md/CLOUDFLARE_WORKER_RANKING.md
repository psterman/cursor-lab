# Cloudflare Worker 排名功能更新指南

## 📋 功能说明

新的 Worker 代码支持：
1. ✅ 存储每个用户的统计数据
2. ✅ 计算横向排名（基于各项指标）
3. ✅ 返回用户的排名信息
4. ✅ 保持原有的计数和重置功能

## 🔧 在 Cloudflare Dashboard 中更新 Worker 代码

### 步骤 1：登录并进入 Worker

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 找到你的 Worker：`cursor-clinical-analysis`
4. 点击 **"Quick Edit"** 或 **"Edit Code"**

### 步骤 2：替换完整代码

将以下完整代码复制并替换现有代码：

```javascript
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 处理预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const key = "total_users";
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const userLockKey = `lock_${clientIP}`;
    const statsKey = `stats_${clientIP}`; // 用户统计数据键
    const allStatsKey = "all_user_stats"; // 所有用户统计的列表键

    try {
      // --- 处理 POST 请求 ---
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        
        // 重置计数器
        if (body.action === "reset") {
          await env.STATS_STORE.delete(key);
          // 可选：清空所有用户统计
          // await env.STATS_STORE.delete(allStatsKey);
          
          return new Response(JSON.stringify({ 
            value: 0, 
            status: "reset_success",
            message: "计数器已重置为 0"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // 上传统计数据并计算排名
        if (body.action === "submit_stats" && body.stats) {
          const userStats = body.stats;
          
          // 1. 保存当前用户的统计数据
          await env.STATS_STORE.put(statsKey, JSON.stringify({
            ...userStats,
            ip: clientIP,
            submittedAt: Date.now()
          }));
          
          // 2. 获取所有用户统计（用于计算排名）
          let allStatsStr = await env.STATS_STORE.get(allStatsKey);
          let allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
          
          // 3. 更新或添加当前用户的统计
          const existingIndex = allStats.findIndex(s => s.ip === clientIP);
          const statsEntry = {
            ip: clientIP,
            qingCount: userStats.qingCount || 0,
            buCount: userStats.buCount || 0,
            userMessages: userStats.userMessages || 0,
            totalUserChars: userStats.totalUserChars || 0,
            avgUserMessageLength: userStats.avgUserMessageLength || 0,
            usageDays: userStats.usageDays || 0,
            submittedAt: Date.now()
          };
          
          if (existingIndex >= 0) {
            allStats[existingIndex] = statsEntry;
          } else {
            allStats.push(statsEntry);
          }
          
          // 4. 保存更新后的统计列表
          await env.STATS_STORE.put(allStatsKey, JSON.stringify(allStats));
          
          // 5. 计算排名
          const rankings = calculateRankings(statsEntry, allStats);
          
          // 6. 更新总用户数（如果首次提交）
          const alreadyCounted = await env.STATS_STORE.get(userLockKey);
          let countStr = await env.STATS_STORE.get(key);
          let count = countStr ? parseInt(countStr) : 0;
          
          let action = "skipped_duplicate";
          if (!alreadyCounted) {
            count += 1;
            await env.STATS_STORE.put(key, count.toString());
            await env.STATS_STORE.put(userLockKey, "true", { expirationTtl: 86400 });
            action = "incremented";
          }
          
          return new Response(JSON.stringify({ 
            value: count, 
            action,
            status: "success",
            rankings: rankings
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // 正常的计数增加（向后兼容）
        const alreadyCounted = await env.STATS_STORE.get(userLockKey);
        let countStr = await env.STATS_STORE.get(key);
        let count = countStr ? parseInt(countStr) : 0;

        let action = "skipped_duplicate";
        if (!alreadyCounted) {
          count += 1;
          await env.STATS_STORE.put(key, count.toString());
          await env.STATS_STORE.put(userLockKey, "true", { expirationTtl: 86400 });
          action = "incremented";
        }

        return new Response(JSON.stringify({ value: count, action }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- 处理 GET 请求 (获取总数) ---
      let countStr = await env.STATS_STORE.get(key);
      let count = countStr ? parseInt(countStr) : 0;

      return new Response(JSON.stringify({ value: count, status: "success" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

// 计算排名函数
function calculateRankings(userStats, allStats) {
  if (!allStats || allStats.length === 0) {
    return {
      qingCount: { rank: 1, total: 1 },
      buCount: { rank: 1, total: 1 },
      userMessages: { rank: 1, total: 1 },
      totalUserChars: { rank: 1, total: 1 },
      avgUserMessageLength: { rank: 1, total: 1 },
      usageDays: { rank: 1, total: 1 }
    };
  }
  
  const total = allStats.length;
  
  // 按各项指标排序（降序）
  const sortedByQing = [...allStats].sort((a, b) => (b.qingCount || 0) - (a.qingCount || 0));
  const sortedByBu = [...allStats].sort((a, b) => (b.buCount || 0) - (a.buCount || 0));
  const sortedByMessages = [...allStats].sort((a, b) => (b.userMessages || 0) - (a.userMessages || 0));
  const sortedByChars = [...allStats].sort((a, b) => (b.totalUserChars || 0) - (a.totalUserChars || 0));
  const sortedByAvgLength = [...allStats].sort((a, b) => (b.avgUserMessageLength || 0) - (a.avgUserMessageLength || 0));
  const sortedByDays = [...allStats].sort((a, b) => (b.usageDays || 0) - (a.usageDays || 0));
  
  // 查找当前用户的排名
  const findRank = (sorted, userIp, getValue) => {
    const index = sorted.findIndex(s => s.ip === userIp);
    if (index === -1) return null;
    
    // 处理并列排名（相同值排名相同）
    const userValue = getValue(sorted[index]);
    let rank = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if (getValue(sorted[i]) === userValue) {
        rank = i + 1;
      } else {
        break;
      }
    }
    return rank;
  };
  
  return {
    qingCount: {
      rank: findRank(sortedByQing, userStats.ip, s => s.qingCount || 0),
      total: total
    },
    buCount: {
      rank: findRank(sortedByBu, userStats.ip, s => s.buCount || 0),
      total: total
    },
    userMessages: {
      rank: findRank(sortedByMessages, userStats.ip, s => s.userMessages || 0),
      total: total
    },
    totalUserChars: {
      rank: findRank(sortedByChars, userStats.ip, s => s.totalUserChars || 0),
      total: total
    },
    avgUserMessageLength: {
      rank: findRank(sortedByAvgLength, userStats.ip, s => s.avgUserMessageLength || 0),
      total: total
    },
    usageDays: {
      rank: findRank(sortedByDays, userStats.ip, s => s.usageDays || 0),
      total: total
    }
  };
}
```

### 步骤 3：保存并部署

1. 点击编辑器右上角的 **"Save and Deploy"** 按钮
2. 等待部署完成
3. 看到 "Successfully deployed" 提示即表示部署成功

## 📊 排名计算说明

### 排名指标

1. **赛博磕头排名**：基于 `qingCount`（"请"字次数）
2. **甲方上身排名**：基于 `buCount`（"不"字次数）
3. **调戏AI排名**：基于 `userMessages`（用户消息数）
4. **废话输出排名**：基于 `totalUserChars`（总字符数）
5. **平均长度排名**：基于 `avgUserMessageLength`（平均消息长度）
6. **上岗天数排名**：基于 `usageDays`（使用天数）

### 排名规则

- 排名按数值**从高到低**排序
- 相同数值的用户**并列排名**（排名相同）
- 排名从 1 开始（1 表示最高）
- 返回格式：`{ rank: 排名, total: 总人数 }`

### 前端显示

- 排名显示为：`#排名`（如 `#5` 表示第 5 名）
- 百分比显示为：`前 X%`（如 `前 10%` 表示超过 90% 的用户）

## 🔍 测试排名功能

### 测试 1：上传统计数据

在浏览器控制台运行：

```javascript
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
    console.log('✅ 统计数据已提交:', data);
    console.log('📊 排名信息:', data.rankings);
})
.catch(error => {
    console.error('❌ 提交失败:', error);
});
```

### 测试 2：查看排名

提交后，检查返回的 `rankings` 对象：

```javascript
{
    qingCount: { rank: 5, total: 100 },      // 赛博磕头排名第 5，共 100 人
    buCount: { rank: 3, total: 100 },        // 甲方上身排名第 3
    userMessages: { rank: 10, total: 100 },   // 调戏AI排名第 10
    // ... 其他排名
}
```

## ⚠️ 注意事项

1. **数据存储**：
   - 每个用户的统计数据存储在 `stats_{IP}` 键中
   - 所有用户统计列表存储在 `all_user_stats` 键中
   - KV 存储有大小限制，如果用户过多可能需要优化

2. **性能考虑**：
   - 排名计算在每次提交时进行
   - 如果用户数量很大（>1000），可能需要优化算法
   - 可以考虑定期清理旧数据

3. **数据隐私**：
   - 使用 IP 地址作为用户标识
   - 统计数据不包含敏感信息
   - 可以根据需要添加匿名化处理

## 🆘 常见问题

### Q: 排名不更新？
A: 检查浏览器控制台的错误信息，确认 API 请求是否成功

### Q: 排名显示为 "--"？
A: 可能是首次提交，或者 API 尚未返回排名数据

### Q: 如何重置所有排名？
A: 在 Cloudflare Dashboard 中删除 `all_user_stats` 键

## 📝 总结

更新 Worker 代码后：
- ✅ 用户生成报告时会自动上传统计数据
- ✅ Worker 会计算并返回排名信息
- ✅ 前端会显示横向排名卡片
- ✅ 保持原有的计数和重置功能
