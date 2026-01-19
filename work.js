export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 1. 处理跨域预检
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const key = "total_users";
    const userLockKey = `lock_${clientIP}`;
    const allStatsKey = "all_user_stats";

    try {
      // --- 【功能一：Answer Book (D1 数据库)】 ---
      
      // 路径：GET /api/random_prompt
      if (url.pathname === "/api/random_prompt") {
        // 【修正】变量名改为 prompts_library，表名改为 answer_book，note 映射为 author
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book ORDER BY RANDOM() LIMIT 1"
        ).first();
        
        return new Response(JSON.stringify(result || { content: "数据库是空的", author: "System" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- 【功能二：统计人数与排名 (KV 存储)】 ---

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));

        // 处理体检数据提交
        if (body.action === "submit_stats" && body.stats) {
          const userStats = body.stats;
          
          let allStatsStr = await env.STATS_STORE.get(allStatsKey);
          let allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
          
          const statsEntry = {
            ip: clientIP,
            ...userStats,
            submittedAt: Date.now()
          };

          const existingIndex = allStats.findIndex(s => s.ip === clientIP);
          if (existingIndex >= 0) allStats[existingIndex] = statsEntry;
          else allStats.push(statsEntry);

          await env.STATS_STORE.put(allStatsKey, JSON.stringify(allStats));

          // 增加总人数计数 (UV 统计) - 需要在计算排名前获取，以便传入正确的 totalUsers
          const alreadyCounted = await env.STATS_STORE.get(userLockKey);
          let countStr = await env.STATS_STORE.get(key);
          let count = parseInt(countStr || "0");

          if (!alreadyCounted) {
            count += 1;
            await env.STATS_STORE.put(key, count.toString());
            await env.STATS_STORE.put(userLockKey, "true", { expirationTtl: 86400 });
          }

          // 计算排名 (使用 total_users 的 value 作为总人数，而不是 allStats.length)
          const rankings = calculateRankings(statsEntry, allStats, count);

          return new Response(JSON.stringify({ 
            value: count, 
            status: "success",
            rankings: rankings
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // 默认 GET 请求：返回总人数统计
      let countStr = await env.STATS_STORE.get(key);
      return new Response(JSON.stringify({ value: parseInt(countStr || "0"), status: "success" }), {
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

// 排名计算辅助函数
// totalUsers: 使用 total_users 的 value，而不是 allStats.length
function calculateRankings(userStats, allStats, totalUsers = 0) {
  if (!allStats || allStats.length === 0) return {};
  // 使用 total_users 的 value 作为总人数，确保排名对比数据正确
  const total = totalUsers > 0 ? totalUsers : allStats.length;
  const metrics = ['qingCount', 'buCount', 'userMessages', 'totalUserChars', 'avgUserMessageLength', 'usageDays'];
  const results = {};
  
  metrics.forEach(metric => {
    const sorted = [...allStats].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const index = sorted.findIndex(s => s.ip === userStats.ip);
    const userValue = userStats[metric] || 0;
    let rank = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if ((sorted[i][metric] || 0) === userValue) rank = i + 1;
      else break;
    }
    results[metric] = { rank, total };
  });
  return results;
}