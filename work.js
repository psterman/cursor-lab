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

        // ✅ 修复 1：正确的字段映射，避免冲突
        // 赛博磕头 (ketao)：优先查找 qingCount，避免误用 buCount
        const ketao = findVal(['ketao', 'qingCount', 'politeCount']); 
        // 甲方上身 (jiafang)：优先查找 buCount 和 negationCount
        const jiafang = findVal(['jiafang', 'buCount', 'negationCount']);
        const totalChars = findVal(['totalUserChars', 'totalChars', 'total_user_chars']);
        const userMessages = findVal(['userMessages', 'totalMessages', 'user_messages', 'messageCount']);
        const avgLength = findVal(['avgMessageLength', 'avgUserMessageLength', 'avg_length']);
        const days = findVal(['usageDays', 'days', 'workDays']);

        const dimensions = body.dimensions || body.stats?.dimensions || {};
        const vibeIndex = String(body.vibeIndex || body.stats?.vibeIndex || "00000");
        const personality = body.personalityType || body.personality || "Unknown";

        // ✅ 修复 2：用户身份指纹优化
        // 优先使用前端传递的 deviceId（稳定），如果没有则使用文件内容哈希
        // 这样同一设备/文件在不同环境下能保持一致的 ID
        let userIdentity;
        if (body.deviceId) {
          // 使用前端生成的设备指纹（最稳定）
          const msgUint8 = new TextEncoder().encode(body.deviceId);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
          userIdentity = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          // 降级方案：使用文件内容的稳定特征（不包含会变化的 days）
          // 使用 userMessages 和 totalChars 作为稳定标识
          const signature = `${userMessages}_${totalChars}`;
          const msgUint8 = new TextEncoder().encode(signature);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
          userIdentity = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        }

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

        // ✅ 修复 3：添加错误处理和日志
        const writeRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });

        if (!writeRes.ok) {
          const errorText = await writeRes.text().catch(() => '无法读取错误信息');
          console.error('[Worker] ❌ 数据库写入失败:', {
            status: writeRes.status,
            statusText: writeRes.statusText,
            error: errorText,
            userIdentity: userIdentity,
            payload: payload
          });
          // 不抛出错误，继续执行排名查询（使用现有数据）
        } else {
          const writeData = await writeRes.json().catch(() => null);
          console.log('[Worker] ✅ 数据写入成功:', {
            userIdentity: userIdentity,
            method: Array.isArray(writeData) && writeData.length > 0 ? 'UPDATE' : 'INSERT'
          });
        }

        // 3. 并行计算排名 + 获取全局平均值（雷达图需要）
        const [totalUsersRes, globalRes] = await Promise.all([
          // 获取总人数
          fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` }
          }),
          // 获取全网平均分 (L, P, D, E, F) - 雷达图需要
          fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
            headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` }
          })
        ]);
        
        const totalData = await totalUsersRes.json();
        const globalData = await globalRes.json();
        const totalUsers = totalData[0]?.total_count || 1;
        const gRow = globalData[0] || {}; // 全网平均数据行

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

        // ✅ 修复 4：返回完整数据包，包含 globalAverage 和兼容字段
        return new Response(JSON.stringify({ 
          status: "success", 
          success: true,  // 兼容字段
          totalUsers: totalUsers,
          ranking: beatMsg,              // 兼容字段（实际排名数字）
          rankPercent: ranks.messageRank, // 主排名百分比
          defeated: beatMsg,
          ranks: ranks,                  // 详细维度排名（六个排名）
          // ✅ 关键修复：返回全局平均值（雷达图需要）
          globalAverage: {
            L: parseFloat(gRow.avg_l || 50),
            P: parseFloat(gRow.avg_p || 50),
            D: parseFloat(gRow.avg_d || 50),
            E: parseFloat(gRow.avg_e || 50),
            F: parseFloat(gRow.avg_f || 50)
          },
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
          success: true,  // 兼容字段
          totalUsers: parseInt(row.total_count || 0),
          globalAverage: { 
            L: parseFloat(row.avg_l || 50), 
            P: parseFloat(row.avg_p || 50), 
            D: parseFloat(row.avg_d || 50), 
            E: parseFloat(row.avg_e || 50), 
            F: parseFloat(row.avg_f || 50) 
          }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

    } catch (e) {
      // ✅ 修复 5：增强错误处理，包含更多调试信息
      console.error('[Worker] ❌ 请求处理异常:', {
        message: e.message,
        stack: e.stack,
        url: url.pathname,
        method: request.method,
        timestamp: new Date().toISOString()
      });
      
      return new Response(JSON.stringify({ 
        error: e.message, 
        status: "error",
        success: false,
        timestamp: new Date().toISOString()
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
