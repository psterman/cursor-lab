# Supabase RLS (行级安全策略) 配置指南

## 概述

为了确保指纹识别和身份绑定功能正常工作，需要在 Supabase 中正确配置 RLS 策略。

## 表结构

假设 `user_analysis` 表包含以下字段：
- `id` (UUID, Primary Key)
- `user_name` (Text)
- `fingerprint` (Text, 可为 NULL)
- `github_username` (Text, 可为 NULL)
- `github_id` (Text, 可为 NULL)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)
- 其他业务字段...

## RLS 策略配置

### 1. 启用 RLS

首先确保在 `user_analysis` 表上启用了 RLS：

```sql
ALTER TABLE user_analysis ENABLE ROW LEVEL SECURITY;
```

### 2. 查询策略（SELECT）

允许通过指纹查询用户信息：

```sql
-- 策略名称：允许通过指纹查询用户
CREATE POLICY "允许通过指纹查询用户"
ON user_analysis
FOR SELECT
USING (true);  -- 允许所有查询（根据需求可以限制为特定条件）
```

**或者更严格的策略**（仅允许查询自己的数据）：

```sql
-- 策略名称：仅允许查询自己的数据（通过指纹）
CREATE POLICY "仅允许查询自己的数据"
ON user_analysis
FOR SELECT
USING (
  -- 允许查询匹配当前指纹的记录
  fingerprint = current_setting('request.jwt.claims', true)::json->>'fingerprint'
  OR
  -- 允许查询所有记录（如果需要全局排名功能）
  true
);
```

### 3. 插入策略（INSERT）

允许创建新用户：

```sql
-- 策略名称：允许插入新用户
CREATE POLICY "允许插入新用户"
ON user_analysis
FOR INSERT
WITH CHECK (true);  -- 允许所有插入操作
```

### 4. 更新策略（UPDATE）

允许更新用户信息（包括指纹绑定）：

```sql
-- 策略名称：允许更新用户信息
CREATE POLICY "允许更新用户信息"
ON user_analysis
FOR UPDATE
USING (true)  -- 允许更新所有记录
WITH CHECK (true);
```

**或者更严格的策略**（仅允许更新自己的数据）：

```sql
-- 策略名称：仅允许更新自己的数据
CREATE POLICY "仅允许更新自己的数据"
ON user_analysis
FOR UPDATE
USING (
  -- 允许更新匹配当前指纹的记录
  fingerprint = current_setting('request.jwt.claims', true)::json->>'fingerprint'
  OR
  -- 允许更新匹配 user_name 的记录（用于绑定操作）
  user_name = current_setting('request.jwt.claims', true)::json->>'user_name'
)
WITH CHECK (true);
```

### 5. 删除策略（DELETE）

根据需求决定是否允许删除：

```sql
-- 策略名称：禁止删除（推荐）
CREATE POLICY "禁止删除用户数据"
ON user_analysis
FOR DELETE
USING (false);  -- 禁止所有删除操作
```

## 完整配置示例（推荐）

如果您的应用需要：
- 允许所有用户查询所有数据（用于排名功能）
- 允许所有用户插入新数据
- 允许所有用户更新数据（用于指纹绑定）

可以使用以下简化配置：

```sql
-- 1. 启用 RLS
ALTER TABLE user_analysis ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有策略（如果有）
DROP POLICY IF EXISTS "允许查询" ON user_analysis;
DROP POLICY IF EXISTS "允许插入" ON user_analysis;
DROP POLICY IF EXISTS "允许更新" ON user_analysis;
DROP POLICY IF EXISTS "允许删除" ON user_analysis;

-- 3. 创建查询策略（允许所有查询）
CREATE POLICY "允许查询"
ON user_analysis
FOR SELECT
USING (true);

-- 4. 创建插入策略（允许所有插入）
CREATE POLICY "允许插入"
ON user_analysis
FOR INSERT
WITH CHECK (true);

-- 5. 创建更新策略（允许所有更新）
CREATE POLICY "允许更新"
ON user_analysis
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 6. 创建删除策略（禁止删除）
CREATE POLICY "禁止删除"
ON user_analysis
FOR DELETE
USING (false);
```

## 索引优化

为了提高查询性能，建议在 `fingerprint` 和 `user_name` 字段上创建索引：

```sql
-- 为 fingerprint 字段创建索引（用于快速查找）
CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint 
ON user_analysis(fingerprint) 
WHERE fingerprint IS NOT NULL;

-- 为 user_name 字段创建索引（用于快速查找）
CREATE INDEX IF NOT EXISTS idx_user_analysis_user_name 
ON user_analysis(user_name) 
WHERE user_name IS NOT NULL;

-- 为 github_username 字段创建索引（可选）
CREATE INDEX IF NOT EXISTS idx_user_analysis_github_username 
ON user_analysis(github_username) 
WHERE github_username IS NOT NULL;
```

## 验证配置

执行以下查询验证 RLS 是否正常工作：

```sql
-- 测试查询
SELECT * FROM user_analysis WHERE fingerprint = 'test_fingerprint' LIMIT 1;

-- 测试插入
INSERT INTO user_analysis (id, user_name, fingerprint, created_at, updated_at)
VALUES (gen_random_uuid(), 'test_user', 'test_fingerprint', NOW(), NOW());

-- 测试更新
UPDATE user_analysis 
SET fingerprint = 'new_fingerprint', updated_at = NOW()
WHERE user_name = 'test_user';
```

## 注意事项

1. **安全性**：如果您的应用需要更高的安全性，应该使用更严格的 RLS 策略，例如基于 JWT 令牌的认证。

2. **性能**：确保在 `fingerprint` 和 `user_name` 字段上创建了索引，以提高查询性能。

3. **数据完整性**：考虑添加唯一约束，防止重复数据：

```sql
-- 为 fingerprint 添加唯一约束（如果每个指纹应该唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analysis_fingerprint_unique 
ON user_analysis(fingerprint) 
WHERE fingerprint IS NOT NULL;

-- 为 user_name 添加唯一约束（如果每个用户名应该唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analysis_user_name_unique 
ON user_analysis(user_name) 
WHERE user_name IS NOT NULL;
```

4. **API Key 权限**：确保您的 Supabase API Key 具有足够的权限执行这些操作。通常使用 Service Role Key（具有完整权限）而不是 Anon Key。

## 故障排查

如果遇到权限错误：

1. 检查 RLS 是否已启用：`SELECT * FROM pg_policies WHERE tablename = 'user_analysis';`
2. 检查 API Key 权限：确保使用的是 Service Role Key
3. 查看 Supabase 日志：在 Supabase Dashboard 中查看详细的错误信息
4. 测试策略：使用 Supabase SQL Editor 直接测试 SQL 查询
