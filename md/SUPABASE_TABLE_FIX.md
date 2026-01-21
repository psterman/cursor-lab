# Supabase 表结构修复指南

## 问题分析

根据实际 Supabase 表结构，当前代码使用的字段名与数据库表不匹配，导致无法插入数据。

## 实际表结构

根据图片显示，`cursor_stats` 表的实际字段为：
- `id` (uuid) - 主键，自动生成
- `ip` (text) - IP 地址
- `vibe_index` (text) - Vibe 索引
- `total_chars` (int8) - 总字符数
- `user_messages` (int4) - 用户消息数
- `personality_type` (text) - 人格类型
- `dimensions` (jsonb) - 维度数据
- `created_at` (timestamptz) - 创建时间

## 代码中使用的错误字段

当前代码尝试插入的字段：
- ❌ `user_identity` - 表中不存在
- ❌ `qing_count` - 表中不存在
- ❌ `bu_count` - 表中不存在
- ❌ `total_user_chars` - 应该是 `total_chars`
- ❌ `avg_message_length` - 表中不存在
- ❌ `usage_days` - 表中不存在

## 修复方案

### 1. 字段映射修复

已修复 `src/index.js`，使用正确的字段名：
```javascript
const payload = {
  ip: clientIP,                    // ✅ 实际字段
  user_messages: stats.totalMessages, // ✅ 实际字段
  total_chars: stats.totalChars,   // ✅ 实际字段（不是 total_user_chars）
  vibe_index: stats.vibeIndex,     // ✅ 实际字段
  personality_type: stats.personalityType, // ✅ 实际字段
  dimensions: stats.dimensions      // ✅ 实际字段
  // id 字段是 uuid，Supabase 会自动生成，不需要手动指定
};
```

### 2. 数据库插入问题排查

如果仍然无法插入，检查以下几点：

#### A. 检查表权限
```sql
-- 在 Supabase SQL Editor 中执行
-- 确保 postgres 角色有插入权限
GRANT INSERT, UPDATE, SELECT ON cursor_stats TO postgres;
GRANT USAGE ON SEQUENCE cursor_stats_id_seq TO postgres;
```

#### B. 检查 RLS (Row Level Security) 策略
```sql
-- 如果启用了 RLS，需要添加策略允许插入
ALTER TABLE cursor_stats ENABLE ROW LEVEL SECURITY;

-- 允许所有操作（开发环境）
CREATE POLICY "Allow all operations" ON cursor_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

#### C. 检查必需字段
```sql
-- 检查哪些字段是 NOT NULL
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'cursor_stats';
```

### 3. 调试建议

在 Cloudflare Worker 中添加更详细的日志：

```javascript
console.log('[Worker] 准备插入数据:', {
  payload: payload,
  exists: exists,
  method: exists ? 'PATCH' : 'POST',
  url: exists 
    ? `${env.SUPABASE_URL}/rest/v1/cursor_stats?ip=eq.${encodeURIComponent(clientIP)}`
    : `${env.SUPABASE_URL}/rest/v1/cursor_stats`
});

const dbRes = await fetch(...);

console.log('[Worker] 数据库响应:', {
  ok: dbRes.ok,
  status: dbRes.status,
  statusText: dbRes.statusText,
  headers: Object.fromEntries(dbRes.headers.entries())
});
```

### 4. 常见错误及解决方案

#### 错误 1: 400 Bad Request
- **原因**：字段名不匹配或数据类型错误
- **解决**：检查字段名和数据类型是否与表结构一致

#### 错误 2: 401 Unauthorized
- **原因**：API Key 或 Authorization 头错误
- **解决**：检查 `env.SUPABASE_KEY` 是否正确

#### 错误 3: 409 Conflict
- **原因**：唯一约束冲突（如果 ip 字段有唯一约束）
- **解决**：使用 PATCH 更新而不是 POST 插入

#### 错误 4: 422 Unprocessable Entity
- **原因**：必需字段缺失或数据类型不匹配
- **解决**：检查所有必需字段是否都已提供

### 5. 测试插入

在 Supabase SQL Editor 中手动测试：

```sql
-- 测试插入
INSERT INTO cursor_stats (
  ip,
  user_messages,
  total_chars,
  vibe_index,
  personality_type,
  dimensions
) VALUES (
  '127.0.0.1',
  100,
  5000,
  '01210',
  'LPDEF',
  '{"L": 80, "P": 70, "D": 60, "E": 5, "F": 75}'::jsonb
);

-- 检查是否插入成功
SELECT * FROM cursor_stats WHERE ip = '127.0.0.1';
```

## 已修复的代码

✅ `src/index.js` - 已更新字段映射
✅ 击败人数计算 - 已修复使用原始 rank 值
✅ 错误处理 - 已增强日志输出

请检查 Cloudflare Worker 的日志，查看具体的错误信息。
