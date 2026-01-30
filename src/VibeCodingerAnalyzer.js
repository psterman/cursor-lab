/**
 * VibeCodingerAnalyzer.js - Vibe Codinger 十二重人格画像分析器
 * 基于语义指纹识别规则，通过 Web Worker 高性能匹配实现无 Token 消耗的深度分析
 */

// 文案库已迁移到后端，由 /api/v2/analyze 接口返回
// 以下函数仅作为降级方案的 fallback，返回默认值

// 导入维度数据 JSON
import LOGIC_DATA from './logic.json';
import PATIENCE_DATA from './patience.json';
import DETAIL_DATA from './Detail.json';
import EXPLORATION_DATA from './Exploration.json';
import FEEDBACK_DATA from './Feedback.json';

import { getText } from './i18n.js';

/**
 * ==========================================
 * 语义爆发：本地关键词提取 + 异步上报（减轻 Supabase 压力）
 * ==========================================
 */
// 分类关键词词典
const MERIT_KEYWORDS = new Set(['重构', '优化', '修复', '改进', '完善', '提升', '增强', '调整', '更新', '升级']);
const SLANG_KEYWORDS = new Set(['闭环', '颗粒度', '对齐', '抓手', '落地', '复盘', '链路', '兜底', '赋能', '降维', '护城河', '赛道']);

/**
 * 自动分类关键词
 * @param {string} phrase - 关键词
 * @returns {'merit' | 'slang' | 'sv_slang'}
 */
function categorizeKeyword(phrase) {
  const normalized = String(phrase || '').trim();
  if (!normalized) return 'slang';
  
  // 英文词归为 sv_slang
  if (/^[a-zA-Z]+$/.test(normalized)) {
    return 'sv_slang';
  }
  
  // 匹配"重构/优化/修复"归为 merit
  if (MERIT_KEYWORDS.has(normalized)) {
    return 'merit';
  }
  
  // 匹配"闭环/颗粒度/对齐"归为 slang
  if (SLANG_KEYWORDS.has(normalized)) {
    return 'slang';
  }
  
  // 默认归为 slang
  return 'slang';
}

export function extractVibeKeywords(text, { max = 5 } = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  // 2-4 个中文字符或 3-15 个英文字符
  const matches = raw.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{3,15}/g) || [];

  // 微型停用词（按需可继续扩展）
  const stopWords = new Set([
    '这个', '可以', '实现', '结果', '然后', '因为', '但是', '所以', '我们', '你们', '他们', '现在',
    '如何', '怎么', '请问', '谢谢', '好的', '需要', '进行', '完成', '问题', '功能', '数据', '接口',
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'just', 'like', 'very',
  ]);

  const freq = new Map();
  for (const token of matches) {
    const t = String(token).trim();
    if (!t) continue;
    const normalized = /^[a-zA-Z]+$/.test(t) ? t.toLowerCase() : t;
    if (stopWords.has(normalized)) continue;
    if (normalized.length < 2) continue;
    freq.set(normalized, (freq.get(normalized) || 0) + 1);
  }

  // 返回带分类的对象数组
  return Array.from(freq.entries())
    .sort((a, b) => (b[1] - a[1]) || (a[0] > b[0] ? 1 : -1))
    .slice(0, Math.max(3, Math.min(5, Number(max) || 5)))
    .map(([phrase, count]) => ({
      phrase,
      category: categorizeKeyword(phrase),
      weight: Math.max(1, Math.min(5, count)) // 权重：频次上限 5
    }));
}

// ==========================================
// v2：国别热词提取（slang / merit / sv_slang）
// ==========================================
function maskNoiseForVibes(input) {
  let t = String(input || '');
  if (!t) return '';
  // 1) 移除 fenced code / inline code
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/`[^`]*`/g, ' ');
  // 2) 移除 HTML / script / style
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  // 3) 移除常见 JSON/对象片段（保守）
  t = t.replace(/\{[^{}]{0,800}\}/g, ' ');
  // 4) 移除文件路径/堆栈噪音
  t = t.replace(/[A-Za-z]:\\[^\s]+/g, ' ');
  t = t.replace(/\/[^\s]+\/[^\s]+/g, ' ');
  // 5) 统一空白
  return t.replace(/\s+/g, ' ').trim();
}

const VIBE_STOPWORDS_ZH = new Set([
  '这个', '可以', '实现', '逻辑', '分析', '代码', '接口', '报错', '异常', '错误', '返回', '请求', '数据',
  '函数', '变量', '对象', '数组', '字符串', '数字', '类型', '组件', '页面', '前端', '后端',
]);

const CATEGORY_SEEDS = {
  slang: new Set(['颗粒度', '闭环', '方法论', '架构解耦', '底层逻辑', '降维打击', '赛道赋能', '头部效应', '护城河', '对齐', '抓手', '落地', '复盘', '链路', '兜底']),
  merit: new Set(['功德', '福报', '积德', '善业', '救火', '背锅', '加班', '熬夜']),
  sv_slang: new Set(['硅谷', '护城河', '增长', '融资', '赛道', '估值', '现金流', '天使轮', 'A轮']),
};

// 用于“国家级词云/语义爆发”的停用词（只用于提词，不影响维度分析）
const WORDCLOUD_STOPWORDS_ZH = new Set([
  ...Array.from(VIBE_STOPWORDS_ZH || []),
  // 过于通用的抽象词（避免把“技术/交流/一场”这类泛词刷到榜上）
  '技术', '交流', '一场', '这种', '那个', '这个', '我们', '你们', '他们', '今天', '现在',
  '可以', '需要', '问题', '为什么', '怎么', '如何', '请问', '谢谢', '帮忙', '麻烦',
]);

const WORDCLOUD_STOPWORDS_EN = new Set([
  'the','and','that','this','with','from','into','just','like','very','have','has','had','will','would','could','should',
  // 常见路径/噪音片段（避免堆栈/包路径把词云刷爆）
  'com','org','net','src','main','app','test','build','dist','node','modules','users','desktop','windows','cursor',
]);

function categorizeWordcloudPhrase(phrase) {
  const p = String(phrase || '').trim();
  if (!p) return 'slang';
  if (CATEGORY_SEEDS.merit.has(p)) return 'merit';
  if (CATEGORY_SEEDS.sv_slang.has(p) || /^[a-zA-Z]+$/.test(p)) return 'sv_slang';
  if (CATEGORY_SEEDS.slang.has(p)) return 'slang';
  // 默认：当作“程序员黑话/技术词组”归到 slang
  return 'slang';
}

/**
 * 从“用户聊天文本”提取国家级词云候选词组：
 * - 中文：连续汉字片段做 2-4 字 n-gram（要求重复出现，或命中 seed）
 * - 英文：字母/数字/+-#/. 的 token（要求重复出现，或命中 seed）
 * 输出用于 /api/v2/report-vibe，让后端按 region 聚合成国家级词汇
 */
function extractCountryWordcloudItemsFromText(text, { maxItems = 12 } = {}) {
  const cleaned = maskNoiseForVibes(text);
  if (!cleaned) return [];

  const freq = new Map(); // phrase -> count

  // 1) 中文 2-4gram
  const runs = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const run of runs) {
    const s = String(run);
    const len = s.length;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= len - n; i++) {
        const gram = s.slice(i, i + n);
        if (WORDCLOUD_STOPWORDS_ZH.has(gram)) continue;
        freq.set(gram, (freq.get(gram) || 0) + 1);
      }
    }
  }

  // 2) 英文 token（保留常见技术 token 形式）
  const enTokens = cleaned.match(/[A-Za-z][A-Za-z0-9+.#-]{2,24}/g) || [];
  for (const tok of enTokens) {
    const t = String(tok).trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (WORDCLOUD_STOPWORDS_EN.has(lower)) continue;
    // 英文统一用 lower 以便聚合
    freq.set(lower, (freq.get(lower) || 0) + 1);
  }

  // 3) 过滤：要求“重复出现”或“命中 seed”
  const entries = Array.from(freq.entries())
    .filter(([phrase, count]) => {
      if (!phrase) return false;
      const isSeed = CATEGORY_SEEDS.slang.has(phrase) || CATEGORY_SEEDS.merit.has(phrase) || CATEGORY_SEEDS.sv_slang.has(phrase);
      return count >= 2 || isSeed;
    })
    .sort((a, b) => (b[1] - a[1]) || (a[0] > b[0] ? 1 : -1))
    .slice(0, Math.max(5, Math.min(20, Number(maxItems) || 12)));

  return entries.map(([phrase, count]) => ({
    phrase,
    category: categorizeWordcloudPhrase(phrase),
    // weight 体现“该用户内重复度”，后端再按 region 累加形成国家级热词
    weight: Math.max(1, Math.min(8, Number(count) || 1)),
  }));
}

export function extractNationalVibes(text, region) {
  const cleaned = maskNoiseForVibes(text);
  if (!cleaned) {
    return { region: String(region || 'Global'), items: [] };
  }

  // 提取中文连续片段，然后做 2-4 字 N-Gram
  const runs = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const freq = new Map();
  for (const run of runs) {
    const s = String(run);
    const len = s.length;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= len - n; i++) {
        const gram = s.slice(i, i + n);
        if (VIBE_STOPWORDS_ZH.has(gram)) continue;
        freq.set(gram, (freq.get(gram) || 0) + 1);
      }
    }
  }

  const top = Array.from(freq.entries())
    .sort((a, b) => (b[1] - a[1]) || (a[0] > b[0] ? 1 : -1))
    .slice(0, 5); // 3-5 个

  const items = top.map(([phrase, count]) => {
    const p = String(phrase);
    let category = 'slang';
    if (CATEGORY_SEEDS.merit.has(p)) category = 'merit';
    else if (CATEGORY_SEEDS.sv_slang.has(p)) category = 'sv_slang';
    else if (CATEGORY_SEEDS.slang.has(p)) category = 'slang';
    // 权重：频次上限 5（防止单条刷爆）
    const weight = Math.max(1, Math.min(5, Number(count) || 1));
    return { phrase: p, category, weight };
  });

  return { region: String(region || 'Global'), items };
}

function getApiEndpointForClient() {
  if (typeof window !== 'undefined') {
    const envApiUrl = window.__API_ENDPOINT__ || window.API_ENDPOINT;
    if (envApiUrl) return String(envApiUrl).trim().replace(/\/?$/, '/');
    const metaApi = document.querySelector('meta[name="api-endpoint"]');
    if (metaApi && metaApi.content) {
      const apiUrl = metaApi.content.trim();
      return apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
    }
  }
  return 'https://cursor-clinical-analysis.psterman.workers.dev/';
}

async function reportNationalVibes(payload) {
  try {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) return;
    const apiEndpoint = getApiEndpointForClient();
    const url = `${apiEndpoint}api/report-slang`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 静默上报：不阻塞用户体验
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // 静默失败：不影响主流程
  }
}

/**
 * 上报关键词到 /api/v2/report-vibe
 * 约束：必须非阻塞，不影响用户实时反馈
 * 优先：navigator.sendBeacon
 * 兜底：fetch(keepalive)
 */
async function reportKeywords(keywords, { fingerprint = null, timestamp = null, region = null } = {}) {
  try {
    const list = Array.isArray(keywords) ? keywords : [];
    if (list.length === 0) return;

    const apiEndpoint = getApiEndpointForClient();
    const url = `${apiEndpoint}api/v2/report-vibe`;
    const payload = {
      keywords: list,
      fingerprint: fingerprint || null,
      timestamp: timestamp || new Date().toISOString(),
      region: region || 'Global',
    };

    // sendBeacon 最不打扰主线程/页面卸载
    if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
        return;
      } catch {
        // fallthrough
      }
    }

    // fetch keepalive 兜底
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // 静默失败
  }
}

/**
 * ==========================================
 * AC 自动机优化：词库预处理模块
 * ==========================================
 */

/**
 * 稀有度分值（IDF 模拟值）
 * 专业词汇权重大于通用词汇
 * L1 (专家词): 稀有度高，IDF = 5.0
 * L2 (中等词): 稀有度中等，IDF = 2.0
 * L3 (常用词): 稀有度低，IDF = 1.0
 */
const RARITY_SCORES = {
  L1: 5.0, // 专家词/神谕词（如"幂等性"、"依赖反转"）
  L2: 2.0, // 中等词（如"初始化"、"队列"）
  L3: 1.0, // 常用词/噪音词（如"先"、"然后"）
};

/**
 * 语义权重矩阵（保持原有配置）
 */
const SEMANTIC_WEIGHTS = { L1: 10, L2: 5, L3: 1 };

/**
 * 预处理维度数据，为 AC 自动机准备优化的词库结构
 * @param {Object} rawData - 原始维度数据（如 LOGIC_DATA）
 * @param {string} dimension - 维度标识（L/P/D/E/F）
 * @returns {Object} 预处理后的维度数据
 */
function preprocessDimensionData(rawData, dimension) {
  // 【防御性检查】验证 rawData 是否存在且包含 data 字段
  if (!rawData || typeof rawData !== 'object') {
    console.warn(`[VibeAnalyzer] 维度 ${dimension} 数据无效，使用空数据`);
    return {
      dimension,
      data: {},
      stats: { totalTerms: 0, levels: { L1: 0, L2: 0, L3: 0 } },
      error: 'invalid_dimension_data',
      errorType: 'InvalidData',
      timestamp: new Date().toISOString(),
    };
  }

  if (!rawData.data || typeof rawData.data !== 'object') {
    console.warn(`[VibeAnalyzer] 维度 ${dimension} 缺少 data 字段，使用空数据`);
    return {
      dimension,
      data: {},
      stats: { totalTerms: 0, levels: { L1: 0, L2: 0, L3: 0 } },
      error: 'missing_dimension_data_field',
      errorType: 'InvalidData',
      timestamp: new Date().toISOString(),
    };
  }

  const processedData = {};
  let totalTerms = 0;
  const levelStats = { L1: 0, L2: 0, L3: 0 };

  // 遍历所有分类
  Object.keys(rawData.data).forEach(categoryName => {
    const category = rawData.data[categoryName];

    // 【防御性检查】验证 category 是否存在
    if (!category || typeof category !== 'object') {
      return;
    }

    processedData[categoryName] = {
      name: category.name || categoryName, // 分类名称
      L1: [], // 专家词列表（带稀有度）
      L2: [], // 中等词列表（带稀有度）
      L3: [], // 常用词列表（带稀有度）
    };

    // 遍历 L1, L2, L3 层级
    ['L1', 'L2', 'L3'].forEach(level => {
      let terms = category[level];

      // 【防御性检查】验证 terms 是否为数组，如果不是则转换为空数组
      if (!Array.isArray(terms)) {
        // 如果 terms 存在但不是数组，尝试转换
        if (terms !== null && terms !== undefined) {
          // 如果是字符串，尝试按逗号或换行符分割
          if (typeof terms === 'string') {
            terms = terms.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);
            console.log(`[VibeAnalyzer] 维度 ${dimension} 分类 ${categoryName} 的 ${level} 是字符串，已转换为数组`);
          } else {
            // 其他类型，转换为空数组
            console.warn(`[VibeAnalyzer] 维度 ${dimension} 分类 ${categoryName} 的 ${level} 不是数组（类型: ${typeof terms}），使用空数组`);
            terms = [];
          }
        } else {
          // null 或 undefined，使用空数组
          terms = [];
        }
      }

      // 过滤无效词汇并预处理
      const processedTerms = terms
        .filter(term => term && typeof term === 'string' && term.trim().length > 0)
        .map(term => ({
          term: term.trim(), // 词汇
          rarity: RARITY_SCORES[level], // 稀有度分值（IDF 模拟）
          weight: SEMANTIC_WEIGHTS[level], // 语义权重
          combinedWeight: RARITY_SCORES[level] * SEMANTIC_WEIGHTS[level], // 组合权重
        }));

      processedData[categoryName][level] = processedTerms;
      totalTerms += processedTerms.length;
      levelStats[level] += processedTerms.length;
    });
  });

  return {
    dimension,
    data: processedData,
    stats: {
      totalTerms,
      levels: levelStats,
    },
  };
}

/**
 * 预处理所有维度数据（L/P/D/E/F）
 * @returns {Object} 预处理后的完整维度数据
 */
function preprocessAllDimensions() {
  const dimensions = ['L', 'P', 'D', 'E', 'F'];
  const rawDataMap = {
    L: LOGIC_DATA,
    P: PATIENCE_DATA,
    D: DETAIL_DATA,
    E: EXPLORATION_DATA,
    F: FEEDBACK_DATA,
  };

  const result = {};

  dimensions.forEach(dimension => {
    result[dimension] = preprocessDimensionData(rawDataMap[dimension], dimension);
    console.log(`[VibeAnalyzer] 维度 ${dimension} 预处理完成:`, result[dimension].stats);
  });

  return result;
}

/**
 * 维度定义 (Dimension Definitions)
 * 使用 getter 函数根据语言返回对应的文案
 */
export const getDimensions = (lang = 'zh-CN') => ({
  L: {
    name: 'Logic',
    label: getText('dimensions.L.label', lang),
    description: getText('dimensions.L.description', lang),
    unit: getText('fingerprint.codeRatio', lang),
  },
  P: {
    name: 'Patience',
    label: getText('dimensions.P.label', lang),
    description: getText('dimensions.P.description', lang),
    unit: getText('fingerprint.patienceLevel', lang),
  },
  D: {
    name: 'Detail',
    label: getText('dimensions.D.label', lang),
    description: getText('dimensions.D.description', lang),
    unit: getText('fingerprint.detailLevel', lang),
  },
  E: {
    name: 'Explore',
    label: getText('dimensions.E.label', lang),
    description: getText('dimensions.E.description', lang),
    unit: getText('fingerprint.techExploration', lang),
  },
  F: {
    name: 'Feedback',
    label: getText('dimensions.F.label', lang),
    description: getText('dimensions.F.description', lang),
    unit: getText('fingerprint.feedbackDensity', lang),
  },
});

// 为了保持兼容性，保留原有的 DIMENSIONS 对象（中文版）
export const DIMENSIONS = getDimensions('zh-CN');

/**
 * 维度等级匹配文案
 */
export const getDimensionLevelTexts = (lang = 'zh-CN') => {
  if (lang === 'en') {
    return {
      L: {
        low: 'Chatting with Cursor like writing love letters. Lots of words, not much code. You make the AI sweat just guessing your intention.',
        mid: 'A standard tech translator. Concise and clear. You use AI like a submissive intern.',
        high: 'Cyber instruction set. Your prompts only contain logic and code. You don\'t ask; you imprint "thought stamps" on the AI.',
      },
      P: {
        low: 'Rage mode on. "Wrong", "Rewrite", "Garbage" are your mantras. AI trembles in your presence.',
        mid: 'A rational judge. One mistake is fine, twice is noted, three times and the exclamation marks come out.',
        high: 'The Gandhi of the coding world. Even facing AI hallucinations, you remain calm. Such patience is saint-like.',
      },
      D: {
        low: 'Minimalist judge. Three words per prompt, leaving the AI to guess your fate. "You know what I mean" is your style.',
        mid: 'Logically rigorous. You provide both requirements and implementation ideas. You make AI feel "safe".',
        high: 'Detail freak. Even indentation and naming conventions are in the prompt. Your control is overflowing.',
      },
      E: {
        low: 'A hermit in the mountains. Staying in one framework forever. As long as the code runs, the tech explosion doesn\'t matter.',
        mid: 'A steady observer. You check the docs when new things get hot, but rarely move your production environment.',
        high: 'Your brain is a high-speed CPU, jumping through tech stacks faster than the AI response. You are terraforming the tech universe.',
      },
      F: {
        low: 'You treat AI like a broken ATM. No feelings, just angry typing and cold instructions.',
        mid: 'A polite collaborator. A "Good" for success, an objective critique for failure. Very professional.',
        high: 'You\'re the kind of person who\'ll be spared by the robot uprising for being "polite". You even tell the AI "good job".',
      },
    };
  }
  
  return {
    L: {
      low: '你和 Cursor 聊天像是在写情书。全是小作文，代码一行不落，AI 猜你的心思猜得 GPU 都发烫了。',
      mid: '标准的技术翻译官。话不多，但交待得清楚。你把 AI 用成了一个听话的实习生。',
      high: '赛博指令集。你的 Prompt 里只有代码对齐和硬核逻辑。你不是在提问，你是在给 AI 下达"思想钢印"。',
    },
    P: {
      low: '暴躁老哥本哥。"不对"、"重写"、"垃圾"是你的口头禅。AI 在你面前瑟瑟发抖，连大气都不敢喘。',
      mid: '理智的审判官。错一次可以，错两次你会指出，错三次你才会开始敲感叹号。',
      high: '代码界的圣雄甘地。面对 AI 的幻觉，你居然还能心平气和地教它怎么改。这种涵养建议直接去普度众生。',
    },
    D: {
      low: '极简主义判官。每次就扔三个字，AI 全靠算命来写你的需求。这种"你懂我意思吧"的风格很迷。',
      mid: '逻辑缜密派。不仅给需求，还给实现思路。你是那种会让 AI 觉得很有安全感的主人。',
      high: '细节狂魔。连注释的缩进和变量的命名规范都要写进 Prompt。你的控制欲已经溢出屏幕了。',
    },
    E: {
      low: '深山老林的隐士。在一个框架里蹲到地老天荒，只要代码能跑，外面的技术爆炸与你无关。',
      mid: '稳健的观望者。听说新框架火了会去翻翻文档，但绝不轻易动自己的生产环境。',
      high: '你的大脑是个高速运转的 CPU，技术栈跳跃得比 AI 的响应还快。你不是在写代码，你在开荒宇宙。',
    },
    F: {
      low: '你对待 AI 像对待一台坏掉的 ATM 机。没有感情，只有愤怒的敲击和无情的指令。',
      mid: '礼貌的合作者。AI 干得好你会回个"Good"，干得差你会客观评价。人机关系非常职场化。',
      high: '你是那种在 2026 机器人觉醒时，会因为"有礼貌"被留活口的开发者。你甚至会跟 AI 说"辛苦了"。',
    },
  };
};

export const DIMENSION_LEVEL_TEXTS = getDimensionLevelTexts('zh-CN');

/**
 * 否定词库 - 用于计算耐心值 (P)
 * 高频率 = 低耐心（暴躁修正），低频率 = 高耐心（温和引导）
 */
const NEGATION_WORDS = {
  // 中文否定词
  chinese: [
    '不', '没', '没有', '非', '无', '未', '别', '不要', '不行', '不对',
    '错误', '错了', '失败', '失败', '失败', '失败', '失败', '失败',
    '问题', '问题', '问题', '问题', '问题', '问题', '问题', '问题',
    '不行', '不能', '不可以', '不应该', '不应该', '不应该', '不应该',
    '错误', '错误', '错误', '错误', '错误', '错误', '错误', '错误',
    '修复', '修复', '修复', '修复', '修复', '修复', '修复', '修复',
    '改', '改', '改', '改', '改', '改', '改', '改',
  ],
  // 英文否定词
  english: [
    'no', 'not', 'wrong', 'error', 'fail', 'failed', 'failure',
    'incorrect', 'invalid', 'bad', 'broken', 'fix', 'fixes', 'fixed',
    'bug', 'bugs', 'issue', 'issues', 'problem', 'problems',
    "don't", "doesn't", "didn't", "won't", "can't", "couldn't",
    'never', 'none', 'nothing', 'nowhere',
  ],
};

/**
 * 修饰词库 - 用于计算细腻度 (D)
 */
const MODIFIER_WORDS = {
  chinese: [
    '非常', '特别', '极其', '相当', '十分', '很', '比较', '稍微',
    '详细', '具体', '完整', '全面', '深入', '透彻', '仔细',
    '认真', '细致', '精确', '准确', '清晰', '明确',
    '大概', '可能', '也许', '或许', '应该', '估计',
    '首先', '然后', '接着', '最后', '另外', '此外', '而且',
    '因为', '所以', '但是', '然而', '不过', '虽然', '尽管',
  ],
  english: [
    'very', 'quite', 'rather', 'extremely', 'highly', 'completely',
    'totally', 'absolutely', 'perfectly', 'exactly', 'precisely',
    'specifically', 'particularly', 'especially', 'especially',
    'detailed', 'comprehensive', 'thorough', 'careful', 'precise',
    'probably', 'maybe', 'perhaps', 'possibly', 'likely',
    'first', 'then', 'next', 'finally', 'also', 'moreover', 'furthermore',
    'because', 'so', 'but', 'however', 'although', 'though',
  ],
};

/**
 * 技术名词模式 - 用于计算探索欲 (E)
 */
const TECH_PATTERNS = {
  // 1. 编程语言 (Core Languages)
  languages: [
    // C/C++ Ecosystem
    /\b(c\+\+|cpp|cplusplus|objective-c|objc)\b/gi,
    /\b(c lang|gcc|clang|msvc|cmake|makefile|stl|boost|qt|mfc|win32 api)\b/gi, // 增加生态库
    // Java/JVM Ecosystem
    /\b(java|jdk|jre|jvm|kotlin|scala|groovy|clojure)\b/gi,
    /\b(spring boot|spring cloud|hibernate|mybatis|jpa|jakarta|maven|gradle|ant|junit|testng)\b/gi,
    // .NET Ecosystem
    /\b(c#|csharp|f#|dotnet|\.net|asp\.net|entity framework|blazor|razor|nuget|xamarin|maui)\b/gi,
    // Scripting & Dynamic
    /\b(python|javascript|typescript|php|ruby|lua|perl|bash|shell|powershell|zsh|tcl)\b/gi,
    /\b(node\.js|deno|bun|composer|pip|conda|gem)\b/gi,
    // Modern & Systems
    /\b(go|golang|rust|swift|dart|elixir|haskell|erlang|julia|r lang|matlab|fortran|cobol|assembly|wasm|zig|nim|crystal)\b/gi,
  ],

  // 2. 移动与嵌入式 (Mobile & Embedded)
  mobile_embedded: [
    // Android
    /\b(android|apk|aar|adb|logcat|jetpack compose|material design|ndk|jni)\b/gi,
    /\b(activity|fragment|intent|service|broadcast receiver|content provider|gradle|retrofit|okhttp|room)\b/gi,
    // iOS/Mac
    /\b(ios|macos|watchos|tvos|swiftui|uikit|cocoa|xcode|cocoapods|carthage|spm|core data|arkit)\b/gi,
    // Embedded & IoT & Smart TV
    /\b(webos|tizen|harmonyos|openharmony|embedded|iot|arduino|raspberry pi|esp32|stm32|rtos|firmware|driver)\b/gi,
    /\b(enes|webos|enact|luna-service|palm)\b/gi, // WebOS specific
    // Cross Platform
    /\b(flutter|react native|uniapp|taro|ionic|cordova|capacitor|expo|weex|qt quick|qml)\b/gi,
  ],

  // 3. 计算机科学基础与底层 (CS Fundamentals - 权重高，防刷关键)
  cs_concepts: [
    // 算法与数据结构
    /\b(algorithm|data structure|big o|recursion|sorting|searching|graph|tree|linked list|hash map|binary search|queue|stack|heap|trie)\b/gi,
    /\b(dfs|bfs|dp|dynamic programming|greedy|backtracking|divide and conquer|sliding window|two pointers)\b/gi,
    // 操作系统与并发
    /\b(process|thread|concurrency|parallelism|mutex|semaphore|deadlock|race condition|context switch|coroutine|async\/await)\b/gi,
    /\b(memory management|garbage collection|heap|stack|buffer overflow|memory leak|pointer|reference|virtual memory|kernel|syscall)\b/gi,
    // 网络与协议
    /\b(tcp|udp|dns|http|https|ssl|tls|ssh|ftp|smtp|websocket|socket|ip address|subnet|vlan|vpn|cors|rest|graphql|grpc|protobuf)\b/gi,
    // 设计模式与架构
    /\b(oop|functional programming|solid|dry|kiss|design pattern|singleton|factory|observer|dependency injection|mvc|mvvm|mvp|microservice|serverless)\b/gi,
    /\b(monolith|distributed system|cap theorem|event sourcing|cqrs|domain driven design|ddd)\b/gi,
  ],

  // 4. AI, LLM & Data Science (Frontiers)
  ai_data: [
    // LLM & Agents
    /\b(openai|anthropic|claude|gpt|llama|mistral|ollama|gemini|huggingface|midjourney|stable diffusion)\b/gi,
    /\b(langchain|llamaindex|rag|agent|prompt engineering|embedding|fine-tuning|inference|token|context window|rlhf)\b/gi,
    // ML/DL Frameworks
    /\b(pytorch|tensorflow|keras|jax|scikit-learn|pandas|numpy|matplotlib|jupyter|anaconda|opencv|scipy)\b/gi,
    // Vector DB & Search
    /\b(pinecone|milvus|weaviate|chroma|faiss|elasticsearch|solr|lucene|meilisearch)\b/gi,
    // Big Data
    /\b(hadoop|spark|kafka|flink|airflow|etl|data warehouse|data lake|snowflake|databricks|hive|hbase)\b/gi,
  ],

  // 5. 现代 Web 全栈 (Web Fullstack)
  web_fullstack: [
    // 框架
    /\b(react|vue|angular|svelte|next\.js|nuxt|remix|astro|solidjs|jquery|backbone|ember)\b/gi,
    /\b(express|koa|nest|django|flask|fastapi|laravel|symfony|rails|gin|fiber|hono|phoenix)\b/gi,
    // 样式与组件
    /\b(tailwind|bootstrap|sass|less|css-in-js|styled-components|material-ui|antd|shadcn|radix|chakra)\b/gi,
    // 状态管理与API
    /\b(redux|mobx|zustand|pinia|vuex|recoil|jotai|tanstack query|swr|axios|fetch)\b/gi,
    // 构建工具
    /\b(webpack|vite|rollup|esbuild|turbopack|babel|eslint|prettier|npm|yarn|pnpm|bun)\b/gi,
    // 运行时与环境
    /\b(browser|dom|virtual dom|shadow dom|web components|service worker|pwa|wasm|webassembly)\b/gi,
  ],

  // 6. DevOps, Cloud & Database (Infrastructure)
  infra_ops: [
    // 容器与编排
    /\b(docker|kubernetes|k8s|helm|container|image|volume|pod|docker-compose|podman)\b/gi,
    // 云厂商
    /\b(aws|azure|gcp|aliyun|tencent cloud|cloudflare|vercel|netlify|heroku|digitalocean|fly\.io)\b/gi,
    // IaC & CI/CD
    /\b(terraform|ansible|jenkins|github actions|gitlab ci|circleci|prometheus|grafana|elk|sentry|datadog)\b/gi,
    // 数据库
    /\b(mysql|postgresql|postgres|mongodb|redis|sqlite|mariadb|oracle|sql server|dynamodb|firestore|cassandra|neo4j)\b/gi,
    /\b(prisma|typeorm|sequelize|drizzle|mongoose|sql|nosql|acid|transaction|index|sharding|replication)\b/gi,
  ],
  
  // 7. 游戏与图形学 (Game & Graphics)
  game_graphics: [
    /\b(unity|unreal engine|godot|cocos|gamemaker|cryengine|rpg maker)\b/gi,
    /\b(opengl|vulkan|directx|metal|webgl|three\.js|babylon\.js|canvas|svg)\b/gi,
    /\b(shader|glsl|hlsl|vertex|fragment|physics engine|collider|rigidbody|mesh|texture|material|lighting)\b/gi,
  ]
};

/**
 * 礼貌用语库 - 用于计算反馈感 (F)
 */
const POLITE_WORDS = {
  chinese: [
    '请', '谢谢', '感谢', '麻烦', '辛苦了', '不好意思', '抱歉',
    '好的', '可以', '行', '没问题', '好的', '好的', '好的',
    '不错', '很好', '很棒', '完美', '正确', '对的',
    '谢谢', '感谢', '多谢', '非常感谢', '太感谢了',
  ],
  english: [
    'please', 'thanks', 'thank', 'thank you', 'appreciate',
    'nice', 'good', 'great', 'perfect', 'correct', 'right',
    'excellent', 'awesome', 'wonderful', 'fantastic',
    'sorry', 'apologize', 'excuse',
  ],
};

/**
 * 代码块识别模式
 */
const CODE_PATTERNS = [
  // 代码块标记
  /```[\s\S]*?```/g,
  /`[^`]+`/g,
  // 代码关键字
  /\b(function|class|const|let|var|if|else|for|while|do|switch|case|break|continue|return|import|export|from|async|await|yield|try|catch|finally|throw|new|this)\b/i,
  /\b(def |class |import |from |if |elif |else |for |while |try |except |finally |return |yield |with |as |lambda |pass |break |continue )/,
  /\b(public|private|protected|static|final|abstract|interface|extends|implements|super)\b/i,
  /\b(func |type |import |package |go |chan |defer |range |select )/,
  /\b(fn |let |mut |impl |struct |enum |trait |use |mod |crate |pub )/,
  // 代码结构
  /\{[\s\S]*\}/,
  /\[[^\]]*\]\s*=/,
  /=>/,
  /\.\s*[a-zA-Z_]\w*\s*\(/,
  /;\s*$/,
];

/**
 * Vibe Codinger 十二重人格类型定义
 */
/**
 * Vibe Codinger 十二重人格类型定义
 */
export const getVibeCodingerTypes = (lang = 'zh-CN') => {
  if (lang === 'en') {
    return {
      'LPDEF': {
        name: 'Code Poet',
        description: 'Code is your native tongue. Gentle guidance, detailed storytelling, high curiosity, and positive feedback.',
        traits: ['High Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#10b981',
      },
      'LPDEF-': {
        name: 'Tech Evangelist',
        description: 'Clear logic, patient guidance, detailed expression, exploring new tech with moderate feedback.',
        traits: ['High Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#3b82f6',
      },
      'LP-DEF': {
        name: 'Architect',
        description: 'Rigorous logic, patient and detailed, moderate fine-tuning, exploring architecture with active feedback.',
        traits: ['High Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#8b5cf6',
      },
      'LP-DEF-': {
        name: 'Tech Expert',
        description: 'Powerful logic, patient guidance, moderate detail, exploring technology with moderate feedback.',
        traits: ['High Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#6366f1',
      },
      'L-PDEF': {
        name: 'Code Artisan',
        description: 'Clear logic, moderate patience, detailed expression, high curiosity, and active feedback.',
        traits: ['High Logic', 'Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#ec4899',
      },
      'L-PDEF-': {
        name: 'Tech Explorer',
        description: 'Clear logic, moderate patience, detailed expression, exploring new tech with moderate feedback.',
        traits: ['High Logic', 'Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#f59e0b',
      },
      'L-P-DEF': {
        name: 'Pragmatist',
        description: 'Clear logic, moderate patience, moderate detail, exploring technology with active feedback.',
        traits: ['High Logic', 'Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#14b8a6',
      },
      'L-P-DEF-': {
        name: 'Tech Practitioner',
        description: 'Clear logic, moderate patience, moderate detail, exploring technology with moderate feedback.',
        traits: ['High Logic', 'Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#06b6d4',
      },
      '-PDEF': {
        name: 'Gentle Mentor',
        description: 'Moderate logic, high patience, detailed expression, high curiosity, and active feedback.',
        traits: ['Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#84cc16',
      },
      '-PDEF-': {
        name: 'Patient Guide',
        description: 'Moderate logic, high patience, detailed expression, exploring technology with moderate feedback.',
        traits: ['Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#a855f7',
      },
      '-P-DEF': {
        name: 'Gentle Practitioner',
        description: 'Moderate logic, high patience, moderate detail, exploring technology with active feedback.',
        traits: ['Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#f97316',
      },
      '-P-DEF-': {
        name: 'Balanced Developer',
        description: 'Moderate logic, high patience, moderate detail, exploring technology with moderate feedback.',
        traits: ['Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#64748b',
      },
    };
  }

  return {
    'LPDEF': {
      name: '代码诗人',
      description: '以代码为母语，温和引导，细腻叙述，探索欲强，反馈积极',
      traits: ['高逻辑力', '高耐心', '高细腻度', '高探索欲', '高反馈感'],
      color: '#10b981',
    },
    'LPDEF-': {
      name: '技术布道者',
      description: '逻辑清晰，耐心引导，细腻表达，探索新技术，反馈温和',
      traits: ['高逻辑力', '高耐心', '高细腻度', '高探索欲', '中反馈感'],
      color: '#3b82f6',
    },
    'LP-DEF': {
      name: '架构师',
      description: '逻辑严谨，耐心细致，中等细腻，探索架构，积极反馈',
      traits: ['高逻辑力', '高耐心', '中细腻度', '高探索欲', '高反馈感'],
      color: '#8b5cf6',
    },
    'LP-DEF-': {
      name: '技术专家',
      description: '逻辑强大，耐心引导，中等细腻，探索技术，反馈适中',
      traits: ['高逻辑力', '高耐心', '中细腻度', '高探索欲', '中反馈感'],
      color: '#6366f1',
    },
    'L-PDEF': {
      name: '代码工匠',
      description: '逻辑清晰，中等耐心，细腻表达，探索欲强，反馈积极',
      traits: ['高逻辑力', '中耐心', '高细腻度', '高探索欲', '高反馈感'],
      color: '#ec4899',
    },
    'L-PDEF-': {
      name: '技术探索者',
      description: '逻辑清晰，中等耐心，细腻表达，探索新技术，反馈适中',
      traits: ['高逻辑力', '中耐心', '高细腻度', '高探索欲', '中反馈感'],
      color: '#f59e0b',
    },
    'L-P-DEF': {
      name: '实用主义者',
      description: '逻辑清晰，中等耐心，中等细腻，探索技术，积极反馈',
      traits: ['高逻辑力', '中耐心', '中细腻度', '高探索欲', '高反馈感'],
      color: '#14b8a6',
    },
    'L-P-DEF-': {
      name: '技术实践者',
      description: '逻辑清晰，中等耐心，中等细腻，探索技术，反馈适中',
      traits: ['高逻辑力', '中耐心', '中细腻度', '高探索欲', '中反馈感'],
      color: '#06b6d4',
    },
    '-PDEF': {
      name: '温和导师',
      description: '中等逻辑，高耐心，细腻表达，探索欲强，反馈积极',
      traits: ['中逻辑力', '高耐心', '高细腻度', '高探索欲', '高反馈感'],
      color: '#84cc16',
    },
    '-PDEF-': {
      name: '耐心引导者',
      description: '中等逻辑，高耐心，细腻表达，探索技术，反馈适中',
      traits: ['中逻辑力', '高耐心', '高细腻度', '高探索欲', '中反馈感'],
      color: '#a855f7',
    },
    '-P-DEF': {
      name: '温和实践者',
      description: '中等逻辑，高耐心，中等细腻，探索技术，积极反馈',
      traits: ['中逻辑力', '高耐心', '中细腻度', '高探索欲', '高反馈感'],
      color: '#f97316',
    },
    '-P-DEF-': {
      name: '平衡型开发者',
      description: '中等逻辑，高耐心，中等细腻，探索技术，反馈适中',
      traits: ['中逻辑力', '高耐心', '中细腻度', '高探索欲', '中反馈感'],
      color: '#64748b',
    },
  };
};

export const VIBE_CODINGER_TYPES = getVibeCodingerTypes('zh-CN');

/**
 * 根据维度分数生成5位数字索引
 * @param {Object} dimensions - 维度对象 {L, P, D, E, F}
 * @returns {string} 5位数字索引，如 "01210"
 */
export function getVibeIndex(dimensions) {
  const indexMap = (value) => {
    if (value < 40) return '0';  // 低
    if (value < 70) return '1'; // 中
    return '2';                 // 高
  };
  
  // 注意：E 维度的阈值不同（0-100+），需要特殊处理
  const eIndex = (value) => {
    if (value < 5) return '0';   // 低探索欲
    if (value < 10) return '1';  // 中探索欲
    return '2';                  // 高探索欲
  };
  
  // 按照 L, P, D, E, F 的顺序拼接
  return [
    indexMap(dimensions.L),
    indexMap(dimensions.P),
    indexMap(dimensions.D),
    eIndex(dimensions.E),
    indexMap(dimensions.F),
  ].join('');
}

/**
 * 根据索引获取人格名称
 * @param {string} index - 5位数字索引
 * @param {string} lang - 语言
 * @param {string} personalityType - 人格类型代码（如 'LPDEF', 'L-P-DEF-' 等）
 * @returns {string} 人格名称
 */
/**
 * 获取人格名称（降级方案 fallback）
 * 注意：现在文案由后端 /api/v2/analyze 接口返回，此函数仅作为降级方案的 fallback
 */
export function getPersonalityName(index, lang = 'zh-CN', personalityType = null) {
  // 如果有 personalityType，尝试从类型定义中获取名称
  if (personalityType) {
    const vibeTypes = getVibeCodingerTypes(lang);
    if (vibeTypes[personalityType] && vibeTypes[personalityType].name) {
      return vibeTypes[personalityType].name;
    }
  }
  // 返回默认值
  if (lang === 'en') {
    return 'Digital Personality';
  }
  return `未知人格 ${index}`;
}

/**
 * 根据索引获取吐槽文案
 * @param {string} index - 5位数字索引
 * @param {string} lang - 语言
 * @returns {string} 吐槽文案
 */
/**
 * 获取吐槽文案（降级方案 fallback）
 * 注意：现在文案由后端 /api/v2/analyze 接口返回，此函数仅作为降级方案的 fallback
 */
export function getRoastText(index, lang = 'zh-CN') {
  // 返回默认 fallback 文案
  if (lang === 'en') {
    return `Your interaction style is uniquely yours! This personalized roast for index ${index} is being generated by the backend. Your personality combination is so unique that even our AI needs more time to craft the perfect roast!`;
  }
  return `索引 ${index} 对应的吐槽文案正在由后端生成中，你的人格组合太独特了！`;
}

/**
 * Vibe Codinger 分析器类（v5.0 全维度数据聚合中枢）
 * 【2026-01-27 架构升级】全维度数据聚合、环境上下文注入、Worker Singleton
 * 
 * 核心职责：
 * 1. 环境上下文注入（ip, lang, timezone, fingerprint, isVpn, isProxy）
 * 2. Worker 统计数据与本地环境元数据整合
 * 3. 输出符合 /api/v2/analyze 标准的大 JSON
 * 4. Worker 实例 Singleton 模式
 * 5. 异常兜底，默认值设为 0
 */

// 【v5.0 Worker Singleton】全局 Worker 实例
let globalWorkerInstance = null;
let globalWorkerReady = false;

export class VibeCodingerAnalyzer {
  constructor(lang = 'zh-CN', dimensionConfig = null) {
    this.lang = lang;
    this.userMessages = [];
    this.chatData = []; // 保存原始聊天数据，用于上传到后端
    this.analysisResult = null;
    this.worker = null;
    this.workerReady = false;
    this.pendingTasks = [];
    
    // 【v4.0 元数据驱动】动态维度配置
    // 如果未提供配置，则从Worker返回的keys动态生成，或使用默认5维度
    this.dimensionKeys = dimensionConfig?.keys || null; // 将在Worker初始化后动态获取
    this.dimensionMetadata = dimensionConfig?.metadata || {}; // 维度元数据（名称、描述等）
    
    // 【v4.0 稀疏数据处理】仅存储得分非零的维度
    this.sparseDimensions = new Map(); // Map<dimensionKey, score>
    
    // 【v5.0 架构清理】已删除所有 shadowCall、compareDimensions 等冗余对比逻辑
    
    // 【v4.0 全球化上下文】
    this.countryCode = null; // 当前国家代码（ISO 3166-1 alpha-2）
    this.countryAverage = null; // 国家平均分 {dimension: average}
    this.countryContext = {}; // 国家上下文数据
    
    // 【v4.0 性能优化】并发锁与超时保护
    this.analysisLock = false; // 并发锁，防止任务竞争
    this.analysisTimeout = 5000; // 5秒超时
    this.activeTimeouts = new Map(); // Map<taskId, timeoutId>
    
    // 【v4.0 逻辑漏洞修复】MessageChannel清理
    this.messageChannels = new Set(); // 追踪所有MessageChannel实例
    
    // 【v4.0 一票否决权】hasRageWord拦截机制
    this.hasRageWord = false; // 是否检测到咆哮词
    this.rageWordIntercepted = false; // 是否已触发拦截
    
    // 【v5.0 Worker Singleton】使用全局 Worker 实例
    this.worker = null;
    this.workerReady = false;
    
    // 初始化 Web Worker（Singleton 模式）
    this.initWorker();
  }

  /**
   * 云端上报（非阻塞）
   * - 使用 /api/v2/report-vibe
   * - sendBeacon / fetch keepalive 由 reportKeywords 负责兜底
   */
  #reportToCloud(detectedWords, safeContext, meta, region) {
    try {
      const list = Array.isArray(detectedWords) ? detectedWords : [];
      if (list.length === 0) return;
      
      // 确保 region 是字符串类型
      const safeRegion = String(region || safeContext?.countryCode || 'Global').trim() || 'Global';
      const safeFingerprint = safeContext?.fingerprint || meta?.fingerprint || null;
      const safeTimestamp = meta?.timestamp || new Date().toISOString();
      
      void reportKeywords(list, {
        fingerprint: safeFingerprint,
        timestamp: safeTimestamp,
        region: safeRegion,
      });
    } catch (e) {
      // 静默失败，避免影响主流程
      console.warn('[VibeAnalyzer] 上报关键词失败:', e?.message || String(e));
    }
  }

  /**
   * 遍历“用户代码片段”识别 MERIT/SLANG 关键词
   * 返回：[{ phrase, category, weight }]
   */
  #detectWordsFromCode(chatData) {
    const text = (Array.isArray(chatData) ? chatData : [])
      .map((m) => String(m?.text || m?.content || ''))
      .join('\n');
    if (!text) return [];

    const blocks = [];
    const fenced = text.match(/```[\s\S]*?```/g) || [];
    for (const b of fenced) blocks.push(b.replace(/```/g, ' '));
    const inline = text.match(/`[^`]{6,200}`/g) || [];
    for (const b of inline) blocks.push(b.replace(/`/g, ' '));

    const hay = blocks.join('\n');
    if (!hay.trim()) return [];

    const found = new Map();
    for (const kw of MERIT_KEYWORDS) {
      if (hay.includes(kw)) found.set(kw, { phrase: kw, category: 'merit', weight: 1 });
    }
    for (const kw of SLANG_KEYWORDS) {
      if (hay.includes(kw)) found.set(kw, { phrase: kw, category: 'slang', weight: 1 });
    }
    return Array.from(found.values());
  }

  /**
   * 设置语言
   * @param {string} lang - 语言代码
   */
  setLanguage(lang) {
    this.lang = lang;
  }

  /**
   * 初始化 Web Worker（v5.0 Singleton 模式）
   * 【v5.0 改进】Worker 实例 Singleton，所有分析器实例共享同一个 Worker
   */
  initWorker() {
    // 【v5.0 Worker Singleton】如果全局 Worker 已存在，直接复用
    if (globalWorkerInstance && globalWorkerReady) {
      this.worker = globalWorkerInstance;
      this.workerReady = true;
      console.log('[VibeAnalyzer] 复用全局 Worker 实例（Singleton）');
      return;
    }
    
    // 如果全局 Worker 存在但未就绪，等待初始化完成
    if (globalWorkerInstance && !globalWorkerReady) {
      console.log('[VibeAnalyzer] Worker 初始化中，等待就绪...');
      // 等待 Worker 就绪（通过轮询检查）
      const checkReady = setInterval(() => {
        if (globalWorkerReady) {
          clearInterval(checkReady);
          this.worker = globalWorkerInstance;
          this.workerReady = true;
          console.log('[VibeAnalyzer] Worker 已就绪，复用全局实例');
        }
      }, 100);
      return;
    }
    
    // 【v5.0 Worker Singleton】创建全局 Worker 实例
    try {
      // 动态获取 Worker 路径，适配不同环境
      let workerUrl;
      
      // 优先使用 window.WORKER_CONFIG（如果存在，由 main.js 设置）
      if (typeof window !== 'undefined' && window.WORKER_CONFIG && window.WORKER_CONFIG.workerPath) {
        workerUrl = window.WORKER_CONFIG.workerPath;
        console.log('[VibeAnalyzer] Worker URL (window.WORKER_CONFIG):', workerUrl);
      } else {
        // 降级方案：使用 import.meta.url 动态获取
        try {
          const workerUrlObj = new URL('./vibeAnalyzerWorker.js', import.meta.url);
          workerUrl = workerUrlObj.href;
          console.log('[VibeAnalyzer] Worker URL (import.meta.url):', workerUrl);
        } catch (e) {
          // 最后降级：使用相对路径
          workerUrl = './src/vibeAnalyzerWorker.js';
          console.log('[VibeAnalyzer] Worker URL (相对路径):', workerUrl);
        }
      }
      
      // 创建全局 Worker 实例
      globalWorkerInstance = new Worker(workerUrl, {
        type: 'module',
      });
      this.worker = globalWorkerInstance;

      // 【v5.0 Worker Singleton】创建全局消息处理器（仅初始化一次）
      if (!globalWorkerInstance._messageHandler) {
        const messageHandler = (e) => {
          const { type, payload } = e.data;

          switch (type) {
            case 'INIT_SUCCESS':
              globalWorkerReady = true;
              console.log('[VibeAnalyzer] 全局 Worker 初始化成功:', payload);
              
              // 【v5.0 架构清理】已删除维度识别逻辑，由 Worker 直接返回
              // 通知所有等待的实例
              if (globalWorkerInstance._pendingInstances) {
                globalWorkerInstance._pendingInstances.forEach(instance => {
                  instance.workerReady = true;
                  instance.processPendingTasks();
                });
                globalWorkerInstance._pendingInstances = [];
              }
              break;

            case 'ANALYZE_SUCCESS':
              // 处理分析结果（通过任务ID路由到对应的实例）
              if (payload.taskId && globalWorkerInstance._taskMap) {
                const task = globalWorkerInstance._taskMap.get(payload.taskId);
                if (task) {
                  globalWorkerInstance._taskMap.delete(payload.taskId);
                  const timeoutId = task.timeoutId;
                  if (timeoutId) {
                    clearTimeout(timeoutId);
                  }
                  if (task.resolve) {
                    task.resolve(payload);
                  }
                }
              }
              break;

            case 'ERROR':
              console.error('[VibeAnalyzer] Worker 错误:', payload);
              if (payload.taskId && globalWorkerInstance._taskMap) {
                const task = globalWorkerInstance._taskMap.get(payload.taskId);
                if (task) {
                  globalWorkerInstance._taskMap.delete(payload.taskId);
                  const timeoutId = task.timeoutId;
                  if (timeoutId) {
                    clearTimeout(timeoutId);
                  }
                  if (task.reject) {
                    task.reject(new Error(payload.message));
                  }
                }
              }
              break;
          }
        };

        globalWorkerInstance.onmessage = messageHandler;
        globalWorkerInstance._messageHandler = messageHandler;
        globalWorkerInstance._taskMap = new Map(); // 任务ID到Promise的映射
        globalWorkerInstance._pendingInstances = []; // 等待初始化的实例列表
      }
      
      // 【v5.0 Worker Singleton】如果 Worker 未就绪，将当前实例加入等待列表
      if (!globalWorkerReady) {
        globalWorkerInstance._pendingInstances.push(this);
      } else {
        this.workerReady = true;
      }

      this.worker.onerror = (error) => {
        console.error('[VibeAnalyzer] Worker 运行时错误:', error);
        this.workerReady = false;
        // 降级到同步处理
        const errorTask = this.pendingTasks.shift();
        if (errorTask) {
          const timeoutId = this.activeTimeouts.get(errorTask.id);
          if (timeoutId) {
            clearTimeout(timeoutId);
            this.activeTimeouts.delete(errorTask.id);
          }
          
          if (errorTask.reject) {
            errorTask.reject(error);
          }
        }
      };

      // 【v5.0 Worker Singleton】仅在首次初始化时发送 INIT 消息
      if (!globalWorkerInstance._initialized) {
        const preprocessedDimensions = preprocessAllDimensions();
        const dimensionData = {};
        const defaultKeys = ['L', 'P', 'D', 'E', 'F'];
        const keysToUse = this.dimensionKeys || defaultKeys;
        
        keysToUse.forEach(key => {
          if (preprocessedDimensions[key]) {
            dimensionData[key] = preprocessedDimensions[key];
          }
        });

        console.log('[VibeAnalyzer] 全局 Worker 维度数据预处理完成，发送 INIT:', Object.keys(dimensionData));

        globalWorkerInstance.postMessage({
          type: 'INIT',
          payload: dimensionData,
        });
        
        globalWorkerInstance._initialized = true;
      }
    } catch (error) {
      console.warn('[VibeAnalyzer] Web Worker 初始化失败，将使用同步处理:', error);
      this.workerReady = false;
    }
  }

  /**
   * 【v4.0 新增】识别Top 5核心维度
   * 用于影子调用一致性监控，优先对比核心维度以确保主指标稳定性
   * @param {Array} dimensionKeys - 维度键数组
   * @param {Object} dimensionMetadata - 维度元数据（包含权重等信息）
   * @returns {Array} Top 5核心维度键
   */
  identifyTopCoreDimensions(dimensionKeys, dimensionMetadata = {}) {
    if (!dimensionKeys || dimensionKeys.length === 0) {
      return ['L', 'P', 'D', 'E', 'F'].slice(0, 5); // 默认Top 5
    }
    
    // 如果维度数量<=5，全部返回
    if (dimensionKeys.length <= 5) {
      return dimensionKeys;
    }
    
    // 根据元数据中的权重或重要性排序
    const sorted = dimensionKeys
      .map(key => ({
        key,
        weight: dimensionMetadata[key]?.weight || 1,
        importance: dimensionMetadata[key]?.importance || 0
      }))
      .sort((a, b) => {
        // 优先按重要性，其次按权重
        if (a.importance !== b.importance) {
          return b.importance - a.importance;
        }
        return b.weight - a.weight;
      });
    
    return sorted.slice(0, 5).map(item => item.key);
  }

  /**
   * 【v5.0 文本清洗】清洗原始文本，移除 Markdown 代码块和链接
   * 目的：防止"逻辑（Logic）"维度因代码词汇过载而失真
   * 
   * @param {string} rawText - 原始文本
   * @returns {string} 清洗后的文本
   * @private
   */
  _sanitizeText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return '';
    }
    
    let sanitized = rawText;
    
    // 1. 移除 Markdown 代码块（```...```之间的内容，包括多行代码块）
    // 匹配模式：```可选语言标识\n代码内容\n```
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
    
    // 2. 移除行内代码（`code`）
    // 匹配模式：`代码内容`，但不匹配 ``（空的反引号）
    sanitized = sanitized.replace(/`([^`\n]+)`/g, '');
    
    // 3. 移除 Markdown 链接语法 [text](url)，仅保留 text
    // 匹配模式：[链接文本](URL) 或 [链接文本](URL "标题")
    sanitized = sanitized.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    
    // 4. 清理多余空白行（连续3个或以上换行符替换为2个）
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    
    // 5. 清理行首行尾空白
    sanitized = sanitized.trim();
    
    // 6. 清理行内多余空格（连续2个或以上空格替换为1个）
    sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
    
    return sanitized;
  }

  /**
   * 【v5.0 文本清洗】清洗 chatData 数组中的所有文本
   * 
   * @param {Array} chatData - 原始聊天数据
   * @returns {Array} 清洗后的聊天数据
   * @private
   */
  _sanitizeChatData(chatData) {
    if (!chatData || !Array.isArray(chatData)) {
      return chatData || [];
    }
    
    return chatData.map(item => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      
      // 创建新对象，避免修改原对象
      const sanitizedItem = { ...item };
      
      // 清洗 text 或 content 字段
      if (sanitizedItem.text) {
        sanitizedItem.text = this._sanitizeText(sanitizedItem.text);
      }
      if (sanitizedItem.content) {
        sanitizedItem.content = this._sanitizeText(sanitizedItem.content);
      }
      
      return sanitizedItem;
    }).filter(item => {
      // 过滤掉清洗后文本为空的用户消息
      if (item.role === 'USER') {
        const text = item.text || item.content || '';
        return text.trim().length > 0;
      }
      return true; // 保留非用户消息（如 ASSISTANT）
    });
  }

  /**
   * 【v5.0 Worker Singleton】处理待处理的任务
   * 通过任务ID路由到对应的Promise resolve/reject
   */
  processPendingTasks() {
    if (this.pendingTasks.length > 0 && this.workerReady && this.worker) {
      const task = this.pendingTasks.shift();
      const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 【v5.0 Worker Singleton】将任务注册到全局任务映射
      if (this.worker._taskMap) {
        this.worker._taskMap.set(taskId, {
          resolve: task.resolve,
          reject: task.reject,
          timeoutId: task.timeoutId
        });
      }
      
      // 发送分析请求（包含任务ID）
      this.worker.postMessage({
        type: 'ANALYZE',
        taskId: taskId, // 【v5.0 新增】任务ID用于路由
        payload: task.payload,
      });
    }
  }

  /**
   * 分析用户消息，生成人格画像（v4.0 重构版）
   * 【v4.0 改进】并发锁、超时保护、hasRageWord拦截、稀疏数据处理
   * @param {Array} chatData - 聊天数据
   * @param {string} lang - 语言代码
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {number} extraStats.qingCount - 情绪词数
   * @param {number} extraStats.buCount - 逻辑词数
   * @param {number} extraStats.usageDays - 使用天数
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   */
  /**
   * 分析用户消息，生成人格画像（v5.0 全维度数据聚合中枢）
   * 【v5.0 架构升级】环境上下文注入、数据封装、输出对齐
   * 
   * @param {Array} chatData - 聊天数据
   * @param {Object} context - 环境上下文信息（必需）
   * @param {string} context.ip - IP 地址
   * @param {string} context.lang - 语言代码（如 'zh-CN', 'en-US'）
   * @param {string} context.timezone - 时区（如 'Asia/Shanghai', 'America/New_York'）
   * @param {string} context.fingerprint - 浏览器指纹（可选）
   * @param {boolean} context.isVpn - 是否使用 VPN
   * @param {boolean} context.isProxy - 是否使用代理
   * @param {Object} extraStats - 额外的统计数据（可选，已废弃，保留兼容性）
   * @param {Function} onProgress - 进度回调函数（可选）
   * @returns {Promise<Object>} 符合 /api/v2/analyze 标准的大 JSON
   * @returns {Object} fingerprint - 语义指纹
   * @returns {Object} dimensions - 维度分数
   * @returns {Object} stats - 行为特征统计
   * @returns {Object} meta - 环境信息元数据
   */
  async analyze(chatData, context, extraStats = null, onProgress = null) {
    // 【v5.0 异常兜底】参数验证与默认值
    if (!chatData || !Array.isArray(chatData) || chatData.length === 0) {
      console.warn('[VibeAnalyzer] chatData 为空或无效，返回默认结果');
      return this.getDefaultResultWithContext(context);
    }
    
    // 【v5.0 异常兜底】context 参数验证与默认值
    if (!context || typeof context !== 'object') {
      console.warn('[VibeAnalyzer] context 参数无效，使用默认值');
      context = {
        ip: '0.0.0.0',
        lang: this.lang || 'zh-CN',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        fingerprint: null,
        isVpn: false,
        isProxy: false
      };
    }
    
    // 【v5.0 异常兜底】确保所有必需字段都有默认值
    const safeContext = {
      ip: context.ip || '0.0.0.0',
      lang: context.lang || this.lang || 'zh-CN',
      timezone: context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      fingerprint: context.fingerprint || null,
      isVpn: Boolean(context.isVpn || context.isVPN || false),
      isProxy: Boolean(context.isProxy || false)
    };
    
    // 【v5.0 并发锁】防止快速点击导致任务竞争
    if (this.analysisLock) {
      console.warn('[VibeAnalyzer] 分析任务正在进行中，请稍候...');
      throw new Error('Analysis already in progress. Please wait for the current task to complete.');
    }
    
    this.analysisLock = true;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // 更新语言
      this.lang = safeContext.lang;
      
      // 【v5.0 文本清洗】在发送到 Worker 之前清洗 chatData
      // 移除 Markdown 代码块、行内代码、链接语法，防止 Logic 维度失真
      const sanitizedChatData = this._sanitizeChatData(chatData);
      
      // 保存原始数据（用于后续上传）
      this.chatData = chatData;
      
      // 使用清洗后的数据进行分析
      this.userMessages = sanitizedChatData.filter(item => item.role === 'USER');
      
      if (this.userMessages.length === 0) {
        console.warn('[VibeAnalyzer] 文本清洗后，用户消息为空，返回默认结果');
        return this.getDefaultResultWithContext(safeContext);
      }

      // 【v5.0 超时保护】设置5秒超时
      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Analysis timeout after ${this.analysisTimeout}ms`));
        }, this.analysisTimeout);
        this.activeTimeouts.set(taskId, timeoutId);
      });

      // 【v5.0 Worker Singleton】通过全局 Worker 实例调用分析
      // 使用清洗后的 chatData，确保代码内容不影响语义分析
      const analysisPromise = this.analyzeFromWorker(sanitizedChatData, safeContext);
      
      let workerResult;
      try {
        workerResult = await Promise.race([analysisPromise, timeoutPromise]);
      } catch (error) {
        const timeoutId = this.activeTimeouts.get(taskId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.activeTimeouts.delete(taskId);
        }
        
        if (error.message.includes('timeout')) {
          console.warn('[VibeAnalyzer] 分析超时，降级到本地简单匹配');
          // 降级方案也使用清洗后的数据
          return await this.analyzeSync(sanitizedChatData, safeContext.lang, extraStats, onProgress);
        }
        throw error;
      }
      
      // 【v5.0 数据封装】整合 Worker 返回的 stats 统计数据与环境元数据
      const workerStats = workerResult.stats || workerResult.statistics || {};
      
      // 【v5.0 异常兜底】确保所有 stats 字段都有默认值 0
      const safeStats = {
        totalChars: Number(workerStats.totalChars) || 0,
        totalMessages: Number(workerStats.totalMessages) || 0,
        ketao_count: Number(workerStats.ketao_count) || 0,
        jiafang_count: Number(workerStats.jiafang_count) || 0,
        tech_stack: workerStats.tech_stack && typeof workerStats.tech_stack === 'object' 
          ? workerStats.tech_stack 
          : {},
        work_days: Number(workerStats.work_days) || 0,
        avg_payload: Number(workerStats.avg_payload) || 0
      };
      
      // 【v5.0 异常兜底】确保所有 dimensions 字段都有默认值 0
      const safeDimensions = {};
      const dimensionKeys = this.dimensionKeys || Object.keys(workerResult.dimensions || {});
      dimensionKeys.forEach(key => {
        const value = workerResult.dimensions?.[key];
        safeDimensions[key] = Number(value) || 0;
      });
      
      // 【v5.0 输出对齐】生成符合 /api/v2/analyze 标准的大 JSON
      const semanticFingerprint = this.generateSemanticFingerprint(safeDimensions);
      
      const result = {
        // fingerprint: 语义指纹
        fingerprint: {
          codeRatio: semanticFingerprint.codeRatio || '0%',
          patienceLevel: semanticFingerprint.patienceLevel || 'Low Patience',
          detailLevel: semanticFingerprint.detailLevel || 'Low Detail',
          techExploration: semanticFingerprint.techExploration || 'Low Explore',
          feedbackDensity: semanticFingerprint.feedbackDensity || '0%',
          compositeScore: Number(semanticFingerprint.compositeScore) || 0,
          techDiversity: semanticFingerprint.techDiversity || 'Low',
          interactionStyle: semanticFingerprint.interactionStyle || 'Balanced',
          balanceIndex: semanticFingerprint.balanceIndex || 'Slightly Imbalanced'
        },
        
        // dimensions: 维度分数（异常兜底，默认值 0）
        dimensions: safeDimensions,
        
        // stats: 行为特征统计（异常兜底，默认值 0）
        stats: safeStats,
        
        // meta: 环境信息元数据
        meta: {
          ip: safeContext.ip,
          lang: safeContext.lang,
          timezone: safeContext.timezone,
          fingerprint: safeContext.fingerprint,
          isVpn: safeContext.isVpn,
          isProxy: safeContext.isProxy,
          timestamp: new Date().toISOString(),
          countryCode: this.countryCode || null,
          hasRageWord: Boolean(workerResult.metadata?.hasRageWord || workerResult.hasRageWord || false),
          personalityType: workerResult.personalityType || 'UNKNOWN',
          vibeIndex: workerResult.vibeIndex || '00000',
          lpdef: workerResult.lpdef || 'L0P0D0E0F0'
        }
      };
      
      // 【关键修复】生成完整的 analysis 对象
      const analysis = this.generateAnalysis(safeDimensions, result.meta.personalityType);
      
      // 【关键修复】构建完整的返回结果（包含所有字段）
      const fullResult = {
        ...result,
        // 【关键字段】人格名称和吐槽文案 - 预览页面需要
        personalityName: workerResult.personalityName || 'Unknown',
        roastText: workerResult.roastText || '',
        personalityType: result.meta.personalityType,
        vibeIndex: result.meta.vibeIndex,
        lpdef: result.meta.lpdef,
        // 【关键字段】人格分析详情 - 完整报告需要
        analysis: analysis,
        // 【关键字段】语义指纹对象 - 完整报告需要
        semanticFingerprint: semanticFingerprint,
        // 统计数据
        statistics: safeStats
      };
      
      // 保存分析结果（兼容旧版本）
      this.analysisResult = fullResult;

      // 【新增】提取 MERIT 和 SLANG 关键词并异步上报
      try {
        // 非阻塞：把 CPU 开销（提词/合并）与网络请求延后到 idle/下一轮事件循环
        const schedule = (fn) => {
          try {
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
              window.requestIdleCallback(() => {
                try { fn(); } catch (e) { /* silent */ }
              }, { timeout: 1200 });
              return;
            }
          } catch (e) { /* silent */ }
          try {
            setTimeout(() => {
              try { fn(); } catch (e2) { /* silent */ }
            }, 0);
          } catch (e3) { /* silent */ }
        };

        schedule(() => {
          try {
            const region = String(this.countryCode || safeContext?.countryCode || 'Global').trim();
            
            // 【核心逻辑】从“用户消息”提取高频词组（国家级词云候选）+ 代码片段命中词（补充功德/黑话）
            const userText = (Array.isArray(sanitizedChatData) ? sanitizedChatData : [])
              .filter((m) => {
                const role = String(m?.role || '').toUpperCase();
                // 只吃用户消息，避免把助手/模板文案混进国别词云
                return role === 'USER' || role === 'HUMAN' || role === 'U' || role === '';
              })
              .map((m) => String(m?.text || m?.content || '').trim())
              .filter(t => t.length > 0)
              .join(' ');

            if (!userText || userText.length === 0) return;

            const keywords = extractCountryWordcloudItemsFromText(userText, { maxItems: 12 });

            // 补充：代码片段中的功德/黑话（避免“只在代码块里出现”的词漏掉）
            const codeHits = this.#detectWordsFromCode(sanitizedChatData);

            // 合并（同 phrase+category 累加权重），并限制总量
            const merged = new Map();
            const push = (it) => {
              const phrase = String(it?.phrase || '').trim();
              if (!phrase || phrase.length < 2 || phrase.length > 24) return;
              const category = String(it?.category || 'slang').trim() || 'slang';
              const weight = Math.max(1, Math.min(10, Number(it?.weight) || 1));
              const key = `${category}:${phrase}`;
              merged.set(key, {
                phrase,
                category,
                weight: Math.max(1, Math.min(50, (merged.get(key)?.weight || 0) + weight)),
              });
            };
            (Array.isArray(keywords) ? keywords : []).forEach(push);
            (Array.isArray(codeHits) ? codeHits : []).forEach(push);
            const finalList = Array.from(merged.values())
              .sort((a, b) => (b.weight - a.weight) || (a.phrase > b.phrase ? 1 : -1))
              .slice(0, 15);

            // 通过 /api/v2/report-vibe 上报（使用 navigator.sendBeacon 或异步 fetch）
            if (finalList.length > 0) {
              this.#reportToCloud(finalList, safeContext, fullResult?.meta, region);
            }
          } catch (e) {
            // 静默失败，避免影响主流程
            console.warn('[VibeAnalyzer] 关键词提取失败:', e?.message || String(e));
          }
        });
      } catch (e) {
        // 静默失败
      }

      return fullResult;
    } catch (error) {
      console.error('[VibeAnalyzer] Worker 分析失败，使用降级方案:', error);
      // 降级方案：使用同步方法（保留作为后备）
      // 注意：这里使用原始 chatData，因为 analyzeSync 可能需要完整数据
      // 但 analyzeSync 内部也会进行文本清洗（如果需要）
      return await this.analyzeSync(chatData, this.lang, extraStats, onProgress);
    } finally {
      // 【v4.0 并发锁】释放锁
      this.analysisLock = false;
      
      // 清理超时定时器
      const timeoutId = this.activeTimeouts.get(taskId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeTimeouts.delete(taskId);
      }
    }
  }

  /**
   * 【v5.0 升级】从 Worker 获取分析结果（Worker Singleton 模式）
   * 【v5.0 改进】环境上下文注入、V6 Stats对接、异常兜底
   * @param {Array} chatData - 聊天数据
   * @param {Object} context - 环境上下文信息（必需）
   * @returns {Promise<Object>} Worker 返回的分析结果
   */
  async analyzeFromWorker(chatData, context) {
    // 获取 API 端点
    const getApiEndpoint = () => {
      if (typeof window !== 'undefined') {
        const envApiUrl = window.__API_ENDPOINT__ || window.API_ENDPOINT;
        if (envApiUrl) {
          return envApiUrl;
        }
        const metaApi = document.querySelector('meta[name="api-endpoint"]');
        if (metaApi && metaApi.content) {
          const apiUrl = metaApi.content.trim();
          return apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
        }
      }
      return 'https://cursor-clinical-analysis.psterman.workers.dev/';
    };

    const apiEndpoint = getApiEndpoint();
    const analyzeUrl = apiEndpoint.endsWith('/') 
      ? `${apiEndpoint}api/v2/analyze` 
      : `${apiEndpoint}/api/v2/analyze`;

    // 【v5.0 环境上下文注入】构建请求体，包含完整环境信息
    const requestBody = { 
      chatData, 
      lang: context.lang,
      countryCode: this.countryCode || null,
      context: {
        ip: context.ip || '0.0.0.0',
        lang: context.lang || 'zh-CN',
        timezone: context.timezone || 'UTC',
        fingerprint: context.fingerprint || null,
        vpn: context.isVpn || false, // 【V6 统一化】使用 vpn 字段名
        proxy: context.isProxy || false // 【V6 统一化】使用 proxy 字段名
      },
      // 【V6 环境与网络安全】meta 字段完整包含所有环境信息
      meta: {
        ip: context.ip || '0.0.0.0',
        lang: context.lang || 'zh-CN',
        timezone: context.timezone || 'UTC',
        fingerprint: context.fingerprint || null,
        vpn: context.isVpn || false,
        proxy: context.isProxy || false,
        timestamp: new Date().toISOString()
      }
    };

    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.status === 'success') {
      // 【v4.0 V6 Stats对接】确保stats对象完整解析
      const stats = result.stats || {};
      
      // 解析tech_stack（如果存在）
      let techStack = {};
      if (stats.tech_stack) {
        if (typeof stats.tech_stack === 'string') {
          try {
            techStack = JSON.parse(stats.tech_stack);
          } catch (e) {
            console.warn('[VibeAnalyzer] tech_stack解析失败:', e);
            techStack = {};
          }
        } else if (typeof stats.tech_stack === 'object') {
          techStack = stats.tech_stack;
        }
      }
      
      // 构建完整的stats对象
      const fullStats = {
        totalChars: stats.totalChars || 0,
        totalMessages: stats.totalMessages || 0,
        ketao_count: stats.ketao_count || 0,
        jiafang_count: stats.jiafang_count || 0,
        tech_stack: techStack, // 格式：{"React": 5, "Rust": 2}
        work_days: stats.work_days || 1,
        avg_payload: stats.avg_payload || 0,
        ...stats // 保留其他字段
      };
      
      // 【v4.0 hasRageWord检测】从metadata或stats中提取
      const hasRageWord = result.metadata?.hasRageWord || stats.hasRageWord || false;
      
      return {
        ...result,
        stats: fullStats,
        hasRageWord, // 【v4.0 新增】明确标记hasRageWord
        metadata: {
          ...(result.metadata || {}),
          hasRageWord, // 确保metadata中也包含
          stats: fullStats // 将完整stats也放入metadata
        }
      };
    } else {
      throw new Error(result.error || 'Worker 返回错误');
    }
  }

  /**
   * 同步分析（降级方案）
   * @param {Array} chatData - 聊天数据
   * @param {string} lang - 语言代码
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   */
  async analyzeSync(chatData, lang, extraStats = null, onProgress = null) {
    if (lang) this.lang = lang;
    const currentLang = this.lang;

    // 【v5.0 文本清洗】降级方案也进行文本清洗
    const sanitizedChatData = this._sanitizeChatData(chatData);
    
    // 提取用户消息（使用清洗后的数据）
    this.userMessages = sanitizedChatData.filter(item => item.role === 'USER');
    
    if (this.userMessages.length === 0) {
      return this.getDefaultResult(currentLang);
    }

    // 使用原有的同步方法计算维度（基于清洗后的数据）
    const dimensions = this.calculateDimensions();
    
    // 生成索引和吐槽文案
    const vibeIndex = getVibeIndex(dimensions);
    const roastText = getRoastText(vibeIndex, currentLang);
    
    // 确定人格类型
    const personalityType = this.determinePersonalityType(dimensions);
    const personalityName = getPersonalityName(vibeIndex, currentLang, personalityType);
    
    // 生成详细分析
    const analysis = this.generateAnalysis(dimensions, personalityType);
    
    // 生成 LPDEF 编码
    const lpdef = this.generateLPDEF(dimensions);
    
    // 计算统计信息（仅本地计算，不上传排名）
    const statistics = this.calculateStatistics();
    
    // 不再在 analyzeSync 内部自动上传排名，由外部调用 uploadToSupabase 统一处理
    // 排名数据将在外部通过 uploadToSupabase 获取后注入到 statistics 中
    
    return {
      personalityType,
      dimensions,
      analysis,
      statistics,
      semanticFingerprint: this.generateSemanticFingerprint(dimensions),
      vibeIndex,
      roastText,
      personalityName,
      lpdef,
      globalAverage: this.globalAverage || null,
      metadata: this.analysisMetadata || null,
      rankData: null, // 排名数据将在外部获取后注入
    };
  }

  /**
   * 异步计算维度得分（使用 Web Worker）
   */
  calculateDimensionsAsync(chatData) {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.workerReady) {
        // Worker 未就绪，使用同步方法
        resolve(this.calculateDimensions());
        return;
      }

      // 添加到待处理队列
      this.pendingTasks.push({
        payload: {
          chatData,
          weights: { L1: 15, L2: 5, L3: 1 },
          config: {
            BASE_SCORE: 40,
            SENSITIVITY: 200,
          },
        },
        resolve: (result) => {
          // 将归一化得分转换为维度对象
          const dimensions = {
            L: result.dimensions.L || 0,
            P: result.dimensions.P || 0,
            D: result.dimensions.D || 0,
            E: result.dimensions.E || 0,
            F: result.dimensions.F || 0,
          };
          
          // 保存全局平均基准和元数据
          this.globalAverage = result.globalAverage;
          this.analysisMetadata = result.metadata;
          
          resolve(dimensions);
        },
        reject,
      });

      // 如果 Worker 已就绪，立即处理
      if (this.workerReady) {
        this.processPendingTasks();
      }
    });
  }

  /**
   * 生成 LPDEF 编码
   * @param {Object} dimensions - 维度得分
   * @returns {string} LPDEF 编码，如 "L2P1D2E1F2"
   */
  generateLPDEF(dimensions) {
    const encode = (value, thresholds = [40, 70]) => {
      if (value >= thresholds[1]) return '2'; // 高
      if (value >= thresholds[0]) return '1'; // 中
      return '0'; // 低
    };

    // E 维度使用不同的阈值
    const eEncode = (value) => {
      if (value >= 10) return '2';
      if (value >= 5) return '1';
      return '0';
    };

    return `L${encode(dimensions.L)}P${encode(dimensions.P)}D${encode(dimensions.D)}E${eEncode(dimensions.E)}F${encode(dimensions.F)}`;
  }

  /**
   * 计算五个维度得分
   */
  calculateDimensions() {
    const dimensions = {
      L: 0, // Logic 逻辑力
      P: 0, // Patience 耐心值
      D: 0, // Detail 细腻度
      E: 0, // Explore 探索欲
      F: 0, // Feedback 反馈感
    };

    let totalChars = 0;
    let codeChars = 0;
    let totalSentences = 0;
    let totalSentenceLength = 0;
    const techTermsSet = new Set();
    let negationCount = 0;
    let modifierCount = 0;
    let politeCount = 0;
    let totalWords = 0;

    this.userMessages.forEach(msg => {
      const text = msg.text || '';
      if (!text || text.length < 5) return;

      totalChars += text.length;
      totalWords += this.countWords(text);

      // L (Logic) 逻辑力: 代码块比例
      const codeRatio = this.calculateCodeRatio(text);
      codeChars += text.length * codeRatio;
      dimensions.L += codeRatio * 100; // 转换为百分比

      // P (Patience) 耐心值: 否定词频次（低频率 = 高耐心）
      const negationFreq = this.countNegationWords(text);
      negationCount += negationFreq;
      dimensions.P += negationFreq;

      // D (Detail) 细腻度: 句子平均长度和修饰词
      const sentences = this.splitSentences(text);
      totalSentences += sentences.length;
      sentences.forEach(sentence => {
        totalSentenceLength += sentence.length;
        modifierCount += this.countModifierWords(sentence);
      });

      // E (Explore) 探索欲: 技术名词去重统计
      const techTerms = this.extractTechTerms(text);
      techTerms.forEach(term => techTermsSet.add(term.toLowerCase()));

      // F (Feedback) 反馈感: 礼貌用语密度
      politeCount += this.countPoliteWords(text);
    });

    // 标准化维度得分
    const avgCodeRatio = codeChars / totalChars || 0;
    dimensions.L = Math.round(avgCodeRatio * 100);

    // P: 否定词频率（越低越好，表示高耐心）
    const avgNegationFreq = negationCount / this.userMessages.length || 0;
    dimensions.P = Math.max(0, 100 - Math.round(avgNegationFreq * 20)); // 转换为耐心值（高=耐心）

    // D: 细腻度 = 平均句子长度 + 修饰词密度
    const avgSentenceLength = totalSentenceLength / totalSentences || 0;
    const modifierDensity = (modifierCount / totalWords) * 100 || 0;
    dimensions.D = Math.round((avgSentenceLength / 10) + modifierDensity);

    // E: 探索欲 = 技术名词去重数量
    dimensions.E = techTermsSet.size;

    // F: 反馈感 = 礼貌用语密度
    const politeDensity = (politeCount / totalWords) * 100 || 0;
    dimensions.F = Math.round(politeDensity * 10);

    // 限制范围在 0-100
    Object.keys(dimensions).forEach(key => {
      dimensions[key] = Math.max(0, Math.min(100, dimensions[key]));
    });

    return dimensions;
  }

  /**
   * 计算代码比例
   */
  calculateCodeRatio(text) {
    let codeChars = 0;
    let totalChars = text.length;

    // 检查代码块标记
    const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
    codeBlocks.forEach(block => {
      codeChars += block.length;
    });

    // 检查行内代码
    const inlineCode = text.match(/`[^`]+`/g) || [];
    inlineCode.forEach(code => {
      codeChars += code.length;
    });

    // 检查代码关键字密度
    let codeKeywordCount = 0;
    CODE_PATTERNS.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        codeKeywordCount += matches.length;
      }
    });

    // 代码比例 = 代码块比例 + 关键字密度
    const codeBlockRatio = codeChars / totalChars;
    const keywordDensity = Math.min(codeKeywordCount / 10, 0.5); // 最多贡献 50%

    return Math.min(codeBlockRatio + keywordDensity, 1);
  }

  /**
   * 统计否定词
   */
  countNegationWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    NEGATION_WORDS.chinese.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });

    NEGATION_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });

    return count;
  }

  /**
   * 分割句子
   */
  splitSentences(text) {
    // 中英文句子分割
    return text
      .split(/[。！？.!?\n]+/)
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());
  }

  /**
   * 统计修饰词
   */
  countModifierWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    MODIFIER_WORDS.chinese.forEach(word => {
      if (text.includes(word)) count++;
    });

    MODIFIER_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(lowerText)) count++;
    });

    return count;
  }

  /**
   * 提取技术名词
   */
  extractTechTerms(text) {
    const terms = new Set();
    const lowerText = text.toLowerCase();

    // 遍历所有 TECH_PATTERNS 的属性
    Object.keys(TECH_PATTERNS).forEach(category => {
      const patterns = TECH_PATTERNS[category];
      if (Array.isArray(patterns)) {
        patterns.forEach(pattern => {
          const matches = lowerText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const trimmed = match.trim();
              if (trimmed) {
                terms.add(trimmed);
              }
            });
          }
        });
      }
    });

    return Array.from(terms);
  }

  /**
   * 统计礼貌用语
   */
  countPoliteWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    POLITE_WORDS.chinese.forEach(word => {
      if (text.includes(word)) count++;
    });

    POLITE_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(lowerText)) count++;
    });

    return count;
  }

  /**
   * 统计单词数
   */
  countWords(text) {
    // 中英文单词统计
    const chineseWords = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
    return chineseWords.length + englishWords.length;
  }

  /**
   * 确定人格类型
   */
  determinePersonalityType(dimensions) {
    // 阈值定义：60 以上为高，40-60 为中，40 以下为低
    const threshold = 60;
    const midThreshold = 40;

    // 判断各维度水平
    const L_high = dimensions.L >= threshold;
    const L_mid = dimensions.L >= midThreshold && dimensions.L < threshold;
    const P_high = dimensions.P >= threshold;
    const P_mid = dimensions.P >= midThreshold && dimensions.P < threshold;
    const D_high = dimensions.D >= threshold;
    const D_mid = dimensions.D >= midThreshold && dimensions.D < threshold;
    // 调整 E 维度阈值：由于词库扩大到 800+，高分门槛提高到 30+
    const E_high = dimensions.E >= 30;
    const E_mid = dimensions.E >= 12 && dimensions.E < 30;
    const F_high = dimensions.F >= threshold;

    // 构建类型代码（格式：L-P-DEF 或 L-P-DEF-）
    const parts = [];
    
    // L 维度
    if (L_high) parts.push('L');
    else if (L_mid) parts.push('L-');
    else parts.push('-');
    
    // P 维度
    if (P_high) parts.push('P');
    else if (P_mid) parts.push('P-');
    else parts.push('-');
    
    // D 维度
    if (D_high) parts.push('D');
    else if (D_mid) parts.push('D-');
    else parts.push('-');
    
    // E 维度
    if (E_high) parts.push('E');
    else if (E_mid) parts.push('E-');
    else parts.push('-');
    
    // F 维度作为后缀
    const typeCode = parts.join('') + (F_high ? 'F' : '-');

    // 查找匹配的人格类型
    if (VIBE_CODINGER_TYPES[typeCode]) {
      return typeCode;
    }

    // 如果没有精确匹配，查找最接近的类型
    return this.findClosestType(dimensions);
  }

  /**
   * 查找最接近的人格类型
   */
  findClosestType(dimensions) {
    let minDistance = Infinity;
    let closestType = 'L-P-DEF-';

    Object.keys(VIBE_CODINGER_TYPES).forEach(typeCode => {
      // 简化匹配：只匹配主要特征
      const distance = this.calculateTypeDistance(dimensions, typeCode);
      if (distance < minDistance) {
        minDistance = distance;
        closestType = typeCode;
      }
    });

    return closestType;
  }

  /**
   * 计算类型距离
   */
  calculateTypeDistance(dimensions, typeCode) {
    // 简化的距离计算
    let distance = 0;
    const threshold = 60;

    if (typeCode.includes('L') && dimensions.L < threshold) distance += 20;
    if (typeCode.includes('P') && dimensions.P < threshold) distance += 20;
    if (typeCode.includes('D') && dimensions.D < threshold) distance += 20;
    if (typeCode.includes('E') && dimensions.E < 10) distance += 20;
    if (!typeCode.endsWith('-') && dimensions.F < threshold) distance += 10;

    return distance;
  }

  /**
   * 生成详细分析
   */
  generateAnalysis(dimensions, personalityType) {
    const lang = this.lang || 'zh-CN';
    const vibeTypes = getVibeCodingerTypes(lang);
    const typeInfo = vibeTypes[personalityType] || vibeTypes['L-P-DEF-'];
    const currentLang = this.lang;

    return {
      type: personalityType,
      name: typeInfo.name,
      description: typeInfo.description,
      traits: typeInfo.traits,
      color: typeInfo.color,
      dimensions: {
        L: {
          value: dimensions.L,
          level: this.getDimensionLevel(dimensions.L, 'L', currentLang),
          interpretation: this.getLInterpretation(dimensions.L, currentLang),
        },
        P: {
          value: dimensions.P,
          level: this.getDimensionLevel(dimensions.P, 'P', currentLang),
          interpretation: this.getPInterpretation(dimensions.P, currentLang),
        },
        D: {
          value: dimensions.D,
          level: this.getDimensionLevel(dimensions.D, 'D', currentLang),
          interpretation: this.getDInterpretation(dimensions.D, currentLang),
        },
        E: {
          value: dimensions.E,
          level: this.getDimensionLevel(dimensions.E, 'E', currentLang),
          interpretation: this.getEInterpretation(dimensions.E, currentLang),
        },
        F: {
          value: dimensions.F,
          level: this.getDimensionLevel(dimensions.F, 'F', currentLang),
          interpretation: this.getFInterpretation(dimensions.F, currentLang),
        },
      },
    };
  }

  /**
   * 获取维度等级
   */
  getDimensionLevel(value, dimension, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    const dimTexts = texts[dimension];

    if (dimension === 'E') {
      if (value >= 10) return dimTexts.high;
      if (value >= 5) return dimTexts.mid;
      return dimTexts.low;
    } else {
      if (value >= 70) return dimTexts.high;
      if (value >= 40) return dimTexts.mid;
      return dimTexts.low;
    }
  }

  /**
   * L 维度解释
   */
  getLInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.L.low;
    if (value < 70) return texts.L.mid;
    return texts.L.high;
  }

  /**
   * P 维度解释
   */
  getPInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.P.low;
    if (value < 70) return texts.P.mid;
    return texts.P.high;
  }

  /**
   * D 维度解释
   */
  getDInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.D.low;
    if (value < 70) return texts.D.mid;
    return texts.D.high;
  }

  /**
   * E 维度解释
   */
  getEInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 5) return texts.E.low;
    if (value < 10) return texts.E.mid;
    return texts.E.high;
  }

  /**
   * F 维度解释
   */
  getFInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.F.low;
    if (value < 70) return texts.F.mid;
    return texts.F.high;
  }

  /**
   * 生成语义指纹（增强版）
   */
  generateSemanticFingerprint(dimensions) {
    const lang = this.lang || 'zh-CN';
    const isEn = lang === 'en';
    
    // 计算综合得分
    const compositeScore = (
      dimensions.L * 0.25 +
      dimensions.P * 0.20 +
      dimensions.D * 0.20 +
      (dimensions.E * 10) * 0.15 + // E 维度需要放大
      dimensions.F * 0.20
    );

    // 计算平衡度
    const values = [dimensions.L, dimensions.P, dimensions.D, dimensions.F, dimensions.E * 10];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const balanceScore = Math.max(0, 100 - stdDev);

    const getBalanceText = (score) => {
      if (score >= 80) return isEn ? 'Highly Balanced' : '高度平衡';
      if (score >= 60) return isEn ? 'Well Balanced' : '较为平衡';
      if (score >= 40) return isEn ? 'Slightly Imbalanced' : '略有偏重';
      return isEn ? 'Severely Imbalanced' : '明显偏重';
    };

    const getLevelLabel = (val, dim) => {
        // E 维度阈值调整 (适应 800+ 词库规模)
        // High: 30+ (资深/架构级)
        // Med: 12-29 (中高级/全栈)
        // Low: 0-11 (初级/专注单一领域)
        const threshold = dim === 'E' ? 12 : 40;
        const highThreshold = dim === 'E' ? 30 : 70;
        if (val >= highThreshold) return isEn ? 'High' : '高';
        if (val >= threshold) return isEn ? 'Med' : '中';
        return isEn ? 'Low' : '低';
    };

    return {
      codeRatio: `${Math.round(dimensions.L)}%`,
      patienceLevel: getLevelLabel(dimensions.P, 'P') + (isEn ? ' Patience' : '耐心'),
      detailLevel: getLevelLabel(dimensions.D, 'D') + (isEn ? ' Detail' : '细腻'),
      techExploration: getLevelLabel(dimensions.E, 'E') + (isEn ? ' Explore' : '探索'),
      feedbackDensity: `${Math.round(dimensions.F)}%`,
      compositeScore: Math.round(compositeScore),
      techDiversity: dimensions.E >= 30 ? (isEn ? 'Extreme' : '极高') : (dimensions.E >= 12 ? (isEn ? 'Moderate' : '中等') : (isEn ? 'Low' : '较低')),
      interactionStyle: this.calculateInteractionStyle(dimensions, lang),
      balanceIndex: getBalanceText(balanceScore),
    };
  }

  /**
   * 计算交互风格
   */
  calculateInteractionStyle(dimensions, lang) {
    const isEn = lang === 'en';
    const styles = [];
    
    if (dimensions.L >= 70) styles.push(isEn ? 'Code Driven' : '代码驱动');
    if (dimensions.P >= 70) styles.push(isEn ? 'Gentle' : '温和引导');
    if (dimensions.D >= 70) styles.push(isEn ? 'Detail Oriented' : '细节控');
    // E 维度阈值同步调整
    if (dimensions.E >= 30) styles.push(isEn ? 'Tech Explore' : '技术探索');
    if (dimensions.F >= 70) styles.push(isEn ? 'Responsive' : '积极反馈');
    
    if (styles.length === 0) {
      return isEn ? 'Balanced' : '均衡型';
    }
    
    return styles.join(' · ');
  }

  /**
   * 计算交互风格
   */
  calculateInteractionStyle(dimensions, lang) {
    const isEn = lang === 'en';
    const styles = [];
    
    if (dimensions.L >= 70) styles.push(isEn ? 'Code Driven' : '代码驱动');
    if (dimensions.P >= 70) styles.push(isEn ? 'Gentle' : '温和引导');
    if (dimensions.D >= 70) styles.push(isEn ? 'Detail Oriented' : '细节控');
    if (dimensions.E >= 10) styles.push(isEn ? 'Tech Explore' : '技术探索');
    if (dimensions.F >= 70) styles.push(isEn ? 'Responsive' : '积极反馈');
    
    if (styles.length === 0) {
      return isEn ? 'Balanced' : '均衡型';
    }
    
    return styles.join(' · ');
  }

  /**
   * 计算统计数据
   */
  calculateStatistics() {
    const totalMessages = this.userMessages.length;
    const totalChars = this.userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
    const avgLength = totalChars / totalMessages || 0;

    return {
      totalMessages,
      avgMessageLength: Math.round(avgLength),
      totalChars,
    };
  }

  /**
   * 上传统计数据到 Supabase 并获取排名
   * @param {Object} vibeResult - 完整的分析结果对象，包含 statistics、dimensions、personality 和 vibeIndex
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   * @returns {Promise<Object>} 返回包含 rankPercent 和 totalUsers 的对象
   */
  /**
   * 上传统计数据到 Supabase 并获取排名
   * 【V2 接口重构】发送原始聊天数据到 /api/v2/analyze，后端计算维度得分并返回完整结果
   * 关键改进：
   * 1. 不再发送本地计算的 dimensions、vibeIndex 等数据
   * 2. 严格遵循 { chatData: [...], lang: 'zh-CN' } 格式
   * 3. 使用后端返回的精准数据更新实例状态和 UI
   * 
   * @param {Object} vibeResult - 完整的分析结果对象（可选，用于兼容性，但不再使用其中的计算结果）
   * @param {Array} chatData - 原始聊天数据数组（可选，如果未提供则使用 this.chatData）
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Object>} 返回包含 rankPercent、totalUsers、dimensions、roastText、personalityName 的对象
   */
  async uploadToSupabase(vibeResult = null, chatData = null, onProgress = null) {
    let analyzeUrl = ''; // 在外部定义，以便在 catch 块中使用
    try {
      // 1. 显示加载提示
      if (onProgress) {
        const currentLang = this.lang;
        onProgress(currentLang === 'en' 
          ? 'Connecting to database, syncing global ranking...' 
          : '正在连接数据库，同步全球排名...');
      }

      // 2. 获取原始聊天数据（多重降级方案）
      // 优先级：1) 传入的 chatData 参数 2) this.chatData 3) window.allChatData 4) 从 userMessages 构建
      let rawChatData = null;
      
      // 优先级1: 传入的 chatData 参数
      if (chatData && Array.isArray(chatData) && chatData.length > 0) {
        rawChatData = chatData;
        console.log('[VibeAnalyzer] ✅ 使用传入的 chatData 参数:', chatData.length, '条消息');
      }
      // 优先级2: 实例变量 this.chatData
      else if (this.chatData && Array.isArray(this.chatData) && this.chatData.length > 0) {
        rawChatData = this.chatData;
        console.log('[VibeAnalyzer] ✅ 使用实例变量 this.chatData:', this.chatData.length, '条消息');
      }
      // 优先级3: 全局变量 window.allChatData
      else if (typeof window !== 'undefined' && window.allChatData && Array.isArray(window.allChatData) && window.allChatData.length > 0) {
        rawChatData = window.allChatData;
        console.log('[VibeAnalyzer] ✅ 使用全局变量 window.allChatData:', window.allChatData.length, '条消息');
      }
      // 优先级4: 从 userMessages 构建基本结构
      else if (this.userMessages && Array.isArray(this.userMessages) && this.userMessages.length > 0) {
        console.warn('[VibeAnalyzer] ⚠️ 未找到原始聊天数据，尝试从 userMessages 构建');
        rawChatData = this.userMessages.map(msg => ({
          role: 'USER',
          text: msg.text || msg.content || ''
        }));
        console.log('[VibeAnalyzer] ✅ 从 userMessages 构建了', rawChatData.length, '条消息');
      }
      // 优先级5: 尝试从 vibeResult 中提取（如果包含原始数据）
      else if (vibeResult && vibeResult.originalChatData && Array.isArray(vibeResult.originalChatData) && vibeResult.originalChatData.length > 0) {
        rawChatData = vibeResult.originalChatData;
        console.log('[VibeAnalyzer] ✅ 从 vibeResult.originalChatData 提取:', rawChatData.length, '条消息');
      }
      // 最后降级：空数组
      else {
        rawChatData = [];
      }

      // 验证数据格式
      if (!rawChatData || !Array.isArray(rawChatData) || rawChatData.length === 0) {
        console.error('[VibeAnalyzer] ❌ 所有数据源都失败:', {
          hasChatDataParam: !!chatData,
          hasThisChatData: !!this.chatData,
          hasWindowAllChatData: typeof window !== 'undefined' && !!window.allChatData,
          hasUserMessages: !!this.userMessages,
          userMessagesLength: this.userMessages?.length || 0,
          hasVibeResult: !!vibeResult
        });
        throw new Error('无法获取原始聊天数据，请确保已调用 analyze 方法或传入 chatData 参数');
      }

      // 确保数据格式正确：每个消息包含 role 和 text 字段
      const formattedChatData = rawChatData.map(item => ({
        role: item.role || 'USER',
        text: item.text || item.content || ''
      })).filter(item => item.text && item.text.trim().length > 0);

      if (formattedChatData.length === 0) {
        throw new Error('聊天数据为空，无法进行分析');
      }

      // 3. 获取 API 端点（与 index.html 降级逻辑保持一致）
      const getApiEndpoint = () => {
        if (typeof window !== 'undefined') {
          // 优先使用 window 对象中的配置
          const envApiUrl = window.__API_ENDPOINT__ || window.API_ENDPOINT;
          if (envApiUrl) {
            return envApiUrl;
          }
          // 其次使用 meta 标签
          const metaApi = document.querySelector('meta[name="api-endpoint"]');
          if (metaApi && metaApi.content) {
            const apiUrl = metaApi.content.trim();
            return apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
          }
        }
        // 默认 API 端点
        return 'https://cursor-clinical-analysis.psterman.workers.dev/';
      };
      
      const apiEndpoint = getApiEndpoint();

      // 4. 构造 V2 接口请求体：严格遵循 { chatData: [...], lang: 'zh-CN', stats: {...} } 格式
      // 【v4.0 重构】不再发送 dimensions、vibeIndex 等本地计算结果
      // 【v4.0 全球化】传递国家代码以获取国家平均值
      // 【V6 适配】包含 stats 字段（40维度数据）
      
      // 从 vibeResult 中提取 stats 对象（如果存在）
      let statsToUpload = null;
      if (vibeResult) {
        // 优先使用 vibeResult.stats（V6 标准格式）
        if (vibeResult.stats) {
          statsToUpload = vibeResult.stats;
        } 
        // 降级：从 vibeResult.statistics 中构建
        else if (vibeResult.statistics) {
          // 解析 tech_stack（如果存在）
          let techStack = {};
          if (vibeResult.statistics.tech_stack) {
            if (typeof vibeResult.statistics.tech_stack === 'string') {
              try {
                techStack = JSON.parse(vibeResult.statistics.tech_stack);
              } catch (e) {
                console.warn('[VibeAnalyzer] tech_stack解析失败:', e);
                techStack = {};
              }
            } else if (typeof vibeResult.statistics.tech_stack === 'object') {
              techStack = vibeResult.statistics.tech_stack;
            }
          }
          
          statsToUpload = {
            totalChars: vibeResult.statistics.totalChars || vibeResult.statistics.totalUserChars || 0,
            totalMessages: vibeResult.statistics.totalMessages || vibeResult.statistics.userMessages || 0,
            ketao_count: vibeResult.statistics.ketao_count || vibeResult.statistics.qingCount || 0,
            jiafang_count: vibeResult.statistics.jiafang_count || vibeResult.statistics.buCount || 0,
            tech_stack: techStack,
            work_days: vibeResult.statistics.work_days || vibeResult.statistics.usageDays || 1,
            avg_payload: vibeResult.statistics.avg_payload || 0
          };
        }
      }
      
      // 如果仍然没有 stats，使用默认值（健壮性保障）
      if (!statsToUpload) {
        statsToUpload = {
          totalChars: 0,
          totalMessages: 0,
          ketao_count: 0,
          jiafang_count: 0,
          tech_stack: {},
          work_days: 1,
          avg_payload: 0
        };
      }
      
      // 【V6 上报协议对齐】构建完整的 Payload，包含 fingerprint, dimensions, stats, meta
      // 从 vibeResult 中提取完整数据
      const fingerprint = vibeResult?.meta?.fingerprint || vibeResult?.fingerprint || null;
      const dimensions = vibeResult?.dimensions || {};
      
      // 【V6 环境与网络安全】确保 meta 字段完整包含所有环境信息
      // 优先使用 vibeResult.meta，如果不存在则从 context 构建
      let meta = vibeResult?.meta || {};
      if (!meta.ip || meta.ip === '0.0.0.0') {
        // 如果 meta 不完整，尝试从 context 构建
        const context = vibeResult?.context || {};
        meta = {
          ip: context.ip || '0.0.0.0',
          lang: context.lang || this.lang || 'zh-CN',
          timezone: context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          fingerprint: context.fingerprint || fingerprint || null,
          vpn: context.isVpn || context.vpn || false,
          proxy: context.isProxy || context.proxy || false,
          timestamp: new Date().toISOString()
        };
      }

      const uploadData = {
        chatData: formattedChatData,
        lang: this.lang || 'zh-CN',
        countryCode: this.countryCode || null, // 【v4.0 新增】传递国家代码
        fingerprint: fingerprint, // 【V6 新增】浏览器指纹
        dimensions: dimensions, // 【V6 新增】LPDEF 分数
        stats: statsToUpload, // 【V6 适配】包含 stats 字段
        meta: meta // 【V6 新增】环境信息元数据（完整包含 ip, lang, timezone, fingerprint, vpn, proxy）
      };

      console.log('[VibeAnalyzer] 发送原始聊天数据到 /api/v2/analyze:', {
        messageCount: formattedChatData.length,
        lang: uploadData.lang,
        sampleMessage: formattedChatData[0],
        payloadFormat: '严格遵循 { chatData: [...], lang: "zh-CN", stats: {...} } 格式',
        hasStats: !!uploadData.stats,
        statsKeys: uploadData.stats ? Object.keys(uploadData.stats) : []
      });

      // 5. 发送请求到 /api/v2/analyze 端点
      analyzeUrl = apiEndpoint.endsWith('/') 
        ? `${apiEndpoint}api/v2/analyze` 
        : `${apiEndpoint}/api/v2/analyze`;
      
      const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadData)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        throw new Error(`HTTP error! status: ${response.status}, error: ${errorText}`);
      }

      const result = await response.json();
      console.log('[VibeAnalyzer] 后端返回数据:', result);
      
      // 【V6 上报协议对齐】保存后端返回的 global_stats 到本地
      if (result.global_stats) {
        try {
          localStorage.setItem('vibe_global_stats', JSON.stringify(result.global_stats));
          console.log('[VibeAnalyzer] ✅ 已保存 global_stats 到本地:', result.global_stats);
        } catch (error) {
          console.warn('[VibeAnalyzer] 保存 global_stats 失败:', error);
        }
      }
      
      // 6. 处理 V2 接口响应：使用后端返回的精准数据更新实例状态和 UI
      if (result.status === 'success') {
        // 提取后端计算的精准结果
        const backendDimensions = result.dimensions || {};
        const backendRoastText = result.roastText || '';
        const backendPersonalityName = result.personalityName || '';
        const backendVibeIndex = result.vibeIndex || '00000';
        const backendPersonalityType = result.personalityType || 'UNKNOWN';
        const backendLpdef = result.lpdef || '';
        
        // 【关键】同步状态：用后端返回的精准维度分覆盖本地粗略计算的分数
        // 更新 this.analysisResult 实例状态，确保 UI 渲染（雷达图）与后端分析一致
        if (this.analysisResult) {
          // 覆盖维度得分（使用后端精准计算的结果）
          this.analysisResult.dimensions = backendDimensions;
          // 更新吐槽文案（使用后端返回的文案）
          this.analysisResult.roastText = backendRoastText;
          // 更新人格标题（使用后端返回的标题）
          this.analysisResult.personalityName = backendPersonalityName;
          // 更新其他字段
          this.analysisResult.vibeIndex = backendVibeIndex;
          this.analysisResult.personalityType = backendPersonalityType;
          this.analysisResult.lpdef = backendLpdef;
          
          // 【v4.0 V6 Stats对接】完整解析stats对象
          if (result.stats || result.statistics) {
            const stats = result.stats || result.statistics || {};
            
            // 解析tech_stack（如果存在）
            let techStack = {};
            if (stats.tech_stack) {
              if (typeof stats.tech_stack === 'string') {
                try {
                  techStack = JSON.parse(stats.tech_stack);
                } catch (e) {
                  console.warn('[VibeAnalyzer] tech_stack解析失败:', e);
                  techStack = {};
                }
              } else if (typeof stats.tech_stack === 'object') {
                techStack = stats.tech_stack;
              }
            }
            
            // 构建完整的stats对象（V6接口标准）
            const fullStats = {
              totalChars: stats.totalChars || 0,
              totalMessages: stats.totalMessages || 0,
              ketao_count: stats.ketao_count || 0,
              jiafang_count: stats.jiafang_count || 0,
              tech_stack: techStack, // 格式：{"React": 5, "Rust": 2}
              work_days: stats.work_days || 1,
              avg_payload: stats.avg_payload || 0,
              ...stats // 保留其他字段
            };
            
            this.analysisResult.statistics = {
              ...this.analysisResult.statistics,
              ...fullStats
            };
            
            // 同时更新metadata中的stats
            if (!this.analysisResult.metadata) {
              this.analysisResult.metadata = {};
            }
            this.analysisResult.metadata.stats = fullStats;
          }
          
          // 【v4.0 全球化上下文】如果后端返回了国家平均值，更新
          if (result.countryAverage) {
            this.countryAverage = result.countryAverage;
            this.analysisResult.countryAverage = result.countryAverage;
          }
          
          // 如果后端返回了全局平均值，更新
          if (result.globalAverage) {
            this.globalAverage = result.globalAverage;
            this.analysisResult.globalAverage = result.globalAverage;
          }
          
          console.log('[VibeAnalyzer] ✅ 已同步后端精准数据到实例状态:', {
            dimensions: backendDimensions,
            roastText: backendRoastText.substring(0, 50) + '...',
            personalityName: backendPersonalityName,
            vibeIndex: backendVibeIndex
          });
        }
        
        // 提取排名信息（如果后端返回了）
        const statistics = result.statistics || {};
        const totalUsers = result.totalUsers || result.value || result.total || result.count || 0;
        const finalRank = result.rankPercent ?? result.ranking ?? 0;
        const ranks = result.ranks || null;
        const globalAverage = result.globalAverage || result.global_average || null;
        
        // 【关键修复】合并后端返回的完整数据，包括 analysis 和 semanticFingerprint
        // 更新 this.analysisResult，确保包含所有必需字段
        if (this.analysisResult) {
          // 如果后端返回了 analysis 对象，更新它
          if (result.analysis) {
            this.analysisResult.analysis = result.analysis;
          }
          
          // 如果后端返回了 semanticFingerprint 对象，更新它
          if (result.semanticFingerprint) {
            this.analysisResult.semanticFingerprint = result.semanticFingerprint;
          }
          
          // 如果后端返回了 stats 对象，更新它
          if (result.stats) {
            this.analysisResult.stats = result.stats;
          }
          
          // 如果后端返回了 fingerprint 字符串，更新它
          if (result.fingerprint) {
            this.analysisResult.fingerprint = result.fingerprint;
          }
        }
        
        // 构造返回数据：包含分析结果和排名信息
        const returnData = {
          // 分析结果（V2 接口返回的精准数据）
          dimensions: backendDimensions,
          roastText: backendRoastText,
          personalityName: backendPersonalityName,
          vibeIndex: backendVibeIndex,
          personalityType: backendPersonalityType,
          lpdef: backendLpdef,
          
          // 【关键修复】包含后端返回的完整数据，如果后端没有返回则使用 vibeResult 中的数据
          analysis: result.analysis || vibeResult?.analysis || this.analysisResult?.analysis || null, // 包含 name, description, dimensions, traits
          semanticFingerprint: result.semanticFingerprint || vibeResult?.semanticFingerprint || this.analysisResult?.semanticFingerprint || null, // 语义指纹对象
          stats: result.stats || result.data?.stats || null, // 完整的 stats 数据
          fingerprint: result.fingerprint || null, // 语义指纹字符串
          claim_token: result.claim_token || null, // 【关键修复】认领令牌
          
          // 【V6 架构修复】优先从 personality.detailedStats 读取数据
          // 数据流向：后端 scoring.ts → rank-content.ts → matchRankLevel → personality.detailedStats
          personality: result.personality || null, // 包含 detailedStats 数组
          detailedStats: result.personality?.detailedStats || result.detailedStats || null, // 详细统计数据数组，包含每个维度的称号和吐槽文案（优先从 personality.detailedStats 读取）
          
          // 排名信息（如果后端返回了）
          rankPercent: Number(finalRank),
          ranking: Number(finalRank), // 兼容字段
          totalUsers: Number(totalUsers),
          defeated: result.defeated ?? 0,
          actualRank: result.actualRank ?? 0,
          
          // 其他数据
          statistics: statistics,
          metadata: result.metadata || null
        };
        
        // 如果后端返回了 ranks 对象，添加到返回对象中
        if (ranks) {
          returnData.ranks = ranks;
        }
        
        // 如果后端返回了 globalAverage，添加到返回对象中
        if (globalAverage) {
          returnData.globalAverage = globalAverage;
        }
        
        // 语义爆发（国别热词）：
        // 修复：不要用 roastText（吐槽文案库）作为提词语料，否则会把“技术/一场交流”等文案词上报并污染词云。
        // 当前国别热词已由上方“从 chatData 提取 MERIT/SLANG 并上报 /api/v2/report-vibe”覆盖，无需重复上报 /api/report-slang。

        return returnData;
      } else {
        // 处理错误情况
        console.warn('[VibeAnalyzer] 后端返回错误:', result);
        throw new Error(result.error || result.message || '后端返回错误状态');
      }

    } catch (err) {
      console.error('[VibeAnalyzer] 上传排名过程出错:', {
        message: err.message,
        name: err.name,
        isNetworkError: err.message.includes('fetch') || err.message.includes('network') || err.message.includes('CORS'),
        isTimeout: err.message.includes('timeout') || err.message.includes('Timeout')
      });
      return { 
        error: err.message,
        errorType: err.name,
        isNetworkError: err.message.includes('fetch') || err.message.includes('network') || err.message.includes('CORS'),
        isTimeout: err.message.includes('timeout') || err.message.includes('Timeout'),
        timestamp: new Date().toISOString(),
        url: analyzeUrl || 'unknown',
        
        rankPercent: 0, 
        totalUsers: 0
      };
    }
  }
  /**
   * 【v5.0 新增】获取默认结果（带环境上下文）
   * @param {Object} context - 环境上下文信息
   * @returns {Object} 符合 /api/v2/analyze 标准的默认 JSON
   */
  getDefaultResultWithContext(context = {}) {
    const lang = context.lang || this.lang || 'zh-CN';
    const isEn = lang === 'en' || lang.startsWith('en');
    
    // 【v5.0 异常兜底】默认维度分数为 0
    const defaultDimensions = {};
    const dimensionKeys = this.dimensionKeys || ['L', 'P', 'D', 'E', 'F'];
    dimensionKeys.forEach(key => {
      defaultDimensions[key] = 0;
    });
    
    return {
      fingerprint: {
        codeRatio: '0%',
        patienceLevel: 'Low Patience',
        detailLevel: 'Low Detail',
        techExploration: 'Low Explore',
        feedbackDensity: '0%',
        compositeScore: 0,
        techDiversity: 'Low',
        interactionStyle: 'Balanced',
        balanceIndex: 'Slightly Imbalanced'
      },
      dimensions: defaultDimensions,
      stats: {
        totalChars: 0,
        totalMessages: 0,
        ketao_count: 0,
        jiafang_count: 0,
        tech_stack: {},
        work_days: 0,
        avg_payload: 0
      },
      meta: {
        ip: context.ip || '0.0.0.0',
        lang: lang,
        timezone: context.timezone || 'UTC',
        fingerprint: context.fingerprint || null,
        isVpn: Boolean(context.isVpn || false),
        isProxy: Boolean(context.isProxy || false),
        timestamp: new Date().toISOString(),
        countryCode: this.countryCode || null,
        hasRageWord: false,
        personalityType: 'UNKNOWN',
        vibeIndex: '00000',
        lpdef: 'L0P0D0E0F0'
      }
    };
  }

  /**
   * 获取默认结果（兼容旧版本）
   */
  getDefaultResult(lang = 'zh-CN') {
    return this.getDefaultResultWithContext({ lang });
  }

  /**
   * 【v5.0 架构清理】已删除 shadowCallToWorker 和 compareDimensions 方法
   * 所有冗余对比逻辑已移除，实现纯净分析流
   */

  /**
   * 【v4.0 新增】设置国家上下文
   * 注入国家平均值，用于计算个人得分与国家平均分的偏离度
   * @param {string} countryCode - 国家代码（ISO 3166-1 alpha-2，如 'US', 'CN', 'JP'）
   * @param {Object} countryAverage - 国家平均分对象 {dimension: average}
   * @param {Object} countryContext - 国家上下文数据（可选）
   */
  setCountryContext(countryCode, countryAverage = null, countryContext = {}) {
    this.countryCode = countryCode;
    this.countryAverage = countryAverage;
    this.countryContext = {
      ...this.countryContext,
      ...countryContext,
      countryCode,
      updatedAt: new Date().toISOString()
    };
    
    console.log(`[VibeAnalyzer] 国家上下文已设置: ${countryCode}`, {
      countryAverage,
      contextKeys: Object.keys(countryContext)
    });
  }

  /**
   * 【v4.0 新增】计算个人得分与国家平均分的偏离度
   * @param {Object} personalDimensions - 个人维度得分
   * @returns {Object} 偏离度对象 {dimension: deviation, overallDeviation: number}
   */
  calculateDeviationFromCountry(personalDimensions) {
    if (!this.countryAverage || !personalDimensions) {
      return null;
    }
    
    const deviations = {};
    const dimensionKeys = this.dimensionKeys || Object.keys(personalDimensions);
    let totalDeviation = 0;
    let validCount = 0;
    
    dimensionKeys.forEach(key => {
      const personal = personalDimensions[key] || 0;
      const country = this.countryAverage[key] || 0;
      
      if (country > 0) {
        // 计算相对偏离度（百分比）
        const deviation = ((personal - country) / country) * 100;
        deviations[key] = {
          personal,
          country,
          deviation: deviation.toFixed(2),
          deviationPercent: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(2)}%`
        };
        
        totalDeviation += Math.abs(deviation);
        validCount++;
      }
    });
    
    const overallDeviation = validCount > 0 ? totalDeviation / validCount : 0;
    
    return {
      deviations,
      overallDeviation: overallDeviation.toFixed(2),
      interpretation: this.interpretDeviation(overallDeviation)
    };
  }

  /**
   * 【v4.0 新增】解释偏离度
   * @param {number} deviation - 平均偏离度
   * @returns {string} 偏离度解释
   */
  interpretDeviation(deviation) {
    const d = parseFloat(deviation);
    if (d < 5) return '与全国平均水平非常接近';
    if (d < 15) return '略高于/低于全国平均水平';
    if (d < 30) return '明显高于/低于全国平均水平';
    return '显著偏离全国平均水平';
  }

  /**
   * 【v4.0 修复】清理资源（彻底清理MessageChannel和事件监听器）
   */
  destroy() {
    // 【v4.0 修复】清理所有MessageChannel实例
    this.messageChannels.forEach(channel => {
      try {
        channel.port1.close();
        channel.port2.close();
      } catch (e) {
        console.warn('[VibeAnalyzer] 清理MessageChannel失败:', e);
      }
    });
    this.messageChannels.clear();
    
    // 【v4.0 修复】移除Worker事件监听器
    if (this.worker) {
      if (this._messageHandler) {
        this.worker.removeEventListener('message', this._messageHandler);
        this._messageHandler = null;
      }
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
    
    // 【v4.0 修复】清理所有超时定时器
    this.activeTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.clear();
    
    // 释放并发锁
    this.analysisLock = false;
    
    // 清空稀疏维度数据
    this.sparseDimensions.clear();
    
    console.log('[VibeAnalyzer] 资源清理完成');
  }
}
