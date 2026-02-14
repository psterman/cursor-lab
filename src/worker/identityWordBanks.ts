/**
 * 三身份词库：Novice / Professional / Architect
 * 支持中英多语言，用于 /api/v2/stats/keywords 与 analyze 异步入库 keyword_logs
 */
import noviceData from './data/Novice.json';
import professionalData from './data/Professional.json';
import architectData from './data/Architect.json';
import noviceEnData from './data/Novice.en.json';
import professionalEnData from './data/Professional.en.json';
import architectEnData from './data/Architect.en.json';

type JsonModule = { keywords?: string[] };

export const NoviceKeywords: string[] = Array.isArray((noviceData as JsonModule)?.keywords)
  ? (noviceData as JsonModule).keywords!
  : [];
export const ProfessionalKeywords: string[] = Array.isArray((professionalData as JsonModule)?.keywords)
  ? (professionalData as JsonModule).keywords!
  : [];
export const ArchitectKeywords: string[] = Array.isArray((architectData as JsonModule)?.keywords)
  ? (architectData as JsonModule).keywords!
  : [];

export const NoviceKeywordsEn: string[] = Array.isArray((noviceEnData as JsonModule)?.keywords)
  ? (noviceEnData as JsonModule).keywords!
  : [];
export const ProfessionalKeywordsEn: string[] = Array.isArray((professionalEnData as JsonModule)?.keywords)
  ? (professionalEnData as JsonModule).keywords!
  : [];
export const ArchitectKeywordsEn: string[] = Array.isArray((architectEnData as JsonModule)?.keywords)
  ? (architectEnData as JsonModule).keywords!
  : [];

export type IdentityWordBankLang = 'zh' | 'en';

export function getIdentityWordSets(lang: IdentityWordBankLang = 'zh'): { novice: Set<string>; professional: Set<string>; architect: Set<string> } {
  const toSet = (arr: string[]) => new Set(arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  if (lang === 'en') {
    return {
      novice: toSet(NoviceKeywordsEn),
      professional: toSet(ProfessionalKeywordsEn),
      architect: toSet(ArchitectKeywordsEn),
    };
  }
  return {
    novice: toSet(NoviceKeywords),
    professional: toSet(ProfessionalKeywords),
    architect: toSet(ArchitectKeywords),
  };
}

export type IdentityCategory = 'Novice' | 'Professional' | 'Architect';

const VALID_CATEGORIES: IdentityCategory[] = ['Novice', 'Professional', 'Architect'];

/** 词条 + 分类，用于 keyword_logs 写入与按分类聚合 */
export interface MatchedIdentityKeyword {
  phrase: string;
  category: IdentityCategory;
}

const MAX_MATCHED_KEYWORDS = 1500;

/**
 * 清洗文本用于匹配：转小写、去除空格与特殊字符，只保留字母/数字/汉字等，便于与词库做子串匹配。
 */
function normalizeForMatch(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function getWordsByLang(lang: IdentityWordBankLang): Array<{ key: IdentityCategory; words: string[] }> {
  if (lang === 'en') {
    return [
      { key: 'Novice', words: NoviceKeywordsEn },
      { key: 'Professional', words: ProfessionalKeywordsEn },
      { key: 'Architect', words: ArchitectKeywordsEn },
    ];
  }
  return [
    { key: 'Novice', words: NoviceKeywords },
    { key: 'Professional', words: ProfessionalKeywords },
    { key: 'Architect', words: ArchitectKeywords },
  ];
}

/**
 * 从聊天文本中匹配三身份词库，返回带分类的关键词列表（去重按 (phrase, category)）。
 * 匹配前对 userContent 做清洗：转小写、去除特殊字符，以匹配词库原始词汇。
 * 每个命中词强制携带 category：'Novice' | 'Professional' | 'Architect'。
 * lang: 'zh' 中文词库，'en' 英文词库；用于 analyze 异步入库 keyword_logs。
 */
export function matchChatToIdentityKeywords(chatText: string, lang: IdentityWordBankLang = 'zh'): MatchedIdentityKeyword[] {
  if (!chatText || typeof chatText !== 'string') return [];
  const text = chatText.trim();
  if (!text.length) return [];

  const seen = new Set<string>();
  const result: MatchedIdentityKeyword[] = [];
  const categories = getWordsByLang(lang);
  const normalizedText = normalizeForMatch(text);

  for (const { key, words } of categories) {
    if (!VALID_CATEGORIES.includes(key)) continue;
    for (const word of words) {
      if (result.length >= MAX_MATCHED_KEYWORDS) return result;
      const w = String(word).trim();
      if (!w || w.length < 2) continue;
      const wNorm = normalizeForMatch(w);
      if (!wNorm || normalizedText.length < wNorm.length) continue;
      if (!normalizedText.includes(wNorm)) continue;
      const dedupeKey = `${key}:${wNorm}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push({ phrase: w, category: key });
    }
  }

  return result;
}
