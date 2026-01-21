# Cursor 对话历史分析工具

<div align="center">

一个基于 WebAssembly 的 Cursor 对话历史分析工具，通过 Vibe 算法对用户的编程对话风格进行深度分析，生成个性化的十二重人格画像。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite)](https://vitejs.dev/)

[English](./README_EN.md) | 简体中文

</div>

## ✨ 功能特性

### 核心功能

1. **对话历史分析**
   - 支持上传 Cursor 对话历史 JSON 文件
   - 使用 WebAssembly (sql.js) 进行本地数据库分析
   - 完全本地处理，保护用户隐私

2. **Vibe 算法人格画像**
   - 基于语义指纹识别规则
   - 通过 Web Worker 高性能匹配
   - 无 Token 消耗的深度分析
   - 生成十二重人格画像

3. **五维度分析**
   - **L (Logic)**: 🧠 脑回路硬核度 - 通过代码块比例衡量
   - **P (Patience)**: 🧘 赛博菩萨指数 - 通过否定词频次衡量
   - **D (Detail)**: 🔍 细节狂魔等级 - 通过句子平均长度和修饰词衡量
   - **E (Explore)**: 🚀 技术天赋力 - 通过技术名词去重统计衡量
   - **F (Feedback)**: 🤝 职场鉴茶榜 - 通过礼貌用语密度衡量

4. **排名统计**
   - 全网横向排名对比
   - 多维度排名指标（消息数、字符数、平均长度、使用天数等）
   - 实时排名更新

5. **答案之书**
   - 随机提示生成器
   - 支持中英文双语
   - 基于 D1 数据库存储

6. **数据可视化**
   - 使用 Chart.js 生成雷达图
   - 支持导出分析结果为图片
   - 美观的 UI 界面

## 🎯 解决的痛点

### 1. 隐私保护
- **问题**: 传统分析工具需要上传数据到服务器，存在隐私泄露风险
- **解决**: 完全本地处理，所有数据在浏览器中分析，不上传到服务器

### 2. 成本控制
- **问题**: 使用 AI API 进行文本分析会产生高昂的 Token 消耗
- **解决**: 基于规则匹配的 Vibe 算法，无需调用 AI API，零成本分析

### 3. 性能优化
- **问题**: 大量对话历史的分析会阻塞主线程
- **解决**: 使用 Web Worker 进行异步分析，保证 UI 流畅性

### 4. 深度分析
- **问题**: 简单的关键词统计无法反映真实的编程风格
- **解决**: 基于语义指纹的多维度分析，生成个性化的人格画像

### 5. 数据管理
- **问题**: 大量对话历史难以管理和查询
- **解决**: 使用 SQLite 数据库（WebAssembly 版本）进行高效查询和统计

## 🚀 快速开始

### 环境要求

#### 开发环境
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

### 预览生产版本

```bash
npm run preview
# 或
yarn preview
```

### 项目结构

```
cursor-lab/
├── src/                          # 源代码目录
│   ├── index.js                 # Cloudflare Worker 后端入口
│   ├── CursorParser.js          # 数据库解析器
│   ├── VibeCodingerAnalyzer.js  # Vibe 算法分析器
│   ├── vibeAnalyzerWorker.js    # Web Worker 分析脚本
│   ├── i18n.js                  # 国际化配置
│   └── *.json                   # 数据文件（人格名称、语义库等）
├── dist/                        # 构建输出目录
├── index.html                   # 前端入口页面
├── main.js                      # 前端主逻辑
├── style.css                    # 样式文件
├── vite.config.js               # Vite 配置
├── wrangler.toml                # Cloudflare Workers 配置
├── package.json                 # 项目配置
├── start.bat                    # Windows 启动脚本
├── start.sh                     # macOS/Linux 启动脚本
└── README.md                    # 项目文档
```

## 📖 使用指南

### 基本使用流程

1. **准备数据**
   - 从 Cursor 导出对话历史 JSON 文件
   - 确保 JSON 格式正确，包含 `messages` 数组

2. **上传并分析**
   - 打开应用首页
   - 点击"上传对话历史"按钮
   - 选择 JSON 文件
   - 等待分析完成（分析过程在 Web Worker 中异步执行）

3. **查看结果**
   - **五维度雷达图**: 可视化展示 LPDEF 五个维度的得分
   - **人格画像**: 根据分析结果生成个性化的人格描述
   - **统计数据**: 查看消息数、字符数、使用天数等详细统计
   - **排名信息**: 查看在全网用户中的排名情况（需要后端支持）

4. **导出结果**
   - 点击"导出图片"按钮
   - 保存分析结果为 PNG 图片，方便分享

### 数据格式要求

#### Cursor 对话历史 JSON 格式

```json
{
  "messages": [
    {
      "role": "USER",
      "content": "如何实现一个快速排序算法？"
    },
    {
      "role": "ASSISTANT",
      "content": "以下是快速排序的 Python 实现：\n\n```python\ndef quicksort(arr):\n    ...\n```"
    }
  ]
}
```

**必需字段**:
- `messages`: 消息数组（必需）
- `role`: 消息角色，`"USER"` 或 `"ASSISTANT"`（必需）
- `content`: 消息内容（必需）

### 功能说明

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

### 性能优化

1. **Web Worker 异步处理**
   - 所有计算密集型任务在 Worker 中执行
   - 主线程保持响应，UI 不卡顿

2. **WebAssembly 数据库**
   - 使用 sql.js 进行高效的本地数据库操作
   - 支持复杂 SQL 查询和统计分析

3. **懒加载和代码分割**
   - Chart.js 和 html2canvas 通过 CDN 按需加载
   - 减少初始包体积

4. **内存优化**
   - 及时释放不再使用的对象
   - 避免内存泄漏

## 🔬 算法说明

### Vibe 算法 v2.0

Vibe 算法是一个基于语义指纹识别的多维度分析算法，通过分析用户的编程对话风格，生成个性化的人格画像。

#### 算法流程

1. **数据预处理**
   - 提取用户消息（role === 'USER'）
   - 过滤空消息和无效数据
   - 统计基础指标（消息数、字符数、平均长度等）

2. **语义指纹提取**
   - **代码块识别**: 识别代码块比例（Logic 维度）
   - **否定词统计**: 统计否定词频次（Patience 维度）
   - **句子长度分析**: 计算平均句子长度和修饰词密度（Detail 维度）
   - **技术名词提取**: 识别并去重技术名词（Explore 维度）
   - **礼貌用语检测**: 统计礼貌用语密度（Feedback 维度）

3. **维度得分计算**
   - 使用正则表达式匹配语义模式
   - 应用语义权重矩阵
   - 计算连击加成（连续匹配加分）
   - TF-IDF 降权（高频词降权）
   - 密度窗口置信度系数
   - 排位分梯队归一化

4. **人格画像生成**
   - 根据五维度得分生成 Vibe Index（5位数字索引）
   - 匹配对应的人格类型和名称
   - 生成个性化吐槽文案
   - 生成 LPDEF 编码

#### 技术实现

- **Web Worker**: 异步计算，不阻塞主线程
- **正则表达式**: 高效的模式匹配
- **语义权重矩阵**: 不同技术栈和概念的权重分配
- **归一化算法**: 确保得分在合理范围内（10-95）

#### 维度权重说明

- **Logic (L)**: 代码块比例权重 1.0，代码关键字权重 0.5
- **Patience (P)**: 否定词权重 -1.0（频率越高，耐心越低）
- **Detail (D)**: 句子长度权重 0.3，修饰词权重 0.7
- **Explore (E)**: 技术名词权重 1.0，不同技术栈权重不同
- **Feedback (F)**: 礼貌用语权重 1.0

### 排名算法

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
4. 返回排名和总人数

## ❓ 常见问题

### Q: 分析需要多长时间？

A: 分析时间取决于对话历史的大小。通常：
- 100 条消息：< 1 秒
- 1000 条消息：1-3 秒
- 10000 条消息：5-10 秒

所有分析都在本地进行，不会上传数据到服务器。

### Q: 支持哪些浏览器？

A: 需要支持以下特性的现代浏览器：
- WebAssembly
- Web Workers
- ES6+ 语法
- File API

推荐浏览器：
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Q: 数据会上传到服务器吗？

A: **不会**。所有分析都在浏览器本地完成，数据不会离开您的设备。只有使用排名统计功能时，才会将匿名统计数据上传到服务器。

### Q: 如何获取 Cursor 对话历史？

A: 在 Cursor 编辑器中：
1. 打开设置
2. 找到"导出对话历史"选项
3. 选择导出为 JSON 格式

### Q: 排名统计功能如何使用？

A: 排名统计需要配置后端服务（Cloudflare Workers + Supabase）。如果不需要此功能，可以完全离线使用其他所有功能。

### Q: 分析结果准确吗？

A: 分析结果基于 Vibe 算法的语义指纹识别，提供的是对编程风格的量化评估，仅供参考和娱乐。不构成任何专业建议。

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 贡献方式

1. **Fork 本仓库**
2. **创建功能分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'Add some AmazingFeature'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **开启 Pull Request**

### 开发规范

- 遵循现有代码风格
- 添加必要的注释和文档
- 确保代码通过测试
- 提交信息使用中文或英文，清晰描述变更内容

### 报告问题

在 [GitHub Issues](https://github.com/your-username/cursor-lab/issues) 中报告问题时，请包含：
- 问题描述
- 复现步骤
- 预期行为
- 实际行为
- 浏览器和操作系统信息

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
- **Vibe 算法**: 基于语义指纹的多维度分析
- **Web Workers**: 异步计算，不阻塞主线程
- **正则表达式**: 高效的语义模式匹配

### 灵感来源

本项目受到以下项目的启发：
- Cursor 编辑器的对话历史功能
- 各种编程风格分析工具
- 人格测试和画像生成算法

## 📧 联系方式

如有问题、建议或反馈，欢迎通过以下方式联系：

- **GitHub Issues**: [提交 Issue](https://github.com/your-username/cursor-lab/issues)
- **讨论区**: [GitHub Discussions](https://github.com/your-username/cursor-lab/discussions)

## 📝 更新日志

### v1.0.0 (2024)

- ✨ 初始版本发布
- ✨ 支持 Cursor 对话历史 JSON 文件分析
- ✨ 实现 Vibe 算法 v2.0
- ✨ 五维度分析（LPDEF）
- ✨ 十二重人格画像生成
- ✨ 本地 WebAssembly 数据库分析
- ✨ 数据可视化（雷达图）
- ✨ 图片导出功能
- ✨ 排名统计功能（需要后端）
- ✨ 答案之书功能（需要后端）

## ⚠️ 免责声明

本项目仅用于学习和研究目的，分析结果仅供参考和娱乐，不构成任何专业建议。使用本工具产生的任何后果由使用者自行承担。

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star！**

Made with ❤️ by the community

</div>
