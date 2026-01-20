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
      // --- 功能 1：答案之书 (D1) ---
      if (url.pathname === "/api/random_prompt") {
        const langParam = url.searchParams.get("lang") || "cn";
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(langParam === "en" ? "en" : "cn").first();
        return new Response(JSON.stringify({ data: result, status: "success" }), { headers: corsHeaders });
      }

      // --- 功能 2：分析上传 (核心逻辑) ---
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const stats = await request.json();

        // A. 生成唯一标识 (基于 IP)
        const msgUint8 = new TextEncoder().encode(clientIP);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const kvKey = `lock_v2:${userIdentity}`;
        let alreadySubmitted = false;

        // B. KV 去重检查 (第一道防线)
        if (env.STATS_STORE) {
          const lock = await env.STATS_STORE.get(kvKey);
          if (lock) alreadySubmitted = true;
        }

        // C. 写入数据 (如果未提交)
        if (!alreadySubmitted) {
          const payload = {
            user_identity: userIdentity,
            qing_count: parseInt(stats.qingCount) || 0,
            bu_count: parseInt(stats.buCount) || 0,
            user_messages: parseInt(stats.totalMessages) || 0, // 字段对齐
            total_user_chars: parseInt(stats.totalChars) || 0, // 字段对齐
            avg_message_length: parseFloat(stats.avgMessageLength) || 0,
            usage_days: parseInt(stats.usageDays) || 0,
            personality: stats.personality || stats.personalityType || "Unknown",
            dimensions: stats.dimensions || {},
            vibe_index: String(stats.vibeIndex || "00000"),
            updated_at: new Date().toISOString()
          };

          const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates' 
            },
            body: JSON.stringify(payload)
          });

          // 写入成功后才锁定 KV
          if (dbRes.ok && env.STATS_STORE) {
            await env.STATS_STORE.put(kvKey, "true", { expirationTtl: 86400 });
          }
        }

        // D. 获取排名 (计算逻辑)
        const [totalRes, rankRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' }
          })
        ]);

        const totalUsers = parseInt(totalRes.headers.get('content-range')?.split('/')[1]) || 1;
        const lessThanCount = parseInt(rankRes.headers.get('content-range')?.split('/')[1]) || 0;
        const rankValue = Math.min(99, Math.max(1, Math.round((lessThanCount / totalUsers) * 100)));

        return new Response(JSON.stringify({
          status: "success",
          rankPercent: rankValue,
          ranking: rankValue, // 兼容 main.js
          totalUsers: totalUsers,
          action: alreadySubmitted ? "skipped" : "inserted"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 功能 3：全局统计 (GET) ---
      const globalRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
        headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' }
      });
      const total = parseInt(globalRes.headers.get('content-range')?.split('/')[1]) || 0;

      return new Response(JSON.stringify({ status: "success", totalUsers: total }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({ status: "error", message: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};