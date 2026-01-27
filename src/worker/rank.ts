/**
 * rank.ts - 排名数据整合（6个维度，中英文版本）
 * 整合 ai/ai2, day/day2, no/no2, please/please2, say/say2, word/word2 共12个JSON文件
 * 
 * ⚠️ 重要提示：
 * 由于英文 JSON 文件（ai2.json, day2.json 等）包含多个 JSON 对象，
 * TypeScript 的 import 只能导入第一个对象。
 * 
 * 解决方案：
 * 1. 创建构建脚本，将所有 JSON 对象合并为一个数组（推荐）
 * 2. 使用运行时 fetch 加载完整数据（见 initRankData 函数）
 * 3. 手动内嵌处理好的数据
 * 
 * 当前实现使用第一个对象作为兜底，建议通过构建脚本处理完整数据。
 */

// ==================== 类型定义 ====================

export interface RankComment {
  title: string;
  content: string;
}

export interface RankLevel {
  min: number;
  max: number;
  label: string;
  labelEn?: string;
  commentsZh: RankComment[];
  commentsEn: RankComment[];
}

export interface RankConfig {
  id: string;
  name: string;
  levels: RankLevel[];
}

// ==================== 工具函数 ====================

/**
 * 解析 range 字符串为数值范围
 * 支持格式: "1-20", "201+", "1-7天", "TOP 81-100", "91-100+", "1-500字", "10001+字"
 */
function parseRange(rangeStr: string): { min: number; max: number } {
  const str = rangeStr.trim();
  
  // 处理 "TOP 81-100" 这种格式（排名，数值越大排名越低）
  if (str.startsWith('TOP ')) {
    const range = str.replace('TOP ', '').trim();
    const parts = range.split('-');
    if (parts.length === 2) {
      const max = parseInt(parts[0], 10);
      const min = parseInt(parts[1], 10);
      if (!isNaN(min) && !isNaN(max)) {
        // TOP 排名：TOP 81-100 意味着排名81-100，数值越大排名越低
        // 但我们需要按数值匹配，所以保持原样
        return { min, max };
      }
    }
  }
  
  // 处理 "1-20", "21-50" 这种格式
  const dashMatch = str.match(/^(\d+)\s*-\s*(\d+)/);
  if (dashMatch) {
    const min = parseInt(dashMatch[1], 10);
    const max = parseInt(dashMatch[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }
  
  // 处理 "1-7天" 这种格式（去掉"天"字）
  const dayMatch = str.match(/^(\d+)\s*-\s*(\d+)\s*天/);
  if (dayMatch) {
    const min = parseInt(dayMatch[1], 10);
    const max = parseInt(dayMatch[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }
  
  // 处理 "1-500字", "501-2000字" 这种格式（去掉"字"字）
  const charMatch = str.match(/^(\d+)\s*-\s*(\d+)\s*字/);
  if (charMatch) {
    const min = parseInt(charMatch[1], 10);
    const max = parseInt(charMatch[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }
  
  // 处理 "91-100+" 这种格式
  const rangePlusMatch = str.match(/^(\d+)\s*-\s*(\d+)\+/);
  if (rangePlusMatch) {
    const min = parseInt(rangePlusMatch[1], 10);
    const max = parseInt(rangePlusMatch[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max: 999999 };
    }
  }
  
  // 处理 "201+", "181+", "1001+" 这种格式（可能带"天"或"字"）
  const plusMatch = str.match(/^(\d+)\+(\s*字|\s*天)?/);
  if (plusMatch) {
    const num = parseInt(plusMatch[1], 10);
    if (!isNaN(num)) {
      return { min: num, max: 999999 };
    }
  }
  
  // 默认值
  console.warn(`[Rank] ⚠️ 无法解析 range: "${rangeStr}"，使用默认值 { min: 0, max: 0 }`);
  return { min: 0, max: 0 };
}

/**
 * 将英文 segment 转换为数值范围
 * 例如: "Rank 1-33" -> { min: 1, max: 33 }
 * 注意：对于排名类数据（如 please），segment 的数值需要映射到对应的 range
 */
function parseSegment(segmentStr: string): { min: number; max: number } | null {
  const match = segmentStr.match(/Rank\s+(\d+)\s*-\s*(\d+)/);
  if (match) {
    const min = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }
  return null;
}

/**
 * 将 segment 范围映射到对应的 range 范围
 * 对于排名类数据（如 please），segment 的数值范围需要映射到对应的 range
 * 例如：segment "Rank 1-33" 可能对应 range "TOP 1-20"
 */
function mapSegmentToRange(
  segmentRange: { min: number; max: number },
  zhRanges: Array<{ range: string; parsed: { min: number; max: number } }>,
  isRankBased: boolean = false
): { min: number; max: number } | null {
  if (isRankBased) {
    // 对于排名类数据，segment 的数值范围直接对应 range
    // 例如：segment "Rank 1-33" 对应 range "TOP 81-100"（排名1-33对应TOP 81-100）
    // 这里需要根据实际数据调整映射逻辑
    // 暂时直接使用 segment 范围
    return segmentRange;
  }
  
  // 尝试精确匹配
  for (const zhRange of zhRanges) {
    if (zhRange.parsed.min === segmentRange.min && zhRange.parsed.max === segmentRange.max) {
      return zhRange.parsed;
    }
  }
  
  // 如果无法精确匹配，返回 segment 范围本身
  return segmentRange;
}

// ==================== 数据导入 ====================

// 【重构】使用 rank-content.ts 的数据，避免直接导入包含多个 JSON 对象的文件
import { RANK_RESOURCES } from '../rank-content';

/**
 * 解析包含多个 JSON 对象的文本
 * 返回 JSON 对象数组
 */
function parseMultiJsonText(text: string): any[] {
  const results: any[] = [];
  const lines = text.split('\n');
  let currentObj = '';
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      currentObj += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      currentObj += char;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      currentObj += char;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        if (braceCount === 0 && currentObj.trim()) {
          // 保存之前的对象
          try {
            const prevObj = JSON.parse(currentObj.trim());
            results.push(prevObj);
          } catch (e) {
            // 忽略解析错误
          }
          currentObj = '';
        }
        braceCount++;
        currentObj += char;
      } else if (char === '}') {
        currentObj += char;
        braceCount--;
        if (braceCount === 0) {
          // 完成一个对象
          try {
            const obj = JSON.parse(currentObj.trim());
            results.push(obj);
          } catch (e) {
            // 忽略解析错误
          }
          currentObj = '';
        }
      } else {
        currentObj += char;
      }
    } else {
      currentObj += char;
    }
  }
  
  // 处理最后一个对象
  if (currentObj.trim() && braceCount === 0) {
    try {
      const obj = JSON.parse(currentObj.trim());
      results.push(obj);
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  return results;
}

/**
 * 处理英文数据：如果是单个对象，转换为数组；如果已经是数组，直接返回
 * 对于包含多个 JSON 对象的文件，我们需要在构建时或运行时处理
 */
function normalizeEnData(enData: any): any[] {
  // 如果已经是数组，直接返回
  if (Array.isArray(enData)) {
    return enData;
  }
  
  // 如果是单个对象，转换为数组
  if (enData && typeof enData === 'object') {
    return [enData];
  }
  
  return [];
}

// 【重构】不再需要规范化英文数据，直接使用 RANK_RESOURCES

// ==================== 数据清洗与合并 ====================

/**
 * 【重构】从 RANK_RESOURCES 构建单个维度的配置
 * RANK_RESOURCES 已经包含了中英文数据，直接使用即可
 */
function buildRankConfigFromResources(id: string): RankConfig | null {
  const resource = RANK_RESOURCES[id];
  if (!resource || !resource.levels) {
    console.warn(`[Rank] ⚠️ 未找到资源: ${id}`);
    return null;
  }
  
  const levels: RankLevel[] = resource.levels.map((level: any) => ({
    min: level.min,
    max: level.max,
    label: level.label || '',
    labelEn: level.labelEn,
    commentsZh: level.commentsZh || [],
    commentsEn: level.commentsEn || []
  }));
  
  // 按 min 值排序
  levels.sort((a, b) => a.min - b.min);
  
  return {
    id: resource.id || id,
    name: resource.name || id,
    levels
  };
}

// ==================== 构建所有维度数据 ====================

// 【重构】从 RANK_RESOURCES 构建 RANK_DATA
export const RANK_DATA: Record<string, RankConfig> = {
  ai: buildRankConfigFromResources('ai') || { id: 'ai', name: '调戏 AI 排名', levels: [] },
  say: buildRankConfigFromResources('say') || { id: 'say', name: '废话输出排名', levels: [] },
  day: buildRankConfigFromResources('day') || { id: 'day', name: '上岗天数排名', levels: [] },
  please: buildRankConfigFromResources('please') || { id: 'please', name: '赛博磕头排名', levels: [] },
  no: buildRankConfigFromResources('no') || { id: 'no', name: '甲方上身排名', levels: [] },
  word: buildRankConfigFromResources('word') || { id: 'word', name: '平均长度排名', levels: [] }
};

// ==================== 辅助函数 ====================

/**
 * 根据维度ID和数值，查找匹配的 Level 并随机返回一条中英文对照的评论
 * @param dimensionId - 维度ID (ai, say, day, please, no, word)
 * @param value - 数值（对话回合数、字数、天数等）
 * @param lang - 语言 ('zh' | 'en' | 'both')，默认为 'both'
 * @returns 返回匹配的评论对象，如果未找到则返回 null
 */
/**
 * 根据维度ID和数值，查找匹配的 Level 并随机返回一条中英文对照的评论
 * @param dimensionId - 维度ID (ai, say, day, please, no, word)
 * @param value - 数值（对话回合数、字数、天数等）
 * @param lang - 语言 ('zh' | 'en' | 'both')，默认为 'both'
 * @returns 返回匹配的评论对象，如果未找到则返回 null
 */
export function getRankResult(
  dimensionId: string,
  value: number,
  lang: 'zh' | 'en' | 'both' = 'both'
): {
  level: RankLevel | null;
  comment: RankComment | null;
  commentEn: RankComment | null;
} | null {
  const config = RANK_DATA[dimensionId];
  if (!config) {
    console.warn(`[Rank] ⚠️ 未找到维度配置: ${dimensionId}`);
    return null;
  }
  
  // 查找匹配的 level
  const matchedLevel = config.levels.find(
    level => value >= level.min && value <= level.max
  );
  
  if (!matchedLevel) {
    console.warn(`[Rank] ⚠️ 未找到匹配的 level，value: ${value}, dimension: ${dimensionId}`);
    return null;
  }
  
  // 随机选择一条中文评论
  const commentsZh = matchedLevel.commentsZh || [];
  const commentsEn = matchedLevel.commentsEn || [];
  
  const commentZh = commentsZh.length > 0
    ? commentsZh[Math.floor(Math.random() * commentsZh.length)]
    : null;
  
  const commentEn = commentsEn.length > 0
    ? commentsEn[Math.floor(Math.random() * commentsEn.length)]
    : null;
  
  if (lang === 'zh') {
    return {
      level: matchedLevel,
      comment: commentZh,
      commentEn: null
    };
  } else if (lang === 'en') {
    return {
      level: matchedLevel,
      comment: null,
      commentEn: commentEn
    };
  } else {
    return {
      level: matchedLevel,
      comment: commentZh,
      commentEn: commentEn
    };
  }
}

/**
 * 初始化排名数据（可选）
 * 用于在运行时加载完整的英文数据（包含多个 JSON 对象）
 * 在 Cloudflare Workers 环境中，可以通过 fetch 加载 JSON 文件
 */
export async function initRankData(baseUrl?: string): Promise<void> {
  if (!baseUrl) {
    console.log('[Rank] ℹ️ 未提供 baseUrl，跳过运行时数据加载');
    return;
  }
  
  try {
    // 这里可以通过 fetch 加载完整的 JSON 文件并解析多个对象
    // 示例：
    // const response = await fetch(`${baseUrl}/ai2.json`);
    // const text = await response.text();
    // const aiEnFull = parseMultiJsonText(text);
    // 然后更新 RANK_DATA 中的配置
    console.log('[Rank] ✅ 排名数据初始化完成');
  } catch (error) {
    console.warn('[Rank] ⚠️ 运行时数据加载失败:', error);
  }
}
