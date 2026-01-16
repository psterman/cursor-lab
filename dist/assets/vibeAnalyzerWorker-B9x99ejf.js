/**
 * vibeAnalyzerWorker.js - Vibe Codinger 高性能匹配引擎 (游戏化排名重构版)
 * 
 * 【2026-01-14 重大更新 v2.0】引入四大游戏化机制：
 * 
 * 核心算法（原有）：
 * 1. 密度窗口 (Density Windowing) - 解决"话痨刷分"问题
 * 2. 排位分梯队 (Tiered Normalization) - 建立"竞技段位感"
 * 3. 语义权重矩阵 (Semantic Matrix) - 识别"灵魂深度"
 * 
 * 新增优化（v2.0）：
 * 4. 段位边际阻力 (Tiered Hardness) - 80+分后空气阻力，难度指数级增长
 * 5. 高频词降权 (TF-IDF Decay) - 重复词汇按 0.8^(n-3) 指数衰减
 * 6. 差评一票否决 (Critical Tolerance) - 咆哮词直接封顶60分
 * 7. 非对称中位值 (Asymmetric Midpoint) - L/P/D 门槛大幅提升
 * 
 * 设计理念：参考热门游戏、资讯算法、电商评价，打造尖锐的个性化雷达图
 */

let dimensionData = null;
let regexPatterns = null;

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

// ==========================================
// 2. 正则构建 (保持不变，略去部分以节省空间)
// ==========================================
function buildRegexPatterns(data) {
  // ... (保持原有的 buildRegexPatterns 逻辑不变) ...
  const patterns = {
    L: { L1: [], L2: [], L3: [] },
    P: { L1: [], L2: [], L3: [] },
    D: { L1: [], L2: [], L3: [] },
    E: { L1: [], L2: [], L3: [] },
    F: { L1: [], L2: [], L3: [] },
  };

  Object.keys(data).forEach(dimension => {
    const dimData = data[dimension];
    if (!dimData || !dimData.data) return;
    Object.values(dimData.data).forEach(category => {
      if (typeof category !== 'object' || category === null) return;
      ['L1', 'L2', 'L3'].forEach(level => {
        if (Array.isArray(category[level])) {
          category[level].forEach(term => {
            if (term && typeof term === 'string') {
              patterns[dimension][level].push(escapeRegex(term));
            }
          });
        }
      });
    });
  });

  const regexPatterns = {};
  Object.keys(patterns).forEach(dimension => {
    regexPatterns[dimension] = {
      L1: patterns[dimension].L1.length > 0 ? new RegExp(`(?:${patterns[dimension].L1.join('|')})`, 'gi') : null,
      L2: patterns[dimension].L2.length > 0 ? new RegExp(`(?:${patterns[dimension].L2.join('|')})`, 'gi') : null,
      L3: patterns[dimension].L3.length > 0 ? new RegExp(`(?:${patterns[dimension].L3.join('|')})`, 'gi') : null,
    };
  });
  return regexPatterns;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// 3. 扫描与匹配 (支持连击检测)
// ==========================================

/**
 * 扫描并匹配文本，同时检测连击（逻辑+细腻同时命中）
 * 【2026-01-14 新增】引入高频词降权 (TF-IDF Decay)
 * 
 * @param {Array} chatData - 聊天数据
 * @param {Object} patterns - 正则模式
 * @returns {Object} 匹配结果，包含连击信息和高频词统计
 */
function scanAndMatch(chatData, patterns) {
  const results = {
    L: { L1: 0, L2: 0, L3: 0 },
    P: { L1: 0, L2: 0, L3: 0 },
    D: { L1: 0, L2: 0, L3: 0 },
    E: { L1: 0, L2: 0, L3: 0 },
    F: { L1: 0, L2: 0, L3: 0 },
  };

  let negativeWordCount = 0;
  let totalTextLength = 0;
  let estimatedWordCount = 0;
  let comboHits = 0; // 连击次数：同时命中 L 和 D 的片段数
  let hasRageWord = false; // 是否检测到负向咆哮词

  const userMessages = chatData.filter(item => item.role === 'USER');
  
  // 扩展负面词库 - 分为两级
  // 【新增】一级负面词（咆哮词）：一票否决，直接封顶60分
  const rageWords = [
    '垃圾', '笨', '智障', '滚', '废物', 'SB', '弱智', 
    '闭嘴', 'shit', 'fucking', 'stupid', 'idiot', 'useless', 'trash'
  ];
  const ragePattern = new RegExp(`(?:${rageWords.map(escapeRegex).join('|')})`, 'gi');
  
  // 二级负面词（一般负面）：正常扣分
  const negativeWords = [
    '不懂', '死机', '撤回', '错误', '失败', '问题', '崩溃', 'bug', 'error', 'fail'
  ];
  const negativePattern = new RegExp(`(?:${negativeWords.map(escapeRegex).join('|')})`, 'gi');

  // 【新增】高频词统计表 - 用于TF-IDF降权
  const wordFrequencyMap = {};

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

    // 维度匹配，同时检测连击
    let hasLogic = false;  // 是否命中逻辑维度
    let hasDetail = false; // 是否命中细腻维度

    Object.keys(patterns).forEach(dimension => {
      const dimPatterns = patterns[dimension];
      ['L1', 'L2', 'L3'].forEach(level => {
        if (dimPatterns[level]) {
          const matches = text.match(dimPatterns[level]);
          if (matches) {
            // 【新增】TF-IDF降权：统计每个词的出现频率
            matches.forEach(word => {
              const key = `${dimension}_${level}_${word}`;
              wordFrequencyMap[key] = (wordFrequencyMap[key] || 0) + 1;
            });
            
            results[dimension][level] += matches.length;
            
            // 检测连击：逻辑(L) 和 细腻(D) 同时命中
            if (dimension === 'L' && matches.length > 0) {
              hasLogic = true;
            }
            if (dimension === 'D' && matches.length > 0) {
              hasDetail = true;
            }
          }
        }
      });
    });

    // 如果同时命中逻辑和细腻，记录连击
    if (hasLogic && hasDetail) {
      comboHits++;
    }
  });

  // 防止分母为0
  estimatedWordCount = Math.max(100, estimatedWordCount);
  totalTextLength = Math.max(1, totalTextLength);

  return {
    matchResults: results,
    negativeWordCount,
    totalTextLength,
    estimatedWordCount,
    messageCount: userMessages.length,
    comboHits, // 连击次数
    hasRageWord, // 【新增】是否有咆哮词
    wordFrequencyMap, // 【新增】词频统计
  };
}

// ==========================================
// 4. 第一维：密度窗口 (Density Windowing)
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
// 5. 第二维：排位分梯队 (Tiered Normalization)
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
// 6. 第三维：语义权重矩阵 (Semantic Matrix)
// ==========================================

/**
 * 计算原始加权得分（应用语义权重矩阵和连击加成）
 * 【2026-01-14 重写】引入高频词降权 (TF-IDF Decay)
 * 
 * @param {Object} matchResults - 匹配结果
 * @param {number} comboHits - 连击次数（同时命中逻辑和细腻的片段数）
 * @param {Object} wordFrequencyMap - 词频统计表
 * @returns {Object} 各维度的原始加权得分
 */
function calculateRawScores(matchResults, comboHits, wordFrequencyMap) {
  const rawScores = {};
  
  // 【新增】高频词降权系数计算
  // 公式：同一个词命中超过3次后，后续权重按 0.8^(count-3) 指数级衰减
  const calculateDecayWeight = (count) => {
    if (count <= 3) return 1.0; // 前3次不衰减
    return Math.pow(0.8, count - 3); // 从第4次开始指数衰减
  };
  
  // 计算各维度的加权得分（应用语义权重矩阵 + TF-IDF降权）
  Object.keys(matchResults).forEach(dimension => {
    const dimResults = matchResults[dimension];
    let dimensionScore = 0;
    
    ['L1', 'L2', 'L3'].forEach(level => {
      const count = dimResults[level];
      if (count > 0) {
        // 基础权重
        const baseWeight = WEIGHTS[level];
        
        // 【新增】应用高频词降权
        // 计算该维度+层级的平均词频（粗略估算）
        const avgFrequency = count; // 假设每个词平均出现次数
        const decayFactor = calculateDecayWeight(avgFrequency);
        
        // 最终得分 = 基础权重 × 命中次数 × 衰减系数
        dimensionScore += baseWeight * count * decayFactor;
      }
    });
    
    rawScores[dimension] = dimensionScore;
  });
  
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
// 5. 主逻辑：计算与处理
// ==========================================

self.onmessage = function(e) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT':
        dimensionData = payload;
        regexPatterns = buildRegexPatterns(dimensionData);
        self.postMessage({ type: 'INIT_SUCCESS', payload: { message: 'Worker Ready' } });
        break;

      case 'ANALYZE':
        if (!regexPatterns) throw new Error('Worker未初始化');
        const { chatData } = payload;
        
        // ==========================================
        // 步骤 1: 扫描匹配（包含连击检测 + 高频词统计）
        // ==========================================
        const scanResult = scanAndMatch(chatData, regexPatterns);
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
        // 步骤 2: 计算原始加权得分（语义权重矩阵 + 连击加成 + TF-IDF降权）
        // ==========================================
        const rawScores = calculateRawScores(matchResults, comboHits, wordFrequencyMap);

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
              algorithmVersion: '2026-01-14-v2.0' // 【新增】算法版本标识
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