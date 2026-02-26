# GitHub Stats 同步问题诊断与解决方案

## 问题现象

查询 `user_analysis` 表时发现：
```json
{
  "github_stats": {},
  "github_login": null,
  "last_sync_at": null
}
```

## 根本原因

数据从未被同步过。需要触发一次 GitHub 数据同步。

## 解决方案

### 方案一：使用调试脚本（推荐）

1. 在浏览器打开应用并登录 GitHub
2. 打开浏览器开发者工具（F12）
3. 将 `debug-github-sync.js` 的内容复制到控制台执行
4. 根据输出结果诊断问题

### 方案二：手动触发同步

在浏览器控制台执行：

```javascript
// 获取 API 端点
const apiBase = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim().replace(/\/$/, '');

// 获取 token 和用户信息
const token = window.__githubAccessToken || localStorage.getItem('vibe_github_access_token');
const user = window.currentUser || window.currentUserData;

// 调用同步接口
fetch(apiBase + '/api/github/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accessToken: token,
    userId: user.user_name,
    fingerprint: user.fingerprint,
    id: user.id
  })
}).then(r => r.json()).then(console.log);
```

### 方案三：检查自动同步逻辑

前端已经实现了自动同步（`stats2.js` 19162行），触发条件：

1. 有 GitHub Access Token (`vibe_github_access_token`)
2. `github_login` 为空 或 `github_stats` 无效
3. 有 `userId` 或 `id`

**检查清单：**

- [ ] 用户已通过 GitHub OAuth 登录
- [ ] `localStorage` 中存在 `vibe_github_access_token`
- [ ] `window.currentUser` 或 `window.currentUserData` 存在
- [ ] 打开左侧抽屉时自动触发同步

## Token 获取方式

### 通过 GitHub OAuth（生产环境）

1. 配置 Supabase Auth：启用 GitHub Provider
2. 用户点击"GitHub 登录"按钮
3. 完成 OAuth 授权后，token 自动保存到 `vibe_github_access_token`

### 手动创建 Token（测试环境）

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 选择权限：
   - `public_repo`
   - `read:user`
   - `read:org`
4. 生成后复制 token，在控制台执行：
   ```javascript
   localStorage.setItem('vibe_github_access_token', 'ghp_YOUR_TOKEN_HERE');
   window.__githubAccessToken = 'ghp_YOUR_TOKEN_HERE';
   ```

## API 端点参数说明

```typescript
POST /api/github/sync
Content-Type: application/json

{
  "accessToken": string,  // 必填：GitHub OAuth token
  "id": string,           // 可选：user_analysis.id (UUID)，优先使用
  "userId": string,       // 可选：GitHub login
  "fingerprint": string   // 可选：浏览器指纹
}
```

**响应：**
```json
{
  "success": true,
  "cached": false,
  "data": {
    "login": "username",
    "totalRepoStars": 1234,
    "followers": 567,
    "mergedPRs": 89,
    "activeDays": 365,
    "globalRanking": "Top 10%",
    ...
  }
}
```

## 验证同步是否成功

### 1. 检查控制台日志

成功时会看到：
```
[GitHub Sync] ✅ Supabase 写入成功: { id, user_name, github_login, score }
```

### 2. 查询数据库

```sql
SELECT 
  github_login,
  github_stats,
  github_score,
  last_sync_at
FROM user_analysis
WHERE id = 'YOUR_USER_ID';
```

成功时 `github_stats` 应该是完整的 JSONB 对象（非空 `{}`）。

### 3. 检查左侧抽屉

刷新页面后，左侧抽屉应该显示 GitHub Combat 卡片，包含：
- Header：头像、用户名、排名
- 2x3 战力阵列：Merged PRs、Total Stars、Velocity、Reviews、Active Days、Repos
- Footer：Language DNA 渐变条、账号年龄、同步时间

## 常见错误处理

### Error: "Missing accessToken"
**原因**：没有 GitHub token  
**解决**：参考上述"Token 获取方式"

### Error: "RATE_LIMIT_EXCEEDED"
**原因**：GitHub API 限流（未认证：60次/小时，认证：5000次/小时）  
**解决**：等待 1 小时后重试，或使用 Personal Access Token

### Error: "GitHub API timeout"
**原因**：网络超时（15秒）  
**解决**：检查网络连接，重试

### Error: "RECORD_SET_FAILED"
**原因**：数据库中找不到对应用户记录  
**解决**：
1. 确认用户已在 `user_analysis` 表中存在
2. 检查传入的 `id`、`userId`、`fingerprint` 是否正确
3. 查看后端日志确认具体原因

## 数据库迁移脚本

确保已执行以下迁移：

```sql
-- 添加字段
ALTER TABLE user_analysis 
ADD COLUMN IF NOT EXISTS github_stats JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS github_login TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_user_analysis_last_sync_at 
ON user_analysis(last_sync_at) WHERE last_sync_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_analysis_user_name 
ON user_analysis(user_name);

CREATE INDEX IF NOT EXISTS idx_user_analysis_github_login 
ON user_analysis(github_login);
```

## 性能优化

- **冷却时间**：8 小时内返回缓存，避免频繁请求 GitHub API
- **处理时间**：数据加工目标 <20ms（单次遍历，Map 结构）
- **超时控制**：15秒超时，避免长时间挂起

## 后续建议

1. **监控日志**：使用 `wrangler tail` 查看实时同步日志
2. **定时任务**：考虑为活跃用户设置自动刷新（Cron）
3. **降级策略**：API 失败时显示上次缓存数据
4. **用户提示**：首次同步时显示 Loading 状态
