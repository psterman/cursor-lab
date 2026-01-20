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
      // --- 功能 1：答案之书 (保留原有 D1 逻辑) ---
      if (url.pathname === "/api/random_prompt") {
        const langParam = url.searchParams.get("lang") || "cn";
        const lang = (langParam === "en") ? "en" : "cn";
        const result = await env.prompts_library.prepare(
          "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
        ).bind(lang).first();
        return new Response(JSON.stringify({ data: result, status: "success" }), { headers: corsHeaders });
      }

      // --- 功能 2：分析数据上传并获取即时排名 (改进版：双重去重控制) ---
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const stats = await request.json();

        // 生成用户标识 Hash（基于 IP + 时间戳的日期部分，确保同一天内同一用户只计算一次）
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const identityString = `${clientIP}-${today}`;
        const msgUint8 = new TextEncoder().encode(identityString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // 【第一层去重：Cloudflare KV 快速检查】
        // 检查该用户今天是否已经提交过（24小时过期）
        const kvLockKey = `user_submit_lock:${userIdentity}`;
        const alreadySubmitted = await env.STATS_STORE?.get(kvLockKey);
        
        if (alreadySubmitted) {
          // 用户今天已提交过，直接返回现有排名，不重复插入数据库
          console.log(`[Worker] 用户 ${userIdentity} 今天已提交过，跳过重复提交`);
          
          // 查询现有排名
          const [totalRes, rankRes] = await Promise.all([
            fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
                'Range-Unit': 'items', 
                'Range': '0-0' 
              }
            }),
            fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=count`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
                'Range-Unit': 'items', 
                'Range': '0-0' 
              }
            })
          ]);

          const totalCount = parseInt(totalRes.headers.get('content-range')?.split('/')[1]) || 1;
          const lessThanCount = parseInt(rankRes.headers.get('content-range')?.split('/')[1]) || 0;
          const rankPercent = Math.min(99.9, Math.max(1, Math.round((lessThanCount / totalCount) * 100)));

          return new Response(JSON.stringify({
            status: "success",
            rankPercent: rankPercent,
            totalUsers: totalCount,
            action: "skipped_duplicate" // 标识这是重复提交
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 【第二层去重：Supabase UPSERT】
        // 使用 PATCH 方法实现真正的 UPSERT（需要 user_identity 字段有唯一约束）
        // 如果表有唯一约束，使用 POST + Prefer: resolution=merge-duplicates
        // 如果没有唯一约束，先查询再决定 INSERT 或 UPDATE
        
        try {
          // 方法1：尝试使用 UPSERT（如果表有唯一约束）
          const upsertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates' // 如果存在则更新，不存在则插入
            },
            body: JSON.stringify({
              user_identity: userIdentity,
              qing_count: stats.qingCount || 0,
              bu_count: stats.buCount || 0,
              user_messages: stats.totalMessages || 0,
              total_user_chars: stats.totalChars || 0,
              avg_message_length: stats.avgMessageLength || 0,
              usage_days: stats.usageDays || 0,
              dimensions: stats.dimensions || null,
              personality: stats.personality || null,
              vibe_index: stats.vibeIndex || null,
              updated_at: new Date().toISOString()
            })
          });

          // 如果 UPSERT 失败（可能是没有唯一约束），尝试手动查询+更新
          if (!upsertResponse.ok && upsertResponse.status === 409) {
            // 冲突：尝试先查询是否存在
            const checkResponse = await fetch(
              `${env.SUPABASE_URL}/rest/v1/cursor_stats?user_identity=eq.${userIdentity}&select=user_identity`,
              {
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`
                }
              }
            );

            const existing = await checkResponse.json();
            
            if (existing && existing.length > 0) {
              // 存在：使用 PATCH 更新
              await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_identity=eq.${userIdentity}`, {
                method: 'PATCH',
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  qing_count: stats.qingCount || 0,
                  bu_count: stats.buCount || 0,
                  user_messages: stats.totalMessages || 0,
                  total_user_chars: stats.totalChars || 0,
                  avg_message_length: stats.avgMessageLength || 0,
                  usage_days: stats.usageDays || 0,
                  dimensions: stats.dimensions || null,
                  personality: stats.personality || null,
                  vibe_index: stats.vibeIndex || null,
                  updated_at: new Date().toISOString()
                })
              });
            } else {
              // 不存在：使用 POST 插入
              await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
                method: 'POST',
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  user_identity: userIdentity,
                  qing_count: stats.qingCount || 0,
                  bu_count: stats.buCount || 0,
                  user_messages: stats.totalMessages || 0,
                  total_user_chars: stats.totalChars || 0,
                  avg_message_length: stats.avgMessageLength || 0,
                  usage_days: stats.usageDays || 0,
                  dimensions: stats.dimensions || null,
                  personality: stats.personality || null,
                  vibe_index: stats.vibeIndex || null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
              });
            }
          }
        } catch (dbError) {
          console.error('[Worker] Supabase 操作失败:', dbError);
          // 即使数据库操作失败，也继续返回排名（使用缓存数据）
        }

        // 设置 KV 锁，防止24小时内重复提交
        if (env.STATS_STORE) {
          await env.STATS_STORE.put(kvLockKey, "true", { expirationTtl: 86400 }); // 24小时过期
        }

        // B. 并行查询排名情况 (以总消息数 user_messages 为主排名指标)
        const [totalRes, rankRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=count`, {
            headers: { 
              'apikey': env.SUPABASE_KEY, 
              'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
              'Range-Unit': 'items', 
              'Range': '0-0' 
            }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=count`, {
            headers: { 
              'apikey': env.SUPABASE_KEY, 
              'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
              'Range-Unit': 'items', 
              'Range': '0-0' 
            }
          })
        ]);

        const totalCount = parseInt(totalRes.headers.get('content-range')?.split('/')[1]) || 1;
        const lessThanCount = parseInt(rankRes.headers.get('content-range')?.split('/')[1]) || 0;
        
        // 计算百分比
        const rankPercent = Math.min(99.9, Math.max(1, Math.round((lessThanCount / totalCount) * 100)));

        return new Response(JSON.stringify({
          status: "success",
          rankPercent: rankPercent,
          totalUsers: totalCount,
          action: "inserted" // 标识这是新插入
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response("Not Found", { status: 404 });

    } catch (e) {
      console.error('[Worker] 错误:', e);
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};
