/**
 * vibeAnalyzerWorker.js - Vibe Codinger 高性能匹配引擎 (AC 自动机 + BM25 优化版)
 *
 * 【2026-01-20 重大更新 v3.0】性能与准确性双重提升：
 *
 * 核心算法重构：
 * 1. AC 自动机 (Aho-Corasick) - 单次扫描 O(n) 匹配所有关键词
 * 2. BM25 评分 - 解决"话痨刷分"，引入词频饱和度
 *
 * 新增优化（v3.0）：
 * 3. IDF 权重 - 稀有词自动获得更高权重
 * 4. 文档长度归一化 - 防止长文本刷分
 * 5. 词频饱和 - 同一词超过 3 次后呈对数衰减
 *
 * 设计理念：参考信息检索领域的 BM25 算法，打造精准的个性化雷达图
 */

let dimensionData = null;
let acAutomaton = null;
let bm25Scorer = null;

// ==========================================
// 1. 配置常量：基准密度与曲线形态
// ==========================================

/**
 * 维度基准配置 (基于每1000字的加权得分密度)
 * midpoint: 达到 50 分所需的密度值 (行业平均密度) - 【已大幅提升门槛】
 * steepness: 曲线陡峭程度 (值越大，分数拉开的差距越明显)
 *
 * 【2026-01-14 优化】引入非对称中位值 (Asymmetric Midpoint):
 * - L (Logic): midpoint 35 → 极其严苛，神谕级词汇才能拿高分
 * - P (Patience): midpoint 18 → 大幅提升耐心门槛
 * - D (Detail): midpoint 28 → 细节要求极高
 * - E/F: 维持原有难度
 */
const SCORING_CONFIG = {
  L: { midpoint: 15, steepness: 0.15 }, // 逻辑：降低门槛（从35降到15），更易识别代码特征
  P: { midpoint: 12, steepness: 0.3 },  // 耐心：降低门槛（从18降到12）
  D: { midpoint: 18, steepness: 0.2 },  // 细节：降低门槛（从28降到18）
  E: { midpoint: 8,  steepness: 0.25 }, // 探索：维持原有难度
  F: { midpoint: 10, steepness: 0.2 },  // 反馈：维持原有难度
};

/**
 * 语义权重矩阵：区分噪音与神谕
 * L1 (专家词/神谕词): 权重最高，如"幂等性"、"抽象层"、"时空复杂度"
 * L2 (中等词): 权重中等
 * L3 (常用词/噪音词): 权重最低，如"好的"、"改下"
 *
 * 要求：L1 权重是 L3 的 5 倍以上
 */
const WEIGHTS = { L1: 10, L2: 5, L3: 1 };

/**
 * 连击加成配置
 * 如果一个片段内同时命中"逻辑"与"细腻"词汇，给予连击加成
 */
const COMBO_BONUS = 1.2;

/**
 * 密度窗口配置
 * MIN_CHARS: 最小置信字数阈值（500字）
 * FULL_RELEASE_CHARS: 完全释放阈值（2000字）
 */
const DENSITY_WINDOW = {
  MIN_CHARS: 500,
  FULL_RELEASE_CHARS: 2000,
};

/**
 * BM25 参数配置
 * k1: 词频饱和参数 (1.2-2.0)，值越大，词频对得分的影响越大
 * b: 文档长度归一化参数 (0-1)，值越大，长度对得分的影响越大
 */
const BM25_CONFIG = {
  k1: 1.5,  // 推荐值：1.2-2.0
  b: 0.75,  // 推荐值：0.75
};

/**
 * 【2026-01-27 V6.0 新增】V6 行为阈值配置
 * 定义各项指标的敏感度阈值，用于判断是否触发行为特征
 */
const V6_BEHAVIOR_THRESHOLDS = {
  ketao_threshold: 10,      // 赛博磕头阈值：命中"Feedback"维度中语义偏向"求助/请求"的频次
  jiafang_threshold: 5,     // 甲方上身阈值：指令性动词在总匹配中的占比加权
  tease_threshold: 3,       // 调戏AI阈值：语气助词、表情符号或非技术性调侃词的频次
  nonsense_threshold: 20,   // 废话输出阈值：NOISE_WORDS 或短词重复出现的频次
  repeat_message_threshold: 3, // 连续重复消息阈值：相同消息连续出现次数
};

/**
 * 【2026-01-27 V6.0 新增】最大分析字符数限制
 * 放宽至 300,000 以支持 23 万字级别的深度体检
 */
const MAX_ANALYSIS_CHARS = 300000;

/**
 * 【2026-01-20 新增】稀有度分值（IDF 模拟值）
 * 专业词汇权重大于通用词汇
 */
const RARITY_SCORES = {
  L1: 5.0, // 专家词/神谕词（如"幂等性"、"依赖反转"）
  L2: 2.0, // 中等词（如"初始化"、"队列"）
  L3: 1.0, // 常用词/噪音词（如"先"、"然后"）
};

/**
 * 【2026-01-20 新增】N-Gram 上下文匹配配置
 */
const NGRAM_CONFIG = {
  N: 2,  // N-Gram 长度（2=双词，3=三词）
  windowSize: 3,  // 滑窗大小（用于检测否定前缀）
};

/**
 * 【2026-01-20 新增】否定前缀列表
 * 用于反转语义的词汇，例如"不+稳定" → 负面
 */
const NEGATION_PREFIXES = {
  chinese: [
    '不', '没', '没有', '无', '未', '别', '不要', '不行',
    '非', '不会', '不能', '不是', '从未',
  ],
  english: [
    "don't", "doesn't", "didn't", "won't", "can't", "couldn't",
    'never', 'no', 'not', 'none', 'nothing', 'nowhere',
    'hardly', 'scarcely', 'barely', 'seldom', 'rarely',
  ],
};

/**
 * 【2026-01-20 新增】强化前缀列表
 * 用于增强语义的词汇，例如"非常+好" → 正面加强
 */
const INTENSIFIER_PREFIXES = {
  chinese: ['非常', '特别', '极其', '相当', '十分', '很', '太'],
  english: ['very', 'extremely', 'really', 'quite', 'rather', 'too', 'so'],
};

/**
 * 【2026-01-27 新增】行为特征捕获正则表达式（双语）
 * KETAO_REG: 赛博磕头（谢谢、辛苦、麻烦等）
 * JIAFANG_REG: 甲方上身（马上、赶紧、必须等）
 * ABUSE_REG: 受虐倾向（error, failed, 报错等）
 * TEASE_REG: 调戏AI（调皮词汇）
 * NONSENSE_REG: 废话输出（无意义词汇）
 * 预编译在循环外部，提升性能
 */
/**
 * 【2026-01-27 新增】噪音词列表（Noise Words）
 * 极高频的代码关键词，在进入 BM25 评分前应被过滤，防止干扰 Logic 和 Detail 维度评分
 */
const NOISE_WORDS = new Set([
  // JavaScript/TypeScript 关键字
  'const', 'let', 'var', 'function', 'class', 'import', 'export', 'return', 'if', 'else',
  'for', 'while', 'switch', 'case', 'try', 'catch', 'async', 'await', 'new', 'this',
  'typeof', 'instanceof', 'in', 'of', 'from', 'as', 'extends', 'implements', 'interface',
  // 常见操作符和符号
  '=>', '=', '==', '===', '!==', '!=', '>', '<', '>=', '<=',
  // 常见代码模式
  'console', 'log', 'debugger', 'break', 'continue', 'default'
]);

/**
 * 【2026-01-27 新增】文本清洗函数
 * 1. 过滤掉所有不含中文字符或英文字母的纯符号词汇
 * 2. 移除以 + 或 - 开头的代码行前缀（Cursor Diff 输出）
 * 3. 移除噪音词
 * 
 * @param {string} text - 原始文本
 * @returns {string} 清洗后的文本
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  let cleaned = text;
  
  // 步骤1: 移除 Cursor Diff 输出的行前缀（+ 或 - 开头）
  // 匹配行首的 + 或 -，后跟空格或制表符
  cleaned = cleaned.replace(/^[\+\-]\s+/gm, '');
  
  // 步骤2: 移除纯符号词汇（不含中文或英文字母的词汇）
  // 匹配由纯符号、数字、标点组成的"词汇"（被空格或标点包围）
  // 保留包含至少一个中文或英文字母的词汇
  cleaned = cleaned.replace(/\b[^\u4e00-\u9fa5a-zA-Z\s]+\b/g, '');
  
  // 步骤3: 移除连续的纯符号序列（如 ===, =>, -> 等）
  // 但保留在代码上下文中的这些符号（如函数定义中的 =>）
  // 这里简化处理：移除独立的符号序列
  cleaned = cleaned.replace(/\s+[=\-<>!&|]+\s+/g, ' ');
  
  return cleaned.trim();
}

/**
 * 【2026-01-27 新增】关键词映射归一化表
 * 将常见技术词汇的缩写或小写形式映射为标准格式（首字母大写）
 */
const TECH_KEYWORD_MAP = {
  // 编程语言
  'ts': 'TypeScript',
  'js': 'JavaScript',
  'py': 'Python',
  'go': 'Go',
  'rs': 'Rust',
  'rb': 'Ruby',
  'php': 'PHP',
  'java': 'Java',
  'cpp': 'C++',
  'csharp': 'C#',
  'swift': 'Swift',
  'kotlin': 'Kotlin',
  'dart': 'Dart',
  // 框架/库
  'react': 'React',
  'vue': 'Vue',
  'angular': 'Angular',
  'node': 'Node.js',
  'express': 'Express',
  'next': 'Next.js',
  'nuxt': 'Nuxt.js',
  'svelte': 'Svelte',
  'jquery': 'jQuery',
  'bootstrap': 'Bootstrap',
  'tailwind': 'Tailwind',
  'webpack': 'Webpack',
  'vite': 'Vite',
  'rollup': 'Rollup',
  'esbuild': 'esbuild',
  // 数据库
  'mysql': 'MySQL',
  'postgres': 'PostgreSQL',
  'mongodb': 'MongoDB',
  'redis': 'Redis',
  'sqlite': 'SQLite',
  // 工具/平台
  'git': 'Git',
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'aws': 'AWS',
  'azure': 'Azure',
  'gcp': 'GCP',
};

/**
 * 【2026-01-27 修复】关键词归一化函数
 * 将命中词统一为首字母大写格式，防止频次分裂
 */
function normalizeTechKeyword(word) {
  if (!word || typeof word !== 'string') return word;
  
  // 先检查映射表
  const lowerWord = word.toLowerCase();
  if (TECH_KEYWORD_MAP[lowerWord]) {
    return TECH_KEYWORD_MAP[lowerWord];
  }
  
  // 如果没有映射，则统一为首字母大写格式
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// 【2026-01-27 修复】全词匹配正则表达式（使用边界符 \b 防止误匹配）
const KETAO_REG = /\b(谢谢|辛苦|麻烦|请问|跪求|拜托|感谢|大佬|thanks|thank you|appreciate|kindly|please|sorry)\b/gi;
const JIAFANG_REG = /\b(马上|赶紧|必须|重写|改一下|优化|速度|ASAP|immediately|must|rewrite|fix|rework|quickly|why)\b/gi;
const ABUSE_REG = /\b(error|failed|fail|报错|错误|失败|崩溃|bug|exception|crash|broken|wrong|incorrect|问题|issue|problem)\b/gi;
const TEASE_REG = /(哈哈|嘿嘿|嘻嘻|😄|😊|😆|\blol\b|\bhaha\b|\bhehe\b|\blmao\b|\brofl\b|调皮|逗|开玩笑|\bfunny\b|\bjoke\b)/gi;
const NONSENSE_REG = /(嗯|啊|呃|额|那个|这个|就是|然后|所以|但是|不过|其实|话说|\bem\b|\bum\b|\buh\b|\ber\b|\bah\b|\bwell\b|\byou know\b|\blike\b)/gi;
const SLANG_REG = /\b(deep dive|low hanging fruit|paradigm shift|game changer|touch base|best practice|scalability|idempotent|synergy|leverage|disrupt|pivot|scale|unicorn|moonshot|bandwidth|circle back|unblock)\b/gi;

/**
 * 【2026-01-27 新增】硅谷黑话识别词库
 * 技术圈常用黑话，用于识别用户的"圈内人"程度
 */
const SILICON_VALLEY_BLACKWORDS = [
  // 技术黑话
  '赋能', '抓手', '闭环', '沉淀', '对齐', '打通', '落地', '复盘', '赋能', '抓手',
  '迭代', '复盘', '赋能', '抓手', '闭环', '沉淀', '对齐', '打通', '落地', '复盘',
  '赋能', '抓手', '闭环', '沉淀', '对齐', '打通', '落地', '复盘', '赋能', '抓手',
  // 英文黑话
  'synergy', 'leverage', 'disrupt', 'pivot', 'scale', 'unicorn', 'moonshot',
  'deep dive', 'low-hanging fruit', 'think outside the box', 'move the needle',
  'bandwidth', 'circle back', 'touch base', 'ping', 'sync', 'align', 'unblock',
  // 技术术语黑话化
  '架构', '重构', '优化', '性能', '瓶颈', '痛点', '场景', '方案', '落地', '上线'
];

// ==========================================
// 【三身份级别词云】AC 自动机单次扫描 + 位图冲突 + 原生语料
// ==========================================

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 身份词云专用 Trie 节点（仅 category + term）
 */
function IdentityTrieNode() {
  this.children = {};
  this.fail = null;
  this.output = [];
  this.isEnd = false;
  this.category = ''; // 'Novice' | 'Professional' | 'Architect'
  this.term = '';
}

/**
 * 身份词云 Aho-Corasick 自动机
 * 单次扫描文本返回所有命中位置，供长词优先 + 位图去重
 */
function IdentityACAutomaton() {
  this.root = new IdentityTrieNode();
  this.root.fail = this.root;
  this.isBuilt = false;
}

IdentityACAutomaton.prototype.insert = function (word, category) {
  var node = this.root;
  for (var i = 0; i < word.length; i++) {
    var c = word[i];
    if (!node.children[c]) node.children[c] = new IdentityTrieNode();
    node = node.children[c];
  }
  node.isEnd = true;
  node.category = category;
  node.term = word;
};

IdentityACAutomaton.prototype.buildFailureLinks = function () {
  var queue = [];
  var root = this.root;
  for (var c in root.children) {
    var child = root.children[c];
    child.fail = root;
    queue.push(child);
  }
  while (queue.length > 0) {
    var current = queue.shift();
    for (var c in current.children) {
      var child = current.children[c];
      var fail = current.fail;
      while (fail !== root && !fail.children[c]) fail = fail.fail;
      child.fail = fail.children[c] || root;
      child.output = child.fail.isEnd ? [child.fail].concat(child.fail.output) : child.fail.output.slice();
      queue.push(child);
    }
  }
  this.isBuilt = true;
};

/**
 * 单次扫描返回所有命中：{ start, length, word, category }
 */
IdentityACAutomaton.prototype.searchAllMatches = function (text) {
  var matches = [];
  if (!this.isBuilt || !text) return matches;
  var node = this.root;
  var root = this.root;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    while (node !== root && !node.children[c]) node = node.fail;
    node = node.children[c] || root;
    var toCheck = [node].concat(node.output);
    for (var k = 0; k < toCheck.length; k++) {
      var n = toCheck[k];
      if (n.isEnd && n.term) {
        var len = n.term.length;
        matches.push({ start: i - len + 1, length: len, word: n.term, category: n.category });
      }
    }
  }
  return matches;
};

/**
 * 预检查：仅保留在文本中出现的词，减小 Trie 规模，加速 AC 扫描
 */
function filterLevelKeywordsByText(levelKeywords, text) {
  if (!levelKeywords || !text || typeof text !== 'string') return levelKeywords || {};
  var textLower = text.toLowerCase();
  var out = { Novice: [], Professional: [], Architect: [] };
  for (var level of ['Novice', 'Professional', 'Architect']) {
    var kw = levelKeywords[level];
    if (!Array.isArray(kw)) continue;
    for (var i = 0; i < kw.length; i++) {
      var s = String(kw[i] || '').trim();
      if (s.length < 2) continue;
      var included = /^[a-zA-Z0-9]+$/.test(s)
        ? textLower.indexOf(s.toLowerCase()) !== -1
        : text.indexOf(s) !== -1;
      if (included) out[level].push(s);
    }
  }
  return out;
}

/**
 * 从 levelKeywords 构建身份 AC 自动机（Novice / Professional / Architect）
 */
function buildIdentityACAutomaton(levelKeywords) {
  var ac = new IdentityACAutomaton();
  if (!levelKeywords || typeof levelKeywords !== 'object') return ac;
  for (var level of ['Novice', 'Professional', 'Architect']) {
    var kw = levelKeywords[level];
    if (!Array.isArray(kw)) continue;
    for (var i = 0; i < kw.length; i++) {
      var s = String(kw[i] || '').trim();
      if (s.length >= 2) ac.insert(s, level);
    }
  }
  ac.buildFailureLinks();
  return ac;
}

/**
 * 提取用户文本中非关键词的高频词（动词/名词等生活化词汇）
 * 若一词既是关键词又是高频词，优先归为身份词，此处不纳入 native（由 keywordSet 排除）
 * @param {string} text - 用户文本
 * @param {Set} keywordSet - 所有关键词集合（含原文及小写，用于排除）
 * @param {number} limit - 最多返回数量
 * @returns {Array<{word: string, count: number, source: string}>}
 */
function extractNativeHighFreq(text, keywordSet, limit) {
  if (!text || typeof text !== 'string' || text.length < 4) return [];
  const freq = {};
  const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const enWords = (text.match(/\b[a-zA-Z]{2,20}\b/g) || []).map(function (w) { return w.toLowerCase(); });
  chineseWords.forEach(function (w) {
    if (!keywordSet.has(w) && w.length >= 2) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });
  enWords.forEach(function (w) {
    if (!keywordSet.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });
  return Object.entries(freq)
    .filter(function (e) { return e[1] > 1; })
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, limit)
    .map(function (e) { return { word: e[0], count: e[1], source: 'native' }; });
}

/** 检查 [start, end) 在 mask 中是否已被占用 */
function rangeOverlapsMask(start, end, mask) {
  for (var i = start; i < end && i < mask.length; i++) {
    if (mask[i] === 1) return true;
  }
  return false;
}
/** 标记 [start, end) 为已占用 */
function markRange(start, end, mask) {
  for (var i = start; i < end && i < mask.length; i++) mask[i] = 1;
}

/** 构建关键词 Set（用于原生语料排除） */
function buildKeywordSet(levelKeywords) {
  var keywordSet = new Set();
  for (var level of ['Novice', 'Professional', 'Architect']) {
    var kw = levelKeywords[level];
    if (!Array.isArray(kw)) continue;
    for (var i = 0; i < kw.length; i++) {
      var s = String(kw[i] || '').trim();
      if (s.length >= 2) {
        keywordSet.add(s);
        if (/[a-zA-Z]/.test(s)) keywordSet.add(s.toLowerCase());
      }
    }
  }
  return keywordSet;
}

/**
 * 身份词云核心：AC 自动机单次扫描 + 长词优先 + Uint8Array 位图去重
 * 禁止对 1500 词做循环正则；单次遍历文本即可得到所有命中，再按词长排序后位图计分
 * @param {string} text - 全文
 * @param {Object} levelKeywords - { Novice: string[], Professional: string[], Architect: string[] }
 * @returns {{ Novice: Array, Professional: Array, Architect: Array, native: Array }}
 */
function computeIdentityLevelCloud(text, levelKeywords) {
  var out = { Novice: [], Professional: [], Architect: [], native: [] };
  if (!levelKeywords || typeof levelKeywords !== 'object') return out;
  if (!text || typeof text !== 'string') return out;

  var filtered = filterLevelKeywordsByText(levelKeywords, text);
  var ac = buildIdentityACAutomaton(filtered);
  var keywordSet = buildKeywordSet(levelKeywords);

  var matches = ac.searchAllMatches(text);
  matches.sort(function (a, b) { return b.length - a.length; });

  var mask = new Uint8Array(text.length);
  var rawCounts = { Novice: {}, Professional: {}, Architect: {} };
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var start = m.start;
    var end = m.start + m.length;
    if (start < 0 || end > text.length) continue;
    if (!rangeOverlapsMask(start, end, mask)) {
      var word = m.word;
      var cat = m.category;
      rawCounts[cat][word] = (rawCounts[cat][word] || 0) + 1;
      markRange(start, end, mask);
    }
  }

  for (var level of ['Novice', 'Professional', 'Architect']) {
    var total = 0;
    var maxInLevel = 0;
    for (var w in rawCounts[level]) {
      var cnt = rawCounts[level][w];
      total += cnt;
      if (cnt > maxInLevel) maxInLevel = cnt;
    }
    for (var w in rawCounts[level]) {
      var c = rawCounts[level][w];
      if (c > 0) {
        out[level].push({ word: w, count: c, source: level.toLowerCase(), totalInLevel: total, maxInLevel: maxInLevel });
      }
    }
    out[level].sort(function (a, b) { return b.count - a.count; });
  }

  out.native = extractNativeHighFreq(text, keywordSet, 20);
  return out;
}

/**
 * 超长文本分片扫描：每段 4 万字，段间 postMessage PROGRESS + setTimeout(0) 真正让出时间片
 * 返回 Promise<identityLevelCloud>
 */
function computeIdentityLevelCloudAsync(text, levelKeywords) {
  var CHUNK_LEN = 40000;
  var out = { Novice: [], Professional: [], Architect: [], native: [] };
  if (!levelKeywords || typeof levelKeywords !== 'object' || !text || typeof text !== 'string') {
    return Promise.resolve(out);
  }

  var filtered = filterLevelKeywordsByText(levelKeywords, text);
  var ac = buildIdentityACAutomaton(filtered);
  var keywordSet = buildKeywordSet(levelKeywords);
  var allMatches = [];
  var offset = 0;
  var totalLen = text.length;

  function finish() {
    allMatches.sort(function (a, b) { return b.length - a.length; });
    var mask = new Uint8Array(text.length);
    var rawCounts = { Novice: {}, Professional: {}, Architect: {} };
    for (var i = 0; i < allMatches.length; i++) {
      var m = allMatches[i];
      var start = m.start;
      var end = m.start + m.length;
      if (start < 0 || end > text.length) continue;
      if (!rangeOverlapsMask(start, end, mask)) {
        var word = m.word;
        var cat = m.category;
        rawCounts[cat][word] = (rawCounts[cat][word] || 0) + 1;
        markRange(start, end, mask);
      }
    }
    for (var level of ['Novice', 'Professional', 'Architect']) {
      var total = 0;
      var maxInLevel = 0;
      for (var w in rawCounts[level]) {
        var cnt = rawCounts[level][w];
        total += cnt;
        if (cnt > maxInLevel) maxInLevel = cnt;
      }
      for (var w in rawCounts[level]) {
        var c = rawCounts[level][w];
        if (c > 0) out[level].push({ word: w, count: c, source: level.toLowerCase(), totalInLevel: total, maxInLevel: maxInLevel });
      }
      out[level].sort(function (a, b) { return b.count - a.count; });
    }
    out.native = extractNativeHighFreq(text, keywordSet, 20);
    return out;
  }

  return new Promise(function (resolve) {
    function nextChunk() {
      if (offset >= totalLen) {
        resolve(finish());
        return;
      }
      var chunk = text.slice(offset, offset + CHUNK_LEN);
      var chunkMatches = ac.searchAllMatches(chunk);
      for (var j = 0; j < chunkMatches.length; j++) {
        var m = chunkMatches[j];
        allMatches.push({ start: m.start + offset, length: m.length, word: m.word, category: m.category });
      }
      offset += chunk.length;
      try {
        self.postMessage({ type: 'PROGRESS', payload: { phase: 'identityCloud', offset: offset, total: totalLen } });
      } catch (_) {}
      setTimeout(function () { nextChunk(); }, 0);
    }
    setTimeout(function () { nextChunk(); }, 0);
  });
}

// ==========================================
// 【V6.0】词云爆发力因子与扁平化
// ==========================================

function calculateSequenceCombo(categoryWords, currentWord, windowSize) {
  windowSize = windowSize || 3;
  const recent = categoryWords.slice(-windowSize);
  const sameTypeMatches = recent.filter(function (w) {
    return w.word === currentWord || Math.abs(w.word.length - currentWord.length) <= 1;
  });
  return sameTypeMatches.length;
}

function calculateIDFWeight(hits, totalHits) {
  if (hits <= 0) return 1;
  const maxHits = Math.max(hits, totalHits);
  const ratio = hits / maxHits;
  return Math.max(1, Math.min(5, 1 / Math.sqrt(ratio)));
}

function calculateWordCloudWeight(hits, idfWeight, sequenceCombo) {
  const comboFactor = Math.log(1 + sequenceCombo);
  return Math.round((hits * idfWeight) * comboFactor);
}

function flattenBlackwordHits(blackwordHits, totalHits) {
  totalHits = totalHits || 1;
  const result = [];
  const wordHistory = [];
  const sumChinese = Object.values(blackwordHits.chinese_slang || {}).reduce(function (a, b) { return a + b; }, 0);
  const sumEnglish = Object.values(blackwordHits.english_slang || {}).reduce(function (a, b) { return a + b; }, 0);
  if (blackwordHits.chinese_slang) {
    const sortedWords = Object.entries(blackwordHits.chinese_slang).sort(function (a, b) { return b[1] - a[1]; });
    for (let i = 0; i < sortedWords.length; i++) {
      const word = sortedWords[i][0];
      const hits = sortedWords[i][1];
      const idfWeight = calculateIDFWeight(hits, sumChinese || totalHits);
      const combo = calculateSequenceCombo(wordHistory, word);
      const weight = calculateWordCloudWeight(hits, idfWeight, combo);
      result.push({ name: word, value: weight, category: 'merit' });
      wordHistory.push({ word: word, hits: hits });
    }
  }
  if (blackwordHits.english_slang) {
    const sortedWords = Object.entries(blackwordHits.english_slang).sort(function (a, b) { return b[1] - a[1]; });
    for (let i = 0; i < sortedWords.length; i++) {
      const word = sortedWords[i][0];
      const hits = sortedWords[i][1];
      const idfWeight = calculateIDFWeight(hits, sumEnglish || totalHits);
      const combo = calculateSequenceCombo(wordHistory, word);
      const weight = calculateWordCloudWeight(hits, idfWeight, combo);
      result.push({ name: word, value: weight, category: 'slang' });
      wordHistory.push({ word: word, hits: hits });
    }
  }
  return result;
}

// ==========================================
// 2. AC 自动机 (Aho-Corasick Automaton)
// ==========================================
// 2. AC 自动机 (Aho-Corasick Automaton)
// ==========================================

/**
 * Trie 节点
 */
class TrieNode {
  constructor() {
    this.children = {};
    this.fail = null; // 失败指针
    this.output = []; // 输出链接（指向其他可以接受的节点）
    this.isEnd = false;
    this.dimension = '';
    this.level = '';
    this.weight = 0;
    this.term = ''; // 原始词汇
  }
}

/**
 * Aho-Corasick 自动机
 * 支持单次文本扫描匹配所有关键词（O(n) 复杂度）
 */
class ACAutomaton {
  constructor() {
    this.root = new TrieNode();
    this.root.fail = this.root; // 根节点的失败指针指向自己
    this.isBuilt = false; // 是否已构建失败指针
  }

  /**
   * 插入关键词
   */
  insert(word, dimension, level, weight) {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEnd = true;
    node.dimension = dimension;
    node.level = level;
    node.weight = weight;
    node.term = word;
  }

  /**
   * 构建失败指针（构建 AC 自动机的核心）
   * 使用 BFS 算法构建
   */
  buildFailureLinks() {
    const queue = [];

    // 第一层节点的失败指针指向根节点
    for (const char in this.root.children) {
      const child = this.root.children[char];
      child.fail = this.root;
      queue.push(child);
    }

    // BFS 构建所有节点的失败指针
    while (queue.length > 0) {
      const current = queue.shift();

      for (const char in current.children) {
        const child = current.children[char];
        let fail = current.fail;

        // 沿着失败指针向上查找，直到找到匹配或回到根节点
        while (fail !== this.root && !fail.children[char]) {
          fail = fail.fail;
        }

        // 设置子节点的失败指针
        if (fail.children[char]) {
          child.fail = fail.children[char];
        } else {
          child.fail = this.root;
        }

        // 收集输出链接（指向其他可以接受的节点）
        if (child.fail.isEnd) {
          child.output = [child.fail, ...child.fail.output];
        } else {
          child.output = [...child.fail.output];
        }

        queue.push(child);
      }
    }

    this.isBuilt = true;
  }

  /**
   * 【2026-01-20 新增】提取 N-Gram（上下文滑窗）
   * @param {string} text - 输入文本
   * @param {number} n - N-Gram 长度（默认 2）
   * @returns {Array} N-Gram 列表
   */
  extractNGrams(text, n = 2) {
    const ngrams = [];

    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n));
    }

    return ngrams;
  }

  /**
   * 【2026-01-20 新增】检测否定前缀
   * @param {string} text - 输入文本
   * @param {number} index - 当前匹配位置的索引
   * @returns {boolean} 是否检测到否定前缀
   */
  detectNegationPrefix(text, index) {
    const windowSize = NGRAM_CONFIG.windowSize;
    const windowStart = Math.max(0, index - windowSize);
    const window = text.slice(windowStart, index);

    // 检测中文否定词
    for (const neg of NEGATION_PREFIXES.chinese) {
      if (window.includes(neg)) {
        return true;
      }
    }

    // 检测英文否定词（包含边界检测）
    for (const neg of NEGATION_PREFIXES.english) {
      const regex = new RegExp(`\\b${neg}\\b$`, 'i');
      if (regex.test(window)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 【2026-01-20 新增】检测强化前缀
   * @param {string} text - 输入文本
   * @param {number} index - 当前匹配位置的索引
   * @returns {number} 强化系数（默认 1.0）
   */
  detectIntensifierPrefix(text, index) {
    const windowSize = NGRAM_CONFIG.windowSize;
    const windowStart = Math.max(0, index - windowSize);
    const window = text.slice(windowStart, index);

    // 检测中文强化词
    for (const int of INTENSIFIER_PREFIXES.chinese) {
      if (window.includes(int)) {
        return 1.5; // 强化系数 1.5
      }
    }

    // 检测英文强化词
    for (const int of INTENSIFIER_PREFIXES.english) {
      const regex = new RegExp(`\\b${int}\\b$`, 'i');
      if (regex.test(window)) {
        return 1.5; // 强化系数 1.5
      }
    }

    return 1.0; // 默认系数
  }

  /**
   * 搜索关键词（单次扫描，O(n) 复杂度）
   * 【2026-01-20 更新】支持上下文检测（否定前缀、强化前缀）
   * 【2026-01-27 更新】添加 tech_stack 词频提取（仅 L1 和 L2）
   */
  search(text) {
    const results = {
      L: { L1: 0, L2: 0, L3: 0 },
      P: { L1: 0, L2: 0, L3: 0 },
      D: { L1: 0, L2: 0, L3: 0 },
      E: { L1: 0, L2: 0, L3: 0 },
      F: { L1: 0, L2: 0, L3: 0 },
    };
    const techStackHits = {}; // 【2026-01-27 新增】tech_stack 词频统计（仅 L1 和 L2）

    if (!this.isBuilt) {
      return { results, techStackHits };
    }

    let node = this.root;
    const matchedPositions = new Set(); // 用于去重，避免同一位置重复计数

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 沿着失败指针查找匹配
      while (node !== this.root && !node.children[char]) {
        node = node.fail;
      }

      node = node.children[char] || this.root;

      // 检查当前节点和输出链接
      const nodesToCheck = [node, ...node.output];

      for (const matchNode of nodesToCheck) {
        if (matchNode.isEnd) {
          const key = `${matchNode.dimension}_${matchNode.level}`;

          // 【2026-01-20 新增】检测否定前缀
          const hasNegation = this.detectNegationPrefix(text, i);

          // 【2026-01-20 新增】检测强化前缀
          const intensifierFactor = this.detectIntensifierPrefix(text, i);

          // 如果检测到否定前缀，则反转权重（例如"不+稳定" → 负面）
          // 对于 E 和 F 维度，否定前缀会降低得分
          // 对于 L 和 D 维度，否定前缀会降低得分（例如"不要+优化" → 负面）
          if (hasNegation && (matchNode.dimension === 'E' || matchNode.dimension === 'F' || matchNode.dimension === 'L' || matchNode.dimension === 'D')) {
            // 否定：跳过该匹配（不加分）
            continue;
          }

          // 【2026-01-27 新增】噪音词过滤：跳过极高频代码关键词（防止干扰 Logic 和 Detail 维度评分）
          const termLower = (matchNode.term || '').toLowerCase();
          if (NOISE_WORDS.has(termLower)) {
            continue; // 跳过噪音词，不进行任何计数
          }

          // 避免同一位置重复计数（防止短词覆盖长词）
          const posKey = `${key}_${i}`;
          if (!matchedPositions.has(posKey)) {
            // 应用强化系数
            const effectiveCount = Math.round(matchNode.weight * intensifierFactor);
            results[matchNode.dimension][matchNode.level] += effectiveCount;
            matchedPositions.add(posKey);

            // 【2026-01-27 修复】tech_stack 词频提取（仅 L1 和 L2）+ 关键词映射归一化
            if ((matchNode.level === 'L1' || matchNode.level === 'L2') && matchNode.term) {
              // 使用归一化函数，防止频次分裂（如 ts -> TypeScript, react -> React）
              const normalizedWord = normalizeTechKeyword(matchNode.term);
              techStackHits[normalizedWord] = (techStackHits[normalizedWord] || 0) + 1;
            }
          }
        }
      }
    }

    return { results, techStackHits };
  }

  /**
   * 【2026-01-20 新增】N-Gram 上下文匹配
   * 在 AC 自动机基础上，引入滑窗机制
   * @param {string} text - 输入文本
   * @returns {Object} 匹配结果
   */
  searchWithNGram(text) {
    const results = {
      L: { L1: 0, L2: 0, L3: 0 },
      P: { L1: 0, L2: 0, L3: 0 },
      D: { L1: 0, L2: 0, L3: 0 },
      E: { L1: 0, L2: 0, L3: 0 },
      F: { L1: 0, L2: 0, L3: 0 },
    };

    if (!this.isBuilt) {
      return results;
    }

    // 提取 N-Gram（N=2，双词组合）
    const n = NGRAM_CONFIG.N;
    const ngrams = this.extractNGrams(text, n);

    // 使用 AC 自动机匹配 N-Gram
    ngrams.forEach(ngram => {
      let node = this.root;
      const matchedPositions = new Set();

      for (let i = 0; i < ngram.length; i++) {
        const char = ngram[i];

        // 沿着失败指针查找匹配
        while (node !== this.root && !node.children[char]) {
          node = node.fail;
        }

        node = node.children[char] || this.root;

        // 检查当前节点和输出链接
        const nodesToCheck = [node, ...node.output];

        for (const matchNode of nodesToCheck) {
          if (matchNode.isEnd) {
            const key = `${matchNode.dimension}_${matchNode.level}`;

            // 【2026-01-20 新增】N-Gram 上下文检测
            // 检测否定前缀
            const hasNegation = this.detectNegationPrefix(text, ngram.length);

            // 检测强化前缀
            const intensifierFactor = this.detectIntensifierPrefix(text, ngram.length);

            // 如果检测到否定前缀，则反转权重
            if (hasNegation) {
              continue;
            }

            // 避免重复计数
            const posKey = `${key}_${ngram}`;
            if (!matchedPositions.has(posKey)) {
              const effectiveCount = Math.round(matchNode.weight * intensifierFactor);
              results[matchNode.dimension][matchNode.level] += effectiveCount;
              matchedPositions.add(posKey);
            }
          }
        }
      }
    });

    return results;
  }

  /**
   * 统计每个关键词的命中次数（用于 BM25 计算）
   * 【2026-01-20 更新】支持上下文检测
   * 【2026-01-27 更新】添加 tech_stack 词频提取（仅 L1 和 L2）
   */
  searchWithTermFrequency(text) {
    const results = {
      L: { L1: 0, L2: 0, L3: 0 },
      P: { L1: 0, L2: 0, L3: 0 },
      D: { L1: 0, L2: 0, L3: 0 },
      E: { L1: 0, L2: 0, L3: 0 },
      F: { L1: 0, L2: 0, L3: 0 },
    };

    const termFrequencyMap = {}; // 词频映射：{term: count}
    const techStackHits = {}; // 【2026-01-27 新增】tech_stack 词频统计（仅 L1 和 L2）

    if (!this.isBuilt) {
      return { results, termFrequencyMap, techStackHits };
    }

    let node = this.root;
    const matchedPositions = new Set();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      while (node !== this.root && !node.children[char]) {
        node = node.fail;
      }

      node = node.children[char] || this.root;

      const nodesToCheck = [node, ...node.output];

      for (const matchNode of nodesToCheck) {
        if (matchNode.isEnd) {
          const key = `${matchNode.dimension}_${matchNode.level}`;

          // 【2026-01-20 新增】检测否定前缀
          const hasNegation = this.detectNegationPrefix(text, i);

          // 【2026-01-20 新增】检测强化前缀
          const intensifierFactor = this.detectIntensifierPrefix(text, i);

          // 如果检测到否定前缀，则跳过该匹配
          if (hasNegation) {
            continue;
          }

          // 【2026-01-27 新增】噪音词过滤：跳过极高频代码关键词（防止干扰 Logic 和 Detail 维度评分）
          const termLower = (matchNode.term || '').toLowerCase();
          if (NOISE_WORDS.has(termLower)) {
            continue; // 跳过噪音词，不进行任何计数
          }

          const posKey = `${key}_${i}`;

          if (!matchedPositions.has(posKey)) {
            // 应用强化系数
            const effectiveCount = Math.round(matchNode.weight * intensifierFactor);

            results[matchNode.dimension][matchNode.level] += effectiveCount;

            // 统计词频（使用有效计数）
            const termKey = `${key}_${matchNode.term}`;
            termFrequencyMap[termKey] = (termFrequencyMap[termKey] || 0) + effectiveCount;

            // 【2026-01-27 修复】tech_stack 词频提取（仅 L1 和 L2）+ 关键词映射归一化
            if ((matchNode.level === 'L1' || matchNode.level === 'L2') && matchNode.term) {
              // 使用归一化函数，防止频次分裂（如 ts -> TypeScript, react -> React）
              const normalizedWord = normalizeTechKeyword(matchNode.term);
              techStackHits[normalizedWord] = (techStackHits[normalizedWord] || 0) + 1;
            }

            matchedPositions.add(posKey);
          }
        }
      }
    }

    return { results, termFrequencyMap, techStackHits };
  }
}

/**
 * 从 dimensionData 构建 AC 自动机
 * 【2026-01-20 更新】适配预处理后的数据结构（带稀有度和组合权重）
 */
function buildACAutomaton(dimensionData) {
  const ac = new ACAutomaton();

  Object.keys(dimensionData).forEach(dimension => {
    const dimData = dimensionData[dimension];

    // 【防御性检查】验证数据结构
    if (!dimData || !dimData.data || typeof dimData.data !== 'object') {
      console.warn(`[Worker] 维度 ${dimension} 数据无效，跳过`);
      return;
    }

    // 遍历所有分类
    Object.values(dimData.data).forEach(category => {
      if (typeof category !== 'object' || category === null) return;

      // 遍历 L1, L2, L3 层级
      ['L1', 'L2', 'L3'].forEach(level => {
        const terms = category[level];

        // 【防御性检查】验证 terms 是否为数组
        if (!Array.isArray(terms)) {
          console.warn(`[Worker] 维度 ${dimension} 的 ${level} 不是数组，跳过`);
          return;
        }

        // 遍历词汇（预处理后的数据结构）
        terms.forEach(termObj => {
          // 【防御性检查】验证 termObj 结构
          if (!termObj || typeof termObj !== 'object') {
            return;
          }

          const term = termObj.term;
          const rarity = termObj.rarity || RARITY_SCORES[level];
          const weight = termObj.weight || WEIGHTS[level];
          const combinedWeight = termObj.combinedWeight || (rarity * weight);

          // 【防御性检查】验证 term
          if (term && typeof term === 'string' && term.trim().length > 0) {
            // 使用组合权重（稀有度 × 语义权重）作为 AC 自动机的权重
            ac.insert(term.trim(), dimension, level, combinedWeight);
          }
        });
      });
    });
  });

  // 构建失败指针
  ac.buildFailureLinks();

  console.log('[Worker] AC 自动机构建完成');
  return ac;
}

// ==========================================
// 3. BM25 评分器
// ==========================================

/**
 * BM25 评分器
 * 引入 k1（词频饱和度）和 b（文档长度归一化）参数
 */
class BM25Scorer {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.docFreq = new Map(); // 文档频率：{dimension_level: count}
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }

  /**
   * 初始化文档频率
   * @param {Array} chatData - 聊天数据
   */
  initDocFreq(chatData, acAutomaton) {
    const userMessages = chatData.filter(item => item.role === 'USER');
    this.totalDocs = userMessages.length;
    this.docFreq.clear();

    // 统计每个关键词的文档频率
    const termDocFreq = new Map();

    userMessages.forEach(msg => {
      const text = msg.text || '';
      if (!text || text.length < 2) return;

      const { results } = acAutomaton.searchWithTermFrequency(text);

      // 记录每个关键词的文档出现次数
      Object.keys(results).forEach(dimension => {
        const dimResults = results[dimension];
        ['L1', 'L2', 'L3'].forEach(level => {
          if (dimResults[level] > 0) {
            const key = `${dimension}_${level}`;
            termDocFreq.set(key, (termDocFreq.get(key) || 0) + 1);
          }
        });
      });
    });

    // 转换为文档频率映射
    termDocFreq.forEach((count, key) => {
      this.docFreq.set(key, count);
    });

    // 计算平均文档长度
    const totalLength = userMessages.reduce((sum, msg) => sum + (msg.text || '').length, 0);
    this.avgDocLength = totalLength / this.totalDocs || 0;
  }

  /**
   * 计算 IDF（逆文档频率）
   * @param {string} dimension - 维度标识
   * @param {string} level - 层级标识 (L1/L2/L3)
   * @returns {number} IDF 值
   */
  calculateIDF(dimension, level) {
    const key = `${dimension}_${level}`;
    const df = this.docFreq.get(key) || 1;
    const n = this.totalDocs;

    // BM25 的 IDF 公式：log((N - df + 0.5) / (df + 0.5) + 1)
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * 计算 BM25 得分
   * @param {Object} matchResults - 匹配结果 {L: {L1: 0, L2: 0, L3: 0}, ...}
   * @param {Object} termFrequencyMap - 词频映射 {termKey: count}
   * @param {number} docLength - 当前文档长度
   * @returns {Object} 各维度的原始得分
   */
  calculateScore(matchResults, termFrequencyMap, docLength) {
    const rawScores = {};

    Object.keys(matchResults).forEach(dimension => {
      const dimResults = matchResults[dimension];
      let dimensionScore = 0;

      ['L1', 'L2', 'L3'].forEach(level => {
        const count = dimResults[level];
        if (count > 0) {
          const baseWeight = WEIGHTS[level];
          const idf = this.calculateIDF(dimension, level);

          // BM25 词频饱和公式
          // TF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))
          const tf = count;
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
          const bm25TF = numerator / denominator;

          // 最终得分 = 基础权重 × IDF × BM25-TF
          dimensionScore += baseWeight * idf * bm25TF;
        }
      });

      rawScores[dimension] = dimensionScore;
    });

    return rawScores;
  }
}

// ==========================================
// 4. 扫描与匹配 (使用 AC 自动机)
// ==========================================

/**
 * 扫描并匹配文本，同时检测连击（逻辑+细腻同时命中）
 * 【2026-01-20 重写】使用 AC 自动机实现单次扫描匹配
 *
 * @param {Array} chatData - 聊天数据
 * @param {Object} patterns - 正则模式（保留兼容性，但不再使用）
 * @returns {Object} 匹配结果，包含连击信息和高频词统计
 */
function scanAndMatch(chatData, patterns) {
  const userMessages = chatData.filter(item => item.role === 'USER');

  // 【2026-01-27 V6.0 新增】字符数限制检查，防止 OOM
  let totalCharsBeforeLimit = 0;
  userMessages.forEach(msg => {
    totalCharsBeforeLimit += (msg.text || '').length;
  });
  
  // 如果总字符数超过限制，进行截断
  if (totalCharsBeforeLimit > MAX_ANALYSIS_CHARS) {
    console.warn(`[Worker] 文本总字符数 ${totalCharsBeforeLimit} 超过限制 ${MAX_ANALYSIS_CHARS}，进行截断`);
    // 按比例截断消息，保留前面的消息
    const ratio = MAX_ANALYSIS_CHARS / totalCharsBeforeLimit;
    const maxMessages = Math.max(1, Math.floor(userMessages.length * ratio));
    userMessages.splice(maxMessages);
  }

  let negativeWordCount = 0;
  let totalTextLength = 0;
  let estimatedWordCount = 0;
  let comboHits = 0; // 连击次数：同时命中 L 和 D 的片段数
  let hasRageWord = false; // 是否检测到负向咆哮词
  let ketaoCount = 0; // 【2026-01-27 V6.0】赛博磕头计数：命中"Feedback"维度中语义偏向"求助/请求"的频次
  let jiafangCount = 0; // 【2026-01-27 V6.0】甲方上身计数：指令性动词在总匹配中的占比加权
  let abuseCount = 0; // 【2026-01-27 新增】受虐倾向计数
  let teaseCount = 0; // 【2026-01-27 V6.0】调戏AI计数：语气助词、表情符号或非技术性调侃词的频次
  let nonsenseCount = 0; // 【2026-01-27 V6.0】废话输出计数：NOISE_WORDS 或短词重复出现的频次
  let slangCount = 0; // 【2026-01-27 新增】硅谷黑话计数
  let blackwordHits = {}; // 【2026-01-27 新增】黑话命中统计
  let chineseSlangHits = {}; // 【V6 新增】中文黑话（功德簿）
  let englishSlangHits = {}; // 【V6 新增】英文黑话（硅谷黑话）
  let abuseValue = 0; // 【V6 新增】受虐值：统计特定咆哮词/否定词频次
  let totalCodeChars = 0; // 【2026-01-27 新增】代码总字符数
  let minTs = null; // 【2026-01-27 新增】最小时间戳
  let maxTs = null; // 【2026-01-27 新增】最大时间戳
  
  // 【2026-01-27 V6.0 新增】连续重复消息检测
  let lastMessageText = null;
  let repeatMessageCount = 0;
  
  // 【V6 新增】受虐值关键词：特定咆哮词或否定词（如"重写"、"不对"）
  const ABUSE_VALUE_WORDS = {
    chinese: ['重写', '不对', '错了', '不行', '不对', '错误', '失败', '改', '改一下', '优化', '速度', '赶紧', '马上', '必须'],
    english: ['rewrite', 'wrong', 'incorrect', 'error', 'failed', 'fail', 'fix', 'rework', 'broken', 'must', 'immediately', 'ASAP', 'quickly']
  };
  const abuseValuePattern = {
    chinese: new RegExp(`(?:${ABUSE_VALUE_WORDS.chinese.join('|')})`, 'gi'),
    english: new RegExp(`\\b(?:${ABUSE_VALUE_WORDS.english.join('|')})\\b`, 'gi')
  };

  // 扩展负面词库 - 分为两级
  // 【新增】一级负面词（咆哮词）：一票否决，直接封顶60分
  const rageWords = [
    '垃圾', '笨', '智障', '滚', '废物', 'SB', '弱智',
    '闭嘴', 'shit', 'fucking', 'stupid', 'idiot', 'useless', 'trash'
  ];
  const ragePattern = new RegExp(`(?:${rageWords.join('|')})`, 'gi');

  // 二级负面词（一般负面）：正常扣分
  const negativeWords = [
    '不懂', '死机', '撤回', '错误', '失败', '问题', '崩溃', 'bug', 'error', 'fail'
  ];
  const negativePattern = new RegExp(`(?:${negativeWords.join('|')})`, 'gi');

  // 使用 AC 自动机搜索所有关键词
  let aggregatedResults = {
    L: { L1: 0, L2: 0, L3: 0 },
    P: { L1: 0, L2: 0, L3: 0 },
    D: { L1: 0, L2: 0, L3: 0 },
    E: { L1: 0, L2: 0, L3: 0 },
    F: { L1: 0, L2: 0, L3: 0 },
  };

  const wordFrequencyMap = {}; // 词频统计表
  const techStackHits = {}; // 【2026-01-27 新增】tech_stack 词频统计（仅 L1 和 L2）

  userMessages.forEach(msg => {
    let text = msg.text || '';
    if (!text || text.length < 2) return;

    // 【2026-01-27 新增】文本清洗：过滤纯符号词汇、移除 Diff 前缀
    text = sanitizeText(text);
    if (!text || text.length < 2) return; // 清洗后可能为空，需要再次检查

    // 【2026-01-27 V6.0 新增】连续重复消息检测
    const normalizedText = text.trim().toLowerCase();
    if (normalizedText === lastMessageText) {
      repeatMessageCount++;
      // 如果连续重复超过阈值，增加 nonsense_count
      if (repeatMessageCount >= V6_BEHAVIOR_THRESHOLDS.repeat_message_threshold) {
        nonsenseCount += repeatMessageCount;
      }
    } else {
      lastMessageText = normalizedText;
      repeatMessageCount = 0;
    }

    totalTextLength += text.length;

    // 【2026-01-27 V6.0】行为特征捕获（双语正则框架）
    // 注意：ketao_count 和 jiafang_count 会在 AC 自动机匹配后根据维度更新
    const ketaoMatches = (text.match(KETAO_REG) || []).length;
    const jiafangMatches = (text.match(JIAFANG_REG) || []).length;

    const abuseMatches = (text.match(ABUSE_REG) || []).length;
    abuseCount += abuseMatches;

    const teaseMatches = (text.match(TEASE_REG) || []).length;
    teaseCount += teaseMatches;

    // 【2026-01-27 V6.0】nonsense_count: NOISE_WORDS 或短词重复出现的频次
    const nonsenseMatches = (text.match(NONSENSE_REG) || []).length;
    nonsenseCount += nonsenseMatches;
    
    // 【2026-01-27 V6.0 新增】检测短词重复（如"嗯嗯"、"好好"、"对对"）
    const shortWordRepeatPattern = /(\S{1,2})\1{2,}/g; // 匹配1-2个字符重复3次以上
    const shortWordRepeats = (text.match(shortWordRepeatPattern) || []).length;
    nonsenseCount += shortWordRepeats;
    
    // 【2026-01-27 V6.0 新增】检测 NOISE_WORDS 在文本中的出现
    const words = text.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (NOISE_WORDS.has(word)) {
        nonsenseCount += 1; // 每个噪音词计数一次
      }
    });

    // 【2026-01-27 新增】硅谷黑话识别（SLANG_REG）
    const slangMatches = (text.match(SLANG_REG) || []).length;
    slangCount += slangMatches;
    
    // 【V6 新增】受虐值计算：统计特定咆哮词/否定词频次
    const chineseAbuseMatches = (text.match(abuseValuePattern.chinese) || []).length;
    const englishAbuseMatches = (text.match(abuseValuePattern.english) || []).length;
    abuseValue += (chineseAbuseMatches + englishAbuseMatches);
    
    // 【V6 优化】黑话命中统计：分为 chinese_slang 和 english_slang
    // 中文黑话（功德簿）
    const chineseBlackwords = ['功德', '善哉', '阿弥陀佛', '善', '功德无量', '福报', '积德'];
    chineseBlackwords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        chineseSlangHits[word] = (chineseSlangHits[word] || 0) + matches.length;
      }
    });
    
    // 英文黑话（硅谷黑话）- 保留原有逻辑
    SILICON_VALLEY_BLACKWORDS.forEach(blackword => {
      const regex = new RegExp(`\\b${blackword}\\b`, 'gi'); // 添加边界符
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        englishSlangHits[blackword] = (englishSlangHits[blackword] || 0) + matches.length;
        // 兼容旧格式
        blackwordHits[blackword] = (blackwordHits[blackword] || 0) + matches.length;
      }
    });

    // 【2026-01-27 新增】代码行占比计算（检测代码块）
    // 修复：确保只统计实际代码内容，不包括标记符号，并考虑代码关键字密度
    const codeBlockPattern = /```[\s\S]*?```/g; // 多行代码块
    const inlineCodePattern = /`[^`\n]+`/g; // 行内代码
    const codeKeywordPattern = /\b(function|class|const|let|var|import|export|return|if|else|for|while|switch|case|try|catch|async|await|=>|def|from|with|as|lambda|public|private|protected|static|interface|extends|implements)\b/gi;
    
    // 统计代码块字符数（移除标记符号，只统计实际代码内容）
    const codeBlocks = text.match(codeBlockPattern) || [];
    codeBlocks.forEach(block => {
      // 移除 ``` 标记，只计算实际代码内容
      const codeContent = block.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
      if (codeContent.length > 0) {
        totalCodeChars += codeContent.length;
      }
    });
    
    // 统计行内代码字符数（移除标记符号，避免重复计算）
    const inlineCodes = text.match(inlineCodePattern) || [];
    inlineCodes.forEach(code => {
      // 检查是否已在代码块中
      let isInBlock = false;
      for (const block of codeBlocks) {
        if (block.includes(code)) {
          isInBlock = true;
          break;
        }
      }
      if (!isInBlock) {
        // 移除 ` 标记，只计算实际代码内容
        const codeContent = code.replace(/`/g, '').trim();
        if (codeContent.length > 0) {
          totalCodeChars += codeContent.length;
        }
      }
    });
    
    // 统计代码关键字密度（作为补充，但需要排除已在代码块中的关键字）
    // 关键字密度最多贡献总文本长度的 30%（避免过度估计）
    let codeKeywordCount = 0;
    const keywords = text.match(codeKeywordPattern) || [];
    keywords.forEach(keyword => {
      const keywordIndex = text.indexOf(keyword, 0);
      let isInCode = false;
      // 检查是否在代码块或行内代码中
      for (const block of codeBlocks) {
        const blockStart = text.indexOf(block);
        if (keywordIndex >= blockStart && keywordIndex < blockStart + block.length) {
          isInCode = true;
          break;
        }
      }
      if (!isInCode) {
        for (const inline of inlineCodes) {
          const inlineStart = text.indexOf(inline);
          if (keywordIndex >= inlineStart && keywordIndex < inlineStart + inline.length) {
            isInCode = true;
            break;
          }
        }
      }
      // 如果不在代码块中，可能是自然语言提及，但也要考虑可能是代码片段
      // 这里采用保守策略：不在代码块中的关键字，按平均长度 8 字符估算
      if (!isInCode) {
        codeKeywordCount += 1;
      }
    });
    
    // 关键字密度贡献：每 10 个关键字贡献约 80 字符（平均关键字长度 8），最多贡献总文本的 30%
    const keywordCharEstimate = Math.min(codeKeywordCount * 8, text.length * 0.3);
    totalCodeChars += keywordCharEstimate;

    // 【2026-01-27 新增】时间维度计算
    if (msg.timestamp) {
      let ts = null;
      try {
        // 处理时间戳：可能是 ISO 字符串或数字
        if (typeof msg.timestamp === 'string') {
          ts = new Date(msg.timestamp).getTime();
        } else if (typeof msg.timestamp === 'number') {
          // 如果时间戳长度为 10 位（秒），则乘以 1000 转为毫秒
          ts = msg.timestamp.toString().length === 10 ? msg.timestamp * 1000 : msg.timestamp;
        }

        if (ts && !isNaN(ts)) {
          if (minTs === null || ts < minTs) {
            minTs = ts;
          }
          if (maxTs === null || ts > maxTs) {
            maxTs = ts;
          }
        }
      } catch (e) {
        // 防御性编程：时间戳解析失败时平滑跳过
        console.warn('[Worker] 时间戳解析失败:', e);
      }
    }

    // 【2026-01-27 新增】估算单词数：使用清洗后的文本
    // 中文按字符，英文按空格（过滤纯符号词汇）
    const enWords = text.split(/\s+/).filter(word => {
      // 过滤掉纯符号词汇（不含中文或英文字母）
      return /[\u4e00-\u9fa5a-zA-Z]/.test(word);
    }).length;
    const cnChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    estimatedWordCount += (cnChars + Math.max(0, enWords - 1));

    // 【新增】检测负向咆哮词 - 一票否决
    const rageMatches = text.match(ragePattern);
    if (rageMatches && rageMatches.length > 0) {
      hasRageWord = true;
    }

    // 匹配一般负面词
    const negativeMatches = text.match(negativePattern);
    if (negativeMatches) {
      negativeWordCount += negativeMatches.length;
    }

    // 【2026-01-20 更新】使用 AC 自动机 + N-Gram 上下文匹配
    // N-Gram 匹配：用于检测上下文反转（如"不+稳定"、"don't like"）
    const ngramResults = acAutomaton.searchWithNGram(text);

    // 单词匹配：用于统计词频
    const { results, termFrequencyMap: localTermFreqMap, techStackHits: localTechStackHits } = acAutomaton.searchWithTermFrequency(text);

    // 【2026-01-27 新增】累加 tech_stack 词频（仅 L1 和 L2）
    if (localTechStackHits) {
      Object.keys(localTechStackHits).forEach(word => {
        techStackHits[word] = (techStackHits[word] || 0) + localTechStackHits[word];
      });
    }

    // 【2026-01-27 V6.0 新增】根据维度匹配更新行为计数器
    let totalMatches = 0; // 总匹配数（用于 jiafang_count 占比计算）
    let instructionVerbMatches = 0; // 指令性动词匹配数

    // 累加匹配结果
    Object.keys(results).forEach(dimension => {
      const dimResults = results[dimension];
      ['L1', 'L2', 'L3'].forEach(level => {
        const matchCount = dimResults[level];
        aggregatedResults[dimension][level] += matchCount;
        totalMatches += matchCount;

        // 【2026-01-27 V6.0】ketao_count: 命中"Feedback"维度中语义偏向"求助/请求"的频次
        // F 维度通常包含反馈、请求、求助等语义，累加 F 维度的匹配次数
        if (dimension === 'F' && matchCount > 0) {
          ketaoCount += matchCount;
        }

        // 【2026-01-27 V6.0】jiafang_count: 指令性动词在总匹配中的占比加权
        // 指令性动词通常出现在 L（Logic）和 D（Detail）维度中
        if (dimension === 'L' || dimension === 'D') {
          instructionVerbMatches += matchCount;
        }

        // 累加词频统计
        Object.keys(localTermFreqMap).forEach(termKey => {
          if (termKey.startsWith(`${dimension}_${level}_`)) {
            wordFrequencyMap[termKey] = (wordFrequencyMap[termKey] || 0) + localTermFreqMap[termKey];
          }
        });
      });
    });

    // 【2026-01-27 V6.0】计算 jiafang_count 占比加权
    // 基础计数：正则匹配到的指令性动词
    jiafangCount += jiafangMatches;
    // 占比加权：如果指令性动词在总匹配中占比高，则加权放大
    if (totalMatches > 0) {
      const jiafangRatio = instructionVerbMatches / totalMatches;
      jiafangCount += Math.round(jiafangRatio * jiafangMatches * 5); // 加权放大
    }
    
    // 【2026-01-27 V6.0】ketao_count: 基础计数（正则匹配）+ F 维度匹配
    ketaoCount += ketaoMatches;

    // 维度匹配，同时检测连击
    let hasLogic = results.L.L1 + results.L.L2 + results.L.L3 > 0;
    let hasDetail = results.D.L1 + results.D.L2 + results.D.L3 > 0;

    // 如果同时命中逻辑和细腻，记录连击
    if (hasLogic && hasDetail) {
      comboHits++;
    }
  });

  // 统计每个关键词的总命中次数（用于 BM25）
  const termTotalFreq = {};
  Object.keys(wordFrequencyMap).forEach(termKey => {
    // 提取维度和层级信息
    const parts = termKey.split('_');
    if (parts.length >= 2) {
      const dimLevelKey = `${parts[0]}_${parts[1]}`;
      termTotalFreq[dimLevelKey] = (termTotalFreq[dimLevelKey] || 0) + wordFrequencyMap[termKey];
    }
  });

  // 防止分母为0
  estimatedWordCount = Math.max(100, estimatedWordCount);
  totalTextLength = Math.max(1, totalTextLength);

  // 【2026-01-27 新增】计算 work_days（工作天数）
  let workDays = 1; // 默认至少为 1
  if (minTs !== null && maxTs !== null && maxTs > minTs) {
    workDays = Math.max(1, Math.ceil((maxTs - minTs) / 86400000)); // 86400000 毫秒 = 1 天
  }

  // 【2026-01-27 新增】语义指纹计算
  // 代码行占比：代码字符数 / 总字符数
  let codeRatio = totalTextLength > 0 ? (totalCodeChars / totalTextLength) : 0;
  
  // 【修复代码占比为0的问题】降级处理：当总字符数 > 5000 且 codeRatio 为 0 时，给出保底分数
  if (totalTextLength > 5000 && codeRatio === 0) {
    // 重新扫描所有消息，统计代码关键词密度
    let totalKeywordCount = 0;
    const codeKeywordPattern = /\b(function|class|const|let|var|import|export|return|if|else|for|while|switch|case|try|catch|async|await|=>|def|from|with|as|lambda|public|private|protected|static|interface|extends|implements|type|interface|enum|namespace|module|require|export|default)\b/gi;
    
    userMessages.forEach(msg => {
      const text = msg.text || '';
      if (text && text.length > 0) {
        const matches = text.match(codeKeywordPattern);
        if (matches) {
          totalKeywordCount += matches.length;
        }
      }
    });
    
    // 基于关键词密度计算保底分数（每1000字至少1个关键词 = 1%保底）
    const keywordDensity = totalKeywordCount / (totalTextLength / 1000);
    const fallbackRatio = Math.min(keywordDensity / 100, 0.15); // 最多15%保底
    
    if (fallbackRatio > 0) {
      codeRatio = fallbackRatio;
      console.log('[Worker] ⚠️ 代码占比为0，应用保底分数:', {
        totalTextLength,
        totalCodeChars,
        totalKeywordCount,
        keywordDensity,
        fallbackRatio,
        finalCodeRatio: codeRatio
      });
    }
  }
  
  // 消息反馈密度：总消息数 / 工作天数
  const feedbackDensity = workDays > 0 ? (userMessages.length / workDays) : userMessages.length;
  
  // 【2026-01-27 新增】技术多样性：techStackHits 中不同 Key 的数量
  const diversityScore = Object.keys(techStackHits).length;
  
  // 【2026-01-27 新增】黑话命中总数
  const totalSlangCount = slangCount + Object.values(blackwordHits).reduce((sum, count) => sum + count, 0);
  
  // 【2026-01-27 新增】交互风格指数（Interaction Style Index）
  // style_index = totalChars / (totalMessages || 1)
  // > 100: "雄辩家"（长篇大论型）
  // < 20: "冷酷极客"（简洁指令型）
  const styleIndex = (totalTextLength / (userMessages.length || 1));

  return {
    matchResults: aggregatedResults,
    negativeWordCount,
    totalTextLength,
    estimatedWordCount,
    messageCount: userMessages.length,
    comboHits, // 连击次数
    hasRageWord, // 【新增】是否有咆哮词
    wordFrequencyMap: termTotalFreq, // 【新增】词频统计
    ketaoCount, // 【2026-01-27 新增】赛博磕头计数
    jiafangCount, // 【2026-01-27 新增】甲方上身计数
    abuseCount, // 【2026-01-27 新增】受虐倾向计数
    abuseValue, // 【V6 新增】受虐值：特定咆哮词/否定词频次
    teaseCount, // 【2026-01-27 新增】调戏AI计数
    nonsenseCount, // 【2026-01-27 新增】废话输出计数
    slangCount, // 【2026-01-27 新增】硅谷黑话计数
    blackwordHits, // 【2026-01-27 新增】黑话命中统计（兼容旧格式）
    chineseSlangHits, // 【V6 新增】中文黑话（功德簿）
    englishSlangHits, // 【V6 新增】英文黑话（硅谷黑话）
    techStackHits, // 【2026-01-27 新增】tech_stack 词频统计（仅 L1 和 L2）
    workDays, // 【2026-01-27 新增】工作天数
    codeRatio, // 【2026-01-27 新增】代码行占比
    feedbackDensity, // 【2026-01-27 新增】消息反馈密度
    diversityScore, // 【2026-01-27 新增】技术多样性
    totalSlangCount, // 【2026-01-27 新增】黑话命中总数
    styleIndex, // 【2026-01-27 新增】交互风格指数
    tag_cloud_data: flattenBlackwordHits( // 【V6.0 新增】扁平化词云数据
      {
        chinese_slang: chineseSlangHits || {},
        english_slang: englishSlangHits || {},
      },
      totalSlangCount || 1
    ),
  };
}

// ==========================================
// 5. 第一维：密度窗口 (Density Windowing)
// ==========================================

/**
 * 计算置信度系数
 * 使用 Math.atan(TotalChars / 500) 作为置信度权重
 * - 总字数不足 500 字：分数向 50 分强制收缩
 * - 超过 2000 字：完全释放密度得分
 *
 * @param {number} totalChars - 总字符数
 * @returns {number} 置信度系数 (0-1)
 */
function calculateConfidenceCoefficient(totalChars) {
  if (totalChars >= DENSITY_WINDOW.FULL_RELEASE_CHARS) {
    return 1.0; // 完全释放
  }

  if (totalChars < DENSITY_WINDOW.MIN_CHARS) {
    // 使用 atan 函数：当字数很少时，系数接近 0，强制收缩到 50 分
    // atan(500/500) ≈ 0.785，我们归一化到 0-1 范围
    const atanValue = Math.atan(totalChars / DENSITY_WINDOW.MIN_CHARS);
    // 归一化：atan(1) = π/4 ≈ 0.785，我们将其映射到 0-0.5 范围
    return (atanValue / (Math.PI / 2)) * 0.5; // 最大 0.5，强制收缩
  }

  // 500-2000 字之间：线性插值
  const ratio = (totalChars - DENSITY_WINDOW.MIN_CHARS) /
                (DENSITY_WINDOW.FULL_RELEASE_CHARS - DENSITY_WINDOW.MIN_CHARS);
  return 0.5 + ratio * 0.5; // 从 0.5 线性增长到 1.0
}

/**
 * 计算每千字有效载荷（Weighted Hits per 1k Characters）
 *
 * @param {number} weightedHits - 加权命中数
 * @param {number} totalChars - 总字符数
 * @param {number} confidenceCoeff - 置信度系数
 * @returns {number} 密度得分（已应用置信度）
 */
function calculateDensityScore(weightedHits, totalChars, confidenceCoeff) {
  if (totalChars === 0) return 0;

  // 计算每千字有效载荷
  const density = (weightedHits / totalChars) * 1000;

  // 应用置信度系数
  return density * confidenceCoeff;
}

// ==========================================
// 6. 第二维：排位分梯队 (Tiered Normalization)
// ==========================================

/**
 * 使用改进的 Sigmoid 曲线进行排位分梯队映射
 * 【2026-01-14 重写】引入段位边际阻力 (Tiered Hardness)
 *
 * 分段锁定：
 * - 40-65 分（青铜/白银）：增长较快
 * - 65-80 分（黄金/铂金）：正常增长
 * - 80+ 分（钻石/王者）：【新增】空气阻力，使用 S_final = 80 + (S - 80)^0.6
 *   效果：从90分升到95分的难度 = 从40分升到45分的10倍以上
 *
 * @param {number} density - 密度得分（每千字有效载荷）
 * @param {string} dimension - 维度标识
 * @returns {number} 归一化分数 (0-100)
 */
function normalizeScores(density, dimension) {
  const config = SCORING_CONFIG[dimension];

  // 基础 Sigmoid 函数: f(x) = 100 / (1 + e^(-k * (x - x0)))
  // x: 当前密度
  // x0 (midpoint): 行业平均密度 (50分位置) - 已大幅提升门槛
  // k (steepness): 曲线陡峭度
  const sigmoidValue = 1 / (1 + Math.exp(-config.steepness * (density - config.midpoint)));
  let score = sigmoidValue * 100;

  // 【2026-01-14 新增】段位边际阻力 (Tiered Hardness)
  // 在 80 分以后设置"空气阻力"
  if (score > 80) {
    const overflow = score - 80; // 超出 80 分的部分
    // 应用公式: S_final = 80 + (S - 80)^0.6
    // 指数 0.6 使得：
    // - 90 → 85.2 (衰减 4.8分)
    // - 95 → 87.9 (衰减 7.1分)
    // - 100 → 89.8 (衰减 10.2分)
    const compressedOverflow = Math.pow(overflow, 0.6);
    score = 80 + compressedOverflow;
  } else if (score > 65) {
    // 黄金/铂金段位（65-80）：正常增长，轻微压缩
    const overflow = score - 65;
    score = 65 + overflow * 0.95; // 压缩到 95% 的增长速度
  } else if (score < 40) {
    // 青铜段位（<40）：确保最低分不低于 10
    score = Math.max(10, score);
  } else if (score <= 65) {
    // 青铜/白银段位（40-65）：增长较快，使用轻微加速
    const normalized = (score - 40) / 25; // 归一化到 0-1
    score = 40 + normalized * 25 * 1.1; // 加速 10%
  }

  return Math.max(10, Math.min(100, score));
}

// ==========================================
// 7. 第三维：语义权重矩阵 (Semantic Matrix) + BM25
// ==========================================

/**
 * 计算原始加权得分（应用语义权重矩阵 + 连击加成 + BM25）
 * 【2026-01-20 重写】使用 BM25 算法替代简单累加
 *
 * @param {Object} matchResults - 匹配结果
 * @param {number} comboHits - 连击次数（同时命中逻辑和细腻的片段数）
 * @param {Object} wordFrequencyMap - 词频统计表
 * @param {number} docLength - 当前文档长度
 * @returns {Object} 各维度的原始加权得分
 */
function calculateRawScores(matchResults, comboHits, wordFrequencyMap, docLength) {
  // 【2026-01-20 新增】使用 BM25 评分器计算得分
  const rawScores = bm25Scorer.calculateScore(matchResults, wordFrequencyMap, docLength);

  // 应用连击加成：如果存在连击，对逻辑(L)和细腻(D)维度给予加成
  if (comboHits > 0) {
    // 连击加成系数：基础 1.2，根据连击次数微调
    const comboMultiplier = 1.0 + (COMBO_BONUS - 1.0) * Math.min(1.0, comboHits / 10);

    if (rawScores.L > 0) {
      rawScores.L *= comboMultiplier;
    }
    if (rawScores.D > 0) {
      rawScores.D *= comboMultiplier;
    }
  }

  return rawScores;
}

/**
 * 特征锐化 (Trait Sharpening)
 * 如果用户的五个维度得分都差不多（比如全是 55-65），这个函数会
 * 压低低分项，抬高高分项，强制制造"偏科"效果，让画像更鲜明。
 */
function sharpenTraits(scores) {
  const values = Object.values(scores);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // 计算标准差
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // 如果标准差很小（说明特征不明显），则进行锐化
  // 阈值设为 15，如果标准差小于 15，说明各项得分太接近了
  if (stdDev < 15) {
    const sharpened = {};
    const contrastFactor = 1.5; // 对比度增强系数

    Object.keys(scores).forEach(key => {
      let val = scores[key];
      // 以 50 分为轴心进行拉伸
      let newVal = 50 + (val - 50) * contrastFactor;
      sharpened[key] = Math.max(10, Math.min(95, newVal)); // 限制在 10-95 之间
    });
    return sharpened;
  }

  return scores;
}

/**
 * 【2026-01-27 新增】计算维度平衡度 (Balance Score)
 * 计算5个维度（LPDEF）的标准差，标准差越小，证明开发者能力越均衡
 * 平衡度 = Math.max(0, 100 - (StdDev * 2))
 * 
 * @param {Object} scores - 各维度得分 {L: 80, P: 75, D: 70, E: 65, F: 60}
 * @returns {number} 平衡度分数 (0-100)
 */
function calculateBalanceScore(scores) {
  const dimensions = ['L', 'P', 'D', 'E', 'F'];
  const values = dimensions.map(dim => scores[dim] || 0);
  
  // 计算平均值
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  // 计算标准差
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  // 平衡度 = Math.max(0, 100 - (StdDev * 2))
  // 标准差为 0 时，平衡度为 100（完全均衡）
  // 标准差为 50 时，平衡度为 0（极度偏科）
  const balanceScore = Math.max(0, 100 - (stdDev * 2));
  
  return Math.round(balanceScore * 100) / 100; // 保留2位小数
}

/**
 * 【2026-01-27 V6.0 新增】计算 Vibe Score（综合 Vibe 指数）
 * 基于 5 维加权后的综合指数
 * 公式：vibe_score = (L * 0.25 + P * 0.20 + D * 0.25 + E * 0.15 + F * 0.15)
 * 
 * @param {Object} dimensions - 各维度得分 {L: 80, P: 75, D: 70, E: 65, F: 60}
 * @returns {number} Vibe Score (0-100)
 */
function calculateVibeScore(dimensions) {
  const weights = {
    L: 0.25, // Logic 权重 25%
    P: 0.20, // Patience 权重 20%
    D: 0.25, // Detail 权重 25%
    E: 0.15, // Exploration 权重 15%
    F: 0.15  // Feedback 权重 15%
  };
  
  let vibeScore = 0;
  Object.keys(weights).forEach(dim => {
    const score = dimensions[dim] || 0;
    vibeScore += score * weights[dim];
  });
  
  return Math.round(vibeScore * 100) / 100; // 保留2位小数
}

// ==========================================
// 8. 主逻辑：计算与处理
// ==========================================

self.onmessage = function(e) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT':
        dimensionData = payload;

        // 【2026-01-20 新增】在初始化阶段构建 AC 自动机和 BM25 评分器
        console.log('[Worker] 开始构建 AC 自动机...');
        acAutomaton = buildACAutomaton(dimensionData);
        console.log('[Worker] AC 自动机构建完成');

        // BM25 评分器需要在分析时初始化（需要文档频率）
        bm25Scorer = new BM25Scorer(BM25_CONFIG.k1, BM25_CONFIG.b);

        self.postMessage({ type: 'INIT_SUCCESS', payload: { message: 'Worker Ready (v3.0)' } });
        break;

      case 'ANALYZE':
        (async function () {
          try {
          if (!acAutomaton || !bm25Scorer) throw new Error('Worker未初始化');
          var chatData = payload.chatData;
          var levelKeywords = payload.levelKeywords;

          var userTextForCloud = (Array.isArray(chatData) ? chatData : [])
          .filter((m) => {
            const r = String(m?.role || '').toUpperCase();
            return r === 'USER' || r === 'HUMAN' || r === 'U' || r === '';
          })
          .map((m) => String(m?.text || m?.content || '').trim())
          .filter(Boolean)
          .join('\n');

        console.log('[Worker] 用户文本长度:', userTextForCloud.length);
        console.log('[Worker] 词库状态:', levelKeywords ? {
          Novice: levelKeywords.Novice?.length || 0,
          Professional: levelKeywords.Professional?.length || 0,
          Architect: levelKeywords.Architect?.length || 0
        } : '未提供');

        var identityLevelCloud = userTextForCloud.length > 150000
          ? await computeIdentityLevelCloudAsync(userTextForCloud, levelKeywords)
          : computeIdentityLevelCloud(userTextForCloud, levelKeywords);
        
        console.log('[Worker] identityLevelCloud 计算结果:', {
          Novice: Array.isArray(identityLevelCloud.Novice) ? identityLevelCloud.Novice.length : 0,
          Professional: Array.isArray(identityLevelCloud.Professional) ? identityLevelCloud.Professional.length : 0,
          Architect: Array.isArray(identityLevelCloud.Architect) ? identityLevelCloud.Architect.length : 0,
          native: Array.isArray(identityLevelCloud.native) ? identityLevelCloud.native.length : 0
        });

        // 【2026-01-20 新增】初始化 BM25 文档频率
        bm25Scorer.initDocFreq(chatData, acAutomaton);

        // ==========================================
        // 步骤 1: 扫描匹配（使用 AC 自动机 + 连击检测 + 词频统计）
        // ==========================================
        const scanResult = scanAndMatch(chatData, null);
        const {
          matchResults,
          negativeWordCount,
          totalTextLength,
          estimatedWordCount,
          comboHits,
          hasRageWord, // 【新增】是否有咆哮词
          wordFrequencyMap, // 【新增】词频统计
          ketaoCount, // 【2026-01-27 新增】赛博磕头计数
          jiafangCount, // 【2026-01-27 新增】甲方上身计数
          abuseCount, // 【2026-01-27 新增】受虐倾向计数
          abuseValue, // 【V6 新增】受虐值：特定咆哮词/否定词频次
          teaseCount, // 【2026-01-27 新增】调戏AI计数
          nonsenseCount, // 【2026-01-27 新增】废话输出计数
          slangCount, // 【2026-01-27 新增】硅谷黑话计数
          blackwordHits, // 【2026-01-27 新增】黑话命中统计（兼容旧格式）
          chineseSlangHits, // 【V6 新增】中文黑话（功德簿）
          englishSlangHits, // 【V6 新增】英文黑话（硅谷黑话）
          techStackHits, // 【2026-01-27 新增】tech_stack 词频统计
          workDays, // 【2026-01-27 新增】工作天数
          codeRatio, // 【2026-01-27 新增】代码行占比
          feedbackDensity, // 【2026-01-27 新增】消息反馈密度
          diversityScore, // 【2026-01-27 新增】技术多样性
          totalSlangCount, // 【2026-01-27 新增】黑话命中总数
          styleIndex, // 【2026-01-27 新增】交互风格指数
          messageCount // 消息数量
        } = scanResult;

        // ==========================================
        // 步骤 2: 计算原始加权得分（BM25 + 连击加成）
        // ==========================================
        const rawScores = calculateRawScores(
          matchResults,
          comboHits,
          wordFrequencyMap,
          totalTextLength / estimatedWordCount // 平均文档长度
        );

        // ==========================================
        // 步骤 3: 计算置信度系数（密度窗口）
        // ==========================================
        const confidenceCoeff = calculateConfidenceCoefficient(totalTextLength);

        // ==========================================
        // 步骤 4: 计算密度得分并归一化（排位分梯队 + 段位边际阻力）
        // ==========================================
        let normalizedScores = {};
        Object.keys(rawScores).forEach(dimension => {
          // 计算每千字有效载荷（应用置信度系数）
          const densityScore = calculateDensityScore(
            rawScores[dimension],
            totalTextLength,
            confidenceCoeff
          );

          // 使用排位分梯队映射（80+分后应用空气阻力）
          normalizedScores[dimension] = normalizeScores(densityScore, dimension);
        });

        // ==========================================
        // 步骤 5: 特殊处理 P (Patience) 维度
        // 【2026-01-14 重写】引入差评一票否决 (Critical Tolerance)
        // ==========================================
        // Patience 默认应该是满分，随着负面词密度的增加而扣分
        const negativeDensity = (negativeWordCount / totalTextLength) * 1000;
        // 负面词密度每增加 1，扣掉 15 分，最低 10 分
        let patienceScore = Math.max(10, 95 - (negativeDensity * 15));

        // 如果 P 的 regex 匹配（正面词）很高，可以适当回补，但不能超过 100
        const patienceBonus = normalizedScores.P * 0.2; // 正面词贡献较小
        patienceScore = Math.min(100, patienceScore + patienceBonus);

        // 【新增】差评一票否决机制
        // 如果检测到"负向咆哮词"（垃圾、智障、傻逼等），直接将P维度封顶在60分（及格线）
        if (hasRageWord) {
          patienceScore = Math.min(60, patienceScore);
        }

        normalizedScores.P = patienceScore;

        // ==========================================
        // 步骤 6: 特征锐化 (拉开差距)
        // ==========================================
        normalizedScores = sharpenTraits(normalizedScores);

        // ==========================================
        // 步骤 7: 计算维度平衡度 (Balance Score) 和 Vibe Score
        // 【2026-01-27 新增】在 LPDEF 分数计算完成后计算平衡度
        // 【2026-01-27 V6.0 新增】计算综合 Vibe 指数
        // ==========================================
        const balanceScore = calculateBalanceScore(normalizedScores);
        const vibeScore = calculateVibeScore(normalizedScores);

        // ==========================================
        // 步骤 8: 取整并生成元数据
        // ==========================================
        Object.keys(normalizedScores).forEach(key => {
          normalizedScores[key] = Math.round(normalizedScores[key]);
        });

        // 计算各维度的密度（用于调试和元数据）
        const densityMap = {};
        Object.keys(rawScores).forEach(k => {
          densityMap[k] = ((rawScores[k] / totalTextLength) * 1000).toFixed(2);
        });

        // 【2026-01-27 新增】计算交互风格标签
        let styleLabel = '标准型'; // 默认标签
        if (styleIndex > 100) {
          styleLabel = '雄辩家'; // 长篇大论型
        } else if (styleIndex < 20) {
          styleLabel = '冷酷极客'; // 简洁指令型
        }

        // 【2026-01-27 V6.0 新增】构建 stats 字段（V6 接口标准）
        // 确保完整覆盖前端 main.js 中 V6_METRIC_CONFIG 所需的离散计数器
        const stats = {
          // 核心计数器（必需字段）
          ketao_count: ketaoCount, // 【V6.0】赛博磕头：命中"Feedback"维度中语义偏向"求助/请求"的频次
          jiafang_count: jiafangCount, // 【V6.0】甲方上身：指令性动词在总匹配中的占比加权
          tease_count: teaseCount, // 【V6.0】调戏AI：语气助词、表情符号或非技术性调侃词的频次
          nonsense_count: nonsenseCount, // 【V6.0】废话输出：NOISE_WORDS 或短词重复出现的频次
          abuse_value: abuseValue, // 【V6.0】受虐值：特定咆哮词/否定词频次
          
          // 扩展字段
          totalChars: totalTextLength,
          totalMessages: messageCount,
          abuse_count: abuseCount, // 受虐倾向（保留兼容性）
          tech_stack: techStackHits || {}, // 格式：{"React": 5, "Rust": 2}
          work_days: workDays,
          code_ratio: Math.round(codeRatio * 100) / 100, // 代码行占比（保留2位小数）
          feedback_density: Math.round(feedbackDensity * 100) / 100, // 消息反馈密度（保留2位小数）
          balance_score: balanceScore, // 【2026-01-27 新增】维度平衡度
          diversity_score: diversityScore, // 【2026-01-27 新增】技术多样性
          slang_count: totalSlangCount, // 【2026-01-27 新增】黑话命中总数
          style_index: Math.round(styleIndex * 100) / 100, // 【2026-01-27 新增】交互风格指数（保留2位小数）
          style_label: styleLabel, // 【2026-01-27 新增】交互风格标签
          avg_payload: Math.round(totalTextLength / (messageCount || 1)),
          vibe_score: vibeScore, // 【2026-01-27 V6.0 新增】基于5维加权后的综合 Vibe 指数
          
          // 【V6 优化】黑话命中统计：分为 chinese_slang 和 english_slang
          blackword_hits: {
            chinese_slang: chineseSlangHits || {}, // 中文黑话（功德簿）
            english_slang: englishSlangHits || {}, // 英文黑话（硅谷黑话）
            // 兼容旧格式
            ...(blackwordHits || {})
          },
          // 【V6.0 新增】扁平化词云数据（用于前端词云展示）
          tag_cloud_data: flattenBlackwordHits(
            {
              chinese_slang: chineseSlangHits || {},
              english_slang: englishSlangHits || {},
            },
            totalSlangCount || 1
          ),
          // 【三身份级别词云】Novice/Professional/Architect 词频 Map
          identityLevelCloud,
        };

        // 分析结束后打印命中统计，便于排查「有数据但前端无展示」的传输问题
        console.log('[Worker] 最终命中统计:', {
          identityLevelCloud: {
            Novice: (identityLevelCloud.Novice && identityLevelCloud.Novice.length) || 0,
            Professional: (identityLevelCloud.Professional && identityLevelCloud.Professional.length) || 0,
            Architect: (identityLevelCloud.Architect && identityLevelCloud.Architect.length) || 0,
            native: (identityLevelCloud.native && identityLevelCloud.native.length) || 0
          }
        });

        // 返回结果（identityLevelCloud 置于 payload 根以便主线程直接读取）
        self.postMessage({
          type: 'ANALYZE_SUCCESS',
          payload: {
            dimensions: normalizedScores,
            rawScores, // 仅供调试
            stats, // 【2026-01-27 新增】V6 接口标准 stats 字段
            identityLevelCloud,
            metadata: {
              wordCount: estimatedWordCount,
              totalChars: totalTextLength,
              negativeCount: negativeWordCount,
              comboHits, // 连击次数
              hasRageWord, // 【新增】是否触发咆哮词一票否决
              confidenceCoeff: confidenceCoeff.toFixed(3), // 置信度系数
              density: Object.keys(densityMap).map(k => `${k}:${densityMap[k]}`).join(', '),
              algorithmVersion: '2026-01-27-v6.0', // 【2026-01-27 V6.0 更新】算法版本标识
              bm25Config: BM25_CONFIG, // 【新增】BM25 参数
            },
            // 注意：全局平均值不再在 Worker 中硬编码，由主线程从后端 API 获取
            // globalAverage 将在主线程中通过 fetchGlobalAverage() 获取并注入到 vibeResult 中
          },
        });
          } catch (innerErr) {
            self.postMessage({ type: 'ERROR', payload: { message: innerErr && innerErr.message ? innerErr.message : String(innerErr) } });
          }
        })();
        break;

      default:
        throw new Error(`未知类型: ${type}`);
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: error.message } });
  }
};
