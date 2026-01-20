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
  L: { midpoint: 35, steepness: 0.15 }, // 逻辑：极其严苛，顶级难度
  P: { midpoint: 18, steepness: 0.3 },  // 耐心：大幅提升门槛
  D: { midpoint: 28, steepness: 0.2 },  // 细节：极高要求
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
 * 【2026-01-20 新增】稀有度分值（IDF 模拟值）
 * 专业词汇权重大于通用词汇
 */
const RARITY_SCORES = {
  L1: 5.0, // 专家词/神谕词（如"幂等性"、"依赖反转"）
  L2: 2.0, // 中等词（如"初始化"、"队列"）
  L3: 1.0, // 常用词/噪音词（如"先"、"然后"）
};

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
   * 搜索关键词（单次扫描，O(n) 复杂度）
   */
  search(text) {
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

          // 避免同一位置重复计数（防止短词覆盖长词）
          const posKey = `${key}_${i}`;
          if (!matchedPositions.has(posKey)) {
            results[matchNode.dimension][matchNode.level]++;
            matchedPositions.add(posKey);
          }
        }
      }
    }

    return results;
  }

  /**
   * 统计每个关键词的命中次数（用于 BM25 计算）
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

    if (!this.isBuilt) {
      return { results, termFrequencyMap };
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
          const posKey = `${key}_${i}`;

          if (!matchedPositions.has(posKey)) {
            results[matchNode.dimension][matchNode.level]++;

            // 统计词频
            const termKey = `${key}_${matchNode.term}`;
            termFrequencyMap[termKey] = (termFrequencyMap[termKey] || 0) + 1;

            matchedPositions.add(posKey);
          }
        }
      }
    }

    return { results, termFrequencyMap };
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

  let negativeWordCount = 0;
  let totalTextLength = 0;
  let estimatedWordCount = 0;
  let comboHits = 0; // 连击次数：同时命中 L 和 D 的片段数
  let hasRageWord = false; // 是否检测到负向咆哮词

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

  userMessages.forEach(msg => {
    const text = msg.text || '';
    if (!text || text.length < 2) return;

    totalTextLength += text.length;

    // 估算单词数：中文按字符，英文按空格
    const enWords = text.split(/\s+/).length;
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

    // 【2026-01-20 重写】使用 AC 自动机进行关键词匹配
    const { results, termFrequencyMap: localTermFreqMap } = acAutomaton.searchWithTermFrequency(text);

    // 累加匹配结果
    Object.keys(results).forEach(dimension => {
      const dimResults = results[dimension];
      ['L1', 'L2', 'L3'].forEach(level => {
        aggregatedResults[dimension][level] += dimResults[level];

        // 累加词频统计
        Object.keys(localTermFreqMap).forEach(termKey => {
          if (termKey.startsWith(`${dimension}_${level}_`)) {
            wordFrequencyMap[termKey] = (wordFrequencyMap[termKey] || 0) + localTermFreqMap[termKey];
          }
        });
      });
    });

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

  return {
    matchResults: aggregatedResults,
    negativeWordCount,
    totalTextLength,
    estimatedWordCount,
    messageCount: userMessages.length,
    comboHits, // 连击次数
    hasRageWord, // 【新增】是否有咆哮词
    wordFrequencyMap: termTotalFreq, // 【新增】词频统计
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
        if (!acAutomaton || !bm25Scorer) throw new Error('Worker未初始化');
        const { chatData } = payload;

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
          wordFrequencyMap // 【新增】词频统计
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
        // 步骤 7: 取整并生成元数据
        // ==========================================
        Object.keys(normalizedScores).forEach(key => {
          normalizedScores[key] = Math.round(normalizedScores[key]);
        });

        // 计算各维度的密度（用于调试和元数据）
        const densityMap = {};
        Object.keys(rawScores).forEach(k => {
          densityMap[k] = ((rawScores[k] / totalTextLength) * 1000).toFixed(2);
        });

        // 返回结果
        self.postMessage({
          type: 'ANALYZE_SUCCESS',
          payload: {
            dimensions: normalizedScores,
            rawScores, // 仅供调试
            metadata: {
              wordCount: estimatedWordCount,
              totalChars: totalTextLength,
              negativeCount: negativeWordCount,
              comboHits, // 连击次数
              hasRageWord, // 【新增】是否触发咆哮词一票否决
              confidenceCoeff: confidenceCoeff.toFixed(3), // 置信度系数
              density: Object.keys(densityMap).map(k => `${k}:${densityMap[k]}`).join(', '),
              algorithmVersion: '2026-01-20-v3.0', // 【新增】算法版本标识
              bm25Config: BM25_CONFIG, // 【新增】BM25 参数
            },
            // 调整后的全局基准，用于雷达图对比
            globalAverage: { L: 50, P: 60, D: 50, E: 40, F: 55 }
          },
        });
        break;

      default:
        throw new Error(`未知类型: ${type}`);
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: error.message } });
  }
};
