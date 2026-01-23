# Worker 测试指南

## 📋 测试前准备

### 1. 安装依赖
```bash
npm install
```

### 2. 配置本地环境变量

创建 `.dev.vars` 文件（参考 `.dev.vars.example`）：
```bash
# .dev.vars
SUPABASE_URL=https://dtcplfhcgnxdzpigmotb.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here
```

**重要：** `.dev.vars` 文件不会被提交到 git，用于本地开发。

### 3. 登录 Cloudflare
```bash
wrangler login
```

### 4. 检查配置

确保 `wrangler.toml` 配置正确：
- ✅ `main = "src/worker/index.ts"`
- ✅ D1 数据库已绑定
- ✅ KV namespace ID 已填写（如果使用 KV）
- ✅ Supabase URL 已配置

---

## 🚀 本地测试

### 方法 1: 使用 Wrangler Dev（推荐）

```bash
# 启动本地开发服务器
wrangler dev

# 或者指定端口
wrangler dev --port 8787
```

启动后，Worker 会在 `http://localhost:8787` 运行。

### 方法 2: 使用测试脚本（PowerShell）

```powershell
# 1. 先启动 wrangler dev（在另一个终端）
wrangler dev

# 2. 运行测试脚本
.\test-worker.ps1
```

### 方法 3: 手动测试（使用 curl 或 Postman）

#### 测试 1: 存活检查
```bash
curl http://localhost:8787/
```

#### 测试 2: 答案之书（中文）
```bash
curl "http://localhost:8787/api/random_prompt?lang=cn"
```

#### 测试 3: 答案之书（英文）
```bash
curl "http://localhost:8787/api/random_prompt?lang=en"
```

#### 测试 4: 全局平均值
```bash
curl http://localhost:8787/api/global-average
```

#### 测试 5: 分析接口（原有接口）
```bash
curl -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "dimensions": {"L": 75, "P": 60, "D": 80, "E": 70, "F": 65},
    "vibeIndex": "75608",
    "personalityType": "TEST",
    "userMessages": 100,
    "totalChars": 5000,
    "days": 10,
    "jiafang": 5,
    "ketao": 3,
    "avgLength": 50,
    "deviceId": "test-device-123"
  }'
```

#### 测试 6: V2 分析接口（新接口）
```bash
curl -X POST http://localhost:8787/api/v2/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "chatData": [
      {"role": "USER", "text": "如何实现快速排序？"},
      {"role": "ASSISTANT", "text": "快速排序是一种高效的排序算法..."},
      {"role": "USER", "text": "能给我一个 Python 示例吗？"}
    ],
    "lang": "zh-CN"
  }'
```

---

## 🌐 生产环境测试

### 1. 部署到 Cloudflare

```bash
# 部署 Worker
wrangler deploy

# 设置 Secret（如果还没设置）
wrangler secret put SUPABASE_KEY
# 然后输入你的 Supabase service_role key
```

### 2. 获取 Worker URL

部署后，你会得到一个 URL，例如：
```
https://cursor-clinical-analysis.your-subdomain.workers.dev
```

### 3. 测试生产环境

将上述所有 `http://localhost:8787` 替换为你的生产 URL 进行测试。

---

## ✅ 测试检查清单

### 基础功能
- [ ] `/` 路由返回总用户数
- [ ] `/api/random_prompt?lang=cn` 返回中文答案
- [ ] `/api/random_prompt?lang=en` 返回英文答案
- [ ] `/api/global-average` 返回全局平均值

### 分析功能
- [ ] `/api/analyze` 成功写入 Supabase
- [ ] `/api/analyze` 返回排名信息
- [ ] `/api/analyze` 返回全局平均值（雷达图需要）
- [ ] `/api/v2/analyze` 正确计算维度得分
- [ ] `/api/v2/analyze` 返回人格类型和文案

### 错误处理
- [ ] 无效请求返回适当的错误信息
- [ ] 缺少必需字段时返回 400 错误
- [ ] Supabase 连接失败时有降级处理

### 性能
- [ ] KV 缓存正常工作（如果配置了）
- [ ] 响应时间合理（< 2秒）
- [ ] CORS 头正确设置

---

## 🐛 常见问题排查

### 问题 1: "D1 数据库未配置"
**原因：** `prompts_library` 绑定未正确配置
**解决：** 检查 `wrangler.toml` 中的 D1 数据库配置

### 问题 2: "Supabase 环境变量未配置"
**原因：** `.dev.vars` 文件不存在或配置错误
**解决：** 
- 创建 `.dev.vars` 文件
- 或使用 `wrangler secret put SUPABASE_KEY` 设置生产环境 Secret

### 问题 3: "KV 未配置"
**原因：** KV namespace 未创建或 ID 错误
**解决：** 
- 在 Cloudflare Dashboard 创建 KV namespace
- 更新 `wrangler.toml` 中的 KV namespace ID

### 问题 4: 类型错误
**原因：** TypeScript 编译错误
**解决：** 
```bash
# 检查类型错误
npx tsc --noEmit

# 或使用 wrangler 的类型检查
wrangler types
```

### 问题 5: 路由返回 404
**原因：** 路由未正确注册
**解决：** 
- 检查 `index.ts` 中的路由定义
- 确保使用 `app.get()` 或 `app.post()` 注册路由

---

## 📊 性能监控

### 查看日志

```bash
# 实时查看 Worker 日志
wrangler tail

# 查看特定环境的日志
wrangler tail --env production
```

### 监控指标

在 Cloudflare Dashboard 中查看：
- 请求数量
- 错误率
- 响应时间
- KV 读写次数
- D1 查询次数

---

## 🔄 持续测试

建议在以下场景进行测试：

1. **开发阶段**：每次代码修改后运行本地测试
2. **部署前**：运行完整测试套件
3. **部署后**：验证生产环境功能
4. **定期检查**：监控日志和错误率

---

## 📝 测试数据示例

### 完整的分析数据示例

```json
{
  "dimensions": {
    "L": 75,
    "P": 60,
    "D": 80,
    "E": 70,
    "F": 65
  },
  "vibeIndex": "75608",
  "personalityType": "CREATIVE",
  "userMessages": 150,
  "totalChars": 8000,
  "days": 15,
  "jiafang": 8,
  "ketao": 5,
  "avgLength": 53,
  "deviceId": "unique-device-id-12345",
  "statistics": {
    "totalMessages": 150,
    "avgMessageLength": 53,
    "totalChars": 8000
  }
}
```

---

## 🎯 下一步

测试通过后，你可以：
1. ✅ 部署到生产环境
2. ✅ 配置监控和告警
3. ✅ 优化性能（如需要）
4. ✅ 添加更多功能
