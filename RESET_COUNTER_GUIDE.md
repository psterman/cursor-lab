# 重置计数器指南（不删除命名空间）

## ⚠️ 重要提示

**不要删除整个 KV 命名空间！** 你的 Worker `cursor-clinical-analysis` 正在使用 `STATS_STORE` 命名空间。删除命名空间会导致 Worker 无法正常工作。

## ✅ 正确做法：只删除 KV 中的键

### 方法 1：使用重置 API（推荐）

**前提条件**：需要先更新 Worker 代码（参考 `CLOUDFLARE_WORKER_UPDATE.md`）

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
    alert('重置失败，请检查 Worker 代码是否已更新');
});
```

5. 如果看到 `✅ 重置成功: {value: 0, status: "reset_success", ...}`，说明重置成功
6. 页面会自动刷新，计数器应该显示为 0

### 方法 2：在 Cloudflare Dashboard 中删除键

#### 步骤 1：进入 KV 命名空间（不要删除命名空间！）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 点击左侧菜单的 **KV**
4. 找到你的 KV 命名空间：`STATS_STORE`
5. **点击命名空间名称进入**（不要点击删除按钮！）

#### 步骤 2：删除 `total_users` 键

1. 在命名空间详情页，你会看到所有键的列表
2. 找到键名：`total_users`
3. 点击该键右侧的 **"Delete"** 或 **"删除"** 按钮
4. 确认删除（只删除这个键，不影响命名空间）

#### 步骤 3：可选 - 删除 IP 锁定键

1. 在同一个命名空间中，找到所有以 `lock_` 开头的键
2. 这些是 IP 锁定键，格式如：`lock_192.168.1.1`
3. 可以逐个删除，或者等待 24 小时后自动过期
4. 删除这些键可以让用户立即重新计数（否则需要等 24 小时）

#### 步骤 4：验证

1. 刷新你的网站：https://psterman.github.io/cursor-lab/
2. 打开浏览器开发者工具（F12）
3. 查看 **Network（网络）** 标签
4. 刷新页面，应该能看到对 API 的 GET 请求
5. 检查响应，应该返回 `{"value": 0, "status": "success"}`
6. 页面上应该显示 **"0 人"** 或 **"0"**

### 方法 3：使用 Wrangler CLI（高级用户）

如果你安装了 Wrangler CLI，可以使用命令行：

```bash
# 删除 total_users 键
wrangler kv:key delete "total_users" --namespace-id=YOUR_NAMESPACE_ID

# 查看命名空间 ID
wrangler kv:namespace list
```

## 📊 对比说明

| 操作 | 影响范围 | 是否推荐 |
|------|---------|---------|
| **删除整个命名空间** | ❌ Worker 无法工作，所有数据丢失 | ❌ **不推荐** |
| **删除 `total_users` 键** | ✅ 只重置计数器，Worker 正常工作 | ✅ **推荐** |
| **使用重置 API** | ✅ 最安全，代码控制 | ✅ **最推荐** |

## 🔍 如何检查命名空间是否被使用

1. 在 Cloudflare Dashboard → Workers & Pages → KV
2. 找到 `STATS_STORE` 命名空间
3. 查看右侧的 **"Associated Scripts"** 或 **"关联脚本"**
4. 如果看到 `cursor-clinical-analysis`，说明正在使用中
5. **不要删除正在使用的命名空间！**

## ⚠️ 常见错误

### ❌ 错误做法：
- 删除整个 `STATS_STORE` 命名空间
- 取消 Worker 与命名空间的绑定（会导致 Worker 无法访问数据）

### ✅ 正确做法：
- 只删除 `total_users` 键
- 使用重置 API（如果已更新 Worker 代码）
- 保留命名空间和绑定关系

## 🆘 如果误删了命名空间

如果不小心删除了命名空间：

1. **立即重新创建命名空间**：
   - Workers & Pages → KV → Create a namespace
   - 名称：`STATS_STORE`（或使用原来的名称）
   - 创建后记录命名空间 ID

2. **重新绑定到 Worker**：
   - 进入 Worker 设置
   - Variables → KV Namespace Bindings
   - 添加绑定：变量名 `STATS_STORE`，选择刚创建的命名空间

3. **重新部署 Worker**：
   - 保存并部署 Worker

4. **重置计数器**：
   - 使用重置 API 或删除 `total_users` 键

## 📝 总结

- ✅ **只删除键，不删除命名空间**
- ✅ **使用重置 API 最安全**
- ✅ **保留 Worker 与命名空间的绑定**
- ❌ **不要删除正在使用的命名空间**
