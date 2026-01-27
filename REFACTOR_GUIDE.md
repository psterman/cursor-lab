# index.ts 重构指南

## 📋 重构概览

本次重构彻底解决了前后端数据断层问题，实现了完整的数据流通和全球统计系统。

### 核心改进

1. **消除数据断层** ✅
   - 完整接收前端 40+ 维度数据（stats, dimensions, hourlyActivity, metadata）
   - 参数透传给评分函数，确保前后端使用相同上下文
   - 支持未来扩展到 100 个维度（使用 jsonb 字段）

2. **实现"分析即入库"** ✅
   - 使用 `ctx.waitUntil` 异步更新统计，不阻塞用户响应
   - 按国家存储：`STATS:COUNTRY:[CODE]`
   - 全球汇总：`STATS:GLOBAL`
   - 指纹绑定：`FP:GEO:[fingerprint]`

3. **语义指纹与安全增强** ✅
   - 指纹绑定地理位置（country + asn）
   - 检测 VPN/Proxy/Tor，标记高风险请求
   - 指纹校验：防止恶意伪造数据
   - 高风险请求降权处理（不参与排名）

4. **影子调用一致性修复** ✅
   - 优先使用前端传来的完整数据
   - 后端计算作为降级方案
   - 明确标记 `matchingLevel`：full | partial | none

5. **接口逻辑增强** ✅
   - `/api/global-average` 支持按国家查询（`?country=CN`）
   - 无参数时返回全球 Top 10 国家热力分布
   - 3 秒超时控制，超时自动切换到纯 KV 模式

---

## 🔄 迁移步骤

### 步骤 1：备份原文件

```bash
# 备份原 index.ts
cp src/worker/index.ts src/worker/index.ts.backup

# 查看差异
diff src/worker/index.ts src/worker/index.refactored.ts
```

### 步骤 2：替换文件

```bash
# 方案 A：直接替换
mv src/worker/index.refactored.ts src/worker/index.ts

# 方案 B：渐进式迁移（推荐）
# 1. 先部署到测试环境
# 2. 验证核心功能
# 3. 再部署到生产环境
```

### 步骤 3：更新数据库 Schema

确保 Supabase 表 `user_analysis` 包含以下字段：

```sql
-- 核心字段
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS stats jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS hourly_activity jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'low';

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint ON user_analysis(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_analysis_country ON user_analysis(ip_location);
CREATE INDEX IF NOT EXISTS idx_user_analysis_risk ON user_analysis(risk_level);
```

### 步骤 4：配置 KV 命名空间

在 `wrangler.toml` 中确保配置了 KV：

```toml
[[kv_namespaces]]
binding = "STATS_STORE"
id = "your_kv_namespace_id"
preview_id = "your_preview_kv_namespace_id"
```

### 步骤 5：部署

```bash
# 部署到 Cloudflare Workers
npm run deploy

# 或使用 wrangler
wrangler deploy
```

---

## 📊 数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 (vibeAnalyzerWorker.js)              │
│  - 提取 40+ 维度数据                                           │
│  - 生成 fingerprint                                           │
│  - 计算 dimensions (L, P, D, E, F)                           │
│  - 统计 stats (ketao_count, jiafang_count, tech_stack...)   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ POST /api/v2/analyze
                        │ {
                        │   chatData: [...],
                        │   stats: {...},
                        │   dimensions: {...},
                        │   fingerprint: "...",
                        │   hourlyActivity: {...},
                        │   metadata: {...}
                        │ }
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  后端 (index.refactored.ts)                   │
│  1. 提取地理位置 (country, city, asn, isProxy, isVpn)        │
│  2. 验证指纹合法性                                             │
│  3. 参数透传：优先使用前端数据，否则后端计算                   │
│  4. 生成特征编码 (vibeIndex, personalityType, lpdef)         │
│  5. 计算排名 (从 KV 或 Supabase)                              │
│  6. 返回结果 (不阻塞)                                          │
│  7. 异步更新统计 (waitUntil)                                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ ctx.waitUntil(...)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 更新国家统计  │ │ 更新全球统计  │ │ 写入 Supabase │
│ KV: STATS:   │ │ KV: STATS:   │ │ user_analysis│
│ COUNTRY:CN   │ │ GLOBAL       │ │ (jsonb)      │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 🔑 关键 API 变化

### 1. `/api/v2/analyze`

#### 请求体（前端需要发送的完整数据）

```typescript
{
  chatData: Array<{ role: string; text: string; timestamp?: string }>,
  stats: {
    totalChars: number,
    totalMessages: number,
    ketao_count: number,
    jiafang_count: number,
    tease_count: number,
    nonsense_count: number,
    slang_count: number,
    abuse_count: number,
    abuse_value: number,
    tech_stack: Record<string, number>,
    work_days: number,
    code_ratio: number,
    feedback_density: number,
    balance_score: number,
    diversity_score: number,
    style_index: number,
    style_label: string,
    avg_payload: number,
    blackword_hits: {
      chinese_slang: Record<string, number>,
      english_slang: Record<string, number>
    }
  },
  dimensions: { L: number, P: number, D: number, E: number, F: number },
  fingerprint: string,
  lang: string,
  userName?: string,
  hourlyActivity?: Record<string, number>,
  metadata?: {
    browser?: string,
    os?: string,
    timezone?: string,
    screen?: string
  }
}
```

#### 响应体（新增字段）

```typescript
{
  status: 'success',
  dimensions: { L, P, D, E, F },
  roastText: string,
  personalityName: string,
  vibeIndex: string,
  personalityType: string,
  lpdef: string,
  statistics: { totalMessages, avgMessageLength, totalChars },
  ranks: { ... },
  totalUsers: number,
  matchingLevel: 'full' | 'partial' | 'none',  // 新增：匹配程度
  geo: {                                         // 新增：地理位置
    country: string,
    city?: string,
    riskLevel: 'low' | 'high'
  },
  data: {
    roast: string,
    type: string,
    dimensions: { ... },
    vibeIndex: string,
    personalityName: string,
    ranks: { ... },
    stats: { ... }  // 新增：完整的 stats 数据
  }
}
```

### 2. `/api/global-average`

#### 查询全球统计

```bash
GET /api/global-average
```

响应：

```json
{
  "status": "success",
  "data": {
    "totalUsers": 12345,
    "totalScans": 23456,
    "totalChars": 9876543,
    "avgDimensions": { "L": 65, "P": 72, "D": 58, "E": 45, "F": 80 },
    "topCountries": [
      { "country": "CN", "count": 5000 },
      { "country": "US", "count": 3000 },
      { "country": "JP", "count": 1500 }
    ],
    "topTechStack": [
      { "tech": "React", "count": 8000 },
      { "tech": "Python", "count": 6500 }
    ],
    "lastUpdate": 1706342400000
  },
  "source": "kv"
}
```

#### 查询指定国家统计

```bash
GET /api/global-average?country=CN
```

响应：

```json
{
  "status": "success",
  "country": "CN",
  "data": {
    "country": "CN",
    "totalScans": 5000,
    "avgDimensions": { "L": 70, "P": 75, "D": 60, "E": 50, "F": 85 },
    "avgStats": {
      "ketao_count": 15,
      "jiafang_count": 8,
      "avg_payload": 250
    },
    "lastUpdate": 1706342400000
  }
}
```

---

## 🛡️ 安全特性

### 1. 指纹校验

```typescript
// 校验规则
- 格式：64 位十六进制字符串
- 数据完整性：stats 和 dimensions 必须存在
- 数值合理性：totalChars >= 0, totalMessages >= 0
- 维度范围：0 <= L/P/D/E/F <= 100
```

### 2. 风险评估

```typescript
// 高风险标记
if (geo.isProxy || geo.isVpn || geo.isTor) {
  riskLevel = 'high';
  // 降权处理：不参与排名计算
}
```

### 3. 超时控制

```typescript
// Supabase 请求超时：3 秒
const SUPABASE_TIMEOUT = 3000;

// 超时后自动切换到纯 KV 模式
try {
  const res = await fetchWithTimeout(url, options, SUPABASE_TIMEOUT);
} catch (error) {
  console.warn('Supabase 超时，切换到纯 KV 模式');
  // 使用 KV 数据
}
```

---

## 📈 性能优化

### 1. 异步更新

```typescript
// 使用 waitUntil 不阻塞用户响应
executionCtx.waitUntil(
  Promise.all([
    updateCountryStats(env, geo.country, stats, dimensions),
    updateGlobalStats(env, stats, dimensions, geo),
    storeFingerprintGeoBinding(env, fingerprint, geo),
    writeToSupabase(env, payload)
  ])
);

// 立即返回结果
return c.json(result);
```

### 2. KV 缓存策略

```typescript
// 国家统计：24 小时过期
await env.STATS_STORE.put(key, JSON.stringify(data), { 
  expirationTtl: KV_CACHE_TTL * 24 
});

// 全球统计：1 小时过期
await env.STATS_STORE.put(key, JSON.stringify(data), { 
  expirationTtl: KV_CACHE_TTL 
});

// 指纹绑定：7 天过期
await env.STATS_STORE.put(key, JSON.stringify(data), { 
  expirationTtl: KV_CACHE_TTL * 24 * 7 
});
```

### 3. 降级策略

```
优先级 1: KV 存储（最快）
    ↓ 失败
优先级 2: Supabase（3 秒超时）
    ↓ 超时
优先级 3: 默认值（兜底）
```

---

## 🧪 测试清单

### 功能测试

- [ ] 前端完整数据上报（40+ 维度）
- [ ] 后端正确接收并存储数据
- [ ] 指纹校验正常工作
- [ ] 地理位置正确提取
- [ ] VPN/Proxy 检测生效
- [ ] 国家统计正确更新
- [ ] 全球统计正确汇总
- [ ] 排名计算准确
- [ ] 按国家查询正常

### 性能测试

- [ ] 响应时间 < 500ms（不含异步任务）
- [ ] KV 读取 < 50ms
- [ ] Supabase 超时控制生效（3 秒）
- [ ] 异步任务不阻塞响应

### 安全测试

- [ ] 恶意指纹被拒绝
- [ ] 超大 Payload 被拒绝（> 5MB）
- [ ] VPN/Proxy 请求被标记
- [ ] SQL 注入防护
- [ ] CORS 白名单生效

---

## 🐛 故障排查

### 问题 1：KV 写入失败

**症状**：日志显示 `[KV] ⚠️ 更新国家统计失败`

**排查**：
1. 检查 `wrangler.toml` 中的 KV 配置
2. 确认 KV 命名空间已创建
3. 检查 KV 配额是否用尽

**解决**：
```bash
# 创建 KV 命名空间
wrangler kv:namespace create "STATS_STORE"

# 查看 KV 使用情况
wrangler kv:key list --binding=STATS_STORE
```

### 问题 2：Supabase 超时

**症状**：日志显示 `[Supabase] ⚠️ 写入超时或失败`

**排查**：
1. 检查 Supabase URL 和 API Key
2. 测试 Supabase 连接速度
3. 检查表结构是否正确

**解决**：
```bash
# 测试 Supabase 连接
curl -X GET "https://your-project.supabase.co/rest/v1/user_analysis?select=*&limit=1" \
  -H "apikey: your-api-key" \
  -H "Authorization: Bearer your-api-key"

# 如果超时，调整超时时间
const SUPABASE_TIMEOUT = 5000; // 增加到 5 秒
```

### 问题 3：地理位置不准确

**症状**：`geo.country` 显示为 `XX`

**排查**：
1. 检查请求是否通过 Cloudflare CDN
2. 确认 `cf` 对象是否存在
3. 检查请求头 `cf-ipcountry`

**解决**：
```typescript
// 调试地理位置提取
console.log('CF Object:', c.req.raw?.cf);
console.log('Headers:', c.req.header('cf-ipcountry'));
```

---

## 📚 参考资料

- [Cloudflare Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Cloudflare Workers Request.cf](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties)
- [Hono Framework](https://hono.dev/)
- [Supabase PostgREST API](https://supabase.com/docs/guides/api)

---

## 🎯 下一步优化

1. **实时排名系统**
   - 使用 Durable Objects 实现实时排行榜
   - WebSocket 推送排名变化

2. **地理热力图**
   - 前端可视化全球分布
   - 支持时间维度筛选

3. **技术栈分析**
   - 技术栈相关性分析
   - 推荐相似技术栈的开发者

4. **异常检测**
   - 机器学习模型检测异常行为
   - 自动标记刷榜行为

---

## 📞 支持

如有问题，请查看：
- 日志输出（Cloudflare Workers Logs）
- Supabase 数据库日志
- KV 存储状态

或联系开发团队。
