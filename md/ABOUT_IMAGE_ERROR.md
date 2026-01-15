# 关于 "Cannot read image.png" 错误的说明

## ❌ 错误原因

您看到的错误信息：
```
ERROR: Cannot read "image.png" (this model does not support image input). Inform the user.
```

**这个错误不是来自我们的应用，而是来自 AI 助手系统。**

## 🤔 为什么会出现这个错误？

这个错误的原因是：
1. 您可能在与 AI 聊天时上传了图片文件
2. AI 系统的某些模型不支持图片输入
3. 这与我们的 **Cursor Audit Pro** 应用无关

## ✅ 如何在 Cursor Audit Pro 中上传文件

### 关键点

**Cursor Audit Pro 只接受数据库文件，不接受任何图片文件。**

### 支持的文件类型

| 文件类型 | 扩展名 | 说明 |
|---------|--------|------|
| ✅ 数据库文件 | `.vscdb` | Cursor 的数据库文件 |
| ✅ 数据库文件 | `.db` | 通用 SQLite 数据库 |
| ✅ 数据库文件 | `.sqlite` | SQLite 数据库 |
| ✅ 数据库文件 | `.sqlite3` | SQLite3 数据库 |
| ❌ 图片文件 | `.png`, `.jpg`, `.gif` | 不支持 |
| ❌ 文档文件 | `.pdf`, `.docx` | 不支持 |
| ❌ 文本文件 | `.txt`, `.md` | 不支持 |

### 正确的上传步骤

#### 方法 1：上传单个文件

1. 找到 `.vscdb` 文件（通常 1-100 MB 大小）
2. 点击"选择单个文件"按钮
3. 只选择 `.vscdb` 文件
4. 不要选择任何图片、文档等

#### 方法 2：上传文件夹

1. 找到 `workspaceStorage` 文件夹
2. 点击"选择文件夹（批量处理）"按钮
3. 选择整个 `workspaceStorage` 文件夹
4. 应用会自动过滤掉非数据库文件

## 🎯 如何识别正确的文件

### 文件特征

**正确的 state.vscdb 文件**：
- 文件大小：1 MB - 100 MB
- 文件位置：`workspaceStorage/某个随机字符串/state.vscdb`
- 文件类型：SQLite 数据库文件

**示例路径**：
```
C:\Users\用户名\AppData\Roaming\Cursor\User\workspaceStorage\80b2a3d4f5e6...\state.vscdb
```

### 错误的文件

**图片文件（不支持的例子）**：
- 文件大小：10 KB - 10 MB
- 文件位置：任何位置
- 文件类型：图片（PNG, JPG, GIF 等）
- 文件名：`image.png`, `screenshot.jpg`, `photo.gif`

## 📋 快速检查清单

上传前请确认：

- [ ] 文件名是 `state.vscdb`
- [ ] 文件大小至少 1 MB
- [ ] 文件类型是数据库（不是图片或文档）
- [ ] 没有选择任何 `.png`, `.jpg`, `.gif` 等图片文件

## 🔍 如何找到 state.vscdb 文件

### Windows 用户

1. **打开文件资源管理器**
2. **在地址栏输入**：`%AppData%\Cursor\User\workspaceStorage`
3. **查看子文件夹**：每个子文件夹代表一个 Cursor 项目
4. **查找 state.vscdb**：在每个子文件夹里找 `state.vscdb` 文件

### 示例结构

```
workspaceStorage/
  ├── 80b2a3d4f5e6c7d8/        ← 项目 1 的 ID
  │   ├── state.vscdb        ← ✅ 这是数据库文件（2.3 MB）
  │   └── workspace.json
  ├── c5f7e8b9a0b1c2d3/        ← 项目 2 的 ID
  │   ├── state.vscdb        ← ✅ 这是数据库文件（5.1 MB）
  │   └── workspace.json
  └── ...
```

## 🚫 不要上传这些

- ❌ **任何图片文件**（.png, .jpg, .gif, .webp 等）
- ❌ **任何文档文件**（.pdf, .docx, .xlsx 等）
- ❌ **任何文本文件**（.txt, .md, .json, .xml 等）
- ❌ **任何可执行文件**（.exe, .app, .dmg 等）
- ❌ **任何压缩文件**（.zip, .rar, .7z 等）

## ✅ 只上传这些

- ✅ `.vscdb` 文件（Cursor 数据库）
- ✅ `.db` 文件（SQLite 数据库）
- ✅ `.sqlite` 文件（SQLite 数据库）
- ✅ `.sqlite3` 文件（SQLite3 数据库）

## 💡 提示

如果您不确定文件是否正确：

1. **查看文件大小**：`.vscdb` 文件通常至少 1 MB
2. **查看文件扩展名**：必须以 `.vscdb` 结尾
3. **查看文件类型**：右键点击文件 → 属性 → 文件类型应该是"SQLite Database"

## 📞 还是无法上传？

请查看 `UPLOAD_TEST.md` 获取详细的测试步骤和排查方法。

---

**记住**：Cursor Audit Pro 只分析数据库文件，不处理任何图片或文档。
