# Cloudflare 环境下 Supabase Realtime 无法使用 - 问题修复总结

## 问题根源

**文件**: `stats2.html` 第 4007-4035 行
**问题**: 使用了不存在的 Supabase 客户端配置选项 `realtime.params.ws`

```javascript
// ❌ 错误的配置
const realtimeConfig = {
    params: {
        // Supabase Realtime 参数
    }
};
realtimeConfig.params.ws = `${workerUrl}/realtime/v1`;
```

根据 Supabase 官方源码 (`supabase/realtime-js/src/RealtimeClient.ts`)，`RealtimeClientOptions` 类型定义为：
```typescript
export type RealtimeClientOptions = {
  transport?: WebSocketLikeConstructor
  timeout?: number
  heartbeatIntervalMs?: number
  heartbeatCallback?: (status: HeartbeatStatus) => void
  logger?: Function
}
```

**注意**: 没有 `params.ws` 这个选项！

## 修复方案

### 1. 简化前端配置

**修改文件**: `stats2.html`, `stats2.app.js`

```javascript
// ✅ 正确的配置
supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        heartbeatIntervalMs: 5000, // 5秒心跳，增加连接稳定性
    }
});
```

### 2. 更新 CSP 策略

**修改文件**: `_headers`

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://html2canvas.hertzen.com https://cdn.tailwindcss.com; connect-src 'self' wss://dtcplfhcgnxdzpigmotb.supabase.co wss://*.supabase.co https://cursor-clinical-analysis.psterman.workers.dev https://psterman.supabase.co https://raw.githubusercontent.com https://api.ipify.org https://ip-api.com https://unpkg.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; font-src 'self' https://fonts.gstatic.com;
```

### 3. 移除 Worker WebSocket 代理

**修改文件**: `src/worker/index.ts`

```typescript
// ✅ 简化的 Worker 配置
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  scheduled: scheduled
};
```

## 修复文件列表

- ✅ `stats2.html` (Supabase 客户端初始化，第 3990-4052 行)
- ✅ `stats2.app.js` (Supabase 客户端初始化)
- ✅ `_headers` (CSP 策略更新)
- ✅ `src/worker/index.ts` (移除 WebSocket 代理代码)
- ✅ `DIAGNOSTIC_REPORT.md` (诊断报告)

## 部署步骤

```bash
# 1. 部署 Worker
npm run worker:deploy

# 2. 验证部署
# 访问网站，打开浏览器控制台
# 应该看到: [Init] ✅ Supabase 客户端已成功挂载至 window.supabaseClient
```

## 验证清单

- [ ] Worker 成功部署（无错误）
- [ ] 浏览器控制台显示 Supabase 客户端已初始化
- [ ] WebSocket 连接成功建立（Network → WS 标签，状态码 101）
- [ ] 在线用户频道正常加载
- [ ] 在线人数正常显示
- [ ] Presence 状态正常同步

## 如果问题仍然存在

### 检查 Cloudflare 配置

1. 登录 Cloudflare Dashboard
2. 选择你的域名
3. 进入 Network 标签页
4. 确认 "WebSockets" 已启用（默认启用）

### 检查 Supabase 配置

1. 登录 Supabase Dashboard
2. 选择你的项目
3. 进入 Database → Replication
4. 确认 Realtime 已启用

### 浏览器调试

```javascript
// 在浏览器控制台执行
console.log(window.supabaseClient.realtime.channels)
console.log(window.supabaseClient.realtime.isConnected())
```

## 参考文档

- [Supabase Realtime 官方文档](https://supabase.com/docs/guides/realtime)
- [Supabase Realtime JS 源码](https://github.com/supabase/realtime-js)
- [Cloudflare Workers WebSocket 文档](https://developers.cloudflare.com/workers/runtime-apis/websockets/)

---

**修复完成时间**：2026-02-03
**修复者**：开发团队
**状态**：✅ 已修复，待测试
