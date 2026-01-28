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
 * 将匿名数据迁移到 GitHub User ID (基于 claim_token 的强制认领机制)
 * @param fingerprint - 旧的浏览器指纹 (已废弃,仅用于兼容性)
 * @param userId - 新的 GitHub User ID (UUID)
 * @param claimToken - 影子令牌 (必填,唯一合法的认领凭证)
 * @param env - 环境变量
 * @returns 迁移后的用户数据或 null
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

  // 【强制令牌校验】必须提供 claimToken
  if (!claimToken) {
    console.error('[Migrate] ❌ 缺少 claim_token,迁移被拒绝');
    return null;
  }

  try {
    console.log('[Migrate] 🔑 开始基于 claim_token 的强制认领流程...');
    
    // 【步骤 1: 精准溯源】使用 claim_token 查找源记录
    const sourceRecord = await identifyUserByClaimToken(claimToken, env);
    
    if (!sourceRecord) {
      console.error('[Migrate] ❌ claim_token 无效或已过期,未找到待认领记录');
      return null;
    }

    console.log('[Migrate] ✅ 找到待认领记录:', {
      recordId: sourceRecord.id?.substring(0, 8) + '...',
      total_messages: sourceRecord.total_messages || 0,
      total_chars: sourceRecord.total_chars || 0,
    });

    // 【防止冒领】确保源记录是匿名身份
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

    // 【步骤 3: 检查目标用户是否已有数据】
    const targetUser = await identifyUserByUserId(userId, env);
    const targetMessages = targetUser?.total_messages || 0;
    const targetChars = targetUser?.total_chars || 0;
    const sourceMessages = sourceRecord.total_messages || 0;
    const sourceChars = sourceRecord.total_chars || 0;

    console.log('[Migrate] 📊 数据对比:', {
      target: { messages: targetMessages, chars: targetChars },
      source: { messages: sourceMessages, chars: sourceChars },
    });

    // 【步骤 4: 物理过户】使用 UPDATE 语句灌入数据
    if (targetUser) {
      // 目标用户已存在,执行增量累加
      console.log('[Migrate] 🔄 目标用户已存在,执行增量累加...');
      
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}`;
      
      const updateData: any = {
        // 使用 COALESCE 确保 NULL 值也能正常累加
        total_messages: (targetMessages || 0) + (sourceMessages || 0),
        total_chars: (targetChars || 0) + (sourceChars || 0),
        user_identity: 'github',
        updated_at: new Date().toISOString(),
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
        console.error('[Migrate] ❌ 增量累加失败:', errorText);
        throw new Error(`增量累加失败: ${errorText}`);
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      console.log('[Migrate] ✅ 增量累加成功');
      
      // 【步骤 5: 销毁令牌】删除源记录
      await deleteSourceRecord(sourceRecord.id, env);
      
      return result;
    } else {
      // 目标用户不存在,直接创建新记录
      console.log('[Migrate] 🆕 目标用户不存在,创建新记录...');
      
      const insertData: any = {
        ...sourceRecord,
        id: userId,
        user_identity: 'github',
        claim_token: null, // 清除 claim_token
        updated_at: new Date().toISOString(),
      };

      // 【关键修复】创建新记录前，必须先释放 "unique_analyze_record" 约束
      // 约束包括 (user_name, roast_text, total_messages) 以及 fingerprint 唯一约束
      // 如果我们直接插入一条和源记录内容完全一样的数据，会触发唯一性冲突
      // 解决方案：先临时修改源记录的 roast_text 和 fingerprint，避开所有冲突
      console.log('[Migrate] 🔓 更新源记录以释放唯一性约束...');
      const releaseConstraintUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceRecord.id)}`;
      await fetch(releaseConstraintUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roast_text: `[MIGRATED] ${sourceRecord.roast_text || ''}`.substring(0, 500),
          fingerprint: `migrated_${sourceRecord.id}` // 同时释放 fingerprint 唯一约束
        }),
      });

      const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      
      const response = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify([insertData]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Migrate] ❌ 创建新记录失败:', errorText);
        throw new Error(`创建新记录失败: ${errorText}`);
      }

      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      
      console.log('[Migrate] ✅ 新记录创建成功');
      
      // 【步骤 5: 销毁令牌】删除源记录
      await deleteSourceRecord(sourceRecord.id, env);
      
      return result;
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
