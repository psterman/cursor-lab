/**
 * Supabase Realtime WebSocket 代理 - Cloudflare Workers 版本 2
 *
 * 这是专门的 WebSocket 代理 Worker，用于解决 Cloudflare 环境下
 * Supabase Realtime WebSocket 连接问题。
 */

export interface Env {
  SUPABASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // 检查是否为 WebSocket 升级请求
    if (upgradeHeader === 'websocket') {
      return handleWebSocketUpgrade(request, env, ctx);
    }

    // 健康检查
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'supabase-realtime-proxy',
        supabase_url: env.SUPABASE_URL ? 'configured' : 'not configured'
      });
    }

    return Response.json({
      status: 'ok',
      service: 'supabase-realtime-proxy',
      endpoints: {
        websocket: '/ (WebSocket upgrade)',
        health: '/health'
      }
    });
  },
};

async function handleWebSocketUpgrade(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const supabaseUrl = env.SUPABASE_URL;

  if (!supabaseUrl) {
    console.error('[WS Proxy] ❌ SUPABASE_URL not configured');
    return new Response('SUPABASE_URL not configured', { status: 500 });
  }

  // 构建目标 WebSocket URL (wss://<project-ref>.supabase.co/realtime/v1)
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
    console.error('[WS Proxy] ❌ No WebSocket in request');
    return new Response('Expected WebSocket', { status: 426 });
  }

  const serverWebSocket = new WebSocket(targetUrl);

  try {
    // 接受客户端连接
    clientWebSocket.accept();
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
