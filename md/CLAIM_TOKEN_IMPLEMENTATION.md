# Claim Token 认领机制实现指南

## 概述

本文档说明如何在 `stats2.html` 中实现基于 `claim_token` 的强制认领机制,实现匿名数据到 GitHub 账号的物理过户。

## 后端修改总结

### 1. fingerprint-service.ts

已完全重写 `migrateFingerprintToUserId` 函数:

- **强制令牌校验**: 必须提供 `claimToken`,否则拒绝迁移
- **精准溯源**: 使用 `claim_token` 查找源记录
- **清理目标**: 删除 GitHub 登录时自动生成的空记录,防止主键冲突
- **物理过户**: 使用 COALESCE 确保 NULL 值也能正常累加
- **销毁令牌**: 迁移成功后删除源记录

### 2. index.ts - /api/v2/analyze 接口

已实现 `claim_token` 生成和返回:

```typescript
// 第 1600-1606 行: 为匿名用户生成 claim_token
let claimToken: string | null = null;
if (!useUserIdForUpsert) {
  claimToken = crypto.randomUUID();
  console.log('[Worker] 🔑 为匿名用户生成 claim_token:', claimToken.substring(0, 8) + '...');
}

// 第 1616 行: 保存到数据库
...(claimToken ? { claim_token: claimToken } : {}),

// 第 1762-1765 行: 添加到返回结果
if (payload.claim_token) {
  result.claim_token = payload.claim_token;
  console.log('[Worker] 🔑 claim_token 已添加到返回结果:', payload.claim_token.substring(0, 8) + '...');
}
```

### 3. index.ts - /api/fingerprint/migrate 接口

已修改为强制要求 `claimToken`:

```typescript
// 强制令牌校验
if (!claimToken) {
  return c.json({
    status: 'error',
    error: 'claimToken 参数必填 - 必须先进行分析才能认领数据',
    errorCode: 'MISSING_CLAIM_TOKEN',
  }, 400);
}

// 执行迁移
const result = await migrateFingerprintToUserId('', githubUserId, claimToken, env);
```

## 前端实现步骤

### 步骤 1: 捕获 claim_token (分析完成后)

在 `stats2.html` 中,找到分析请求的回调函数,添加以下代码:

```javascript
// 假设分析请求在某个函数中,例如 performAnalysis()
async function performAnalysis(chatData) {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/v2/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatData: chatData,
        lang: currentLang || 'zh-CN'
      })
    });
    
    const result = await response.json();
    
    // 【关键】捕获 claim_token
    if (result.claim_token) {
      localStorage.setItem('vibe_claim_token', result.claim_token);
      console.log('🔑 claim_token 已保存:', result.claim_token.substring(0, 8) + '...');
    }
    
    // 继续处理其他分析结果...
    displayAnalysisResults(result);
    
  } catch (error) {
    console.error('分析失败:', error);
  }
}
```

### 步骤 2: GitHub 登录后检查认领 (onAuthStateChange)

在 Supabase Auth 的状态变化监听器中添加认领逻辑:

```javascript
// 假设已经有 Supabase 客户端初始化
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    console.log('✅ GitHub 登录成功');
    
    // 【关键】检查是否有待认领的数据
    const claimToken = localStorage.getItem('vibe_claim_token');
    
    if (claimToken) {
      console.log('🔍 检测到待认领的数据,开始认领流程...');
      await attemptDataClaim(session, claimToken);
    } else {
      console.log('ℹ️ 无待认领数据,直接加载用户统计');
      await refreshUserStats();
    }
  }
});
```

### 步骤 3: 实现认领函数

添加以下认领函数:

```javascript
/**
 * 尝试认领匿名数据
 * @param {Object} session - Supabase session 对象
 * @param {string} claimToken - 认领令牌
 */
async function attemptDataClaim(session, claimToken) {
  try {
    const user = session.user;
    
    if (!user || !user.id) {
      console.error('❌ 用户信息无效');
      return;
    }
    
    console.log('🔄 开始认领数据...', {
      userId: user.id.substring(0, 8) + '...',
      claimToken: claimToken.substring(0, 8) + '...'
    });
    
    const response = await fetch(`${API_ENDPOINT}/api/fingerprint/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        userId: user.id,
        claimToken: claimToken
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('✅ 数据认领成功!', result.data);
      
      // 【关键】清除 claim_token
      localStorage.removeItem('vibe_claim_token');
      
      // 显示成功提示
      showNotification('数据认领成功!', 'success');
      
      // 刷新用户统计
      await refreshUserStats();
      
    } else {
      console.error('❌ 数据认领失败:', result.error);
      
      // 如果是 claim_token 无效,清除它
      if (result.errorCode === 'CLAIM_FAILED') {
        localStorage.removeItem('vibe_claim_token');
      }
      
      showNotification(`认领失败: ${result.error}`, 'error');
    }
    
  } catch (error) {
    console.error('❌ 认领过程出错:', error);
    showNotification('认领过程出错,请稍后重试', 'error');
  }
}
```

### 步骤 4: 实现刷新用户统计函数

```javascript
/**
 * 刷新用户统计数据
 */
async function refreshUserStats() {
  try {
    console.log('🔄 刷新用户统计数据...');
    
    // 从 Supabase 获取最新的用户数据
    const { data: session } = await supabaseClient.auth.getSession();
    
    if (!session || !session.session) {
      console.log('ℹ️ 未登录,跳过刷新');
      return;
    }
    
    const userId = session.session.user.id;
    
    // 查询用户分析数据
    const { data, error } = await supabaseClient
      .from('user_analysis')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('❌ 查询用户数据失败:', error);
      return;
    }
    
    if (data) {
      console.log('✅ 用户数据加载成功:', {
        total_messages: data.total_messages,
        total_chars: data.total_chars
      });
      
      // 更新 UI 显示
      updateUserStatsUI(data);
    }
    
  } catch (error) {
    console.error('❌ 刷新用户统计失败:', error);
  }
}
```

### 步骤 5: 添加通知函数 (可选)

```javascript
/**
 * 显示通知消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 ('success' | 'error' | 'info')
 */
function showNotification(message, type = 'info') {
  // 可以使用现有的通知系统,或创建一个简单的提示
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // 示例:创建一个简单的 toast 通知
  const toast = document.createElement('div');
  toast.className = `notification notification-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? 'rgba(0, 255, 65, 0.2)' : 'rgba(255, 0, 0, 0.2)'};
    border: 1px solid ${type === 'success' ? '#00ff41' : '#ff0000'};
    color: ${type === 'success' ? '#00ff41' : '#ff6b6b'};
    border-radius: 4px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  // 3秒后自动移除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
```

## 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户进行匿名分析                                          │
│    ↓                                                         │
│    调用 /api/v2/analyze                                      │
│    ↓                                                         │
│    后端生成 claim_token 并返回                               │
│    ↓                                                         │
│    前端保存到 localStorage.setItem('vibe_claim_token', ...) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 用户登录 GitHub                                           │
│    ↓                                                         │
│    onAuthStateChange 触发                                    │
│    ↓                                                         │
│    检查 localStorage.getItem('vibe_claim_token')            │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────┴───────┐
                    │ 有 claim_token? │
                    └───────┬───────┘
                    是 ↓           ↓ 否
┌─────────────────────────────┐   ┌──────────────────────┐
│ 3. 调用认领接口              │   │ 直接加载用户统计      │
│    ↓                        │   └──────────────────────┘
│    POST /api/fingerprint/   │
│         migrate             │
│    Body: {                  │
│      userId: ...,           │
│      claimToken: ...        │
│    }                        │
│    ↓                        │
│    后端验证并迁移数据        │
│    ↓                        │
│    成功: 清除 claim_token   │
│    失败: 显示错误提示        │
└─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 刷新用户统计                                              │
│    ↓                                                         │
│    从 Supabase 查询最新数据                                  │
│    ↓                                                         │
│    更新 UI 显示                                              │
└─────────────────────────────────────────────────────────────┘
```

## 安全与健壮性

### 1. 防止冒领

后端已实现:
- 检查源记录的 `user_identity` 必须不是 'github'
- 确保 claim_token 只能使用一次(迁移后删除源记录)

### 2. 事务性

后端已实现:
- 迁移失败时保留原始匿名数据
- 不执行 DELETE 或销毁 claim_token

### 3. 错误处理

前端应实现:
- 网络错误重试机制
- 用户友好的错误提示
- 日志记录便于调试

## 测试步骤

1. **测试匿名分析**:
   - 清空 localStorage
   - 执行分析
   - 检查 localStorage 中是否有 `vibe_claim_token`

2. **测试认领流程**:
   - 登录 GitHub
   - 检查是否自动触发认领
   - 验证数据是否正确迁移
   - 确认 claim_token 已被清除

3. **测试边界情况**:
   - 无 claim_token 时登录
   - claim_token 无效时的处理
   - 重复认领的防护

## 注意事项

1. **API_ENDPOINT**: 确保正确配置 API 端点地址
2. **错误处理**: 添加完善的错误处理和用户提示
3. **日志记录**: 保留详细的控制台日志便于调试
4. **UI 反馈**: 在认领过程中显示加载状态

## 相关文件

- `src/worker/fingerprint-service.ts` - 迁移函数实现
- `src/worker/index.ts` - API 接口实现
- `stats2.html` - 前端页面(需要添加上述代码)
- `claim-token-demo.html` - 交互式演示页面

## 总结

通过以上修改,我们实现了:

1. ✅ 废弃所有仅依赖 fingerprint 的迁移逻辑
2. ✅ 强制引入 claim_token 作为唯一合法的认领凭证
3. ✅ 实现匿名数据到 GitHub 账号的物理过户
4. ✅ 防止主键冲突和数据重复
5. ✅ 确保事务性和数据安全

前端只需按照上述步骤在 `stats2.html` 中添加相应代码即可完成集成。
