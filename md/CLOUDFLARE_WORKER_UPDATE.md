# Cloudflare Worker 修改指南

## 📋 修改目的
1. 添加重置计数器功能（从 0 开始计数）
2. 保持原有的 GET 和 POST 功能
3. 支持通过 POST 请求重置计数器

## 🔧 步骤 1：登录 Cloudflare Dashboard

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 登录你的账户
3. 选择你的账户/域名

## 🔧 步骤 2：进入 Workers & Pages

1. 在左侧菜单中找到 **Workers & Pages**
2. 点击进入
3. 找到你的 Worker：`cursor-clinical-analysis`
4. 点击 Worker 名称进入详情页

## 🔧 步骤 3：编辑 Worker 代码

1. 在 Worker 详情页，点击 **"Quick Edit"** 或 **"Edit Code"** 按钮
2. 你会看到一个代码编辑器
3. 将以下完整代码复制并替换现有代码：

```javascript
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // 允许 GitHub Pages 跨域
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 1. 处理预检请求 (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const key = "total_users";
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const userLockKey = `lock_${clientIP}`;

    try {
      // --- 处理 POST 请求 (上报新用户或重置) ---
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        
        // 检查是否是重置请求
        if (body.action === "reset") {
          // 删除计数器，重置为 0
          await env.STATS_STORE.delete(key);
          
          return new Response(JSON.stringify({ 
            value: 0, 
            status: "reset_success",
            message: "计数器已重置为 0"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // 正常的计数增加逻辑
        const alreadyCounted = await env.STATS_STORE.get(userLockKey);
        let countStr = await env.STATS_STORE.get(key);
        let count = countStr ? parseInt(countStr) : 0;

        let action = "skipped_duplicate";
        if (!alreadyCounted) {
          count += 1;
          await env.STATS_STORE.put(key, count.toString());
          // 锁定该 IP 24 小时
          await env.STATS_STORE.put(userLockKey, "true", { expirationTtl: 86400 });
          action = "incremented";
        }

        return new Response(JSON.stringify({ value: count, action }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- 处理 GET 请求 (获取总数) ---
      let countStr = await env.STATS_STORE.get(key);
      let count = countStr ? parseInt(countStr) : 0;

      return new Response(JSON.stringify({ value: count, status: "success" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e) {
      // 返回具体的错误信息方便调试
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
```

## 🔧 步骤 4：保存并部署

1. 点击编辑器右上角的 **"Save and Deploy"** 按钮
2. 等待部署完成（通常几秒钟）
3. 看到 "Successfully deployed" 提示即表示部署成功

## 🔧 步骤 5：重置计数器（可选）

### 方法 1：使用浏览器控制台重置

1. 打开你的网站：https://psterman.github.io/cursor-lab/
2. 按 `F12` 打开开发者工具
3. 切换到 **Console（控制台）** 标签
4. 粘贴以下代码并回车：

```javascript
// 重置 Cloudflare KV 存储中的计数器
fetch('https://cursor-clinical-analysis.psterman.workers.dev/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        action: 'reset'
    })
})
.then(res => res.json())
.then(data => {
    console.log('✅ 重置成功:', data);
    // 清空本地缓存
    localStorage.removeItem('totalTestUsers');
    // 刷新页面查看效果
    location.reload();
})
.catch(error => {
    console.error('❌ 重置失败:', error);
});
```

5. 如果看到 `✅ 重置成功: {value: 0, status: "reset_success", ...}`，说明重置成功
6. 页面会自动刷新，计数器应该显示为 0

### 方法 2：在 Cloudflare Dashboard 中手动删除 KV 键

1. 在 Cloudflare Dashboard 中，进入 **Workers & Pages**
2. 点击左侧菜单的 **KV**
3. 找到你的 KV 命名空间（通常是 `STATS_STORE` 或类似名称）
4. 点击命名空间进入
5. 找到键名 `total_users`
6. 点击右侧的 **"Delete"** 按钮删除
7. 刷新你的网站，计数器应该显示为 0

## ✅ 验证修改

1. 访问你的网站：https://psterman.github.io/cursor-lab/
2. 打开浏览器开发者工具（F12）
3. 查看 **Network（网络）** 标签
4. 刷新页面，应该能看到对 `cursor-clinical-analysis.psterman.workers.dev` 的 GET 请求
5. 检查响应，应该返回 `{"value": 0, "status": "success"}`（如果已重置）
6. 页面上应该显示 **"0 人"** 或 **"0"**

## 🔍 测试 API

你可以在浏览器控制台测试 API：

```javascript
// 测试 GET 请求（获取当前计数）
fetch('https://cursor-clinical-analysis.psterman.workers.dev/')
    .then(res => res.json())
    .then(data => console.log('当前计数:', data));

// 测试 POST 请求（增加计数）
fetch('https://cursor-clinical-analysis.psterman.workers.dev/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'increment'})
})
.then(res => res.json())
.then(data => console.log('增加后:', data));

// 测试重置（重置为 0）
fetch('https://cursor-clinical-analysis.psterman.workers.dev/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'reset'})
})
.then(res => res.json())
.then(data => console.log('重置结果:', data));
```

## 📝 主要修改说明

### 新增功能：
- ✅ 支持通过 `POST` 请求 + `{"action": "reset"}` 重置计数器
- ✅ 重置后返回 `{"value": 0, "status": "reset_success"}`

### 保持不变：
- ✅ GET 请求：获取当前计数
- ✅ POST 请求（无 action 或 action: "increment"）：正常计数增加
- ✅ IP 锁定机制：24 小时内同一 IP 只计数一次
- ✅ CORS 配置：允许跨域请求

## ⚠️ 注意事项

1. **KV 存储绑定**：确保你的 Worker 已经绑定了 KV 命名空间 `STATS_STORE`
   - 在 Worker 设置中检查 **"Variables"** → **"KV Namespace Bindings"**
   - 如果没有绑定，需要先创建 KV 命名空间并绑定

2. **重置后数据丢失**：重置计数器会删除所有历史数据，请谨慎操作

3. **IP 锁定**：重置计数器不会清除 IP 锁定记录，24 小时后会自动过期

## 🆘 遇到问题？

如果遇到问题，请检查：
1. Worker 代码是否正确保存并部署
2. KV 命名空间是否正确绑定
3. 浏览器控制台是否有错误信息
4. Network 标签中 API 请求的响应内容
