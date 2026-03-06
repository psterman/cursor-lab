/**
 * main.js - 主逻辑文件
 * 集成文件上传、数据库解析、图表渲染和图片导出功能
 */

import { CursorParser } from './src/CursorParser.js';
import { VibeCodingerAnalyzer, DIMENSIONS } from './src/VibeCodingerAnalyzer.js';

// ========== 全环境 Auth 拦截器（IIFE，import 之后立即执行） ==========
(function () {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash || '';
  const hasToken = /access_token=/.test(hash);

  if (hasToken) {
    const params = {};
    hash.slice(1).split('&').forEach(function (pair) {
      const i = pair.indexOf('=');
      if (i !== -1) {
        const k = decodeURIComponent(pair.slice(0, i));
        const v = decodeURIComponent((pair.slice(i + 1) || '').replace(/\+/g, ' '));
        params[k] = v;
      }
    });
    const token = params.access_token || params['access_token'];
    const refreshToken = params.refresh_token || params['refresh_token'];
    if (token) {
      try {
        window.localStorage.setItem('vibe_github_access_token', token);
        if (refreshToken) window.localStorage.setItem('vibe_github_refresh_token', refreshToken);
        window.__VIBE_GITHUB_ACCESS_TOKEN__ = token;
        console.log('[Auth] ✅ 已从 Hash 捕获 access_token 并写入 localStorage + 全局变量');
      } catch (e) {
        console.warn('[Auth] 写入 token 失败:', e);
      }
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = payload + Array((4 - payload.length % 4) % 4 + 1).join('=');
          const json = atob(padded);
          const data = JSON.parse(json);
          const meta = data.user_metadata || {};
          const avatar = meta.avatar_url || meta.avatar || meta.picture || '';
          const name = meta.user_name || meta.full_name || meta.name || meta.preferred_username || meta.login || data.email || '';
          if (avatar || name) {
            const cache = { avatar: avatar, name: name, at: Date.now() };
            try {
              window.localStorage.setItem('vibe_github_user_cache', JSON.stringify(cache));
            } catch (_) {}
            if (typeof window !== 'undefined') window.__vibeGitHubUser = cache;
          }
          
          // 【认领机制】在捕获到 access_token 的第一时间，向后端发送 migrate 请求
          const userId = data.sub || null;
          if (userId) {
            try {
              const userFingerprint = window.localStorage.getItem('user_fingerprint');
              if (userFingerprint && String(userFingerprint).trim() !== '') {
                console.log('[Auth] 🔑 检测到 access_token，开始迁移 fingerprint 到 user_id...', {
                  userId: userId.substring(0, 8) + '...',
                  fingerprint: String(userFingerprint).substring(0, 8) + '...',
                });
                
                // 异步发送 migrate 请求（不阻塞页面加载）
                fetch('/api/fingerprint/migrate', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    fingerprint: userFingerprint,
                    userId: userId,
                    username: name || '',
                  }),
                }).then(res => {
                  if (res.ok) {
                    console.log('[Auth] ✅ Fingerprint 迁移请求已发送');
                  } else {
                    console.warn('[Auth] ⚠️ Fingerprint 迁移请求失败:', res.status);
                  }
                }).catch(err => {
                  console.warn('[Auth] ⚠️ Fingerprint 迁移请求出错:', err);
                });
              } else {
                console.log('[Auth] ℹ️ 未找到 user_fingerprint，跳过迁移');
              }
            } catch (e) {
              console.warn('[Auth] ⚠️ 迁移 fingerprint 时出错:', e);
            }
          }
        }
      } catch (_) {}
      try {
        if (window.history && window.history.replaceState) {
          const url = window.location.pathname + (window.location.search || '');
          window.history.replaceState(null, '', url);
          console.log('[Auth] ✅ 已清理地址栏 Hash');
        }
      } catch (_) {}
    }
  } else {
    try {
      const stored = window.localStorage.getItem('vibe_github_access_token');
      if (stored && String(stored).trim()) {
        window.__VIBE_GITHUB_ACCESS_TOKEN__ = stored.trim();
        console.log('[Auth] 兜底：已从 localStorage 加载 Token 到全局变量');
      }
    } catch (_) {}
  }
})();

/** 多环境 Redirect URL：localhost 跳回 localhost，pages.dev 跳回 pages.dev */
if (typeof window !== 'undefined') {
  window.getVibeRedirectUrl = function () {
    return window.location.origin + window.location.pathname;
  };
}

/** 请求并发锁（去重）：{ promise: 当前进行中的请求, done: 是否已成功完成一次 } */
if (typeof globalThis !== 'undefined') {
  globalThis.__vibeUploadLock = globalThis.__vibeUploadLock || { promise: null, done: false };
}

/**
 * 【V6 维度字典】V6_METRIC_CONFIG - 全量40维度配置
 * 包含勋章类、指标类、全网类三大类别的维度定义
 */
const V6_METRIC_CONFIG = {
  // 勋章类：离散计数（超过阈值显示徽章）
  badges: {
    ketao_count: { 
      label: { 'zh-CN': '赛博磕头', 'en': 'Ketao Count' },
      threshold: 10,
      className: 'tag-ketao',
      icon: '🙏'
    },
    jiafang_count: { 
      label: { 'zh-CN': '甲方上身', 'en': 'Jiafang Index' },
      threshold: 5,
      className: 'tag-jiafang',
      icon: '💼'
    },
    tease_count: { 
      label: { 'zh-CN': '调戏AI', 'en': 'Tease AI' },
      threshold: 3,
      className: 'tag-tease',
      icon: '😄'
    },
    nonsense_count: { 
      label: { 'zh-CN': '废话输出', 'en': 'Nonsense Output' },
      threshold: 20,
      className: 'tag-nonsense',
      icon: '💬'
    },
    abuse_value: {
      label: { 'zh-CN': '受虐值', 'en': 'Abuse Value' },
      threshold: 5,
      className: 'tag-abuse',
      icon: '😤'
    }
  },
  
  // 指标类：连续数值（显示进度条或数值）
  metrics: {
    avg_payload: { 
      label: { 'zh-CN': '平均长度', 'en': 'Avg Payload' },
      unit: 'chars',
      max: 500,
      className: 'metric-avg-payload'
    },
    work_days: { 
      label: { 'zh-CN': '上岗天数', 'en': 'Work Days' },
      unit: 'days',
      max: 365,
      className: 'metric-work-days'
    },
    logic_score: { 
      label: { 'zh-CN': '逻辑力', 'en': 'Logic Score' },
      unit: '',
      max: 100,
      className: 'metric-logic-score'
    },
    balance_score: {
      label: { 'zh-CN': '人格稳定性', 'en': 'Personality Stability' },
      unit: '%',
      max: 100,
      className: 'metric-balance-score'
    },
    code_ratio: {
      label: { 'zh-CN': '代码占比', 'en': 'Code Ratio' },
      unit: '%',
      max: 100,
      className: 'metric-code-ratio'
    },
    feedback_density: {
      label: { 'zh-CN': '反馈密度', 'en': 'Feedback Density' },
      unit: 'msg/day',
      max: 50,
      className: 'metric-feedback-density'
    },
    diversity_score: {
      label: { 'zh-CN': '技术多样性', 'en': 'Tech Diversity' },
      unit: '',
      max: 20,
      className: 'metric-diversity-score'
    },
    style_index: {
      label: { 'zh-CN': '交互风格指数', 'en': 'Style Index' },
      unit: '',
      max: 200,
      className: 'metric-style-index'
    }
  },
  
  // 全网类：宏观统计数据
  global: {
    total_users: { 
      label: { 'zh-CN': '诊断总人数', 'en': 'Total Users' },
      key: 'total_count',
      className: 'global-total-users'
    },
    global_chars: { 
      label: { 'zh-CN': '累计吐槽字数', 'en': 'Global Chars' },
      key: 'total_chars',
      className: 'global-chars'
    },
    global_avg_payload: { 
      label: { 'zh-CN': '全网平均篇幅', 'en': 'Global Avg Payload' },
      key: 'avg_payload',
      className: 'global-avg-payload'
    },
    geo_hotmap_summary: {
      label: { 'zh-CN': '地理位置分布', 'en': 'Geographic Distribution' },
      key: 'geo_hotmap_summary',
      className: 'global-geo-summary'
    },
    answer_text: {
      label: { 'zh-CN': '今日答案之书', 'en': "Today's Answer Book" },
      key: 'answer_text',
      className: 'global-answer-text'
    }
  }
};

/**
 * 创建 VibeCodingerAnalyzer 实例（适配 GitHub Pages 环境）
 * 注意：Worker 路径需要在 VibeCodingerAnalyzer.js 中修改以支持 GitHub Pages
 * 当前实现会在 Worker 初始化失败时自动降级到同步处理
 * 
 * @param {string} lang - 语言代码
 * @returns {VibeCodingerAnalyzer} 分析器实例
 */
function createVibeCodingerAnalyzer(lang = 'zh-CN') {
  const analyzer = new VibeCodingerAnalyzer(lang);
  
  // 在 GitHub Pages 环境下，如果 Worker 初始化失败，会自动降级到同步处理
  // 这不会影响功能，只是性能会稍慢
  console.log('[Main] 创建 VibeCodingerAnalyzer 实例，环境:', {
    basePath: window.BASE_PATH || '(空)',
    isGitHubPages: window.location.hostname.includes('github.io'),
    workerConfig: window.WORKER_CONFIG
  });
  
  return analyzer;
}

// 检测基础路径（用于 GitHub Pages 等生产环境）
if (!window.BASE_PATH) {
  const pathname = window.location.pathname;
  const hostname = window.location.hostname;
  const isGitHubPages = hostname.includes('github.io');
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  let basePath = '';

  // 本地开发环境使用相对路径
  if (isLocalhost) {
    basePath = '';
  } else if (isGitHubPages) {
    // GitHub Pages: 从 pathname 提取仓库名
    // pathname 可能是: /cursor-lab/ 或 /cursor-lab/index.html 或 /cursor-lab/some-page.html
    const pathParts = pathname.split('/').filter(p => p && p !== 'index.html');
    
    // 如果 pathname 是 '/' 或只有 'index.html'，可能是用户页面（username.github.io）
    // 否则第一个非空部分通常是仓库名（如 cursor-lab）
    if (pathParts.length > 0) {
      basePath = '/' + pathParts[0];
    } else {
      // 如果 pathname 是 '/'，检查是否是项目页面
      // 对于项目页面，URL 通常是 username.github.io/repo-name/
      // 对于用户页面，URL 通常是 username.github.io/
      // 这里假设如果是项目页面，pathname 应该包含仓库名
      // 如果没有，可能是用户页面，basePath 为空
      basePath = '';
    }
    
    console.log('[Main] GitHub Pages 路径检测:', {
      pathname,
      pathParts,
      detectedBasePath: basePath
    });
  } else {
    // 其他生产环境
    const pathParts = pathname.split('/').filter(p => p && p !== 'index.html');
    basePath = pathParts.length > 0 ? '/' + pathParts[0] : '';
  }

  // 确保 basePath 格式正确（不以 / 结尾，除非是根路径）
  if (basePath && basePath !== '/' && basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }

  window.BASE_PATH = basePath;
  console.log('[Main] 检测到基础路径:', window.BASE_PATH, {
    hostname,
    pathname,
    isGitHubPages,
    isLocalhost
  });
}

/**
 * 解析资源路径（适配 GitHub Pages 二级路径，如 https://xxx.github.io/cursor-lab/）
 * 图片、脚本等相对路径应通过此函数或 BASE_PATH 拼接，避免 404
 * @param {string} path - 相对路径，如 '/img/logo.png' 或 'img/logo.png'
 * @returns {string} 带 basePath 的路径
 */
if (typeof window !== 'undefined') {
  window.getVibeAssetUrl = function (path) {
    const base = window.BASE_PATH || '';
    const p = String(path || '').trim();
    const normalized = p.startsWith('/') ? p : '/' + p;
    return base + normalized;
  };
}

/**
 * 【三身份级别词云】一次性加载 Novice/Professional/Architect 词库
 * @returns {Promise<{ Novice: string[], Professional: string[], Architect: string[] }>}
 */
async function loadIdentityLevelKeywords() {
  const base = window.BASE_PATH || '';
  const urls = ['Novice.json', 'Professional.json', 'Architect.json'].map(name => {
    if (!base) return name; // 如果 base 为空，直接使用相对路径
    return base + (base.endsWith('/') ? '' : '/') + name;
  });
  
  console.log('[Main] 正在加载身份级别词库:', urls);
  
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[Main] 加载失败 ${url}: HTTP ${response.status}`);
        return { keywords: [] };
      }
      const data = await response.json();
      const count = Array.isArray(data?.keywords) ? data.keywords.length : 0;
      console.log(`[Main] 成功加载 ${url}: ${count} 个关键词`);
      return data;
    } catch (err) {
      console.warn(`[Main] 加载失败 ${url}:`, err.message);
      return { keywords: [] };
    }
  }));
  
  const [n, p, a] = results;
  const result = {
    Novice: Array.isArray(n?.keywords) ? n.keywords : [],
    Professional: Array.isArray(p?.keywords) ? p.keywords : [],
    Architect: Array.isArray(a?.keywords) ? a.keywords : [],
  };
  
  console.log('[Main] 身份级别词库加载完成:', {
    Novice: result.Novice.length,
    Professional: result.Professional.length,
    Architect: result.Architect.length
  });
  
  if (typeof window !== 'undefined') window.__identityLevelKeywords = result;
  return result;
}

/**
 * 构建 Worker 文件的 URL（适配 GitHub Pages 环境）
 * @param {string} workerFileName - Worker 文件名（如 'vibeAnalyzerWorker.js'）
 * @returns {string} Worker 的完整 URL
 */
function getWorkerUrl(workerFileName) {
  const basePath = window.BASE_PATH || '';
  
  // 在 GitHub Pages 环境下，需要构建绝对路径
  if (basePath) {
    // 使用绝对路径：/repo-name/src/worker.js
    const workerPath = `${basePath}/src/${workerFileName}`;
    console.log('[Main] 构建 Worker URL (GitHub Pages):', workerPath);
    return workerPath;
  } else {
    // 本地开发环境：使用相对路径
    const workerPath = `./src/${workerFileName}`;
    console.log('[Main] 构建 Worker URL (本地):', workerPath);
    return workerPath;
  }
}

/**
 * 全局配置对象，用于传递配置给子模块
 * 注意：VibeCodingerAnalyzer 需要读取此配置来正确初始化 Worker
 * 如果 Worker 初始化失败，会自动降级到同步处理（不影响功能）
 */
window.WORKER_CONFIG = {
  getWorkerUrl: getWorkerUrl,
  basePath: window.BASE_PATH || '',
  // Worker 文件路径（GitHub Pages 环境）
  workerPath: window.BASE_PATH 
    ? `${window.BASE_PATH}/src/vibeAnalyzerWorker.js`
    : './src/vibeAnalyzerWorker.js'
};
// Chart.js 和 html2canvas 通过 CDN 加载，使用全局变量
// import Chart from 'chart.js/auto';
// import html2canvas from 'html2canvas';

/**
 * VibeCodingApp 类 - 封装文件上传和分析逻辑
 */
class VibeCodingApp {
  constructor() {
    this.parser = null;
    this.analyzer = null;
    this.allChatData = [];
    this.globalStats = null;
    this.vibeResult = null;
    this.globalStatsCache = null; // 【V6 新增】存储后端返回的 global_stats
  }

  /**
   * 【优化后的数据上传函数】
   * 注意：实际上传逻辑在 worker/index.ts 中，已使用 Upsert 模式
   * 此函数仅作为辅助说明，实际数据通过 uploadToSupabase 方法上传
   * 
   * 上传逻辑说明：
   * 1. 使用 fingerprint 作为唯一标识
   * 2. 后端已实现 Upsert（通过 'Prefer': 'resolution=merge-duplicates'）
   * 3. 如果 fingerprint 重复，则执行更新而非插入
   * 
   * @param {Object} context - 上下文对象，包含 fingerprint
   * @param {Object} result - 分析结果对象
   * @private
   */
  async uploadUserStats(context, result) {
    // 实际上传在 VibeCodingerAnalyzer.uploadToSupabase 中完成
    // 该方法会调用 /api/v2/analyze 接口，后端使用 Upsert 模式
    // 这里仅作为文档说明，不需要实际实现
    console.log('[VibeCodingApp] uploadUserStats: 实际上传由 uploadToSupabase 方法处理');
  }

  /**
   * 【V6 环境感知】生成环境上下文
   * 【修复】使用 getStableFingerprint() 确保指纹唯一且持久（32位哈希）
   * @returns {Object} 包含 fingerprint, timezone, lang, isVpn 等环境信息
   */
  async generateContext() {
    // 1. 获取或生成 fingerprint（使用稳定指纹函数，32位哈希）
    let fingerprint;
    try {
      fingerprint = await getStableFingerprint();
    } catch (error) {
      console.warn('[VibeCodingApp] 异步指纹生成失败，使用同步降级:', error);
      fingerprint = getStableFingerprintSync();
    }

    // 2. 获取 timezone
    let timezone = 'UTC';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      console.warn('[VibeCodingApp] timezone 获取失败:', error);
    }

    // 3. 获取 lang
    const lang = getCurrentLang() || 'zh-CN';

    // 4. 检测 isVpn（V6 扩展：对比时区与 IP 推测时区的差异）
    let isVpn = false;
    try {
      // 获取当前时间的小时数（本地时间）
      const localHour = new Date().getHours();
      
      // 根据时区计算 UTC 偏移小时数
      const getTimezoneOffset = (tz) => {
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const tzTime = new Date(utcTime + (getTimezoneOffsetHours(tz) * 3600000));
        return tzTime.getHours();
      };
      
      // 获取时区偏移小时数（简化版）
      const getTimezoneOffsetHours = (tz) => {
        // 常见时区偏移（简化处理）
        const tzOffsets = {
          'Asia/Shanghai': 8,
          'Asia/Hong_Kong': 8,
          'Asia/Tokyo': 9,
          'America/New_York': -5,
          'America/Los_Angeles': -8,
          'Europe/London': 0,
          'UTC': 0
        };
        return tzOffsets[tz] || 0;
      };
      
      // 【V6 VPN 探测强化】时区偏差探测
      // 计算时区对应的预期小时数
      const expectedHour = (localHour + getTimezoneOffsetHours(timezone)) % 24;
      
      // 如果时区与本地时间偏差超过 2 小时，可能是 VPN
      const hourDiff = Math.abs(localHour - expectedHour);
      const isLargeTimeDiff = hourDiff > 2 && hourDiff < 22; // 排除跨日边界情况
      
      // 【V6 强化】时区偏移与 IP 归属地时区不符检测
      // 获取当前时区的 UTC 偏移（分钟）
      const currentTimezoneOffset = new Date().getTimezoneOffset(); // 返回的是 UTC 与本地时间的差值（分钟）
      const currentTimezoneOffsetHours = -currentTimezoneOffset / 60; // 转换为小时
      
      // 根据 timezone 字符串计算预期偏移
      const expectedOffsetHours = getTimezoneOffsetHours(timezone);
      
      // 如果实际偏移与预期偏移不一致（偏差超过 1 小时），可能是 VPN
      const offsetDiff = Math.abs(currentTimezoneOffsetHours - expectedOffsetHours);
      const isTimezoneOffsetMismatch = offsetDiff > 1;
      
      // 原有逻辑：时区与语言不匹配
      const commonVpnTimezones = ['UTC', 'America/New_York', 'Europe/London'];
      const isTimezoneMismatch = commonVpnTimezones.includes(timezone) && lang.startsWith('zh');
      const isUtcWithNonEnglish = timezone === 'UTC' && !lang.startsWith('en');
      
      // 【V6 综合判断】时区偏差、时区偏移不符或时区语言不匹配
      isVpn = isLargeTimeDiff || isTimezoneOffsetMismatch || isTimezoneMismatch || isUtcWithNonEnglish;
      
      if (isVpn) {
        console.log('[VibeCodingApp] ⚠️ VPN 检测触发:', {
          timezone,
          localHour,
          expectedHour,
          hourDiff,
          isLargeTimeDiff,
          isTimezoneOffsetMismatch,
          isTimezoneMismatch,
          isUtcWithNonEnglish,
          currentTimezoneOffsetHours,
          expectedOffsetHours,
          offsetDiff
        });
      }
    } catch (error) {
      console.warn('[VibeCodingApp] VPN 检测失败:', error);
    }

    // 5. 检测 isProxy 和 IP（V6 增强：使用 WebRTC 探测）
    let isProxy = false;
    let detectedIp = '0.0.0.0';
    
    // 【V6 WebRTC 探测】尝试通过 WebRTC 获取本地 IP（异步，不阻塞主流程）
    // 注意：WebRTC 探测是异步的，这里先设置默认值，实际 IP 由后端获取
    try {
      if (typeof RTCPeerConnection !== 'undefined') {
        const rtc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        rtc.createDataChannel('');
        
        rtc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (ipMatch && !ipMatch[0].startsWith('127.') && !ipMatch[0].startsWith('192.168.') && !ipMatch[0].startsWith('10.')) {
              detectedIp = ipMatch[0];
              console.log('[VibeCodingApp] ✅ WebRTC 探测到 IP:', detectedIp);
              rtc.close();
            }
          }
        };
        
        rtc.createOffer().then(offer => rtc.setLocalDescription(offer)).catch(err => {
          console.warn('[VibeCodingApp] WebRTC createOffer 失败:', err);
          rtc.close();
        });
        
        // 超时处理（2秒，不阻塞主流程）
        setTimeout(() => {
          rtc.close();
          if (detectedIp === '0.0.0.0') {
            console.log('[VibeCodingApp] WebRTC 探测超时，使用默认 IP（后端将获取真实 IP）');
          }
        }, 2000);
      }
      
      // Proxy 检测：如果检测到多个 IP 或 IP 与预期不符，可能是代理
      // 简化处理：暂时保持 false，后续可根据实际需求增强
    } catch (error) {
      console.warn('[VibeCodingApp] WebRTC 探测失败（使用默认值）:', error);
      // 降级：使用默认值，IP 由后端获取
    }

    const context = {
      fingerprint,
      timezone,
      lang,
      isVpn,
      isProxy,
      ip: detectedIp // 【V6 增强】使用 WebRTC 探测的 IP
    };

    console.log('[VibeCodingApp] ✅ 环境上下文已生成:', context);
    return context;
  }

  /**
   * 初始化应用
   */
  async init() {
    console.log('[VibeCodingApp] 初始化应用...');
    
    // 初始化解析器
    if (!this.parser) {
      this.parser = new CursorParser();
      await this.parser.init();
    }
    
    // 初始化分析器
    if (!this.analyzer) {
      this.analyzer = createVibeCodingerAnalyzer();
    }
    
    console.log('[VibeCodingApp] 初始化完成');
  }

  /**
   * 【V6 自动化渲染引擎】renderBehaviorTags：遍历 V6_METRIC_CONFIG 自动生成 DOM
   * @param {Object} stats - stats 对象
   * @param {string} containerId - 容器 ID（默认为 'behavior-tags-container'）
   */
  renderBehaviorTags(stats, containerId = 'behavior-tags-container') {
    if (!stats) {
      console.warn('[VibeCodingApp] renderBehaviorTags: stats 不存在');
      return;
    }

    const container = document.getElementById(containerId) || document.querySelector(`#${containerId}`);
    if (!container) return; // 当前页面无此容器时静默返回，不刷控制台

    const lang = getCurrentLang();
    const badges = V6_METRIC_CONFIG.badges;
    
    // 遍历配置，自动生成标签
    const tags = Object.entries(badges)
      .filter(([key, config]) => {
        const value = stats[key] || 0;
        return value >= config.threshold;
      })
      .map(([key, config]) => {
        const value = stats[key] || 0;
        const label = config.label[lang] || config.label['zh-CN'];
        return `
          <span class="vibe-tag ${config.className}" data-v6-key="${key}" data-v6-value="${value}">
            ${config.icon ? `${config.icon} ` : ''}${escapeHtml(label)}
          </span>
        `;
      });

    // 核心人设：style_label（始终显示）
    if (stats.style_label) {
      tags.push(`
        <span class="vibe-tag tag-style-label" data-v6-key="style_label" style="font-weight: bold; font-size: 1.1em; background: var(--accent-terminal); color: white;">
          ${escapeHtml(stats.style_label)}
        </span>
      `);
    }

    container.innerHTML = tags.length > 0 
      ? tags.join('')
      : `<div class="vibe-tag-empty">${lang === 'en' ? 'No behavior tags yet' : '暂无行为标签'}</div>`;

    console.log('[VibeCodingApp] ✅ renderBehaviorTags 完成，生成', tags.length, '个标签');
  }

  /**
   * 【V6 云端维度绑定】updateV6UI：从 detailedStats 数组更新维度 UI
   * @param {Object} apiData - API 返回的数据对象，包含 detailedStats 数组
   */
  updateV6UI(apiData) {
    if (!apiData || !apiData.detailedStats || !Array.isArray(apiData.detailedStats)) {
      console.warn('[VibeCodingApp] updateV6UI: detailedStats 无效或不存在');
      return;
    }

    const detailedStats = apiData.detailedStats;
    let updatedCount = 0;

    // 【调试】验证所有维度容器是否存在
    const allDimensionCards = document.querySelectorAll('[data-v6-dim]');
    console.log('[VibeCodingApp] updateV6UI: 找到的维度容器:', Array.from(allDimensionCards).map(el => ({
      dimension: el.getAttribute('data-v6-dim'),
      hasRankLabel: !!el.querySelector('.rank-label'),
      hasRoastText: !!el.querySelector('.roast-text')
    })));

    // 遍历 detailedStats 数组，某维度容器不存在时仅 console.warn 不中断渲染
    detailedStats.forEach((item) => {
      try {
        const { dimension, label, roast, score } = item || {};
        if (!dimension) {
          console.warn('[VibeCodingApp] updateV6UI: 维度标识缺失', item);
          return;
        }
        const dimensionCard = document.querySelector('[data-v6-dim="' + dimension + '"]');
        if (!dimensionCard) {
          console.warn('[VibeCodingApp] updateV6UI: 未找到维度 ' + dimension + ' 的容器，跳过');
          return;
        }
        const rankLabelEl = dimensionCard.querySelector('.rank-label');
        if (!rankLabelEl) {
          console.warn('[VibeCodingApp] updateV6UI: 维度 ' + dimension + ' 的容器中未找到 .rank-label');
        } else if (label && label !== '未知') {
          rankLabelEl.textContent = label;
          updatedCount++;
        }
        const roastTextEl = dimensionCard.querySelector('.roast-text');
        if (!roastTextEl) {
          console.warn('[VibeCodingApp] updateV6UI: 维度 ' + dimension + ' 的容器中未找到 .roast-text');
        } else if (roast && roast !== '暂无吐槽文案') {
          roastTextEl.textContent = roast;
          updatedCount++;
        }
        if (score !== undefined && score !== null) {
          const dimensionValueEl = dimensionCard.querySelector('.dimension-value');
          if (dimensionValueEl) dimensionValueEl.textContent = Math.round(score);
          const dimensionBarEl = dimensionCard.querySelector('.dimension-bar');
          if (dimensionBarEl) dimensionBarEl.style.width = Math.min(100, Math.max(0, score)) + '%';
        }
      } catch (err) {
        console.warn('[VibeCodingApp] updateV6UI: 更新某维度时异常，跳过', err && err.message);
      }
    });

    console.log('[VibeCodingApp] ✅ updateV6UI 完成，更新了', updatedCount, '个维度元素');
  }

  /**
   * 【V6 全网数据自动填空】syncGlobalStats：使用 data-v6-key 自动填充数据
   * 【装修级优化】加入渐入动画，让用户感知到数据是从全网实时同步回来的
   * @param {Object} globalStats - 后端返回的 global_stats 对象
   */
  syncGlobalStats(globalStats) {
    if (!globalStats || typeof globalStats !== 'object') {
      console.warn('[VibeCodingApp] syncGlobalStats: globalStats 无效');
      return;
    }

    // 查找所有带有 data-v6-key 属性的元素
    const elements = document.querySelectorAll('[data-v6-key]');
    let updatedCount = 0;

    elements.forEach((element, index) => {
      const key = element.getAttribute('data-v6-key');
      if (!key) return;

      // 从 globalStats 中查找对应的值
      let value = null;
      
      // 优先使用 global 配置中的 key 映射
      const globalConfig = V6_METRIC_CONFIG.global[key];
      if (globalConfig && globalConfig.key) {
        value = globalStats[globalConfig.key];
      } else {
        // 直接使用 key
        value = globalStats[key];
      }

      if (value !== null && value !== undefined) {
        // 【骨架屏渐入动画】先设置透明度为0，然后渐入
        // 移除骨架屏标记（如果存在）
        element.removeAttribute('data-skeleton');
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.5s ease-in-out';
        
        // 格式化数值
        if (typeof value === 'number') {
          element.textContent = value.toLocaleString();
        } else {
          element.textContent = escapeHtml(String(value));
        }
        
        // 使用 requestAnimationFrame 确保 DOM 更新后再触发动画
        // 添加延迟，让每个元素依次渐入（错开 50ms），形成流畅的加载效果
        setTimeout(() => {
          requestAnimationFrame(() => {
            element.style.opacity = '1';
          });
        }, index * 50);
        
        updatedCount++;
      } else {
        // 如果值为空，保持骨架屏状态（显示占位符或保持原值）
        if (!element.textContent || element.textContent.trim() === '' || element.textContent === '0') {
          element.setAttribute('data-skeleton', 'true');
          element.style.opacity = '0.3'; // 半透明表示数据未加载
          // 如果元素为空，添加占位符文本
          if (!element.textContent || element.textContent.trim() === '') {
            element.textContent = '...';
          }
        }
      }
    });

    console.log('[VibeCodingApp] ✅ syncGlobalStats 完成，更新了', updatedCount, '个元素（带渐入动画）');
  }

  /**
   * 【V6 统一映射】AutoMappingEngine：自动将 stats 和 global_stats 分发到 UI 容器
   * @param {Object} result - 分析结果对象
   * @param {Object} globalStats - 后端返回的 global_stats（可选）
   */
  updateUIWithStats(result, globalStats = null) {
    if (!result || !result.stats) {
      console.warn('[VibeCodingApp] updateUIWithStats: result.stats 不存在');
      return;
    }

    const stats = result.stats;
    const lang = getCurrentLang();

    // 【V6 维度注册表】定义数据到容器的映射关系
    const dimensionRegistry = {
      // badge-grid: 离散计数（徽章展示）
      badgeGrid: {
        ketao_count: { label: lang === 'en' ? 'Ketao Count' : '赛博磕头', value: stats.ketao_count || 0 },
        jiafang_count: { label: lang === 'en' ? 'Jiafang Index' : '甲方指数', value: stats.jiafang_count || 0 },
        abuse_value: { label: lang === 'en' ? 'Abuse Value' : '受虐值', value: stats.abuse_value || 0 },
        work_days: { label: lang === 'en' ? 'Work Days' : '上岗天数', value: stats.work_days || 1 },
        tease_count: { label: lang === 'en' ? 'Tease Count' : '调戏AI', value: stats.tease_count || 0 },
        nonsense_count: { label: lang === 'en' ? 'Nonsense Count' : '废话输出', value: stats.nonsense_count || 0 }
      },
      // fingerprint-bars: 连续数值（进度条展示）
      fingerprintBars: {
        balance_score: { label: lang === 'en' ? 'Personality Stability' : '人格稳定性', value: stats.balance_score || 0, max: 100 },
        code_ratio: { label: lang === 'en' ? 'Code Ratio' : '代码占比', value: (stats.code_ratio || 0) * 100, max: 100 },
        feedback_density: { label: lang === 'en' ? 'Feedback Density' : '反馈密度', value: stats.feedback_density || 0, max: 50 },
        diversity_score: { label: lang === 'en' ? 'Tech Diversity' : '技术多样性', value: stats.diversity_score || 0, max: 20 }
      },
    };

    // 更新 badge-grid 容器
    const badgeGrid = document.getElementById('badge-grid') || document.querySelector('.badge-grid');
    if (badgeGrid) {
      const badges = Object.entries(dimensionRegistry.badgeGrid)
        .filter(([key, item]) => item.value > 0) // 只显示非零值
        .map(([key, item]) => `
          <div class="badge-item">
            <span class="badge-label">${item.label}</span>
            <span class="badge-value">${item.value}</span>
          </div>
        `).join('');
      badgeGrid.innerHTML = badges || `<div class="badge-empty">${lang === 'en' ? 'No badges yet' : '暂无徽章'}</div>`;
    }

    // 更新 fingerprint-bars 容器
    const fingerprintBars = document.getElementById('fingerprint-bars') || document.querySelector('.fingerprint-bars');
    if (fingerprintBars) {
      const bars = Object.entries(dimensionRegistry.fingerprintBars)
        .map(([key, item]) => {
          const percentage = Math.min(100, (item.value / item.max) * 100);
          return `
            <div class="fingerprint-bar-item">
              <div class="bar-header">
                <span class="bar-label">${item.label}</span>
                <span class="bar-value">${item.value.toFixed(1)}${key === 'code_ratio' ? '%' : ''}</span>
              </div>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${percentage}%; background: var(--accent-terminal);"></div>
              </div>
            </div>
          `;
        }).join('');
      fingerprintBars.innerHTML = bars;
    }

    // 【V6 自动化渲染引擎】调用 renderBehaviorTags 自动生成行为标签
    this.renderBehaviorTags(stats, 'behavior-tags-container');

    // 【V6 全网数据自动填空】调用 syncGlobalStats 自动填充全网数据
    if (globalStats) {
      this.syncGlobalStats(globalStats);
    }

    console.log('[VibeCodingApp] ✅ AutoMappingEngine 已完成 UI 更新');
  }

  /**
   * 处理文件上传并进行分析
   * @param {Array} chatData - 聊天数据
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeFile(chatData, extraStats = null, onProgress = null, options = {}) {
    if (!this.analyzer) {
      throw new Error('分析器未初始化，请先调用 init()');
    }

    const currentLang = getCurrentLang();
    this.analyzer.setLanguage(currentLang);

    // 【V6 环境感知】生成环境上下文
    const context = await this.generateContext();

    // 【三身份词云】分析前正确注入 JSON 词库，分析完成后挂载 window.vibeResults
    const levelKeywords = await loadIdentityLevelKeywords();
    if (levelKeywords) {
      context.levelKeywords = levelKeywords;
      if (this.analyzer && typeof this.analyzer.setLevelKeywords === 'function') {
        this.analyzer.setLevelKeywords(levelKeywords);
      }
    }

    // 步骤1: 调用 analyze 进行本地分析（传入 context 对象）
    const result = await this.analyzer.analyze(chatData, context, null, onProgress);
    console.log('[VibeCodingApp] analyze 完成:', result);

    // 【身份词云】分析完成回调：必须立即挂载 window.vibeResults，并强制刷新词云
    const ilc = result && (result.identityLevelCloud || (result.statistics && result.statistics.identityLevelCloud) || (result.stats && result.stats.identityLevelCloud));
    if (!ilc || typeof ilc !== 'object') {
      console.warn('[Main] onAnalyzeComplete: payload.identityLevelCloud 缺失，请检查 Worker 是否上报');
    } else {
      window.vibeResults = normalizeIdentityLevelCloud(ilc);
      selectedIdentityLevel = 'Novice';

      // 【霸天/脱发/新手 强制唯一代表词】遍历用户词频匹配 Novice/Professional/Architect 词库，每类取最高频一词；无命中则从词库随机取「潜伏」
      var levelKw = (context && context.levelKeywords) || (typeof window !== 'undefined' && window.__identityLevelKeywords) || null;
      var selectedWords = [];
      var representativeWords = {};
      if (levelKw && levelKw.Novice && levelKw.Professional && levelKw.Architect) {
        var matchResult = pickOneWordPerLevelFromMatch(ilc, levelKw);
        selectedWords = matchResult.selectedWords;
        representativeWords = matchResult.representativeWords || {};
        if (Object.keys(representativeWords).length > 0) {
          result.representativeWords = representativeWords;
        }
      } else {
        selectedWords = pickTopWordPerLevel(ilc);
      }
      var allowedLevels = ['Novice', 'Professional', 'Architect'];
      var soulWordsOnly = selectedWords.filter(function (w) { return w && w.c && allowedLevels.indexOf(w.c) !== -1; }).slice(0, 3);
      if (soulWordsOnly.length > 0) result.soulWords = soulWordsOnly;
      var country = (result && (result.ip_location || result.statistics?.ip_location || result.stats?.ip_location)) || (typeof window !== 'undefined' && window.lastAnalysisResult && window.lastAnalysisResult.ip_location) ? String((result && (result.ip_location || result.statistics?.ip_location || result.stats?.ip_location)) || (window.lastAnalysisResult && window.lastAnalysisResult.ip_location) || '').trim().toUpperCase() : '';
      if (!country || !/^[A-Za-z]{2}$/.test(country)) country = '';
      if (soulWordsOnly.length > 0) {
        console.log('[Main] 高频词上传：仅上传 3 词（词频+指纹）', soulWordsOnly.map(function (w) { return w.p + '(' + w.v + ')'; }));
      }
      reportSoulWord(soulWordsOnly.length ? soulWordsOnly : selectedWords, country).catch(function (err) { console.error('[Main] 灵魂词上报失败:', err); });

      // 渲染词云（可选，取决于页面是否有 Canvas）
      if (typeof renderIdentityLevelCloud === 'function') {
        renderIdentityLevelCloud('Novice');
      }
    }

    // 【V6 适配】确保 stats 对象被正确保存
    // 从 result.stats 或 result.statistics 中提取 stats 对象
    if (result && !result.stats) {
      // 如果 result.stats 不存在，从 result.statistics 中构建
      if (result.statistics) {
        result.stats = {
          totalChars: result.statistics.totalChars || result.statistics.totalUserChars || 0,
          totalMessages: result.statistics.totalMessages || result.statistics.userMessages || 0,
          ketao_count: result.statistics.ketao_count || result.statistics.qingCount || 0,
          jiafang_count: result.statistics.jiafang_count || result.statistics.buCount || 0,
          abuse_value: result.statistics.abuse_value || result.statistics.abuseValue || 0, // 【V6 新增】受虐值
          tech_stack: result.statistics.tech_stack || {},
          work_days: result.statistics.work_days || result.statistics.usageDays || 1,
          avg_payload: result.statistics.avg_payload || 0,
          balance_score: result.statistics.balance_score || 0, // 【V6 新增】人格稳定性
          style_label: result.statistics.style_label || '标准型', // 【V6 新增】交互风格标签
          blackword_hits: result.statistics.blackword_hits || {}, // 【V6 新增】黑话命中统计
          identityLevelCloud: result.statistics.identityLevelCloud || result.identityLevelCloud || { Novice: {}, Professional: {}, Architect: {} },
          ...result.statistics // 保留其他字段
        };
      } else {
        // 降级：使用默认值
        result.stats = {
          totalChars: 0,
          totalMessages: 0,
          ketao_count: 0,
          jiafang_count: 0,
          abuse_value: 0,
          tech_stack: {},
          work_days: 1,
          avg_payload: 0,
          balance_score: 0,
          style_label: '标准型',
          blackword_hits: {}
        };
      }
    }
    
    // 【V6 统一映射】使用 AutoMappingEngine 一次性更新所有 UI
    this.updateUIWithStats(result, this.globalStatsCache);

    // ==========================================================
    // 【性能优化】默认改为“先出本地报告，后后台同步全球排名”
    // 说明：uploadToSupabase 需要联网并可能较慢（会提示“连接全球”），
    // 会让用户误以为上传卡死。这里默认 deferGlobalSync=true。
    // ==========================================================
    const deferGlobalSync = options?.deferGlobalSync !== false; // 默认 true

    const doGlobalSync = async () => {
      if (!result || !result.statistics) return;
      const stats = result.statistics;
      
      // 将 extraStats 合并到 result.statistics 中，确保字段名与 Work.js 的 findVal 匹配
      // Work.js findVal 期望的字段：
      // - ketao: ['ketao', 'buCount', 'qingCount', 'politeCount']
      // - jiafang: ['jiafang', 'buCount', 'negationCount']
      // - totalChars: ['totalUserChars', 'totalChars', 'total_user_chars']
      // - userMessages: ['userMessages', 'totalMessages', 'user_messages', 'messageCount']
      // - days: ['usageDays', 'days', 'workDays']
      stats.qingCount = extraStats?.qingCount || globalStats?.qingCount || 0; // 对应赛博磕头
      stats.buCount = extraStats?.buCount || globalStats?.buCount || 0;       // 对应甲方上身
      stats.usageDays = extraStats?.usageDays || globalStats?.usageDays || 1; // 对应上岗天数
      
      // 确保这俩也有，以匹配 Work.js 的 findVal 查找逻辑
      stats.totalUserChars = stats.totalUserChars || stats.totalChars || 0;
      stats.userMessages = stats.userMessages || stats.totalMessages || 0;

      try {
        // 【身份校准】中文用户（zh-CN/zh-TW）一律上报 CN，贡献进入中国区统计（不因人在海外或代理排除）
        if (typeof navigator !== 'undefined' && /^zh-(CN|TW)$/i.test(navigator.language)) {
          this.analyzer.countryCode = 'CN';
          this.analyzer.forceCnIdentity = true;
        }
        // 步骤3: 调用 uploadToSupabase 联网获取真实排名（后台执行时不阻塞 UI）
        // 传递完整的 result 对象和 chatData；personality.vibe_lexicon 在 analyzer 内从 result.cloud50 构建
        const liveRank = await this.analyzer.uploadToSupabase(result, chatData, onProgress);
        
        // 【关键修复】统一保存 claim_token，确保后续 GitHub 登录可认领匿名数据
        // stats2.html / 认领逻辑读取的 key 为 vibe_claim_token
        try {
          if (liveRank?.claim_token) {
            localStorage.setItem('vibe_claim_token', liveRank.claim_token);
          }
        } catch { /* ignore */ }

        // 【修复】后台同步完成后，推送横向排名数据到 index.html 的 UI
        // index.html 的大卡片依赖 window.userRankings + window.updateRankingBadges
        try {
          if (typeof window !== 'undefined') {
            const totalUsers = Number(liveRank?.totalUsers || result?.rankData?.totalUsers || 0) || 0;
            const ranks = liveRank?.ranks || null; // { ketaoRank, jiafangRank, messageRank, charRank, avgRank, daysRank }，通常是百分比

            const convertPercentToRank = (percent) => {
              if (percent === null || percent === undefined || totalUsers <= 0) return null;
              const p = Number(percent);
              if (Number.isNaN(p)) return null;
              if (p <= 0) return totalUsers;
              const beaten = Math.floor(totalUsers * (p / 100));
              return Math.max(1, totalUsers - beaten);
            };

            if (totalUsers > 0 && ranks) {
              window.userRankings = {
                qingCount: { rank: convertPercentToRank(ranks.ketaoRank), total: totalUsers },
                buCount: { rank: convertPercentToRank(ranks.jiafangRank), total: totalUsers },
                userMessages: { rank: convertPercentToRank(ranks.messageRank), total: totalUsers },
                totalUserChars: { rank: convertPercentToRank(ranks.charRank), total: totalUsers },
                avgUserMessageLength: { rank: convertPercentToRank(ranks.avgRank), total: totalUsers },
                usageDays: { rank: convertPercentToRank(ranks.daysRank), total: totalUsers },
              };

              // 触发 index.html 的渲染更新
              if (typeof window.updateRankingBadges === 'function') {
                const lang = localStorage.getItem('appLanguage') || 'zh-CN';
                Promise.resolve(window.updateRankingBadges(window.userRankings, lang))
                  .catch(() => {});
              }
              try {
                window.dispatchEvent(new CustomEvent('userRankingsUpdated', { detail: window.userRankings }));
              } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
        
        // 【V6 上报协议对齐】从本地存储读取 global_stats（由 uploadToSupabase 保存）
        try {
          const savedGlobalStats = localStorage.getItem('vibe_global_stats');
          if (savedGlobalStats) {
            this.globalStatsCache = JSON.parse(savedGlobalStats);
            console.log('[VibeCodingApp] ✅ 已加载 global_stats:', this.globalStatsCache);
            // 【V6 统一映射】更新 UI（包含 global_stats）
            this.updateUIWithStats(result, this.globalStatsCache);
            // 【V6 全网数据自动填空】调用 syncGlobalStats 自动填充
            this.syncGlobalStats(this.globalStatsCache);
          } else {
            // 即使没有 global_stats，也要更新 UI（仅使用 stats）
            this.updateUIWithStats(result, null);
          }
        } catch (error) {
          console.warn('[VibeCodingApp] 读取 global_stats 失败:', error);
          // 降级：只使用 stats 更新 UI
          this.updateUIWithStats(result, null);
        }
        
        // 如果后端返回了 globalAverage，更新全局变量
        if (liveRank && liveRank.globalAverage) {
          const avg = liveRank.globalAverage;
          // 检查是否是有效数据（不是默认值）
          const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
          if (!isDefaultValue) {
            globalAverageData = avg;
            globalAverageDataLoaded = true;
            console.log('[VibeCodingApp] ✅ 从 uploadToSupabase 获取到全局平均值:', globalAverageData);
          } else {
            console.warn('[VibeCodingApp] ⚠️ uploadToSupabase 返回的全局平均值是默认值，忽略');
          }
        }
        
        // 步骤4: 必须拿到 rankPercent 后，再更新结果
        if (liveRank && liveRank.rankPercent !== undefined) {
          // 利用联网回传的 rankPercent 更新 result.statistics 对象
          stats.rankPercent = liveRank.rankPercent;
          stats.totalUsers = liveRank.totalUsers;
          
          // ✅ 修复：将排名数据注入到 result 中（包括 ranks 对象）
          if (!result.rankData) {
            result.rankData = {};
          }
          result.rankData.rankPercent = liveRank.rankPercent;
          result.rankData.totalUsers = liveRank.totalUsers;
          
          // ✅ 关键修复：注入 ranks 对象（六个排名数据）
          if (liveRank.ranks) {
            result.rankData.ranks = liveRank.ranks;
            console.log('[VibeCodingApp] ✅ ranks 对象已注入:', liveRank.ranks);
          }
          
          // ✅ 【关键修复】合并后端返回的完整数据
          // 注入 analysis 对象（包含 name, description, dimensions, traits）
          if (liveRank.analysis) {
            result.analysis = liveRank.analysis;
            console.log('[VibeCodingApp] ✅ analysis 对象已注入:', liveRank.analysis);
          }
          
          // 注入 semanticFingerprint 对象（语义指纹）
          if (liveRank.semanticFingerprint) {
            result.semanticFingerprint = liveRank.semanticFingerprint;
            console.log('[VibeCodingApp] ✅ semanticFingerprint 对象已注入:', liveRank.semanticFingerprint);
          }
          
          // 注入 stats 对象（完整的统计数据）
          if (liveRank.stats) {
            result.stats = liveRank.stats;
            console.log('[VibeCodingApp] ✅ stats 对象已注入:', liveRank.stats);
          }
          
          // 注入 fingerprint 字符串（语义指纹）
          if (liveRank.fingerprint) {
            result.fingerprint = liveRank.fingerprint;
            console.log('[VibeCodingApp] ✅ fingerprint 已注入:', liveRank.fingerprint);
          }

          // ✅ 【关键修复】同步人格名称和吐槽文案 - 确保预览页面能看到最新的 AI 文案
          if (liveRank.personalityName) {
            result.personalityName = liveRank.personalityName;
          }
          if (liveRank.personalityNameEn) result.personalityNameEn = liveRank.personalityNameEn;
          if (liveRank.personalityNameZh) result.personalityNameZh = liveRank.personalityNameZh;

          // 优先从 answer_book 获取文案，避免由于后端生成延迟导致的「正在破译」
          const backAb = liveRank.personality?.answer_book || liveRank.personality?.answerBook || liveRank.answer_book || liveRank.answerBook;
          const abContent = backAb && (backAb.content != null ? String(backAb.content) : (backAb.text != null ? String(backAb.text) : '')).trim();
          
          if (abContent && !isInvalidPersonalityText(abContent)) {
            result.roastText = abContent;
            console.log('[VibeCodingApp] ✅ 已从 answer_book 填充 roastText');
          } else if (liveRank.roastText || liveRank.roast_text) {
            const rt = String(liveRank.roastText || liveRank.roast_text);
            if (!isInvalidPersonalityText(rt)) {
              result.roastText = rt;
              console.log('[VibeCodingApp] ✅ 已从 liveRank.roastText 填充 roastText');
            }
          }
          if (liveRank.roastTextEn || liveRank.roast_text_en) result.roastTextEn = String(liveRank.roastTextEn || liveRank.roast_text_en);
          if (liveRank.roastTextZh || liveRank.roast_text_zh) result.roastTextZh = String(liveRank.roastTextZh || liveRank.roast_text_zh);
          
          // 【V6 架构修复】优先从 personality.detailedStats 读取数据
          // 数据流向：后端 scoring.ts → rank-content.ts → matchRankLevel → personality.detailedStats
          if (liveRank.personality) {
            result.personality = liveRank.personality;
            console.log('[VibeCodingApp] ✅ personality 对象已注入:', liveRank.personality);
            
            // 【V6 架构】直接从 personality.detailedStats 读取数据
            if (liveRank.personality.detailedStats && Array.isArray(liveRank.personality.detailedStats)) {
              result.detailedStats = liveRank.personality.detailedStats;
              result.personality.detailedStats = liveRank.personality.detailedStats;
              console.log('[VibeCodingApp] ✅ 从 personality.detailedStats 读取数据:', liveRank.personality.detailedStats);
              
              // 【V6 云端维度绑定】在 API 返回后调用 updateV6UI 更新维度 UI
              if (liveRank.personality.detailedStats.length > 0) {
                // 通过 this (VibeCodingApp 实例) 调用 updateV6UI
                if (this && typeof this.updateV6UI === 'function') {
                  this.updateV6UI({ detailedStats: liveRank.personality.detailedStats });
                  console.log('[VibeCodingApp] ✅ 已调用 updateV6UI 更新维度 UI');
                } else {
                  console.warn('[VibeCodingApp] ⚠️ updateV6UI 方法不存在');
                }
              }
            } else {
              console.warn('[VibeCodingApp] ⚠️ personality.detailedStats 不存在或不是数组');
            }
          } else {
            // 降级：尝试从顶层 detailedStats 读取（向后兼容）
            if (liveRank.detailedStats) {
              result.detailedStats = liveRank.detailedStats;
              console.log('[VibeCodingApp] ⚠️ 使用降级路径：从 liveRank.detailedStats 读取数据');
            }
          }
          
          console.log('[VibeCodingApp] 真实排名数据已获取并更新:', {
            rankPercent: liveRank.rankPercent,
            totalUsers: liveRank.totalUsers,
            hasRanks: !!liveRank.ranks,
            hasAnalysis: !!liveRank.analysis,
            hasSemanticFingerprint: !!liveRank.semanticFingerprint,
            hasStats: !!liveRank.stats,
            hasPersonality: !!liveRank.personality,
            hasDetailedStats: !!(liveRank.personality?.detailedStats || liveRank.detailedStats),
            detailedStatsPath: liveRank.personality?.detailedStats ? 'personality.detailedStats' : (liveRank.detailedStats ? 'detailedStats' : 'none')
          });
        } else {
          console.warn('[VibeCodingApp] uploadToSupabase 未返回有效的 rankPercent');
        }
      } catch (uploadError) {
        console.error('[VibeCodingApp] uploadToSupabase 调用失败:', uploadError);
        // 严禁生成随机排名数据，如果上传失败则不显示排名
        if (onProgress) {
          const currentLang = getCurrentLang();
          const errorText = window.i18n?.getText('upload.logs.rankUploadFailed', currentLang) || 
                          (currentLang === 'en' 
                            ? 'Failed to upload ranking data' 
                            : '排名数据上传失败');
          // onProgress 自己会负责格式化日志前缀，这里不要再加 '>'
          onProgress(errorText);
        }
      }
    };

    // 保存结果
    this.vibeResult = result;

    // 【关键修复】缓存最后一次分析数据（供 stats2.html 登录后“静默同步/回填”使用）
    // 说明：stats2.html 会在检测到 GitHub 账号为默认空记录(50分)时尝试读取 last_analysis_data 进行补齐。
    // 这里尽量缓存 /api/v2/analyze 需要的最小字段；若 localStorage 容量不足则退化为仅缓存非 chatData 字段。
    try {
      const safeLang = (context && context.lang) ? String(context.lang) : getCurrentLang();
      const safeFp = (context && context.fingerprint) ? String(context.fingerprint) : (localStorage.getItem('user_fingerprint') || null);
      // 【修复】计算 usageDays 和 earliestFileTime，供 stats2.html 使用（含 Cloudflare/多环境兜底）
      let usageDays = null;
      let earliestFileTime = null;
      if (globalStats && globalStats.earliestFileTime) {
        earliestFileTime = globalStats.earliestFileTime;
        const now = Date.now();
        const diffMs = now - earliestFileTime;
        usageDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
      // 云端/Cloudflare 可能无 earliestFileTime，用后端返回的 work_days 兜底，避免 stats2 显示 N/A
      const fromResult = result?.stats || result?.statistics || {};
      if (usageDays == null) {
        usageDays = fromResult.work_days ?? fromResult.usageDays ?? fromResult.usage_days ?? fromResult.days ?? null;
        if (usageDays != null) usageDays = Math.max(1, Number(usageDays));
      }
      if (earliestFileTime == null && (fromResult.earliestFileTime ?? fromResult.earliest_file_time ?? fromResult.first_chat_at)) {
        const ts = Number(fromResult.earliestFileTime ?? fromResult.earliest_file_time ?? fromResult.first_chat_at);
        if (Number.isFinite(ts) && ts > 0) earliestFileTime = ts;
      }

      const payloadForStats2 = {
        // stats2 会检查 chatData 是否存在；尽量提供，但允许在容量不足时降级
        chatData: chatData,
        lang: safeLang,
        fingerprint: safeFp,
        dimensions: result?.dimensions || null,
        stats: {
          ...(fromResult),
          earliestFileTime: earliestFileTime,
          usageDays: usageDays,
          work_days: usageDays ?? fromResult.work_days ?? null,
          // 供 stats2 右抽屉本国词云兜底：identityLevelCloud 按 Novice/Professional/Architect 分桶
          identityLevelCloud: result.identityLevelCloud || result.statistics?.identityLevelCloud || fromResult.identityLevelCloud || null,
        },
        meta: context || null,
        vibeIndex: result?.vibeIndex || result?.vibe_index || null,
        personalityType: result?.personalityType || result?.personality_type || null,
        // 【新增】保存真实评价所需字段
        personalityName: result?.personalityName || result?.personality_name || null,
        personalityNameZh: result?.personalityNameZh || result?.personality_name_zh || null,
        personalityNameEn: result?.personalityNameEn || result?.personality_name_en || null,
        roastText: result?.roastText || result?.roast_text || null,
        roastTextZh: result?.roastTextZh || result?.roast_text_zh || null,
        roastTextEn: result?.roastTextEn || result?.roast_text_en || null,
        analysis: result?.analysis || null,
      };
      localStorage.setItem('last_analysis_data', JSON.stringify(payloadForStats2));
    } catch (e) {
      try {
        // 降级：避免存不下导致完全没有 last_analysis_data
        const safeLang = (context && context.lang) ? String(context.lang) : getCurrentLang();
        const safeFp = (context && context.fingerprint) ? String(context.fingerprint) : (localStorage.getItem('user_fingerprint') || null);
        // 【修复】降级模式下也保存 earliestFileTime 和 usageDays（含云端 work_days 兜底）
        let usageDaysLite = null;
        let earliestFileTimeLite = null;
        if (globalStats && globalStats.earliestFileTime) {
          earliestFileTimeLite = globalStats.earliestFileTime;
          const now = Date.now();
          const diffMs = now - earliestFileTimeLite;
          usageDaysLite = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
        const fromResultLite = result?.stats || result?.statistics || {};
        if (usageDaysLite == null)
          usageDaysLite = fromResultLite.work_days ?? fromResultLite.usageDays ?? fromResultLite.usage_days ?? fromResultLite.days ?? null;
        if (usageDaysLite != null) usageDaysLite = Math.max(1, Number(usageDaysLite));

        const payloadLite = {
          chatData: null,
          lang: safeLang,
          fingerprint: safeFp,
          dimensions: result?.dimensions || null,
          stats: {
            ...(fromResultLite),
            earliestFileTime: earliestFileTimeLite,
            usageDays: usageDaysLite,
            work_days: usageDaysLite ?? fromResultLite.work_days ?? null,
          },
          meta: context || null,
          vibeIndex: result?.vibeIndex || result?.vibe_index || null,
          personalityType: result?.personalityType || result?.personality_type || null,
          note: 'localStorage_limit_exceeded',
        };
        localStorage.setItem('last_analysis_data', JSON.stringify(payloadLite));
      } catch { /* ignore */ }
    }
    
    // 步骤5: 最后执行 renderReport
    this.renderReport(result);

    // 后台同步（不阻塞返回）
    if (deferGlobalSync) {
      try {
        // 提示文案：用“后台同步”避免让用户以为卡住
        if (typeof onProgress === 'function') {
          const currentLang2 = getCurrentLang();
          const hint = window.i18n?.getText('upload.logs.backgroundSync', currentLang2) ||
            (currentLang2 === 'en' ? 'Background syncing global ranking… (you can continue)' : '后台同步全球排名中…（不影响使用）');
          onProgress(hint);
        }
      } catch { /* ignore */ }
      Promise.resolve()
        .then(() => doGlobalSync())
        .catch((e) => console.warn('[VibeCodingApp] 后台全球同步失败:', e));
    } else {
      await doGlobalSync();
    }
    
    return result;
  }

  /**
   * 处理文件上传并进行分析（同步方法，降级方案）
   * @param {Array} chatData - 聊天数据
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeFileSync(chatData, extraStats = null, onProgress = null, options = {}) {
    if (!this.analyzer) {
      throw new Error('分析器未初始化，请先调用 init()');
    }

    const currentLang = getCurrentLang();
    this.analyzer.setLanguage(currentLang);

    // 【V6 环境感知】生成环境上下文
    const context = await this.generateContext();

    // 【三身份词云】先 await 加载词库，再分析
    const levelKeywords = await loadIdentityLevelKeywords();
    if (levelKeywords) {
      context.levelKeywords = levelKeywords;
      if (this.analyzer && typeof this.analyzer.setLevelKeywords === 'function') {
        this.analyzer.setLevelKeywords(levelKeywords);
      }
    }

    // 步骤1: 调用 analyzeSync 进行本地分析（同步方法，传入 context）
    // 注意：analyzeSync 可能需要适配 context 参数，这里先传入 lang 作为兼容
    const result = await this.analyzer.analyzeSync(chatData, context.lang || currentLang, null, onProgress);
    console.log('[VibeCodingApp] analyzeSync 完成:', result);

    // 【身份词云】同步分析完成：挂载 window.vibeResults 并强制刷新词云（与 Worker 路径一致）
    const ilcSync = result && (result.identityLevelCloud || (result.statistics && result.statistics.identityLevelCloud) || (result.stats && result.stats.identityLevelCloud));
    if (!ilcSync || typeof ilcSync !== 'object') {
      console.warn('[Main] analyzeSync 完成: identityLevelCloud 缺失');
    } else {
      window.vibeResults = normalizeIdentityLevelCloud(ilcSync);
      if (typeof renderIdentityLevelCloud === 'function') {
        renderIdentityLevelCloud('Novice');
      }
      // 【霸天/脱发/新手 强制唯一代表词】与 onAnalyzeComplete 一致：匹配词库取每类最高频一词，无命中则随机
      var levelKwSync = (context && context.levelKeywords) || (typeof window !== 'undefined' && window.__identityLevelKeywords) || null;
      var selectedWordsSync = [];
      if (levelKwSync && levelKwSync.Novice && levelKwSync.Professional && levelKwSync.Architect) {
        var matchSync = pickOneWordPerLevelFromMatch(ilcSync, levelKwSync);
        selectedWordsSync = matchSync.selectedWords;
        if (matchSync.representativeWords && Object.keys(matchSync.representativeWords).length > 0) {
          result.representativeWords = matchSync.representativeWords;
        }
      } else {
        var single = extractSoulWord(result);
        if (single) selectedWordsSync = [single];
      }
      var countrySync = (result && (result.ip_location || result.statistics?.ip_location || result.stats?.ip_location)) ? String(result.ip_location || result.statistics?.ip_location || result.stats?.ip_location || '').trim().toUpperCase() : '';
      if (!countrySync || !/^[A-Za-z]{2}$/.test(countrySync)) countrySync = '';
      if (selectedWordsSync.length > 0) reportSoulWord(selectedWordsSync, countrySync).catch(console.error);
    }

    // 【V6 适配】确保 stats 对象被正确保存
    // 从 result.stats 或 result.statistics 中提取 stats 对象
    if (result && !result.stats) {
      // 如果 result.stats 不存在，从 result.statistics 中构建
      if (result.statistics) {
        result.stats = {
          totalChars: result.statistics.totalChars || result.statistics.totalUserChars || 0,
          totalMessages: result.statistics.totalMessages || result.statistics.userMessages || 0,
          ketao_count: result.statistics.ketao_count || result.statistics.qingCount || 0,
          jiafang_count: result.statistics.jiafang_count || result.statistics.buCount || 0,
          abuse_value: result.statistics.abuse_value || result.statistics.abuseValue || 0, // 【V6 新增】受虐值
          tech_stack: result.statistics.tech_stack || {},
          work_days: result.statistics.work_days || result.statistics.usageDays || 1,
          avg_payload: result.statistics.avg_payload || 0,
          balance_score: result.statistics.balance_score || 0, // 【V6 新增】人格稳定性
          style_label: result.statistics.style_label || '标准型', // 【V6 新增】交互风格标签
          blackword_hits: result.statistics.blackword_hits || {}, // 【V6 新增】黑话命中统计
          identityLevelCloud: result.statistics.identityLevelCloud || result.identityLevelCloud || { Novice: {}, Professional: {}, Architect: {} },
          ...result.statistics // 保留其他字段
        };
      } else {
        // 降级：使用默认值
        result.stats = {
          totalChars: 0,
          totalMessages: 0,
          ketao_count: 0,
          jiafang_count: 0,
          abuse_value: 0,
          tech_stack: {},
          work_days: 1,
          avg_payload: 0,
          balance_score: 0,
          style_label: '标准型',
          blackword_hits: {}
        };
      }
    }
    
    // 【V6 统一映射】使用 AutoMappingEngine 一次性更新所有 UI
    this.updateUIWithStats(result, this.globalStatsCache);

    // ==========================================================
    // 【性能优化】默认改为“先出本地报告，后后台同步全球排名”
    // ==========================================================
    const deferGlobalSync = options?.deferGlobalSync !== false; // 默认 true

    const doGlobalSync = async () => {
      if (!result || !result.statistics) return;
      const stats = result.statistics;
      
      // 将 extraStats 合并到 result.statistics 中，确保字段名与 Work.js 的 findVal 匹配
      // Work.js findVal 期望的字段：
      // - ketao: ['ketao', 'buCount', 'qingCount', 'politeCount']
      // - jiafang: ['jiafang', 'buCount', 'negationCount']
      // - totalChars: ['totalUserChars', 'totalChars', 'total_user_chars']
      // - userMessages: ['userMessages', 'totalMessages', 'user_messages', 'messageCount']
      // - days: ['usageDays', 'days', 'workDays']
      stats.qingCount = extraStats?.qingCount || globalStats?.qingCount || 0; // 对应赛博磕头
      stats.buCount = extraStats?.buCount || globalStats?.buCount || 0;       // 对应甲方上身
      stats.usageDays = extraStats?.usageDays || globalStats?.usageDays || 1; // 对应上岗天数
      
      // 【修复数据一致性】确保发送给后端的 stats 包含真实的 totalChars 和 totalMessages
      // 计算真实的 totalChars 和 totalMessages
      let realTotalChars = 0;
      let realTotalMessages = 0;
      if (chatData && Array.isArray(chatData)) {
        chatData.forEach(item => {
          if (item.role === 'USER' && item.text) {
            realTotalChars += item.text.length;
            realTotalMessages++;
          }
        });
      }
      
      // 确保这俩也有，以匹配 Work.js 的 findVal 查找逻辑
      stats.totalUserChars = realTotalChars || stats.totalUserChars || stats.totalChars || 0;
      stats.totalChars = realTotalChars || stats.totalChars || stats.totalUserChars || 0;
      stats.userMessages = realTotalMessages || stats.userMessages || stats.totalMessages || 0;
      stats.totalMessages = realTotalMessages || stats.totalMessages || stats.userMessages || 0;

      try {
        // 【身份校准】中文用户（zh-CN/zh-TW）一律上报 CN，贡献进入中国区统计
        if (typeof navigator !== 'undefined' && /^zh-(CN|TW)$/i.test(navigator.language)) {
          this.analyzer.countryCode = 'CN';
          this.analyzer.forceCnIdentity = true;
        }
        // 步骤3: 调用 uploadToSupabase 联网获取真实排名（后台执行时不阻塞 UI）
        // 传递完整的 result 对象和 chatData；personality.vibe_lexicon 在 analyzer 内从 result.cloud50 构建
        const liveRank = await this.analyzer.uploadToSupabase(result, chatData, onProgress);
        
        // 【关键修复】统一保存 claim_token，确保后续 GitHub 登录可认领匿名数据
        try {
          if (liveRank?.claim_token) {
            localStorage.setItem('vibe_claim_token', liveRank.claim_token);
          }
        } catch { /* ignore */ }

        // 【修复】后台同步完成后，推送横向排名数据到 index.html 的 UI（同步方法同样适用）
        try {
          if (typeof window !== 'undefined') {
            const totalUsers = Number(liveRank?.totalUsers || result?.rankData?.totalUsers || 0) || 0;
            const ranks = liveRank?.ranks || null;

            const convertPercentToRank = (percent) => {
              if (percent === null || percent === undefined || totalUsers <= 0) return null;
              const p = Number(percent);
              if (Number.isNaN(p)) return null;
              if (p <= 0) return totalUsers;
              const beaten = Math.floor(totalUsers * (p / 100));
              return Math.max(1, totalUsers - beaten);
            };

            if (totalUsers > 0 && ranks) {
              window.userRankings = {
                qingCount: { rank: convertPercentToRank(ranks.ketaoRank), total: totalUsers },
                buCount: { rank: convertPercentToRank(ranks.jiafangRank), total: totalUsers },
                userMessages: { rank: convertPercentToRank(ranks.messageRank), total: totalUsers },
                totalUserChars: { rank: convertPercentToRank(ranks.charRank), total: totalUsers },
                avgUserMessageLength: { rank: convertPercentToRank(ranks.avgRank), total: totalUsers },
                usageDays: { rank: convertPercentToRank(ranks.daysRank), total: totalUsers },
              };

              if (typeof window.updateRankingBadges === 'function') {
                const lang = localStorage.getItem('appLanguage') || 'zh-CN';
                Promise.resolve(window.updateRankingBadges(window.userRankings, lang))
                  .catch(() => {});
              }
              try {
                window.dispatchEvent(new CustomEvent('userRankingsUpdated', { detail: window.userRankings }));
              } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
        
          // 如果后端返回了 globalAverage，更新全局变量
          if (liveRank && liveRank.globalAverage) {
            const avg = liveRank.globalAverage;
            const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
            if (!isDefaultValue) {
              globalAverageData = avg;
              globalAverageDataLoaded = true;
              console.log('[VibeCodingApp] ✅ 从 uploadToSupabase 获取到全局平均值（同步方法）:', globalAverageData);
            } else {
              console.warn('[VibeCodingApp] ⚠️ uploadToSupabase 返回的全局平均值是默认值（同步方法），忽略');
            }
          }
        
        // 步骤4: 必须拿到 rankPercent 后，再更新结果
        if (liveRank && liveRank.rankPercent !== undefined) {
          // 利用联网回传的 rankPercent 更新 result.statistics 对象
          stats.rankPercent = liveRank.rankPercent;
          stats.totalUsers = liveRank.totalUsers;
          
          // ✅ 修复：将排名数据注入到 result 中（包括 ranks 对象）
          if (!result.rankData) {
            result.rankData = {};
          }
          result.rankData.rankPercent = liveRank.rankPercent;
          result.rankData.totalUsers = liveRank.totalUsers;
          
          // ✅ 关键修复：注入 ranks 对象（六个排名数据）
          if (liveRank.ranks) {
            result.rankData.ranks = liveRank.ranks;
            console.log('[VibeCodingApp] ✅ ranks 对象已注入（同步方法）:', liveRank.ranks);
          }
          
          // 【关键修复】注入 personality 对象和 detailedStats 数组（包含每个维度的称号和吐槽文案）
          if (liveRank.personality) {
            result.personality = liveRank.personality;
            console.log('[VibeCodingApp] ✅ personality 对象已注入（同步方法）:', liveRank.personality);
          }
          if (liveRank.detailedStats) {
            result.detailedStats = liveRank.detailedStats;
            console.log('[VibeCodingApp] ✅ detailedStats 数组已注入（同步方法）:', liveRank.detailedStats);
          }
          
          // 【V6 架构修复】优先从 personality.detailedStats 读取数据
          // 数据流向：后端 scoring.ts → rank-content.ts → matchRankLevel → personality.detailedStats
          if (liveRank.personality?.detailedStats && Array.isArray(liveRank.personality.detailedStats)) {
            vibeResult.detailedStats = liveRank.personality.detailedStats;
            vibeResult.personality = vibeResult.personality || {};
            vibeResult.personality.detailedStats = liveRank.personality.detailedStats;
            console.log('[VibeCodingApp] ✅ 从 personality.detailedStats 读取数据（同步方法）:', liveRank.personality.detailedStats);
            
            // 【V6 云端维度绑定】在 API 返回后调用 updateV6UI 更新维度 UI
            if (liveRank.personality.detailedStats.length > 0) {
              // 通过 vibeCodingApp 实例调用 updateV6UI
              if (vibeCodingApp && typeof vibeCodingApp.updateV6UI === 'function') {
                vibeCodingApp.updateV6UI({ detailedStats: liveRank.personality.detailedStats });
                console.log('[VibeCodingApp] ✅ 已调用 updateV6UI 更新维度 UI（同步方法）');
              } else {
                console.warn('[VibeCodingApp] ⚠️ vibeCodingApp 或 updateV6UI 方法不存在（同步方法）');
              }
            }
          } else {
            console.warn('[VibeCodingApp] ⚠️ personality.detailedStats 不存在或不是数组（同步方法）');
          }
          
          console.log('[VibeCodingApp] 真实排名数据已获取并更新（同步方法）:', {
            rankPercent: liveRank.rankPercent,
            totalUsers: liveRank.totalUsers,
            hasRanks: !!liveRank.ranks,
            hasPersonality: !!liveRank.personality,
            hasDetailedStats: !!(liveRank.personality?.detailedStats || liveRank.detailedStats),
            detailedStatsPath: liveRank.personality?.detailedStats ? 'personality.detailedStats' : (liveRank.detailedStats ? 'detailedStats' : 'none')
          });
        } else {
          console.warn('[VibeCodingApp] uploadToSupabase 未返回有效的 rankPercent（同步方法）');
        }
      } catch (uploadError) {
        console.error('[VibeCodingApp] uploadToSupabase 调用失败（同步方法）:', uploadError);
        // 严禁生成随机排名数据，如果上传失败则不显示排名
        if (onProgress) {
          const currentLang = getCurrentLang();
          const errorText = window.i18n?.getText('upload.logs.rankUploadFailed', currentLang) || 
                          (currentLang === 'en' 
                            ? 'Failed to upload ranking data' 
                            : '排名数据上传失败');
          onProgress(errorText);
        }
      }
    };

    // 保存结果
    this.vibeResult = result;

    // 【关键修复】缓存最后一次分析数据（同步方法同样写入，供 stats2.html 回填；含 usageDays/work_days 供 Cloudflare 显示上岗天数）
    try {
      const safeLang = (context && context.lang) ? String(context.lang) : getCurrentLang();
      const safeFp = (context && context.fingerprint) ? String(context.fingerprint) : (localStorage.getItem('user_fingerprint') || null);
      const st = result?.stats || result?.statistics || {};
      const usageDaysSync = st.work_days ?? st.usageDays ?? st.usage_days ?? st.days ?? null;
      const payloadForStats2 = {
        chatData: chatData,
        lang: safeLang,
        fingerprint: safeFp,
        dimensions: result?.dimensions || null,
        stats: {
          ...(st),
          usageDays: usageDaysSync != null ? Math.max(1, Number(usageDaysSync)) : null,
          work_days: usageDaysSync != null ? Math.max(1, Number(usageDaysSync)) : (st.work_days ?? null),
        },
        meta: context || null,
        vibeIndex: result?.vibeIndex || result?.vibe_index || null,
        personalityType: result?.personalityType || result?.personality_type || null,
      };
      localStorage.setItem('last_analysis_data', JSON.stringify(payloadForStats2));
    } catch (e) {
      try {
        const safeLang = (context && context.lang) ? String(context.lang) : getCurrentLang();
        const safeFp = (context && context.fingerprint) ? String(context.fingerprint) : (localStorage.getItem('user_fingerprint') || null);
        const fromResultLite2 = result?.stats || result?.statistics || {};
        let usageDaysLite2 = fromResultLite2.work_days ?? fromResultLite2.usageDays ?? fromResultLite2.usage_days ?? fromResultLite2.days ?? null;
        if (usageDaysLite2 != null) usageDaysLite2 = Math.max(1, Number(usageDaysLite2));
        const payloadLite = {
          chatData: null,
          lang: safeLang,
          fingerprint: safeFp,
          dimensions: result?.dimensions || null,
          stats: {
            ...(fromResultLite2),
            usageDays: usageDaysLite2,
            work_days: usageDaysLite2 ?? fromResultLite2.work_days ?? null,
          },
          meta: context || null,
          vibeIndex: result?.vibeIndex || result?.vibe_index || null,
          personalityType: result?.personalityType || result?.personality_type || null,
          note: 'localStorage_limit_exceeded',
        };
        localStorage.setItem('last_analysis_data', JSON.stringify(payloadLite));
      } catch { /* ignore */ }
    }
    
    // 步骤5: 最后执行 renderReport
    this.renderReport(result);

    if (deferGlobalSync) {
      try {
        if (typeof onProgress === 'function') {
          const currentLang2 = getCurrentLang();
          const hint = window.i18n?.getText('upload.logs.backgroundSync', currentLang2) ||
            (currentLang2 === 'en' ? 'Background syncing global ranking… (you can continue)' : '后台同步全球排名中…（不影响使用）');
          onProgress(hint);
        }
      } catch { /* ignore */ }
      Promise.resolve()
        .then(() => doGlobalSync())
        .catch((e) => console.warn('[VibeCodingApp] 后台全球同步失败（同步方法）:', e));
    } else {
      await doGlobalSync();
    }
    
    return result;
  }

  /**
   * 渲染报告
   * @param {Object} result - 分析结果
   */
  renderReport(result) {
    if (!result) {
      console.warn('[VibeCodingApp] 没有结果可渲染');
      return;
    }

    // 更新全局变量（保持向后兼容）
    vibeResult = result;
    
    // 调用现有的渲染函数
    if (document.getElementById('vibeCodingerSection')) {
      displayVibeCodingerAnalysis();
    }
    
    console.log('[VibeCodingApp] 报告渲染完成');
  }
}

// 全局变量
let parser = null;
let allChatData = [];
let globalStats = null;
let vibeAnalyzer = null;
let vibeResult = null;
/** 【三身份级别词云】当前选中的层级（Novice/Professional/Architect） */
let selectedIdentityLevel = 'Novice';
// 仅在此处初始化，后续仅由 onAnalyzeComplete / renderFullDashboard 赋值，禁止别处写 null 覆盖
if (typeof window !== 'undefined') window.vibeResults = null;
let globalAverageData = { L: 50, P: 50, D: 50, E: 50, F: 50 }; // 存储从后端获取的全局平均值，默认值作为保底
let globalAverageDataLoaded = false; // 标记是否已从 API 成功加载数据
let globalAverageDataLoading = false; // 标记是否正在加载数据（防止重复请求）

// 创建全局 VibeCodingApp 实例
let vibeCodingApp = null;

// 获取当前语言的辅助函数
function getCurrentLang() {
  const savedLang = localStorage.getItem('appLanguage');
  return savedLang === 'en' ? 'en' : 'zh-CN';
}

// i18n 辅助函数
function t(key) {
  if (window.i18n && window.i18n.getText) {
    return window.i18n.getText(key, getCurrentLang());
  }
  return key;
}

// 导出供 React 使用的函数和变量
export const getGlobalStats = () => globalStats;
export const getAllChatData = () => allChatData;
export const getVibeResult = () => vibeResult;
export const getParser = () => parser;
export const getVibeAnalyzer = () => vibeAnalyzer;

// 设置函数（用于分享模式）
export const setGlobalStats = (stats) => {
  if (stats) {
    globalStats = stats;
    console.log('[Main] 已设置分享模式的统计数据:', globalStats);
  }
};

/**
 * 设置全局 vibeResult。兼容三身份词云与预览/排名：
 * - 若新 result 无 rankData 而当前已有 rankData，只合并 identityLevelCloud/词云相关，保留排名与人格文案
 * - 否则整体替换
 */
export const setVibeResult = (result) => {
  if (!result) return;
  var hasNewRank = !!(result.rankData || (result.statistics && result.statistics.rankPercent != null));
  var hasCurrentRank = !!(vibeResult && (vibeResult.rankData || (vibeResult.statistics && vibeResult.statistics.rankPercent != null)));
  if (!hasNewRank && hasCurrentRank) {
    var ilc = result.identityLevelCloud || result.statistics?.identityLevelCloud || result.stats?.identityLevelCloud;
    if (ilc && typeof ilc === 'object') {
      vibeResult.identityLevelCloud = ilc;
      if (vibeResult.statistics) vibeResult.statistics.identityLevelCloud = ilc;
      if (vibeResult.stats) vibeResult.stats.identityLevelCloud = ilc;
      window.vibeResults = normalizeIdentityLevelCloud(ilc);
      console.log('[Main] 已合并 identityLevelCloud，保留原有 rankData/人格文案');
      return;
    }
  }
  vibeResult = result;
  if (result && (result.identityLevelCloud || result.statistics?.identityLevelCloud || result.stats?.identityLevelCloud)) {
    var ilc = result.identityLevelCloud || result.statistics?.identityLevelCloud || result.stats?.identityLevelCloud;
    window.vibeResults = normalizeIdentityLevelCloud(ilc);
  }
  console.log('[Main] 已设置 Vibe 结果:', { hasRankData: !!result.rankData, hasIdentityCloud: !!(result.identityLevelCloud || result.statistics?.identityLevelCloud) });
};

export const setAllChatData = (data) => {
  if (data && Array.isArray(data)) {
    allChatData = data;
    console.log('[Main] 已设置分享模式的聊天数据:', allChatData.length, '条');
  }
};
// 注意：updateNumberWithAnimation, formatNumber, fetchTotalTestUsers, reportNewUser, updateGlobalStats 
// ========== 性能优化：全局常量定义（避免重复创建） ==========

// 中文停用词 - 全局缓存
const GLOBAL_CHINESE_STOP_WORDS = new Set([
  '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
  '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
  '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个', '哪个',
  '吗', '呢', '吧', '啊', '哦', '嗯', '哈', '嘿', '好',
]);

// 英文停用词 - 全局缓存
const GLOBAL_ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'into',
  'i', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
  'my', 'his', 'her', 'its', 'our', 'your', 'their',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'please', 'help', 'write', 'one', 'some', 'any', 'all', 'both',
  'how', 'what', 'which', 'who', 'when', 'where', 'why',
  'yes', 'no', 'not', 'just', 'only', 'also', 'too', 'very', 'really',
  'okay', 'ok', 'right', 'left', 'up', 'down', 'back', 'front',
]);

// 通用停用词（extractWordsFromText 使用）
const GLOBAL_STOP_WORDS = new Set([
  // 中文停用词
  '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
  '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
  '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个', '哪个',
  '吗', '呢', '吧', '啊', '哦', '嗯', '哈', '嘿', '好',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'i', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
  'my', 'his', 'her', 'its', 'our', 'your', 'their', 'mine', 'theirs',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'please', 'help', 'write', 'a', 'one', 'some', 'any', 'all', 'both',
  'how', 'what', 'which', 'who', 'when', 'where', 'why', 'whether',
  'yes', 'no', 'not', 'just', 'only', 'also', 'too', 'very', 'really',
  'okay', 'ok', 'right', 'left', 'up', 'down', 'back', 'front', 'forward',
]);

// 代码特征正则表达式 - 全局缓存
const CODE_PATTERNS = [
  /\b(function|class|const|let|var|if|else|for|while|do|switch|case|break|continue|return|import|export|from|async|await|yield|try|catch|finally|throw|new|this)\b/i,
  /\b(public|private|protected|static|final|abstract|interface|extends|implements|super)\b/i,
  /\b(def |class |import |from |if |elif |else |for |while |try |except |finally |return |yield |with |as |lambda |pass |break |continue )/,
];

// 代码关键字 - 全局缓存
const CODE_KEYWORDS = ['def ', 'def\n', 'func ', 'func\n', 'fn ', '#include', 'import ', '#define', '@', 'defclass ', 'class '];

// 调试模式开关（生产环境可关闭）
const DEBUG_MODE = false;

// 性能日志节流计数器
let perfLogCounter = 0;

// 在文件后面定义，将在定义时直接导出

// 导出处理函数（需要先初始化）
export const processFiles = async (files, type, callbacks) => {
  console.log('[Main] processFiles 被调用', { filesCount: files.length, type });
  
  // 确保解析器已初始化
  if (!parser) {
    console.log('[Main] 解析器未初始化，正在初始化...');
    parser = new CursorParser();
    await parser.init();
    vibeAnalyzer = createVibeCodingerAnalyzer();
    console.log('[Main] 解析器初始化完成');
  }
  
  // 创建一个模拟的 event 对象
  const mockEvent = {
    target: { files: files, value: '' }
  };
  
  try {
    return await handleFileUpload(mockEvent, type, callbacks);
  } catch (error) {
    console.error('[Main] processFiles 错误:', error);
    if (callbacks?.onError) {
      callbacks.onError(error);
    }
    throw error;
  }
};

// 导出重新分析函数（用于语言切换）
export const reanalyzeWithLanguage = async (lang) => {
  if (!vibeAnalyzer || !allChatData || allChatData.length === 0) {
    console.warn('[Main] 无法重新分析：缺少数据或分析器');
    return null;
  }
  
  console.log('[Main] 使用新语言重新分析:', lang);
  
  // 设置分析器语言
  vibeAnalyzer.setLanguage(lang);
  
  try {
    // 计算使用天数
    let usageDays = 1;
    if (globalStats && globalStats.earliestFileTime) {
      const now = Date.now();
      const earliest = globalStats.earliestFileTime;
      const diffMs = now - earliest;
      usageDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
    
    // 【修复】生成 context 对象，而不是直接传递 lang 字符串
    const context = vibeCodingApp ? await vibeCodingApp.generateContext() : {
      ip: '0.0.0.0',
      lang: lang,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      fingerprint: null,
      isVpn: false,
      isProxy: false
    };
    // 确保 lang 正确设置
    context.lang = lang;
    
    // 重新分析（本地计算，不联网）
    vibeResult = await vibeAnalyzer.analyze(allChatData, context, null);
    console.log('[Main] 重新分析完成');
    
    // 立即 await 调用 uploadToSupabase 获取真实排名
    if (vibeResult && vibeResult.statistics) {
      // 将额外统计数据合并到 vibeResult.statistics 中
      vibeResult.statistics.qingCount = globalStats?.qingCount || 0;
      vibeResult.statistics.buCount = globalStats?.buCount || 0;
      vibeResult.statistics.usageDays = usageDays;
      
      try {
        // 【身份校准】中文用户（zh-CN/zh-TW）一律上报 CN，贡献进入中国区统计
        if (typeof navigator !== 'undefined' && /^zh-(CN|TW)$/i.test(navigator.language)) {
          vibeAnalyzer.countryCode = 'CN';
          vibeAnalyzer.forceCnIdentity = true;
        }
        // 传递完整的 vibeResult 对象和 allChatData；personality.vibe_lexicon 在 analyzer 内从 result.cloud50 构建
        const liveRank = await vibeAnalyzer.uploadToSupabase(vibeResult, allChatData);
        
        // 【关键修复】保存 claim_token，避免“本地数据无法与 GitHub 认领匹配”
        try {
          if (liveRank?.claim_token) {
            localStorage.setItem('vibe_claim_token', liveRank.claim_token);
          }
        } catch { /* ignore */ }
        
        // 如果后端返回了 globalAverage，更新全局变量
        if (liveRank && liveRank.globalAverage) {
          const avg = liveRank.globalAverage;
          const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
          if (!isDefaultValue) {
            globalAverageData = avg;
            globalAverageDataLoaded = true;
            console.log('[Main] ✅ 从 uploadToSupabase 获取到全局平均值:', globalAverageData);
          } else {
            console.warn('[Main] ⚠️ uploadToSupabase 返回的全局平均值是默认值，忽略');
          }
        }
        
        // 必须拿到 rankPercent 后，再更新结果
        if (liveRank && liveRank.rankPercent !== undefined) {
          vibeResult.statistics.rankPercent = liveRank.rankPercent;
          vibeResult.statistics.totalUsers = liveRank.totalUsers;
          
          if (!vibeResult.rankData) {
            vibeResult.rankData = {};
          }
          vibeResult.rankData.rankPercent = liveRank.rankPercent;
          vibeResult.rankData.totalUsers = liveRank.totalUsers;
          
          // ✅ 关键修复：注入 ranks 对象（六个排名数据）
          if (liveRank.ranks) {
            vibeResult.rankData.ranks = liveRank.ranks;
            console.log('[Main] ✅ ranks 对象已注入:', liveRank.ranks);
          }
          
          // 【V6 架构修复】优先从 personality.detailedStats 读取数据
          // 数据流向：后端 scoring.ts → rank-content.ts → matchRankLevel → personality.detailedStats
          if (liveRank.personality) {
            vibeResult.personality = liveRank.personality;
            console.log('[Main] ✅ personality 对象已注入:', liveRank.personality);
            
            // 【人格预览】优先用 answer_book.content 作为主文案，否则用后端 roast_text，避免卡在「正在破译」
            const backAb = liveRank.personality?.answer_book || liveRank.personality?.answerBook || liveRank.answer_book || liveRank.answerBook;
            const abContent = backAb && (backAb.content != null ? String(backAb.content) : (backAb.text != null ? String(backAb.text) : '')).trim();
            
            if (abContent && !isInvalidPersonalityText(abContent)) {
              vibeResult.roastText = abContent;
              console.log('[Main] ✅ 已从 answer_book 填充 roastText');
            } else if (liveRank.roastText || liveRank.roast_text) {
              const rt = String(liveRank.roastText || liveRank.roast_text);
              if (!isInvalidPersonalityText(rt)) {
                vibeResult.roastText = rt;
                console.log('[Main] ✅ 已从 liveRank.roastText 填充 roastText');
              }
            }

            // 【关键修复】同步人格名称 - 确保预览页面能看到翻译后的名称
            if (liveRank.personalityName) vibeResult.personalityName = liveRank.personalityName;
            if (liveRank.personalityNameEn) vibeResult.personalityNameEn = liveRank.personalityNameEn;
            if (liveRank.personalityNameZh) vibeResult.personalityNameZh = liveRank.personalityNameZh;
            if (liveRank.roastTextEn || liveRank.roast_text_en) vibeResult.roastTextEn = String(liveRank.roastTextEn || liveRank.roast_text_en);
            if (liveRank.roastTextZh || liveRank.roast_text_zh) vibeResult.roastTextZh = String(liveRank.roastTextZh || liveRank.roast_text_zh);
            
            // 【V6 架构】直接从 personality.detailedStats 读取数据
            if (liveRank.personality.detailedStats && Array.isArray(liveRank.personality.detailedStats)) {
              vibeResult.detailedStats = liveRank.personality.detailedStats;
              vibeResult.personality.detailedStats = liveRank.personality.detailedStats;
              console.log('[Main] ✅ 从 personality.detailedStats 读取数据:', liveRank.personality.detailedStats);
              
              // 【V6 云端维度绑定】在 API 返回后调用 updateV6UI 更新维度 UI
              if (liveRank.personality.detailedStats.length > 0) {
                // 通过 vibeCodingApp 实例调用 updateV6UI
                if (vibeCodingApp && typeof vibeCodingApp.updateV6UI === 'function') {
                  vibeCodingApp.updateV6UI({ detailedStats: liveRank.personality.detailedStats });
                  console.log('[Main] ✅ 已调用 updateV6UI 更新维度 UI');
                } else {
                  console.warn('[Main] ⚠️ vibeCodingApp 或 updateV6UI 方法不存在');
                }
              }
            } else {
              console.warn('[Main] ⚠️ personality.detailedStats 不存在或不是数组');
            }
          } else {
            // 降级：尝试从顶层 detailedStats 读取（向后兼容）
            if (liveRank.detailedStats) {
              vibeResult.detailedStats = liveRank.detailedStats;
              console.log('[Main] ⚠️ 使用降级路径：从 liveRank.detailedStats 读取数据');
            }
          }
          
          console.log('[Main] 真实排名数据已获取并覆盖:', {
            rankPercent: liveRank.rankPercent,
            totalUsers: liveRank.totalUsers,
            hasRanks: !!liveRank.ranks,
            hasPersonality: !!liveRank.personality,
            hasDetailedStats: !!(liveRank.personality?.detailedStats || liveRank.detailedStats),
            detailedStatsPath: liveRank.personality?.detailedStats ? 'personality.detailedStats' : (liveRank.detailedStats ? 'detailedStats' : 'none')
          });
        }
      } catch (uploadError) {
        console.error('[Main] uploadToSupabase 调用失败:', uploadError);
        // 严禁生成随机排名数据，如果上传失败则不显示排名
      }
    }
    
    // 重新渲染
    if (document.getElementById('vibeCodingerSection')) {
      displayVibeCodingerAnalysis();
    }
    
    return vibeResult;
  } catch (error) {
    console.warn('[Main] 异步分析失败，使用同步方法:', error);
    
    // 计算使用天数
    let usageDays = 1;
    if (globalStats && globalStats.earliestFileTime) {
      const now = Date.now();
      const earliest = globalStats.earliestFileTime;
      const diffMs = now - earliest;
      usageDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
    
    // 【修复】生成 context 对象，而不是直接传递 lang 字符串
    const contextSync = vibeCodingApp ? await vibeCodingApp.generateContext() : {
      ip: '0.0.0.0',
      lang: lang,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      fingerprint: null,
      isVpn: false,
      isProxy: false
    };
    // 确保 lang 正确设置
    contextSync.lang = lang;
    
    // 重新分析（本地计算，不联网）
    vibeResult = await vibeAnalyzer.analyzeSync(allChatData, contextSync.lang || lang, null);
    
    // 立即 await 调用 uploadToSupabase 获取真实排名
    if (vibeResult && vibeResult.statistics) {
      // 将额外统计数据合并到 vibeResult.statistics 中
      vibeResult.statistics.qingCount = globalStats?.qingCount || 0;
      vibeResult.statistics.buCount = globalStats?.buCount || 0;
      vibeResult.statistics.usageDays = usageDays;
      
      try {
        // 【身份校准】中文用户（zh-CN/zh-TW）一律上报 CN，贡献进入中国区统计
        if (typeof navigator !== 'undefined' && /^zh-(CN|TW)$/i.test(navigator.language)) {
          vibeAnalyzer.countryCode = 'CN';
          vibeAnalyzer.forceCnIdentity = true;
        }
        // 传递完整的 vibeResult 对象和 allChatData；personality.vibe_lexicon 在 analyzer 内从 result.cloud50 构建
        const liveRank = await vibeAnalyzer.uploadToSupabase(vibeResult, allChatData);
        
        // 【关键修复】保存 claim_token，避免“本地数据无法与 GitHub 认领匹配”
        try {
          if (liveRank?.claim_token) {
            localStorage.setItem('vibe_claim_token', liveRank.claim_token);
          }
        } catch { /* ignore */ }
        
        // 如果后端返回了 globalAverage，更新全局变量
        if (liveRank && liveRank.globalAverage) {
          const avg = liveRank.globalAverage;
          const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
          if (!isDefaultValue) {
            globalAverageData = avg;
            globalAverageDataLoaded = true;
            console.log('[Main] ✅ 从 uploadToSupabase 获取到全局平均值（同步方法）:', globalAverageData);
          } else {
            console.warn('[Main] ⚠️ uploadToSupabase 返回的全局平均值是默认值（同步方法），忽略');
          }
        }
        
        // 必须拿到 rankPercent 后，再更新结果
        if (liveRank && liveRank.rankPercent !== undefined) {
          vibeResult.statistics.rankPercent = liveRank.rankPercent;
          vibeResult.statistics.totalUsers = liveRank.totalUsers;
          
          if (!vibeResult.rankData) {
            vibeResult.rankData = {};
          }
          vibeResult.rankData.rankPercent = liveRank.rankPercent;
          vibeResult.rankData.totalUsers = liveRank.totalUsers;
          
          // ✅ 关键修复：注入 ranks 对象（六个排名数据）
          if (liveRank.ranks) {
            vibeResult.rankData.ranks = liveRank.ranks;
            console.log('[Main] ✅ ranks 对象已注入（同步方法）:', liveRank.ranks);
          }
          
          console.log('[Main] 真实排名数据已获取并覆盖（同步方法）:', {
            rankPercent: liveRank.rankPercent,
            totalUsers: liveRank.totalUsers,
            hasRanks: !!liveRank.ranks
          });
        }
      } catch (uploadError) {
        console.error('[Main] uploadToSupabase 调用失败（同步方法）:', uploadError);
        // 严禁生成随机排名数据，如果上传失败则不显示排名
      }
    }
    
    if (document.getElementById('vibeCodingerSection')) {
      displayVibeCodingerAnalysis();
    }
    return vibeResult;
  }
};

// 导出渲染函数
export const renderFullDashboard = async (passedVibeResult) => {
  // 如果没有传入参数，使用全局变量（向后兼容）
  let currentVibeResult = passedVibeResult || window.vibeResult || globalThis.vibeResult;
  // 【三身份词云兼容】若传入结果无 rankData 但全局已有，只合并词云数据，不覆盖排名/人格
  if (currentVibeResult && !currentVibeResult.rankData && vibeResult && vibeResult.rankData) {
    var ilc = currentVibeResult.identityLevelCloud || currentVibeResult.statistics?.identityLevelCloud || currentVibeResult.stats?.identityLevelCloud;
    if (ilc && typeof ilc === 'object') {
      vibeResult.identityLevelCloud = ilc;
      if (vibeResult.statistics) vibeResult.statistics.identityLevelCloud = ilc;
      if (vibeResult.stats) vibeResult.stats.identityLevelCloud = ilc;
      window.vibeResults = normalizeIdentityLevelCloud(ilc);
      currentVibeResult = vibeResult;
    }
  }
  if (currentVibeResult) {
    window.vibeResult = currentVibeResult;
    vibeResult = currentVibeResult;
    // 【三身份级别词云】一次计算，三路输出，供按钮切换
    const ilc = currentVibeResult?.identityLevelCloud || currentVibeResult?.statistics?.identityLevelCloud || currentVibeResult?.stats?.identityLevelCloud;
    var ilcLen = function (arr) { return Array.isArray(arr) ? arr.length : (arr && typeof arr === 'object' ? Object.keys(arr).length : 0); };
    console.log('[Main] identityLevelCloud 数据:', {
      hasIlc: !!ilc,
      noviceKeys: ilc ? ilcLen(ilc.Novice) : 0,
      professionalKeys: ilc ? ilcLen(ilc.Professional) : 0,
      architectKeys: ilc ? ilcLen(ilc.Architect) : 0,
      nativeKeys: ilc && Array.isArray(ilc.native) ? ilc.native.length : 0
    });
    if (ilc && typeof ilc === 'object') {
      window.vibeResults = normalizeIdentityLevelCloud(ilc);
      console.log('[Main] vibeResults 已生成:', {
        Novice: window.vibeResults.Novice.length,
        Professional: window.vibeResults.Professional.length,
        Architect: window.vibeResults.Architect.length,
        native: window.vibeResults.native ? window.vibeResults.native.length : 0
      });
      renderIdentityLevelCloud(selectedIdentityLevel || 'Novice');
    } else {
      console.warn('[Main] identityLevelCloud 数据不存在，词云将无法渲染');
    }
    console.log('[Main] ✅ 已更新全局 vibeResult:', {
      hasPersonalityName: !!currentVibeResult.personalityName,
      hasRoastText: !!currentVibeResult.roastText,
      hasDimensions: !!currentVibeResult.dimensions,
      hasAnalysis: !!currentVibeResult.analysis,
      hasSemanticFingerprint: !!currentVibeResult.semanticFingerprint,
      dimensionsKeys: currentVibeResult.dimensions ? Object.keys(currentVibeResult.dimensions) : null
    });
  }
  
  console.log('[Main] renderFullDashboard 被调用');
  console.log('[Main] 数据状态:', {
    hasGlobalStats: !!globalStats,
    hasVibeResult: !!currentVibeResult,
    chatDataLength: allChatData.length
  });
  
  // 重新获取 DOM 元素引用（因为 React 动态创建了新的 DOM）
  updateElementReferences();
  
  if (globalStats) {
    console.log('[Main] 调用 displayStats...');
    displayStats();
  }
  if (currentVibeResult) {
    console.log('[Main] 调用 displayVibeCodingerAnalysis...');
    displayVibeCodingerAnalysis();
    // 显示实时统计和维度排行榜
    // 使用 try-catch 确保即使 displayRealtimeStats 失败，也不影响后续的 displayDimensionRanking
    try {
      // 把 vibeResult 传给它！
      await displayRealtimeStats(currentVibeResult);
    } catch (error) {
      console.error('[Main] 统计上传失败:', error);
    }
    // 确保 displayDimensionRanking 能够继续执行
    try {
      displayDimensionRanking();
    } catch (error) {
      console.error('[Main] displayDimensionRanking 调用失败:', error);
    }
  }
  if (allChatData.length > 0) {
    console.log('[Main] 渲染对话列表...');
    currentPage = 1;
    renderChatList(allChatData);
  }
  console.log('[Main] 渲染词云...');
  renderWordClouds();
  bindIdentityLevelTabs();
  console.log('[Main] renderFullDashboard 完成');
};

// 更新元素引用（用于 React 动态创建的 DOM）
function updateElementReferences() {
  console.log('[Main] 更新元素引用...');
  
  // 更新统计元素
  statsElements.totalConversations = document.getElementById('totalConversations');
  statsElements.userMessages = document.getElementById('userMessages');
  statsElements.qingCount = document.getElementById('qingCount');
  statsElements.buCount = document.getElementById('buCount');
  statsElements.totalUserChars = document.getElementById('totalUserChars');
  statsElements.avgUserMessageLength = document.getElementById('avgUserMessageLength');
  statsElements.questionMessageCount = document.getElementById('questionMessageCount');
  statsElements.topChineseWordsList = document.getElementById('topChineseWordsList');
  
  // 更新其他元素
  elements.searchInput = document.getElementById('searchInput');
  elements.chatList = document.getElementById('chatList');
  elements.paginationContainer = document.getElementById('paginationContainer');
  elements.paginationInfo = document.getElementById('paginationInfo');
  elements.paginationPages = document.getElementById('paginationPages');
  elements.paginationPrev = document.getElementById('paginationPrev');
  elements.paginationNext = document.getElementById('paginationNext');
  elements.exportBtn = document.getElementById('exportBtn');
  
  console.log('[Main] 元素引用更新完成:', {
    totalConversations: !!statsElements.totalConversations,
    userMessages: !!statsElements.userMessages,
    qingCount: !!statsElements.qingCount,
    buCount: !!statsElements.buCount,
    chatList: !!elements.chatList
  });
  
  // 【修复】重新绑定搜索框事件监听器
  // 当 DOM 被重新创建（如语言切换）时，需要重新绑定事件
  if (elements.searchInput) {
    // 移除可能存在的旧事件监听器（通过克隆节点）
    const oldSearchInput = elements.searchInput;
    const newSearchInput = oldSearchInput.cloneNode(true);
    oldSearchInput.parentNode.replaceChild(newSearchInput, oldSearchInput);
    elements.searchInput = newSearchInput;
    
    // 绑定新的事件监听器
    const searchHandler = debounce(handleSearch, 300);
    elements.searchInput.addEventListener('input', searchHandler);
    console.log('[Main] ✅ 搜索框事件已重新绑定');
  } else {
    console.warn('[Main] ⚠️ searchInput 元素未找到，无法绑定事件');
  }
  
  // 【修复】重新绑定分页器事件
  if (elements.paginationPrev) {
    elements.paginationPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderChatList(filteredChatData);
      }
    });
  }
  
  if (elements.paginationNext) {
    elements.paginationNext.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredChatData.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderChatList(filteredChatData);
      }
    });
  }
}
/**
 * 上传统计数据到 Worker 并获取排名
 * @param {Object} stats - 统计数据对象
 * @param {number} stats.qingCount - 情绪词数
 * @param {number} stats.buCount - 逻辑词数
 * @param {number} stats.totalMessages - 总消息数
 * @param {number} stats.totalChars - 总字符数
 * @param {number} stats.avgMessageLength - 平均消息长度
 * @param {number} stats.usageDays - 使用天数
 * @param {Function} onProgress - 进度回调函数，用于显示加载提示
 * @returns {Promise<Object>} 返回包含 rankPercent 和 totalUsers 的对象
 */
async function uploadStatsToWorker(stats, onProgress = null) {
  try {
    // 显示加载提示
    if (onProgress) {
      const currentLang = getCurrentLang();
      const loadingText = currentLang === 'en' 
        ? 'Connecting to database, syncing global ranking...'
        : '正在连接数据库，同步全球排名...';
      onProgress(loadingText);
    }

    // 获取 API 端点（从 meta 标签动态获取）
    const metaApi = document.querySelector('meta[name="api-endpoint"]');
    if (!metaApi || !metaApi.content) {
      throw new Error('API endpoint not found in meta tag');
    }
    const apiEndpoint = metaApi.content.trim();
    
    // 确保 endpoint 以 / 结尾
    const normalizedEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint : apiEndpoint + '/';
    
    console.log('[Main] 上传统计数据到 Worker:', {
      endpoint: normalizedEndpoint,
      stats: {
        qingCount: stats.qingCount || 0,
        buCount: stats.buCount || 0,
        totalMessages: stats.totalMessages || 0,
        totalChars: stats.totalChars || 0,
        avgMessageLength: stats.avgMessageLength || 0,
        usageDays: stats.usageDays || 1
      }
    });

    // 准备上传数据（字段名与后端 /api/analyze 的 findVal 匹配）
    // 【字段对齐】确保发送给 /api/analyze 的 Payload 包含所有必需字段
    // 后端 findVal 期望的字段：
    // - ketao: ['ketao', 'qingCount', 'politeCount']
    // - jiafang: ['jiafang', 'buCount', 'negationCount']
    // - totalChars: ['totalUserChars', 'totalChars', 'total_user_chars']
    // - userMessages: ['userMessages', 'totalMessages', 'user_messages', 'messageCount']
    // - days: ['usageDays', 'days', 'workDays']
    // - dimensions: body.dimensions || body.stats?.dimensions || {}
    // - vibeIndex: body.vibeIndex || body.stats?.vibeIndex || '00000'
    // - personalityType: body.personalityType || body.personality || 'Unknown'
    const uploadData = {
      // 消息和字符数：提供多个字段名以匹配 findVal 的查找逻辑
      totalMessages: stats.totalMessages || 0,
      userMessages: stats.userMessages || stats.totalMessages || 0,
      totalChars: stats.totalChars || 0,
      totalUserChars: stats.totalUserChars || stats.totalChars || 0,
      // 统计字段：匹配 findVal 的查找逻辑
      qingCount: stats.qingCount || 0, // 对应赛博磕头 (ketao)
      buCount: stats.buCount || 0,     // 对应甲方上身 (jiafang)
      usageDays: stats.usageDays || stats.days || 1, // 对应上岗天数
      days: stats.usageDays || stats.days || 1,      // 兼容字段
      avgMessageLength: stats.avgMessageLength || stats.avgUserMessageLength || 0,
      // 【字段对齐】添加 dimensions、vibeIndex 和 personalityType 字段
      dimensions: stats.dimensions || window.vibeResult?.dimensions || {},
      vibeIndex: stats.vibeIndex || window.vibeResult?.vibeIndex || '00000',
      personalityType: stats.personalityType || window.vibeResult?.personalityType || 'Unknown',
      personality: stats.personality || window.vibeResult?.personalityType || 'Unknown', // 兼容字段
    };

    // 发送 POST 请求到 Worker（使用 CORS 配置）
    const response = await fetchWithCORS(`${normalizedEndpoint}api/analyze`, {
      method: 'POST',
      body: JSON.stringify(uploadData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.status === 'success' && result.rankPercent !== undefined) {
      console.log(`[Main] 排名获取成功：击败了 ${result.rankPercent}% 的用户`);
      return {
        rankPercent: result.rankPercent,
        totalUsers: result.totalUsers || null,
        success: true
      };
    } else {
      throw new Error('后端返回数据格式异常');
    }
  } catch (err) {
    console.error('[Main] 上传排名失败:', err);
    // 容错处理：返回保底排名
    return {
      rankPercent: 99.9, // 保底排名
      totalUsers: null,
      success: false,
      error: err.message
    };
  }
}
// 导出初始化函数（供 React 调用，不绑定事件）
export const initializeParser = async () => {
  if (!parser) {
    console.log('[Main] 初始化解析器（模块模式）...');
    parser = new CursorParser();
    await parser.init();
    vibeAnalyzer = createVibeCodingerAnalyzer();
    console.log('[Main] 解析器初始化完成');
  }
  return { parser, vibeAnalyzer };
};

// 分页状态
let currentPage = 1;
let itemsPerPage = 20; // 每页显示20条
let filteredChatData = []; // 当前过滤后的数据

// 【防抖处理】防止重复点击造成的重复登记
let isProcessing = false;

// 【上传状态锁】防止分析过程中的并发请求
let isAnalyzing = false;

/**
 * 【稳定指纹生成】确保 fingerprint 始终唯一且持久
 * 使用固定的 localStorage key，结合 crypto.getRandomValues 和 UserAgent 特征
 * 生成32位唯一哈希，实现"先读后写"的单例模式
 * 
 * 特性：
 * 1. 使用统一的 key: 'user_fingerprint'（与 stats2.html / 后端一致）
 * 2. 32位哈希：结合随机值和浏览器特征，确保唯一性
 * 3. 向后兼容：兼容旧 key（'cursor_clinical_fingerprint' / 'vibe_fp'），会迁移到统一 key
 * 4. 单例模式：确保同一浏览器环境始终返回相同的指纹
 * 
 * @returns {string} 持久化的指纹字符串（32位十六进制）
 */
async function getStableFingerprint() {
  // 统一 key：stats2.html / Worker 侧默认读取 user_fingerprint
  const PRIMARY_FINGERPRINT_KEY = 'user_fingerprint';
  // 旧 key：本页历史版本曾使用 cursor_clinical_fingerprint
  const LEGACY_FINGERPRINT_KEY = 'cursor_clinical_fingerprint';
  const OLD_FINGERPRINT_KEY = 'vibe_fp'; // 更旧 key，用于迁移
  
  try {
    // 先读：优先读取统一 key，保证跨页面一致（stats2 / index 共用）
    let fp =
      localStorage.getItem(PRIMARY_FINGERPRINT_KEY) ||
      localStorage.getItem(LEGACY_FINGERPRINT_KEY);
    
    // 【向后兼容】如果仍不存在，尝试从更旧 key 迁移
    if (!fp || fp.length < 16) {
      const oldFp = localStorage.getItem(OLD_FINGERPRINT_KEY);
      if (oldFp && oldFp.length >= 8) {
        // 迁移旧指纹到新 key（如果是16位，扩展为32位）
        if (oldFp.length === 16) {
          // 扩展16位为32位：重复并添加随机后缀
          const randomBytes = new Uint8Array(8);
          crypto.getRandomValues(randomBytes);
          const suffix = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          fp = oldFp + suffix;
        } else {
          fp = oldFp;
        }
        try {
          // 写回统一 key，并同步写入旧 key，避免不同页面读到不同 fingerprint
          localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fp);
          localStorage.setItem(LEGACY_FINGERPRINT_KEY, fp);
          console.log('[Main] ✅ 已从旧 key 迁移 fingerprint:', fp);
        } catch (migrationError) {
          console.warn('[Main] ⚠️ 指纹迁移失败，但继续使用旧指纹:', migrationError);
        }
      }
    }
    
    // 如果仍然没有有效的指纹，生成一个新的32位哈希
    if (!fp || fp.length < 16) {
      // 1. 生成随机值
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const randomHex = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // 2. 获取浏览器特征（UserAgent + 语言 + 平台）
      const browserFeatures = {
        userAgent: navigator.userAgent || '',
        language: navigator.language || '',
        platform: navigator.platform || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      };
      const featuresString = JSON.stringify(browserFeatures);
      
      // 3. 结合随机值和浏览器特征生成32位哈希
      const combinedString = randomHex + featuresString;
      const encoder = new TextEncoder();
      const data = encoder.encode(combinedString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      fp = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 32); // 取前32位
      
      // 后写：保存到 localStorage
      try {
        // 同步写入统一 key + 旧 key，确保其他页面（stats2 等）能直接复用
        localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fp);
        localStorage.setItem(LEGACY_FINGERPRINT_KEY, fp);
        console.log('[Main] ✅ 已生成并持久化32位 fingerprint:', fp);
      } catch (storageError) {
        console.warn('[Main] ⚠️ localStorage 写入失败，但继续使用生成的指纹:', storageError);
      }
    } else {
      console.log('[Main] ✅ 从 localStorage 读取已存在的 fingerprint:', fp);
      // 保险：如果读到的是 legacy key，也补写到统一 key，避免后续页面“找不到 user_fingerprint”
      try {
        if (!localStorage.getItem(PRIMARY_FINGERPRINT_KEY)) {
          localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fp);
        }
        if (!localStorage.getItem(LEGACY_FINGERPRINT_KEY)) {
          localStorage.setItem(LEGACY_FINGERPRINT_KEY, fp);
        }
      } catch { /* ignore */ }
    }
    
    return fp;
  } catch (error) {
    // 降级方案：如果所有方法都失败，使用时间戳+随机数+UserAgent
    console.warn('[Main] ⚠️ fingerprint 生成失败，使用降级方案:', error);
    const userAgent = navigator.userAgent || '';
    const fallbackString = `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${userAgent.substring(0, 20)}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(fallbackString);
    
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const fallbackFp = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 32);
      
      // 尝试保存降级指纹
      try {
        localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fallbackFp);
        localStorage.setItem(LEGACY_FINGERPRINT_KEY, fallbackFp);
      } catch (e) {
        // 忽略保存错误
      }
      
      return fallbackFp;
    } catch (hashError) {
      // 最终降级：纯字符串哈希
      const simpleFp = btoa(fallbackString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
      try {
        localStorage.setItem(PRIMARY_FINGERPRINT_KEY, simpleFp);
        localStorage.setItem(LEGACY_FINGERPRINT_KEY, simpleFp);
      } catch (e) {
        // 忽略保存错误
      }
      return simpleFp;
    }
  }
}

/**
 * 【同步版本】获取稳定指纹（用于同步场景）
 * 如果异步版本不可用，使用同步降级方案
 */
function getStableFingerprintSync() {
  const PRIMARY_FINGERPRINT_KEY = 'user_fingerprint';
  const LEGACY_FINGERPRINT_KEY = 'cursor_clinical_fingerprint';
  const OLD_FINGERPRINT_KEY = 'vibe_fp';
  
  try {
    let fp =
      localStorage.getItem(PRIMARY_FINGERPRINT_KEY) ||
      localStorage.getItem(LEGACY_FINGERPRINT_KEY);
    
    if (!fp || fp.length < 16) {
      const oldFp = localStorage.getItem(OLD_FINGERPRINT_KEY);
      if (oldFp && oldFp.length >= 8) {
        fp = oldFp.length === 16 ? (oldFp + oldFp) : oldFp;
        try {
          localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fp);
          localStorage.setItem(LEGACY_FINGERPRINT_KEY, fp);
        } catch (e) {}
      }
    }
    
    if (!fp || fp.length < 16) {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const randomHex = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const browserString = (navigator.userAgent || '') + (navigator.language || '') + (navigator.platform || '');
      const combined = randomHex + browserString;
      fp = btoa(combined).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
      try {
        localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fp);
        localStorage.setItem(LEGACY_FINGERPRINT_KEY, fp);
      } catch (e) {}
    }
    
    return fp;
  } catch (error) {
    const fallback = `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`.substring(0, 32);
    try {
      localStorage.setItem(PRIMARY_FINGERPRINT_KEY, fallback);
      localStorage.setItem(LEGACY_FINGERPRINT_KEY, fallback);
    } catch (e) {}
    return fallback;
  }
}

// DOM 元素
const elements = {
  uploadSection: document.getElementById('uploadSection'),
  loadingSection: document.getElementById('loadingSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  uploadBtn: document.getElementById('uploadBtn'),
  selectFolderBtn: document.getElementById('selectFolderBtn'),
  folderInput: document.getElementById('folderInput'),
  fileInput: document.getElementById('fileInput'),
  exportBtn: document.getElementById('exportBtn'),
  selectFileBtn: document.getElementById('selectFileBtn'),
  uploadError: document.getElementById('uploadError'),
  loadingProgress: document.getElementById('loadingProgress'),
  exportArea: document.getElementById('exportArea'),
  searchInput: document.getElementById('searchInput'),
  chatList: document.getElementById('chatList'),
  paginationContainer: document.getElementById('paginationContainer'),
  paginationInfo: document.getElementById('paginationInfo'),
  paginationPages: document.getElementById('paginationPages'),
  paginationPrev: document.getElementById('paginationPrev'),
  paginationNext: document.getElementById('paginationNext'),
};

// 统计元素
const statsElements = {
  totalConversations: document.getElementById('totalConversations'),
  userMessages: document.getElementById('userMessages'),
  qingCount: document.getElementById('qingCount'),
  buCount: document.getElementById('buCount'),
  topChineseWordsList: document.getElementById('topChineseWordsList'),
  // 用户行为统计元素
  totalUserChars: document.getElementById('totalUserChars'),
  avgUserMessageLength: document.getElementById('avgUserMessageLength'),
  questionMessageCount: document.getElementById('questionMessageCount'),
};

// 初始化应用
async function init() {
  console.log('[Main] ===== 应用初始化开始 =====');
  console.log('[Main] 当前时间:', new Date().toISOString());

  // 检查 DOM 是否就绪
  if (document.readyState === 'loading') {
    console.log('[Main] 等待 DOM 加载...');
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }

  console.log('[Main] DOM 已就绪，开始获取元素...');

  // 重新获取所有元素（确保 DOM 已加载）
  elements.uploadSection = document.getElementById('uploadSection');
  elements.loadingSection = document.getElementById('loadingSection');
  elements.dashboardSection = document.getElementById('dashboardSection');
  elements.uploadBtn = document.getElementById('uploadBtn');
  elements.selectFolderBtn = document.getElementById('selectFolderBtn');
  elements.folderInput = document.getElementById('folderInput');
  elements.fileInput = document.getElementById('fileInput');
  elements.exportBtn = document.getElementById('exportBtn');
  elements.selectFileBtn = document.getElementById('selectFileBtn');
  elements.uploadError = document.getElementById('uploadError');
  elements.loadingProgress = document.getElementById('loadingProgress');
  elements.exportArea = document.getElementById('exportArea');
  elements.searchInput = document.getElementById('searchInput');
  elements.chatList = document.getElementById('chatList');
  elements.paginationContainer = document.getElementById('paginationContainer');
  elements.paginationInfo = document.getElementById('paginationInfo');
  elements.paginationPages = document.getElementById('paginationPages');
  elements.paginationPrev = document.getElementById('paginationPrev');
  elements.paginationNext = document.getElementById('paginationNext');

  // 初始化解析器
  console.log('[Main] 初始化 CursorParser...');
  parser = new CursorParser();
  await parser.init();
  console.log('[Main] CursorParser 初始化完成');

  // 初始化 Vibe Codinger 分析器
  console.log('[Main] 初始化 VibeCodingerAnalyzer...');
  vibeAnalyzer = new VibeCodingerAnalyzer();
  console.log('[Main] VibeCodingerAnalyzer 初始化完成');

  // 【三身份级别词云】必须先 await 加载词库，再注入 analyzer
  try {
    const kw = await loadIdentityLevelKeywords();
    if (vibeAnalyzer && typeof vibeAnalyzer.setLevelKeywords === 'function') {
      vibeAnalyzer.setLevelKeywords(kw);
      console.log('[Main] ✅ 身份级别词库已注入:', { N: (kw && kw.Novice) ? kw.Novice.length : 0, P: (kw && kw.Professional) ? kw.Professional.length : 0, A: (kw && kw.Architect) ? kw.Architect.length : 0 });
    }
  } catch (e) {
    console.warn('[Main] 身份级别词库加载失败:', e);
  }

  // 初始化 VibeCodingApp 类
  console.log('[Main] 初始化 VibeCodingApp...');
  vibeCodingApp = new VibeCodingApp();
  vibeCodingApp.parser = parser;
  vibeCodingApp.analyzer = vibeAnalyzer;
  console.log('[Main] VibeCodingApp 初始化完成');

  // 获取全局平均值（异步，不阻塞初始化）
  console.log('[Main] 开始获取全局平均值...');
  fetchGlobalAverage().then(avg => {
    // 检查返回的数据是否是默认值（通过检查是否所有值都是50）
    const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
    
    if (!isDefaultValue) {
      globalAverageData = avg;
      globalAverageDataLoaded = true;
      console.log('[Main] ✅ 全局平均值已从 API 成功加载:', globalAverageData);
    } else {
      console.warn('[Main] ⚠️ 获取到的数据是默认值，可能 API 请求失败');
      globalAverageDataLoaded = false;
    }
    
    // 如果雷达图已经渲染，需要更新它
    if (vibeResult && window.vibeRadarChartInstance) {
      console.log('[Main] 更新已渲染的雷达图...');
      renderVibeRadarChart();
    }
  }).catch(error => {
    console.error('[Main] ❌ 获取全局平均值失败:', error);
    globalAverageDataLoaded = false;
    // 使用默认值（已在变量初始化时设置）
    console.log('[Main] 使用默认全局平均值:', globalAverageData);
  });

  // 绑定事件
  bindEvents();

  console.log('[Main] ===== 应用初始化完成 =====');
}

// 绑定事件
function bindEvents() {
  // 验证所有元素是否正确获取
  console.log('[Main] 开始绑定事件...');

  // 验证按钮元素
  if (!elements.uploadBtn) {
    console.error('[Main] ❌ uploadBtn 元素未找到');
  } else {
    console.log('[Main] ✅ uploadBtn 元素已找到');
    elements.uploadBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击上传按钮');
      event.preventDefault();
      triggerFileInput(elements.folderInput);
    });
  }

  if (!elements.selectFolderBtn) {
    console.error('[Main] ❌ selectFolderBtn 元素未找到');
  } else {
    console.log('[Main] ✅ selectFolderBtn 元素已找到');
    elements.selectFolderBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击选择文件夹按钮');
      event.preventDefault();
      triggerFileInput(elements.folderInput);
    });
  }

  // 单文件上传按钮
  if (!elements.selectFileBtn) {
    console.error('[Main] ❌ selectFileBtn 元素未找到');
  } else {
    console.log('[Main] ✅ selectFileBtn 元素已找到');
    elements.selectFileBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击选择文件按钮');
      event.preventDefault();
      triggerFileInput(elements.fileInput);
    });
  }

  // 验证文件输入元素
  if (!elements.folderInput) {
    console.error('[Main] ❌ folderInput 元素未找到');
  } else {
    console.log('[Main] ✅ folderInput 元素已找到');
    elements.folderInput.addEventListener('change', (event) => {
      // 【上传状态锁】检查是否正在分析
      if (isAnalyzing || isProcessing) {
        console.warn('[Main] ⚠️ 正在分析中，忽略重复请求');
        event.target.value = ''; // 清空选择
        return;
      }
      console.log('[Main] 文件夹选择事件触发');
      handleFileUpload(event, 'folder');
    });
  }

  if (!elements.fileInput) {
    console.error('[Main] ❌ fileInput 元素未找到');
  } else {
    console.log('[Main] ✅ fileInput 元素已找到');
    elements.fileInput.addEventListener('change', (event) => {
      // 【上传状态锁】检查是否正在分析
      if (isAnalyzing || isProcessing) {
        console.warn('[Main] ⚠️ 正在分析中，忽略重复请求');
        event.target.value = ''; // 清空选择
        return;
      }
      console.log('[Main] 文件选择事件触发');
      handleFileUpload(event, 'file');
    });
  }
  
  // 【上传状态锁】禁用/启用按钮的辅助函数
  function updateUploadButtonsState(disabled) {
    if (elements.selectFolderBtn) {
      elements.selectFolderBtn.disabled = disabled;
      if (disabled) {
        elements.selectFolderBtn.style.opacity = '0.5';
        elements.selectFolderBtn.style.cursor = 'not-allowed';
      } else {
        elements.selectFolderBtn.style.opacity = '1';
        elements.selectFolderBtn.style.cursor = 'pointer';
      }
    }
    if (elements.uploadBtn) {
      elements.uploadBtn.disabled = disabled;
      if (disabled) {
        elements.uploadBtn.style.opacity = '0.5';
        elements.uploadBtn.style.cursor = 'not-allowed';
      } else {
        elements.uploadBtn.style.opacity = '1';
        elements.uploadBtn.style.cursor = 'pointer';
      }
    }
  }
  
  // 将更新函数暴露到全局，供 handleFileUpload 使用
  window.updateUploadButtonsState = updateUploadButtonsState;

  // 搜索
  if (elements.searchInput) {
    // 【修复】确保搜索框事件正确绑定
    // 使用 once: false 确保可以多次绑定（debounce 会处理重复调用）
    const searchHandler = debounce(handleSearch, 300);
    elements.searchInput.addEventListener('input', searchHandler);
    console.log('[Main] ✅ 搜索框事件已绑定');
  } else {
    console.warn('[Main] ⚠️ searchInput 元素未找到，可能 DOM 尚未加载');
  }

  // 分页器事件
  if (elements.paginationPrev) {
    elements.paginationPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderChatList(filteredChatData);
      }
    });
  }

  if (elements.paginationNext) {
    elements.paginationNext.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredChatData.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderChatList(filteredChatData);
      }
    });
  }

  // 导出图片
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', handleExport);
  }

  console.log('[Main] 事件绑定完成');
}

// 触发文件选择
function triggerFileInput(inputElement) {
  console.log('[Main] 尝试触发文件选择...');
  console.log('[Main] inputElement:', inputElement);
  console.log('[Main] inputElement.type:', inputElement?.type);

  if (!inputElement) {
    console.error('[Main] ❌ inputElement 为 null');
    return;
  }

  try {
    // 重置 input 的值，允许重新选择相同文件
    inputElement.value = '';
    // 点击触发文件选择
    if (inputElement.click) {
        inputElement.click();
    } else {
        // 尝试模拟点击
        const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        inputElement.dispatchEvent(event);
    }
    console.log('[Main] ✅ 文件选择已触发');
  } catch (error) {
    console.error('[Main] ❌ 触发文件选择失败:', error);
    alert('无法打开文件选择对话框，请检查浏览器设置或刷新页面重试。');
  }
}

// 处理文件上传（支持回调函数）
async function handleFileUpload(event, type, callbacks = {}) {
  // 【防抖处理 + 上传状态锁】防止重复点击和并发请求
  if (isProcessing || isAnalyzing) {
    console.warn('[Main] ⚠️ 正在处理中，忽略重复请求', { isProcessing, isAnalyzing });
    if (event && event.target) {
      event.target.value = ''; // 清空选择
    }
    return;
  }
  
  // 【上传状态锁】禁用上传按钮
  if (window.updateUploadButtonsState) {
    window.updateUploadButtonsState(true);
  }

  // 【唯一提交入口】新一次上传流程重置 Session 锁，允许本 Run 内触发一次有效提交
  try {
    if (typeof window !== 'undefined') {
      window.__vibeSubmitted = false;
      window.__vibeLastUploadResult = null;
    }
  } catch (_) { /* ignore */ }

  const { onProgress, onLog, onComplete, onError } = callbacks;
  console.log(`[Main] 处理文件上传，类型: ${type}`);
  console.log(`[Main] event.files.length: ${event.target.files?.length}`);

  const files = Array.from(event.target.files || []);

  // 清除错误信息（仅在非模块模式下）
  if (!callbacks || !callbacks.onLog) {
    hideUploadError();
  }

  if (files.length === 0) {
    console.warn('[Main] 没有选择文件');
    if (callbacks?.onError) {
      callbacks.onError(new Error('没有选择文件'));
    }
    return;
  }

  console.log(`[Main] 选择了 ${files.length} 个文件`);
  console.log('[Main] 文件列表:');
  files.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.name} (${formatFileSize(f.size)})`);
  });

  // 显示加载状态（仅在非模块模式下）
  if (!callbacks || !callbacks.onLog) {
    showLoading();
  } else if (callbacks.onLog) {
    const currentLang = getCurrentLang();
    const logText = window.i18n?.getText('upload.logs.startProcessing', currentLang) || '开始处理文件...';
    callbacks.onLog(`> ${logText}`);
  }

  try {
    let dbFiles = [];
    let filteredFiles = [];

    if (type === 'folder') {
      // 文件夹模式：过滤出 state.vscdb 文件
      dbFiles = files.filter((file) => file.name === 'state.vscdb');
      filteredFiles = files.filter((file) => file.name !== 'state.vscdb');

      console.log(`[Main] 文件夹模式：找到 ${dbFiles.length} 个 state.vscdb 文件`);

      if (filteredFiles.length > 0) {
        console.log(`[Main] 已过滤 ${filteredFiles.length} 个非数据库文件`);
        if (filteredFiles.length <= 10) {
          console.log('[Main] 过滤的文件:', filteredFiles.map(f => f.name));
        }
      }

      if (dbFiles.length === 0) {
        const fileList = filteredFiles.slice(0, 5).map(f => f.name).join(', ');
        const error = filteredFiles.length === 0
          ? '未找到 state.vscdb 文件，请选择正确的 Cursor workspaceStorage 目录'
          : `未找到 state.vscdb 文件。选中的文件包括：${fileList}${filteredFiles.length > 5 ? '...' : ''}`;
        throw new Error(error);
      }
    } else {
      // 单文件模式：过滤出数据库文件
      const validExtensions = ['.vscdb', '.db', '.sqlite', '.sqlite3'];
      dbFiles = files.filter((file) =>
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
      );
      filteredFiles = files.filter((file) =>
        !validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
      );

      console.log(`[Main] 单文件模式：找到 ${dbFiles.length} 个数据库文件`);

      if (filteredFiles.length > 0) {
        console.log(`[Main] 已过滤 ${filteredFiles.length} 个非数据库文件`);
        console.log('[Main] 过滤的文件:', filteredFiles.map(f => f.name));
      }

      if (dbFiles.length === 0) {
        const fileList = filteredFiles.slice(0, 3).map(f => f.name).join(', ');
        const error = filteredFiles.length === 0
          ? '未找到有效的数据库文件（.vscdb, .db, .sqlite, .sqlite3）'
          : `未找到有效的数据库文件。选择的是：${fileList}${filteredFiles.length > 3 ? '...' : ''}，请选择数据库文件`;
        throw new Error(error);
      }
    }

    // 查找所有文件中最早的修改时间
    let earliestFileTime = null;
    if (files.length > 0) {
      // 遍历所有文件（不仅仅是数据库文件），找到最早的修改时间
      for (const file of files) {
        if (file.lastModified) {
          if (earliestFileTime === null || file.lastModified < earliestFileTime) {
            earliestFileTime = file.lastModified;
          }
        }
      }
      console.log('[Main] 最早文件时间:', earliestFileTime ? new Date(earliestFileTime).toISOString() : '未找到');
    }

    // 初始化全局统计数据
    globalStats = {
      totalConversations: 0,
      modelUsage: {},
      userMessages: 0,
      aiMessages: 0,
      hourlyActivity: new Array(24).fill(0),
      dailyActivity: {},
      topPrompts: {},
      qingCount: 0,
      buCount: 0,
      topChineseWords: {},
      chineseWords: {},
      chineseEmotionWords: {}, // 新增：专门存储情绪类词组
      englishWords: {},
      earliestFileTime: earliestFileTime, // 保存最早文件时间
      userBehaviorStats: {
        totalUserChars: 0,
        avgUserMessageLength: 0,
        questionMessageCount: 0,
        techStack: {},
      },
    };

    // 重置全局对话数据
    allChatData = [];

    let processedCount = 0;

    // 逐个处理数据库文件
    for (const file of dbFiles) {
      try {
        if (DEBUG_MODE) console.log(`[Main] 正在处理: ${file.name}`);

        // 读取文件
        const arrayBuffer = await file.arrayBuffer();

        // 加载数据库
        await parser.loadDatabase(arrayBuffer);

        // 扫描数据库
        const chatData = await parser.scanDatabase();

        // 合并到全局数据
        allChatData = allChatData.concat(chatData);

        // 合并统计
        mergeStats(globalStats, parser.stats);

        processedCount++;
        
        // 更新进度（仅在非模块模式下）
        if (!callbacks || !callbacks.onLog) {
          updateLoadingProgress(processedCount, dbFiles.length);
        }
        
        // 调用进度回调
        if (onProgress) {
          onProgress(processedCount, dbFiles.length, file.name);
        }
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.processed', currentLang) || '已处理 {current}/{total}: {fileName}';
          const processedText = logText.replace('{current}', processedCount).replace('{total}', dbFiles.length).replace('{fileName}', file.name);
          onLog(`> ${processedText}`);
        }

        // 让出主线程，避免阻塞UI
        if (processedCount % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (error) {
        console.error(`[Main] 处理文件失败: ${file.name}`, error);
        // 继续处理其他文件，不中断
      }
    }

    console.log(`[Main] 总共提取 ${allChatData.length} 条对话记录`);

    if (allChatData.length === 0) {
      isProcessing = false;
      throw new Error('未找到任何对话数据，请检查数据库文件是否正确');
    }

    // 从所有对话数据重新计算统计（包括词云数据）
    console.log('[Main] 开始重新计算统计（包括词云数据）...');
    if (onLog) {
      const currentLang = getCurrentLang();
      const logText = window.i18n?.getText('upload.logs.calculatingStats', currentLang) || '计算统计数据...';
      onLog(`> ${logText}`);
    }
    
    // 使用 setTimeout 让出主线程，确保UI能更新
    await new Promise(resolve => setTimeout(resolve, 10));
    
    calculateStatsFromData(allChatData);
    
    if (DEBUG_MODE) {
      console.log('[Main] 统计计算完成，词云数据:', {
        chineseWords: Object.keys(globalStats.chineseWords || {}).length,
        englishWords: Object.keys(globalStats.englishWords || {}).length,
      });
    }

    // 进行 Vibe Codinger 人格分析（使用 VibeCodingApp 类）
    if (allChatData.length > 0) {
      console.log('[Main] 开始 Vibe Codinger 人格分析（使用 VibeCodingApp）...');
      if (onLog) {
        const currentLang = getCurrentLang();
        const logText = window.i18n?.getText('upload.logs.generatingPersonality', currentLang) || '生成人格画像（高性能匹配中）...';
        onLog(`> ${logText}`);
      }
      try {
        // 确保 VibeCodingApp 已初始化
        if (!vibeCodingApp) {
          vibeCodingApp = new VibeCodingApp();
          await vibeCodingApp.init();
        }
        
        // 确保使用全局的 analyzer（保持向后兼容）
        vibeCodingApp.analyzer = vibeAnalyzer;
        
        // 计算使用天数
        let usageDays = 1;
        if (globalStats && globalStats.earliestFileTime) {
          const now = Date.now();
          const earliest = globalStats.earliestFileTime;
          const diffMs = now - earliest;
          usageDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
        
        // 准备额外的统计数据（用于上传排名）
        const extraStats = globalStats ? {
          qingCount: globalStats.qingCount || 0,
          buCount: globalStats.buCount || 0,
          usageDays: usageDays
        } : null;
        
        // 创建进度回调函数
        const onProgress = (message) => {
          if (onLog) {
            onLog(`> ${message}`);
          }
          // 显示 UI Loading 状态
          if (!callbacks || !callbacks.onLog) {
            showLoading(message);
          }
        };
        
        // 设置处理状态
        isProcessing = true;
        
        // 【上传状态锁】设置分析状态
        isAnalyzing = true;
        isProcessing = true;

        // 数据量较大时，分析开始前显示深度体检提示
        var totalCharsForHint = 0;
        for (var ti = 0; ti < allChatData.length; ti++) {
          var t = allChatData[ti] && (allChatData[ti].text || allChatData[ti].content || '');
          totalCharsForHint += t ? String(t).length : 0;
        }
        if (totalCharsForHint > 50000 && (!callbacks || !callbacks.onLog)) {
          showLoading(getCurrentLang() === 'en' ? 'Deep analysis in progress (large dataset)...' : '正在深度体检中（数据量较大）...');
        }

        // 使用 VibeCodingApp 的 analyzeFile 方法
        // 上传流程必须等待 rankData 再回调，否则预览/横向排名无数据（deferGlobalSync 默认会先返回再后台同步）
        vibeResult = await vibeCodingApp.analyzeFile(allChatData, extraStats, onProgress, { deferGlobalSync: false });
        console.log('[Main] Vibe Codinger 分析完成（使用 VibeCodingApp）:', vibeResult);
        
        // 重置处理状态
        isAnalyzing = false;
        isProcessing = false;
        
        // 隐藏加载状态
        if (!callbacks || !callbacks.onLog) {
          hideLoading();
        }
        
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.analysisComplete', currentLang) || '分析完成！';
          onLog(`> ${logText}`);
        }
      } catch (error) {
        console.error('[Main] Vibe Codinger 分析失败，使用降级方案:', error);
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.analysisFailed', currentLang) || '分析失败，使用降级方案...';
          onLog(`> ${logText}`);
        }
        
        // 重置处理状态（允许重试）
        isAnalyzing = false;
        isProcessing = false;
        
        // 降级到同步方法（使用 VibeCodingApp 类）
        try {
          // 设置处理状态
          isAnalyzing = true;
          isProcessing = true;
          // 确保 VibeCodingApp 已初始化
          if (!vibeCodingApp) {
            vibeCodingApp = new VibeCodingApp();
            await vibeCodingApp.init();
          }
          
          // 确保使用全局的 analyzer（保持向后兼容）
          vibeCodingApp.analyzer = vibeAnalyzer;
          
          // 计算使用天数
          let usageDays = 1;
          if (globalStats && globalStats.earliestFileTime) {
            const now = Date.now();
            const earliest = globalStats.earliestFileTime;
            const diffMs = now - earliest;
            usageDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          }
          
          // 准备额外的统计数据（用于上传排名）
          const extraStats = globalStats ? {
            qingCount: globalStats.qingCount || 0,
            buCount: globalStats.buCount || 0,
            usageDays: usageDays
          } : null;
          
          // 创建进度回调函数
          const onProgress = (message) => {
            if (onLog) {
              onLog(`> ${message}`);
            }
            // 显示 UI Loading 状态
            if (!callbacks || !callbacks.onLog) {
              showLoading(message);
            }
          };
          
          // 使用 VibeCodingApp 的 analyzeFileSync 方法（同步方法）
          vibeResult = await vibeCodingApp.analyzeFileSync(allChatData, extraStats, onProgress, { deferGlobalSync: false });
          console.log('[Main] Vibe Codinger 分析完成（使用 VibeCodingApp 同步方法）:', vibeResult);
          
          // 重置处理状态
          isAnalyzing = false;
          isProcessing = false;
          
          // 隐藏加载状态
          if (!callbacks || !callbacks.onLog) {
            hideLoading();
          }
          
          if (onLog) {
            const currentLang = getCurrentLang();
            const logText = window.i18n?.getText('upload.logs.analysisComplete', currentLang) || '分析完成！';
            onLog(`> ${logText}`);
          }
        } catch (syncError) {
          console.error('[Main] 同步方法也失败:', syncError);
          // 重置处理状态
          isAnalyzing = false;
          isProcessing = false;
          if (onLog) {
            const currentLang = getCurrentLang();
            const errorText = window.i18n?.getText('upload.logs.analysisFailed', currentLang) || '分析失败';
            onLog(`> ${errorText}`);
          }
        }
      }
    }
    
    // 【人格预览】多路径取值：优先 personality_data.answer_book.content，否则 roast_text；再补全 roastLibrary / dimensions 保底
    if (vibeResult) {
      var rt = vibeResult.roastText ? String(vibeResult.roastText) : '';
      if (isInvalidPersonalityText(rt)) {
        var pd = vibeResult.personality_data || vibeResult.personalityData;
        var parsed = safeParsePersonalityData(pd);
        var ab = null;
        if (parsed) ab = parsed.answer_book || parsed.answerBook;
        if (!ab && vibeResult.personality) ab = vibeResult.personality.answer_book || vibeResult.personality.answerBook;
        if (ab && typeof ab === 'object') {
          var fromAb = (ab.content != null ? String(ab.content) : (ab.text != null ? String(ab.text) : '')).trim();
          if (fromAb && !isInvalidPersonalityText(fromAb)) {
            vibeResult.roastText = fromAb;
            rt = fromAb;
          }
        }
      }
      rt = vibeResult.roastText ? String(vibeResult.roastText) : '';
      var isPlaceholder = isInvalidPersonalityText(rt);
      if (isPlaceholder) {
        var idx = (vibeResult.vibeIndex || vibeResult.vibe_index || '').toString().slice(0, 5);
        var lang = getCurrentLang();
        var isEn = lang === 'en';
        try {
          var libUrl = isEn ? 'src/roastLibrary2.json' : 'src/roastLibrary.json';
          var res = await fetch(libUrl);
          if (res.ok) {
            var roastData = await res.json();
            if (roastData && roastData[idx]) {
              vibeResult.roastText = roastData[idx];
              console.log('[Main] 已从 roastLibrary 补全人格预览吐槽文案，vibeIndex:', idx);
            }
          }
        } catch (e) {
          console.warn('[Main] 从 roastLibrary 补全吐槽文案失败:', e);
        }
        if (isInvalidPersonalityText(vibeResult.roastText)) {
          vibeResult.roastText = fallbackInterpretationFromDimensions(vibeResult.dimensions, lang);
          console.log('[Main] roastLibrary 无命中，已使用 dimensions 动态文案保底');
        }
      }
      try {
        console.log('[Main] finalVibePayload (传入预览)', { vibeIndex: vibeResult.vibeIndex, roastTextLen: (vibeResult.roastText || '').length, hasDimensions: !!vibeResult.dimensions });
      } catch (_) {}
    }

    // 调用完成回调（不自动显示 Dashboard，由 React 控制）
    // 【数据流】上传 -> analyzeFile(含 uploadToSupabase) -> vibeResult 含 dimensions/rankData/identityLevelCloud/roastText -> 补全 roastText -> 传入预览；三身份词云用 window.vibeResults，预览/排名用 vibeResult，互不覆盖
    if (onComplete) {
      onComplete({
        stats: globalStats,
        chatData: allChatData,
        vibeResult: vibeResult
      });
    } else {
      // 如果没有回调，使用原来的逻辑
      showDashboard();
      displayStats();
      if (vibeResult) {
        displayVibeCodingerAnalysis();
      }
      currentPage = 1;
      renderChatList(allChatData);
      
      // 【修复】确保搜索框在数据加载后也能正常工作
      if (elements.searchInput && allChatData && allChatData.length > 0) {
        console.log('[Main] ✅ 数据加载完成，搜索功能已就绪，共', allChatData.length, '条记录');
      }
    }
  } catch (error) {
    console.error('[Main] 处理失败:', error);
    // 重置处理状态
    isAnalyzing = false;
    isProcessing = false;
    if (onError) {
      onError(error);
    } else {
      // 仅在非模块模式下显示错误
      showUploadError(error.message);
      hideLoading();
    }
  } finally {
    // 确保处理状态被重置（防止异常情况下状态卡住）
    isAnalyzing = false;
    isProcessing = false;
    
    // 【上传状态锁】重新启用上传按钮
    if (window.updateUploadButtonsState) {
      window.updateUploadButtonsState(false);
    }
    
    // 清空文件选择，允许重新选择（如果 event.target 存在）
    if (event && event.target) {
      event.target.value = '';
    }
  }
}

/**
 * 合并统计信息
 */
function mergeStats(target, source) {
  target.totalConversations += source.totalConversations;
  target.userMessages += source.userMessages;
  target.aiMessages += source.aiMessages;

  // 合并"请"和"不"的次数统计
  target.qingCount = (target.qingCount || 0) + (source.qingCount || 0);
  target.buCount = (target.buCount || 0) + (source.buCount || 0);

  // 合并用户行为统计
  if (source.userBehaviorStats) {
    target.userBehaviorStats = target.userBehaviorStats || {
      totalUserChars: 0,
      avgUserMessageLength: 0,
      questionMessageCount: 0,
      codeKeywordCount: 0,
      modifyKeywordCount: 0,
    };
    target.userBehaviorStats.totalUserChars += source.userBehaviorStats.totalUserChars || 0;
    target.userBehaviorStats.questionMessageCount += source.userBehaviorStats.questionMessageCount || 0;
    target.userBehaviorStats.codeKeywordCount += source.userBehaviorStats.codeKeywordCount || 0;
    target.userBehaviorStats.modifyKeywordCount += source.userBehaviorStats.modifyKeywordCount || 0;
    
    // 合并技术栈统计
    if (source.userBehaviorStats.techStack) {
      target.userBehaviorStats.techStack = target.userBehaviorStats.techStack || {};
      Object.entries(source.userBehaviorStats.techStack).forEach(([tech, count]) => {
        target.userBehaviorStats.techStack[tech] = (target.userBehaviorStats.techStack[tech] || 0) + count;
      });
    }
    
    // 重新计算平均长度
    if (target.userMessages > 0) {
      target.userBehaviorStats.avgUserMessageLength = Math.round(
        target.userBehaviorStats.totalUserChars / target.userMessages
      );
    }
  }

  // 合并模型使用统计
  for (const [model, count] of Object.entries(source.modelUsage)) {
    target.modelUsage[model] = (target.modelUsage[model] || 0) + count;
  }

  // 合并时段统计
  for (let i = 0; i < 24; i++) {
    target.hourlyActivity[i] += source.hourlyActivity[i];
  }

  // 合并每日活动统计
  for (const [date, count] of Object.entries(source.dailyActivity)) {
    target.dailyActivity[date] = (target.dailyActivity[date] || 0) + count;
  }

  // 合并热门提示词
  for (const [prompt, count] of Object.entries(source.topPrompts)) {
    target.topPrompts[prompt] = (target.topPrompts[prompt] || 0) + count;
  }

  // 合并汉字词组统计
  for (const [word, count] of Object.entries(source.topChineseWords || {})) {
    target.topChineseWords = target.topChineseWords || {};
    target.topChineseWords[word] = (target.topChineseWords[word] || 0) + count;
  }

  // 合并词云数据（如果源数据中有）
  if (source.chineseWords) {
    target.chineseWords = target.chineseWords || {};
    for (const [word, count] of Object.entries(source.chineseWords)) {
      target.chineseWords[word] = (target.chineseWords[word] || 0) + count;
    }
  }

  if (source.englishWords) {
    target.englishWords = target.englishWords || {};
    for (const [word, count] of Object.entries(source.englishWords)) {
      target.englishWords[word] = (target.englishWords[word] || 0) + count;
    }
  }
}

/**
 * 从所有对话数据计算统计 - 优化版本
 * 使用批量处理和减少日志输出以提升性能
 */
function calculateStatsFromData(chatData) {
  console.log('[Main] 开始计算统计，数据量:', chatData.length);
  const startTime = performance.now();

  // 重置全局统计（保留最早文件时间）
  const earliestFileTime = globalStats?.earliestFileTime || null;
  globalStats = {
    totalConversations: 0,
    modelUsage: {},
    userMessages: 0,
    aiMessages: 0,
    hourlyActivity: new Array(24).fill(0),
    dailyActivity: {},
    topPrompts: {},
    qingCount: 0,
    buCount: 0,
    topChineseWords: {},
    chineseWords: {},
    chineseEmotionWords: {},
    englishWords: {},
    totalCodeChars: 0,
    earliestFileTime: earliestFileTime,
    userBehaviorStats: {
      totalUserChars: 0,
      avgUserMessageLength: 0,
      questionMessageCount: 0,
      techStack: {},
    },
  };

  // 批量处理，每批处理100条，避免阻塞主线程
  const BATCH_SIZE = 100;
  const totalItems = chatData.length;
  
  for (let i = 0; i < totalItems; i++) {
    const item = chatData[i];
    
    // 消息数量
    if (item.role === 'USER') {
      globalStats.userMessages++;
    } else {
      globalStats.aiMessages++;
      globalStats.totalConversations++;
    }

    // 代码字符数 - 只统计AI生成的代码
    if (item.text && item.text.length > 0 && item.role !== 'USER') {
      processCodeStats(item.text);
    }

    // 模型使用统计（批量模式下减少日志）
    const model = item.model || 'unknown';
    globalStats.modelUsage[model] = (globalStats.modelUsage[model] || 0) + 1;

    // 时间统计
    if (item.timestamp) {
      processTimestampStats(item.timestamp);
    }

    // 用户消息统计
    if (item.role === 'USER' && item.text) {
      processUserMessageStats(item.text);
    }
  }

  // 计算平均消息长度
  if (globalStats.userMessages > 0) {
    globalStats.userBehaviorStats.avgUserMessageLength = Math.round(
      globalStats.userBehaviorStats.totalUserChars / globalStats.userMessages
    );
  }

  const endTime = performance.now();
  console.log('[Main] 统计计算完成，耗时:', Math.round(endTime - startTime), 'ms', {
    totalConversations: globalStats.totalConversations,
    userMessages: globalStats.userMessages,
    aiMessages: globalStats.aiMessages,
    totalCodeChars: globalStats.totalCodeChars,
    totalUserChars: globalStats.userBehaviorStats.totalUserChars,
    avgUserMessageLength: globalStats.userBehaviorStats.avgUserMessageLength,
    qingCount: globalStats.qingCount,
    buCount: globalStats.buCount,
    modelUsageCount: Object.keys(globalStats.modelUsage).length,
    topPromptsCount: Object.keys(globalStats.topPrompts).length,
    hourlyNonZero: globalStats.hourlyActivity.filter(v => v > 0).length,
    dailyCount: Object.keys(globalStats.dailyActivity).length,
    chineseWordsCount: Object.keys(globalStats.chineseWords || {}).length,
    englishWordsCount: Object.keys(globalStats.englishWords || {}).length,
  });
}

/**
 * 处理代码统计 - 提取子函数优化性能
 */
function processCodeStats(text) {
  // 方法1: 提取代码块
  const codeBlockMatches = text.match(/```[\s\S]*?```/g);
  if (codeBlockMatches) {
    codeBlockMatches.forEach(block => {
      const codeContent = block.replace(/```[\w]*\n?/g, '').replace(/```/g, '');
      const codeChars = codeContent.length;
      if (codeChars > 0) {
        globalStats.totalCodeChars += codeChars;
      }
    });
  }

  // 方法2: 提取行内代码
  const inlineCodeMatches = text.match(/`[^`\n]+`/g);
  if (inlineCodeMatches) {
    inlineCodeMatches.forEach(inline => {
      const codeContent = inline.replace(/`/g, '');
      const codeChars = codeContent.length;
      if (codeChars > 0) {
        globalStats.totalCodeChars += codeChars;
      }
    });
  }

  // 方法3: 代码特征检测
  if (!codeBlockMatches && !inlineCodeMatches) {
    let codeScore = 0;
    for (const pattern of CODE_PATTERNS) {
      if (pattern.test(text)) codeScore++;
    }
    for (const keyword of CODE_KEYWORDS) {
      if (text.includes(keyword)) {
        codeScore += 2;
        break;
      }
    }

    if (codeScore >= 3) {
      const codeStartPattern = /\b(function|class|const|let|var|def |func |fn |import |#include|public|private)\b/i;
      const match = text.match(codeStartPattern);
      if (match && match.index !== undefined) {
        const codeStart = match.index;
        const codeEnd = Math.min(codeStart + 5000, text.length);
        const codeChars = Math.round((codeEnd - codeStart) * 0.7);
        globalStats.totalCodeChars += codeChars;
      }
    }
  }
}

/**
 * 处理时间戳统计
 */
function processTimestampStats(timestamp) {
  try {
    const date = new Date(timestamp);
    const hour = date.getHours();
    globalStats.hourlyActivity[hour]++;
    
    const dateStr = date.toISOString().split('T')[0];
    globalStats.dailyActivity[dateStr] = (globalStats.dailyActivity[dateStr] || 0) + 1;
  } catch (e) {
    // 静默处理错误，避免大量日志输出
  }
}

/**
 * 处理用户消息统计
 */
function processUserMessageStats(text) {
  const textLength = text.length;
  globalStats.userBehaviorStats.totalUserChars += textLength;
  
  if (text.includes('?') || text.includes('？')) {
    globalStats.userBehaviorStats.questionMessageCount++;
  }
  
  const qingMatches = text.match(/请/g);
  if (qingMatches) globalStats.qingCount += qingMatches.length;
  
  const buMatches = text.match(/不/g);
  if (buMatches) globalStats.buCount += buMatches.length;
  
  extractWordsFromText(text);
  extractChineseWordsForTop10(text);
  extractWordCloudData(text);
}

/**
 * 从文本中提取单词 - 优化版本
 * 使用全局缓存的停用词表
 */
function extractWordsFromText(text) {
  // 分词：支持中英文
  const wordPattern = /[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g;
  const words = text.match(wordPattern) || [];

  // 统计词频
  words.forEach(word => {
    if (word.length < 2) return;
    if (word.length > 20) return;

    const lowerWord = word.toLowerCase();
    if (GLOBAL_STOP_WORDS.has(lowerWord)) return;

    globalStats.topPrompts[lowerWord] = (globalStats.topPrompts[lowerWord] || 0) + 1;
  });
}

// 显示加载状态
function showLoading(message = null) {
  console.log('[Main] 显示加载状态...', message || '');
  elements.uploadSection.classList.add('hidden');
  elements.loadingSection.classList.remove('hidden');
  elements.dashboardSection.classList.add('hidden');
  
  // 如果提供了消息，更新加载提示文本
  if (message && elements.loadingProgress) {
    elements.loadingProgress.textContent = message;
  }
  
  console.log('[Main] ✅ 加载状态已显示');
}

// 隐藏加载状态
function hideLoading() {
  if (elements.loadingSection) {
    elements.loadingSection.classList.add('hidden');
  }
}

// 显示上传错误
function showUploadError(message) {
  console.error('[Main] 上传错误:', message);
  if (elements.uploadError) {
    elements.uploadError.textContent = message;
    elements.uploadError.classList.remove('hidden');
  }
}

// 隐藏上传错误
function hideUploadError() {
  if (elements.uploadError) {
    elements.uploadError.classList.add('hidden');
    elements.uploadError.textContent = '';
  }
}

// 更新加载进度
function updateLoadingProgress(current, total) {
  const progressText = `已处理 ${current}/${total} 个文件`;
  if (elements.loadingProgress) {
    elements.loadingProgress.textContent = progressText;
  }
  console.log(`[Main] ${progressText}`);
}

// 显示分析结果
function showDashboard() {
  console.log('[Main] 显示分析结果...');
  // 隐藏上传和加载区域，显示仪表盘
  if (elements.uploadSection) elements.uploadSection.classList.add('hidden');
  if (elements.loadingSection) elements.loadingSection.classList.add('hidden');
  if (elements.dashboardSection) {
    elements.dashboardSection.classList.remove('hidden');
    elements.dashboardSection.style.display = 'block';
  }
  
  // 显示所有统计网格
  const statsGrids = document.querySelectorAll('.stats-grid');
  statsGrids.forEach(grid => {
    grid.classList.remove('hidden');
    grid.style.display = 'grid';
  });
  
  // 显示词云区域
  const wordcloudSection = document.querySelector('.wordcloud-section');
  if (wordcloudSection) {
    wordcloudSection.classList.remove('hidden');
    wordcloudSection.style.display = 'grid';
  }
  
  // 显示所有图表卡片
  const chartCards = document.querySelectorAll('.chart-card');
  chartCards.forEach(card => {
    if (!card.classList.contains('hidden') && card.id !== 'techStackSection') {
      card.style.display = 'block';
    }
  });
  
  // 显示对话列表区域
  const chatListSection = document.querySelector('.chat-list-section');
  if (chatListSection) {
    chatListSection.style.display = 'block';
  }
  
  console.log('[Main] ✅ 分析结果已显示');
}

// 显示统计信息
function displayStats() {
  console.log('[Main] 开始显示统计信息...');

  try {
    // 使用全局统计
    const stats = {
      totalConversations: globalStats.totalConversations,
      totalCodeChars: globalStats.totalCodeChars,
      modelUsage: globalStats.modelUsage,
      userMessages: globalStats.userMessages,
      qingCount: globalStats.qingCount || 0,
      buCount: globalStats.buCount || 0,
      topChineseWordsList: getTopChineseWords(globalStats.topChineseWords, 10),
    };

    console.log('[Main] 统计数据:', {
      totalConversations: stats.totalConversations,
      totalCodeChars: stats.totalCodeChars,
      userMessages: stats.userMessages,
      qingCount: stats.qingCount,
      buCount: stats.buCount,
      topChineseWordsList: stats.topChineseWordsList?.length || 0,
    });
    console.log('[Main] ✅ "请"字次数:', stats.qingCount);
    console.log('[Main] ✅ "不"字次数:', stats.buCount);

    // 计算使用时长（天数）
    let usageDays = 0;
    if (globalStats.earliestFileTime) {
      const now = Date.now();
      const earliest = globalStats.earliestFileTime;
      const diffMs = now - earliest;
      usageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      console.log('[Main] 使用时长计算:', {
        earliestTime: new Date(earliest).toISOString(),
        nowTime: new Date(now).toISOString(),
        diffMs: diffMs,
        usageDays: usageDays,
      });
    }

    // 更新统计卡片（添加安全检查）
    if (statsElements.totalConversations) {
      statsElements.totalConversations.textContent = formatNumber(usageDays);
    }
    if (statsElements.qingCount) {
      statsElements.qingCount.textContent = formatNumber(stats.qingCount);
    }
    if (statsElements.buCount) {
      statsElements.buCount.textContent = formatNumber(stats.buCount);
    }
    if (statsElements.userMessages) {
      statsElements.userMessages.textContent = formatNumber(stats.userMessages);
    }

    // 更新用户行为统计（只显示有数据的）
    if (globalStats.userBehaviorStats) {
      const behaviorStats = globalStats.userBehaviorStats;
      
      // 更新总字符数（总是显示）
      if (statsElements.totalUserChars) {
        statsElements.totalUserChars.textContent = formatNumber(behaviorStats.totalUserChars || 0);
      }
      
      // 更新平均长度（总是显示）
      if (statsElements.avgUserMessageLength) {
        statsElements.avgUserMessageLength.textContent = formatNumber(behaviorStats.avgUserMessageLength || 0);
      }
      
      // 只显示有数据的统计项
      const questionCard = document.getElementById('questionCard');
      if (questionCard && behaviorStats.questionMessageCount > 0) {
        questionCard.style.display = '';
        if (statsElements.questionMessageCount) {
          statsElements.questionMessageCount.textContent = formatNumber(behaviorStats.questionMessageCount);
        }
      }
      
      // 显示技术栈统计
      displayTechStack(behaviorStats.techStack || {});
    }

    // 显示词云（无论是否有 userBehaviorStats 都要渲染）
    console.log('[Main] 准备渲染词云，数据状态:', {
      chineseWords: Object.keys(globalStats.chineseWords || {}).length,
      englishWords: Object.keys(globalStats.englishWords || {}).length,
    });
    renderWordClouds();

    // 渲染用户提问最多汉字词组
    console.log('[Main] 开始渲染用户提问最多汉字词组...');
    renderTopChineseWords(stats.topChineseWordsList);

    console.log('[Main] ✅ 统计信息显示完成');
  } catch (error) {
    console.error('[Main] ❌ 显示统计信息失败:', error);
    throw error;
  }
}

// 格式化数字（支持多语言和大数值）
export function formatNumber(num, lang = null) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  
  // 获取当前语言
  if (!lang) {
    lang = getCurrentLang();
  }
  const isEn = lang === 'en';
  
  // 英文使用标准格式：K, M, B, T
  if (isEn) {
    if (num >= 1000000000000) {
      // Trillion (万亿)
      return (num / 1000000000000).toFixed(1) + 'T';
    }
    if (num >= 1000000000) {
      // Billion (十亿)
      return (num / 1000000000).toFixed(1) + 'B';
    }
    if (num >= 1000000) {
      // Million (百万)
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      // Thousand (千)
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
  
  // 中文使用万、亿等单位
  if (num >= 1000000000000) {
    // 万亿
    return (num / 1000000000000).toFixed(1) + '万亿';
  }
  if (num >= 100000000000) {
    // 千亿
    return (num / 100000000000).toFixed(1) + '千亿';
  }
  if (num >= 10000000000) {
    // 百亿
    return (num / 10000000000).toFixed(1) + '百亿';
  }
  if (num >= 100000000) {
    // 亿
    return (num / 100000000).toFixed(1) + '亿';
  }
  if (num >= 10000000) {
    // 千万
    return (num / 10000000).toFixed(1) + '千万';
  }
  if (num >= 1000000) {
    // 百万
    return (num / 1000000).toFixed(1) + '百万';
  }
  if (num >= 10000) {
    // 万（包含10万-99.9万，显示为XX.X万，符合中文习惯）
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    // 千（使用K）
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// 获取热门提示词
function getTopPrompts(topPrompts, limit = 5) {
  const entries = Object.entries(topPrompts);
  if (entries.length === 0) return [];

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([prompt, count]) => ({ prompt, count }));
}

// 获取热门汉字词组
function getTopChineseWords(topChineseWords, limit = 10) {
  const entries = Object.entries(topChineseWords || {});
  if (entries.length === 0) return [];

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// 渲染用户提问最多汉字词组
function renderTopChineseWords(topChineseWordsList) {
  console.log('[Main] 开始渲染用户提问最多汉字词组...');
  const container = statsElements.topChineseWordsList || document.getElementById('topChineseWordsList');

  if (!container) {
    console.warn('[Main] topChineseWordsList 容器未找到');
    return;
  }

  if (!topChineseWordsList || topChineseWordsList.length === 0) {
    container.innerHTML = `
      <div class="prompt-item">
        <span class="prompt-text">暂无汉字词组数据</span>
        <span class="prompt-count">0 次</span>
      </div>
    `;
    console.log('[Main] 没有汉字词组数据');
    return;
  }

  console.log(`[Main] 共有 ${topChineseWordsList.length} 个汉字词组`);
  topChineseWordsList.forEach((item, index) => {
    console.log(`  #${index + 1} "${item.word}" ${item.count} 次`);
  });

  container.innerHTML = topChineseWordsList.map((item, index) => `
    <div class="prompt-item">
      <span class="prompt-rank">#${index + 1}</span>
      <span class="prompt-text">${escapeHtml(item.word)}</span>
      <span class="prompt-count">${item.count} 次</span>
    </div>
  `).join('');

  console.log('[Main] ✅ 汉字词组渲染完成');
}

// 渲染对话列表
function renderChatList(chatData) {
  console.log(`[Main] 渲染对话列表，共 ${chatData.length} 条记录`);

  // 保存当前过滤后的数据
  filteredChatData = chatData;

  const container = elements.chatList;
  const totalPages = Math.ceil(chatData.length / itemsPerPage);

  // 重置到第一页（如果数据变少导致当前页超出范围）
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  // 计算当前页的数据范围
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const items = chatData.slice(startIndex, endIndex);

  console.log(`[Main] 显示第 ${currentPage}/${totalPages} 页，共 ${items.length} 条记录`);

  if (items.length === 0) {
    container.innerHTML = `
      <div class="chat-item-more">
        暂无对话记录
      </div>
    `;
    // 隐藏分页器
    if (elements.paginationContainer) {
      elements.paginationContainer.style.display = 'none';
    }
    return;
  }

  try {
    container.innerHTML = items.map((item, index) => {
      // 验证 item 结构
      if (!item) {
        console.warn(`[Main] item ${index} 为 null，跳过`);
        return '';
      }

      const text = item.text || '';
      const role = item.role || 'AI';
      const timestamp = item.timestamp || new Date().toISOString();

      if (text.length === 0) {
        console.warn(`[Main] item ${index} 的文本为空，跳过`);
        return '';
      }

      return `
        <div class="chat-item">
          <div class="chat-item-header">
            <span class="chat-role ${role === 'USER' ? 'role-user' : 'role-ai'}">
              <span style="color: var(--accent-terminal);">${role === 'USER' ? '>' : '$'}</span> ${role}
            </span>
            <span class="chat-time">${formatTime(timestamp)}</span>
          </div>
          <div class="chat-item-content">
            <p>${escapeHtml(text.substring(0, 200))}${text.length > 200 ? '...' : ''}</p>
          </div>
        </div>
      `;
    }).join('');

    // 渲染分页器
    renderPagination(chatData.length, totalPages);

    console.log('[Main] ✅ 对话列表渲染完成');
  } catch (error) {
    console.error('[Main] ❌ 渲染对话列表失败:', error);
    container.innerHTML = `
      <div class="chat-item-more">
        对话列表加载失败：${error.message}
      </div>
    `;
    // 隐藏分页器
    if (elements.paginationContainer) {
      elements.paginationContainer.style.display = 'none';
    }
  }
}

// 渲染分页器
function renderPagination(totalItems, totalPages) {
  if (!elements.paginationContainer || !elements.paginationInfo || !elements.paginationPages) {
    return;
  }

  // 如果只有一页或没有数据，隐藏分页器
  if (totalPages <= 1) {
    elements.paginationContainer.style.display = 'none';
    return;
  }

  // 显示分页器
  elements.paginationContainer.style.display = 'flex';

  // 更新分页信息
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const currentLang = getCurrentLang();
  const paginationText = window.i18n?.getText('chatList.paginationInfo', currentLang) || '第 {currentPage} 页，共 {totalPages} 页（共 {totalItems} 条记录，显示 {startItem}-{endItem} 条）';
  elements.paginationInfo.textContent = paginationText
    .replace('{currentPage}', currentPage)
    .replace('{totalPages}', totalPages)
    .replace('{totalItems}', totalItems)
    .replace('{startItem}', startItem)
    .replace('{endItem}', endItem);

  // 更新上一页/下一页按钮状态
  if (elements.paginationPrev) {
    elements.paginationPrev.disabled = currentPage === 1;
  }
  if (elements.paginationNext) {
    elements.paginationNext.disabled = currentPage === totalPages;
  }

  // 生成页码按钮
  const pagesContainer = elements.paginationPages;
  pagesContainer.innerHTML = '';

  // 计算显示的页码范围
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  // 如果当前页靠近开头，显示更多后面的页码
  if (currentPage <= 3) {
    endPage = Math.min(5, totalPages);
  }

  // 如果当前页靠近结尾，显示更多前面的页码
  if (currentPage >= totalPages - 2) {
    startPage = Math.max(1, totalPages - 4);
  }

  // 添加第一页按钮（如果不在显示范围内）
  if (startPage > 1) {
    const firstBtn = document.createElement('button');
    firstBtn.className = 'pagination-page-btn';
    firstBtn.textContent = '1';
    firstBtn.addEventListener('click', () => {
      currentPage = 1;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(firstBtn);

    if (startPage > 2) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      pagesContainer.appendChild(ellipsis);
    }
  }

  // 添加页码按钮
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = 'pagination-page-btn';
    if (i === currentPage) {
      pageBtn.classList.add('active');
    }
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(pageBtn);
  }

  // 添加最后一页按钮（如果不在显示范围内）
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      pagesContainer.appendChild(ellipsis);
    }

    const lastBtn = document.createElement('button');
    lastBtn.className = 'pagination-page-btn';
    lastBtn.textContent = totalPages;
    lastBtn.addEventListener('click', () => {
      currentPage = totalPages;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(lastBtn);
  }
}

// 处理搜索
function handleSearch(event) {
  if (!event || !event.target) {
    console.warn('[Main] ⚠️ handleSearch 事件对象无效');
    return;
  }

  const keyword = event.target.value.trim();

  // 【调试】检查数据源
  console.log('[Main] 🔍 搜索触发:', {
    keyword,
    allChatDataLength: allChatData?.length || 0,
    filteredChatDataLength: filteredChatData?.length || 0,
    allChatDataExists: !!allChatData,
    isArray: Array.isArray(allChatData),
  });

  // 重置到第一页
  currentPage = 1;

  // 如果没有关键词，显示所有数据
  if (!keyword) {
    const dataToShow = allChatData && allChatData.length > 0 ? allChatData : filteredChatData;
    console.log('[Main] 🔍 清空搜索，显示所有数据:', dataToShow.length, '条');
    renderChatList(dataToShow);
    return;
  }

  // 【修复】确定数据源：优先使用 allChatData，如果为空则使用 filteredChatData
  const dataSource = (allChatData && allChatData.length > 0) ? allChatData : filteredChatData;
  
  if (!dataSource || !Array.isArray(dataSource) || dataSource.length === 0) {
    console.warn('[Main] ⚠️ 搜索数据源为空，无法执行搜索');
    renderChatList([]);
    return;
  }

  // 【修复】增强搜索逻辑，处理多种数据结构和字段名
  const lowerKeyword = keyword.toLowerCase();
  let matchCount = 0;
  
  const filtered = dataSource.filter((item, index) => {
    if (!item) {
      return false;
    }
    
    // 尝试多种可能的文本字段
    const text = item.text || item.content || item.message?.text || item.message?.content || '';
    
    // 如果文本为空，跳过
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    // 执行搜索（不区分大小写）
    const matches = text.toLowerCase().includes(lowerKeyword);
    
    // 【调试】记录前几个匹配项
    if (matches && matchCount < 3) {
      console.log(`[Main] 🔍 匹配项 ${matchCount + 1}:`, {
        index,
        textPreview: text.substring(0, 50) + '...',
        role: item.role || 'unknown',
      });
      matchCount++;
    }
    
    return matches;
  });

  console.log(`[Main] 🔍 搜索关键词: "${keyword}", 从 ${dataSource.length} 条记录中找到 ${filtered.length} 条匹配记录`);
  
  if (filtered.length === 0) {
    console.log('[Main] 🔍 未找到匹配记录，可能的原因：');
    console.log('  - 关键词拼写错误');
    console.log('  - 数据源为空或格式不正确');
    console.log('  - 文本字段不存在');
    
    // 【调试】显示数据源的前几条记录结构
    if (dataSource.length > 0) {
      console.log('[Main] 🔍 数据源示例（前3条）:', dataSource.slice(0, 3).map((item, idx) => ({
        index: idx,
        hasText: !!item.text,
        hasContent: !!item.content,
        hasMessage: !!item.message,
        textPreview: (item.text || item.content || '').substring(0, 30),
        keys: Object.keys(item),
      })));
    }
  }
  
  renderChatList(filtered);
}

// 导出图片
async function handleExport() {
  const exportArea = elements.exportArea;

  try {
    // 【V6 同步逻辑锁】确保在获取到后端 /api/v2/analyze 的返回数据（特别是答案之书文案）之前处于 loading 状态
    // 检查是否已获取到后端数据（答案之书文案）
    let answerTextEl = document.querySelector('[data-v6-key="answer_text"]');
    let hasAnswerText = answerTextEl && answerTextEl.textContent && answerTextEl.textContent.trim() !== '';
    
    // 如果答案之书文案为空，说明后端数据还未返回，等待数据
    if (!hasAnswerText) {
      console.log('[Main] ⏳ 等待后端数据（答案之书文案）...');
      // 显示导出中提示
      const originalText = elements.exportBtn.innerHTML;
      elements.exportBtn.innerHTML = '<span class="btn-icon">⏳</span><span>等待数据中...</span>';
      elements.exportBtn.disabled = true;
      
      // 轮询等待答案之书文案（最多等待 5 秒）
      let waitCount = 0;
      const maxWait = 50; // 50 * 100ms = 5秒
      while (!hasAnswerText && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
        answerTextEl = document.querySelector('[data-v6-key="answer_text"]');
        hasAnswerText = answerTextEl && answerTextEl.textContent && answerTextEl.textContent.trim() !== '';
        if (hasAnswerText) {
          console.log('[Main] ✅ 后端数据已就绪');
          break;
        }
      }
      
      if (waitCount >= maxWait) {
        console.warn('[Main] ⚠️ 等待后端数据超时，继续导出（可能缺少答案之书文案）');
      }
    }
    
    // 显示导出中提示
    const originalText = elements.exportBtn.innerHTML;
    elements.exportBtn.innerHTML = '<span class="btn-icon">⏳</span><span>生成中...</span>';
    elements.exportBtn.disabled = true;

    // 【V6 约束】确保所有动态数据注入都在 html2canvas 截图触发前完成
    // 等待所有异步 UI 更新完成
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 确保行为标签已渲染
    if (vibeCodingApp && vibeResult && vibeResult.stats) {
      if (typeof vibeCodingApp.renderBehaviorTags === 'function') {
        vibeCodingApp.renderBehaviorTags(vibeResult.stats, 'behavior-tags-container');
      }
      // 确保全网数据已同步
      if (typeof vibeCodingApp.syncGlobalStats === 'function' && vibeCodingApp.globalStatsCache) {
        vibeCodingApp.syncGlobalStats(vibeCodingApp.globalStatsCache);
      }
    }
    
    // 再次等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 100));

    // 使用全局 html2canvas 对象（通过 CDN 加载）
    const html2canvas = window.html2canvas || globalThis.html2canvas;
    if (!html2canvas) {
      throw new Error('html2canvas 未加载，请确保 CDN 资源已正确加载');
    }

    // 使用 html2canvas 导出
    const canvas = await html2canvas(exportArea, {
      backgroundColor: '#ffffff',
      scale: 2, // 高清导出
      useCORS: true,
      logging: false,
    });

    // 下载图片
    const link = document.createElement('a');
    link.download = `cursor-audit-${new Date().getTime()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // 恢复按钮
    elements.exportBtn.innerHTML = originalText;
    elements.exportBtn.disabled = false;

    console.log('[Main] 导出成功');
  } catch (error) {
    console.error('[Main] 导出失败:', error);
    alert('导出失败: ' + error.message);

    elements.exportBtn.innerHTML = '<span class="btn-icon">📊</span><span>晒出cursor受虐证据</span>';
    elements.exportBtn.disabled = false;
  }
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 安全解析 personality_data（可能为 JSON 字符串，含转义双引号）
 * @param {*} raw - 对象或字符串
 * @returns {Object|null} 解析后的对象或 null
 */
function safeParsePersonalityData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || raw.length < 2) return null;
  try {
    var s = String(raw).replace(/\\"/g, '"');
    return JSON.parse(s);
  } catch (e1) {
    try {
      return JSON.parse(raw);
    } catch (e2) {
      return null;
    }
  }
}

/** 是否为不可直接展示的人格文案（严禁展示给用户） */
function isInvalidPersonalityText(s) {
  if (s == null || String(s).trim() === '') return true;
  var t = String(s);
  if (/正在生成中|正在由后端生成|正在破译|Deciphering your personality|personality combination is so unique that even our AI needs more time/i.test(t)) return true;
  if (/索引\s*\d+\s*对应的吐槽文案(正在由后端生成中|未找到)/.test(t) && /人格组合太独特/.test(t)) return true;
  return false;
}

/** 后端失效时根据 dimensions 最高两维动态拼接人格描述（供预览与完整报告共用） */
function fallbackInterpretationFromDimensions(dims, lang) {
  if (!dims || typeof dims !== 'object') return lang === 'en' ? 'A developer with a unique vibe.' : '一位风格鲜明的开发者。';
  var labels = lang === 'en'
    ? { L: 'Logic', P: 'Patience', D: 'Detail', E: 'Exploration', F: 'Feedback' }
    : { L: '逻辑', P: '耐性', D: '细节', E: '探索', F: '反馈' };
  var entries = Object.entries(dims).filter(function (e) { return e[0] && labels[e[0]] != null; }).map(function (e) { return { key: e[0], value: Number(e[1]) || 0 }; });
  entries.sort(function (a, b) { return b.value - a.value; });
  var top2 = entries.slice(0, 2);
  if (top2.length === 0) return lang === 'en' ? 'A developer with a unique vibe.' : '一位风格鲜明的开发者。';
  if (top2.length === 1) {
    return lang === 'en'
      ? 'A developer strong in ' + labels[top2[0].key] + '.'
      : '一位极具' + labels[top2[0].key] + '的代码架构师。';
  }
  return lang === 'en'
    ? 'A developer with strong ' + labels[top2[0].key] + ' and ' + labels[top2[1].key].toLowerCase() + '.'
    : '一位极具' + labels[top2[0].key] + '且' + (top2[1].value >= 70 ? '极度' : '较为') + labels[top2[1].key] + '的代码架构师。';
}

// 显示 Vibe Codinger 人格分析结果
function displayVibeCodingerAnalysis() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2179',message:'displayVibeCodingerAnalysis called',data:{vibeResultExists:!!vibeResult,vibeResultKeys:vibeResult?Object.keys(vibeResult):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!vibeResult) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2180',message:'vibeResult is null/undefined, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return;
  }

  // 查找容器（支持多个ID）
  const container = document.getElementById('vibeCodingerSection') || document.getElementById('personality-lock');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2183',message:'container lookup',data:{containerFound:!!container,containerId:container?.id,hasVibeCodingerSection:!!document.getElementById('vibeCodingerSection'),hasPersonalityLock:!!document.getElementById('personality-lock')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  if (!container) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2184',message:'container not found, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return;
  }

  const { personalityType, dimensions, analysis, semanticFingerprint, statistics, vibeIndex, roastText, personalityName, stats } = vibeResult;

  // 【调试】打印完整 payload，便于排查 interpretation/roastText 为空问题
  try {
    var finalVibePayload = {
      dimensions: dimensions,
      vibeIndex: vibeIndex,
      roastText: roastText ? String(roastText).substring(0, 80) + (roastText.length > 80 ? '...' : '') : '',
      personalityName: personalityName,
      detailedStats: vibeResult.personality?.detailedStats || vibeResult.detailedStats || [],
    };
    console.log('[Main] finalVibePayload', finalVibePayload);
  } catch (_) {}

  var safeRoastText = roastText;
  if (isInvalidPersonalityText(safeRoastText)) {
    safeRoastText = fallbackInterpretationFromDimensions(dimensions, getCurrentLang());
    if (vibeResult) vibeResult.roastText = safeRoastText;
    console.log('[Main] interpretation/roastText 无效，已触发 fallbackInterpretation:', safeRoastText.substring(0, 50) + '...');
  }
  
  // 【V6 语义指纹统一化】从 VibeCodingerAnalyzer 的 generateLPDEF 方法获取结果
  let lpdef = vibeResult.lpdef;
  if (!lpdef && dimensions && vibeAnalyzer && typeof vibeAnalyzer.generateLPDEF === 'function') {
    try {
      lpdef = vibeAnalyzer.generateLPDEF(dimensions);
      console.log('[Main] ✅ 从 analyzer.generateLPDEF 获取 LPDEF:', lpdef);
    } catch (error) {
      console.warn('[Main] generateLPDEF 调用失败:', error);
      lpdef = 'L0P0D0E0F0'; // 降级默认值
    }
  } else if (!lpdef) {
    lpdef = 'L0P0D0E0F0'; // 降级默认值
  }
  
  // 【关键修复】确保 semanticFingerprint 完整，如果后端返回的不完整，使用前端生成
  let finalSemanticFingerprint = semanticFingerprint;
  if (!finalSemanticFingerprint || !finalSemanticFingerprint.codeRatio || !finalSemanticFingerprint.patienceLevel) {
    console.log('[Main] ⚠️ semanticFingerprint 不完整，使用前端生成');
    if (dimensions && vibeAnalyzer && typeof vibeAnalyzer.generateSemanticFingerprint === 'function') {
      try {
        finalSemanticFingerprint = vibeAnalyzer.generateSemanticFingerprint(dimensions);
        console.log('[Main] ✅ 从 analyzer.generateSemanticFingerprint 获取完整语义指纹');
      } catch (error) {
        console.warn('[Main] generateSemanticFingerprint 调用失败:', error);
      }
    }
  }
  
  // 如果仍然不完整，使用默认值
  if (!finalSemanticFingerprint) {
    finalSemanticFingerprint = {
      codeRatio: '0%',
      patienceLevel: 'N/A',
      detailLevel: 'N/A',
      techExploration: 'N/A',
      feedbackDensity: '0%',
      compositeScore: 0,
      techDiversity: 'N/A',
      interactionStyle: 'N/A',
    };
  }
  
  // 【V6 适配】从 stats 对象中提取数据（健壮性保障：使用默认值）
  const safeStats = stats || statistics || {};
  const ketaoCount = safeStats.ketao_count || safeStats.qingCount || 0;
  const jiafangCount = safeStats.jiafang_count || safeStats.buCount || 0;
  const workDays = safeStats.work_days || safeStats.usageDays || 1;

  // 【优化】文案已迁移到后端，直接使用后端返回的 roastText 和 personalityName
  // 不再调用本地 matchRoast 或 getRoastText 函数
  // 确保使用后端返回的精准数据：
  // - roastText: 后端返回的吐槽文案
  // - personalityName: 后端返回的人格标题
  // - dimensions: 后端返回的精准维度得分（已在 uploadToSupabase 中同步）

  // 生成人格头衔（根据索引特征，用于显示维度组合）
  const getPersonalityTitle = (index) => {
    const lang = getCurrentLang();
    const personalityTitles = lang === 'en' 
      ? window.i18n?.getI18nText('en')?.vibeCodinger?.personalityTitles
      : window.i18n?.getI18nText('zh-CN')?.vibeCodinger?.personalityTitles;
    
    if (!personalityTitles) {
      // Fallback to hardcoded Chinese
      const l = index[0] === '2' ? '硬核' : index[0] === '1' ? '标准' : '随性';
      const p = index[1] === '2' ? '耐心' : index[1] === '1' ? '平衡' : '急躁';
      const d = index[2] === '2' ? '细节控' : index[2] === '1' ? '适中' : '极简';
      const e = index[3] === '2' ? '探索者' : index[3] === '1' ? '观望' : '守旧';
      const f = index[4] === '2' ? '暖男' : index[4] === '1' ? '职业' : '冷酷';
      return `${l}·${p}·${d}·${e}·${f}`;
    }
    
    const l = index[0] === '2' ? personalityTitles.l[2] : index[0] === '1' ? personalityTitles.l[1] : personalityTitles.l[0];
    const p = index[1] === '2' ? personalityTitles.p[2] : index[1] === '1' ? personalityTitles.p[1] : personalityTitles.p[0];
    const d = index[2] === '2' ? personalityTitles.d[2] : index[2] === '1' ? personalityTitles.d[1] : personalityTitles.d[0];
    const e = index[3] === '2' ? personalityTitles.e[2] : index[3] === '1' ? personalityTitles.e[1] : personalityTitles.e[0];
    const f = index[4] === '2' ? personalityTitles.f[2] : index[4] === '1' ? personalityTitles.f[1] : personalityTitles.f[0];
    return `${l}·${p}·${d}·${e}·${f}`;
  };

  // 生成维度标签
  const getDimensionTags = (dimensions) => {
    const tags = [];
    const lang = getCurrentLang();
    Object.entries(dimensions).forEach(([key, value]) => {
      // E 维度特殊处理
      let level;
      const dimInfo = window.i18n?.getI18nText(lang)?.dimensions?.[key];
      if (key === 'E') {
        level = value < 5 ? (dimInfo?.levels?.low || '低') : value < 10 ? (dimInfo?.levels?.medium || '中') : (dimInfo?.levels?.high || '高');
      } else {
        level = value < 40 ? (dimInfo?.levels?.low || '低') : value < 70 ? (dimInfo?.levels?.medium || '中') : (dimInfo?.levels?.high || '高');
      }
      // 使用 i18n 获取翻译后的标签
      const label = dimInfo?.label || window.i18n?.getText(`dimensions.${key}.label`, lang) || DIMENSIONS[key].label;
      tags.push(`${label}:${level}`);
    });
    return tags;
  };

  // 渲染人格画像
  container.innerHTML = `
    <div class="vibe-header">
      <h2 class="vibe-title">${t('vibeCodinger.title')}</h2>
      <div class="vibe-badge" style="background: transparent; border: 2px solid var(--accent-terminal);">
        <span class="vibe-type">${personalityType}</span>
        <span class="vibe-name">${personalityName || analysis.name}</span>
      </div>
      <p class="vibe-description">${analysis.description}</p>
    </div>

    <!-- 新增：人格头衔和吐槽区域 -->
    <div class="vibe-roast-section">
      <div class="roast-header">
        <h3 class="roast-title">${t('vibeCodinger.roastTitle')}</h3>
        <div class="personality-title">${getPersonalityTitle(vibeIndex)}</div>
        <div class="vibe-index">${getCurrentLang() === 'en' ? `${t('vibeCodinger.lpdef')}: ${lpdef || 'N/A'}` : `${t('vibeCodinger.index')}: ${vibeIndex} | ${t('vibeCodinger.lpdef')}: ${lpdef || 'N/A'}`}</div>
      </div>
      <div class="roast-content">
        <p class="roast-text">${safeRoastText}</p>
      </div>
      <div class="dimension-tags">
        ${getDimensionTags(dimensions).map(tag => `
          <span class="dimension-tag">${tag}</span>
        `).join('')}
      </div>
    </div>

    <div class="vibe-dimensions">
      <h3 class="dimensions-title">${t('vibeCodinger.dimensionsTitle')}</h3>
      ${Object.entries(dimensions).map(([key, value]) => {
        // 【V6 架构修复】优先从 personality.detailedStats 读取数据
        // 数据流向：后端 scoring.ts → rank-content.ts → matchRankLevel → personality.detailedStats
        const detailedStats = vibeResult.personality?.detailedStats || vibeResult.detailedStats || [];
        const detailedStat = detailedStats.find(stat => stat.dimension === key);
        
        // 优先使用 detailedStats 中的文案，降级到 analysis.dimensions[key]；严禁展示「正在生成中」或空
        let dimInterpretation = (detailedStat && detailedStat.roast) || (analysis.dimensions && analysis.dimensions[key] && analysis.dimensions[key].interpretation) || '';
        if (isInvalidPersonalityText(dimInterpretation)) {
          dimInterpretation = (getCurrentLang() === 'en' ? (key + ' dimension: ' + (value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low')) : (key + '维度' + (value >= 70 ? '表现突出' : value >= 40 ? '中等水平' : '有待提升')));
          if (typeof console !== 'undefined' && console.log) console.log('[Main] 维度 ' + key + ' interpretation 为空或占位，已使用 fallback');
        }
        const dimInfo = detailedStat ? {
          level: detailedStat.label || '未知',
          interpretation: dimInterpretation || '暂无吐槽文案'
        } : (analysis.dimensions && analysis.dimensions[key] ? { level: analysis.dimensions[key].level || '未知', interpretation: dimInterpretation || '暂无吐槽文案' } : { level: '未知', interpretation: dimInterpretation || '暂无吐槽文案' });
        
        const percentage = value;
        const dimLabel = window.i18n?.getI18nText(getCurrentLang())?.dimensions?.[key]?.label || DIMENSIONS[key].label;
        const dimDesc = window.i18n?.getI18nText(getCurrentLang())?.dimensions?.[key]?.description || DIMENSIONS[key].description;
        return `
          <div class="dimension-card" data-v6-dim="${key}">
            <div class="dimension-header">
              <span class="dimension-key">${key}</span>
              <span class="dimension-label">${dimLabel}</span>
              <span class="dimension-value">${value}</span>
              <span class="dimension-level rank-label">${dimInfo.level}</span>
            </div>
            <div class="dimension-bar-container">
              <div class="dimension-bar" style="width: ${percentage}%; background: var(--accent-terminal)"></div>
            </div>
            <p class="dimension-interpretation roast-text">${dimInfo.interpretation}</p>
            <p class="dimension-desc">${dimDesc}</p>
          </div>
        `;
      }).join('')}
    </div>

    <div class="vibe-traits" id="personality-traits" style="scroll-margin-top: 80px;">
      <h3 class="traits-title">${t('vibeCodinger.traitsTitle')}</h3>
      <div class="traits-list">
        ${analysis.traits.map(trait => `
          <div class="trait-tag">${trait}</div>
        `).join('')}
      </div>
    </div>

    <div class="vibe-fingerprint" id="semantic-fingerprint" style="scroll-margin-top: 80px;">
      <h3 class="fingerprint-title">${t('vibeCodinger.fingerprintTitle')}</h3>
      <div class="fingerprint-grid">
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.codeRatio')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.codeRatio || 'N/A'}</span>
          ${finalSemanticFingerprint.codeRatioDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.codeRatioDesc}</span>` : ''}
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.patienceLevel')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.patienceLevel || 'N/A'}</span>
          ${finalSemanticFingerprint.patienceLevelDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.patienceLevelDesc}</span>` : ''}
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.detailLevel')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.detailLevel || 'N/A'}</span>
          ${finalSemanticFingerprint.detailLevelDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.detailLevelDesc}</span>` : ''}
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.techExploration')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.techExploration || 'N/A'}</span>
          ${finalSemanticFingerprint.techExplorationDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.techExplorationDesc}</span>` : ''}
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.feedbackDensity')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.feedbackDensity || 'N/A'}</span>
          ${finalSemanticFingerprint.feedbackDensityDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.feedbackDensityDesc}</span>` : ''}
        </div>
        ${finalSemanticFingerprint.compositeScore !== undefined ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.score')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.compositeScore}</span>
          ${finalSemanticFingerprint.compositeScoreDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.compositeScoreDesc}</span>` : ''}
        </div>
        ` : ''}
        ${finalSemanticFingerprint.techDiversity ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.diversity')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.techDiversity}</span>
          ${finalSemanticFingerprint.techDiversityDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.techDiversityDesc}</span>` : ''}
        </div>
        ` : ''}
        ${finalSemanticFingerprint.interactionStyle ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.style')}</span>
          <span class="fingerprint-value">${finalSemanticFingerprint.interactionStyle}</span>
          ${finalSemanticFingerprint.interactionStyleDesc ? `<span class="fingerprint-desc">${finalSemanticFingerprint.interactionStyleDesc}</span>` : ''}
        </div>
        ` : ''}
      </div>
    </div>


    <!-- 【V6 UI 渲染引擎升级】稳定性勋章 -->
    ${safeStats?.balance_score !== undefined ? `
    <div class="balance-score-section" id="balance-score-section" style="scroll-margin-top: 80px; margin-top: 20px;">
      <h3 class="balance-score-title">${getCurrentLang() === 'en' ? 'Personality Stability' : '人格稳定性'}</h3>
      <div class="balance-score-progress-container">
        <div class="balance-score-progress-bar" style="width: ${Math.min(100, Math.max(0, safeStats.balance_score || 0))}%; background: linear-gradient(90deg, var(--accent-terminal), #4CAF50); height: 30px; border-radius: 15px; transition: width 0.5s ease;">
          <span class="balance-score-text" style="line-height: 30px; padding: 0 15px; color: white; font-weight: bold;">
            ${Math.round(safeStats.balance_score || 0)}%
          </span>
        </div>
      </div>
    </div>
    ` : ''}

    <div class="vibe-chart-container" id="radar-chart" style="scroll-margin-top: 80px;">
      <h3 class="chart-title">${t('vibeCodinger.chartTitle')}</h3>
      <div class="chart-wrapper">
        <canvas id="vibeRadarChart"></canvas>
      </div>
    </div>
  `;
  
  // 【V6 自动化渲染引擎】在 DOM 渲染完成后调用 renderBehaviorTags
  setTimeout(() => {
    if (vibeCodingApp && typeof vibeCodingApp.renderBehaviorTags === 'function') {
      vibeCodingApp.renderBehaviorTags(safeStats, 'behavior-tags-container');
    }
  }, 100);

  // 【V6 自动化渲染引擎】在 DOM 渲染完成后调用 renderBehaviorTags 和 syncGlobalStats
  setTimeout(() => {
    if (vibeCodingApp && typeof vibeCodingApp.renderBehaviorTags === 'function') {
      vibeCodingApp.renderBehaviorTags(safeStats, 'behavior-tags-container');
    }
  }, 100);

  // 渲染雷达图（增强版，显示所有维度）
  // 【优化】确保在渲染前获取全局平均值（用于背景参考线）
  // 如果全局平均值未加载，先尝试获取，然后再渲染
  if (!globalAverageDataLoaded && !globalAverageDataLoading) {
    console.log('[Main] 渲染前检测到全局平均值未加载，先获取数据...');
    globalAverageDataLoading = true;
    fetchGlobalAverage().then(avg => {
      const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
      if (!isDefaultValue) {
        globalAverageData = avg;
        globalAverageDataLoaded = true;
        console.log('[Main] ✅ 渲染前获取全局平均值成功:', globalAverageData);
      }
      globalAverageDataLoading = false;
      // 数据获取完成后渲染雷达图
      renderVibeRadarChart();
    }).catch(error => {
      console.error('[Main] ❌ 渲染前获取全局平均值失败:', error);
      globalAverageDataLoading = false;
      // 即使失败也渲染雷达图（使用默认值）
      renderVibeRadarChart();
    });
  } else {
    // 如果数据已加载或正在加载，直接渲染
    renderVibeRadarChart();
  }
}

// 获取维度颜色
function getDimensionColor(key) {
  const colors = {
    L: '#10b981', // 绿色 - 逻辑力
    P: '#3b82f6', // 蓝色 - 耐心值
    D: '#8b5cf6', // 紫色 - 细腻度
    E: '#f59e0b', // 橙色 - 探索欲
    F: '#ec4899', // 粉色 - 反馈感
  };
  return colors[key] || '#666';
}

// 渲染雷达图（增强版：包含全局平均基准对比层）
function renderVibeRadarChart() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2370',message:'renderVibeRadarChart called',data:{hasVibeResult:!!vibeResult,hasWindowChart:!!window.Chart,hasGlobalChart:!!globalThis.Chart,chartType:typeof(window.Chart||globalThis.Chart)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  // 使用全局 Chart 对象（通过 CDN 加载）
  const Chart = window.Chart || globalThis.Chart;
  if (!vibeResult || !Chart) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2373',message:'Chart.js not loaded or vibeResult missing',data:{hasVibeResult:!!vibeResult,hasChart:!!Chart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.warn('[Main] Chart.js 未加载，无法渲染雷达图');
    return;
  }

  const canvas = document.getElementById('vibeRadarChart');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2378',message:'canvas lookup',data:{canvasFound:!!canvas,canvasId:canvas?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!canvas) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77cf65a2-f6f6-400e-839c-82d53b031ba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:2379',message:'canvas not found, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return;
  }

  const { dimensions } = vibeResult;
  const ctx = canvas.getContext('2d');

  // 销毁旧图表
  if (window.vibeRadarChartInstance) {
    window.vibeRadarChartInstance.destroy();
  }

  // 获取全局平均基准（优先级：1. 从 API 获取的全局变量 globalAverageData 2. vibeResult 中的值 3. 默认值）
  // 如果数据未加载且不在加载中，尝试重新获取
  if (!globalAverageDataLoaded && !globalAverageDataLoading) {
    console.log('[Main] 雷达图渲染时检测到数据未加载，尝试重新获取...');
    globalAverageDataLoading = true;
    fetchGlobalAverage().then(avg => {
      const isDefaultValue = avg.L === 50 && avg.P === 50 && avg.D === 50 && avg.E === 50 && avg.F === 50;
      if (!isDefaultValue) {
        globalAverageData = avg;
        globalAverageDataLoaded = true;
        console.log('[Main] ✅ 重新获取全局平均值成功:', globalAverageData);
        // 重新渲染雷达图
        renderVibeRadarChart();
      } else {
        console.warn('[Main] ⚠️ 重新获取的数据仍是默认值');
        globalAverageDataLoaded = false;
      }
      globalAverageDataLoading = false;
    }).catch(error => {
      console.error('[Main] ❌ 重新获取全局平均值失败:', error);
      globalAverageDataLoaded = false;
      globalAverageDataLoading = false;
    });
  }
  
  // 检查 globalAverageData 是否是默认值（所有值都是50）
  const isUsingDefault = globalAverageData.L === 50 && 
                         globalAverageData.P === 50 && 
                         globalAverageData.D === 50 && 
                         globalAverageData.E === 50 && 
                         globalAverageData.F === 50;
  
  // 如果使用的是默认值且数据未加载，记录警告
  if (isUsingDefault && !globalAverageDataLoaded) {
    console.warn('[Main] ⚠️ 雷达图使用默认全局平均值，API 数据可能未加载成功');
    console.log('[Main] 当前 globalAverageData:', globalAverageData);
    console.log('[Main] 当前 globalAverageDataLoaded:', globalAverageDataLoaded);
  }
  
  const chartGlobalAverage = globalAverageData || vibeResult.globalAverage || {
    L: 50,
    P: 50,
    D: 50,
    E: 50,
    F: 50,
  };
  
  console.log('[Main] 雷达图使用的全局平均值:', {
    source: globalAverageDataLoaded ? 'API' : (vibeResult.globalAverage ? 'vibeResult' : 'default'),
    data: chartGlobalAverage
  });

  // E 维度现在已经是归一化的 0-100 分数，不需要手动映射
  const eValue = dimensions.E;
  const eAverage = chartGlobalAverage.E;
  
  // 获取当前语言
  const currentLang = getCurrentLang();
  const isEn = currentLang === 'en';
  
  // 使用 i18n 获取维度标签
  const dimLabels = ['L', 'P', 'D', 'E', 'F'].map(key => {
    const dimInfo = window.i18n?.getI18nText(currentLang)?.dimensions?.[key];
    const label = dimInfo?.label || DIMENSIONS[key]?.label || key;
    return `${label} (${key})`;
  });
  
  // 使用 i18n 获取数据集标签
  const yourScoreLabel = window.i18n?.getText('dashboard.radarChart.yourScore', currentLang) || '你的得分';
  const globalAverageLabel = window.i18n?.getText('dashboard.radarChart.globalAverage', currentLang) || '全网平均';
  
  // Chart 已在函数开头声明，直接使用
  window.vibeRadarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: dimLabels,
      datasets: [
        {
          label: yourScoreLabel,
          data: [
            dimensions.L,
            dimensions.P,
            dimensions.D,
            dimensions.E,
            dimensions.F,
          ],
          backgroundColor: 'rgba(0, 255, 65, 0.2)',
          borderColor: 'rgba(0, 255, 65, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(0, 255, 65, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(0, 255, 65, 1)',
          pointRadius: 5,
          pointHoverRadius: 7,
        },
        {
          label: globalAverageLabel,
          data: [
            chartGlobalAverage.L,
            chartGlobalAverage.P,
            chartGlobalAverage.D,
            chartGlobalAverage.E,
            chartGlobalAverage.F,
          ],
          backgroundColor: 'rgba(113, 113, 122, 0.1)',
          borderColor: 'rgba(113, 113, 122, 0.5)',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointBackgroundColor: 'rgba(113, 113, 122, 0.5)',
          pointBorderColor: 'rgba(113, 113, 122, 0.8)',
          pointHoverBackgroundColor: 'rgba(113, 113, 122, 0.8)',
          pointHoverBorderColor: 'rgba(113, 113, 122, 1)',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 20,
          right: 20
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20,
            display: false, // 隐藏数字
          },
          grid: {
            color: 'rgba(0, 255, 65, 0.1)',
          },
          pointLabels: {
            font: {
              size: 12,
            },
            color: '#ffffff',
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#ffffff',
            font: {
              family: "'JetBrains Mono', monospace",
            },
            // 图例颜色块会自动使用数据集的 borderColor（已在上面设置为绿色和深灰色）
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${context.parsed.r}分`;
            },
          },
        },
      },
    },
  });
}
/**
 * 数字滚动动画 - 语法修复版
 */
export function updateNumberWithAnimation(element, newValue, formatter = (v) => v.toString()) {
  if (!element) return;

  // 1. 安全数值转换与防御性编程
  let targetValue = Number(newValue);
  if (isNaN(targetValue) || newValue === null || newValue === undefined) {
    console.warn('[Main] 检测到无效数值，重置为 0');
    targetValue = 0;
  }

  // 2. 获取起始值
  const startValue = parseInt(element.textContent.replace(/[^0-9]/g, '')) || 0;
  const duration = 1500;
  const startTime = performance.now();

  // 3. 内部动画循环
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 缓动算法：先快后慢
    const easeOutQuad = t => t * (2 - t);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuad(progress));

    // 安全渲染
    try {
      element.textContent = formatter(currentValue);
    } catch (e) {
      element.textContent = currentValue.toString();
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  };

  // 4. 启动动画
  requestAnimationFrame(update);
}

// 数字递增动画
function animateNumber(element, from, to, formatter, onComplete) {
  const duration = 800; // 动画时长（毫秒）
  const startTime = Date.now();
  
  // 防御性编程：确保 from 和 to 都是有效数字
  const safeFrom = (typeof from === 'number' && !isNaN(from)) ? from : 0;
  const safeTo = (typeof to === 'number' && !isNaN(to)) ? to : 0;
  const difference = safeTo - safeFrom;
  
  // 安全的格式化函数包装器
  const safeFormatter = (value) => {
    // 确保 value 是有效数字
    const safeValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;
    try {
      return formatter(safeValue);
    } catch (error) {
      console.error('[Main] animateNumber: formatter 执行失败', { value: safeValue, error });
      return '0';
    }
  };
  
  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用缓动函数（ease-out）
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(safeFrom + difference * easeOut);
    
    // 确保 current 是有效数字后再调用 formatter
    const safeCurrent = (typeof current === 'number' && !isNaN(current)) ? current : 0;
    element.textContent = safeFormatter(safeCurrent);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      // 确保 to 是有效数字后再调用 formatter
      element.textContent = safeFormatter(safeTo);
      if (onComplete) onComplete();
    }
  }
  
  update();
}

// API 端点常量
const API_ENDPOINT = 'https://cursor-clinical-analysis.psterman.workers.dev/';
// 移除硬编码默认值，允许从 0 开始计数

// 获取 API 端点（适配 GitHub Pages 和远程 Cloudflare API）
function getApiEndpoint() {
  // 检查环境变量（Cloudflare Pages 可以通过 wrangler.toml 或环境变量设置）
  if (typeof window !== 'undefined') {
    // 尝试从 window 对象获取（可通过 Cloudflare Workers 注入）
    const envApiUrl = window.__API_ENDPOINT__ || window.API_ENDPOINT;
    if (envApiUrl) {
      console.log('[Main] 从 window 对象获取 API 端点:', envApiUrl);
      return envApiUrl;
    }
    
    // 尝试从 meta 标签获取（推荐方式，适用于 GitHub Pages）
    const metaApi = document.querySelector('meta[name="api-endpoint"]');
    if (metaApi && metaApi.content) {
      const apiUrl = metaApi.content.trim();
      // 确保 URL 格式正确（以 / 结尾）
      const normalizedUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
      console.log('[Main] 从 meta 标签获取 API 端点:', normalizedUrl);
      return normalizedUrl;
    }
  }
  
  // 默认 API 端点（远程 Cloudflare Workers）
  console.log('[Main] 使用默认 API 端点:', API_ENDPOINT);
  return API_ENDPOINT;
}

/**
 * 创建带 CORS 配置的 fetch 请求
 * @param {string} url - 请求 URL
 * @param {RequestInit} options - fetch 选项
 * @returns {Promise<Response>} fetch 响应
 */
async function fetchWithCORS(url, options = {}) {
  // 确保 mode 设置为 'cors'（适用于跨域请求，如 GitHub Pages 到 Cloudflare Workers）
  const corsOptions = {
    ...options,
    mode: 'cors',
    credentials: 'omit', // 不发送 cookies，避免 CORS 预检问题
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  
  console.log('[Main] 发起 CORS 请求:', { url, method: corsOptions.method || 'GET' });
  
  try {
    const response = await fetch(url, corsOptions);
    
    // 检查 CORS 错误
    if (!response.ok && response.status === 0) {
      throw new Error('CORS 错误：无法访问远程 API。请检查 API 端点的 CORS 配置。');
    }
    
    return response;
  } catch (error) {
    console.error('[Main] CORS 请求失败:', error);
    throw error;
  }
}

/**
 * 从后端 API 获取全局平均值（用于雷达图背景参考线）
 * @returns {Promise<Object>} 返回全局平均值对象 {L, P, D, E, F}，如果失败则返回默认值
 */
async function fetchGlobalAverage() {
  const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };
  
  try {
    // 使用 API_ENDPOINT 常量，确保指向生产环境
    const apiEndpoint = getApiEndpoint();
    let apiUrl = apiEndpoint.endsWith('/') 
      ? `${apiEndpoint}api/global-average` 
      : `${apiEndpoint}/api/global-average`;
    
    // 【多国通用化】若本地存在锚定国家，则按国家口径请求（避免“切国籍污染统计”）
    try {
      const anchored =
        String(localStorage.getItem('anchored_country') || '').trim().toUpperCase() ||
        String(localStorage.getItem('selected_country') || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(anchored)) {
        apiUrl += `?country_code=${encodeURIComponent(anchored)}`;
      }
    } catch (e) {
      // ignore
    }
    
    console.log('[Main] 开始获取全局平均值，URL:', apiUrl);
    
    // 发送请求
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors',
      credentials: 'omit',
    });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => '无法读取错误信息');
      console.error('[Main] ❌ API 请求失败:', {
        status: res.status,
        statusText: res.statusText,
        error: errorText
      });
      return defaultAverage;
    }
    
    const data = await res.json();
    console.log('[Main] API 返回数据:', data);
    
    if (data.status === 'success' && data.globalAverage) {
      const avg = data.globalAverage;
      // 验证数据格式
      if (typeof avg.L === 'number' && typeof avg.P === 'number' && 
          typeof avg.D === 'number' && typeof avg.E === 'number' && typeof avg.F === 'number') {
        globalAverageData = avg;
        globalAverageDataLoaded = true;
        console.log('[Main] ✅ 成功获取全局平均值:', avg);
        return avg;
      } else {
        console.warn('[Main] ⚠️ 全局平均值数据格式不正确:', avg);
      }
    } else {
      console.warn('[Main] ⚠️ API 返回状态不是 success 或缺少 globalAverage:', data);
    }
  } catch (error) {
    console.error('[Main] ❌ 获取全局平均值异常:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  }
  
  // 保底逻辑：返回默认值
  console.warn('[Main] ⚠️ 使用默认全局平均值');
  return defaultAverage;
}

// 创建带超时的 AbortSignal（兼容性处理）
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // 如果支持 AbortSignal.timeout，优先使用
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    clearTimeout(timeoutId);
    return AbortSignal.timeout(timeoutMs);
  }
  
  return controller.signal;
}

// 统一更新全局统计数字（支持 GET 和 POST）
export async function updateGlobalStats(shouldIncrement = false) {
  const apiEndpoint = getApiEndpoint();
  
  try {
    // 使用带 CORS 配置的 fetch
    const response = await fetchWithCORS(apiEndpoint, {
      method: shouldIncrement ? 'POST' : 'GET',
      body: shouldIncrement ? JSON.stringify({
        action: 'increment',
        timestamp: Date.now(),
      }) : undefined,
      signal: createTimeoutSignal(5000), // 5秒超时
    });
    
    if (response.ok) {
      const data = await response.json();
      // API 返回的字段是 value
      const newValue = data.value || data.totalUsers || data.total || data.count || null;
      
      if (newValue !== null && newValue >= 0) {
        console.log(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求成功，数字:`, newValue);
        // 更新本地存储
        localStorage.setItem('totalTestUsers', newValue.toString());
        
        // 实时更新页面显示
        const totalTestUsersEl = document.getElementById('totalTestUsers');
        if (totalTestUsersEl) {
          if (shouldIncrement) {
            // POST 请求时使用动画
            updateNumberWithAnimation(totalTestUsersEl, newValue, formatNumber);
          } else {
            // GET 请求时直接更新
            totalTestUsersEl.textContent = formatNumber(newValue);
          }
        }
        
        return newValue;
      }
    } else {
      console.warn(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求响应状态码异常:`, response.status);
    }
  } catch (error) {
    console.warn(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求失败，使用降级方案:`, error.message);
  }
  
  // 优雅降级：使用本地存储，如果没有则为 0
  const cachedValue = parseInt(localStorage.getItem('totalTestUsers') || '0');
  const fallbackValue = cachedValue; // 允许为 0，不再使用硬编码默认值
  
  // 更新页面显示（如果存在）
  const totalTestUsersEl = document.getElementById('totalTestUsers');
  if (totalTestUsersEl) {
    totalTestUsersEl.textContent = formatNumber(fallbackValue);
  }
  
  console.log(`[Main] 使用降级值:`, fallbackValue);
  return fallbackValue;
}

// 从 API 获取测试总人数（保留向后兼容）
export async function fetchTotalTestUsers() {
  return await updateGlobalStats(false);
}

// 向 API 报告新用户并获取更新后的数字（保留向后兼容）
export async function reportNewUser() {
  return await updateGlobalStats(true);
}

// 显示实时统计
async function displayRealtimeStats(vibeResult) {
  // 如果没有传入参数，使用全局变量（向后兼容）
  const currentVibeResult = vibeResult || window.vibeResult || globalThis.vibeResult;
  
  // 全局异常捕获：确保即使 uploadToSupabase 失败或数据处理出错，也不影响后续的图表渲染和词云生成
  try {
    if (!currentVibeResult || !globalStats) {
      console.warn('[Main] displayRealtimeStats: 缺少必要数据', {
        hasVibeResult: !!currentVibeResult,
        hasGlobalStats: !!globalStats
      });
      return;
    }

    // 检查是否为分享模式（通过检查是否有分享数据标记）
    const isShareMode = window.shareModeStats || window.shareModeVibeResult;
    
    // 从 API 获取测试总人数（分享模式下使用默认值或缓存值）
    let totalTestUsers;
    try {
      if (isShareMode) {
        // 分享模式：使用缓存值或默认值，不调用 API
        const cached = parseInt(localStorage.getItem('totalTestUsers') || '0');
        totalTestUsers = cached > 0 ? cached : 1000; // 默认值用于计算排名
        console.log('[Main] 分享模式：使用缓存的 totalTestUsers:', totalTestUsers);
      } else {
        // 正常模式：从 API 获取
        totalTestUsers = await fetchTotalTestUsers();
      }
    } catch (fetchError) {
      // 异常捕获：获取测试总人数失败时的降级处理
      console.error('[Main] 获取测试总人数失败，使用默认值:', fetchError);
      totalTestUsers = 1000; // 降级值
    }
    const previousTotal = totalTestUsers;

  // 使用后端返回的真实排名（必须从 uploadToSupabase 获取）
  let rankPercent = null;
  let estimatedRank = 0; // 默认值设为 0，避免 null 导致的崩溃
  
  // 防御性编程：检查排名数据是否存在，支持多种字段格式
  try {
    // 优先检查 currentVibeResult.rankData（主要数据源）
    if (currentVibeResult && currentVibeResult.rankData) {
      const rankData = currentVibeResult.rankData;
      
      // 字段兼容性：使用 ?? 运算符同时兼容 ranking 或 rankPercent 字段
      const rankingValue = rankData.ranking ?? rankData.rankPercent ?? null;
      
      if (rankingValue !== null && rankingValue !== undefined) {
        const numValue = Number(rankingValue);
        
        // 判断是排名数字还是百分比
        if (!isNaN(numValue)) {
          if (numValue >= 0 && numValue <= 100) {
            // 如果是 0-100 之间的值，认为是百分比
            rankPercent = numValue;
          } else if (numValue > 0 && totalTestUsers > 0) {
            // 如果大于 100，认为是排名数字，转换为百分比（假设排名越小越好）
            rankPercent = ((totalTestUsers - numValue) / totalTestUsers) * 100;
          }
        }
      }
      
      // 如果成功获取到 rankPercent，计算排名数字
      if (rankPercent !== null && !isNaN(rankPercent) && rankPercent >= 0 && rankPercent <= 100) {
        console.log('[Main] 使用后端返回的真实排名:', rankPercent);
        const rankPercentile = rankPercent / 100;
        estimatedRank = Math.max(1, Math.round(totalTestUsers * (1 - rankPercentile)));
      } else {
        // 容错处理：排名数据获取失败，只打印警告，不中断后续逻辑
        console.warn('[Main] 警告：排名数据格式异常或无效，将显示为 0', {
          rankPercent,
          rankingValue,
          rankData: currentVibeResult.rankData
        });
        rankPercent = null;
        estimatedRank = 0; // 降级处理：设置为 0
      }
    } else {
      // 【关键修复】这里禁止再次调用 uploadToSupabase
      // 原因：上传流程（analyzeFile / analyzeFileSync）已经会调用 uploadToSupabase 写入 user_analysis。
      // displayRealtimeStats 再调用一次会导致“一次上传 -> 两次写入 -> /api/global-average 看到两条雷同记录”。
      //
      // 替代方案：短暂等待 rankData 注入（同一对象/异步渲染时序），超时则降级显示 0。
      const waitForRankData = async (timeoutMs = 2500) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            if (currentVibeResult && currentVibeResult.rankData) return currentVibeResult.rankData;
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 120));
        }
        return null;
      };

      const rd = await waitForRankData();
      if (rd) {
        const rankingValue = rd.ranking ?? rd.rankPercent ?? null;
        const numValue = Number(rankingValue);
        if (!isNaN(numValue)) {
          if (numValue >= 0 && numValue <= 100) {
            rankPercent = numValue;
          } else if (numValue > 0 && totalTestUsers > 0) {
            rankPercent = ((totalTestUsers - numValue) / totalTestUsers) * 100;
          }
          if (rankPercent != null && !isNaN(rankPercent) && rankPercent >= 0 && rankPercent <= 100) {
            const rankPercentile = rankPercent / 100;
            estimatedRank = Math.max(1, Math.round(totalTestUsers * (1 - rankPercentile)));
          }
        }
        console.log('[Main] displayRealtimeStats: 等待到 rankData，跳过二次上报', { hasRankData: true });
      } else {
        console.warn('[Main] displayRealtimeStats: 未拿到 rankData（已禁止二次上报），降级显示 0');
        rankPercent = null;
        estimatedRank = 0;
      }
    }
  } catch (error) {
    // 异常捕获：确保即使处理排名数据时出错，也不影响后续逻辑
    console.warn('[Main] 处理排名数据时发生错误，将显示为 0:', error);
    rankPercent = null;
    estimatedRank = 0; // 降级处理：设置为 0
  }

  // 计算人格库解锁进度（243种人格，基于vibeIndex）
  // vibeIndex是5位数字，每个位置有3种可能（0,1,2），总共3^5=243种组合
  // 当前用户解锁了1种，所以进度是 1/243
  const totalPersonalities = 243;
  const unlockedPersonalities = 1; // 当前用户解锁的人格
  const unlockProgress = Math.round((unlockedPersonalities / totalPersonalities) * 100);

  // 更新DOM（带动画）
  const totalTestUsersEl = document.getElementById('totalTestUsers');
  const techRankEl = document.getElementById('techRank');
  const personalityUnlockEl = document.getElementById('personalityUnlock');

  if (totalTestUsersEl) {
    // 如果数值发生变化，显示动画
    if (previousTotal !== totalTestUsers) {
      updateNumberWithAnimation(totalTestUsersEl, totalTestUsers, formatNumber);
    } else {
      totalTestUsersEl.textContent = formatNumber(totalTestUsers);
    }
  }
  
  if (techRankEl) {
    // 防御性编程：确保 estimatedRank 是有效数字后再更新
    if (estimatedRank !== null && estimatedRank !== undefined && !isNaN(estimatedRank) && estimatedRank >= 0) {
      updateNumberWithAnimation(techRankEl, estimatedRank, formatNumber);
    } else {
      // 降级处理：如果排名数据无效，安全地更新为 0 或隐藏
      console.warn('[Main] 排名数据无效，将显示为 0');
      updateNumberWithAnimation(techRankEl, 0, formatNumber);
    }
  }
  
  if (personalityUnlockEl) {
    const newProgress = `${unlockProgress}%`;
    if (personalityUnlockEl.textContent !== newProgress) {
      updateNumberWithAnimation(personalityUnlockEl, unlockProgress, (v) => `${v}%`);
    } else {
      personalityUnlockEl.textContent = newProgress;
    }
  }

    console.log('[Main] 实时统计已更新:', {
      totalTestUsers,
      techRank: estimatedRank,
      unlockProgress: `${unlockProgress}%`
    });
    
  } catch (error) {
    // 全局异常捕获：确保即使 displayRealtimeStats 内部出错，也不影响后续的图表渲染和词云生成逻辑
    console.error('[Main] displayRealtimeStats 执行失败，但不影响后续逻辑:', error);
    // 不抛出错误，让调用者能够继续执行后续的 displayDimensionRanking 等函数
  }
}

// 显示维度得分排行榜
function displayDimensionRanking() {
  if (!vibeResult || !vibeResult.dimensions) return;

  const container = document.getElementById('dimensionRankingList');
  if (!container) return;

  const { dimensions } = vibeResult;

  const currentLang = getCurrentLang();
  
  // 将维度转换为数组并按得分排序
  const dimensionArray = Object.entries(dimensions)
    .map(([key, value]) => {
      // 使用 i18n 获取维度标签
      const dimInfo = window.i18n?.getI18nText(currentLang)?.dimensions?.[key];
      const label = dimInfo?.label || DIMENSIONS[key]?.label || key;
      return {
        key,
        label,
        value: key === 'E' ? value : value, // E维度不需要转换，其他维度已经是0-100
        displayValue: key === 'E' ? value : Math.round(value), // E维度显示原始值
      };
    })
    .sort((a, b) => {
      // E维度需要特殊处理（值域不同）
      const aScore = a.key === 'E' ? a.value * 10 : a.value;
      const bScore = b.key === 'E' ? b.value * 10 : b.value;
      return bScore - aScore;
    });

  // 渲染排行榜
  container.innerHTML = dimensionArray.map((dim, index) => {
    const rank = index + 1;
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    // E维度最大值为10左右，其他维度最大值为100
    const maxValue = dim.key === 'E' ? 10 : 100;
    const percentage = Math.min(100, Math.round((dim.value / maxValue) * 100));
    // 使用 i18n 获取单位
    const unit = dim.key === 'E' 
      ? (window.i18n?.getText('dashboard.techUnit', currentLang) || '种技术')
      : (window.i18n?.getText('dashboard.pointsUnit', currentLang) || '分');
    
    return `
      <div class="prompt-item" style="background: ${rank <= 3 ? 'rgba(0, 255, 65, 0.1)' : 'rgba(255, 255, 255, 0.03)'}; border-color: ${rank <= 3 ? 'rgba(0, 255, 65, 0.3)' : 'var(--card-border)'};">
        <span class="prompt-rank" style="font-size: 20px; min-width: 50px;">${rankIcon}</span>
        <span class="prompt-text" style="flex: 1; font-weight: 600;">${dim.label}</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 120px; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden;">
            <div style="width: ${percentage}%; height: 100%; background: var(--accent-terminal); transition: width 0.5s ease;"></div>
          </div>
          <span class="prompt-count" style="min-width: 80px; text-align: right; font-weight: 700; color: var(--accent-terminal);">${dim.displayValue} ${unit}</span>
        </div>
      </div>
    `;
  }).join('');

  console.log('[Main] 维度排行榜已渲染:', dimensionArray);
}

// 显示技术栈统计
function displayTechStack(techStack) {
  const section = document.getElementById('techStackSection');
  const list = document.getElementById('techStackList');
  
  if (!section || !list) return;
  
  const entries = Object.entries(techStack);
  if (entries.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  // 按使用次数排序，取前10
  const topTech = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (topTech.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = '';
  list.innerHTML = topTech.map(([tech, count], index) => `
    <div class="prompt-item">
      <span class="prompt-rank">#${index + 1}</span>
      <span class="prompt-text">${escapeHtml(tech)}</span>
      <span class="prompt-count">${count} 次</span>
    </div>
  `).join('');
}

// 提取中文词组（用于Top 10显示）- 优化版本
function extractChineseWordsForTop10(text) {
  if (!text || text.length === 0) return;
  
  // 使用全局缓存的停用词表
  const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
  const chineseWords = text.match(chinesePattern) || [];
  
  globalStats.topChineseWords = globalStats.topChineseWords || {};
  
  chineseWords.forEach(word => {
    if (word.length > 10) return;
    const cleanWord = word.trim();
    if (GLOBAL_CHINESE_STOP_WORDS.has(cleanWord)) return;
    
    globalStats.topChineseWords[cleanWord] = (globalStats.topChineseWords[cleanWord] || 0) + 1;
  });
}

// 情绪类词汇库（用于中文词云）
const EMOTION_WORDS = {
  // 正面情绪
  positive: new Set([
    '开心', '高兴', '快乐', '愉快', '兴奋', '满意', '满足', '喜欢', '爱', '感谢', '谢谢',
    '太好了', '完美', '优秀', '很棒', '不错', '很好', '厉害', '赞', '棒', '赞',
    '成功', '顺利', '正确', '准确', '清晰', '明白', '理解', '懂了', '好的', '可以',
    '惊喜', '惊喜', '感动', '温暖', '舒服', '轻松', '舒服', '爽', '爽快',
    '太好了', '完美', '优秀', '很棒', '不错', '很好', '厉害', '赞', '棒',
  ]),
  // 负面情绪
  negative: new Set([
    '生气', '愤怒', '烦躁', '焦虑', '担心', '害怕', '恐惧', '紧张', '压力', '累',
    '失望', '沮丧', '难过', '伤心', '痛苦', '难受', '不舒服', '不爽', '烦', '烦人',
    '错误', '不对', '不对', '错了', '失败', '失败', '不行', '不能', '不可以', '不行',
    '困惑', '迷茫', '不懂', '不明白', '不清楚', '模糊', '混乱', '乱', '糟糕', '糟糕',
    '麻烦', '困难', '难', '复杂', '复杂', '慢', '慢', '卡', '卡顿', '崩溃', '崩溃',
    '垃圾', '差', '差劲', '烂', '烂', '破', '破', '坏', '坏', '差', '差',
  ]),
  // 中性/表达类情绪
  neutral: new Set([
    '思考', '考虑', '想', '想想', '看看', '试试', '试试', '尝试', '尝试',
    '疑问', '疑问', '问题', '问题', '为什么', '怎么', '如何', '什么', '哪个',
    '可能', '也许', '大概', '应该', '需要', '想要', '希望', '期待',
    '注意', '注意', '小心', '小心', '提醒', '提醒', '记得', '记得',
  ]),
  // 情绪强度词
  intensity: new Set([
    '非常', '很', '特别', '极其', '超级', '超', '太', '太', '最', '最',
    '一点', '稍微', '有点', '有点', '稍微', '稍微', '不太', '不太',
  ]),
};

// 检查是否为情绪类词组 - 优化版本（使用缓存的Set）
function isEmotionWord(word) {
  // 快速路径：直接检查完整匹配
  if (EMOTION_WORDS.positive.has(word) || 
      EMOTION_WORDS.negative.has(word) || 
      EMOTION_WORDS.neutral.has(word) ||
      EMOTION_WORDS.intensity.has(word)) {
    return true;
  }
  return false;
}

// 提取词云数据（中英文分离，支持词组提取，专门收集情绪类词组）- 优化版本
function extractWordCloudData(text) {
  if (!text || text.length === 0) return;
  if (!globalStats) return;
  
  // 初始化统计对象
  globalStats.chineseWords = globalStats.chineseWords || {};
  globalStats.chineseEmotionWords = globalStats.chineseEmotionWords || {};
  globalStats.englishWords = globalStats.englishWords || {};
  
  // ========== 中文词组提取 ==========
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const charLen = chineseChars.length;
  
  // 使用单个循环提取2-4字词组，减少遍历次数
  for (let i = 0; i < charLen - 1; i++) {
    const c1 = chineseChars[i];
    const c2 = chineseChars[i + 1];
    
    // 跳过纯停用字
    if (GLOBAL_CHINESE_STOP_WORDS.has(c1) && GLOBAL_CHINESE_STOP_WORDS.has(c2)) continue;
    
    // 2字词组
    const twoChar = c1 + c2;
    if (!GLOBAL_CHINESE_STOP_WORDS.has(twoChar)) {
      globalStats.chineseWords[twoChar] = (globalStats.chineseWords[twoChar] || 0) + 1;
      
      // 简化的情绪词检测
      if (EMOTION_WORDS.positive.has(twoChar) || EMOTION_WORDS.negative.has(twoChar)) {
        globalStats.chineseEmotionWords[twoChar] = (globalStats.chineseEmotionWords[twoChar] || 0) + 2;
      }
    }
    
    // 3字词组
    if (i < charLen - 2) {
      const c3 = chineseChars[i + 2];
      const threeChar = twoChar + c3;
      if (!GLOBAL_CHINESE_STOP_WORDS.has(threeChar) && !GLOBAL_CHINESE_STOP_WORDS.has(c3)) {
        globalStats.chineseWords[threeChar] = (globalStats.chineseWords[threeChar] || 0) + 1;
      }
    }
    
    // 4字词组（仅每5个字符处理一次，减少计算量）
    if (i < charLen - 3 && i % 5 === 0) {
      const fourChar = twoChar + chineseChars[i + 2] + chineseChars[i + 3];
      globalStats.chineseWords[fourChar] = (globalStats.chineseWords[fourChar] || 0) + 1;
    }
  }
  
  // ========== 英文词组提取（简化版）==========
  const englishMatches = text.match(/\b[a-zA-Z]{2,20}\b/g) || [];
  const validWords = [];
  
  // 单次遍历提取有效单词
  for (const word of englishMatches) {
    const lower = word.toLowerCase();
    if (!GLOBAL_ENGLISH_STOP_WORDS.has(lower)) {
      globalStats.englishWords[lower] = (globalStats.englishWords[lower] || 0) + 1;
      validWords.push(lower);
    }
  }
  
  // 提取2词词组
  const validLen = validWords.length;
  for (let i = 0; i < validLen - 1; i++) {
    const phrase = validWords[i] + ' ' + validWords[i + 1];
    globalStats.englishWords[phrase] = (globalStats.englishWords[phrase] || 0) + 1;
  }
}

/** 身份词云 Tab 是否已绑定（事件委托仅需一次） */
let _identityLevelTabsBound = false;

/**
 * 【三身份级别词云】绑定切换按钮事件（事件委托，兼容 recreateDashboardDOM 替换 DOM）
 */
function bindIdentityLevelTabs() {
  if (_identityLevelTabsBound) return;
  _identityLevelTabsBound = true;
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('.identity-level-btn');
    if (!btn) return;
    const tabs = document.getElementById('identity-level-tabs');
    if (!tabs || !tabs.contains(btn)) return;
    const level = btn.getAttribute('data-level');
    if (!level) return;
    selectedIdentityLevel = level;
    tabs.querySelectorAll('.identity-level-btn').forEach(function (b) {
      b.classList.remove('active', 'bg-[var(--accent-terminal)]/20', 'text-[var(--accent-terminal)]');
      b.classList.add('text-zinc-400');
    });
    btn.classList.add('active', 'bg-[var(--accent-terminal)]/20', 'text-[var(--accent-terminal)]');
    btn.classList.remove('text-zinc-400');
    renderIdentityLevelCloud(level);
  });
}

/**
 * 将 Worker 返回的 identityLevelCloud 统一为渲染用格式
 * 支持旧格式 { word: count } 与新格式 [{ word, count, source }]
 */
function normalizeIdentityLevelCloud(ilc) {
  if (!ilc || typeof ilc !== 'object') {
    return { Novice: [], Professional: [], Architect: [], native: [] };
  }
  const out = { Novice: [], Professional: [], Architect: [], native: [] };
  for (const level of ['Novice', 'Professional', 'Architect']) {
    const arr = ilc[level];
    if (Array.isArray(arr)) {
      out[level] = arr.map(function (x) {
        return { word: x.word, count: x.count, source: x.source || level.toLowerCase(), maxInLevel: x.maxInLevel };
      });
    } else if (arr && typeof arr === 'object') {
      out[level] = Object.entries(arr)
        .filter(function (e) { return e[1] > 0; })
        .map(function (e) { return { word: e[0], count: e[1], source: level.toLowerCase() }; });
    }
  }
  const nat = ilc.native;
  if (Array.isArray(nat)) {
    out.native = nat.map(function (x) {
      return { word: x.word, count: x.count, source: 'native' };
    });
  }
  return out;
}

/**
 * 【三级别各取最高频一词】从 identityLevelCloud 的 Novice、Architect、Native 中各取 count 最大的一个词（兼容旧逻辑）
 * @param {Object} ilc - identityLevelCloud 对象
 * @returns {Array<{ p: string, c: string, v: number }>} 最多 3 个词，用于上报
 */
function pickTopWordPerLevel(ilc) {
  if (!ilc || typeof ilc !== 'object') return [];
  var selectedWords = [];
  var levels = [
    { key: 'Novice', name: 'Novice' },
    { key: 'Professional', name: 'Professional' },
    { key: 'Architect', name: 'Architect' },
    { key: 'native', name: 'Native' }
  ];
  for (var i = 0; i < levels.length; i++) {
    var level = levels[i];
    var arr = ilc[level.key];
    if (!arr) continue;
    var items = [];
    if (Array.isArray(arr)) {
      items = arr.map(function (x) {
        var word = x.word != null ? String(x.word) : (x[0] != null ? String(x[0]) : '');
        var count = x.count != null ? Number(x.count) : (x[1] != null ? Number(x[1]) : 0);
        return { word: word, count: count };
      });
    } else if (arr && typeof arr === 'object') {
      items = Object.entries(arr).map(function (e) {
        return { word: String(e[0]), count: Number(e[1]) || 0 };
      });
    }
    if (items.length === 0) continue;
    var maxItem = items[0];
    for (var j = 1; j < items.length; j++) {
      if (items[j].count > maxItem.count) maxItem = items[j];
    }
    if (maxItem && maxItem.word && maxItem.count > 0) {
      selectedWords.push({
        p: maxItem.word.trim(),
        c: level.name,
        v: maxItem.count
      });
    }
  }
  return selectedWords;
}

/**
 * 【霸天/脱发/新手 强制唯一代表词】遍历用户词频，分别匹配 Novice/Professional/Architect 词库，
 * 每个分类筛选出且仅一个频率最高的词；若无命中则从对应 JSON 词库随机取一词作为「潜伏」展示。
 * @param {Object} ilc - identityLevelCloud，含 Novice/Professional/Architect 数组或对象
 * @param {{ Novice: string[], Professional: string[], Architect: string[] }} levelKeywords - 三级别词库
 * @returns {{ selectedWords: Array<{ p: string, c: string, v: number }>, representativeWords: { Novice?: string, Professional?: string, Architect?: string } }}
 */
function pickOneWordPerLevelFromMatch(ilc, levelKeywords) {
  var selectedWords = [];
  var representativeWords = {};
  if (!ilc || typeof ilc !== 'object' || !levelKeywords || typeof levelKeywords !== 'object') {
    return { selectedWords: [], representativeWords: {} };
  }
  var levels = ['Novice', 'Professional', 'Architect'];
  for (var i = 0; i < levels.length; i++) {
    var levelKey = levels[i];
    var keywords = levelKeywords[levelKey];
    if (!Array.isArray(keywords) || keywords.length === 0) continue;
    var keywordSet = new Set(keywords.map(function (k) { return String(k || '').trim().toLowerCase(); }));
    var arr = ilc[levelKey];
    var items = [];
    if (Array.isArray(arr)) {
      items = arr.map(function (x) {
        var word = x.word != null ? String(x.word) : (x[0] != null ? String(x[0]) : '');
        var count = x.count != null ? Number(x.count) : (x[1] != null ? Number(x[1]) : 0);
        return { word: word.trim(), count: count };
      });
    } else if (arr && typeof arr === 'object') {
      items = Object.entries(arr).map(function (e) {
        return { word: String(e[0]).trim(), count: Number(e[1]) || 0 };
      });
    }
    var hit = null;
    for (var j = 0; j < items.length; j++) {
      var w = items[j].word;
      if (!w) continue;
      if (!keywordSet.has(w.toLowerCase())) continue;
      if (!hit || items[j].count > hit.count) hit = items[j];
    }
    var word = '';
    var count = 0;
    if (hit && hit.word) {
      word = hit.word;
      count = hit.count;
    } else {
      word = keywords[Math.floor(Math.random() * keywords.length)];
      if (typeof word !== 'string') word = String(word || '').trim();
      count = 0;
    }
    if (word) {
      representativeWords[levelKey] = word;
      selectedWords.push({ p: word, c: levelKey, v: count });
    }
  }
  return { selectedWords: selectedWords, representativeWords: representativeWords };
}

/**
 * 【灵魂词提炼】从 vibeResult.identityLevelCloud 中提取权重绝对值最高的非标准词
 * @param {Object} vibeResult - 分析结果对象，包含 identityLevelCloud 属性
 * @returns {{ p: string, c: string, v: number } | null} 提炼出的灵魂词对象 { p: 词组, c: 分类, v: 权重 }，失败返回 null
 */
function extractSoulWord(vibeResult) {
  if (!vibeResult || typeof vibeResult !== 'object') {
    return null;
  }

  // 从 vibeResult.identityLevelCloud 提取数据
  const ilc = vibeResult.identityLevelCloud || vibeResult.statistics?.identityLevelCloud || vibeResult.stats?.identityLevelCloud;
  if (!ilc || typeof ilc !== 'object') {
    return null;
  }

  // 若 window.__standardSets 未定义，则不进行标准词过滤（健壮性）
  let standardSet = null;
  if (typeof window !== 'undefined' && window.__standardSets != null) {
    try {
      if (window.__standardSets instanceof Set) {
        standardSet = window.__standardSets;
      } else if (Array.isArray(window.__standardSets)) {
        standardSet = new Set(window.__standardSets);
      } else if (typeof window.__standardSets === 'object') {
        const allWords = [];
        for (const key in window.__standardSets) {
          if (Array.isArray(window.__standardSets[key])) {
            allWords.push(...window.__standardSets[key]);
          }
        }
        standardSet = new Set(allWords);
      }
    } catch (e) {
      console.warn('[Main] 构建标准词库 Set 失败:', e?.message || String(e));
    }
  }

  const categories = ['Novice', 'Professional', 'Architect'];
  const candidates = [];

  // 遍历三个分类
  for (const category of categories) {
    const arr = ilc[category];
    if (!arr) continue;

    let items = [];
    if (Array.isArray(arr)) {
      items = arr;
    } else if (typeof arr === 'object') {
      // 如果是对象格式，转换为数组格式
      items = Object.entries(arr)
        .filter(function (e) { return e[1] > 0; })
        .map(function (e) { 
          return { word: e[0], count: e[1] }; 
        });
    }

    // 过滤候选词
    for (const item of items) {
      const word = String(item.word || item[0] || '').trim();
      if (!word || word.length <= 1) continue; // 排除单字词

      // 排除标准词库中的词（如果标准词库存在）
      if (standardSet && standardSet.has(word)) {
        continue;
      }

      // 提取权重 v 的绝对值（优先使用 v 字段，兼容 count 和其他格式）
      let weight = 0;
      if (item.v != null) {
        weight = Math.abs(Number(item.v));
      } else if (item.count != null) {
        weight = Math.abs(Number(item.count));
      } else if (Array.isArray(item) && item.length >= 2) {
        weight = Math.abs(Number(item[1]));
      }
      if (weight <= 0) continue;

      candidates.push({
        phrase: word,
        category: category,
        weight: weight
      });
    }
  }

  // 找到这三类中权重(v)绝对值最高的一个非标准词作为"灵魂词"
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(function (a, b) {
    return b.weight - a.weight;
  });

  const soulWord = candidates[0];
  if (!soulWord) {
    return null;
  }

  // 返回 { p, c, v } 格式
  const soulData = {
    p: soulWord.phrase,
    c: soulWord.category,
    v: soulWord.weight
  };
  console.log('[Main] ✅ 灵魂词提炼成功:', soulData);
  return soulData;
}

/**
 * 灵魂词上报 API 基地址：智能识别本地开发环境，指向已部署的 Cloudflare Worker
 * - localhost 环境：默认指向已部署的 Worker（可通过 window.__VIBE_SOUL_API_BASE__ 覆盖）
 * - 非本地环境：使用相对路径，保持生产环境兼容性
 * 
 * 配置方式：
 * 1. 在页面中设置：window.__VIBE_SOUL_API_BASE__ = 'https://cursor-clinical-analysis.你的账户子域名.workers.dev';
 * 2. 或修改下面的 defaultWorkerUrl 为你的实际 Worker 域名
 */
function getSoulWordApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  var hostname = window.location.hostname || '';
  // 判断是否本地开发环境（包含 localhost）
  if (hostname.includes('localhost') || hostname === '127.0.0.1') {
    // 优先使用配置的 Worker 域名，否则使用默认的已部署 Worker
    // 格式：https://{worker-name}.{account-subdomain}.workers.dev
    // 例如：https://cursor-clinical-analysis.your-subdomain.workers.dev
    var defaultWorkerUrl = 'https://cursor-clinical-analysis.psterman.workers.dev';
    return (window.__VIBE_SOUL_API_BASE__ != null && String(window.__VIBE_SOUL_API_BASE__).trim() !== '')
      ? String(window.__VIBE_SOUL_API_BASE__).replace(/\/$/, '')
      : defaultWorkerUrl;
  }
  // 非本地环境：返回空字符串，使用相对路径
  return '';
}

/**
 * 【灵魂词上报】将选中的词（最多 3 个）逐个 POST 到 Worker /api/v2/log-vibe-soul
 * @param {Array<{ p: string, c: string, v: number }>|{ p: string, c: string, v: number }} selectedWords - 选中的词数组，或单个词对象（兼容旧调用）
 * @param {string} [country] - 国家代码，优先从 lastAnalysisResult.ip_location 传入，用于地理对齐
 * @returns {Promise<void>} Promise，确保使用 .catch() 捕获错误，不干扰主页面的分析显示
 */
async function reportSoulWord(selectedWords, country) {
  var list = Array.isArray(selectedWords) ? selectedWords : (selectedWords && selectedWords.p ? [selectedWords] : []);
  if (list.length === 0) return;

  var base = getSoulWordApiBaseUrl();
  var url = base ? base + '/api/v2/log-vibe-soul' : '/api/v2/log-vibe-soul';
  var fingerprint = (typeof localStorage !== 'undefined' && localStorage.getItem) ? localStorage.getItem('user_fingerprint') || '' : '';
  if (country && !/^[A-Za-z]{2}$/.test(String(country))) country = '';

  for (var i = 0; i < list.length; i++) {
    var soulData = list[i];
    if (!soulData || !soulData.p) continue;
    var payload = {
      p: soulData.p,
      c: soulData.c || 'Novice',
      v: soulData.v || 1,
      f: fingerprint
    };
    if (country) payload.country = country;

    try {
      var response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        var text = await response.text().catch(function () { return ''; });
        console.warn('[Main] 灵魂词上报失败:', response.status, soulData.p, text);
        continue;
      }
      var result = await response.json().catch(function () { return {}; });
      if (result.status === 'success') {
        console.log('[SoulWord] ✅ 已投递:', soulData.p);
      }
    } catch (err) {
      console.error('[Main] 灵魂词上报异常:', { url: url, word: soulData.p, error: err?.message || String(err) });
    }
  }
  if (list.length > 0) {
    console.log('[SoulWord] 高频词已上传 ' + list.length + ' 个，等待 Cron 汇总');
  }
}

/**
 * 【灵魂词提炼与上报】完整流程：提炼 + 上报
 * @param {Object} vibeResult - vibeResult 对象，包含 identityLevelCloud
 */
async function extractAndReportSoulWord(vibeResult) {
  try {
    // 提炼灵魂词（从 vibeResult.identityLevelCloud）
    const soulData = extractSoulWord(vibeResult);
    if (!soulData) {
      console.log('[Main] 未找到符合条件的灵魂词');
      return;
    }

    // 异步上报（不阻塞主线程）
    await reportSoulWord(soulData);
  } catch (err) {
    console.warn('[Main] 灵魂词提炼/上报流程异常:', err?.message || String(err));
  }
}

/**
 * 将 hex 转为 rgba，并可按 alpha 调节透明度
 */
function hexToRgba(hex, alpha) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  var r = parseInt(m[1], 16);
  var g = parseInt(m[2], 16);
  var b = parseInt(m[3], 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 1) + ')';
}

/**
 * 【三身份级别词云】渲染指定层级的词云（本地数据，无 Network）
 * - 非线性字号：FontSize = BaseSize + (Math.pow(count/maxCount, 0.8) * (MaxSize - BaseSize))
 * - Top 5 加成、长词保护、颜色饱和度随频率联动、gridSize 4 繁星密度
 */
function renderIdentityLevelCloud(level) {
  const vr = window.vibeResults;
  let data = (vr && vr[level]) || [];
  const native = (vr && vr.native) || [];

  var merged = [];
  if (Array.isArray(data)) {
    merged = data.map(function (x) {
      return typeof x === 'object' && x !== null
        ? { word: x.word || x[0], count: x.count != null ? x.count : x[1], source: x.source, maxInLevel: x.maxInLevel }
        : { word: String(x[0]), count: x[1] || 1, source: level.toLowerCase(), maxInLevel: null };
    });
  } else if (Array.isArray(data) === false && data && typeof data === 'object') {
    merged = Object.entries(data).filter(function (e) { return e[1] > 0; }).map(function (e) { return { word: e[0], count: e[1], source: level.toLowerCase(), maxInLevel: null }; });
  }
  if (Array.isArray(native) && native.length > 0) {
    native.forEach(function (x) {
      merged.push({ word: x.word || x[0], count: x.count != null ? x.count : x[1] || 1, source: 'native', maxInLevel: null });
    });
  }
  var totalCount = merged.reduce(function (a, x) { return a + (x.count || 0); }, 0);
  if (totalCount <= 0) totalCount = 1;

  var mergedData = merged;
  console.log('[Main] 渲染身份级别词云 [' + level + ']:', { dataLength: mergedData.length, totalCount: totalCount });
  if (mergedData.length > 0) console.table(mergedData);

  var canvas = document.getElementById('identity-cloud-canvas') || document.getElementById('chineseWordCloud');
  if (!canvas || typeof WordCloud === 'undefined') {
    if (mergedData.length > 0) console.warn('[Main] 有词云数据但 WordCloud canvas 或库未找到，当前页面可能未挂载词云区域');
    return;
  }
  var container = canvas.parentElement;
  var width = (container && container.offsetWidth) ? container.offsetWidth : 400;
  var height = (container && container.offsetHeight) ? container.offsetHeight : 400;
  if (width <= 0 || height <= 0) { width = 400; height = 400; }
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, width, height);

  if (merged.length === 0) {
    if (ctx) {
      ctx.fillStyle = 'rgba(113, 113, 122, 0.5)';
      ctx.font = '14px "Microsoft YaHei", "微软雅黑", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(getCurrentLang() === 'en' ? 'No keywords matched' : '暂无命中词', width / 2, height / 2);
    }
    return;
  }

  merged.sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
  var levelItems = merged.filter(function (x) { return x.source !== 'native'; });
  var nativeItems = merged.filter(function (x) { return x.source === 'native'; });
  var maxInLevel = levelItems.length ? Math.max.apply(null, levelItems.map(function (x) { return x.count || 0; })) : 1;
  var maxNative = nativeItems.length ? Math.max.apply(null, nativeItems.map(function (x) { return x.count || 0; })) : 1;

  var BaseSize = 12;
  var MaxSize = 80;
  var Top5Bonus = 1.22;
  var LongWordLen = 6;
  var LongWordPenalty = 0.82;

  var sourceMap = {};
  var wordToRatio = {};
  merged.forEach(function (x) { sourceMap[x.word] = x.source || level.toLowerCase(); });
  merged.forEach(function (x) {
    var maxRef = x.source === 'native' ? maxNative : (x.maxInLevel || maxInLevel);
    if (maxRef <= 0) maxRef = 1;
    wordToRatio[x.word] = (x.count || 0) / maxRef;
  });

  var colorBySource = {
    architect: '#5b21b6',
    professional: '#3b82f6',
    novice: '#10b981',
    native: '#9ca3af'
  };

  var list = merged.map(function (x, idx) {
    var count = x.count || 0;
    var maxRef = x.source === 'native' ? maxNative : (x.maxInLevel || maxInLevel);
    if (maxRef <= 0) maxRef = 1;
    var ratio = count / maxRef;
    var size = BaseSize + Math.pow(ratio, 0.8) * (MaxSize - BaseSize);
    if (idx < 5) size *= Top5Bonus;
    if (String(x.word || '').length > LongWordLen) size *= LongWordPenalty;
    size = Math.max(BaseSize, Math.min(MaxSize + 10, size));
    return [String(x.word || ''), size];
  }).filter(function (item) { return item[0].length > 0 && item[1] > 0; });

  try {
    WordCloud(canvas, {
      list: list,
      gridSize: 4,
      weightFactor: function (size) {
        return Math.max(BaseSize, Math.min(MaxSize + 10, size));
      },
      fontFamily: '"Microsoft YaHei", "微软雅黑", SimHei, sans-serif',
      color: function (word) {
        var src = sourceMap[word];
        var baseHex = colorBySource[src] || '#6b7280';
        var ratio = wordToRatio[word] != null ? wordToRatio[word] : 0.5;
        var alpha = 0.5 + 0.5 * Math.pow(ratio, 0.7);
        return hexToRgba(baseHex, alpha);
      },
      rotateRatio: 0.6,
      backgroundColor: 'transparent',
      minSize: BaseSize,
      drawOutOfBound: false,
      shrinkToFit: false,
      ellipticity: 0.8
    });
  } catch (err) {
    console.warn('[Main] 词云渲染失败:', err);
  }
}

// 渲染词云
function renderWordClouds() {
  if (typeof WordCloud === 'undefined') {
    console.warn('[Main] WordCloud库未加载');
    return;
  }

  console.log('[Main] 开始渲染词云...');
  
  // 检查数据
  const emotionWordsCount = Object.keys(globalStats.chineseEmotionWords || {}).length;
  const chineseWordsCount = Object.keys(globalStats.chineseWords || {}).length;
  const englishWordsCount = Object.keys(globalStats.englishWords || {}).length;
  
  console.log('[Main] 情绪类词组数据:', emotionWordsCount);
  console.log('[Main] 中文词组数据:', chineseWordsCount);
  console.log('[Main] 英文词组数据:', englishWordsCount);

  // 渲染AI功德簿词云（优先：三身份级别词云；降级：情绪类词组）
  const chineseCanvas = document.getElementById('identity-cloud-canvas') || document.getElementById('chineseWordCloud');
  if (!chineseCanvas) {
    console.warn('[Main] AI功德簿词云canvas未找到');
  } else if (window.vibeResults && (window.vibeResults.Novice?.length || window.vibeResults.Professional?.length || window.vibeResults.Architect?.length)) {
    renderIdentityLevelCloud(selectedIdentityLevel);
    console.log('[Main] ✅ AI功德簿（三身份级别）词云渲染完成');
  } else if (!globalStats.chineseEmotionWords || emotionWordsCount === 0) {
    console.warn('[Main] AI功德簿词云数据为空');
    const container = chineseCanvas.parentElement;
    if (container) {
      const wrap = container.querySelector('.wordcloud-container');
      const target = wrap || container;
      if (target && target.querySelector('canvas')) {
        target.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无数据</div>';
      }
    }
  } else {
    // 获取排名最靠前的情绪类词组（按频率排序）
    const minWords = 50;
    const maxWords = 120;
    const allEntries = Object.entries(globalStats.chineseEmotionWords)
      .filter(([word, count]) => count > 0 && word.length >= 2) // 过滤掉计数为0的和单字
      .sort((a, b) => b[1] - a[1]); // 按频率降序排序
    
    // 如果数据不足，至少显示所有可用的词
    const wordCount = Math.max(minWords, Math.min(maxWords, allEntries.length));
    const emotionData = allEntries
      .slice(0, wordCount)
      .map(([word, count]) => [word, count]);
    
    console.log('[Main] AI情绪词云数据（已排序）:', emotionData.length);
    if (emotionData.length > 0) {
      console.log('[Main] AI情绪词云Top 10:', emotionData.slice(0, 10).map(([w, c]) => `${w}(${c})`).join(', '));
    }
    
    if (emotionData.length > 0) {
      try {
        // 获取容器尺寸
        const container = chineseCanvas.parentElement;
        const width = container ? container.offsetWidth : 400;
        const height = container ? container.offsetHeight : 400;
        
        // 设置canvas尺寸
        chineseCanvas.width = width;
        chineseCanvas.height = height;
        
        // 清空canvas
        const ctx = chineseCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
        }
        
        // 计算字体大小范围（根据数据量动态调整）
        const maxCount = Math.max(...emotionData.map(([w, c]) => c));
        
        // 自定义颜色函数（情绪类词组使用暖色调）
        const emotionColors = ['#e74c3c', '#f39c12', '#e67e22', '#c0392b', '#d35400', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#16a085'];
        const colorFn = function(word, weight, fontSize, distance, theta) {
          const index = Math.floor(Math.random() * emotionColors.length);
          return emotionColors[index];
        };
        
        WordCloud(chineseCanvas, {
          list: emotionData,
          gridSize: Math.round(Math.max(8, Math.min(12, width / 40))), // 减小网格，让词更密集，但仍保持云朵形状
          weightFactor: function(size) {
            // 根据频率计算字体大小，使用平方根缩放使大小差异更明显
            const normalizedSize = Math.sqrt(size) / Math.sqrt(maxCount);
            // 字体大小范围：10px - 45px
            const minFontSize = 10;
            const maxFontSize = Math.min(45, width / 10);
            return minFontSize + normalizedSize * (maxFontSize - minFontSize);
          },
          fontFamily: '"Microsoft YaHei", "微软雅黑", "SimHei", "黑体", sans-serif',
          color: colorFn,
          rotateRatio: 0.6, // 增加旋转比例，使词云更生动
          backgroundColor: 'transparent',
          minSize: 10, // 最小字体大小
          drawOutOfBound: false, // 不绘制超出边界的词
          shrinkToFit: false, // 不自动缩放，保持原始大小
          ellipticity: 0.8, // 椭圆度，0.8稍微扁平，形成更自然的云朵形状
        });
        console.log('[Main] ✅ AI情绪词云渲染完成');
      } catch (error) {
        console.error('[Main] AI情绪词云渲染失败:', error);
        console.error('[Main] 错误详情:', error.stack);
      }
    } else {
      console.warn('[Main] AI情绪词云数据为空（过滤后）');
    }
  }

  // 渲染英文词云（合并 tech_stack、中文词组和英文词组）
  const englishCanvas = document.getElementById('englishWordCloud');
  if (!englishCanvas) {
    console.warn('[Main] 英文词云canvas未找到');
  } else {
    // 【V6 适配】合并 tech_stack、中文词组和英文词组
    const mergedWords = {};
    
    // 【V6 黑话合并】在词云渲染前，将 chinese_slang 和 english_slang 合并为一个统一的词频对象
    // 【装修级优化】使用 Object.entries().reduce 显式合并，以防极端情况下只显示其中一种词频
    try {
      const currentVibeResult = vibeResult || window.vibeResult || globalThis.vibeResult;
      if (currentVibeResult && currentVibeResult.stats) {
        const blackwordHits = currentVibeResult.stats.blackword_hits || {};
        
        // 合并 chinese_slang 和 english_slang
        const chineseSlang = blackwordHits.chinese_slang || {};
        const englishSlang = blackwordHits.english_slang || {};
        
        // 【显式合并】使用 reduce 确保两种黑话都被正确处理，即使其中一种为空
        const mergedSlang = [
          ...Object.entries(chineseSlang).map(([word, count]) => ({ word, count, type: 'chinese' })),
          ...Object.entries(englishSlang).map(([word, count]) => ({ word, count, type: 'english' }))
        ].reduce((acc, { word, count, type }) => {
          if (word && typeof count === 'number' && count > 0) {
            // 统一权重：黑话词条权重 = rawCount * 2
            acc[word] = (acc[word] || 0) + (count * 2);
          }
          return acc;
        }, {});
        
        // 将合并后的黑话数据添加到 mergedWords
        Object.entries(mergedSlang).forEach(([word, weightedCount]) => {
          mergedWords[word] = (mergedWords[word] || 0) + weightedCount;
        });
        
        if (Object.keys(chineseSlang).length > 0 || Object.keys(englishSlang).length > 0) {
          console.log('[Main] ✅ 已合并黑话数据到词云（显式合并）:', {
            chineseSlang: Object.keys(chineseSlang).length,
            englishSlang: Object.keys(englishSlang).length,
            mergedCount: Object.keys(mergedSlang).length
          });
        }
      }
    } catch (error) {
      console.warn('[Main] 黑话合并失败（已降级）:', error);
    }
    
    // 1. 添加 tech_stack 数据（调高权重，使其更显眼）
    // 获取 vibeResult 中的 stats.tech_stack（健壮性保障）
    try {
      const currentVibeResult = vibeResult || window.vibeResult || globalThis.vibeResult;
      if (currentVibeResult && currentVibeResult.stats) {
        const techStack = currentVibeResult.stats.tech_stack;
        if (techStack) {
          // 处理字符串格式的 tech_stack（JSON 字符串）
          let parsedTechStack = techStack;
          if (typeof techStack === 'string') {
            try {
              parsedTechStack = JSON.parse(techStack);
            } catch (e) {
              console.warn('[Main] tech_stack JSON 解析失败:', e);
              parsedTechStack = {};
            }
          }
          
          if (typeof parsedTechStack === 'object' && parsedTechStack !== null && !Array.isArray(parsedTechStack)) {
            Object.entries(parsedTechStack).forEach(([tech, count]) => {
              if (tech && typeof count === 'number' && count > 0) {
                // 【V6 动态提权】tech_stack 词条权重 = rawCount * 8
                mergedWords[tech] = (mergedWords[tech] || 0) + (count * 8);
              }
            });
            console.log('[Main] ✅ 已添加 tech_stack 数据到词云，共', Object.keys(parsedTechStack).length, '项技术');
          }
        }
      }
    } catch (error) {
      console.warn('[Main] 获取 tech_stack 数据时出错（已降级）:', error);
      // 降级：继续执行，不影响后续词云渲染
    }
    
    // 2. 添加中文词组（从 parser.getTopChineseWords() 获取，排除情绪类词组）
    // 【V6 词云算法重构】加权融合：slang 词条权重 = rawCount * 5
    if (parser && typeof parser.getTopChineseWords === 'function') {
      try {
        const topChineseWords = parser.getTopChineseWords(50); // 获取前50个中文词组
        topChineseWords.forEach(({ word, count }) => {
          if (word && count > 0) {
            // 排除情绪类词组（已在AI情绪词云中显示）
            if (!globalStats.chineseEmotionWords || !globalStats.chineseEmotionWords[word]) {
              // 【V6 动态提权】slang 词条权重 = rawCount * 5
              mergedWords[word] = (mergedWords[word] || 0) + (count * 5);
            }
          }
        });
        console.log('[Main] ✅ 已添加 parser.getTopChineseWords() 数据到词云（权重*5），共', topChineseWords.length, '个词组');
      } catch (error) {
        console.warn('[Main] parser.getTopChineseWords() 调用失败:', error);
        // 降级：使用 globalStats.chineseWords
        if (globalStats.chineseWords) {
          Object.entries(globalStats.chineseWords).forEach(([word, count]) => {
            if (!globalStats.chineseEmotionWords || !globalStats.chineseEmotionWords[word]) {
              mergedWords[word] = (mergedWords[word] || 0) + (count * 5); // 同样应用权重
            }
          });
        }
      }
    } else {
      // 降级：使用 globalStats.chineseWords（原逻辑）
      if (globalStats.chineseWords) {
        Object.entries(globalStats.chineseWords).forEach(([word, count]) => {
          // 排除情绪类词组（已在AI情绪词云中显示）
          if (!globalStats.chineseEmotionWords || !globalStats.chineseEmotionWords[word]) {
            mergedWords[word] = (mergedWords[word] || 0) + (count * 5); // 同样应用权重
          }
        });
      }
    }
    
    // 3. 添加英文词组（普通权重）
    if (globalStats.englishWords) {
      Object.entries(globalStats.englishWords).forEach(([word, count]) => {
        mergedWords[word] = (mergedWords[word] || 0) + count;
      });
    }
    
    const mergedWordsCount = Object.keys(mergedWords).length;
    
    if (mergedWordsCount === 0) {
      console.warn('[Main] 合并词云数据为空');
      // 显示提示信息
      const container = englishCanvas.parentElement;
      if (container) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无词云数据</div>';
      }
    } else {
      // 获取排名最靠前的词组（按频率排序）
      // 增加词数量，形成云朵形状（100-200个词）
      const minWords = 100;
      const maxWords = 200;
      const allEntries = Object.entries(mergedWords)
        .filter(([word, count]) => count > 0 && word.length >= 2) // 过滤掉计数为0的和单字符
        .sort((a, b) => b[1] - a[1]); // 按频率降序排序
      
      // 如果数据不足，至少显示所有可用的词
      const wordCount = Math.max(minWords, Math.min(maxWords, allEntries.length));
      const mergedData = allEntries
        .slice(0, wordCount)
        .map(([word, count]) => [word, count]);
    
      console.log('[Main] 合并词云数据（已排序）:', mergedData.length);
      if (mergedData.length > 0) {
        console.log('[Main] 合并词云Top 10:', mergedData.slice(0, 10).map(([w, c]) => `${w}(${c})`).join(', '));
      }
      
      if (mergedData.length > 0) {
        try {
          // 获取容器尺寸
          const container = englishCanvas.parentElement;
          const width = container ? container.offsetWidth : 400;
          const height = container ? container.offsetHeight : 400;
          
          // 设置canvas尺寸
          englishCanvas.width = width;
          englishCanvas.height = height;
          
          // 清空canvas
          const ctx = englishCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);
          }
          
          // 计算字体大小范围（根据数据量动态调整）
          const maxCount = Math.max(...mergedData.map(([w, c]) => c));
          
          // 自定义颜色函数（多种颜色）
          const colors = ['#2c3e50', '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085'];
          const colorFn = function(word, weight, fontSize, distance, theta) {
            const index = Math.floor(Math.random() * colors.length);
            return colors[index];
          };
          
          // 【V6 样式区分】构建技术词条映射表
          const techStackMap = {};
          try {
            const currentVibeResult = vibeResult || window.vibeResult || globalThis.vibeResult;
            if (currentVibeResult?.stats?.tech_stack && typeof currentVibeResult.stats.tech_stack === 'object') {
              Object.keys(currentVibeResult.stats.tech_stack).forEach(tech => {
                techStackMap[tech] = true;
              });
            }
          } catch (e) {
            console.warn('[Main] 构建 techStackMap 失败:', e);
          }

          // 自定义颜色函数（技术词条使用品牌色）
          const enhancedColorFn = function(word, weight, fontSize, distance, theta) {
            if (techStackMap[word]) {
              // 技术词条使用品牌色
              return '#00D4FF'; // 品牌色
            }
            // 其他词条使用原颜色函数
            const colors = ['#2c3e50', '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085'];
            const index = Math.floor(Math.random() * colors.length);
            return colors[index];
          };

          WordCloud(englishCanvas, {
            list: mergedData,
            gridSize: Math.round(Math.max(6, Math.min(10, width / 50))), // 减小网格，让词更密集
            weightFactor: function(size) {
              // 根据频率计算字体大小，使用平方根缩放使大小差异更明显
              const normalizedSize = Math.sqrt(size) / Math.sqrt(maxCount);
              // 字体大小范围：8px - 35px，减小字号
              const minFontSize = 8;
              const maxFontSize = Math.min(35, width / 12);
              return minFontSize + normalizedSize * (maxFontSize - minFontSize);
            },
            fontFamily: 'Arial, "Microsoft YaHei", "微软雅黑", sans-serif', // 支持中英文混排
            color: enhancedColorFn,
            rotateRatio: 0.6, // 增加旋转比例，使词云更生动
            backgroundColor: 'transparent',
            minSize: 8, // 最小字体大小
            drawOutOfBound: false, // 不绘制超出边界的词
            shrinkToFit: false, // 不自动缩放，保持原始大小
            ellipticity: 0.8, // 椭圆度，0.8稍微扁平，形成更自然的云朵形状
          });
          console.log('[Main] ✅ 合并词云渲染完成');
        } catch (error) {
          console.error('[Main] 合并词云渲染失败:', error);
          console.error('[Main] 错误详情:', error.stack);
        }
      } else {
        console.warn('[Main] 合并词云数据为空（过滤后）');
      }
    }
  }
}

// 启动应用（仅在非模块导入时自动初始化）
// 如果作为模块导入，不自动初始化，由调用方控制
if (typeof window !== 'undefined' && !window.__ANALYSIS_MODULE_LOADED__) {
  window.__ANALYSIS_MODULE_LOADED__ = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Main] DOMContentLoaded 事件触发');
      init();
    });
  } else {
    console.log('[Main] DOM 已加载，直接初始化');
    init();
  }
}
