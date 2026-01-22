# Cursor 病历分析报告说明

<div align="center">

专注于您的 Cursor 聊天记录分析，对编程对话进行病毒式分析，生成243重人格病历。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite)](https://vitejs.dev/)

[English](./README_EN.md) | 简体中文

</div>
<img width="921" height="852" alt="image" src="https://github.com/user-attachments/assets/40d8b11c-8b36-47af-a8df-4dae54a4b6a3" />

## ✨ 
功能特性

### 核心功能

1. **对话历史分析**
   - 支持上传 Cursor 对话历史 JSON 文件夹
   - 使用 WebAssembly (sql.js) 进行本地数据库分析
   - 完全本地处理，保护用户隐私

2. **算法人格画像**
   - 基于语义指纹识别规则,无理论支撑
   - 通过 Web Worker 匹配,确实ai推荐的
   - 无 Token 消耗的，但是病态分析
   - 生成243重人格画像，几乎不健全

3. **五维度分析**
   - **L (Logic)**: 🧠 脑回路硬核度 - 通过代码块比例衡量
   - **P (Patience)**: 🧘 赛博菩萨指数 - 通过否定词频次衡量
   - **D (Detail)**: 🔍 细节狂魔等级 - 通过句子平均长度和修饰词衡量
   - **E (Explore)**: 🚀 技术天赋力 - 通过技术名词去重统计衡量
   - **F (Feedback)**: 🤝 职场鉴茶榜 - 通过礼貌用语密度衡量

4. **排名统计**
   - 全网横向排名对比
   - 多维度排名指标
   - 实时排名更新

5. **答案之书**
   - 匹配语义提示生成器（243种）
   - 支持中英文双语

6. **数据可视化**
   - 生成病历雷达图
   - 支持分享链接
   - 支持分享病历图
   - 支持移动端查看病历（不支持体检）

### 测试方法

1. **准备数据**
   - 打开 https://psterman.github.io/cursor-lab/
   - 知悉 Cursor 默认记录文件夹位置：
   - %APPDATA%\Cursor\User\workspaceStorage\ （windows）
   - ~/Library/Application Support/Cursor/User/workspaceStorage/（Mac）
     mac复制以上路径后，打开访达-前往-前往文件夹-粘贴路径-将workspaceStorage文件夹拖到左侧的收藏位置后，再点击上传按钮，选择workspacestorage文件夹（抱歉病友）
     <img width="409" height="309" alt="截屏2026-01-21 23 31 20" src="https://github.com/user-attachments/assets/97fdf7df-f557-4686-9f42-088900afd6aa" />

2. **上传并分析**   
   - 点击"上传"按钮
   - 选择 workspacestorage 文件夹
   - 等待分析完成
   - 一旦上传过一次，就有"复诊"按钮,可跳过繁琐步骤

3. **查看结果**
   - **五维度雷达图**: 可视化展示 LPDEF 五个维度的得分
   - **人格画像**: 根据分析结果生成个性化的人格描述
   - **统计数据**: 查看消息数、字符数、使用天数等详细统计
   - **排名信息**: 查看在全网用户中的排名情况，仅供娱乐

## 🎯 解决痛点

### 1. 隐私保护
- **问题**: 传统分析工具需要上传数据到服务器，存在隐私泄露风险
- **解决**: 本地处理，对话数据在浏览器中分析，不上传到服务器

### 2. 成本控制
- **问题**: 使用 AI 进行文本分析会产生高昂的 Token 消耗
- **解决**: 基于规则匹配的 Vibe 算法，几乎零成本分析

### 3. 性能优化
- **问题**: 大量对话历史的分析会阻塞主线程
- **解决**: 使用 Web Worker 进行异步分析，保证 UI 流畅性

### 4. 自黑分析
- **问题**: 简单的关键词统计无法反映个性的编程风格
- **解决**: 基于语义指纹的多维度分析，生成个性化的黑暗人格画像

### 5. 数据管理
- **问题**: 大量对话历史难以管理和查询
- **解决**: 使用 SQLite 数据库进行高效查询和搜索

## ❓ 常见问题

### Q: 分析需要多长时间？

A: 分析时间取决于病历史的长度。通常：
- 100 条消息：< 1 秒
- 1000 条消息：1-3 秒
- 10000 条消息：5-10 秒

### Q: 支持哪些浏览器？

A: 推荐浏览器：
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Q: 数据会偷偷上传到服务器吗？

A: **不会**。所有分析都在浏览器本地完成，数据不会离开您的病床。只有使用排名统计功能时，才会将匿名统计数据上传到服务器。源代码可鉴。

### Q: 如何获取下载 Cursor 对话聊天历史？

A: 下载友情链接的 抠搜/Curser ，支持txt/md/json/csv格式。

### Q: 排名统计功能如何使用？

A: 找到你的cursor历史聊天记录文件夹，上传后查看。

### Q: 分析结果准确吗？

A: 分析结果基于用户提示词分析，完全不构成任何病理学建议。

#### 开发环境（ai写的，我完全看不懂）
- **Node.js**: >= 16.0.0
- **npm**: >= 7.0.0 或 **yarn**: >= 1.22.0

#### 运行环境（浏览器）
- **Chrome/Edge**: >= 90
- **Firefox**: >= 88
- **Safari**: >= 14
- **Opera**: >= 76

**必需特性**:
- WebAssembly 支持
- Web Workers 支持
- ES6+ 语法支持
- File API 支持
- Fetch API 支持

### 安装依赖

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install
```

### 开发模式

```bash
# 使用 npm
npm run dev

# 或使用 yarn
yarn dev

# Windows 用户也可以直接运行
start.bat

# macOS/Linux 用户也可以直接运行
./start.sh
```

开发服务器将在 `http://localhost:3000` 启动，并自动在浏览器中打开。

### 构建生产版本

```bash
npm run build
# 或
yarn build
```

构建产物将输出到 `dist/` 目录，可以直接部署到静态托管服务。

### 开发说明（ai写的，我看不懂）

#### 1. 本地分析（前端）

所有对话历史的分析都在浏览器本地完成，使用 WebAssembly 版本的 SQLite 进行数据处理，确保数据隐私安全。

#### 2. 排名统计（可选，需要后端）

如果需要使用排名统计功能，需要配置 Cloudflare Workers 后端：

1. **部署 Cloudflare Worker**
   ```bash
   # 安装 Wrangler CLI
   npm install -g wrangler
   
   # 登录 Cloudflare
   wrangler login
   
   # 部署 Worker
   wrangler deploy
   ```

2. **配置环境变量**
   - 在 Cloudflare Dashboard 中设置 `SUPABASE_URL` 和 `SUPABASE_KEY`
   - 创建 D1 数据库 `prompts_library`（用于答案之书功能）

3. **配置 Supabase**
   - 创建 `cursor_stats` 表用于存储统计数据
   - 配置 RLS（行级安全）策略（可选）

#### 3. 答案之书（可选，需要后端）

答案之书功能需要 Cloudflare D1 数据库支持，用于存储随机提示语。

## 🔧 部署指南

### 前端部署

#### GitHub Pages

1. 构建项目：
   ```bash
   npm run build
   ```

2. 配置 `vite.config.js` 中的 `base` 路径：
   ```javascript
   base: '/your-repo-name/'
   ```

3. 将 `dist/` 目录内容推送到 `gh-pages` 分支

#### Vercel / Netlify

1. 连接 GitHub 仓库
2. 构建命令：`npm run build`
3. 输出目录：`dist`
4. 自动部署完成

#### Cloudflare Pages

1. 连接 GitHub 仓库
2. 构建命令：`npm run build`
3. 输出目录：`dist`
4. 环境变量：无需配置（前端完全本地运行）

### 后端部署（可选）

如果需要排名统计和答案之书功能，需要部署 Cloudflare Worker：

```bash
# 安装依赖
npm install

# 配置 wrangler.toml
# 设置 D1 数据库 ID 和 Supabase 环境变量

# 部署
wrangler deploy
```

详细配置请参考 `wrangler.toml` 文件中的注释。

## 🏗️ 技术架构

### 前端架构

```
┌─────────────────────────────────────────┐
│          用户界面 (index.html)           │
│  ┌───────────────────────────────────┐ │
│  │     主逻辑 (main.js)               │ │
│  │  - 文件上传处理                    │ │
│  │  - UI 更新                         │ │
│  │  - 结果展示                        │ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Web Worker (vibeAnalyzerWorker) │ │
│  │  - 异步分析处理                   │ │
│  │  - 不阻塞主线程                   │ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Vibe 算法分析器                  │ │
│  │  - 语义指纹提取                   │ │
│  │  - 五维度计算                     │ │
│  │  - 人格画像生成                   │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │  SQLite (WebAssembly)            │ │
│  │  - 本地数据库查询                 │ │
│  │  - 数据统计分析                   │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 后端架构（可选）

```
┌─────────────────────────────────────────┐
│      Cloudflare Workers                  │
│  ┌───────────────────────────────────┐ │
│  │  API 路由处理                      │ │
│  │  - /api/random_prompt (答案之书)   │ │
│  │  - /api/stats (排名统计)          │ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Cloudflare D1                   │ │
│  │  - prompts_library (答案之书)    │ │
│  └───────────────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Supabase                         │ │
│  │  - cursor_stats (用户统计)       │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 🔬 算法说明

### 排名算法（还没找到完美自洽的算法，请不要当农药匹配）

排名算法基于多个指标进行排序：

- `qingCount`: 请求次数
- `buCount`: 否定词次数
- `userMessages`: 用户消息数
- `totalUserChars`: 用户总字符数
- `avgUserMessageLength`: 平均消息长度
- `usageDays`: 使用天数

排名计算逻辑：
1. 按指标值降序排序
2. 找到用户在当前指标中的位置
3. 处理相同值的排名（相同值取最高排名）
4. 返回排名和个性指数

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题

在 [GitHub Issues](https://github.com/your-username/cursor-lab/issues) 中报告问题时，请包含：
- 问题描述
- 复现步骤
- 预期行为
- 实际行为
- 浏览器和操作系统信息
- 截图最好，谢谢

## 📄 MIT 许可证

本项目采用 MIT 许可证。

```
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🙏 致谢

### 开源项目

- [sql.js](https://github.com/sql-js/sql.js) - SQLite 的 WebAssembly 版本
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [Chart.js](https://www.chartjs.org/) - 强大的图表库
- [html2canvas](https://html2canvas.hertzen.com/) - HTML 转 Canvas 工具

### 技术栈

#### 前端
- **框架**: 原生 JavaScript (ES6+)
- **构建工具**: Vite 5.0
- **数据库**: SQLite (WebAssembly via sql.js)
- **图表库**: Chart.js 4.5+
- **图片导出**: html2canvas
- **样式**: CSS3

#### 后端（可选）
- **运行时**: Cloudflare Workers
- **数据库**: 
  - Cloudflare D1 (答案之书)
  - Supabase (排名统计)
- **配置**: Wrangler

#### 核心算法
- **Vibe 算法**: 基于语义指纹的多维度分析（AI自诩）
- **Web Workers**: 异步计算，不阻塞主线程（AI自夸）
- **正则表达式**: 高效的语义模式匹配（AI自嗨）

### 灵感来源

本项目受到以下项目的启发：
- Cursor 编辑器的对话简陋的历史功能
- 各种编程风格分析工具
- 星座生肖MBTI人格测试和大数据画像生成算法

## 📧 联系方式

如有问题、建议或反馈，欢迎通过以下方式联系：

- **GitHub Issues**: [提交 Issue](https://github.com/your-username/cursor-lab/issues)
- **讨论区**: [GitHub Discussions](https://github.com/your-username/cursor-lab/discussions)


## ⚠️ 免责声明

本项目分析结果仅供参考和娱乐，不构成任何医学建议。引发生气黑化吐槽，建议尽快撸猫治愈，使用本工具产生的任何后果由使用者自行承担。

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star！**

Made with ❤️ by the community

</div>

[![Star History Chart](https://api.star-history.com/svg?repos=psterman/cursor-lab&type=timeline&legend=bottom-right)](https://www.star-history.com/#psterman/cursor-lab&type=timeline&legend=bottom-right)
