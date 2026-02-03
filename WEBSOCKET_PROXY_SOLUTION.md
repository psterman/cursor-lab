# Cloudflare WebSocket 代理实现方案

## 问题

Cloudflare Workers 不支持直接对外 WebSocket 连接，导致 Supabase Realtime WebSocket 无法建立连接。

## 解决方案

### 架构

```
浏览器 → Cloudflare Worker (代理） → Supabase Realtime
```

### 实现步骤

#### 1. 修改前端 Supabase 客户端配置

**文件**: `stats2.html`, `stats2.app.js`

**修改内容**: 添加自定义 WebSocket transport

```javascript
// Cloudflare 环境下，使用自定义 WebSocket transport
if (isCloudflareEnv) {
    const workerUrl = `${window.location.protocol}//${window.location.host}`;

    // 自定义 WebSocket 构造函数（通过代理）
    class ProxyWebSocket {
        constructor(url, protocols) {
            console.log('[ProxyWebSocket] Creating connection to:', workerUrl);

            // 构建实际的 WebSocket URL（替换为代理）
            const proxyUrl = url.replace(/wss?:\/\/[^\/]+/, workerUrl);

            this.socket = new WebSocket(proxyUrl, protocols);
            this.readyState = this.socket.CONNECTING;

            // 转发事件
            this.socket.onopen = (e) => {
                this.readyState = this.socket.OPEN;
                if (this.onopen) this.onopen(e);
            };

            this.socket.onmessage = (e) => {
                if (this.onmessage) this.onmessage(e);
            };

            this.socket.onclose = (e) => {
                this.readyState = this.socket.CLOSED;
                if (this.onclose) this.onclose(e);
            };

            this.socket.onerror = (e) => {
                this.readyState = this.socket.CLOSED;
                if (this.onerror) this.onerror(e);
            };

            // 模拟标准 WebSocket API
            this.OPEN = WebSocket.OPEN;
            this.CONNECTING = WebSocket.CONNECTING;
            this.CLOSING = WebSocket.CLOSING;
            this.CLOSED = WebSocket.CLOSED;
        }

        send(data) {
            return this.socket.send(data);
        }

        close(code, reason) {
            return this.socket.close(code, reason);
        }
    }

    realtimeConfig.transport = ProxyWebSocket;
    console.log('[Init] 🔄 Cloudflare 环境检测到，使用自定义 WebSocket transport:', workerUrl);
}

supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: realtimeConfig
});
```

#### 2. 修改 Worker 添加 WebSocket 代理

**文件**: `src/worker/index.ts`

**修改内容**: 添加 `handleWebSocketProxy` 函数

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // 检查是否为 WebSocket 升级请求
    if (upgradeHeader === 'websocket') {
      return handleWebSocketProxy(request, env, ctx);
    }

    // 普通 HTTP 请求通过 Hono app 处理
    return app.fetch(request, env, ctx);
  },
  scheduled: scheduled
};

async function handleWebSocketProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const supabaseUrl = env.SUPABASE_URL;

  if (!supabaseUrl) {
    return new Response('SUPABASE_URL not configured', { status: 500 });
  }

  // 构建目标 WebSocket URL
  const realtimePath = url.pathname.startsWith('/realtime')
    ? url.pathname
    : '/realtime/v1';

  const targetUrl = supabaseUrl
    .replace(/^https?:\/\//, 'wss://')
    + realtimePath;

  console.log('[WS Proxy] 🔄 Proxying WebSocket:', url.pathname, '→', targetUrl);

  // 获取客户端 WebSocket
  const clientWebSocket = request.webSocket;
  if (!clientWebSocket) {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const serverWebSocket = new WebSocket(targetUrl);

  try {
    // 接受客户端连接
    await clientWebSocket.accept();
    console.log('[WS Proxy] ✅ Client accepted');

    // Supabase → Client
    serverWebSocket.addEventListener('message', (event) => {
      try {
        clientWebSocket.send(event.data);
      } catch (e) {
        console.error('[WS Proxy] ❌ Error sending to client:', e);
      }
    });

    serverWebSocket.addEventListener('close', (event) => {
      console.log('[WS Proxy] 📤 Server closed:', event.code, event.reason);
      try {
        clientWebSocket.close(event.code, event.reason);
      } catch (e) {
        console.error('[WS Proxy] ❌ Error closing client:', e);
      }
    });

    serverWebSocket.addEventListener('error', (error) => {
      console.error('[WS Proxy] ❌ Server error:', error);
      try {
        clientWebSocket.close(1011, 'Proxy server error');
      } catch (e) {
        console.error('[WS Proxy] ❌ Error closing client after error:', e);
      }
    });

    // Client → Supabase
    clientWebSocket.addEventListener('message', (event) => {
      try {
        if (serverWebSocket.readyState === WebSocket.OPEN) {
          serverWebSocket.send(event.data);
        } else {
          console.warn('[WS Proxy] ⚠️ Server not ready, dropping message');
        }
      } catch (e) {
        console.error('[WS Proxy] ❌ Error sending to server:', e);
      }
    });

    clientWebSocket.addEventListener('close', (event) => {
      console.log('[WS Proxy] 📥 Client closed:', event.code, event.reason);
      if (serverWebSocket.readyState === WebSocket.OPEN) {
        serverWebSocket.close(event.code, event.reason);
      }
    });

    clientWebSocket.addEventListener('error', (error) => {
      console.error('[WS Proxy] ❌ Client error:', error);
      if (serverWebSocket.readyState === WebSocket.OPEN) {
        serverWebSocket.close(1011, 'Client connection error');
      }
    });

    return new Response(null, { status: 101, webSocket: clientWebSocket });

  } catch (error: any) {
    console.error('[WS Proxy] ❌ WebSocket handler error:', error);
    try {
      clientWebSocket.close(1011, 'Proxy error: ' + (error.message || 'Unknown'));
    } catch (e) {
      console.error('[WS Proxy] ❌ Error closing client after handler error:', e);
    }
    return new Response(JSON.stringify({
      error: 'WebSocket handler failed',
      message: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

#### 3. 部署

```bash
# 部署 Worker
npm run worker:deploy
```

#### 4. 验证

1. 访问网站，打开浏览器控制台
2. 应该看到：
   - `[Init] 🔄 Cloudflare 环境检测到，使用自定义 WebSocket transport`
   - `[ProxyWebSocket] Creating connection to: <worker-url>`
   - `[WS Proxy] 🔄 Proxying WebSocket: /realtime/v1 → <supabase-url>`
   - `[WS Proxy] ✅ Client accepted`
   - `[Realtime] 🚀 Realtime 监听已启动`
   - `[Presence] 🚀 Presence 监听已启动`

3. 打开 Network → WS 标签，查看 WebSocket 连接状态（应该为 101）

## 限制

1. **Cloudflare Workers WebSocket 限制**:
   - Cloudflare Workers 支持作为 WebSocket 服务器
   - 但对外 WebSocket 连接可能有限制（取决于计划）
   - 免费计划可能有并发连接数限制

2. **性能影响**:
   - WebSocket 代理会增加约 10-50ms 延迟
   - 对实时功能影响可接受

3. **调试**:
   - 使用 `wrangler tail` 查看 Worker 日志
   - 浏览器控制台查看前端日志

## 故障排除

### 问题 1: WebSocket 连接失败

**症状**: 控制台显示 `CHANNEL_ERROR` 或 `TIMED_OUT`

**检查**:
1. Worker 是否成功部署：`wrangler tail`
2. 是否看到 `[WS Proxy] 🔄 Proxying WebSocket` 日志
3. 浏览器 Network → WS 标签，查看连接状态

**解决方案**:
- 检查 `SUPABASE_URL` 环境变量是否正确
- 检查 Cloudflare 计划是否支持 WebSocket
- 检查 Supabase 项目是否启用了 Realtime

### 问题 2: Worker 部署失败

**症状**: `wrangler deploy` 报错

**检查**:
1. `wrangler.toml` 配置是否正确
2. `SUPABASE_URL` 环境变量是否设置

**解决方案**:
```bash
# 设置环境变量
wrangler secret put SUPABASE_URL

# 部署
wrangler deploy
```

## 参考文档

- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [Cloudflare Workers WebSocket 文档](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Supabase JS 客户端源码](https://github.com/supabase/supabase-js)
