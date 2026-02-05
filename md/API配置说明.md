# API 配置说明

## 问题描述

`cursor-clinical-analysis.psterman.workers.dev` 是部署在 Cloudflare Workers 上的 API，
在国内网络环境下可能被墙或访问极慢。

## 当前解决方案

页面已配置**演示数据模式**，当 API 无法访问时会自动显示演示数据，保证界面可用。

## 获取真实数据的三种方式

### 方式一：使用代理/VPN（最简单）

开启代理后刷新页面，即可正常访问 API 获取真实数据。

### 方式二：部署国内 API 镜像（推荐）

如果你有服务器，可以将 API 部署到国内服务器：

1. 获取 API 源码（联系原作者）
2. 部署到国内云服务商（阿里云、腾讯云等）
3. 修改 `stats2.html` 中的 API 端点配置

修改方法：

```html
<!-- 在 stats2.html 头部找到以下配置 -->
<meta name="api-endpoint" content="https://cursor-clinical-analysis.psterman.workers.dev/">
<meta name="api-endpoint-backup" content="">

<!-- 修改为： -->
<meta name="api-endpoint" content="https://your-cn-domain.com/">
<!-- 可以添加多个备用端点，用逗号分隔 -->
<meta name="api-endpoint-backup" content="https://backup1.com/,https://backup2.com/">
```

### 方式三：使用 Vercel/Netlify 代理

创建简单的代理服务：

```javascript
// vercel.json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://cursor-clinical-analysis.psterman.workers.dev/api/:path*"
    }
  ]
}
```

## 演示数据说明

当 API 无法访问时，页面会显示以下演示数据：

- 已诊断开发者：12,345
- 全网扫描次数：67,890
- 累计吐槽字数：9,876,543
- 城市覆盖：156
- 运行天数：365

数据分布：
- 中国：4,500
- 美国：3,200
- 日本：1,800
- 德国：1,200
- 英国：900

## 性能优化配置

页面已配置快速失败模式，API 请求超时时间：
- 主请求：4秒
- 国家摘要：2.5秒

如需调整，修改以下配置：

```html
<!-- 关闭快速失败模式（恢复默认 8-10 秒超时） -->
<meta name="api-fast-fail" content="false">
```

## 技术细节

### API 端点管理器

页面使用 `API_ENDPOINT_MANAGER` 自动管理多个端点：

```javascript
// 自动检测可用端点并切换
window.API_ENDPOINT_MANAGER = {
    endpoints: ['url1', 'url2', ...],
    healthStatus: Map,  // 端点健康状态
    getCurrent(),       // 获取当前端点
    switchNext(),       // 切换到下一个端点
    markHealthy()       // 标记端点健康状态
}
```

### 本地缓存

成功获取的数据会缓存到 `localStorage`：
- 缓存时间：5分钟
- 缓存键名：`country_summary_${国家代码}`

### 演示数据回退

当所有端点都失败时，自动使用 `DEMO_DATA`。
