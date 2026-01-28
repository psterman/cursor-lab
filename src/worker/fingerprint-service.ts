/**
 * 指纹识别与身份绑定服务
 * 提供指纹捕获、识别和身份绑定功能
 */

import type { Env } from './index';

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
    // 规范化 GitHub 用户名
    const normalizedUsername = githubUsername.trim().toLowerCase();

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
      // 创建新用户
      payload.id = crypto.randomUUID();
      payload.created_at = new Date().toISOString();
      
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify([payload]), // Supabase 需要数组格式
      });

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
 * @param fingerprint - 浏览器生成的指纹
 * @param updates - 要更新的字段
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
 * 将指纹数据迁移到 GitHub User ID
 * @param fingerprint - 旧的浏览器指纹
 * @param userId - 新的 GitHub User ID (UUID)
 * @param env - 环境变量
 * @returns 迁移后的用户数据或 null
 */
export async function migrateFingerprintToUserId(
  fingerprint: string,
  userId: string,
  env: Env
): Promise<any | null> {
  if (!fingerprint || !userId || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Fingerprint] ⚠️ 缺少必要参数或环境变量');
    return null;
  }

  try {
    // 1. 查找指纹对应的用户数据
    const fingerprintUser = await identifyUserByFingerprint(fingerprint, env);
    
    if (!fingerprintUser) {
      console.log('[Fingerprint] ℹ️ 未找到指纹对应的用户数据，无需迁移');
      return null;
    }

    console.log('[Fingerprint] 🔄 开始迁移数据:', {
      fingerprint: fingerprint.substring(0, 8) + '...',
      userId: userId.substring(0, 8) + '...',
      fingerprintUserId: fingerprintUser.id,
    });

    // 2. 检查目标 user_id 是否已存在记录
    const targetUser = await identifyUserByUserId(userId, env);
    
    // 3. 准备迁移的数据（排除 id 字段，因为要更新到新的 id）
    const migrationData: any = {
      ...fingerprintUser,
    };
    delete migrationData.id; // 移除旧的 id
    delete migrationData.fingerprint; // 移除旧的 fingerprint（可选，保留也可以）
    migrationData.id = userId; // 设置新的 id
    migrationData.user_identity = 'github'; // 更新身份标识
    migrationData.updated_at = new Date().toISOString();

    if (targetUser) {
      // 目标用户已存在，合并数据（优先保留数据量更完整的记录）
      console.log('[Fingerprint] ✅ 目标用户已存在，合并数据');
      
      // 【Task 2】比较数据完整性：优先保留 total_messages 更多的记录
      const targetMessages = targetUser.total_messages || targetUser.stats?.total_messages || 0;
      const fingerprintMessages = fingerprintUser.total_messages || fingerprintUser.stats?.total_messages || 0;
      
      const useFingerprintAsBase = fingerprintMessages > targetMessages;
      const baseData = useFingerprintAsBase ? fingerprintUser : targetUser;
      const supplementData = useFingerprintAsBase ? targetUser : fingerprintUser;
      
      console.log('[Fingerprint] 📊 数据完整性比较:', {
        targetMessages,
        fingerprintMessages,
        useFingerprintAsBase,
        baseSource: useFingerprintAsBase ? 'fingerprint' : 'target'
      });
      
      // 【Task 2】合并 stats 字段（使用 JSONB 合并逻辑）
      let mergedStats = null;
      if (baseData.stats || supplementData.stats) {
        const baseStats = typeof baseData.stats === 'string' ? JSON.parse(baseData.stats) : (baseData.stats || {});
        const supplementStats = typeof supplementData.stats === 'string' ? JSON.parse(supplementData.stats) : (supplementData.stats || {});
        
        // 深度合并 stats 对象（优先使用 baseStats，用 supplementStats 补充缺失字段）
        mergedStats = {
          ...supplementStats,
          ...baseStats,
          // 对于数值字段，取较大值
          total_messages: Math.max(baseStats.total_messages || 0, supplementStats.total_messages || 0),
          total_chars: Math.max(baseStats.total_chars || 0, supplementStats.total_chars || 0),
          work_days: Math.max(baseStats.work_days || 0, supplementStats.work_days || 0),
        };
        
        // 合并 tech_stack（如果存在）
        if (baseStats.tech_stack || supplementStats.tech_stack) {
          mergedStats.tech_stack = {
            ...(supplementStats.tech_stack || {}),
            ...(baseStats.tech_stack || {})
          };
        }
        
        console.log('[Fingerprint] ✅ stats 字段已合并');
      }
      
      const mergedData: any = {
        ...baseData,
        ...supplementData,
        // 保留目标用户的关键字段
        id: userId,
        user_name: targetUser.user_name || migrationData.user_name,
        user_identity: 'github',
        updated_at: new Date().toISOString(),
        // 【Task 2】使用合并后的 stats
        stats: mergedStats || baseData.stats || supplementData.stats,
        // 优先使用数据量更完整的记录的维度分数
        l_score: baseData.l_score || supplementData.l_score || 50,
        p_score: baseData.p_score || supplementData.p_score || 50,
        d_score: baseData.d_score || supplementData.d_score || 50,
        e_score: baseData.e_score || supplementData.e_score || 50,
        f_score: baseData.f_score || supplementData.f_score || 50,
        // 合并其他重要字段
        total_messages: Math.max(targetMessages, fingerprintMessages),
        dimensions: baseData.dimensions || supplementData.dimensions || null,
        personality: baseData.personality || supplementData.personality || null,
      };

      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}`;
      
      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(mergedData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Fingerprint] ❌ 合并数据失败:', errorText);
        return null;
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      // 4. 删除旧的指纹记录（可选，如果不想保留历史记录）
      // 注意：这里不删除，保留历史记录以便追溯
      
      console.log('[Fingerprint] ✅ 数据迁移成功（合并模式）');
      return result;
    } else {
      // 目标用户不存在，直接创建新记录
      console.log('[Fingerprint] ✅ 目标用户不存在，创建新记录');
      
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      
      const response = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify([migrationData]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Fingerprint] ❌ 创建新记录失败:', errorText);
        return null;
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      console.log('[Fingerprint] ✅ 数据迁移成功（新建模式）');
      return result;
    }
  } catch (error: any) {
    console.error('[Fingerprint] ❌ 迁移数据时出错:', error);
    return null;
  }
}
