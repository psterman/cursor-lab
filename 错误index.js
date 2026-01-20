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

    try {
      // --- 功能 1：答案之书 (保持不变) ---
      if (url.pathname === "/api/random_prompt") {
        const langParam = url.searchParams.get("lang") || "cn";
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(langParam.includes('en') ? 'en' : 'cn').first();
        return new Response(JSON.stringify({ data: result, status: "success" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 功能 2：分析数据上传与统计 ---
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const stats = await request.json();
        
        // 生成唯一 ID
        const msgUint8 = new TextEncoder().encode(clientIP);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // KV 锁逻辑
        const kvLockKey = `lock_v3:${userIdentity}`;
        let alreadyInKV = false;
        if (env.STATS_STORE) {
          const lock = await env.STATS_STORE.get(kvLockKey);
          if (lock) alreadyInKV = true;
        }

        if (!alreadyInKV) {
          const payload = {
            user_identity: userIdentity, // 建议使用这个作为唯一键
            user_messages: parseInt(stats.totalMessages) || 0,
            total_user_chars: parseInt(stats.totalChars) || 0,
            vibe_index: String(stats.vibeIndex || "0"),
            personality: stats.personality || stats.personalityType || "Unknown",
            dimensions: stats.dimensions || {},
            updated_at: new Date().toISOString()
          };

          // 使用真正原子化的 UPSERT
          const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates' // 关键：如果 user_identity 重复则覆盖
            },
            body: JSON.stringify(payload)
          });

          if (dbRes.ok && env.STATS_STORE) {
            await env.STATS_STORE.put(kvLockKey, "true", { expirationTtl: 86400 });
          }
        }

        // --- 核心修复：统计逻辑 ---
        // 不再使用 Range: 0-0，直接请求 count=exact
        const [totalRes, rankRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact' }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact' }
          })
        ]);

        const totalUsers = parseInt(totalRes.headers.get('content-range')?.split('/')[1]) || 0;
        const defeated = parseInt(rankRes.headers.get('content-range')?.split('/')[1]) || 0;
        
        // 即使数据库只有你自己，totalUsers 也应该是 1
        const displayTotal = totalUsers === 0 ? 1 : totalUsers;
        const rankPercent = Math.min(99, Math.max(1, Math.round((defeated / displayTotal) * 100)));

        return new Response(JSON.stringify({
          status: "success",
          rankPercent: rankPercent,
          ranking: rankPercent,
          totalUsers: displayTotal,
          defeated: defeated
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 默认根路径：获取总数 ---
      const countRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
        headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact' }
      });
      const total = parseInt(countRes.headers.get('content-range')?.split('/')[1]) || 0;
      return new Response(JSON.stringify({ status: "success", totalUsers: total, value: total }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, status: "error" }), { status: 500, headers: corsHeaders });
    }
  }
};