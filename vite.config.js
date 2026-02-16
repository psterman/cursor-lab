import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// 自定义插件：复制 i18n.js、身份级别词库 JSON 和 assets/js 到 dist 目录
const copyI18nPlugin = () => {
  return {
    name: 'copy-i18n',
    closeBundle() {
      try {
        const distSrcDir = join(process.cwd(), 'dist', 'src');
        mkdirSync(distSrcDir, { recursive: true });
        copyFileSync(join(process.cwd(), 'src', 'i18n.js'), join(distSrcDir, 'i18n.js'));
        console.log('[Vite] ✅ 已复制 src/i18n.js 到 dist/src/i18n.js');
      } catch (error) {
        console.error('[Vite] ❌ 复制 i18n.js 失败:', error);
      }
      for (const name of ['Novice.json', 'Professional.json', 'Architect.json']) {
        try {
          const src = join(process.cwd(), name);
          const dest = join(process.cwd(), 'dist', name);
          if (existsSync(src)) {
            copyFileSync(src, dest);
            console.log(`[Vite] ✅ 已复制 ${name} 到 dist/`);
          }
        } catch (e) { /* ignore */ }
      }
      // 复制 assets/js 到 dist/assets/js（stats2.html 依赖的脚本）
      try {
        const srcJsDir = join(process.cwd(), 'assets', 'js');
        const distJsDir = join(process.cwd(), 'dist', 'assets', 'js');
        if (existsSync(srcJsDir)) {
          mkdirSync(distJsDir, { recursive: true });
          const files = readdirSync(srcJsDir);
          for (const file of files) {
            const srcFile = join(srcJsDir, file);
            if (statSync(srcFile).isFile()) {
              copyFileSync(srcFile, join(distJsDir, file));
            }
          }
          console.log(`[Vite] ✅ 已复制 assets/js/ 到 dist/assets/js/ (${files.length} 个文件)`);
        }
      } catch (e) {
        console.error('[Vite] ⚠️ 复制 assets/js 失败:', e);
      }
      // 复制 assets/css 到 dist/assets/css（stats2.html 依赖的样式）
      try {
        const srcCssDir = join(process.cwd(), 'assets', 'css');
        const distCssDir = join(process.cwd(), 'dist', 'assets', 'css');
        if (existsSync(srcCssDir)) {
          mkdirSync(distCssDir, { recursive: true });
          const files = readdirSync(srcCssDir);
          for (const file of files) {
            const srcFile = join(srcCssDir, file);
            if (statSync(srcFile).isFile()) {
              copyFileSync(srcFile, join(distCssDir, file));
            }
          }
          console.log(`[Vite] ✅ 已复制 assets/css/ 到 dist/assets/css/ (${files.length} 个文件)`);
        }
      } catch (e) {
        console.error('[Vite] ⚠️ 复制 assets/css 失败:', e);
      }
    }
  };
};

export default defineConfig({
  // 部署配置（GitHub Pages）
  // 根据实际部署的仓库名设置 base 路径
  // 开发模式使用 '/'，生产模式使用仓库名
  // 实际仓库：https://psterman.github.io/cursor-lab/
  base: process.env.NODE_ENV === 'production' ? '/cursor-lab/' : '/',
  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
  },

  // 插件配置
  plugins: [copyI18nPlugin()],

  // 构建配置
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      // 保留入口签名，确保导出被保留（必须在 rollupOptions 顶层）
      preserveEntrySignatures: 'exports-only',
      input: {
        main: './index.html',
        analysis: './main.js', // 将 main.js 作为独立入口点
        stats2: './stats2.html',
      },
      output: {
        format: 'es', // ES 模块格式
        entryFileNames: (chunkInfo) => {
          // main.js 保持原文件名，其他文件使用默认命名
          return chunkInfo.name === 'analysis' ? 'main.js' : 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        exports: 'named', // 使用命名导出，确保所有 export 被保留
        manualChunks: (id) => {
          // 将第三方库分离到单独的 chunk
          // 注意：Chart.js 和 html2canvas 通过 CDN 加载，不在此处处理
          if (id.includes('node_modules')) {
            if (id.includes('sql.js')) return 'sql.js';
            return 'vendor';
          }
        },
      },
    },
  },

  // 部署配置（GitHub Pages）
  // 如果部署在仓库根目录，使用仓库名称作为 base
  // 如果部署在用户页面（username.github.io），使用 '/'
  // 可以通过环境变量 VITE_BASE_PATH 覆盖
  // 默认使用 '/' 以支持自动检测，实际路径在运行时通过 index.html 中的逻辑检测
  // base: process.env.VITE_BASE_PATH || '/',

  // 优化配置
  // 注意：Chart.js 和 html2canvas 通过 CDN 加载，不在依赖中
  optimizeDeps: {
    include: ['sql.js'],
  },
});
