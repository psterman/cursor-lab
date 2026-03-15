import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

/** 获取 OpenClaw 对话 Token：先读本地文件，否则执行 openclaw dashboard --no-open 解析输出 */
async function getDialogueToken(origin) {
  const tokenFromFile = () => {
    const envFile = process.env.OPENCLAW_TOKEN_FILE;
    if (envFile) {
      try {
        if (existsSync(envFile)) return readFileSync(envFile, 'utf-8').trim();
      } catch (e) { /* ignore */ }
    }
    const homedir = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
    const candidates = [
      join(homedir, '.openclaw', 'gateway-token'),
      join(homedir, '.openclaw', 'token'),
      join(process.cwd(), '.openclaw', 'gateway-token'),
      join(process.cwd(), '.openclaw', 'token'),
    ];
    for (const p of candidates) {
      try {
        if (existsSync(p)) return readFileSync(p, 'utf-8').trim();
      } catch (e) { /* ignore */ }
    }
    return null;
  };

  let token = tokenFromFile();
  if (token) {
    const base = origin || 'http://localhost:3000';
    const dialogueUrl = `${base.replace(/\/$/, '')}/openclaw2.html#token=${encodeURIComponent(token)}`;
    return { ok: true, token, dialogueUrl, source: 'file' };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { child.kill(); } catch (e) { /* ignore */ }
      resolve({
        ok: false,
        error: '未从本地文件读取到 Token，且 openclaw dashboard --no-open 在 8 秒内未输出带 token 的 URL。请先运行 openclaw dashboard --no-open 并将终端中的 #token=xxx 保存到 .openclaw/gateway-token 或设置 OPENCLAW_TOKEN_FILE。',
      });
    }, 8000);
    let resolved = false;
    const onDone = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try { child.kill(); } catch (e) { /* ignore */ }
      resolve(result);
    };
    let child;
    try {
      child = spawn('openclaw', ['dashboard', '--no-open'], {
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      onDone({ ok: false, error: '无法执行 openclaw 命令: ' + (e && e.message) });
      return;
    }
    const tokenRe = /(?:#|\?)token=([^&\s]+)/;
    const onData = (chunk) => {
      if (resolved) return;
      const line = (chunk && chunk.toString()) || '';
      const m = line.match(tokenRe);
      if (m && m[1]) {
        token = decodeURIComponent(m[1].trim());
        const base = origin || 'http://localhost:3000';
        const dialogueUrl = `${base.replace(/\/$/, '')}/openclaw2.html#token=${encodeURIComponent(token)}`;
        onDone({ ok: true, token, dialogueUrl, source: 'dashboard' });
      }
    };
    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', onData);
    child.on('error', (e) => onDone({ ok: false, error: 'openclaw 执行错误: ' + (e && e.message) }));
    child.on('exit', (code, signal) => {
      if (!resolved) onDone({ ok: false, error: `openclaw 退出 code=${code} signal=${signal}，未从输出中解析到 token` });
    });
  });
}

const dialogueTokenPlugin = () => {
  return {
    name: 'dialogue-token-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/dialogue-token' && !req.url.startsWith('/api/dialogue-token?')) {
          next();
          return;
        }
        const origin = req.headers.origin || (req.headers.referer && new URL(req.headers.referer).origin) || `http://localhost:${server.config.server.port || 3000}`;
        getDialogueToken(origin)
          .then((body) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(body));
          })
          .catch((e) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
          });
      });
    },
  };
};

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

      // 修正 dist/stats2.html 中的 CSS 引用路径
      // Vite 会把 assets/css/stats2.css 打包成 ./assets/stats2-[hash].css（丢失部分样式）
      // 需要改回引用完整复制的 assets/css/stats2.css
      try {
        const stats2HtmlPath = join(process.cwd(), 'dist', 'stats2.html');
        if (existsSync(stats2HtmlPath)) {
          let html = readFileSync(stats2HtmlPath, 'utf-8');
          // 匹配 Vite 生成的带 hash 的 CSS 引用，替换为复制的完整 CSS
          // 注意：不使用 test() + replace() 组合（test 会移动 lastIndex 导致 replace 失效）
          const cssPattern = /href=["']\.\/assets\/stats2-[A-Za-z0-9_-]+\.css["']/g;
          const newHtml = html.replace(cssPattern, 'href="assets/css/stats2.css"');
          if (newHtml !== html) {
            writeFileSync(stats2HtmlPath, newHtml, 'utf-8');
            console.log('[Vite] ✅ 已修正 stats2.html 的 CSS 引用路径');
          }
        }
      } catch (e) {
        console.error('[Vite] ⚠️ 修正 CSS 路径失败:', e);
      }
    }
  };
};

export default defineConfig({
  // 部署配置（GitHub Pages）：使用相对路径 base，任意仓库名/子路径下都能正常加载资源
  // 开发用 '/'，生产用 './' 避免 /cursor-lab/ 等绝对路径在非该仓库下 404
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
    // 代理 OpenClaw 本地 API 和 WebSocket，避免 CORS
    // openclaw2.html 通过 http://localhost:3000/openclaw2.html 访问时走此代理
    proxy: {
      '/api/openclaw': {
        target: 'http://127.0.0.1:18789',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openclaw/, ''),
      },
      // WebSocket 代理：前端连 ws://localhost:3000/ws 自动转发到 openclaw
      '/ws': {
        target: 'ws://127.0.0.1:18789',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },

  // 插件配置
  plugins: [dialogueTokenPlugin(), copyI18nPlugin()],

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
