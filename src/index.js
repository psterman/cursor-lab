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

    try {
      // --- 功能 1：答案之书 (D1) ---
      if (url.pathname === "/api/random_prompt") {
        // 获取语言参数，默认为中文 (cn)
        const langParam = url.searchParams.get("lang") || "cn";
        // 确保语言参数有效，只接受 'cn' 或 'en'
        const lang = (langParam === "en") ? "en" : "cn";
        
        // 根据语言参数过滤数据：表名改为 answer_book，字段 note 映射为 author
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(lang).first();
        
        // 根据语言返回对应的空数据提示
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

        // 3. 计算排名 (使用 total_users 的 value 作为总人数，而不是 allStats.length)
        const rankings = calculateRankings(statsEntry, allStats, count);

        return new Response(JSON.stringify({ 
          value: count, 
          status: "success", 
          rankings: rankings 
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

// 排名计算逻辑 (与 work.js 保持同步)
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
    
    // 处理并列排名
    let rank = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if ((sorted[i][metric] || 0) === userValue) {
        rank = i + 1;
      } else {
        break;
      }
    }
    
    results[metric] = { rank, total };
  });
  
  return results;
}