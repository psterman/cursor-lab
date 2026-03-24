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

/** 通过本地命令行执行 openclaw gateway restart（正确子命令为 gateway restart） */
function runGatewayRestart() {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    let child;
    try {
      if (isWin) {
        child = spawn('openclaw', ['gateway', 'restart'], {
          shell: true,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        // 非 Windows：用 nohup 脱开执行，避免父进程退出导致 restart 未完成（参见 openclaw#41978）
        child = spawn('nohup', ['bash', '-c', 'sleep 2 && openclaw gateway restart > /dev/null 2>&1'], {
          shell: false,
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      }
    } catch (e) {
      resolve({ ok: false, error: '无法执行 openclaw 命令: ' + (e && e.message) });
      return;
    }
    if (isWin) {
      const timeout = setTimeout(() => {
        try { child.kill(); } catch (err) { /* ignore */ }
        resolve({ ok: true, message: 'openclaw gateway restart 已执行（超时断开）' });
      }, 8000);
      child.on('error', (e) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: 'openclaw 执行错误: ' + (e && e.message) });
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ ok: true, message: 'openclaw gateway restart 已执行' });
        } else {
          resolve({ ok: false, error: `openclaw 退出 code=${code} signal=${signal}` });
        }
      });
    } else {
      resolve({ ok: true, message: 'openclaw gateway restart 已在后台执行（约 2 秒后生效）' });
    }
  });
}

/**
 * 浏览器从 localhost:3000 直连 http://127.0.0.1:端口 会因 CORS 失败。
 * 将请求改为同源：/ __openclaw /{port}/api/... → 开发服转发到 http://127.0.0.1:{port}/api/...
 * openclaw2.html 中 OpenClawGateway.httpBase() 在本地开发时返回 origin + '/__openclaw/' + 探测端口
 */
function openclawGatewayHttpProxyPlugin() {
  const host = () => process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  return {
    name: 'openclaw-gateway-http-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url || '';
        if (!raw.startsWith('/__openclaw/')) return next();
        let pathname = raw.split('?')[0];
        try {
          pathname = decodeURI(pathname);
        } catch (_) {
          /* ignore */
        }
        const m = pathname.match(/^\/__openclaw\/(\d+)(\/.*)?$/);
        if (!m) return next();
        const port = m[1];
        const gwPath = m[2] && m[2].length ? m[2] : '/';
        const qs = raw.includes('?') ? `?${raw.split('?').slice(1).join('?')}` : '';
        const target = `http://${host()}:${port}${gwPath}${qs}`;
        try {
          const method = (req.method || 'GET').toUpperCase();
          const hop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade']);
          /** @type {Record<string, string>} */
          const out = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (!k || hop.has(k.toLowerCase())) continue;
            if (k.toLowerCase() === 'host') continue;
            if (typeof v === 'string') out[k] = v;
            else if (Array.isArray(v) && v.length) out[k] = v.join(', ');
          }
          let body;
          if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
            const buf = await readBody(req);
            if (buf && buf.length) body = buf;
          }
          const r = await fetch(target, {
            method,
            headers: out,
            body,
            signal: AbortSignal.timeout(15000),
          });
          const skip = new Set(['content-encoding', 'transfer-encoding']);
          res.statusCode = r.status;
          r.headers.forEach((val, key) => {
            if (skip.has(key.toLowerCase())) return;
            try {
              res.setHeader(key, val);
            } catch (_) {
              /* ignore invalid header names */
            }
          });
          const ab = await r.arrayBuffer();
          res.end(Buffer.from(ab));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
        }
      });
    },
  };
}

/** openclaw2.html workerPayload 依赖同源 /api/openclaw/latest 等；Gateway 路径因版本可能为 /latest 或 /api/openclaw/latest，故在开发服做多路径回源 */
function openclawGatewayBridgePlugin() {
  const host = () => process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
  const port = () => process.env.OPENCLAW_GATEWAY_PORT || '18789';
  const base = () => `http://${host()}:${port()}`;

  function candidates(pathname) {
    const p = pathname.split('?')[0];
    const set = new Set();
    set.add(p);
    if (p.startsWith('/api/openclaw')) {
      const rest = p.replace(/^\/api\/openclaw/, '') || '/';
      set.add(rest);
      set.add(`/openclaw${rest === '/' ? '' : rest}`);
      set.add(`/api${rest === '/' ? '' : rest}`);
    }
    if (p.startsWith('/api/analysis')) {
      set.add(p.replace(/^\/api/, '') || '/');
    }
    if (p === '/api/latest_analysis') {
      set.add('/latest_analysis');
    }
    return [...set];
  }

  return {
    name: 'openclaw-gateway-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const method = req.method || 'GET';
        if (method !== 'GET' && method !== 'POST') return next();
        const raw = req.url || '';
        const pathname = raw.split('?')[0];
        const allowed =
          pathname.startsWith('/api/openclaw/') ||
          pathname === '/api/analysis/latest' ||
          pathname === '/api/latest_analysis';
        if (!allowed) return next();

        const qs = raw.includes('?') ? `?${raw.split('?').slice(1).join('?')}` : '';
        const tryUrls = candidates(pathname).map((c) => `${base()}${c}${qs}`);

        for (const url of tryUrls) {
          try {
            const r = await fetch(url, {
              method,
              headers: { Accept: 'application/json,*/*' },
              signal: AbortSignal.timeout(5000),
            });
            if (!r.ok) continue;
            const ct = r.headers.get('content-type') || 'application/json; charset=utf-8';
            const buf = Buffer.from(await r.arrayBuffer());
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'no-store');
            res.statusCode = 200;
            res.end(buf);
            return;
          } catch (_) {
            /* try next */
          }
        }

        try {
          const homedir = process.env.HOME || process.env.USERPROFILE || '';
          const { join } = await import('path');
          const { existsSync, readFileSync } = await import('fs');
          const files = [
            join(homedir, '.openclaw', 'last_analysis_data.json'),
            join(homedir, '.openclaw', 'openclaw2_payload.json'),
            join(process.cwd(), '.openclaw', 'last_analysis_data.json'),
            join(process.cwd(), 'openclaw2_payload.json'),
          ];
          for (const fp of files) {
            if (!existsSync(fp)) continue;
            const body = readFileSync(fp, 'utf-8');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.statusCode = 200;
            res.end(body);
            return;
          }
        } catch (_) {
          /* ignore */
        }

        next();
      });
    },
  };
}

const dialogueTokenPlugin = () => {
  return {
    name: 'dialogue-token-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && (req.url === '/api/gateway-restart' || req.url === '/api/gateway-restart/')) {
          runGatewayRestart()
            .then((body) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.statusCode = body.ok ? 200 : 500;
              res.end(JSON.stringify(body));
            })
            .catch((e) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
            });
          return;
        }
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
    // /api/openclaw/* 由 openclawGatewayBridgePlugin 多路径回源，勿在此 rewrite 为单一路径以免与 Gateway 实际路由不符
    proxy: {
      '/ws': {
        target: `ws://${process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1'}:${process.env.OPENCLAW_GATEWAY_PORT || '18789'}`,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },

  // 插件配置（bridge 需在 dialogue-token 之前，优先命中 OpenClaw 数据回源）
  plugins: [openclawGatewayHttpProxyPlugin(), openclawGatewayBridgePlugin(), dialogueTokenPlugin(), copyI18nPlugin()],

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
