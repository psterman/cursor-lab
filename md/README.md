# Cursor Audit Pro - WebAssembly 版本

基于 WebAssembly (sql.js) 的纯前端 Cursor 对话历史分析工具。所有解析在本地完成，不上传任何数据，确保隐私安全。

## ✨ 特性

- 🔒 **纯本地解析**：使用 WebAssembly 在浏览器端直接解析 SQLite 数据库，数据不上传服务器
- 📊 **丰富的统计分析**：总对话次数、AI 产出代码字符数、模型使用统计、编程时段分析
- 🎨 **精美可视化**：集成 Chart.js 提供热力图、饼图等数据可视化
- 📸 **一键导出**：使用 html2canvas 生成精美分析报告图片
- 🎯 **智能提取**：基于优先级的 JSON 递归提取算法，准确提取 AI 生成内容
- 🚀 **现代技术栈**：Vite + Vanilla JS + sql.js + Chart.js

## 📦 技术栈

- **构建工具**：Vite 5.0
- **数据库解析**：sql.js (WebAssembly)
- **数据可视化**：Chart.js
- **图片导出**：html2canvas
- **样式**：原生 CSS（Vercel 风格设计）

## 🚀 快速开始

### 本地开发

1. **安装依赖**
```bash
npm install
```

2. **启动开发服务器**
```bash
npm run dev
```

3. **访问应用**
打开浏览器访问 `http://localhost:3000`

### 构建生产版本

```bash
npm run build
```

构建后的文件将输出到 `dist/` 目录。

## 📁 项目结构

```
webassembly/
├── public/                 # 静态资源目录
│   └── sql-wasm.wasm       # Wasm 引擎文件（构建时自动生成）
├── src/
│   └── CursorParser.js     # 核心数据库解析类
├── dist/                   # 构建输出目录
├── index.html              # 首页（UI 界面）
├── main.js                 # 主逻辑（调用 Wasm 和图表）
├── style.css               # 样式
├── .nojekyll               # 防止 GitHub 过滤 Wasm 文件（重要！）
├── vite.config.js         # Vite 配置文件
└── package.json            # 项目配置文件
```

## 🎯 使用说明

### 1. 上传数据库

**重要提示**：只能上传数据库文件（.vscdb），不支持图片、文档等其他文件。

有两种方式上传数据：

**方式一：上传整个文件夹（推荐）**

点击"选择文件夹（批量处理）"按钮，选择 Cursor 的 workspaceStorage 目录：

```
Windows: C:\Users\[用户名]\AppData\Roaming\Cursor\User\workspaceStorage
```

**方式二：上传单个数据库文件**

点击"选择单个文件"按钮，选择 `.vscdb` 文件。

### 🚫 不支持的文件类型

- ❌ 图片文件（.png, .jpg, .gif）
- ❌ 文档文件（.pdf, .docx）
- ❌ 文本文件（.txt, .md）

### ✅ 支持的文件类型

- ✅ `.vscdb` 文件（Cursor 数据库）
- ✅ `.db` 文件（SQLite 数据库）
- ✅ `.sqlite` 文件（SQLite 数据库）
- ✅ `.sqlite3` 文件（SQLite3 数据库）
Windows: C:\Users\[用户名]\AppData\Roaming\Cursor\User\workspaceStorage
```

**方式二：上传单个数据库文件**

点击"选择单个文件"按钮，选择 `.vscdb` 文件。

### 2. 数据库扫描

应用会自动扫描选定目录下的所有 `state.vscdb` 文件，并提取对话数据。

### 3. 查看分析报告

- **统计卡片**：总对话次数、AI 产出代码字符数、最常用模型
- **图表展示**：
  - 编程时段热力图（24小时分布）
  - 模型使用分布（饼图）
- **热门提示词**：Top 5 最常使用的提示词
- **对话记录**：搜索和浏览对话历史

### 4. 导出报告

点击"保存分析报告"按钮，生成精美图片供分享。

## 🔧 核心功能说明

### 数据库解析（CursorParser.js）

```javascript
// 初始化解析器
const parser = new CursorParser();
await parser.init();

// 从 ArrayBuffer 加载数据库
await parser.loadDatabase(arrayBuffer);

// 扫描数据库
const chatData = await parser.scanDatabase();

// 获取统计信息
const stats = parser.getStats();
```

### JSON 提取优先级

按照以下优先级递归提取 AI 生成内容：

```javascript
const EXTRACTION_PRIORITY = {
  'modelResponse.code': 12,       // 代码片段（最高优先级）
  'modelResponse.codeBlock': 11,  // 代码块
  'modelResponse.implementation': 10, // 实现
  'modelResponse.text': 3,         // 普通文本
  // ...
};
```

## 🌐 GitHub Pages 部署

### 方式一：使用 GitHub CLI

1. **构建项目**
```bash
npm run build
```

2. **部署到 GitHub Pages**
```bash
# 确保已安装 gh CLI
gh pages deploy dist
```

### 方式二：手动部署

1. **推送代码到 GitHub**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **在 GitHub 上启用 Pages**
   - 进入仓库设置（Settings）
   - 找到"Pages"选项
   - 选择源为 `dist` 目录
   - 选择分支为 `main`
   - 点击"Save"

3. **重要配置**
确保 `.nojekyll` 文件存在于项目根目录，这会告诉 GitHub Pages 禁用 Jekyll 处理，确保 `.wasm` 文件能正常访问。

### 部署验证

访问 `https://[你的用户名].github.io/[仓库名]/` 查看部署结果。

## 🔍 常见问题

### Q: 点击"选择文件夹"没有反应？
**A**: 可能原因：
1. 浏览器不支持 `webkitdirectory`（推荐使用 Chrome/Edge）
2. 被浏览器安全设置阻止，请检查地址栏是否显示文件访问权限提示
3. 点击"选择单个文件"按钮尝试上传单个数据库文件

### Q: Wasm 文件无法加载？
**A**: 确保：
1. 项目根目录有 `.nojekyll` 文件
2. Vite 配置中的 `base` 路径正确（GitHub Pages 通常需要设置为仓库名）
3. 构建后的 `dist/` 目录包含 `.wasm` 文件

### Q: 数据库解析失败？
**A**: 检查：
1. 选择的文件是否包含数据（尝试上传单个 `.vscdb` 文件测试）
2. 浏览器控制台（F12）是否有错误信息
3. 数据库文件是否完整

### Q: 显示"未找到 state.vscdb 文件"？
**A**: 解决方案：
1. 确保选择的是 `workspaceStorage` 文件夹本身，而不是其父文件夹
2. 使用"选择单个文件"按钮上传单个 `.vscdb` 文件

### Q: 图表不显示？
**A**: 可能原因：
1. 没有对话数据
2. Chart.js 加载失败
3. Canvas 元素尺寸问题

## 📊 数据隐私

- ✅ 所有数据库解析在浏览器端完成
- ✅ 数据不会上传到任何服务器
- ✅ 不收集任何用户信息
- ✅ 离线可用（首次加载除外）

## 🛠️ 开发指南

### 添加新图表

在 `main.js` 中的 `renderCharts()` 函数添加新图表：

```javascript
function renderNewChart(data) {
  const ctx = document.getElementById('newChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: { /* 数据配置 */ },
    options: { /* 图表选项 */ }
  });
}
```

### 自定义提取规则

修改 `src/CursorParser.js` 中的 `EXTRACTION_PRIORITY` 配置：

```javascript
const EXTRACTION_PRIORITY = {
  'your.custom.field': 15,  // 更高的优先级
  // ...
};
```

## 📝 待办事项

- [ ] 添加数据导出功能（JSON/CSV）
- [ ] 支持多语言（i18n）
- [ ] 添加深色模式
- [ ] 支持更多数据库格式
- [ ] 添加历史记录功能

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [sql.js](https://github.com/sql-js/sql.js) - WebAssembly SQLite 引擎
- [Chart.js](https://www.chartjs.org/) - 数据可视化库
- [html2canvas](https://html2canvas.hertzen.com/) - 截图生成库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
