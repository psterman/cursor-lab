# CORS 错误解决指南

## ❌ 错误信息

```
Access to script at 'file:///C:/Users/pster/Desktop/webassembly/main.js' from origin 'null' has been blocked by CORS policy
```

## 🔍 错误原因

您直接从文件系统打开了 HTML 文件（双击 index.html），而不是通过 HTTP 服务器访问。

**浏览器的安全策略**：
- 禁止从 `file://` 协议加载 ES6 模块
- 必须通过 HTTP/HTTPS 协议访问
- 需要使用本地开发服务器

## ✅ 正确的启动方式

### 方式一：使用 Vite 开发服务器（最推荐）

**Windows 用户**：

1. **打开命令提示符**（CMD）或 PowerShell

2. **进入项目目录**：
   ```bash
   cd C:\Users\pster\Desktop\webassembly
   ```

3. **启动开发服务器**：
   ```bash
   npm run dev
   ```

4. **等待服务器启动**：
   ```
   VITE v5.4.21  ready in 345 ms
   
   ➜  Local:   http://localhost:3000/
   ➜  Network: use --host to expose
   ```

5. **打开浏览器**：
   - 方法 1：自动打开（如果支持）
   - 方法 2：手动访问 `http://localhost:3000`

**macOS/Linux 用户**：

1. **打开终端**

2. **进入项目目录**：
   ```bash
   cd /Users/pster/Desktop/webassembly
   ```

3. **启动开发服务器**：
   ```bash
   npm run dev
   ```

4. **打开浏览器访问**：`http://localhost:3000`

### 方式二：使用启动脚本（Windows）

**双击 `start.bat` 文件**：

1. 在文件资源管理器中找到 `start.bat`
2. 双击运行
3. 等待浏览器自动打开

**如果浏览器没有自动打开**：

1. 查看命令提示符窗口中的提示
2. 手动在浏览器中访问：`http://localhost:3000`

### 方式三：使用 VS Code Live Server

1. **安装 VS Code 扩展**：
   - 打开 VS Code
   - 点击左侧扩展图标（或按 Ctrl+Shift+X）
   - 搜索 "Live Server"
   - 点击 "Install" 安装

2. **打开项目**：
   - 文件 → 打开文件夹
   - 选择 `C:\Users\pster\Desktop\webassembly`

3. **启动 Live Server**：
   - 右键点击 `index.html`
   - 选择 "Open with Live Server"
   - 浏览器会自动打开

## ❌ 错误的启动方式

**不要这样做**：

- ❌ 直接双击 `index.html` 文件
- ❌ 直接双击 `dist/index.html` 文件
- ❌ 在浏览器地址栏输入 `file:///C:/.../index.html`
- ❌ 右键 → 打开方式 → Chrome/Edge

**为什么不行**：
- 浏览器的安全策略禁止从 `file://` 协议加载 ES6 模块
- 会看到 CORS 错误
- 应用无法正常运行

## 🧪 验证是否正确启动

### 正确的 URL

**正确的**：
- ✅ `http://localhost:3000`
- ✅ `http://127.0.0.1:3000`
- ✅ `http://localhost:5173`（Vite 默认端口）
- ✅ `http://192.168.x.x:3000`（局域网访问）

**错误的**：
- ❌ `file:///C:/Users/.../index.html`
- ❌ `file:///C:/Users/.../dist/index.html`

### 浏览器地址栏检查

打开应用后，查看浏览器地址栏：

**正确的**：
```
http://localhost:3000/
```

**错误的**：
```
file:///C:/Users/pster/Desktop/webassembly/index.html
```

## 🔧 故障排查

### 问题 1：npm run dev 命令失败

**错误信息**：
```
'npm' 不是内部或外部命令
```

**解决方法**：
1. 确认已安装 Node.js
2. 在命令提示符中输入 `node --version` 检查
3. 如果未安装，从 [nodejs.org](https://nodejs.org/) 下载安装

### 问题 2：端口被占用

**错误信息**：
```
Port 3000 is in use
```

**解决方法**：
1. 停止占用 3000 端口的进程
2. 或使用其他端口：`npm run dev -- --port 3001`
3. 然后访问 `http://localhost:3001`

### 问题 3：浏览器无法访问 localhost

**错误信息**：
```
localhost refused to connect
```

**解决方法**：
1. 确认开发服务器正在运行
2. 查看命令提示符窗口，确认没有错误
3. 尝试刷新页面
4. 尝试访问 `http://127.0.0.1:3000`

### 问题 4：打开后还是看到 CORS 错误

**检查清单**：
- [ ] 浏览器地址栏显示 `http://localhost:3000`（不是 file://）
- [ ] 开发服务器正在运行（命令提示符窗口打开中）
- [ ] 没有直接双击 HTML 文件
- [ ] 使用的是 Chrome、Edge 或 Firefox（不是 IE）

**如果以上都满足**：
1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 尝试无痕模式（Ctrl+Shift+N）
3. 尝试不同的浏览器

## 📋 完整的启动检查清单

### 启动前
- [ ] 已安装 Node.js（版本 >= 14）
- [ ] 已运行 `npm install` 安装依赖
- [ ] 在项目目录中（C:\Users\pster\Desktop\webassembly）

### 启动命令
- [ ] 使用 `npm run dev` 命令
- [ ] 或双击 `start.bat` 文件
- [ ] 或使用 VS Code Live Server

### 浏览器访问
- [ ] 浏览器地址栏显示 `http://localhost:3000`
- [ ] 不是 `file://` 协议
- [ ] 可以看到应用界面

### 控制台检查
- [ ] 按 F12 打开控制台
- [ ] 没有 CORS 错误
- [ ] 显示 "[Main] ===== 应用初始化开始 ====="

## 🎯 最简单的方法

**Windows 用户**：

1. 打开文件夹：`C:\Users\pster\Desktop\webassembly`
2. 双击 `start.bat` 文件
3. 等待浏览器自动打开
4. 如果浏览器没有自动打开，手动访问 `http://localhost:3000`

**macOS/Linux 用户**：

1. 打开终端
2. 进入目录：`cd /Users/pster/Desktop/webassembly`
3. 运行命令：`npm run dev`
4. 打开浏览器访问：`http://localhost:3000`

## 📞 还是不行？

### 收集诊断信息

1. **命令提示符窗口的输出**：
   - 复制所有文本输出
   - 或截图

2. **浏览器地址栏**：
   - 复制完整的 URL
   - 确认是 `http://` 而不是 `file://`

3. **浏览器控制台**：
   - 按 F12 打开
   - 切换到 Console 标签页
   - 查看是否有红色错误信息

### 常见问题

**Q: 我可以不用 npm 吗？**
A: 不行。必须使用本地开发服务器，因为应用使用了 ES6 模块。

**Q: 我可以部署到服务器使用吗？**
A: 可以。运行 `npm run build` 构建，然后部署 `dist/` 目录到任何 HTTP 服务器。

**Q: 我可以双击 dist/index.html 吗？**
A: 不行。即使构建后的文件也需要 HTTP 服务器。

## 🚀 现在就开始

```bash
# Windows
cd C:\Users\pster\Desktop\webassembly
npm run dev

# macOS/Linux
cd /Users/pster/Desktop/webassembly
npm run dev
```

然后在浏览器中访问：`http://localhost:3000`

---

**记住**：不要直接双击 HTML 文件，必须通过 HTTP 服务器访问！
