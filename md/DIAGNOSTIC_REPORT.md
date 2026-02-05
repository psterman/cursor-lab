# 问题诊断报告

## 问题现象
stats2.html 显示"当前环境不支持实时在线"

## 根本原因分析

### 1. **前端配置错误** (主要问题)

**位置**: `stats2.html` 第 4007-4035 行

**问题代码**:
```javascript
const realtimeConfig = {
    params: {
        // Supabase Realtime 参数
    }
};

if (isCloudflareEnv) {
    realtimeConfig.params.ws = `${workerUrl}/realtime/v1`;
}

supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: realtimeConfig
});
```

**问题原因**:
- Supabase JS 客户端 v2 的 `realtime` 配置**不支持** `params.ws` 参数
- 根据 Supabase 官方源码，正确的配置选项应该是：
  - `transport`: 自定义 WebSocket 构造函数
  - `heartbeatIntervalMs`: 心跳间隔
  - `vsn`: 版本号
  - `timeout`: 超时时间

### 2. **Worker 代理实现** (次要问题)

**位置**: `src/worker/index.ts` 第 6998-7083 行

**问题代码**:
```typescript
const clientPair = Object.freeze({ client: request.webSocket });
const serverPair = await new WebSocket(targetUrl);
```

**问题原因**:
- Cloudflare Workers 的 `WebSocket` API 不支持 `new WebSocket()` 语法
- 正确的 Cloudflare Workers WebSocket 处理方式是使用 `ServerWebSocket` 和 `request.webSocket`

### 3. **__PRESENCE_SKIPPED 标志残留** (检测逻辑遗留)

**位置**: `stats2.html` 第 9728、9900 行

**问题**: 虽然移除了设置 `__PRESENCE_SKIPPED` 的代码，但检查逻辑仍然存在：
```javascript
if (window.__PRESENCE_SKIPPED) return;
```

由于 `__PRESENCE_SKIPPED` 永远不会被设置（值为 `undefined`），这个检查总是通过，不会影响功能。

## 正确的解决方案

### 方案 A：修改前端配置（推荐，最简单）

**不使用 WebSocket 代理，直接连接 Supabase**

Supabase Realtime 的 WebSocket 端点会自动从 `SUPABASE_URL` 推导，通常不需要特别配置。问题可能只是 Cloudflare 代理阻止了 WebSocket 连接。

**修改**: 移除错误的 `realtime.params.ws` 配置，添加 Cloudflare 特定的 CSP 和路由规则。

### 方案 B：实现正确的 WebSocket 代理（复杂，但更可靠）

需要：
1. 修改前端代码，使用自定义 WebSocket 构造函数
2. 修改 Worker 代码，使用正确的 Cloudflare Workers WebSocket API

## 推荐修复步骤

### 步骤 1: 简化前端配置（快速修复）

```javascript
// 移除错误的 WebSocket 代理配置
const initInterval = setInterval(() => {
    initAttempts++;

    if (typeof supabase !== 'undefined') {
        clearInterval(initInterval);

        try {
            // 简化配置，让 Supabase 自动处理 Realtime 端点
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                realtime: {
                    heartbeatIntervalMs: 5000, // 5秒心跳
                }
            });

            window.supabaseClient = supabaseClient;

            console.log('[Init] ✅ Supabase 客户端已初始化');
        } catch (err) {
            console.error('[Init] ❌ 初始化失败:', err);
        }
    } else if (initAttempts >= maxAttempts) {
        clearInterval(initInterval);
        console.error('[Init] ❌ Supabase SDK 加载超时');
    }
}, 100);
```

### 步骤 2: 移除 Worker 中的 WebSocket 代理代码（如果不需要）

```typescript
// src/worker/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 移除 WebSocket 代理逻辑
    return app.fetch(request, env, ctx);
  },
  scheduled: scheduled
};
```

### 步骤 3: 移除残留的检查代码（可选）

```javascript
// stats2.html
function updateOnlineList() {
    if (!presenceChannel) {
        // 移除 __PRESENCE_SKIPPED 检查
        console.warn('[UserList] ⚠️ Presence频道未初始化');
        return;
    }
    // ...
}
```

## 验证方法

1. **检查 Cloudflare Dashboard**:
   - 进入 Cloudflare Dashboard
   - 选择域名 → SSL/TLS → Edge Certificates
   - 确保 "Always Use HTTPS" 已启用
   - 检查 Network 设置，确保 WebSocket 未被阻止

2. **检查 CSP 策略**:
   ```http
   # _headers 文件
   Content-Security-Policy: ...
   connect-src 'self' wss:// dtcplfhcgnxdzpigmotb.supabase.co wss:// *.supabase.co ...
   ```

3. **浏览器控制台检查**:
   - 打开开发者工具 → Network → WS 标签
   - 查找 WebSocket 连接尝试
   - 检查是否成功（状态码 101）

## 预期结果

修复后，应该看到：
- 浏览器控制台显示 `[Init] ✅ Supabase 客户端已初始化`
- WebSocket 连接成功建立
- 在线用户列表正常显示
- 在线人数实时更新
