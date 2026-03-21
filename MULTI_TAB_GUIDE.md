# 🦐 OpenClaw 多页面连接指南

## ✅ 已修复

页面现已支持同时打开多个 Tab 连接 Gateway！

## 🔧 修复内容

1. **等待 Challenge 机制** - 不再立即发送 connect 请求
2. **超时清理** - 收到 challenge 后清除定时器
3. **独立设备标识** - 每个 Tab 自动生成唯一 deviceId

## 📖 使用方法

### 方法 1：直接打开多个 Tab

在浏览器中打开多个 Tab，使用相同 URL：
```
http://localhost:3001/openclaw2.html#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8
```

每个 Tab 会：
- ✅ 独立连接 Gateway
- ✅ 独立会话
- ✅ 互不干扰

### 方法 2：使用不同设备标识（可选）

如果需要明确区分每个 Tab，可以添加 `dev` 参数：
```
Tab 1: http://localhost:3001/openclaw2.html#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8&dev=tab1
Tab 2: http://localhost:3001/openclaw2.html#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8&dev=tab2
Tab 3: http://localhost:3001/openclaw2.html#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8&dev=tab3
```

### 方法 3：混合使用

可以同时使用官方 Dashboard 和 openclaw2.html：
```
官方：http://127.0.0.1:<网关端口>/#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8
自定义：http://localhost:3001/openclaw2.html#token=qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8
```

## 🔍 验证连接

打开浏览器开发者工具（F12），查看 Console：

**成功连接会显示：**
```
[ClawCtrl] ws error
[Init] Token saved from URL hash: qclaw-bf79...
WebSocket 已连接
收到挑战 (nonce: xxx...)
✓ 认证成功 (methods: xx, events: xx)
```

**失败会显示：**
```
认证失败：connect is only valid as the first request
```

## ⚠️ 注意事项

1. **Token 保密** - 不要分享给他人
2. **浏览器限制** - 某些浏览器可能限制同一域名的大量 Tab
3. **Gateway 负载** - 过多连接可能影响性能（一般 10 个以内没问题）

## 🐛 故障排除

### 问题：只能打开一个页面

**原因：** 旧版本代码 Bug（已修复）

**解决：**
1. 清除浏览器缓存（Ctrl+Shift+Del）
2. 硬刷新页面（Ctrl+F5）
3. 确认使用修复后的文件

### 问题：认证失败

**检查：**
1. Token 是否正确：`qclaw-bf792fb0e7010c03e6e8bd82f7fd76d8`
2. Gateway 是否运行：`openclaw gateway status`
3. 端口是否正确：18789

### 问题：无限重连

**原因：** 代码逻辑问题（已修复）

**解决：** 刷新页面（Ctrl+F5）

## 📊 当前状态

- ✅ 单页面连接
- ✅ 多页面并发连接
- ✅ 官方 Dashboard 兼容
- ✅ 自动设备标识
- ✅ Challenge 等待机制

---

最后更新：2026-03-15 15:49 GMT+8
