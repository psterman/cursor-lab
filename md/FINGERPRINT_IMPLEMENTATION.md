# 指纹识别与身份绑定实现文档

## 概述

本文档描述了完整的指纹识别和身份绑定系统实现，解决了浏览器本地指纹与 Supabase 数据库身份信息自动绑定的问题。

## 架构设计

### 1. 后端服务 (`src/worker/fingerprint-service.ts`)

提供了三个核心函数：

- **`identifyUserByFingerprint`**: 根据指纹识别用户（On Load）
- **`bindFingerprintToUser`**: 绑定 GitHub ID 和指纹（On Save）
- **`updateUserByFingerprint`**: 根据指纹更新用户信息

### 2. API 端点 (`src/worker/index.ts`)

新增两个 REST API 端点：

#### POST `/api/fingerprint/identify`
- **功能**: 根据指纹识别用户
- **请求体**:
  ```json
  {
    "fingerprint": "3aaee760c994b..."
  }
  ```
- **响应**:
  ```json
  {
    "status": "success",
    "data": { /* 用户数据 */ },
    "message": "用户识别成功"
  }
  ```

#### POST `/api/fingerprint/bind`
- **功能**: 绑定 GitHub ID 和指纹
- **请求体**:
  ```json
  {
    "githubUsername": "username",
    "fingerprint": "3aaee760c994b..."
  }
  ```
- **响应**:
  ```json
  {
    "status": "success",
    "data": { /* 更新后的用户数据 */ },
    "message": "身份绑定成功"
  }
  ```

### 3. 前端逻辑 (`stats2.html`)

#### 指纹捕获与识别逻辑 (On Load)

在 `window.onload` 中：

1. 生成或获取浏览器指纹
2. 调用 `/api/fingerprint/identify` 识别用户
3. 如果找到用户，自动加载到 UI
4. 更新全局变量 `window.currentUser` 和 `window.allData`

```javascript
// 在 window.onload 中自动执行
if (currentFingerprint) {
  const identifyResponse = await fetch('/api/fingerprint/identify', {
    method: 'POST',
    body: JSON.stringify({ fingerprint: currentFingerprint })
  });
  // 处理响应并更新 UI
}
```

#### 身份绑定逻辑 (On Save)

在 `saveGitHubUsername` 函数中：

1. 获取用户输入的 GitHub ID
2. 获取当前浏览器指纹
3. 调用 `/api/fingerprint/bind` 执行 UPSERT 操作
4. 更新本地数据和 UI

```javascript
async function saveGitHubUsername() {
  const username = input.value.trim();
  const fingerprint = localStorage.getItem('user_fingerprint');
  
  const response = await fetch('/api/fingerprint/bind', {
    method: 'POST',
    body: JSON.stringify({
      githubUsername: username,
      fingerprint: fingerprint
    })
  });
  // 处理响应并更新 UI
}
```

## 数据流程

### 场景 1: 页面加载时识别用户

```
1. 浏览器生成/获取指纹 → localStorage
2. 前端调用 /api/fingerprint/identify
3. 后端查询 Supabase: SELECT * FROM user_analysis WHERE fingerprint = ?
4. 如果找到 → 返回用户数据 → 前端更新 UI
5. 如果未找到 → 返回 null → 前端显示"未绑定"状态
```

### 场景 2: 用户保存 GitHub ID

```
1. 用户输入 GitHub ID 并点击保存
2. 前端调用 /api/fingerprint/bind
3. 后端执行 UPSERT:
   - 先查找: SELECT * FROM user_analysis WHERE user_name = ?
   - 如果存在 → UPDATE fingerprint = ?
   - 如果不存在 → INSERT (id, user_name, fingerprint)
4. 返回更新后的用户数据
5. 前端更新 window.currentUser 和 window.allData
6. 刷新 UI（排名卡片、统计卡片等）
```

## 数据库操作

### UPSERT 逻辑

`bindFingerprintToUser` 函数实现了智能的 UPSERT：

1. **查找现有用户**: 根据 `user_name` 查找
2. **如果找到**: 更新 `fingerprint` 字段
3. **如果未找到**: 创建新记录，包含：
   - `id`: UUID (自动生成)
   - `user_name`: GitHub 用户名
   - `fingerprint`: 浏览器指纹
   - `github_username`: GitHub 用户名
   - `github_id`: GitHub 用户名
   - `created_at`: 当前时间
   - `updated_at`: 当前时间

## 错误处理

### 网络错误
- 捕获 `fetch` 异常
- 显示友好的错误提示
- 不阻塞主要功能

### 权限错误
- 检查 Supabase RLS 策略
- 确保 API Key 有足够权限
- 记录详细错误日志

### 数据验证
- 验证 `fingerprint` 和 `githubUsername` 参数
- 处理空值和无效值
- 规范化输入数据

## 安全考虑

1. **API Key 保护**: 使用环境变量存储 Supabase Key
2. **输入验证**: 验证和清理用户输入
3. **RLS 策略**: 配置适当的行级安全策略
4. **错误信息**: 不暴露敏感信息给前端

## 测试建议

### 1. 单元测试

```typescript
// 测试指纹识别
test('identifyUserByFingerprint - 找到用户', async () => {
  const user = await identifyUserByFingerprint('test_fingerprint', env);
  expect(user).toBeTruthy();
  expect(user.fingerprint).toBe('test_fingerprint');
});

// 测试指纹绑定
test('bindFingerprintToUser - 创建新用户', async () => {
  const user = await bindFingerprintToUser('newuser', 'new_fingerprint', env);
  expect(user).toBeTruthy();
  expect(user.user_name).toBe('newuser');
});
```

### 2. 集成测试

1. 打开 stats2.html
2. 检查控制台日志，确认指纹生成
3. 检查是否自动识别到用户（如果已绑定）
4. 输入 GitHub ID 并保存
5. 验证数据是否正确更新到数据库
6. 刷新页面，验证是否自动识别

## 部署检查清单

- [ ] 确保 `SUPABASE_URL` 和 `SUPABASE_KEY` 环境变量已配置
- [ ] 在 Supabase 中执行 RLS 配置（参考 `SUPABASE_RLS_CONFIG.md`）
- [ ] 创建必要的索引（fingerprint, user_name）
- [ ] 测试 API 端点是否可访问
- [ ] 验证前端能正确调用 API
- [ ] 检查浏览器控制台是否有错误

## 故障排查

### 问题: 指纹识别失败

**可能原因**:
1. 数据库中 fingerprint 字段为 NULL
2. RLS 策略阻止查询
3. API Key 权限不足

**解决方案**:
1. 检查数据库中的 fingerprint 字段
2. 检查 RLS 策略配置
3. 使用 Service Role Key 而不是 Anon Key

### 问题: 绑定失败

**可能原因**:
1. RLS 策略阻止更新
2. 唯一约束冲突
3. 网络错误

**解决方案**:
1. 检查 RLS UPDATE 策略
2. 检查唯一约束
3. 查看浏览器控制台和 Supabase 日志

## 后续优化建议

1. **缓存机制**: 缓存识别结果，减少 API 调用
2. **批量操作**: 支持批量绑定多个指纹
3. **指纹版本**: 支持指纹算法升级和迁移
4. **审计日志**: 记录所有绑定操作
5. **冲突处理**: 处理指纹冲突（多个用户使用相同指纹）

## 相关文件

- `src/worker/fingerprint-service.ts` - 核心服务函数
- `src/worker/index.ts` - API 端点定义
- `stats2.html` - 前端实现
- `SUPABASE_RLS_CONFIG.md` - RLS 配置指南
