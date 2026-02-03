/**
 * WebSocket 代理 Worker
 * 代理 Supabase Realtime WebSocket 连接，解决 Cloudflare 对外 WebSocket 连接的限制
 */

export interface Env {
  // 从父 Worker 传递的环境变量
  SUPABASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket 升级请求处理
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
      return handleWebSocket(request, env);
    }

    // 普通 HTTP 请求（降级或健康检查）
    return new Response(JSON.stringify({
      status: 'ok',
      message: 'WebSocket Proxy Worker',
      endpoints: {
        realtime: '/realtime', // Supabase Realtime WebSocket 代理端点
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },
};

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const supabaseUrl = env.SUPABASE_URL || 'https://dtcplfhcgnxdzpigmotb.supabase.co';

  // 构建 Supabase Realtime WebSocket URL
  // 格式: wss://<project-ref>.supabase.co/realtime/v1
  const realtimeUrl = `${supabaseUrl.replace(/^https?:\/\//, 'wss://')}/realtime/v1`;

  try {
    // 创建 WebSocket 对对端连接
    const clientWebSocket = await request.webSocket?.accept();

    if (!clientWebSocket) {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // 连接到 Supabase Realtime
    const supabaseWebSocket = new WebSocket(realtimeUrl);

    supabaseWebSocket.addEventListener('open', () => {
      console.log('[Proxy] Connected to Supabase Realtime');
    });

    supabaseWebSocket.addEventListener('message', (event) => {
      // 转发 Supabase 消息到客户端
      clientWebSocket.send(event.data);
    });

    supabaseWebSocket.addEventListener('close', (event) => {
      console.log('[Proxy] Supabase connection closed:', event.code, event.reason);
      clientWebSocket.close(event.code, event.reason);
    });

    supabaseWebSocket.addEventListener('error', (error) => {
      console.error('[Proxy] Supabase WebSocket error:', error);
      clientWebSocket.close(1011, 'Proxy connection error');
    });

    // 转发客户端消息到 Supabase
    clientWebSocket.addEventListener('message', (event) => {
      try {
        if (supabaseWebSocket.readyState === WebSocket.OPEN) {
          supabaseWebSocket.send(event.data);
        }
      } catch (error) {
        console.error('[Proxy] Error forwarding to Supabase:', error);
      }
    });

    clientWebSocket.addEventListener('close', (event) => {
      console.log('[Proxy] Client connection closed:', event.code, event.reason);
      if (supabaseWebSocket.readyState === WebSocket.OPEN) {
        supabaseWebSocket.close(event.code, event.reason);
      }
    });

    return new Response(null, { status: 101, webSocket: clientWebSocket });

  } catch (error: any) {
    console.error('[Proxy] WebSocket proxy error:', error);
    return new Response(JSON.stringify({
      error: 'WebSocket proxy failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
