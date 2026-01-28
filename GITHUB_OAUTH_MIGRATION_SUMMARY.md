# GitHub OAuth 身份认证迁移总结

## 概述

已完成从浏览器指纹识别到 GitHub OAuth 身份认证的迁移，实现了用户数据的自动同步和历史数据合并。

## 完成的任务

### Task 1: 数据库层自动化 (SQL)

**文件**: `migrate_to_github_oauth.sql`

**功能**:
- ✅ 创建了 `handle_new_user_sync()` 函数
  - 当 `auth.users` 表有新用户插入时，自动在 `public.user_analysis` 中创建记录
  - 映射关系：`public.user_analysis.id` 对应 `new.id`
  - `user_name` 优先使用 GitHub 元数据中的 `full_name`，如果没有则使用 `user_name`，最后使用 email 前缀
  - 默认初始化：`l_score` 到 `f_score` 赋默认值 50
  - 设置 `user_identity` 为 'github'

- ✅ 创建了触发器 `on_auth_user_created`
  - 监听 `auth.users` 表的 INSERT 事件
  - 自动调用 `handle_new_user_sync()` 函数

**使用方法**:
```sql
-- 在 Supabase SQL Editor 中执行
\i migrate_to_github_oauth.sql
```

### Task 2: 后端 API 适配

#### 2.1 fingerprint-service.ts

**新增函数**:
- ✅ `identifyUserByUserId(userId: string, env: Env)`: 根据 user_id (UUID) 查询用户
- ✅ `migrateFingerprintToUserId(fingerprint: string, userId: string, env: Env)`: 将指纹数据迁移到 GitHub User ID

#### 2.2 index.ts

**修改的接口**:
- ✅ `/api/v2/analyze`: 
  - 优先检查请求头中的 `Authorization` token
  - 如果存在有效的 GitHub OAuth token，从 JWT 中提取 `user_id`
  - 使用 `user_id` 进行 Upsert（冲突键为 `id`）
  - 如果不存在 token，则使用 fingerprint（冲突键为 `fingerprint`）

**新增接口**:
- ✅ `/api/fingerprint/migrate`:
  - 功能：将旧的 fingerprint 数据迁移到新的 GitHub User ID
  - 请求体：`{ fingerprint: string, userId: string }`
  - 响应：`{ status: 'success' | 'not_found' | 'error', data: UserData }`

### Task 3: 前端逻辑对接 (stats2.html)

#### 3.1 GitHub 登录函数

**函数**: `signInWithGitHub()` (已存在)
- 调用 `supabaseClient.auth.signInWithOAuth()` 进行 GitHub OAuth 登录

#### 3.2 身份合并逻辑

**位置**: `handleAuthStateChange()` 函数中

**核心逻辑**:
1. ✅ 用户登录后，检查 `localStorage` 中是否存有之前的 `fingerprint`
2. ✅ 如果存在旧指纹，调用 `/api/fingerprint/migrate` 接口
3. ✅ 将指纹下的历史分析数据（dimensions, stats 等）迁移到新的 GitHub User ID
4. ✅ 更新 `window.allData` 和 `window.currentUser`
5. ✅ 迁移成功后，跳过后续的指纹绑定逻辑

**代码片段**:
```javascript
// 【身份合并】检查是否有旧的 fingerprint 数据需要迁移
const oldFingerprint = localStorage.getItem('user_fingerprint');
const githubUserId = user.id;

if (oldFingerprint && githubUserId) {
    // 调用后端接口迁移数据
    const migrateResponse = await fetch('/api/fingerprint/migrate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            fingerprint: oldFingerprint,
            userId: githubUserId
        })
    });
    // ... 处理迁移结果
}
```

#### 3.3 refreshUserStats 修改

**修改内容**:
- ✅ 优先从 `supabase.auth.getSession()` 中获取当前登录用户的 ID
- ✅ 如果存在 GitHub OAuth 会话，使用 `user_id` 查询用户数据
- ✅ 如果不存在会话，降级使用 fingerprint 匹配

**优先级**:
1. GitHub OAuth User ID（最高优先级）
2. Fingerprint（降级方案）

## 数据流程

### 新用户注册流程

1. 用户通过 GitHub OAuth 登录
2. Supabase Auth 在 `auth.users` 表中创建新用户
3. 触发器 `on_auth_user_created` 自动触发
4. `handle_new_user_sync()` 函数在 `public.user_analysis` 中创建记录
5. 前端 `handleAuthStateChange()` 检测到登录，更新 UI

### 已有用户登录流程（带历史数据）

1. 用户通过 GitHub OAuth 登录
2. 前端检测到 `localStorage` 中有旧的 `fingerprint`
3. 调用 `/api/fingerprint/migrate` 接口
4. 后端将指纹数据迁移到 GitHub User ID
5. 前端更新 `window.allData` 和 `window.currentUser`
6. UI 显示迁移后的用户数据

### 数据分析提交流程

1. 前端调用 `/api/v2/analyze` 接口
2. 如果请求头中有 `Authorization` token：
   - 从 JWT 中提取 `user_id`
   - 使用 `user_id` 进行 Upsert（冲突键：`id`）
3. 如果没有 token：
   - 使用 `fingerprint` 进行 Upsert（冲突键：`fingerprint`）

## 数据库字段说明

### user_analysis 表关键字段

- `id` (UUID): 主键，对应 `auth.users.id`
- `user_name` (Text): GitHub 用户名（来自 `full_name` 或 `user_name`）
- `user_identity` (Text): 身份标识（'github' 或 'fingerprint'）
- `fingerprint` (Text): 浏览器指纹（可选，保留用于兼容）
- `l_score`, `p_score`, `d_score`, `e_score`, `f_score` (Integer): 维度分数（默认 50）

## 注意事项

1. **SQL 脚本执行**: 需要在 Supabase SQL Editor 中手动执行 `migrate_to_github_oauth.sql`
2. **RLS 策略**: 确保 `user_analysis` 表的 RLS 策略允许通过 `id` 和 `fingerprint` 进行 Upsert
3. **JWT Token 解析**: 后端从 `Authorization` header 中提取 JWT token，并解析 `sub` 字段作为 `user_id`
4. **数据迁移**: 迁移操作会保留历史记录，不会删除旧的指纹记录（可选）

## 测试建议

1. **新用户注册测试**:
   - 使用新的 GitHub 账号登录
   - 检查 `user_analysis` 表中是否自动创建记录
   - 验证 `user_identity` 是否为 'github'

2. **数据迁移测试**:
   - 使用已有 fingerprint 的浏览器登录
   - 检查控制台日志，确认迁移流程
   - 验证历史数据是否正确迁移到新的 User ID

3. **数据分析提交测试**:
   - 登录后提交分析数据
   - 检查数据是否更新到正确的 User ID 记录
   - 验证未登录时仍可使用 fingerprint

## 文件清单

- ✅ `migrate_to_github_oauth.sql` - SQL 脚本
- ✅ `src/worker/fingerprint-service.ts` - 新增 `identifyUserByUserId` 和 `migrateFingerprintToUserId`
- ✅ `src/worker/index.ts` - 修改 `/api/v2/analyze`，新增 `/api/fingerprint/migrate`
- ✅ `stats2.html` - 修改 `handleAuthStateChange` 和 `refreshUserStats`

## 后续优化建议

1. 考虑添加数据迁移的进度提示 UI
2. 添加迁移失败的重试机制
3. 考虑添加数据迁移的审计日志
4. 优化 JWT token 验证逻辑（使用 Supabase Admin API 验证）
