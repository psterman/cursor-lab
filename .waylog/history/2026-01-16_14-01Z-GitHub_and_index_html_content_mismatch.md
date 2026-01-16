# GitHub and index.html content mismatch
_Exported on 01/16/2026 at 22:05:38 GMT+8 from Cursor via WayLog_


**User**

我的github加载的inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-white mb-4 mx-auto是dashboard.clinicalAnalysis，但是我的index.html加载的是Vibe Coding Behavioral Clinical Laboratory v1.0，为什么会错位，是读取了src/index.html吗？

---


**Cursor**

检查相关文件，定位 GitHub Pages 与本地 index.html 不一致的原因。



检查 index.html 的开头部分，确认标题和配置：



检查 i18n.js 的加载方式和路径配置：



检查构建输出和 i18n 模块的加载路径：



问题原因：`dist` 目录中没有 `src/i18n.js`，导致 GitHub Pages 无法加载 i18n 模块，回退到返回 key（`dashboard.clinicalAnalysis`）。本地开发正常是因为有源文件。

检查 Vite 配置，确保 `src/i18n.js` 被复制到 `dist`：



修复：Vite 构建未将 `src/i18n.js` 复制到 `dist`，导致 GitHub Pages 无法加载。更新 Vite 配置，在构建时复制该文件：

---
