# 修复 Cloudflare 环境下 Supabase Realtime 无法使用的问题

## 修改摘要

### 问题
用户上线 Cloudflare 后，在线用户频道无法正常加载（Supabase Realtime WebSocket 连接被阻止）。

### 根本解决方案
实现 Cloudflare Worker WebSocket 代理，在 Worker 层面代理 Supabase Realtime 连接。

## 文件修改

### 1. `src/worker/index.ts` ✅

**修改位置**：export default 部分（第 6998 行附近）

**新增功能**：
- `handleWebSocketProxy()` 函数：代理 WebSocket 连接
- 修改 `fetch` 方法：拦截 WebSocket 升级请求
- 双向转发：客户端 ↔ Worker ↔ Supabase

**代码片段**：
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket' && (url.pathname.startsWith('/realtime') || url.pathname.includes('websocket'))) {
      return handleWebSocketProxy(request, env);
    }

    return app.fetch(request, env, ctx);
  },
  scheduled: scheduled
};
```

### 2. `stats2.html` ✅

**修改位置 1**：Supabase 客户端初始化（第 3990 行附近）

**新增功能**：
- Cloudflare 环境检测（域名 + CF-Ray header）
- 配置 `realtime.params.ws` 使用 Worker 代理

**代码片段**：
```javascript
// 检测是否为 Cloudflare 环境
const host = window.location.hostname;
const isCloudflareHost = /\.pages\.dev$/.test(host) || /\.workers\.dev$/.test(host);
const isCloudflareEnv = isCloudflareHost || (/* CF-Ray 检测 */);

// 构建实时连接配置
const realtimeConfig = {
    params: {
        // Supabase Realtime 参数
    }
};

if (isCloudflareEnv) {
    const workerUrl = `${window.location.protocol}//${window.location.host}`;
    realtimeConfig.params.ws = `${workerUrl}/realtime/v1`;
    console.log('[Init] 🔄 Cloudflare 环境检测到，使用 WebSocket 代理');
}

supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: realtimeConfig
});
```

**修改位置 2**：`startRealtimeListener()` 函数（第 9110 行附近）

**修改内容**：
- 移除了"跳过 Presence 订阅"的逻辑
- 现在在 Cloudflare 环境下也会正常尝试连接（通过代理）

### 3. `stats2.app.js` ✅

**修改内容**：与 `stats2.html` 相同（Supabase 客户端初始化 + startRealtimeListener）

### 4. `_headers` ✅

**修改内容**：
- 添加 `wss://` 协议到 CSP connect-src
- 添加 WebSocket 相关路由规则

### 5. `src/worker/websocket-proxy.ts` ✅（新增）

独立的 WebSocket 代理 Worker（备用方案，未在主架构中使用）

### 6. `CLOUDFLARE_WEBSOCKET_PROXY.md` ✅（新增）

详细的配置和故障排除文档

### 7. 本文档 ✅（新增）

快速参考文档

## 工作原理

```
┌─────────────┐      WebSocket      ┌──────────────┐      WebSocket      ┌────────────┐
│   Browser   │ ──────────────────> │ Cloudflare   │ ──────────────────> │  Supabase  │
│             │    /realtime/v1     │   Worker     │   /realtime/v1      │  Realtime  │
└─────────────┘                     └──────────────┘                     └────────────┘
       │                                   │                                   │
       │ ── Presence Track (用户状态) ──> │ ── Presence Track ─────────────> │
       │                                   │                                   │
       │ <── Presence Sync (在线用户) ───│ <── Presence Sync ──────────────│
       │                                   │                                   │
```

## 部署步骤

1. **确保环境变量已配置**
   ```bash
   # wrangler.toml 中应该有
   [vars]
   SUPABASE_URL = "https://dtcplfhcgnxdzpigmotb.supabase.co"
   ```

2. **部署 Worker**
   ```bash
   npm run worker:deploy
   ```

3. **验证部署**
   - 访问网站，打开浏览器控制台
   - 查找日志：`[Init] 🔄 Cloudflare 环境检测到，使用 WebSocket 代理`
   - 查找日志：`[Init] ✨ WebSocket 代理已启用，实时功能应正常工作`

## 验证清单

- [ ] Worker 已成功部署（无错误）
- [ ] 浏览器控制台显示 WebSocket 代理已启用
- [ ] 在线用户频道正常加载
- [ ] 在线用户数量正常显示
- [ ] Presence 状态正常同步

## 回滚方案

如果 WebSocket 代理方案出现故障，可以：

1. **临时禁用代理**：
   在前端代码中注释掉 `realtimeConfig.params.ws` 的设置

2. **使用降级方案**：
   参考 `CLOUDFLARE_WEBSOCKET_PROXY.md` 中的"替代方案"部分

## 相关问题

### Q: 为什么不能直接连接 Supabase？
A: Cloudflare 代理对 WebSocket 连接有限制，特别是在免费计划中。

### Q: Worker 代理会增加延迟吗？
A: 会增加约 10-50ms 延迟，但对实时功能影响可接受。

### Q: Worker 免费计划够用吗？
A: 免费计划有 100,000 请求/天的限制，个人项目通常够用。高流量建议升级。

## 联系支持

如有问题，请参考：
- `CLOUDFLARE_WEBSOCKET_PROXY.md` - 详细配置文档
- Cloudflare Workers 文档
- Supabase Realtime 文档
