// ========================================
// 【重要】请将以下代码插入到 src/worker/index.ts 的第 3597 行之后
// 即在这一行之后:
//     (finalRow as any).monthly_slang = slang.map((x: any) => x.phrase);
//     <-- 在这里插入下面的代码
// ========================================

    // 【V6.1 新增】高频句子：从 sentence_pool 表查询该地区TOP句子
    // 如果表不存在或无数据，则回退到使用 slang_trends_pool 的 phrase 作为展示
    try {
      const sentenceUrl = new URL(`${env.SUPABASE_URL}/rest/v1/sentence_pool`);
      sentenceUrl.searchParams.set('select', 'sentence,hit_count,last_seen_at');
      sentenceUrl.searchParams.set('region', `eq.${region}`);
      sentenceUrl.searchParams.set('order', 'hit_count.desc,last_seen_at.desc');
      sentenceUrl.searchParams.set('limit', '10');
      
      const sentenceRows = await fetchSupabaseJson<any[]>(env, sentenceUrl.toString(), {
        headers: buildSupabaseHeaders(env),
      }).catch(() => []);
      
      const topSentences = (Array.isArray(sentenceRows) ? sentenceRows : [])
        .map((r: any) => ({
          sentence: String(r?.sentence || '').trim(),
          hit_count: Number(r?.hit_count) || 0,
          last_seen_at: r?.last_seen_at || null,
        }))
        .filter((x) => x.sentence);
      
      // 如果有数据，返回句子；否则回退到关键词
      if (topSentences.length > 0) {
        (finalRow as any).top_sentences = topSentences;
      } else {
        // 回退：使用所有类别的phrase作为"句子"展示（临时方案）
        const allPhrases = [...slang, ...merit, ...svSlang]
          .sort((a, b) => b.hit_count - a.hit_count)
          .slice(0, 10)
          .map((x: any) => ({
            sentence: x.phrase,
            hit_count: x.hit_count,
            last_seen_at: null,
          }));
        (finalRow as any).top_sentences = allPhrases;
      }
    } catch (e) {
      // 失败时使用关键词回退
      const allPhrases = [...slang, ...merit, ...svSlang]
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, 10)
        .map((x: any) => ({
          sentence: x.phrase,
          hit_count: x.hit_count,
          last_seen_at: null,
        }));
      (finalRow as any).top_sentences = allPhrases.length > 0 ? allPhrases : [];
    }

// ========================================
// 插入完成后的文件结构应该是:
// 
// 3596:    (finalRow as any).monthly_slang = slang.map((x: any) => x.phrase);
// 3597:
// 3598:    // 【V6.1 新增】高频句子...
// ...  (上面的代码)
// 3652:    }
// 3653:
// 3654:    // Debug：帮助定位"country_code=US 但返回 Global/空数组"的问题
// ========================================

// 插入后保存文件,然后部署:
// cd src/worker
// npm run deploy
