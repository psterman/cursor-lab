# Supabase 数据上传问题诊断指南

## 问题现象
用户访问上传数据页面后，Supabase 没有记录任何用户数据。

## 诊断步骤

### 1. 检查 Worker 日志

在 Cloudflare Dashboard 中查看 Worker 的实时日志：
- 访问：https://dash.cloudflare.com → Workers & Pages → cursor-clinical-analysis → Logs
- 查找以下关键日志：
  - `[Worker] 准备上传数据:` - 确认数据是否正确接收
  - `[Worker] ✅ 数据已写入 Supabase` - 确认写入成功
  - `[Worker] ❌ Supabase 写入失败` - 查看具体错误信息

### 2. 验证数据库表结构

在 Supabase SQL Editor 中执行以下查询，确认表结构：

```sql
-- 查看表结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cursor_stats'
ORDER BY ordinal_position;
```

**必需字段：**
- `user_identity` (text) - 用户唯一标识
- `user_messages` (integer) - 用户消息数
- `total_user_chars` (bigint) - 总字符数
- `vibe_index` (text) - Vibe 索引
- `personality` (text) - 人格类型
- `dimensions` (jsonb) - 维度数据
- `updated_at` (timestamptz) - 更新时间

### 3. 检查 RLS (Row Level Security) 策略

如果启用了 RLS，需要添加策略允许插入：

```sql
-- 检查 RLS 是否启用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'cursor_stats';

-- 如果启用了 RLS，添加策略允许所有操作（开发环境）
ALTER TABLE cursor_stats ENABLE ROW LEVEL SECURITY;

-- 允许所有操作（开发环境）
CREATE POLICY "Allow all operations" ON cursor_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 或者更安全的策略：允许匿名用户插入和更新自己的数据
CREATE POLICY "Allow anonymous insert" ON cursor_stats
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON cursor_stats
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON cursor_stats
  FOR SELECT
  USING (true);
```

### 4. 检查表权限

确保 postgres 角色有插入权限：

```sql
-- 授予插入、更新、查询权限
GRANT INSERT, UPDATE, SELECT ON cursor_stats TO postgres;
GRANT USAGE ON SEQUENCE cursor_stats_id_seq TO postgres;

-- 如果使用 anon 角色
GRANT INSERT, UPDATE, SELECT ON cursor_stats TO anon;
GRANT USAGE ON SEQUENCE cursor_stats_id_seq TO anon;
```

### 5. 验证环境变量

在 Cloudflare Worker 设置中检查环境变量：
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_KEY` - Supabase anon/service_role key

**注意：** 如果使用 RLS，需要使用 `service_role` key 才能绕过 RLS 策略。

### 6. 测试直接插入

在 Supabase SQL Editor 中测试直接插入：

```sql
-- 测试插入一条记录
INSERT INTO cursor_stats (
  user_identity,
  user_messages,
  total_user_chars,
  vibe_index,
  personality,
  dimensions,
  updated_at
) VALUES (
  'test_user_' || gen_random_uuid()::text,
  100,
  5000,
  '01020',
  '-PDEF-',
  '{"D": 10, "E": 12, "F": 12, "L": 10, "P": 60}'::jsonb,
  NOW()
);

-- 检查是否插入成功
SELECT * FROM cursor_stats ORDER BY updated_at DESC LIMIT 5;
```

### 7. 检查浏览器控制台

打开浏览器开发者工具（F12），查看 Console 标签：
- 查找 `[VibeAnalyzer] 上传统计数据` 日志
- 查找 `[VibeAnalyzer] 后端返回数据` 日志
- 查找任何错误信息

### 8. 常见错误及解决方案

#### 错误：`column "user_identity" does not exist`
**原因：** 数据库表没有 `user_identity` 字段
**解决：** 添加字段或修改代码使用正确的字段名

```sql
-- 添加 user_identity 字段
ALTER TABLE cursor_stats 
ADD COLUMN user_identity TEXT;

-- 添加唯一约束
ALTER TABLE cursor_stats 
ADD CONSTRAINT cursor_stats_user_identity_unique 
UNIQUE (user_identity);

-- 创建索引
CREATE INDEX idx_cursor_stats_user_identity ON cursor_stats(user_identity);
```

#### 错误：`new row violates row-level security policy`
**原因：** RLS 策略阻止了插入
**解决：** 参考步骤 3 添加 RLS 策略

#### 错误：`permission denied for table cursor_stats`
**原因：** 缺少表权限
**解决：** 参考步骤 4 授予权限

#### 错误：`invalid input syntax for type integer`
**原因：** 字段类型不匹配
**解决：** 检查代码中的数据类型转换，确保：
- `user_messages` 是整数
- `total_user_chars` 是整数
- `vibe_index` 是文本
- `personality` 是文本
- `dimensions` 是有效的 JSON

### 9. 手动测试 API

使用 curl 或 Postman 测试 API：

```bash
curl -X POST https://cursor-clinical-analysis.psterman.workers.dev/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "totalMessages": 100,
    "totalChars": 5000,
    "vibeIndex": "01020",
    "personality": "-PDEF-",
    "personalityType": "-PDEF-",
    "dimensions": {"D": 10, "E": 12, "F": 12, "L": 10, "P": 60}
  }'
```

### 10. 检查 Worker 部署状态

确认 Worker 代码已正确部署：
- 检查 `wrangler.toml` 中的 `main` 路径是否正确
- 确认 `src/index.js` 文件已更新
- 重新部署 Worker：`npx wrangler deploy`

## 快速修复检查清单

- [ ] 数据库表包含 `user_identity` 字段
- [ ] `user_identity` 字段有唯一约束
- [ ] RLS 策略允许插入操作
- [ ] 表权限已正确配置
- [ ] 环境变量 `SUPABASE_URL` 和 `SUPABASE_KEY` 已配置
- [ ] Worker 代码已更新并重新部署
- [ ] 浏览器控制台没有 JavaScript 错误
- [ ] Worker 日志显示数据正在尝试写入

## 联系支持

如果以上步骤都无法解决问题，请提供：
1. Worker 日志中的完整错误信息
2. 浏览器控制台的错误信息
3. Supabase 表结构查询结果
4. RLS 策略查询结果
