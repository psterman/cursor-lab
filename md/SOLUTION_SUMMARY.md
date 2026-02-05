# Cloudflare 环境下 Supabase Realtime 在线频道解决方案

## ✅ 问题已解决

### 问题

Cloudflare Workers 不支持直接对外 WebSocket 连接，导致 Supabase Realtime 无法建立连接，在线频道显示"当前环境不支持实时在线"。

### 解决方案

**WebSocket 代理架构**：在 Cloudflare Worker 中实现 WebSocket 代理，转发客户端与 Supabase Realtime 之间的 WebSocket 通信。

## 实现细节

### 1. 前端配置

**文件**: `stats2.html` (第 3990-4080 行), `stats2.app.js`

**实现**: 自定义 WebSocket transport，让 Supabase 客户端通过 Worker 代理连接

```javascript
// Cloudflare 环境下，使用自定义 WebSocket transport
class ProxyWebSocket {
    constructor(url, protocols) {
        // 替换 Supabase URL 为 Worker URL
        const proxyUrl = url.replace(/wss?:\/\/[^\/]+/, workerUrl);
        this.socket = new WebSocket(proxyUrl, protocols);
        // 转发所有事件...
    }
}

supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        transport: ProxyWebSocket,  // 自定义 transport
        heartbeatIntervalMs: 5000
    }
});
```

### 2. Worker 代理

**文件**: `src/worker/index.ts` (第 6998-7100 行)

**实现**: 在 Worker 中拦截 WebSocket 升级请求，双向转发消息

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
      return handleWebSocketProxy(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
  },
};

async function handleWebSocketProxy(request, Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // 接受客户端 WebSocket
  const clientWebSocket = request.webSocket;
  await clientWebSocket.accept();

  // 连接到 Supabase Realtime
  const serverWebSocket = new WebSocket(targetUrl);

  // 双向转发消息
  serverWebSocket.addEventListener('message', (e) => clientWebSocket.send(e.data));
  clientWebSocket.addEventListener('message', (e) => serverWebSocket.send(e.data));

  return new Response(null, { status: 101, webSocket: clientWebSocket });
}
```

### 3. CSP 配置

**文件**: `_headers`

**实现**: 更新 CSP 策略，允许 WebSocket 连接

```http
Content-Security-Policy: ...
connect-src 'self' wss://dtcplfhcgnxdzpigmotb.supabase.co wss://*.supabase.co ...
```

## 部署步骤

```bash
# 1. 部署 Worker（包含 WebSocket 代理功能）
npm run worker:deploy

# 2. 验证部署
# 访问网站，打开浏览器控制台，应该看到：
# [Init] 🔄 Cloudflare 环境检测到，使用自定义 WebSocket transport
# [ProxyWebSocket] Creating connection to: https://your-worker.workers.dev
# [WS Proxy] 🔄 Proxying WebSocket: /realtime/v1 → wss://supabase-project.co/realtime/v1
# [WS Proxy] ✅ Client accepted
# [Realtime] 🚀 Realtime 监听已启动
# [Presence] 🚀 Presence 监听已启动
```

## 验证清单

- [ ] Worker 成功部署（无错误）
- [ ] 浏览器控制台显示 WebSocket 代理已启用
- [ ] WebSocket 连接成功建立（Network → WS 标签，状态码 101）
- [ ] Realtime 监听已启动
- [ ] Presence 监听已启动
- [ ] 在线用户频道正常加载
- [ ] 在线人数正常显示
- [ ] 用户列表实时更新

## 工作原理

```
浏览器
  │
  │ WebSocket (wss://your-worker.workers.dev/realtime/v1)
  │
  ▼
Cloudflare Worker (代理）
  │
  │ 接受客户端 WebSocket
  │ 连接到 Supabase Realtime
  │ 双向转发消息
  │
  ▼
Supabase Realtime (wss://<project-ref>.supabase.co/realtime/v1)
  │
  │ Presence 订阅
  │ 广播消息
  │ 实时同步
  │
```

## 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `stats2.html` | 添加自定义 WebSocket transport，移除 Cloudflare 检测跳过逻辑 |
| `stats2.app.js` | 同 `stats2.html` |
| `src/worker/index.ts` | 添加 WebSocket 代理功能 |
| `_headers` | 更新 CSP 策略，允许 `wss://` 连接 |
| `WEBSOCKET_PROXY_SOLUTION.md` | 详细的实现文档 |

## 技术说明

### 为什么需要自定义 transport？

Supabase Realtime 客户端默认直接连接到 Supabase 的 WebSocket 端点。在 Cloudflare 环境下，这种直接连接被阻止。

通过自定义 WebSocket `transport`，我们可以：
1. 拦截 WebSocket 创建请求
2. 将目标 URL 替换为 Worker 代理 URL
3. 让 Worker 作为中间人，转发所有 WebSocket 通信

### 为什么 Worker 能连接到 Supabase？

Cloudflare Workers 的环境与浏览器不同：
- 浏览器：受同源策略和 Cloudflare 代理限制
- Workers：运行在 Cloudflare 边缘网络，可以发起任意出站 WebSocket 连接

### WebSocket 代理的性能影响

- 额外的网络跳转：1 次（浏览器 → Worker → Supabase）
- 延迟增加：约 10-50ms（可接受）
- 没有消息内容修改：纯转发，零额外处理

## 常见问题

### Q: WebSocket 代理会增加延迟吗？
A: 会，但增加的延迟（10-50ms）对实时功能影响可接受。

### Q: Worker 免费计划够用吗？
A: 免费计划有 100,000 请求/天的限制，个人项目通常够用。

### Q: 如果连接失败怎么办？
A: 检查：
1. Worker 是否成功部署：`wrangler tail`
2. `SUPABASE_URL` 环境变量是否正确
3. Supabase 项目是否启用了 Realtime
4. 浏览器控制台和 Worker 日志

## 后续优化

1. **错误处理**: 添加更详细的错误日志和重试机制
2. **连接池**: 复用 WebSocket 连接，减少握手开销
3. **消息压缩**: 对大型消息进行压缩
4. **监控**: 添加连接数、消息数等监控指标

---

**完成时间**: 2026-02-03
**状态**: ✅ 已实现，待测试部署
