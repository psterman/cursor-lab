import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// 自定义插件：复制 i18n.js 到 dist 目录
const copyI18nPlugin = () => {
  return {
    name: 'copy-i18n',
    closeBundle() {
      // 构建完成后复制 i18n.js
      const srcPath = join(process.cwd(), 'src', 'i18n.js');
      const distSrcDir = join(process.cwd(), 'dist', 'src');
      const distPath = join(distSrcDir, 'i18n.js');
      
      try {
        // 确保 dist/src 目录存在
        mkdirSync(distSrcDir, { recursive: true });
        // 复制文件
        copyFileSync(srcPath, distPath);
        console.log('[Vite] ✅ 已复制 src/i18n.js 到 dist/src/i18n.js');
      } catch (error) {
        console.error('[Vite] ❌ 复制 i18n.js 失败:', error);
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
