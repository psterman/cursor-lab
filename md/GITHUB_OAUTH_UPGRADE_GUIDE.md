# GitHub OAuth 登录升级指南

## 概述

已将 stats2.html 从手动输入 GitHub ID 升级为专业的 GitHub OAuth 一键登录方案。

## 核心功能

### 1. GitHub OAuth 登录

**函数**：`loginWithGitHub()`

**功能**：
- 调用 `supabaseClient.auth.signInWithOAuth()` 
- Provider: `github`
- 自动配置 `redirectTo` 为当前页面地址
- 请求权限：`read:user user:email`

**代码位置**：stats2.html 第 4619-4657 行

### 2. 认证状态监听

**函数**：`handleAuthStateChange(session)`

**功能**：
- 在页面初始化时检查 `supabaseClient.auth.getSession()`
- 监听 `onAuthStateChange` 事件
- 自动提取 GitHub 用户名和头像
- 自动绑定指纹到数据库

**代码位置**：stats2.html 第 4735-4950 行

### 3. 自动指纹绑定

**逻辑**：
1. 从 `user_metadata` 提取 GitHub 信息
2. 获取当前设备指纹
3. 使用 `upsert()` 同步到 `user_analysis` 表
4. 冲突键：`user_name`
5. 更新字段：`fingerprint`, `updated_at`

**关键代码**：
```javascript
const { data: upsertResult } = await supabaseClient
    .from('user_analysis')
    .upsert({
        user_name: normalizedUsername,  // 冲突键
        fingerprint: currentFingerprint,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'user_name',
        ignoreDuplicates: false
    })
    .select()
    .single();
```

### 4. UI 状态切换

**函数**：`updateAuthUI(userInfo)`

**功能**：
- 未登录：显示 GitHub 登录按钮（深色调、GitHub Logo、悬停动画）
- 已登录：显示用户头像、用户名、"查看 GitHub"链接、"退出"按钮

**代码位置**：stats2.html 第 4721-4784 行

### 5. 退出登录

**函数**：`logout()`

**功能**：
- 清理 localStorage
- 调用 `supabaseClient.auth.signOut()`
- 清理全局变量
- 刷新 UI

**代码位置**：stats2.html 第 4690-4733 行

## 数据库字段说明

### ⚠️ 重要：字段映射

根据错误信息，数据库表 `user_analysis` 中**只有 `user_name` 字段，没有 `github_username` 字段**。

**修复**：
- ✅ 所有数据库操作只使用 `user_name` 字段
- ❌ 移除了所有对 `github_username` 字段的更新
- ❌ 移除了所有对 `github_id` 字段的更新

### 表结构

```sql
user_analysis 表字段：
- id (UUID, Primary Key)
- user_name (Text) ✅ 使用此字段存储 GitHub 用户名
- fingerprint (Text, 可为 NULL)
- created_at (Timestamp)
- updated_at (Timestamp)
```

## UI 改造

### 移除的内容
- ❌ GitHub ID 输入框（`drawer-github-username`）
- ❌ "保存"按钮

### 新增的内容
- ✅ GitHub 登录按钮（深色调、GitHub Logo、悬停动画）
- ✅ 用户信息显示区域（头像、用户名、链接）
- ✅ 退出登录按钮

### 登录按钮样式

```html
<button 
    onclick="loginWithGitHub()"
    class="w-full px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] border border-[#444d56] rounded-md text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
>
    <svg><!-- GitHub Logo SVG --></svg>
    <span>使用 GitHub 登录</span>
</button>
```

## 数据流闭环

### 登录流程

```
1. 用户点击"GitHub 登录"按钮
2. 调用 loginWithGitHub()
3. 重定向到 GitHub OAuth 授权页面
4. 用户授权后，GitHub 重定向回当前页面
5. handleAuthStateChange() 自动触发
6. 提取 GitHub 信息（用户名、头像）
7. 获取设备指纹
8. 执行 upsert 操作（绑定指纹）
9. 更新 window.currentUser
10. 触发地图脉冲
11. 打开抽屉并显示统计卡片
12. 刷新排名卡片
```

### 退出流程

```
1. 用户点击"退出"按钮
2. 调用 logout()
3. 清理 localStorage
4. 调用 supabaseClient.auth.signOut()
5. 清理全局变量
6. 更新 UI（显示登录按钮）
7. 刷新排名卡片（显示全球最强模式）
```

## Supabase 配置要求

### 1. GitHub OAuth Provider 配置

在 Supabase Dashboard 中：
1. 进入 Authentication → Providers
2. 启用 GitHub Provider
3. 配置 Client ID 和 Client Secret
4. 设置 Redirect URL：`https://your-domain.com/auth/callback`

### 2. RLS 策略配置

执行以下 SQL：

```sql
-- 允许通过 user_name 更新 fingerprint
CREATE POLICY "允许通过 user_name 更新 fingerprint"
ON user_analysis
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 允许插入新用户
CREATE POLICY "允许插入新用户"
ON user_analysis
FOR INSERT
WITH CHECK (true);
```

### 3. 表结构验证

确认 `user_analysis` 表包含以下字段：

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_analysis' 
ORDER BY ordinal_position;
```

**预期结果**：
- ✅ `user_name` (text)
- ✅ `fingerprint` (text)
- ❌ 不应该有 `github_username` 字段
- ❌ 不应该有 `github_id` 字段

## 测试步骤

### 步骤 1: 验证 Supabase OAuth 配置

1. 打开 Supabase Dashboard → Authentication → Providers
2. 确认 GitHub Provider 已启用
3. 检查 Redirect URL 是否正确配置

### 步骤 2: 测试登录流程

1. 打开 stats2.html
2. 点击"使用 GitHub 登录"按钮
3. 应该重定向到 GitHub 授权页面
4. 授权后，应该重定向回 stats2.html
5. 检查控制台日志：
   - `[Auth] 🔔 认证状态变化事件: SIGNED_IN`
   - `[Auth] ✅ 提取到 GitHub 信息: ...`
   - `[Auth] ✅ Upsert 操作成功，指纹已绑定`

### 步骤 3: 验证数据库更新

```sql
SELECT user_name, fingerprint, updated_at 
FROM user_analysis 
WHERE user_name = 'your_github_username';
```

**预期结果**：
- `user_name` 字段应该有值（GitHub 用户名）
- `fingerprint` 字段应该有值（64 位十六进制字符串）
- `updated_at` 应该是最新时间

### 步骤 4: 验证 UI 状态

1. **登录后**：
   - 应该显示用户头像和用户名
   - 应该显示"查看 GitHub"链接
   - 应该显示"退出"按钮
   - 不应该显示登录按钮

2. **地图脉冲**：
   - 控制台应显示：`[Auth] ✅ 已触发地图脉冲`
   - 地图上应该出现脉冲点

3. **抽屉打开**：
   - 左侧抽屉应该自动打开
   - 应该显示用户统计卡片

### 步骤 5: 测试退出登录

1. 点击"退出"按钮
2. 检查控制台日志：`[Auth] ✅ 已退出登录`
3. 验证 UI：
   - 应该显示登录按钮
   - 不应该显示用户信息
   - 排名卡片应该切换到全球最强模式

## 故障排查

### 问题 1: OAuth 登录失败

**症状**：点击登录按钮后没有反应或报错

**可能原因**：
1. Supabase GitHub Provider 未配置
2. Redirect URL 配置错误
3. Client ID/Secret 错误

**解决方案**：
1. 检查 Supabase Dashboard 中的 GitHub Provider 配置
2. 确认 Redirect URL 与当前页面 URL 匹配
3. 检查浏览器控制台的错误信息

### 问题 2: 无法提取 GitHub 用户名

**症状**：控制台显示 `[Auth] ⚠️ 无法从 user_metadata 中提取 GitHub 用户名`

**可能原因**：
1. GitHub OAuth 权限不足
2. user_metadata 结构不同

**解决方案**：
1. 检查 OAuth 请求的 scopes：`read:user user:email`
2. 在控制台查看 `user.user_metadata` 的实际内容
3. 根据实际结构调整提取逻辑

### 问题 3: Upsert 操作失败

**症状**：控制台显示 `[Auth] ❌ Upsert 操作失败`

**可能原因**：
1. 数据库表没有 `user_name` 唯一约束
2. RLS 策略阻止操作
3. 字段名不匹配

**解决方案**：
1. 检查表结构：`SELECT * FROM information_schema.table_constraints WHERE table_name = 'user_analysis';`
2. 如果 `user_name` 不是唯一键，需要添加：
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analysis_user_name_unique 
   ON user_analysis(user_name) 
   WHERE user_name IS NOT NULL;
   ```
3. 检查 RLS 策略
4. 确认字段名正确（只使用 `user_name`，不使用 `github_username`）

### 问题 4: 登录后 UI 未更新

**症状**：登录成功但 UI 仍显示登录按钮

**解决方案**：
1. 检查 `updateAuthUI()` 函数是否被调用
2. 检查 DOM 元素是否正确找到
3. 手动触发更新：`updateAuthUI({ username: 'test', avatarUrl: '...' })`

## 兼容性说明

### 保留的功能
- ✅ 指纹识别作为"静默登录"的辅助手段
- ✅ 如果用户已通过指纹识别，仍可正常使用
- ✅ 兼容现有的变量名（`supabaseClient`, `allData`）

### 废弃的功能
- ❌ 手动输入 GitHub ID（已移除输入框）
- ❌ `saveGitHubUsername()` 函数（保留但不再使用）

## 代码关键位置

- `loginWithGitHub()`: stats2.html 第 4619-4657 行
- `logout()`: stats2.html 第 4690-4733 行
- `handleAuthStateChange()`: stats2.html 第 4735-4950 行
- `updateAuthUI()`: stats2.html 第 4721-4784 行
- 页面初始化认证监听: stats2.html 第 6220-6260 行
- UI 改造（登录按钮）: stats2.html 第 2029-2048 行

## 验证清单

- [ ] Supabase GitHub OAuth Provider 已配置
- [ ] Redirect URL 已正确设置
- [ ] 数据库表结构正确（只有 `user_name` 字段）
- [ ] RLS 策略已配置
- [ ] 登录按钮正常显示
- [ ] OAuth 登录流程正常
- [ ] 指纹自动绑定成功
- [ ] UI 状态正确切换
- [ ] 地图脉冲正常触发
- [ ] 抽屉自动打开
- [ ] 退出登录功能正常

## 相关文件

- `stats2.html` - 已升级的前端代码
- `GITHUB_OAUTH_UPGRADE_GUIDE.md` - 本文档
