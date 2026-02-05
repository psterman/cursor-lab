# Cloudflare WebSocket 代理配置说明

## 问题

Supabase Realtime 使用 WebSocket (`wss://`) 连接，当通过 Cloudflare 代理时，WebSocket 连接可能被阻止或超时，导致在线用户频道无法正常加载。

## 解决方案

本方案通过 Cloudflare Worker 代理 WebSocket 连接，让 Supabase Realtime 在 Cloudflare 环境下正常工作。

### 已实现的组件

#### 1. Worker WebSocket 代理 (`src/worker/index.ts`)

在主 Worker 中添加了 WebSocket 代理功能：
- 检测 WebSocket 升级请求 (`Upgrade: websocket`)
- 代理 Supabase Realtime WebSocket 连接
- 双向转发客户端 ↔ Supabase 的消息

#### 2. 前端 Supabase 客户端配置 (`stats2.html`, `stats2.app.js`)

自动检测 Cloudflare 环境，配置 WebSocket 代理：
- 检测 `.pages.dev`, `.workers.dev` 域名
- 检测 CF-Ray header（支持自定义域名）
- 设置 `realtime.params.ws` 使用 Worker 代理端点

## 部署步骤

### 1. 确保 Worker 已配置 SUPABASE_URL

`wrangler.toml` 中应该有：
```toml
[vars]
SUPABASE_URL = "https://dtcplfhcgnxdzpigmotb.supabase.co"
```

### 2. 部署 Worker

```bash
npm run worker:deploy
```

### 3. 验证部署

访问以下端点验证 WebSocket 代理：
```
https://cursor-clinical-analysis.psterman.workers.dev/realtime/v1
```

应该返回 WebSocket 握手响应（状态码 101）。

## 工作原理

```
浏览器                          Cloudflare Worker                       Supabase
  │                                  │                                    │
  │ ── WebSocket (wss://) ──────────>│                                    │
  │     /realtime/v1                │                                    │
  │                                  │ ── WebSocket (wss://) ──────────>│
  │                                  │     dtcplfhcgnxdzpigmotb.../realtime/v1
  │                                  │                                    │
  │ <──────── 消息转发 ──────────────│<──────── 实时事件 ────────────────│
  │                                  │                                    │
  │ ── 用户状态 (track) ────────────>│                                    │
  │                                  │ ── Presence ─────────────────────>│
  │                                  │                                    │
  │ <──────── 在线用户列表 ──────────│<──────── Presence Sync ────────────│
  │                                  │                                    │
```

## 网络配置

### 防火墙/安全组

确保以下出站连接被允许：
- `wss://dtcplfhcgnxdzpigmotb.supabase.co` (Supabase Realtime)
- `wss://*.supabase.co` (备用)

### CSP 策略

`_headers` 文件中的 CSP 策略需要允许 WebSocket 连接：
```http
connect-src 'self' wss:// dtcplfhcgnxdzpigmotb.supabase.co wss:// *.supabase.co ...
```

## 故障排除

### 1. WebSocket 连接失败

**症状**：浏览器控制台显示 WebSocket 连接错误

**检查**：
- 打开浏览器开发者工具 → Network → WS 标签
- 查看 WebSocket 握手请求的状态码
- 101 = 成功，其他状态码 = 失败

**解决方案**：
- 确认 Worker 已正确部署
- 检查 `SUPABASE_URL` 环境变量是否配置
- 查看 Worker 日志：`wrangler tail`

### 2. 在线用户列表不更新

**症状**：连接成功但在线用户数量为 0 或不更新

**检查**：
- 浏览器控制台是否有 `[Realtime]` 日志
- 检查 Supabase Presence 表配置

**解决方案**：
- 确认 Supabase 项目启用了 Realtime 功能
- 检查 Realtime 配置是否正确

### 3. CORS 错误

**症状**：浏览器显示跨域错误

**解决方案**：
- 在 Supabase Dashboard 中配置 CORS 设置
- 允许 Worker 的域名

## 性能考虑

- WebSocket 代理会增加约 10-50ms 延迟
- Worker 免费计划有请求次数限制（100,000/天）
- 建议使用付费计划以获得更高性能

## 替代方案

如果 WebSocket 代理方案无法使用，可以考虑：

### 方案 A：HTTP 轮询（降级方案）

不使用 Realtime，改用 HTTP 轮询获取在线用户：
- 定时（如每 30 秒）调用 `/api/presence` 获取在线用户列表
- 缺点：延迟高，不实时

### 方案 B：绕过 Cloudflare 代理

为 Supabase Realtime 配置专门的子域名，不经过 Cloudflare：
- `realtime.yourdomain.com` 直接指向 Supabase
- 其他流量通过 Cloudflare
- 缺点：部分流量绕过 Cloudflare 保护

## 参考资料

- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [Cloudflare Workers WebSocket](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Hono WebSocket 支持](https://hono.dev/docs/helpers/websocket)
