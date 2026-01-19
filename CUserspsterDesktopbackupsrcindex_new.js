export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const key = "total_users";
    const userLockKey = `lock_${clientIP}`;
    const allStatsKey = "all_user_stats";
    const usageDaysLeaderboardKey = "usage_days_leaderboard";

    try {
      // --- 功能 1：答案之书 (D1) ---
      if (url.pathname === "/api/random_prompt") {
        const langParam = url.searchParams.get("lang") || "cn";
        const lang = (langParam === "en") ? "en" : "cn";
        
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(lang).first();
        
        const emptyMessage = lang === "en" 
          ? "Database is empty" 
          : "数据库是空的";
        
        return new Response(JSON.stringify(result || { content: emptyMessage, author: "System" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- 功能 2：提交体检数据并更新统计 (KV) ---
      if (request.method === "POST" && url.pathname === "/api/submit_stats") {
        const body = await request.json().catch(() => ({}));
        
        // 1. 更新总人数 (UV 统计)
        const alreadyCounted = await env.STATS_STORE.get(userLockKey);
        const currentCountStr = await env.STATS_STORE.get(key) || "0";
        let count = parseInt(currentCountStr);
        
        if (!alreadyCounted) {
          count += 1;
          await env.STATS_STORE.put(key, count.toString());
          await env.STATS_STORE.put(userLockKey, "true", { expirationTtl: 86400 });
        }

        // 2. 记录详细统计数据 (用于排名)
        const allStatsStr = await env.STATS_STORE.get(allStatsKey);
        let allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
        
        const statsEntry = { 
          ip: clientIP, 
          ...body.stats, 
          submittedAt: Date.now() 
        };
        
        // 更新或新增记录
        const existingIndex = allStats.findIndex(s => s.ip === clientIP);
        if (existingIndex >= 0) {
          allStats[existingIndex] = statsEntry;
        } else {
          allStats.push(statsEntry);
        }
        
        // 限制存储条数
        if (allStats.length > 1000) allStats.shift();
        await env.STATS_STORE.put(allStatsKey, JSON.stringify(allStats));

        // 3. 更新上岗天数排行榜
        const leaderboardStr = await env.STATS_STORE.get(usageDaysLeaderboardKey);
        let leaderboard = leaderboardStr ? JSON.parse(leaderboardStr) : [];
        
        // 查找当前用户是否在排行榜中
        const userInLeaderboard = leaderboard.find(u => u.ip === clientIP);
        if (userInLeaderboard) {
          // 更新用户的上岗天数
          userInLeaderboard.usageDays = statsEntry.usageDays || 0;
          userInLeaderboard.submittedAt = Date.now();
        } else {
          // 添加新用户到排行榜
          leaderboard.push({
            ip: clientIP,
            usageDays: statsEntry.usageDays || 0,
            submittedAt: Date.now()
          });
        }
        
        // 按上岗天数降序排序
        leaderboard.sort((a, b) => b.usageDays - a.usageDays);
        
        // 只保留前100名
        leaderboard = leaderboard.slice(0, 100);
        await env.STATS_STORE.put(usageDaysLeaderboardKey, JSON.stringify(leaderboard));

        // 4. 计算排名
        const rankings = calculateRankings(statsEntry, allStats, count, leaderboard, clientIP);

        return new Response(JSON.stringify({ 
          value: count, 
          status: "success", 
          rankings: rankings 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 功能 3：获取上岗天数排行榜 ---
      if (url.pathname === "/api/leaderboard") {
        const leaderboardStr = await env.STATS_STORE.get(usageDaysLeaderboardKey);
        const leaderboard = leaderboardStr ? JSON.parse(leaderboardStr) : [];
        
        return new Response(JSON.stringify({
          status: "success",
          leaderboard: leaderboard.slice(0, 20) // 返回前20名
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 默认：返回总人数 ---
      const total = await env.STATS_STORE.get(key) || "0";
      return new Response(JSON.stringify({ value: parseInt(total), status: "success" }), { 
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

// 增强的排名计算逻辑
function calculateRankings(userStats, allStats, totalUsers = 0, leaderboard = [], clientIP = "") {
  if (!allStats || allStats.length === 0) return {};
  
  const total = totalUsers > 0 ? totalUsers : allStats.length;
  const metrics = ['qingCount', 'buCount', 'userMessages', 'totalUserChars', 'avgUserMessageLength', 'usageDays'];
  const results = {};
  
  metrics.forEach(metric => {
    const sorted = [...allStats].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const index = sorted.findIndex(s => s.ip === clientIP);
    const userValue = userStats[metric] || 0;
    
    // 处理并列排名
    let rank = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if ((sorted[i][metric] || 0) === userValue) {
        rank = i + 1;
      } else {
        break;
      }
    }
    
    const beatenCount = total - rank;
    const percent = ((total - rank + 1) / total * 100).toFixed(1);
    
    results[metric] = { 
      rank, 
      total,
      beatenCount,        // 击败了多少人
      percent,            // 超过的百分比
      yourValue: userValue // 你的具体数值
    };
  });
  
  // 如果有排行榜数据，添加详细信息
  if (leaderboard.length > 0) {
    const userRankIndex = leaderboard.findIndex(u => u.ip === clientIP);
    const userLeaderboardData = leaderboard[userRankIndex] || {};
    
    results.usageDays = {
      ...results.usageDays,
      leaderboard: leaderboard.slice(0, 10), // 前10名
      yourPosition: userRankIndex >= 0 ? userRankIndex + 1 : null,
      comparedToTop: userLeaderboardData.usageDays ? {
        difference: userLeaderboardData.usageDays - (userStats.usageDays || 0),
        topUserDays: leaderboard[0]?.usageDays || 0
      } : null
    };
  }
  
  return results;
}
