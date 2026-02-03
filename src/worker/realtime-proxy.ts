/**
 * Supabase Realtime WebSocket 代理 - Cloudflare Workers 版
 *
 * 工作原理：
 * 1. 客户端通过自定义 WebSocket transport 连接到此 Worker
 * 2. Worker 作为代理，将 WebSocket 消息双向转发到 Supabase Realtime
 * 3. 解决 Cloudflare 对外 WebSocket 连接的限制
 */

export interface Env {
  SUPABASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // 检查是否为 WebSocket 升级请求
    if (upgradeHeader === 'websocket') {
      return handleWebSocket(request, env);
    }

    // 健康检查端点
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'supabase-realtime-proxy' });
    }

    return new Response('Supabase Realtime WebSocket Proxy', { status: 200 });
  },
};

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const supabaseUrl = env.SUPABASE_URL;

  if (!supabaseUrl) {
    return new Response('SUPABASE_URL not configured', { status: 500 });
  }

  // 获取查询参数，构建目标 URL
  const targetUrl = new URL(supabaseUrl);
  targetUrl.protocol = 'wss:';

  // 转发所有查询参数（vsn, token, etc.）
  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  console.log('[WS Proxy] Connecting to Supabase Realtime:', targetUrl.toString());

  // 获取客户端 WebSocket
  const clientWebSocket = request.webSocket;
  if (!clientWebSocket) {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const [client, server] = Object.values(webSocketPair());

  try {
    // 创建 WebSocket 对对端连接
    await server.accept();
    console.log('[WS Proxy] ✅ Client WebSocket accepted');

    // 连接到 Supabase Realtime
    let supabaseSocket: WebSocket | null = null;

    try {
      supabaseSocket = new WebSocket(targetUrl.toString());

      await new Promise<void>((resolve, reject) => {
        if (!supabaseSocket) return reject(new Error('WebSocket is null'));

        supabaseSocket.addEventListener('open', () => {
          console.log('[WS Proxy] ✅ Connected to Supabase Realtime');
          resolve();
        });

        supabaseSocket.addEventListener('error', (error) => {
          console.error('[WS Proxy] ❌ Supabase connection error:', error);
          reject(error);
        });

        // 超时处理
        setTimeout(() => {
          if (supabaseSocket?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

      // Supabase → Client
      supabaseSocket.addEventListener('message', (event) => {
        try {
          client.send(event.data);
        } catch (e) {
          console.error('[WS Proxy] ❌ Error sending to client:', e);
        }
      });

      supabaseSocket.addEventListener('close', (event) => {
        console.log('[WS Proxy] Supabase closed:', event.code, event.reason);
        try {
          client.close(event.code, event.reason);
        } catch (e) {
          console.error('[WS Proxy] ❌ Error closing client:', e);
        }
      });

      supabaseSocket.addEventListener('error', (error) => {
        console.error('[WS Proxy] ❌ Supabase error:', error);
        try {
          client.close(1011, 'Supabase connection error');
        } catch (e) {
          console.error('[WS Proxy] ❌ Error closing client after supabase error:', e);
        }
      });

      // Client → Supabase
      client.addEventListener('message', (event) => {
        try {
          if (supabaseSocket?.readyState === WebSocket.OPEN) {
            supabaseSocket.send(event.data);
          }
        } catch (e) {
          console.error('[WS Proxy] ❌ Error sending to Supabase:', e);
        }
      });

      client.addEventListener('close', (event) => {
        console.log('[WS Proxy] Client closed:', event.code, event.reason);
        if (supabaseSocket?.readyState === WebSocket.OPEN) {
          supabaseSocket.close(event.code, event.reason);
        }
      });

      client.addEventListener('error', (error) => {
        console.error('[WS Proxy] ❌ Client error:', error);
        if (supabaseSocket?.readyState === WebSocket.OPEN) {
          supabaseSocket.close(1011, 'Client connection error');
        }
      });

      return new Response(null, { status: 101, webSocket: client });

    } catch (error: any) {
      console.error('[WS Proxy] ❌ Connection failed:', error);
      try {
        client.close(1002, 'Connection failed: ' + (error.message || 'Unknown error'));
      } catch (e) {
        console.error('[WS Proxy] ❌ Error closing client after connection failure:', e);
      }
      return new Response(JSON.stringify({
        error: 'WebSocket connection failed',
        message: error.message || 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error('[WS Proxy] ❌ WebSocket handler error:', error);
    return new Response(JSON.stringify({
      error: 'WebSocket handler failed',
      message: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function for creating WebSocket pairs (Cloudflare Workers specific)
function webSocketPair(): [WebSocket, WebSocket] {
  // @ts-ignore - Cloudflare Workers specific API
  return new WebSocketPair();
}
