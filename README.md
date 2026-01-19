# Cursor 对话历史分析工具

一个基于 WebAssembly 的 Cursor 对话历史分析工具，通过 Vibe 算法对用户的编程对话风格进行深度分析，生成个性化的十二重人格画像。

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

## 🧪 测试方法

### 环境要求

- Node.js >= 16.0.0
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 `http://localhost:3000` 查看应用

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录

### 预览生产版本

```bash
npm run preview
```

### 测试步骤

1. **准备测试数据**
   - 从 Cursor 导出对话历史 JSON 文件
   - 确保 JSON 格式正确，包含 `messages` 数组

2. **上传并分析**
   - 打开应用首页
   - 点击"上传对话历史"按钮
   - 选择 JSON 文件
   - 等待分析完成

3. **查看结果**
   - 查看五维度雷达图
   - 查看人格画像描述
   - 查看统计数据
   - 查看排名信息

4. **导出结果**
   - 点击"导出图片"按钮
   - 保存分析结果为 PNG 图片

### 测试数据格式

```json
{
  "messages": [
    {
      "role": "USER",
      "content": "如何实现一个快速排序算法？"
    },
    {
      "role": "ASSISTANT",
      "content": "以下是快速排序的 Python 实现..."
    }
  ]
}
```

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

- **前端框架**: 原生 JavaScript (ES6+)
- **构建工具**: Vite
- **数据库**: SQLite (WebAssembly)
- **图表库**: Chart.js
- **样式**: CSS3

### 灵感来源

本项目受到以下项目的启发：
- Cursor 编辑器的对话历史功能
- 各种编程风格分析工具
- 人格测试和画像生成算法

## 📧 联系方式

如有问题、建议或反馈，欢迎通过以下方式联系：

- **GitHub Issues**: [提交 Issue](https://github.com/your-username/cursor-lab/issues)
- **Email**: your-email@example.com

---

**注意**: 本项目仅用于学习和研究目的，分析结果仅供参考，不构成任何专业建议。
