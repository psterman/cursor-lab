/**
 * content.ts - 文案库模块
 * 存储吐槽文案和人格名称
 */

// 导入文案库数据（由 scripts/generate-content.ts 生成）
import {
  ROAST_LIBRARY_ZH,
  ROAST_LIBRARY_EN,
  PERSONALITY_NAMES_ZH,
  PERSONALITY_NAMES_EN,
} from './content-data';

/**
 * 获取吐槽文案
 * @param index - 5位数字索引
 * @param lang - 语言代码
 * @param env - 环境变量（可选，用于 KV 存储）
 * @returns 吐槽文案
 */
export async function getRoastText(
  index: string,
  lang: string = 'zh-CN',
  env?: { CONTENT_STORE?: KVNamespace }
): Promise<string> {
  // 优先从 KV 读取（如果配置了，用于动态更新）
  if (env?.CONTENT_STORE) {
    try {
      const key = `roast_${lang}_${index}`;
      const cached = await env.CONTENT_STORE.get(key);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('[Worker] KV 读取失败，使用内置文案:', error);
    }
  }

  // 从内置文案库读取
  const library = lang === 'en' ? ROAST_LIBRARY_EN : ROAST_LIBRARY_ZH;
  if (library[index]) {
    return library[index];
  }

  // 模糊匹配：尝试找到最接近的索引
  const findClosestMatch = (targetIndex: string, lib: Record<string, string>): string | null => {
    // 先尝试只修改最后一位
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 4) + i;
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    // 再尝试修改倒数第二位
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 3) + i + targetIndex[4];
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    // 尝试修改倒数第三位（E维度）
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 2) + i + targetIndex.slice(3);
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    // 最后尝试修改前几位
    for (let i = 0; i <= 2; i++) {
      const candidate = i + targetIndex.slice(1);
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    return null;
  };

  const closestMatch = findClosestMatch(index, library);
  if (closestMatch) {
    return closestMatch;
  }

  // 降级方案：返回默认文案
  if (lang === 'en') {
    return `Your interaction style is uniquely yours! This personalized roast for index ${index} is being translated from the Cyber-Deep-Thought library. Your personality combination is so unique that even our AI needs more time to craft the perfect roast!`;
  }
  return `索引 ${index} 对应的吐槽文案未找到，你的人格组合太独特了！`;
}

/**
 * 获取人格名称
 * @param index - 5位数字索引
 * @param lang - 语言代码
 * @param personalityType - 人格类型代码
 * @param env - 环境变量（可选，用于 KV 存储）
 * @returns 人格名称
 */
export async function getPersonalityName(
  index: string,
  lang: string = 'zh-CN',
  personalityType: string | null = null,
  env?: { CONTENT_STORE?: KVNamespace }
): Promise<string> {
  // 优先从 KV 读取（如果配置了，用于动态更新）
  if (env?.CONTENT_STORE) {
    try {
      const key = `personality_${lang}_${index}`;
      const cached = await env.CONTENT_STORE.get(key);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('[Worker] KV 读取失败，使用内置名称:', error);
    }
  }

  // 从内置名称库读取
  const names = lang === 'en' ? PERSONALITY_NAMES_EN : PERSONALITY_NAMES_ZH;
  if (names[index]) {
    return names[index];
  }

  // 降级方案：返回默认名称
  if (lang === 'en') {
    return personalityType ? `Personality ${personalityType}` : `Unknown Personality ${index}`;
  }
  return personalityType ? `人格 ${personalityType}` : `未知人格 ${index}`;
}

/**
 * 根据维度分数生成5位数字索引
 * @param dimensions - 维度对象 {L, P, D, E, F}
 * @returns 5位数字索引，如 "01210"
 */
export function getVibeIndex(dimensions: { L: number; P: number; D: number; E: number; F: number }): string {
  const indexMap = (value: number) => {
    if (value < 40) return '0';  // 低
    if (value < 70) return '1'; // 中
    return '2';                 // 高
  };
  
  // 注意：E 维度的阈值不同（0-100+），需要特殊处理
  const eIndex = (value: number) => {
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
 * 确定人格类型
 * @param dimensions - 维度得分
 * @returns 人格类型代码，如 "LPDEF", "L-P-DEF-" 等
 */
export function determinePersonalityType(dimensions: { L: number; P: number; D: number; E: number; F: number }): string {
  // 阈值定义：调整阈值使其更合理
  // L、P、D、F维度：50 以上为高，30-50 为中，30 以下为低（降低阈值，更容易识别）
  const threshold = 50;  // 从 60 降低到 50
  const midThreshold = 30;  // 从 40 降低到 30

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
  const parts: string[] = [];
  
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

  return typeCode;
}

/**
 * 生成 LPDEF 编码
 * @param dimensions - 维度得分
 * @returns LPDEF 编码，如 "L2P1D2E1F2"
 */
export function generateLPDEF(dimensions: { L: number; P: number; D: number; E: number; F: number }): string {
  const encode = (value: number, thresholds: number[] = [40, 70]) => {
    if (value >= thresholds[1]) return '2'; // 高
    if (value >= thresholds[0]) return '1'; // 中
    return '0'; // 低
  };

  // E 维度使用不同的阈值
  const eEncode = (value: number) => {
    if (value >= 10) return '2';
    if (value >= 5) return '1';
    return '0';
  };

  return `L${encode(dimensions.L)}P${encode(dimensions.P)}D${encode(dimensions.D)}E${eEncode(dimensions.E)}F${encode(dimensions.F)}`;
}
