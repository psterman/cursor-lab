export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";

    try {
      // --- 路由 0：存活检查 & 状态 ---
      if (url.pathname === "/" || url.pathname === "") {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
          headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` }
        });
        const data = await res.json();
        return new Response(JSON.stringify({ 
          status: "success", 
          totalUsers: data[0]?.total_count || 0,
          message: "Cursor Vibe API is active" 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 路由 1：答案之书 (D1) ---
      if (url.pathname === "/api/random_prompt") {
        const langParam = url.searchParams.get("lang") || "cn";
        const lang = ["en", "en-US", "en-GB"].includes(langParam) ? "en" : "cn";
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(lang).first();
        return new Response(JSON.stringify({ data: result, status: "success" }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // --- 路由 2：分析与多维排名 (Supabase) ---
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const body = await request.json();
        
        // 1. 数据深度挖掘 (兼容扁平化及嵌套结构)
        const sources = [body, body.statistics || {}, body.metadata || {}, body.stats || {}];
        const findVal = (keys) => {
          for (const source of sources) {
            for (const key of keys) {
              if (source[key] !== undefined && source[key] !== null) return Number(source[key]);
            }
          }
          return 0;
        };

        // 指标映射
        const ketao = findVal(['ketao', 'buCount', 'qingCount', 'politeCount']); 
        const jiafang = findVal(['jiafang', 'buCount', 'negationCount']);
        const totalChars = findVal(['totalUserChars', 'totalChars', 'total_user_chars']);
        const userMessages = findVal(['userMessages', 'totalMessages', 'user_messages', 'messageCount']);
        const avgLength = findVal(['avgMessageLength', 'avgUserMessageLength', 'avg_length']);
        const days = findVal(['usageDays', 'days', 'workDays']);

        const dimensions = body.dimensions || body.stats?.dimensions || {};
        const vibeIndex = String(body.vibeIndex || body.stats?.vibeIndex || "00000");
        const personality = body.personalityType || body.personality || "Unknown";

        // 生成 Hash ID
        const msgUint8 = new TextEncoder().encode(clientIP);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // 2. 写入 Supabase
        const payload = {
          user_identity: userIdentity,
          user_messages: userMessages,
          total_user_chars: totalChars,
          days: days,
          jiafang: jiafang,
          ketao: ketao,
          feihua: totalChars, 
          avg_length: avgLength,
          vibe_index: vibeIndex,
          personality: personality,
          dimensions: dimensions,
          metadata: { ...body.metadata, ...body.statistics },
          updated_at: new Date().toISOString()
        };

        await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });

        // 3. 并行计算排名
        const totalUsersRes = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` }
        });
        const totalData = await totalUsersRes.json();
        const totalUsers = totalData[0]?.total_count || 1;

        const getRankCount = async (column, value) => {
           if (value <= 0) return 0;
           const res = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?${column}=lt.${value}&select=id`, {
             headers: { 
               'apikey': env.SUPABASE_KEY, 
               'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
               'Prefer': 'count=exact', 
               'Range': '0-0'
             }
           });
           return parseInt(res.headers.get('content-range')?.split('/')[1] || "0");
        };

        const [beatMsg, beatChar, beatDay, beatJia, beatKe, beatAvg] = await Promise.all([
            getRankCount('user_messages', userMessages),
            getRankCount('total_user_chars', totalChars),
            getRankCount('days', days),
            getRankCount('jiafang', jiafang),
            getRankCount('ketao', ketao),
            getRankCount('avg_length', avgLength)
        ]);

        const calcPct = (count) => Math.min(99, Math.floor((count / totalUsers) * 100));

        const ranks = {
            messageRank: calcPct(beatMsg),
            charRank: calcPct(beatChar),
            daysRank: calcPct(beatDay),
            jiafangRank: calcPct(beatJia),
            ketaoRank: calcPct(beatKe),
            avgRank: calcPct(beatAvg)
        };

        return new Response(JSON.stringify({ 
          status: "success", 
          totalUsers,
          rankPercent: ranks.messageRank, 
          defeated: beatMsg,
          ranks: ranks,
          stats: { userMessages, totalChars, days, jiafang, ketao, avgLength }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- 路由 3：全局平均值 (雷达图必备) ---
      if (url.pathname === "/api/global-average") {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
          headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` }
        });
        const data = await res.json();
        const row = data[0] || { total_count: 0, avg_l: 50, avg_p: 50, avg_d: 50, avg_e: 50, avg_f: 50 };

        return new Response(JSON.stringify({
          status: "success",
          totalUsers: parseInt(row.total_count),
          globalAverage: { L: row.avg_l, P: row.avg_p, D: row.avg_d, E: row.avg_e, F: row.avg_f }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, status: "error" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};