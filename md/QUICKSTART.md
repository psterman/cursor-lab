# 快速开始指南

## 🎯 三步启动

### Windows 用户

1. **双击运行** `start.bat`
2. 等待浏览器自动打开
3. 上传 Cursor 数据库文件夹

### macOS/Linux 用户

1. **运行命令** `bash start.sh` 或 `./start.sh`
2. 等待浏览器自动打开
3. 上传 Cursor 数据库文件夹

## 📂 上传数据库

### ⚠️ 重要提示

**只能上传数据库文件（.vscdb），不支持图片、文档等其他文件。**

### 🎯 两种上传方式

#### 方式一：上传整个文件夹（推荐）
1. 点击"选择文件夹（批量处理）"按钮
2. 选择 workspaceStorage 目录

**Windows 路径**：
```
C:\Users\[你的用户名]\AppData\Roaming\Cursor\User\workspaceStorage
```

#### 方式二：上传单个文件
1. 点击"选择单个文件"按钮
2. 选择 `.vscdb` 文件
3. 不要选择图片、文档等文件

### 📂 如何找到 state.vscdb 文件（Windows）
1. 按 `Win + R` 打开运行对话框
2. 输入 `%AppData%` 并回车
3. 找到 `Cursor` 文件夹
4. 进入 `User\workspaceStorage` 目录
5. 每个子文件夹（随机字符串）里都有一个 `state.vscdb` 文件

### ✅ 正确的文件示例

```
✅ state.vscdb (2.3 MB)        ← 这是正确的数据库文件
✅ my_project.db (1.5 MB)      ← 这是正确的数据库文件
❌ image.png (500 KB)           ← ❌ 图片文件，不支持
❌ readme.txt (2 KB)            ← ❌ 文本文件，不支持
```

## 🖼️ 导出报告

1. 点击右上角的"保存分析报告"按钮
2. 等待几秒钟
3. 图片将自动下载

## 🚀 部署到 GitHub Pages

### 方法 1：使用 GitHub CLI（推荐）

```bash
# 安装 gh CLI（如果还没有）
# https://cli.github.com/

# 1. 创建 GitHub 仓库
gh repo create cursor-audit-wasm --public

# 2. 构建项目
npm run build

# 3. 部署
gh pages deploy dist
```

### 方法 2：手动部署

```bash
# 1. 初始化 Git
git init
git add .
git commit -m "Initial commit"

# 2. 创建 GitHub 仓库后，关联远程仓库
git remote add origin https://github.com/[你的用户名]/[仓库名].git

# 3. 推送代码
git push -u origin main

# 4. 在 GitHub 网站上启用 Pages
# - Settings > Pages
# - Source: dist directory
# - Branch: main
# - Save
```

## ❓ 常见问题

### Q: 点击"选择文件夹"没有反应？
**A**: 解决方案：
1. 使用 Chrome 或 Edge 浏览器
2. 检查地址栏是否显示文件访问权限提示，需要允许访问
3. 尝试点击"选择单个文件"按钮

### Q: 上传后没有反应？
**A**: 检查：
1. 浏览器控制台（F12）查看错误信息
2. 确保选择了正确的文件或文件夹
3. 尝试刷新页面重新上传

### Q: 找不到 state.vscdb 文件？
**A**: 解决方案：
1. 确保选择的是 `workspaceStorage` 文件夹本身
2. 使用"选择单个文件"按钮直接上传 `.vscdb` 文件
3. 在资源管理器中搜索 `state.vscdb` 确认文件位置

### Q: 显示"未找到任何对话数据"？
**A**: 可能原因：
1. 数据库文件为空或损坏
2. 该工作区还没有对话记录
3. 尝试上传其他 `state.vscdb` 文件

### Q: 导出图片太慢？
**A**: 第一次生成需要较长时间，后续会快很多

### Q: 在手机上无法使用？
**A**: 手机浏览器暂不支持文件夹上传功能，但可以尝试单文件上传（需要先在电脑上提取文件）

## 📞 获取帮助

- 查看 README.md 获取完整文档
- 提交 Issue 报告问题
