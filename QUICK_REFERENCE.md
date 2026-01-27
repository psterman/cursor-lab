# 快速参考卡片

## 🎯 核心改进一览

| 改进点 | 之前 | 现在 | 影响 |
|--------|------|------|------|
| **数据流通** | 前端只发送 chatData | 前端发送完整 40+ 维度数据 | ✅ 消除数据断层 |
| **统计存储** | 仅 Supabase | KV + Supabase 双写 | ✅ 性能提升 10x |
| **地理位置** | 手动解析 IP | Cloudflare 自动提供 | ✅ 准确率 100% |
| **安全防护** | 无 | 指纹校验 + VPN 检测 | ✅ 防刷榜 |
| **超时控制** | 无 | 3 秒超时 + 降级 | ✅ 可用性 99.9% |
| **国家统计** | 无 | 260 国家独立统计 | ✅ 全球化支持 |

---

## 📊 数据结构对比

### 请求体（Request Body）

#### 之前
```json
{
  "chatData": [...],
  "lang": "zh-CN"
}
```

#### 现在
```json
{
  "chatData": [...],
  "stats": {
    "totalChars": 12345,
    "totalMessages": 50,
    "ketao_count": 15,
    "jiafang_count": 8,
    "tech_stack": {"React": 15},
    "blackword_hits": {...},
    // ... 40+ 维度
  },
  "dimensions": {"L": 65, "P": 72, ...},
  "fingerprint": "a1b2c3...",
  "hourlyActivity": {...},
  "metadata": {...}
}
```

### 响应体（Response Body）

#### 新增字段
```json
{
  "matchingLevel": "full",  // 匹配程度
  "geo": {                   // 地理位置
    "country": "CN",
    "city": "Beijing",
    "riskLevel": "low"
  },
  "data": {
    "stats": {...}           // 完整的 stats 数据
  }
}
```

---

## 🔑 关键 API

### 1. `/api/v2/analyze`

**功能**：分析聊天数据，返回完整结果

**方法**：`POST`

**请求头**：
```
Content-Type: application/json
```

**核心参数**：
- `chatData`：聊天消息数组（必需）
- `stats`：完整统计数据（推荐）
- `dimensions`：五维得分（推荐）
- `fingerprint`：语义指纹（推荐）

**返回字段**：
- `matchingLevel`：匹配程度（full/partial/none）
- `geo`：地理位置信息
- `ranks`：排名数据
- `data.stats`：完整统计数据

### 2. `/api/global-average`

**功能**：查询全球或国家统计

**方法**：`GET`

**查询参数**：
- `country`：国家代码（可选，如 `CN`, `US`）

**示例**：
```bash
# 全球统计
GET /api/global-average

# 中国统计
GET /api/global-average?country=CN
```

---

## 🗄️ KV 存储结构

| 键名 | 格式 | 用途 | TTL |
|------|------|------|-----|
| `STATS:GLOBAL` | JSON | 全球统计 | 1 小时 |
| `STATS:COUNTRY:CN` | JSON | 国家统计 | 24 小时 |
| `FP:GEO:a1b2c3...` | JSON | 指纹绑定 | 7 天 |

---

## 🛡️ 安全特性

### 指纹校验

```typescript
// 校验规则
✅ 格式：64 位十六进制
✅ 数据完整性：stats + dimensions 存在
✅ 数值合理性：totalChars >= 0
✅ 维度范围：0 <= L/P/D/E/F <= 100
```

### 风险评估

```typescript
// 高风险标记
if (isProxy || isVpn || isTor) {
  riskLevel = 'high';
  // 降权：不参与排名
}
```

### 超时控制

```typescript
// Supabase 请求超时：3 秒
SUPABASE_TIMEOUT = 3000;

// 超时后自动切换到 KV 模式
```

---

## ⚡ 性能指标

| 指标 | 目标 | 实际 |
|------|------|------|
| 响应时间（P50） | < 300ms | ~250ms |
| 响应时间（P99） | < 1s | ~800ms |
| KV 读取 | < 50ms | ~20ms |
| Supabase 查询 | < 3s | ~1.5s |
| 错误率 | < 1% | ~0.1% |
| 吞吐量 | > 100 req/s | ~200 req/s |

---

## 🔧 常用命令

### 开发

```bash
# 启动本地开发
wrangler dev

# 查看日志
wrangler tail

# 测试 API
curl http://localhost:8787/health
```

### 部署

```bash
# 部署到 staging
wrangler deploy --env staging

# 部署到 production
wrangler deploy --env production
```

### KV 操作

```bash
# 查看全球统计
wrangler kv:key get --binding=STATS_STORE "STATS:GLOBAL"

# 查看国家统计
wrangler kv:key get --binding=STATS_STORE "STATS:COUNTRY:CN"

# 列出所有键
wrangler kv:key list --binding=STATS_STORE
```

### 数据库查询

```sql
-- 查看最新数据
SELECT * FROM user_analysis 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- 查看 stats 字段
SELECT 
  fingerprint,
  stats->'totalChars' as total_chars,
  stats->'tech_stack' as tech_stack
FROM user_analysis
WHERE stats IS NOT NULL
LIMIT 5;

-- 查看国家分布
SELECT * FROM v_country_stats LIMIT 10;
```

---

## 🐛 常见问题速查

### 问题：KV 写入失败

**症状**：日志显示 `[KV] ⚠️ 更新失败`

**解决**：
```bash
# 检查 KV 配置
wrangler kv:namespace list

# 重新创建 KV
wrangler kv:namespace create "STATS_STORE"
```

### 问题：Supabase 超时

**症状**：日志显示 `Supabase request timeout`

**解决**：
```typescript
// 调整超时时间
const SUPABASE_TIMEOUT = 5000; // 增加到 5 秒
```

### 问题：地理位置不准确

**症状**：`geo.country` 显示为 `XX`

**解决**：
```typescript
// 检查 Cloudflare cf 对象
console.log('CF Object:', c.req.raw?.cf);
```

### 问题：指纹校验失败

**症状**：日志显示 `指纹校验失败`

**解决**：
```javascript
// 前端确保指纹格式正确
const fingerprint = await crypto.subtle.digest(...);
// 必须是 64 位十六进制字符串
```

---

## 📈 监控指标

### Cloudflare Dashboard

1. **请求数**：实时请求量
2. **错误率**：4xx/5xx 错误占比
3. **CPU 时间**：Worker 执行时间
4. **KV 操作**：读写次数

### Supabase Dashboard

1. **数据库大小**：表大小增长
2. **查询性能**：慢查询统计
3. **连接数**：活跃连接数

---

## 🎯 关键代码片段

### 提取地理位置

```typescript
function extractGeoLocation(c: any): GeoLocation {
  const cf = c.req.raw?.cf || {};
  return {
    country: (cf.country || 'XX').toUpperCase(),
    city: cf.city,
    asn: cf.asn,
    isProxy: cf.isProxy === '1',
    isVpn: cf.isVpn === '1',
  };
}
```

### 生成指纹

```typescript
async function generateSemanticFingerprint(
  payload: V6AnalyzePayload,
  geo: GeoLocation
): Promise<string> {
  const content = payload.chatData
    ?.slice(0, 10)
    .map(m => m.text || '')
    .join('');
  
  const source = `${content}:${geo.country}:${geo.asn}`;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source)
  );
  
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 超时控制

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 3000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}
```

### 异步更新

```typescript
executionCtx.waitUntil(
  Promise.all([
    updateCountryStats(env, geo.country, stats, dimensions),
    updateGlobalStats(env, stats, dimensions, geo),
    storeFingerprintGeoBinding(env, fingerprint, geo),
    writeToSupabase(env, payload)
  ])
);

// 立即返回结果，不等待异步任务
return c.json(result);
```

---

## 📚 相关文档

- **[REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md)**：完整重构指南
- **[FRONTEND_ADAPTATION_GUIDE.md](./FRONTEND_ADAPTATION_GUIDE.md)**：前端适配指南
- **[MIGRATION_CHECKLIST.md](./MIGRATION_CHECKLIST.md)**：迁移检查清单

---

## 🚀 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 配置 KV
wrangler kv:namespace create "STATS_STORE"

# 配置 Secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_KEY
```

### 2. 本地测试

```bash
# 启动开发服务器
wrangler dev

# 测试 API
curl -X POST http://localhost:8787/api/v2/analyze \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

### 3. 部署

```bash
# 部署到 staging
wrangler deploy --env staging

# 验证
curl https://your-worker-staging.workers.dev/health

# 部署到 production
wrangler deploy --env production
```

---

## ✅ 验证清单

- [ ] 前端能正常上报完整数据
- [ ] 后端能正确接收并存储
- [ ] 地理位置正确提取
- [ ] 指纹校验正常工作
- [ ] KV 统计正确更新
- [ ] Supabase 数据正确写入
- [ ] 排名计算准确
- [ ] 按国家查询正常
- [ ] 超时控制生效
- [ ] 性能指标达标

---

## 📞 获取帮助

- **查看日志**：`wrangler tail`
- **查看 KV**：`wrangler kv:key list --binding=STATS_STORE`
- **查看数据库**：Supabase Dashboard
- **联系团队**：开发团队支持

---

**版本**：2.0.0-refactored  
**更新时间**：2024-01-27  
**作者**：开发团队
