# Supabase 去重控制实现指南

## 问题分析

当前实现存在以下问题：
1. **Supabase 层面**：使用 `POST` + `Prefer: resolution=merge-duplicates`，但需要数据库表有唯一约束才能生效
2. **Cloudflare Worker 层面**：没有实现去重检查，导致重复请求会重复插入数据库
3. **用户标识**：仅基于 IP，可能不够准确（同一网络下多个用户会冲突）

## 解决方案

### 方案1：在 Supabase 数据库层面实现（推荐）

#### 步骤1：创建唯一约束

在 Supabase 数据库中，为 `cursor_stats` 表的 `user_identity` 字段添加唯一约束：

```sql
-- 如果表已存在，添加唯一约束
ALTER TABLE cursor_stats 
ADD CONSTRAINT cursor_stats_user_identity_unique 
UNIQUE (user_identity);

-- 或者创建表时就添加唯一约束
CREATE TABLE IF NOT EXISTS cursor_stats (
  id BIGSERIAL PRIMARY KEY,
  user_identity TEXT UNIQUE NOT NULL,  -- 唯一约束
  qing_count INTEGER DEFAULT 0,
  bu_count INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  total_user_chars INTEGER DEFAULT 0,
  avg_message_length INTEGER DEFAULT 0,
  usage_days INTEGER DEFAULT 1,
  dimensions JSONB,
  personality TEXT,
  vibe_index TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_cursor_stats_user_identity ON cursor_stats(user_identity);
CREATE INDEX IF NOT EXISTS idx_cursor_stats_user_messages ON cursor_stats(user_messages);
```

#### 步骤2：使用正确的 UPSERT 语法

在 Cloudflare Worker 中使用 `POST` + `Prefer: resolution=merge-duplicates`，当有唯一约束时会自动实现 UPSERT：

```javascript
await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
  method: 'POST',
  headers: {
    'apikey': env.SUPABASE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates' // 有唯一约束时自动 UPSERT
  },
  body: JSON.stringify({
    user_identity: userIdentity,
    // ... 其他字段
    updated_at: new Date().toISOString()
  })
});
```

### 方案2：在 Cloudflare Worker 层面实现（双重保障）

即使 Supabase 有唯一约束，也可以在 Worker 层面添加快速检查，减少数据库压力：

#### 使用 Cloudflare KV 实现去重锁

```javascript
// 生成用户标识（基于 IP + 日期，确保同一天内同一用户只计算一次）
const today = new Date().toISOString().split('T')[0];
const identityString = `${clientIP}-${today}`;
const userIdentity = await hashString(identityString);

// 检查是否已提交（24小时过期）
const kvLockKey = `user_submit_lock:${userIdentity}`;
const alreadySubmitted = await env.STATS_STORE?.get(kvLockKey);

if (alreadySubmitted) {
  // 直接返回排名，不重复插入
  return getRankingFromDatabase();
}

// 插入数据库
await insertToSupabase();

// 设置锁（24小时过期）
await env.STATS_STORE.put(kvLockKey, "true", { expirationTtl: 86400 });
```

### 方案3：改进用户标识生成（提高准确性）

当前仅基于 IP，可以结合更多因素：

```javascript
// 方案A：IP + 日期（同一天内同一IP只计算一次）
const today = new Date().toISOString().split('T')[0];
const identityString = `${clientIP}-${today}`;

// 方案B：IP + 用户代理 + 日期（更精确，但可能过于严格）
const userAgent = request.headers.get("User-Agent") || "";
const identityString = `${clientIP}-${userAgent}-${today}`;

// 方案C：基于统计数据生成唯一ID（最准确）
// 如果 stats 中包含唯一标识（如文件哈希），使用它
const fileHash = stats.fileHash || stats.uniqueId || null;
const identityString = fileHash || `${clientIP}-${today}`;

// 生成 SHA-256 哈希
const msgUint8 = new TextEncoder().encode(identityString);
const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
const userIdentity = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

## 推荐实现

**最佳实践：双重去重控制**

1. **Supabase 层面**：添加 `user_identity` 唯一约束，使用 UPSERT
2. **Cloudflare Worker 层面**：使用 KV 实现快速去重检查，减少数据库压力
3. **用户标识**：使用 `IP + 日期` 的组合，确保同一天内同一用户只计算一次

## 实施步骤

1. ✅ 在 Supabase 数据库中添加唯一约束
2. ✅ 更新 Cloudflare Worker 代码（使用 `src/index_improved.js`）
3. ✅ 测试去重逻辑是否正常工作
4. ✅ 监控数据库插入情况，确认没有重复记录

## 注意事项

- **唯一约束冲突**：如果添加唯一约束时表已有重复数据，需要先清理：
  ```sql
  -- 删除重复记录，保留最新的
  DELETE FROM cursor_stats
  WHERE id NOT IN (
    SELECT MAX(id) 
    FROM cursor_stats 
    GROUP BY user_identity
  );
  ```

- **KV 存储成本**：Cloudflare KV 有免费额度，24小时过期的锁不会占用太多空间

- **时区问题**：使用 UTC 日期确保全球用户的一致性
