# 🔑 Claim Token 认领机制 - 快速参考

## 核心概念

**claim_token**: 匿名分析时生成的唯一认领凭证,用于将匿名数据迁移到 GitHub 账号。

## 后端 API

### 1. 分析接口 (生成 claim_token)

```http
POST /api/v2/analyze
Content-Type: application/json

{
  "chatData": [...],
  "lang": "zh-CN"
}

响应:
{
  "status": "success",
  "claim_token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "dimensions": { ... },
  ...
}
```

### 2. 迁移接口 (认领数据)

```http
POST /api/fingerprint/migrate
Content-Type: application/json
Authorization: Bearer {github_oauth_token}

{
  "userId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "claimToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}

成功响应:
{
  "status": "success",
  "message": "数据认领成功",
  "data": { ... },
  "requiresRefresh": true
}

失败响应:
{
  "status": "error",
  "error": "claim_token 无效或已过期,或数据已被认领",
  "errorCode": "CLAIM_FAILED"
}
```

## 前端代码片段

### 1. 捕获 claim_token (分析完成后)

```javascript
// 在分析请求的回调中
async function onAnalysisComplete(result) {
  if (result.claim_token) {
    localStorage.setItem('vibe_claim_token', result.claim_token);
    console.log('🔑 claim_token 已保存');
  }
}
```

### 2. GitHub 登录后检查认领

```javascript
// 在 Supabase Auth 状态变化监听器中
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    const claimToken = localStorage.getItem('vibe_claim_token');
    
    if (claimToken) {
      // 有待认领的数据
      await attemptDataClaim(session, claimToken);
    } else {
      // 无待认领数据,直接加载
      await refreshUserStats();
    }
  }
});
```

### 3. 认领函数

```javascript
async function attemptDataClaim(session, claimToken) {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/fingerprint/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        userId: session.user.id,
        claimToken: claimToken
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // 成功:清除 claim_token
      localStorage.removeItem('vibe_claim_token');
      showNotification('数据认领成功!', 'success');
      await refreshUserStats();
    } else {
      // 失败:显示错误
      if (result.errorCode === 'CLAIM_FAILED') {
        localStorage.removeItem('vibe_claim_token');
      }
      showNotification(`认领失败: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('认领过程出错:', error);
    showNotification('认领过程出错,请稍后重试', 'error');
  }
}
```

### 4. 刷新用户统计

```javascript
async function refreshUserStats() {
  const { data: session } = await supabaseClient.auth.getSession();
  
  if (!session?.session) return;
  
  const { data, error } = await supabaseClient
    .from('user_analysis')
    .select('*')
    .eq('id', session.session.user.id)
    .single();
  
  if (data) {
    updateUserStatsUI(data);
  }
}
```

## 数据库字段

### user_analysis 表

```sql
-- 认领相关字段
claim_token UUID,           -- 认领令牌(匿名用户有值,GitHub用户为NULL)
user_identity TEXT,         -- 'fingerprint' 或 'github'
total_messages INTEGER,     -- 总消息数
total_chars INTEGER,        -- 总字符数

-- 其他重要字段
id UUID PRIMARY KEY,        -- 用户ID(GitHub用户为auth.users.id)
fingerprint TEXT,           -- 浏览器指纹
l_score, p_score, d_score, e_score, f_score INTEGER,  -- 维度分数
stats JSONB,                -- 完整统计数据
personality_data JSONB,     -- 五维语义指纹
```

## 完整流程

```
1. 匿名分析
   ↓
   生成 claim_token
   ↓
   localStorage.setItem('vibe_claim_token', token)

2. GitHub 登录
   ↓
   onAuthStateChange 触发
   ↓
   检查 localStorage.getItem('vibe_claim_token')

3. 有 claim_token?
   ├─ 是 → 调用 /api/fingerprint/migrate
   │         ↓
   │         成功 → localStorage.removeItem('vibe_claim_token')
   │         ↓
   │         refreshUserStats()
   │
   └─ 否 → 直接 refreshUserStats()
```

## 错误代码

| 错误代码 | 说明 | 处理方式 |
|---------|------|---------|
| `MISSING_CLAIM_TOKEN` | 缺少 claim_token | 提示用户先进行分析 |
| `CLAIM_FAILED` | claim_token 无效或已过期 | 清除 localStorage,提示重新分析 |
| `AUTHENTICATION_REQUIRED` | 未提供 GitHub token | 提示用户登录 |
| `USER_ID_MISMATCH` | token 与 userId 不匹配 | 重新登录 |

## 安全检查清单

- [x] claim_token 必须存在
- [x] 源记录必须是匿名身份
- [x] GitHub token 必须有效
- [x] userId 必须匹配
- [x] 迁移前清理空记录
- [x] 迁移后删除源记录
- [x] 失败时保留原始数据

## 测试清单

- [ ] 匿名分析生成 claim_token
- [ ] claim_token 保存到 localStorage
- [ ] GitHub 登录触发认领
- [ ] 数据正确迁移
- [ ] claim_token 被清除
- [ ] 无 claim_token 时正常登录
- [ ] claim_token 无效时的错误处理
- [ ] 重复认领被拒绝

## 调试技巧

### 查看 localStorage

```javascript
// 控制台执行
console.log('claim_token:', localStorage.getItem('vibe_claim_token'));
```

### 手动清除 claim_token

```javascript
// 控制台执行
localStorage.removeItem('vibe_claim_token');
```

### 查看后端日志

后端会输出详细日志,关键标识:
- `🔑` - claim_token 相关
- `✅` - 成功操作
- `❌` - 错误
- `⚠️` - 警告

## 常见问题

**Q: 用户已经登录 GitHub,还能生成 claim_token 吗?**
A: 不能。只有匿名用户(未登录)才会生成 claim_token。

**Q: claim_token 会过期吗?**
A: 不会自动过期,但只能使用一次。迁移成功后会被删除。

**Q: 如果用户清除了浏览器数据,claim_token 会丢失吗?**
A: 是的。localStorage 会被清除,但数据仍在数据库中,只是无法认领。

**Q: 可以手动输入 claim_token 认领吗?**
A: 理论上可以,但不建议。正常流程应该是自动认领。

## 相关文件

- `src/worker/fingerprint-service.ts` - 迁移逻辑
- `src/worker/index.ts` - API 接口
- `claim-token-demo.html` - 演示页面
- `CLAIM_TOKEN_IMPLEMENTATION.md` - 详细文档
- `MODIFICATION_SUMMARY.md` - 修改总结

## 快速开始

1. 打开 `claim-token-demo.html` 查看演示
2. 阅读 `CLAIM_TOKEN_IMPLEMENTATION.md` 了解详细实现
3. 在 `stats2.html` 中添加上述代码片段
4. 测试完整流程

---

**最后更新**: 2026-01-28
**版本**: 1.0.0
