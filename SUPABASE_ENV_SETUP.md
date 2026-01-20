# Supabase 环境变量配置指南

## 重要说明

**Supabase 不是通过 Bindings 连接的，而是通过环境变量（Environment Variables）！**

从你的截图可以看到：
- ✅ D1 database binding: `prompts_library` - 已配置
- ✅ KV namespace binding: `STATS_STORE` - 已配置
- ❌ Supabase 环境变量 - **需要单独配置**

## 配置步骤

### 方法 1：通过 Cloudflare Dashboard（推荐）

1. **访问 Worker 设置**
   - 打开：https://dash.cloudflare.com
   - 导航到：**Workers & Pages** → **cursor-clinical-analysis**
   - 点击 **Settings** 标签
   - 滚动到 **Variables** 部分

2. **添加环境变量**
   
   在 **Environment Variables** 部分，点击 **Add variable**，添加以下两个变量：

   **变量 1：**
   - **Variable name:** `SUPABASE_URL`
   - **Value:** 你的 Supabase 项目 URL
     - 格式：`https://xxxxx.supabase.co`
     - 在 Supabase Dashboard → Settings → API → Project URL 中找到

   **变量 2：**
   - **Variable name:** `SUPABASE_KEY`
   - **Value:** 你的 Supabase API Key
     - 在 Supabase Dashboard → Settings → API 中找到
     - **重要：** 
       - 如果使用 RLS (Row Level Security)，使用 **service_role** key
       - 如果未使用 RLS，可以使用 **anon** key
     - **建议使用 service_role key** 以确保能绕过 RLS 策略

3. **保存并重新部署**
   - 点击 **Save** 保存环境变量
   - 环境变量会在下次部署时生效
   - 或者点击 **Deploy** 立即重新部署

### 方法 2：通过 wrangler.toml（本地开发）

对于本地开发，可以在项目根目录创建 `.dev.vars` 文件（**不要提交到 git**）：

```bash
# .dev.vars
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here
```

然后在 `wrangler.toml` 中添加（可选，仅用于文档说明）：

```toml
# 注意：实际值需要在 Cloudflare Dashboard 中设置
# 或者在 .dev.vars 文件中配置（仅本地开发）
```

### 方法 3：通过 Wrangler CLI

```bash
# 设置环境变量（生产环境）
npx wrangler secret put SUPABASE_URL
# 然后输入你的 Supabase URL

npx wrangler secret put SUPABASE_KEY
# 然后输入你的 Supabase Key
```

## 验证配置

### 1. 检查环境变量是否已配置

访问 Worker 的 Logs：
- **Workers & Pages** → **cursor-clinical-analysis** → **Logs**
- 如果看到 `[Worker] ❌ Supabase 环境变量未配置`，说明环境变量未正确配置

### 2. 测试 API

访问你的应用并上传数据，然后检查：
- Worker Logs 中是否有 `[Worker] ✅ 数据已写入 Supabase` 日志
- Supabase Dashboard → Table Editor → `cursor_stats` 表中是否有新记录

## 获取 Supabase 凭证

### 1. 获取 SUPABASE_URL

1. 登录 Supabase Dashboard：https://app.supabase.com
2. 选择你的项目
3. 点击左侧菜单 **Settings** → **API**
4. 在 **Project URL** 部分找到 URL
   - 格式：`https://xxxxx.supabase.co`

### 2. 获取 SUPABASE_KEY

在同一个页面（Settings → API）：

- **anon key**：在 **Project API keys** 部分，找到 `anon` `public` key
- **service_role key**：在 **Project API keys** 部分，找到 `service_role` `secret` key
  - ⚠️ **注意：** service_role key 有完整权限，不要在前端代码中使用！

**推荐使用 service_role key**，因为：
- 可以绕过 RLS (Row Level Security) 策略
- 适合后端 Worker 使用
- 不会受到 RLS 策略限制

## 常见问题

### Q: 我已经配置了环境变量，但还是无法写入数据？

**A:** 检查以下几点：
1. **环境变量名称是否正确**：必须是 `SUPABASE_URL` 和 `SUPABASE_KEY`（区分大小写）
2. **是否重新部署了 Worker**：环境变量更改后需要重新部署
3. **检查 Worker Logs**：查看是否有具体的错误信息
4. **验证 Supabase 凭证**：确认 URL 和 Key 是否正确

### Q: 应该使用 anon key 还是 service_role key？

**A:** 
- **service_role key**（推荐）：有完整权限，可以绕过 RLS，适合后端 Worker
- **anon key**：受 RLS 策略限制，如果 RLS 策略配置不当可能无法写入

### Q: 环境变量在哪里配置？

**A:** 
- **生产环境**：Cloudflare Dashboard → Workers & Pages → cursor-clinical-analysis → Settings → Variables
- **本地开发**：项目根目录的 `.dev.vars` 文件（不提交到 git）

### Q: 配置后需要重新部署吗？

**A:** 是的，环境变量更改后需要重新部署 Worker 才能生效。

## 快速检查清单

- [ ] 在 Cloudflare Dashboard 中配置了 `SUPABASE_URL`
- [ ] 在 Cloudflare Dashboard 中配置了 `SUPABASE_KEY`
- [ ] 使用了正确的 Supabase 项目 URL
- [ ] 使用了 service_role key（推荐）或配置了正确的 RLS 策略
- [ ] 重新部署了 Worker
- [ ] 检查了 Worker Logs 确认环境变量已加载
- [ ] 测试了数据上传功能

## 下一步

配置完成后：
1. 重新部署 Worker：`npx wrangler deploy` 或在 Dashboard 中点击 Deploy
2. 查看 Worker Logs 确认没有环境变量错误
3. 测试上传数据功能
4. 在 Supabase Dashboard 中检查 `cursor_stats` 表是否有新记录
