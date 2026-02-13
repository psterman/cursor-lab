/**
 * 三身份词库：Novice / Professional / Architect
 * 用于 /api/v2/stats/keywords 按维度聚合国家级词云
 */
import noviceData from './data/Novice.json';
import professionalData from './data/Professional.json';
import architectData from './data/Architect.json';

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

export function getIdentityWordSets(): { novice: Set<string>; professional: Set<string>; architect: Set<string> } {
  const toSet = (arr: string[]) => new Set(arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  return {
    novice: toSet(NoviceKeywords),
    professional: toSet(ProfessionalKeywords),
    architect: toSet(ArchitectKeywords),
  };
}
