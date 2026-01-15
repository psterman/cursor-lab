/**
 * vibeAnalyzerWorker.js - Web Worker 高性能匹配引擎
 * 负责将 5 个 JSON 文件中的词条聚合成正则表达式，单次扫描完成匹配
 * 
 * 注意：Web Worker 中不能使用 ES6 import，数据通过 postMessage 传递
 */

let dimensionData = null;
let regexPatterns = null;

/**
 * 构建聚合正则表达式
 * @param {Object} data - 5个维度的JSON数据
 * @returns {Object} 包含各维度L1/L2/L3正则表达式的对象
 */
function buildRegexPatterns(data) {
  const patterns = {
    L: { L1: [], L2: [], L3: [] },
    P: { L1: [], L2: [], L3: [] },
    D: { L1: [], L2: [], L3: [] },
    E: { L1: [], L2: [], L3: [] },
    F: { L1: [], L2: [], L3: [] },
  };

  // 遍历每个维度
  Object.keys(data).forEach(dimension => {
    const dimData = data[dimension];
    if (!dimData || !dimData.data) return;

    // 遍历每个类别
    Object.values(dimData.data).forEach(category => {
      if (typeof category !== 'object' || category === null) return;

      // 提取 L1, L2, L3 词条
      ['L1', 'L2', 'L3'].forEach(level => {
        if (Array.isArray(category[level])) {
          category[level].forEach(term => {
            if (term && typeof term === 'string') {
              // 转义特殊字符并添加到对应数组
              const escaped = escapeRegex(term);
              patterns[dimension][level].push(escaped);
            }
          });
        }
      });
    });
  });

  // 构建最终的正则表达式（使用非捕获组和单词边界）
  const regexPatterns = {};
  Object.keys(patterns).forEach(dimension => {
    regexPatterns[dimension] = {
      L1: patterns[dimension].L1.length > 0
        ? new RegExp(`(?:${patterns[dimension].L1.join('|')})`, 'gi')
        : null,
      L2: patterns[dimension].L2.length > 0
        ? new RegExp(`(?:${patterns[dimension].L2.join('|')})`, 'gi')
        : null,
      L3: patterns[dimension].L3.length > 0
        ? new RegExp(`(?:${patterns[dimension].L3.join('|')})`, 'gi')
        : null,
    };
  });

  return regexPatterns;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 单次扫描匹配所有载点
 * @param {Array} chatData - 对话数据数组
 * @param {Object} patterns - 正则表达式模式
 * @returns {Object} 匹配结果统计，包含负面词计数和总文本长度
 */
function scanAndMatch(chatData, patterns) {
  const results = {
    L: { L1: 0, L2: 0, L3: 0 },
    P: { L1: 0, L2: 0, L3: 0 },
    D: { L1: 0, L2: 0, L3: 0 },
    E: { L1: 0, L2: 0, L3: 0 },
    F: { L1: 0, L2: 0, L3: 0 },
  };

  // 负面词计数（用于 Patience 维度的惩罚）
  let negativeWordCount = 0;
  
  // 总文本长度（用于长度修正）
  let totalTextLength = 0;

  // 只处理用户消息
  const userMessages = chatData.filter(item => item.role === 'USER');

  // 负面词列表（从 patience.json 的 emotional_stability.L3 提取）
  const negativeWords = [
    '垃圾', '笨死', '智障', '不行就滚', '听不懂吗', '说了多少次', 
    '毁灭吧', '算了不弄了', '废物', 'SB', '垃圾AI', '到底行不行', 
    '浪费时间', '崩溃', '吐了', '死机', '撤回'
  ];
  
  // 构建负面词正则
  const negativePattern = new RegExp(`(?:${negativeWords.map(escapeRegex).join('|')})`, 'gi');

  // 单次扫描：遍历所有消息
  userMessages.forEach(msg => {
    const text = msg.text || '';
    if (!text || text.length < 3) return;

    // 累计文本长度
    totalTextLength += text.length;

    // 检测负面词（用于 Patience 维度惩罚）
    const negativeMatches = text.match(negativePattern);
    if (negativeMatches) {
      negativeWordCount += negativeMatches.length;
    }

    // 对每个维度进行匹配
    Object.keys(patterns).forEach(dimension => {
      const dimPatterns = patterns[dimension];
      
      // 匹配 L1, L2, L3
      ['L1', 'L2', 'L3'].forEach(level => {
        const pattern = dimPatterns[level];
        if (pattern) {
          const matches = text.match(pattern);
          if (matches) {
            results[dimension][level] += matches.length;
          }
        }
      });
    });
  });

  return {
    matchResults: results,
    negativeWordCount,
    totalTextLength,
    messageCount: userMessages.length,
  };
}

/**
 * 计算原始得分（包含负向惩罚机制）
 * @param {Object} scanResult - 扫描结果 {matchResults, negativeWordCount, totalTextLength, messageCount}
 * @param {Object} weights - 权重配置 {L1: 15, L2: 5, L3: 1}
 * @returns {Object} 各维度的原始得分
 */
function calculateRawScores(scanResult, weights = { L1: 15, L2: 5, L3: 1 }) {
  const { matchResults, negativeWordCount } = scanResult;
  const rawScores = {};

  Object.keys(matchResults).forEach(dimension => {
    const dimResults = matchResults[dimension];
    let score = 
      (dimResults.L1 || 0) * (weights.L1 || 15) +
      (dimResults.L2 || 0) * (weights.L2 || 5) +
      (dimResults.L3 || 0) * (weights.L3 || 1);
    
    // 负向惩罚机制：Patience 维度检测到负面词时应用惩罚系数
    if (dimension === 'P' && negativeWordCount > 0) {
      const penalty = 0.5; // 惩罚系数
      const originalScore = score;
      score = score * penalty;
      // 在 Worker 中记录（可选，用于调试）
      if (typeof self !== 'undefined' && self.console) {
        self.console.log(`[Worker] Patience 维度检测到 ${negativeWordCount} 个负面词，应用惩罚系数 ${penalty}，原始分从 ${originalScore} 降至 ${score}`);
      }
    }
    
    rawScores[dimension] = Math.max(0, score); // 确保不为负
  });

  return rawScores;
}

/**
 * 计算长度修正系数
 * @param {number} totalTextLength - 总文本长度
 * @param {number} messageCount - 消息数量
 * @returns {number} 长度修正系数（0.8 - 1.0）
 */
function calculateLengthCorrection(totalTextLength, messageCount) {
  if (messageCount === 0) return 1.0;
  
  // 计算平均消息长度
  const avgMessageLength = totalTextLength / messageCount;
  
  // 基准长度：假设正常用户平均每条消息 100 字符
  const baselineLength = 100;
  
  // 如果平均长度超过基准，应用轻微修正（防止话痨刷分）
  // 修正公式：correction = 1.0 - min(0.2, (avgLength - baseline) / baseline * 0.3)
  if (avgMessageLength > baselineLength) {
    const excessRatio = (avgMessageLength - baselineLength) / baselineLength;
    const correction = Math.max(0.8, 1.0 - Math.min(0.2, excessRatio * 0.3));
    return correction;
  }
  
  return 1.0; // 正常长度不修正
}

/**
 * 归一化处理：使用对数缩放公式将原始得分转换为 40-100 之间的标准分
 * 公式：Score = BASE_SCORE + (RANGE × log(Raw + 1) / log(SENSITIVITY))
 * 
 * @param {Object} rawScores - 原始得分
 * @param {number} lengthCorrection - 长度修正系数
 * @param {Object} config - 配置参数
 * @param {number} config.BASE_SCORE - 基础分数（默认 40）
 * @param {number} config.SENSITIVITY - 敏感度参数（默认 200）
 * @returns {Object} 归一化后的得分（40-100）
 */
function normalizeScores(rawScores, lengthCorrection = 1.0, config = {}) {
  const BASE_SCORE = config.BASE_SCORE || 40;
  const SENSITIVITY = config.SENSITIVITY || 200;
  const RANGE = 100 - BASE_SCORE; // 60
  
  const normalized = {};

  Object.keys(rawScores).forEach(dimension => {
    let raw = rawScores[dimension];
    
    // 应用长度修正（防止话痨刷分）
    raw = raw * lengthCorrection;
    
    // 对数缩放公式：Score = Base + (Range × log(Raw + 1) / log(Sensitivity))
    // 这样设计使得：
    // - 即使 raw = 0，也有 BASE_SCORE 底分
    // - 随着 raw 增加，分数增长迅速放缓（对数特性）
    // - SENSITIVITY 越大，达到高分越难
    const logRaw = Math.log(raw + 1);
    const logSensitivity = Math.log(SENSITIVITY);
    const normalizedValue = BASE_SCORE + (RANGE * logRaw / logSensitivity);
    
    // 确保在 40-100 范围内
    normalized[dimension] = Math.max(BASE_SCORE, Math.min(100, Math.round(normalizedValue)));
  });

  return normalized;
}

/**
 * 全局平均基准数据（用于 Chart.js 对比层渲染）
 * 这些数据代表"普通用户"的平均水平
 */
const GLOBAL_AVERAGE_BASELINE = {
  L: 65,  // 逻辑力：中等偏上
  P: 70,  // 耐心值：较高（大多数用户比较温和）
  D: 60,  // 细腻度：中等
  E: 55,  // 探索欲：中等偏下（大多数用户不会频繁尝试新技术）
  F: 75,  // 反馈感：较高（礼貌用语较常见）
};

/**
 * Worker 消息处理
 */
self.onmessage = function(e) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT':
        // 初始化：接收维度数据
        dimensionData = payload;
        regexPatterns = buildRegexPatterns(dimensionData);
        
        self.postMessage({
          type: 'INIT_SUCCESS',
          payload: {
            message: '正则表达式构建完成',
            patternCounts: Object.keys(regexPatterns).reduce((acc, dim) => {
              acc[dim] = {
                L1: regexPatterns[dim].L1 ? '已构建' : '无',
                L2: regexPatterns[dim].L2 ? '已构建' : '无',
                L3: regexPatterns[dim].L3 ? '已构建' : '无',
              };
              return acc;
            }, {}),
          },
        });
        break;

      case 'ANALYZE':
        // 分析：匹配和计算
        if (!regexPatterns) {
          throw new Error('正则表达式未初始化，请先发送 INIT 消息');
        }

        const { chatData, weights, config } = payload;
        const normalizeConfig = config || {};
        
        // 单次扫描匹配（返回包含负面词计数和文本长度的完整结果）
        const scanResult = scanAndMatch(chatData, regexPatterns);
        
        // 计算长度修正系数
        const lengthCorrection = calculateLengthCorrection(
          scanResult.totalTextLength,
          scanResult.messageCount
        );
        
        // 计算原始得分（包含负向惩罚）
        const rawScores = calculateRawScores(scanResult, weights || { L1: 15, L2: 5, L3: 1 });
        
        // 归一化处理（使用对数缩放公式）
        const normalizedScores = normalizeScores(
          rawScores,
          lengthCorrection,
          {
            BASE_SCORE: normalizeConfig.BASE_SCORE || 40,
            SENSITIVITY: normalizeConfig.SENSITIVITY || 200,
          }
        );
        
        // 返回结果（包含全局平均基准用于对比）
        self.postMessage({
          type: 'ANALYZE_SUCCESS',
          payload: {
            matchResults: scanResult.matchResults,
            rawScores,
            normalizedScores,
            dimensions: normalizedScores, // 最终维度得分
            metadata: {
              negativeWordCount: scanResult.negativeWordCount,
              totalTextLength: scanResult.totalTextLength,
              messageCount: scanResult.messageCount,
              lengthCorrection: lengthCorrection,
            },
            globalAverage: GLOBAL_AVERAGE_BASELINE, // 全局平均基准（用于 Chart.js 对比）
          },
        });
        break;

      default:
        throw new Error(`未知的消息类型: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
};
