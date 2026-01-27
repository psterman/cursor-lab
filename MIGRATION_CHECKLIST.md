# 迁移检查清单

## 📋 准备阶段

### 环境检查

- [ ] Node.js 版本 >= 16.x
- [ ] Wrangler CLI 已安装（`npm install -g wrangler`）
- [ ] Cloudflare 账号已配置
- [ ] Supabase 项目已创建
- [ ] KV 命名空间已创建

### 依赖检查

```bash
# 检查依赖版本
npm list hono
npm list @cloudflare/workers-types
```

- [ ] hono >= 3.0.0
- [ ] @cloudflare/workers-types >= 4.0.0

---

## 🗄️ 数据库准备

### Supabase 表结构

执行以下 SQL 语句：

```sql
-- 1. 添加新字段
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS stats jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS hourly_activity jsonb;
ALTER TABLE user_analysis ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'low';

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint ON user_analysis(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_analysis_country ON user_analysis(ip_location);
CREATE INDEX IF NOT EXISTS idx_user_analysis_risk ON user_analysis(risk_level);
CREATE INDEX IF NOT EXISTS idx_user_analysis_created_at ON user_analysis(created_at DESC);

-- 3. 创建或更新视图
CREATE OR REPLACE VIEW v_global_stats_v6 AS
SELECT 
  COUNT(*) as "totalUsers",
  AVG(l) as avg_l,
  AVG(p) as avg_p,
  AVG(d) as avg_d,
  AVG(e) as avg_e,
  AVG(f) as avg_f,
  AVG(total_messages) as avg_messages,
  AVG(total_chars) as avg_chars,
  AVG(work_days) as avg_work_days,
  AVG(ketao_count) as avg_ketao,
  AVG(jiafang_count) as avg_jiafang
FROM user_analysis
WHERE created_at > NOW() - INTERVAL '30 days';

-- 4. 创建国家统计视图
CREATE OR REPLACE VIEW v_country_stats AS
SELECT 
  ip_location as country,
  COUNT(*) as total_scans,
  AVG(l) as avg_l,
  AVG(p) as avg_p,
  AVG(d) as avg_d,
  AVG(e) as avg_e,
  AVG(f) as avg_f,
  MAX(created_at) as last_update
FROM user_analysis
WHERE ip_location IS NOT NULL 
  AND ip_location != 'XX'
  AND ip_location != '未知'
GROUP BY ip_location
ORDER BY total_scans DESC;
```

检查清单：

- [ ] `stats` 字段已添加（jsonb 类型）
- [ ] `metadata` 字段已添加（jsonb 类型）
- [ ] `hourly_activity` 字段已添加（jsonb 类型）
- [ ] `risk_level` 字段已添加（text 类型）
- [ ] 索引已创建
- [ ] 视图已创建

### 验证数据库

```sql
-- 查看表结构
\d user_analysis

-- 查看视图
SELECT * FROM v_global_stats_v6 LIMIT 1;
SELECT * FROM v_country_stats LIMIT 10;

-- 测试 jsonb 字段
SELECT stats, metadata FROM user_analysis WHERE stats IS NOT NULL LIMIT 1;
```

- [ ] 表结构正确
- [ ] 视图可以查询
- [ ] jsonb 字段可以存储和读取

---

## 🔑 KV 命名空间配置

### 创建 KV 命名空间

```bash
# 创建生产环境 KV
wrangler kv:namespace create "STATS_STORE"

# 创建预览环境 KV
wrangler kv:namespace create "STATS_STORE" --preview
```

输出示例：
```
🌀 Creating namespace with title "worker-STATS_STORE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "STATS_STORE", id = "abc123..." }
```

### 更新 wrangler.toml

```toml
[[kv_namespaces]]
binding = "STATS_STORE"
id = "your_production_kv_id"
preview_id = "your_preview_kv_id"

[[kv_namespaces]]
binding = "CONTENT_STORE"
id = "your_content_kv_id"
preview_id = "your_content_preview_kv_id"
```

检查清单：

- [ ] 生产环境 KV 已创建
- [ ] 预览环境 KV 已创建
- [ ] `wrangler.toml` 已更新
- [ ] KV ID 正确配置

### 验证 KV

```bash
# 测试写入
wrangler kv:key put --binding=STATS_STORE "test_key" "test_value"

# 测试读取
wrangler kv:key get --binding=STATS_STORE "test_key"

# 删除测试数据
wrangler kv:key delete --binding=STATS_STORE "test_key"
```

- [ ] KV 写入成功
- [ ] KV 读取成功
- [ ] KV 删除成功

---

## 🔐 环境变量配置

### 更新 wrangler.toml

```toml
[vars]
# 这些变量会被注入到 Worker 环境中

[env.production]
vars = { ENVIRONMENT = "production" }

[env.staging]
vars = { ENVIRONMENT = "staging" }
```

### 配置 Secrets

```bash
# 配置 Supabase URL
wrangler secret put SUPABASE_URL
# 输入: https://your-project.supabase.co

# 配置 Supabase API Key
wrangler secret put SUPABASE_KEY
# 输入: your-supabase-anon-key
```

检查清单：

- [ ] `SUPABASE_URL` 已配置
- [ ] `SUPABASE_KEY` 已配置
- [ ] Secrets 可以在 Worker 中访问

### 验证 Secrets

```bash
# 查看已配置的 secrets
wrangler secret list
```

输出应包含：
- `SUPABASE_URL`
- `SUPABASE_KEY`

---

## 📦 代码迁移

### 备份原文件

```bash
# 备份原 index.ts
cp src/worker/index.ts src/worker/index.ts.backup.$(date +%Y%m%d_%H%M%S)

# 查看差异
diff src/worker/index.ts src/worker/index.refactored.ts > migration.diff
```

检查清单：

- [ ] 原文件已备份
- [ ] 差异文件已生成
- [ ] 差异已审查

### 替换文件

```bash
# 方案 A：直接替换（适合测试环境）
mv src/worker/index.refactored.ts src/worker/index.ts

# 方案 B：渐进式迁移（推荐生产环境）
# 1. 先部署到 staging 环境
# 2. 验证功能
# 3. 再部署到 production 环境
```

检查清单：

- [ ] 文件已替换
- [ ] TypeScript 编译通过
- [ ] 没有语法错误

### 编译检查

```bash
# 编译 TypeScript
npm run build

# 或使用 tsc
npx tsc --noEmit
```

- [ ] 编译成功
- [ ] 没有类型错误
- [ ] 没有 linter 错误

---

## 🧪 测试阶段

### 单元测试

创建测试文件 `src/worker/index.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';

describe('extractGeoLocation', () => {
  it('should extract country from cf object', () => {
    const mockContext = {
      req: {
        raw: {
          cf: {
            country: 'CN',
            city: 'Beijing',
            asn: '4134'
          }
        }
      }
    };
    
    const geo = extractGeoLocation(mockContext);
    expect(geo.country).toBe('CN');
    expect(geo.city).toBe('Beijing');
  });
});

describe('validateFingerprint', () => {
  it('should reject invalid fingerprint', () => {
    const result = validateFingerprint('invalid', {}, {});
    expect(result.valid).toBe(false);
  });
  
  it('should accept valid fingerprint', () => {
    const fingerprint = 'a'.repeat(64);
    const stats = { totalChars: 100, totalMessages: 10 };
    const dimensions = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    
    const result = validateFingerprint(fingerprint, stats, dimensions);
    expect(result.valid).toBe(true);
  });
});
```

运行测试：

```bash
npm test
```

检查清单：

- [ ] 单元测试通过
- [ ] 覆盖率 > 80%
- [ ] 关键函数已测试

### 集成测试

使用 `wrangler dev` 启动本地开发服务器：

```bash
wrangler dev
```

测试端点：

```bash
# 1. 健康检查
curl http://localhost:8787/health

# 2. 测试 /api/v2/analyze
curl -X POST http://localhost:8787/api/v2/analyze \
  -H "Content-Type: application/json" \
  -d @test_payload.json

# 3. 测试 /api/global-average
curl http://localhost:8787/api/global-average

# 4. 测试按国家查询
curl http://localhost:8787/api/global-average?country=CN
```

检查清单：

- [ ] `/health` 返回 200
- [ ] `/api/v2/analyze` 正常工作
- [ ] `/api/global-average` 返回数据
- [ ] 按国家查询正常
- [ ] 地理位置正确提取
- [ ] KV 写入成功
- [ ] Supabase 写入成功

### 创建测试 Payload

创建 `test_payload.json`：

```json
{
  "chatData": [
    {
      "role": "USER",
      "text": "请帮我写一个 React 组件",
      "timestamp": "2024-01-27T10:00:00Z"
    },
    {
      "role": "ASSISTANT",
      "text": "好的，我来帮你写一个 React 组件..."
    },
    {
      "role": "USER",
      "text": "不对，我要的是 TypeScript 版本",
      "timestamp": "2024-01-27T10:05:00Z"
    }
  ],
  "stats": {
    "totalChars": 150,
    "totalMessages": 2,
    "ketao_count": 1,
    "jiafang_count": 1,
    "tease_count": 0,
    "nonsense_count": 0,
    "slang_count": 0,
    "abuse_count": 0,
    "abuse_value": 1,
    "tech_stack": {
      "React": 1,
      "TypeScript": 1
    },
    "work_days": 1,
    "code_ratio": 0.2,
    "feedback_density": 0.5,
    "balance_score": 60,
    "diversity_score": 2,
    "style_index": 75,
    "style_label": "标准型",
    "avg_payload": 75,
    "blackword_hits": {
      "chinese_slang": {},
      "english_slang": {}
    }
  },
  "dimensions": {
    "L": 60,
    "P": 70,
    "D": 55,
    "E": 50,
    "F": 80
  },
  "fingerprint": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
  "lang": "zh-CN",
  "userName": "测试用户",
  "hourlyActivity": {
    "10": 2
  },
  "metadata": {
    "browser": "Chrome 120",
    "os": "Windows 10",
    "timezone": "Asia/Shanghai",
    "screen": "1920x1080"
  }
}
```

---

## 🚀 部署阶段

### 部署到 Staging

```bash
# 部署到 staging 环境
wrangler deploy --env staging

# 查看部署日志
wrangler tail --env staging
```

检查清单：

- [ ] 部署成功
- [ ] 日志正常
- [ ] 没有错误

### 冒烟测试

```bash
# 测试 staging 环境
curl https://your-worker-staging.workers.dev/health

# 测试完整流程
curl -X POST https://your-worker-staging.workers.dev/api/v2/analyze \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

检查清单：

- [ ] 所有端点正常
- [ ] 数据正确写入 KV
- [ ] 数据正确写入 Supabase
- [ ] 响应时间 < 500ms
- [ ] 没有 500 错误

### 部署到 Production

```bash
# 部署到生产环境
wrangler deploy --env production

# 查看部署日志
wrangler tail --env production
```

检查清单：

- [ ] 部署成功
- [ ] 日志正常
- [ ] 没有错误

---

## 📊 监控阶段

### 设置监控

在 Cloudflare Dashboard 中：

1. 进入 Workers & Pages
2. 选择你的 Worker
3. 进入 Metrics 标签

检查清单：

- [ ] 请求数监控
- [ ] 错误率监控
- [ ] CPU 时间监控
- [ ] KV 操作监控

### 设置告警

```bash
# 使用 Cloudflare API 设置告警
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account_id}/alerting/v3/policies" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Worker Error Rate Alert",
    "alert_type": "worker_errors",
    "enabled": true,
    "mechanisms": {
      "email": [{
        "id": "your-email@example.com"
      }]
    },
    "filters": {
      "worker_name": ["your-worker-name"]
    }
  }'
```

检查清单：

- [ ] 错误率告警已设置
- [ ] 邮件通知已配置
- [ ] 告警测试通过

---

## 🔍 验证阶段

### 数据完整性验证

```sql
-- 检查新字段是否有数据
SELECT 
  COUNT(*) as total,
  COUNT(stats) as has_stats,
  COUNT(metadata) as has_metadata,
  COUNT(hourly_activity) as has_hourly_activity
FROM user_analysis
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 检查 stats 字段结构
SELECT 
  stats->'totalChars' as total_chars,
  stats->'tech_stack' as tech_stack,
  stats->'blackword_hits' as blackword_hits
FROM user_analysis
WHERE stats IS NOT NULL
LIMIT 5;
```

检查清单：

- [ ] 新字段有数据
- [ ] stats 结构正确
- [ ] metadata 结构正确
- [ ] hourly_activity 结构正确

### KV 数据验证

```bash
# 检查全球统计
wrangler kv:key get --binding=STATS_STORE "STATS:GLOBAL"

# 检查国家统计
wrangler kv:key get --binding=STATS_STORE "STATS:COUNTRY:CN"

# 列出所有键
wrangler kv:key list --binding=STATS_STORE
```

检查清单：

- [ ] 全球统计数据存在
- [ ] 国家统计数据存在
- [ ] 数据格式正确
- [ ] 数据更新及时

### 性能验证

使用 Apache Bench 或 wrk 进行压力测试：

```bash
# 安装 wrk
# macOS: brew install wrk
# Ubuntu: apt-get install wrk

# 压力测试
wrk -t4 -c100 -d30s --latency \
  -s post.lua \
  https://your-worker.workers.dev/api/v2/analyze
```

创建 `post.lua`：

```lua
wrk.method = "POST"
wrk.body   = '{"chatData":[{"role":"USER","text":"test"}],"stats":{"totalChars":4,"totalMessages":1},"dimensions":{"L":50,"P":50,"D":50,"E":50,"F":50},"fingerprint":"' .. string.rep("a", 64) .. '"}'
wrk.headers["Content-Type"] = "application/json"
```

检查清单：

- [ ] 平均响应时间 < 500ms
- [ ] P99 响应时间 < 1s
- [ ] 错误率 < 1%
- [ ] 吞吐量 > 100 req/s

---

## ✅ 最终检查

### 功能检查

- [ ] 前端能正常上报数据
- [ ] 后端能正确接收数据
- [ ] 指纹校验正常工作
- [ ] 地理位置正确提取
- [ ] VPN/Proxy 检测生效
- [ ] 国家统计正确更新
- [ ] 全球统计正确汇总
- [ ] 排名计算准确
- [ ] 按国家查询正常
- [ ] 超时控制生效

### 性能检查

- [ ] 响应时间 < 500ms
- [ ] KV 读取 < 50ms
- [ ] Supabase 超时控制生效（3 秒）
- [ ] 异步任务不阻塞响应
- [ ] CPU 使用率正常
- [ ] 内存使用率正常

### 安全检查

- [ ] 恶意指纹被拒绝
- [ ] 超大 Payload 被拒绝（> 5MB）
- [ ] VPN/Proxy 请求被标记
- [ ] SQL 注入防护
- [ ] CORS 白名单生效
- [ ] Secrets 未泄露

### 监控检查

- [ ] 日志正常输出
- [ ] 错误率监控正常
- [ ] 告警配置正确
- [ ] Dashboard 可访问

---

## 🎉 迁移完成

恭喜！如果所有检查项都已完成，迁移就成功了。

### 后续工作

1. **监控观察**
   - 持续观察 7 天
   - 关注错误率和性能指标
   - 收集用户反馈

2. **数据分析**
   - 分析新增的 40+ 维度数据
   - 生成数据报告
   - 优化算法

3. **功能迭代**
   - 根据数据优化排名算法
   - 添加新的统计维度
   - 改进用户体验

### 回滚计划

如果出现严重问题，执行回滚：

```bash
# 1. 恢复原文件
cp src/worker/index.ts.backup src/worker/index.ts

# 2. 重新部署
wrangler deploy

# 3. 验证回滚
curl https://your-worker.workers.dev/health
```

---

## 📞 支持

如有问题，请查看：
- `REFACTOR_GUIDE.md`（重构指南）
- `FRONTEND_ADAPTATION_GUIDE.md`（前端适配指南）
- Cloudflare Workers 日志
- Supabase 数据库日志

或联系开发团队。
