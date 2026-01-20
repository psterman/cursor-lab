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
        try {
          const langParam = url.searchParams.get("lang") || "cn";
          // 支持多种语言格式：cn/zh-CN/zh -> cn, en -> en
          let lang = "cn";
          if (langParam === "en" || langParam === "en-US" || langParam === "en-GB") {
            lang = "en";
          } else if (langParam === "cn" || langParam === "zh" || langParam === "zh-CN" || langParam === "zh-cn") {
            lang = "cn";
          }
          
          const result = await env.prompts_library.prepare(
            "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
          ).bind(lang).first();
          
          if (result && result.content) {
            return new Response(JSON.stringify({ 
              data: result, 
              status: "success" 
            }), { 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
          } else {
            // 如果没有找到数据，返回提示信息
            console.warn(`[Worker] 答案之书未找到数据，语言: ${lang}`);
            return new Response(JSON.stringify({ 
              data: null, 
              status: "success",
              message: `No data found for language: ${lang}`,
              lang: lang
            }), { 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
          }
        } catch (e) {
          console.error('[Worker] 答案之书查询失败:', e);
          return new Response(JSON.stringify({ 
            data: null, 
            status: "error",
            error: e.message 
          }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      }

      // --- 功能 1.5：获取总人数统计 (GET 请求) ---
      if (request.method === "GET" && url.pathname === "/") {
        try {
          // 方法1：使用 count=exact 和 content-range 头（推荐）
          const totalRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=id`, {
            headers: { 
              'apikey': env.SUPABASE_KEY, 
              'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
              'Prefer': 'count=exact', // 使用 count=exact 获取准确计数
              'Range': '0-0' // 只请求第一条记录，节省带宽
            }
          });

          // 解析 content-range 头：格式为 "0-0/total" 或 "*/total"
          const contentRange = totalRes.headers.get('content-range');
          let totalCount = 0;
          
          if (contentRange) {
            // 格式可能是 "0-0/13" 或 "*/13"
            const parts = contentRange.split('/');
            if (parts.length === 2) {
              totalCount = parseInt(parts[1]) || 0;
            }
          }
          
          // 如果 content-range 解析失败，尝试方法2：直接查询所有记录（仅当记录数较少时）
          if (totalCount === 0 && totalRes.ok) {
            console.warn('[Worker] content-range 解析失败，尝试直接查询记录数');
            try {
              const allRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=id`, {
                headers: { 
                  'apikey': env.SUPABASE_KEY, 
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Range': '0-999' // 最多查询1000条记录
                }
              });
              
              if (allRes.ok) {
                const allData = await allRes.json();
                totalCount = Array.isArray(allData) ? allData.length : 0;
                
                // 如果返回了1000条记录，可能还有更多，使用 content-range 头
                const allContentRange = allRes.headers.get('content-range');
                if (allContentRange) {
                  const allParts = allContentRange.split('/');
                  if (allParts.length === 2) {
                    const parsedTotal = parseInt(allParts[1]);
                    if (!isNaN(parsedTotal) && parsedTotal > 0) {
                      totalCount = parsedTotal;
                    }
                  }
                }
              }
            } catch (fallbackError) {
              console.error('[Worker] 备用查询方法失败:', fallbackError);
            }
          }

          console.log('[Worker] GET 总人数查询:', {
            contentRange,
            totalCount,
            status: totalRes.status,
            method: totalCount > 0 ? 'content-range' : 'fallback-query'
          });

          return new Response(JSON.stringify({ 
            value: totalCount, 
            status: "success",
            totalUsers: totalCount,
            count: totalCount // 兼容字段
          }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        } catch (e) {
          console.error('[Worker] 获取总人数失败:', e);
          return new Response(JSON.stringify({ 
            value: 0, 
            status: "error",
            error: e.message 
          }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      }

      // --- 功能 2：分析数据上传并获取即时排名 (核心修改) ---
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const stats = await request.json();

        // 生成用户标识 Hash（基于 IP）
        const msgUint8 = new TextEncoder().encode(clientIP);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // 【第一层去重：Cloudflare KV 快速检查】
        const kvLockKey = `user_submit_lock:${userIdentity}`;
        let alreadySubmitted = false;
        if (env.STATS_STORE) {
          const lock = await env.STATS_STORE.get(kvLockKey);
          if (lock) {
            alreadySubmitted = true;
            console.log(`[Worker] 用户 ${userIdentity} 今天已提交过，跳过重复提交`);
          }
        }

        // A. 推送数据到 Supabase (UPSERT) - 使用 user_identity 作为唯一标识
        if (!alreadySubmitted) {
          try {
            // 先检查该 user_identity 是否已存在
            const checkRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/cursor_stats?user_identity=eq.${encodeURIComponent(userIdentity)}&select=user_identity`,
              {
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`
                }
              }
            );

            const existing = await checkRes.json();
            const exists = existing && existing.length > 0;

            const payload = {
              user_identity: userIdentity, // 使用 user_identity 作为唯一标识
              user_messages: parseInt(stats.totalMessages) || 0, // 实际表字段：user_messages (int4)
              total_user_chars: parseInt(stats.totalChars) || 0, // 实际表字段：total_user_chars (int8)，注意不是 total_chars
              vibe_index: String(stats.vibeIndex || "00000"), // 实际表字段：vibe_index (text)
              personality: stats.personality || stats.personalityType || "Unknown", // 实际表字段：personality (text)，注意不是 personality_type
              dimensions: stats.dimensions || {}, // 实际表字段：dimensions (jsonb)
              updated_at: new Date().toISOString() // 更新时间
              // 注意：id 字段是自动生成的，不需要手动指定
            };

            let dbRes;
            if (exists) {
              // 如果存在，使用 PATCH 更新
              dbRes = await fetch(
                `${env.SUPABASE_URL}/rest/v1/cursor_stats?user_identity=eq.${encodeURIComponent(userIdentity)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload)
                }
              );
              console.log(`[Worker] 更新现有记录 (user_identity: ${userIdentity})`);
            } else {
              // 如果不存在，使用 POST 插入
              dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
                method: 'POST',
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
              });
              console.log(`[Worker] 插入新记录 (user_identity: ${userIdentity})`);
            }

            // 检查写入结果
            if (dbRes.ok) {
              // 写入成功后才锁定 KV
              if (env.STATS_STORE) {
                await env.STATS_STORE.put(kvLockKey, "true", { expirationTtl: 86400 }); // 24小时过期
              }
              const responseData = await dbRes.json().catch(() => null);
              console.log(`[Worker] ✅ 数据已写入 Supabase (${exists ? '更新' : '插入'})`, {
                user_identity: userIdentity,
                ip: clientIP,
                status: dbRes.status,
                response: responseData
              });
            } else {
              const errorText = await dbRes.text().catch(() => '无法读取错误信息');
              console.error(`[Worker] ❌ Supabase 写入失败:`, {
                status: dbRes.status,
                statusText: dbRes.statusText,
                error: errorText,
                payload: payload,
                user_identity: userIdentity,
                exists: exists,
                method: exists ? 'PATCH' : 'POST',
                url: exists 
                  ? `${env.SUPABASE_URL}/rest/v1/cursor_stats?user_identity=eq.${encodeURIComponent(userIdentity)}`
                  : `${env.SUPABASE_URL}/rest/v1/cursor_stats`
              });
              // 不抛出错误，继续执行排名查询（使用现有数据）
              // 这样即使插入失败，用户仍能看到排名
            }
          } catch (dbError) {
            console.error('[Worker] Supabase 操作失败:', {
              error: dbError.message,
              stack: dbError.stack,
              payload: payload
            });
            // 即使数据库操作失败，也继续返回排名（使用现有数据）
          }
        } else {
          console.log(`[Worker] 跳过重复提交 (user_identity: ${userIdentity}, IP: ${clientIP})`);
        }

        // B. 查询排名情况 (以总消息数 user_messages 为主排名指标)
        // 注意：必须在数据插入/更新完成后再查询，确保获取最新数据
        // 使用 Prefer: count=exact 确保获取准确计数
        
        // 等待一小段时间，确保数据库事务已提交（可选，但有助于数据一致性）
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const [totalRes, rankRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=id`, {
            headers: { 
              'apikey': env.SUPABASE_KEY, 
              'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
              'Prefer': 'count=exact', // 使用 count=exact 获取准确计数
              'Range': '0-0' 
            }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=id`, {
            headers: { 
              'apikey': env.SUPABASE_KEY, 
              'Authorization': `Bearer ${env.SUPABASE_KEY}`, 
              'Prefer': 'count=exact', // 使用 count=exact 获取准确计数
              'Range': '0-0' 
            }
          })
        ]);

        // 安全解析总人数和排名（从 content-range 头）
        let totalCount = 0;
        let lessThanCount = 0;
        
        const totalContentRange = totalRes.headers.get('content-range');
        if (totalContentRange) {
          const parts = totalContentRange.split('/');
          if (parts.length === 2) {
            totalCount = parseInt(parts[1]) || 0;
          }
        }
        
        const rankContentRange = rankRes.headers.get('content-range');
        if (rankContentRange) {
          const parts = rankContentRange.split('/');
          if (parts.length === 2) {
            lessThanCount = parseInt(parts[1]) || 0;
          }
        }
        
        // 如果 content-range 解析失败，尝试备用方法
        if (totalCount === 0 && totalRes.ok) {
          try {
            const allRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?select=id`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                'Range': '0-999'
              }
            });
            if (allRes.ok) {
              const allData = await allRes.json();
              totalCount = Array.isArray(allData) ? allData.length : 0;
              const allContentRange = allRes.headers.get('content-range');
              if (allContentRange) {
                const allParts = allContentRange.split('/');
                if (allParts.length === 2) {
                  const parsedTotal = parseInt(allParts[1]);
                  if (!isNaN(parsedTotal) && parsedTotal > 0) {
                    totalCount = parsedTotal;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[Worker] 备用总人数查询失败:', e);
          }
        }
        
        if (lessThanCount === 0 && rankRes.ok && stats.totalMessages > 0) {
          try {
            const rankRes2 = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats?user_messages=lt.${stats.totalMessages}&select=id`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                'Range': '0-999'
              }
            });
            if (rankRes2.ok) {
              const rankData = await rankRes2.json();
              lessThanCount = Array.isArray(rankData) ? rankData.length : 0;
              const rankContentRange2 = rankRes2.headers.get('content-range');
              if (rankContentRange2) {
                const rankParts = rankContentRange2.split('/');
                if (rankParts.length === 2) {
                  const parsedRank = parseInt(rankParts[1]);
                  if (!isNaN(parsedRank) && parsedRank >= 0) {
                    lessThanCount = parsedRank;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[Worker] 备用排名查询失败:', e);
          }
        }
        
        // 计算百分比（确保 totalCount > 0）
        let rankPercent = 0;
        let actualRank = 1; // 实际排名（从1开始）
        
        if (totalCount > 0) {
          // 击败人数 = lessThanCount（user_messages 小于当前用户的用户数）
          // 实际排名 = lessThanCount + 1（排名从1开始）
          actualRank = lessThanCount + 1;
          // 排名百分比 = (击败人数 / 总人数) * 100
          rankPercent = Math.min(99.9, Math.max(1, Math.round((lessThanCount / totalCount) * 100)));
        } else {
          // 如果总人数为0，但用户有数据，说明这是第一个用户
          actualRank = 1;
          rankPercent = 1;
        }

        console.log('[Worker] 排名计算:', {
          totalCount,
          lessThanCount,
          actualRank,
          rankPercent,
          userMessages: stats.totalMessages,
          action: alreadySubmitted ? "skipped_duplicate" : (exists ? "updated" : "inserted"),
          totalContentRange: totalRes.headers.get('content-range'),
          rankContentRange: rankRes.headers.get('content-range'),
          totalResStatus: totalRes.status,
          rankResStatus: rankRes.status
        });

        return new Response(JSON.stringify({
          status: "success",
          rankPercent: rankPercent,
          ranking: rankPercent, // 兼容字段
          totalUsers: totalCount, // 返回实际总人数，不强制为1
          defeated: lessThanCount, // 击败人数
          actualRank: actualRank, // 实际排名
          action: alreadySubmitted ? "skipped_duplicate" : "inserted"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response("Not Found", { status: 404 });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};