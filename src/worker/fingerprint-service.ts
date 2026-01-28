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
