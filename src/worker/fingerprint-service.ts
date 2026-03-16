/**
 * 指纹识别与身份绑定服务
 * 提供指纹捕获、识别和身份绑定功能
 */

import type { Env } from './index';

/**
 * 10 秒去重：检查 user_analysis 在过去 N ms 内是否已有记录（按 fingerprint/claim_token）
 * 目的：防止重复触发/并发导致短时间内重复创建/更新，进而出现“两个临时账号”。
 */
async function hasRecentUserAnalysisRecordByKey(
  env: Env,
  params: { fingerprint?: string | null; claim_token?: string | null },
  withinMs = 10_000
): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return false;

  const now = Date.now();
  const checkOne = async (kind: 'fingerprint' | 'claim_token', val: string) => {
    const v = String(val || '').trim();
    if (!v) return false;

    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', 'id,created_at,updated_at');
    url.searchParams.set(kind, `eq.${v}`);
    url.searchParams.set('order', 'updated_at.desc,created_at.desc');
    url.searchParams.set('limit', '1');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    }).catch(() => null);
    if (!res || !res.ok) return false;

    const rows = await res.json().catch(() => null);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return false;

    const tsRaw = row?.updated_at || row?.created_at || null;
    const ts = tsRaw ? Date.parse(String(tsRaw)) : NaN;
    if (!Number.isFinite(ts)) return false;

    return (now - ts) <= withinMs;
  };

  const fp = params.fingerprint != null ? String(params.fingerprint).trim() : '';
  if (fp) {
    const hit = await checkOne('fingerprint', fp);
    if (hit) return true;
  }
  const ct = params.claim_token != null ? String(params.claim_token).trim() : '';
  if (ct) {
    const hit = await checkOne('claim_token', ct);
    if (hit) return true;
  }
  return false;
}

/**
 * 根据指纹识别用户
 * @param fingerprint - 浏览器生成的指纹
 * @param env - 环境变量
 * @returns 用户数据或 null
 */
export async function identifyUserByFingerprint(
  fingerprint: string,
  env: Env
): Promise<any | null> {
  if (!fingerprint || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Fingerprint] ⚠️ 缺少必要参数或环境变量');
    return null;
  }

  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=*`;
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Fingerprint] ❌ 查询失败:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      console.log('[Fingerprint] ✅ 找到用户:', {
        id: data[0].id,
        user_name: data[0].user_name,
        fingerprint: data[0].fingerprint?.substring(0, 8) + '...',
      });
      return data[0];
    }

    console.log('[Fingerprint] ℹ️ 未找到匹配的用户');
    return null;
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 识别用户时出错:', error);
    return null;
  }
}

/**
 * 根据用户 ID (UUID) 识别用户
 * @param userId - 用户 UUID（来自 Supabase Auth）
 * @param env - 环境变量
 * @returns 用户数据或 null
 */
export async function identifyUserByUserId(
  userId: string,
  env: Env
): Promise<any | null> {
  if (!userId || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Fingerprint] ⚠️ 缺少必要参数或环境变量');
    return null;
  }

  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}&select=*`;
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Fingerprint] ❌ 根据 User ID 查询失败:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId: userId.substring(0, 8) + '...',
      });
      return null;
    }

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      console.log('[Fingerprint] ✅ 根据 User ID 找到用户:', {
        id: data[0].id,
        user_name: data[0].user_name,
        user_identity: data[0].user_identity,
      });
      return data[0];
    }

    console.log('[Fingerprint] ℹ️ 根据 User ID 未找到匹配的用户:', userId.substring(0, 8) + '...');
    return null;
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 根据 User ID 识别用户时出错:', error);
    return null;
  }
}

/**
 * 绑定 GitHub ID 和指纹
 * @param githubUsername - GitHub 用户名
 * @param fingerprint - 浏览器生成的指纹
 * @param env - 环境变量
 * @returns 更新后的用户数据或 null
 */
export async function bindFingerprintToUser(
  githubUsername: string,
  fingerprint: string,
  env: Env
): Promise<any | null> {
  if (!githubUsername || !fingerprint || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Fingerprint] ⚠️ 缺少必要参数或环境变量');
    return null;
  }

  try {
    // 【10 秒去重】并发/重复触发时直接复用现有记录
    const recentHit = await hasRecentUserAnalysisRecordByKey(env, { fingerprint }, 10_000);
    if (recentHit) {
      const existing = await identifyUserByFingerprint(fingerprint, env);
      if (existing) {
        console.warn('[Fingerprint] 🛑 10 秒内重复绑定请求，复用现有记录:', {
          id: String(existing?.id || '').slice(0, 8) + '...',
        });
        return existing;
      }
    }

    // 规范化 GitHub 用户名
    const normalizedUsername = githubUsername.trim().toLowerCase();

    // 【并发安全】优先按 fingerprint 查找并更新，避免“先查 user_name 未命中 -> 创建新行”
    // 这在 GitHub 登录与浏览器指纹并行到达时，容易创建两个临时账号。
    const existingByFp = await identifyUserByFingerprint(fingerprint, env);

    // 首先尝试根据 user_name 查找现有用户
    const findUserUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=eq.${encodeURIComponent(normalizedUsername)}&select=*`;
    
    const findResponse = await fetch(findUserUrl, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    let existingUser = null;
    if (findResponse.ok) {
      const findData = await findResponse.json();
      if (Array.isArray(findData) && findData.length > 0) {
        existingUser = findData[0];
        console.log('[Fingerprint] ✅ 找到现有用户:', {
          id: existingUser.id,
          user_name: existingUser.user_name,
          current_fingerprint: existingUser.fingerprint?.substring(0, 8) + '...',
        });
      }
    }

    // 准备更新/插入的数据
    const payload: any = {
      user_name: normalizedUsername,
      github_username: normalizedUsername,
      github_id: normalizedUsername,
      fingerprint: fingerprint,
      updated_at: new Date().toISOString(),
    };

    // 1) fingerprint 已存在：直接更新该行（不创建新 ID）
    if (existingByFp) {
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(existingByFp.id)}`;
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[Fingerprint] ❌ 更新用户失败(按 fingerprint):', {
          status: updateResponse.status,
          error: errorText,
        });
        return null;
      }

      const updateData = await updateResponse.json();
      return Array.isArray(updateData) ? updateData[0] : updateData;
    }

    // 2) user_name 已存在：更新该行
    if (existingUser) {
      // 更新现有用户
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${existingUser.id}`;
      
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[Fingerprint] ❌ 更新用户失败:', {
          status: updateResponse.status,
          error: errorText,
        });
        return null;
      }

      const updateData = await updateResponse.json();
      console.log('[Fingerprint] ✅ 用户指纹已更新:', {
        id: updateData[0]?.id,
        user_name: updateData[0]?.user_name,
        fingerprint: updateData[0]?.fingerprint?.substring(0, 8) + '...',
      });
      return Array.isArray(updateData) ? updateData[0] : updateData;
    } else {
      // 3) 新用户：使用基于 fingerprint 的 upsert（并发下也幂等）
      // - 若 fingerprint 已存在：更新该行（不会创建新 ID）
      // - 若 fingerprint 不存在：插入新行（id 由数据库默认值生成；若无默认值再回退为前端生成）
      const upsertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`;

      const tryUpsert = async (row: any) => {
        return await fetch(upsertUrl, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation,resolution=merge-duplicates',
          },
          body: JSON.stringify([row]),
        });
      };

      // 【保护创建时间】不传 created_at，让数据库自动处理（首次插入时自动生成，更新时保持原值）
      // 【唯一键变更】基于 fingerprint 的 upsert，不传 id（避免冲突更新时误改主键）
      let insertResponse = await tryUpsert(payload);
      if (!insertResponse.ok) {
        const errorText = await insertResponse.text().catch(() => '');
        // 回退：如果表没有默认 id，补一个 id 再试一次
        // 【保护创建时间】不传 created_at，让数据库自动处理
        if (errorText.includes('null value') && (errorText.includes('id') || errorText.includes('"id"'))) {
          insertResponse = await tryUpsert({ ...payload, id: crypto.randomUUID() });
        } else {
          console.error('[Fingerprint] ❌ 创建/Upsert 用户失败:', {
            status: insertResponse.status,
            error: errorText,
          });
          return null;
        }
      }

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        console.error('[Fingerprint] ❌ 创建用户失败:', {
          status: insertResponse.status,
          error: errorText,
        });
        return null;
      }

      const insertData = await insertResponse.json();
      console.log('[Fingerprint] ✅ 新用户已创建:', {
        id: insertData[0]?.id,
        user_name: insertData[0]?.user_name,
        fingerprint: insertData[0]?.fingerprint?.substring(0, 8) + '...',
      });
      return Array.isArray(insertData) ? insertData[0] : insertData;
    }
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 绑定指纹时出错:', error);
    return null;
  }
}

/**
 * 根据指纹更新用户信息（如果用户已存在）
 * 【止血】覆盖式更新：total_messages、total_chars 等统计字段必须为“当前快照值”，
 * 禁止传入“旧值+增量”。否则会导致数据翻倍（1/1 问题）。语义等同 SQL：SET column = EXCLUDED.column。
 *
 * @param fingerprint - 浏览器生成的指纹
 * @param updates - 要更新的字段（均为覆盖值，禁止累加）
 * @param env - 环境变量
 * @returns 更新后的用户数据或 null
 */
export async function updateUserByFingerprint(
  fingerprint: string,
  updates: Record<string, any>,
  env: Env
): Promise<any | null> {
  if (!fingerprint || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return null;
  }

  try {
    const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(fingerprint)}`;
    // 覆盖式：直接使用 updates 中的值，不参与任何累加（PATCH 语义即 SET col = 传入值）
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Fingerprint] ❌ 更新用户失败:', errorText);
      return null;
    }

    const data = await response.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : data;
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 更新用户时出错:', error);
    return null;
  }
}

/**
 * 根据 claim_token 查找待认领的记录
 * @param claimToken - 影子令牌（Claim Token）
 * @param env - 环境变量
 * @returns 用户数据或 null
 */
export async function identifyUserByClaimToken(
  claimToken: string,
  env: Env
): Promise<any | null> {
  if (!claimToken || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return null;
  }

  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?claim_token=eq.${encodeURIComponent(claimToken)}&select=*`;
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Fingerprint] ❌ 根据 claim_token 查询失败:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      console.log('[Fingerprint] ✅ 根据 claim_token 找到用户:', {
        id: data[0].id,
        user_name: data[0].user_name,
        claim_token: data[0].claim_token?.substring(0, 8) + '...',
      });
      return data[0];
    }

    console.log('[Fingerprint] ℹ️ 根据 claim_token 未找到匹配的用户');
    return null;
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 根据 claim_token 识别用户时出错:', error);
    return null;
  }
}

/**
 * 迁移成功后从 v_unified_analysis_v2 查询该用户完整记录（含 vibe_rank、vibe_percentile 等），供前端立即同步
 */
async function fetchUserFromExtendedView(userId: string, env: Env): Promise<any | null> {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_KEY) return null;
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2?id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
    return row && typeof row === 'object' ? row : null;
  } catch {
    return null;
  }
}

/**
 * 将匿名数据迁移到 GitHub User ID (支持 claim_token 和 fingerprint 两种方式)
 * @param fingerprint - 浏览器指纹 (用于基于 fingerprint 的迁移)
 * @param userId - 新的 GitHub User ID (UUID)
 * @param claimToken - 影子令牌 (可选,如果提供则优先使用 claim_token 方式)
 * @param env - 环境变量
 * @returns 迁移后该用户在 v_user_analysis_extended 中的完整记录，或 null
 */
export async function migrateFingerprintToUserId(
  fingerprint: string,
  userId: string,
  claimToken?: string,
  env?: Env
): Promise<any | null> {
  if (!userId || !env?.SUPABASE_URL || !env?.SUPABASE_KEY) {
    console.warn('[Migrate] ⚠️ 缺少必要参数或环境变量');
    return null;
  }

  try {
    let sourceRecord: any | null = null;
    
    // 【方式 1: 优先使用 claim_token】如果提供了 claimToken，使用 claim_token 方式
    if (claimToken) {
      console.log('[Migrate] 🔑 开始基于 claim_token 的强制认领流程...');
      sourceRecord = await identifyUserByClaimToken(claimToken, env);
      
      if (!sourceRecord) {
        console.error('[Migrate] ❌ claim_token 无效或已过期,未找到待认领记录');
        return null;
      }
    } 
    // 【方式 2: 基于 fingerprint】如果没有 claimToken，使用 fingerprint 方式
    else if (fingerprint && String(fingerprint).trim() !== '') {
      console.log('[Migrate] 🔑 开始基于 fingerprint 的认领流程...', {
        fingerprint: fingerprint.substring(0, 8) + '...',
        userId: userId.substring(0, 8) + '...',
      });
      
      sourceRecord = await identifyUserByFingerprint(fingerprint, env);
      
      if (!sourceRecord) {
        console.log('[Migrate] ℹ️ 未找到匹配 fingerprint 的记录，可能无需迁移');
        return null;
      }
      
      // 检查源记录是否已经是 GitHub 用户
      if (sourceRecord.user_identity === 'github') {
        console.log('[Migrate] ℹ️ 该 fingerprint 已关联 GitHub 用户，无需迁移');
        return null;
      }
    } else {
      console.error('[Migrate] ❌ 必须提供 claimToken 或 fingerprint');
      return null;
    }

    console.log('[Migrate] ✅ 找到待认领记录:', {
      recordId: sourceRecord.id?.substring(0, 8) + '...',
      total_messages: sourceRecord.total_messages || 0,
      total_chars: sourceRecord.total_chars || 0,
      user_identity: sourceRecord.user_identity,
    });

    // 【防止冒领】确保源记录是匿名身份（已在 fingerprint 分支中检查，这里保留 claim_token 分支的检查）
    if (sourceRecord.user_identity === 'github') {
      console.error('[Migrate] ❌ 源记录已被认领,禁止重复认领');
      return null;
    }

    // 【步骤 2: 清理目标】删除 GitHub 登录时自动生成的空记录
    console.log('[Migrate] 🧹 检查并清理目标 GitHub 用户的空记录...');
    const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}&total_messages=is.null`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (deleteResponse.ok) {
      console.log('[Migrate] ✅ 已删除空记录,防止主键冲突');
    } else {
      console.log('[Migrate] ℹ️ 未找到空记录或删除失败(可能目标记录不存在)');
    }

    // 【步骤 3: 检查目标用户是否已有数据（基于 fingerprint 查找）】
    // 【唯一键变更】fingerprint 是唯一主键，检查是否有其他 fingerprint 已关联该 userId
    const sourceFingerprint = sourceRecord.fingerprint;
    let targetUser: any | null = null;
    
    if (sourceFingerprint) {
      // 检查是否有其他记录使用相同的 fingerprint 但不同的 id
      // 这种情况不应该发生，但如果发生了，我们需要合并数据
      const existingByFp = await identifyUserByFingerprint(sourceFingerprint, env);
      if (existingByFp && existingByFp.id !== sourceRecord.id) {
        console.warn('[Migrate] ⚠️ 发现 fingerprint 冲突，使用现有记录:', {
          sourceId: sourceRecord.id?.substring(0, 8) + '...',
          existingId: existingByFp.id?.substring(0, 8) + '...',
        });
        targetUser = existingByFp;
      }
    }
    
    // 检查目标 userId 是否已有记录（可能通过其他方式创建）
    const targetUserById = await identifyUserByUserId(userId, env);
    
    if (targetUserById && targetUserById.fingerprint !== sourceFingerprint) {
      // 目标用户已存在且 fingerprint 不同，需要合并数据
      console.log('[Migrate] 🔄 目标用户已存在但 fingerprint 不同，执行数据合并...');
      
      const targetMessages = targetUserById.total_messages || 0;
      const targetChars = targetUserById.total_chars || 0;
      const sourceMessages = sourceRecord.total_messages || 0;
      const sourceChars = sourceRecord.total_chars || 0;
      
      // 【数据合并】将源记录的数据累加到目标记录
      const updateData: any = {
        // 使用 COALESCE 确保 NULL 值也能正常累加
        total_messages: (targetMessages || 0) + (sourceMessages || 0),
        total_chars: (targetChars || 0) + (sourceChars || 0),
        user_identity: 'github',
        updated_at: new Date().toISOString(),
        // 【保护创建时间】不包含 created_at，保持原有值
      };

      // 合并其他字段(优先使用有数据的记录)
      if (sourceMessages > 0) {
        if (sourceRecord.l_score) updateData.l_score = sourceRecord.l_score;
        if (sourceRecord.p_score) updateData.p_score = sourceRecord.p_score;
        if (sourceRecord.d_score) updateData.d_score = sourceRecord.d_score;
        if (sourceRecord.e_score) updateData.e_score = sourceRecord.e_score;
        if (sourceRecord.f_score) updateData.f_score = sourceRecord.f_score;
        if (sourceRecord.stats) updateData.stats = sourceRecord.stats;
        if (sourceRecord.personality_type) updateData.personality_type = sourceRecord.personality_type;
        if (sourceRecord.roast_text) updateData.roast_text = sourceRecord.roast_text;
        if (sourceRecord.personality_data) updateData.personality_data = sourceRecord.personality_data;
        // 【work_days 保护】取较大值
        const targetWorkDays = targetUserById.work_days || 0;
        const sourceWorkDays = sourceRecord.work_days || 0;
        updateData.work_days = Math.max(targetWorkDays, sourceWorkDays);
        // 【数据一致性】同步更新 stats.work_days
        if (updateData.stats && typeof updateData.stats === 'object') {
          updateData.stats.work_days = updateData.work_days;
        }
      }

      // 【OpenClaw 合并】累加 total_tokens、合并 skills_tags、保留 primary_model、取最新 last_active_at、合并 openclaw_metadata
      const targetTokens = Number(targetUserById.total_tokens) || 0;
      const sourceTokens = Number(sourceRecord.total_tokens) || 0;
      updateData.total_tokens = (targetTokens || 0) + (sourceTokens || 0);

      const targetSkills = Array.isArray(targetUserById.skills_tags) ? targetUserById.skills_tags : [];
      const sourceSkills = Array.isArray(sourceRecord.skills_tags) ? sourceRecord.skills_tags : [];
      const mergedSkills = [...new Set([...targetSkills, ...sourceSkills])];
      updateData.skills_tags = mergedSkills.slice(0, 24);

      if (sourceTokens > targetTokens && sourceRecord.primary_model) {
        updateData.primary_model = sourceRecord.primary_model;
      } else if (targetUserById.primary_model) {
        updateData.primary_model = targetUserById.primary_model;
      } else if (sourceRecord.primary_model) {
        updateData.primary_model = sourceRecord.primary_model;
      }

      const targetActive = targetUserById.last_active_at ? new Date(targetUserById.last_active_at).getTime() : 0;
      const sourceActive = sourceRecord.last_active_at ? new Date(sourceRecord.last_active_at).getTime() : 0;
      updateData.last_active_at = new Date(Math.max(targetActive, sourceActive, Date.now())).toISOString();

      if (sourceRecord.openclaw_metadata && typeof sourceRecord.openclaw_metadata === 'object') {
        if (!targetUserById.openclaw_metadata || typeof targetUserById.openclaw_metadata !== 'object') {
          updateData.openclaw_metadata = sourceRecord.openclaw_metadata;
        } else {
          updateData.openclaw_metadata = { ...targetUserById.openclaw_metadata, ...sourceRecord.openclaw_metadata };
        }
      }

      // 【唯一键变更】基于 fingerprint 更新（fingerprint 是唯一主键）
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(targetUserById.fingerprint)}`;
      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Migrate] ❌ 数据合并失败:', errorText);
        throw new Error(`数据合并失败: ${errorText}`);
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      console.log('[Migrate] ✅ 数据合并成功');
      
      // 【步骤 5: 销毁令牌】删除源记录
      await deleteSourceRecord(sourceRecord.id, env);
      
      // 逻辑闭环：返回视图中完整记录，便于后端同步给前端
      const viewRow = await fetchUserFromExtendedView(userId, env);
      return viewRow ?? result;
    } else {
      // 【禁止创建新行】直接更新源记录的 id 和 user_identity，不创建新行
      console.log('[Migrate] 🔄 更新源记录的 user_id，不创建新行...');
      
      const sourceFp = sourceRecord.fingerprint;
      if (!sourceFp) {
        console.error('[Migrate] ❌ 源记录缺少 fingerprint，无法更新');
        return null;
      }
      
      // 【唯一键变更】基于 fingerprint 更新（fingerprint 是唯一主键）
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(sourceFp)}`;
      
      const updateData: any = {
        id: userId, // 更新 user_id
        user_identity: 'github',
        claim_token: null, // 清除 claim_token
        updated_at: new Date().toISOString(),
        last_active_at: sourceRecord.last_active_at || new Date().toISOString(),
        // 【保护创建时间】不包含 created_at，保持原有值
      };
      
      // 【work_days 保护】如果目标用户有更大的 work_days，保留较大值
      if (targetUserById) {
        const targetWorkDays = targetUserById.work_days || 0;
        const sourceWorkDays = sourceRecord.work_days || 0;
        updateData.work_days = Math.max(targetWorkDays, sourceWorkDays);
        // 【数据一致性】同步更新 stats.work_days
        if (sourceRecord.stats && typeof sourceRecord.stats === 'object') {
          updateData.stats = {
            ...sourceRecord.stats,
            work_days: updateData.work_days,
          };
        }
      }

      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Migrate] ❌ 更新源记录失败:', errorText);
        throw new Error(`更新源记录失败: ${errorText}`);
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      console.log('[Migrate] ✅ 源记录更新成功，user_id 已更新为 GitHub ID');
      
      // 逻辑闭环：返回视图中完整记录，便于后端同步给前端
      const viewRow = await fetchUserFromExtendedView(userId, env);
      return viewRow ?? result;
    }
  } catch (error: any) {
    console.error('[Migrate] ❌ 迁移失败:', error);
    // 【事务性】失败时保留原始匿名数据
    return null;
  }
}

/**
 * 删除源记录(销毁令牌)
 */
async function deleteSourceRecord(sourceId: string, env: Env): Promise<void> {
  try {
    console.log('[Migrate] 🗑️ 销毁源记录...');

    // 【已处理标记】即便 DELETE 失败，也要把旧临时数据标记为已处理，避免后续链路再次误认领/误统计
    try {
      const markUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceId)}`;
      await fetch(markUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_identity: 'migrated',
          claim_token: null,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => null);
    } catch {
      // ignore
    }

    const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceId)}`;
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      console.log('[Migrate] ✅ 源记录已删除,令牌已销毁');
    } else {
      const errorText = await response.text();
      console.warn('[Migrate] ⚠️ 源记录删除失败(不影响主流程):', errorText);
    }
  } catch (error) {
    console.error('[Migrate] ❌ 删除源记录时出错:', error);
  }
}

/**
 * 根据用户名识别用户（深度溯源：寻找有数据的匿名记录）
 * @param username - 用户名
 * @param env - 环境变量
 * @returns 用户数据或 null
 */
export async function identifyUserByUsername(
  username: string,
  env: Env
): Promise<any | null> {
  if (!username || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return null;
  }

  try {
    const normalizedUsername = username.trim().toLowerCase();
    // 寻找 user_name 匹配、身份不是 github（即匿名）且 total_messages > 0 的记录
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=eq.${encodeURIComponent(normalizedUsername)}&user_identity=neq.github&total_messages=gt.0&order=total_messages.desc&limit=1&select=*`;
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Fingerprint] ❌ 根据用户名查询失败:', response.status);
      return null;
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('[Fingerprint] 🔍 深度溯源成功（根据用户名找到有数据的记录）:', {
        id: data[0].id,
        user_name: data[0].user_name,
        total_messages: data[0].total_messages
      });
      return data[0];
    }

    return null;
  } catch (error) {
    console.error('[Fingerprint] ❌ 根据用户名溯源时出错:', error);
    return null;
  }
}
