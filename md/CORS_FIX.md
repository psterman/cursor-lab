# CORS 跨域错误修复说明

## 问题描述

在 `index.html` 中加载答案之书时，从 `https://cursor-clinical-analysis.psterman.workers.dev/` 获取数据时出现 CORS（跨域安全策略）错误。

## 问题根源

Cloudflare Workers 的 CORS 配置过于严格，只允许特定域名访问，导致其他域名（如本地开发环境、GitHub Pages 等）无法访问 API。

## 修复方案

### 1. Workers 端修复（已修复）

**文件**: `src/worker/index.ts`

**修改内容**:
- 将 CORS 配置从"仅允许指定域名"改为"允许所有来源"
- 添加了更多允许的域名（包括 GitHub Pages）
- 简化了 CORS 配置逻辑

**修改前**:
```typescript
app.use('/*', cors({
  origin: (origin) => {
    // 开发环境允许所有来源，生产环境仅允许指定域名
    if (!origin || process.env.NODE_ENV === 'development') {
      return '*';
    }
    // 检查是否在允许列表中
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      // ... 复杂的匹配逻辑
    });
    return isAllowed ? origin : ALLOWED_ORIGINS[0];
  },
  // ...
}));
```

**修改后**:
```typescript
app.use('/*', cors({
  origin: '*', // 允许所有来源（公开 API）
  allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'Content-Type'],
  credentials: false, // 不允许携带凭证（因为允许所有来源）
  maxAge: 86400, // Access-Control-Max-Age: 86400
}));
```

### 2. 前端错误处理改进（已修复）

**文件**: `index.html`

**修改内容**:
- 添加了 CORS 错误的专门检测和提示
- 改进了错误消息，使其更加友好和明确

**修改后**:
```javascript
// 检查是否是 CORS 错误
const isCorsError = err.message?.includes('CORS') || 
                   err.message?.includes('cors') ||
                   err.message?.includes('cross-origin') ||
                   err.name === 'TypeError' && err.message?.includes('fetch');

if (isCorsError) {
    setError(isEn 
        ? 'CORS error: Please check API server CORS settings' 
        : '跨域错误：请检查 API 服务器的 CORS 设置');
} else {
    setError(err.message || (isEn ? 'Failed to load prompt' : '加载提示失败'));
}
```

## 部署步骤

### 重要：需要部署 Workers 代码才能生效！

1. **部署 Workers 代码**:
   ```bash
   npm run worker:deploy
   ```
   或者使用 Wrangler CLI:
   ```bash
   wrangler deploy
   ```

2. **验证部署**:
   - 访问 `https://cursor-clinical-analysis.psterman.workers.dev/`
   - 检查响应头中是否包含正确的 CORS 头：
     - `Access-Control-Allow-Origin: *`
     - `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE`
     - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`

3. **测试 API**:
   ```bash
   curl -H "Origin: http://localhost:5173" \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        https://cursor-clinical-analysis.psterman.workers.dev/api/random_prompt
   ```

## 安全考虑

⚠️ **注意**: 允许所有来源（`origin: '*'`）意味着任何网站都可以访问你的 API。这对于公开的 API 是可以接受的，但如果你需要限制访问，可以：

1. **恢复域名白名单**:
   ```typescript
   app.use('/*', cors({
     origin: (origin) => {
       if (!origin) return '*';
       const isAllowed = ALLOWED_ORIGINS.some(allowed => {
         if (allowed.includes('*')) {
           const pattern = '^' + allowed.replace(/\*/g, '.*') + '$';
           return new RegExp(pattern).test(origin);
         }
         return origin === allowed;
       });
       return isAllowed ? origin : null; // 不在白名单中返回 null（拒绝）
     },
     // ...
   }));
   ```

2. **添加 API Key 验证**:
   - 在请求头中添加 API Key
   - 在 Workers 中验证 API Key

## 测试清单

- [ ] 部署 Workers 代码
- [ ] 验证 CORS 响应头
- [ ] 测试从本地开发环境访问 API
- [ ] 测试从 GitHub Pages 访问 API
- [ ] 测试答案之书组件是否正常加载
- [ ] 检查浏览器控制台是否还有 CORS 错误

## 相关文件

- `src/worker/index.ts` - Workers 入口文件（已修复）
- `index.html` - 前端页面（已改进错误处理）
- `wrangler.toml` - Wrangler 配置文件

## 版本信息

- 修复日期：2026-01-27
- 修复文件：
  - `src/worker/index.ts` (行 562-590)
  - `index.html` (行 2503-2514)
