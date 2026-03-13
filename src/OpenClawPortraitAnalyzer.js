/**
 * OpenClawPortraitAnalyzer.js
 * OpenClaw portrait scoring based on parsed JSONL stats.
 *
 * Six dimensions:
 * 1) Consumption & Cost
 * 2) Model Preference
 * 3) Tool & Skill Heat
 * 4) Task Habit
 * 5) Stability & Health
 * 6) Composite Rank (1-100)
 */

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clamp100(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function sumObjectValues(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((acc, v) => acc + toNumber(v, 0), 0);
}

function sortCountMap(mapLike) {
  if (!mapLike || typeof mapLike !== 'object') return [];
  return Object.entries(mapLike)
    .map(([name, count]) => ({ name, count: Math.max(0, toNumber(count, 0)) }))
    .filter((x) => x.name && x.count > 0)
    .sort((a, b) => b.count - a.count);
}

function normalizedEntropy(distribution) {
  const list = Array.isArray(distribution) ? distribution.filter((x) => x > 0) : [];
  const total = list.reduce((a, b) => a + b, 0);
  if (total <= 0 || list.length <= 1) return 0;

  let h = 0;
  for (const value of list) {
    const p = value / total;
    h -= p * Math.log2(p);
  }
  const maxH = Math.log2(list.length);
  if (maxH <= 0) return 0;
  return clamp01(h / maxH);
}

function topN(entries, n = 10) {
  return (entries || []).slice(0, Math.max(0, n));
}

function ensureStats(input) {
  if (!input) return {};
  if (input.stats && typeof input.stats === 'object') return input.stats;
  return input;
}

/**
 * 消耗与成本：计算总 Token、缓存命中率与成本效率
 */
export function calculateConsumptionCost(input) {
  const stats = ensureStats(input);
  const usage = stats.usage || {};

  const promptTokens = Math.max(0, toNumber(usage.promptTokens, 0));
  const completionTokens = Math.max(0, toNumber(usage.completionTokens, 0));
  const totalTokensFromUsage = Math.max(0, toNumber(usage.totalTokens, 0));
  const totalTokens = totalTokensFromUsage > 0 ? totalTokensFromUsage : (promptTokens + completionTokens);
  const cachedTokens = Math.max(0, toNumber(usage.cachedTokens, 0));
  const totalCostUSD = Math.max(0, toNumber(usage.totalCostUSD, 0));

  const cacheHitRateFromStats = toNumber(stats.cacheHitRate, NaN);
  const cacheHitRateFromToken = promptTokens > 0 ? (cachedTokens / promptTokens) : 0;
  const cacheHitRate = Number.isFinite(cacheHitRateFromStats)
    ? clamp01(cacheHitRateFromStats)
    : clamp01(cacheHitRateFromToken);

  // 使用对数映射 token 规模（避免大用户完全碾压）
  const tokenVolumeScore = clamp100((Math.log10(totalTokens + 1) / Math.log10(500000 + 1)) * 100);
  const cacheScore = clamp100(cacheHitRate * 100);

  // 成本效率：按每千 token 成本估计（无成本数据时给中性分）
  let costPer1k = 0;
  let costEfficiencyScore = 55;
  if (totalTokens > 0 && totalCostUSD > 0) {
    costPer1k = (totalCostUSD * 1000) / totalTokens;
    // 0.03 USD / 1k token 作为低分上限参考
    costEfficiencyScore = clamp100(100 - (costPer1k / 0.03) * 100);
  }

  const score = clamp100(
    tokenVolumeScore * 0.35 +
    cacheScore * 0.45 +
    costEfficiencyScore * 0.20
  );

  return {
    score,
    totalTokens,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheHitRate,
    totalCostUSD,
    costPer1kTokensUSD: costPer1k,
    subScores: {
      tokenVolumeScore,
      cacheScore,
      costEfficiencyScore,
    },
  };
}

/**
 * 大模型偏好：统计模型分布与多样性
 */
export function calculateModelPreference(input) {
  const stats = ensureStats(input);
  const modelUsage = stats.modelUsage || {};
  const sorted = sortCountMap(modelUsage);

  const total = sorted.reduce((acc, x) => acc + x.count, 0);
  const uniqueModelCount = sorted.length;
  const dominant = sorted[0] || null;
  const dominantRatio = total > 0 && dominant ? dominant.count / total : 0;

  const entropyScore = clamp100(normalizedEntropy(sorted.map((x) => x.count)) * 100);
  const diversityScore = clamp100(Math.min(100, 20 + uniqueModelCount * 16));
  const antiMonopolyScore = clamp100((1 - dominantRatio) * 100);

  const score = clamp100(
    entropyScore * 0.50 +
    diversityScore * 0.30 +
    antiMonopolyScore * 0.20
  );

  const distribution = sorted.map((x) => ({
    modelId: x.name,
    count: x.count,
    ratio: total > 0 ? x.count / total : 0,
  }));

  return {
    score,
    totalModelCalls: total,
    uniqueModelCount,
    dominantModelId: dominant ? dominant.name : null,
    dominantRatio,
    distribution,
    subScores: {
      entropyScore,
      diversityScore,
      antiMonopolyScore,
    },
  };
}

/**
 * 工具与技能：基于 tool_calls + skillsSnapshot 构建热力值
 */
export function calculateToolSkillHeat(input) {
  const stats = ensureStats(input);
  const toolUsage = stats.toolUsage || {};
  const skillsByName = stats.skillsByName || {};
  const skillsUsage = stats.skillsUsage || {};

  const sortedTools = sortCountMap(toolUsage);
  const sortedSkills = sortCountMap(
    Object.keys(skillsByName).length > 0 ? skillsByName : skillsUsage
  );

  const toolCallsTotal = toNumber(stats.toolCallsTotal, sumObjectValues(toolUsage));
  const toolKinds = sortedTools.length;
  const skillKinds = sortedSkills.length;

  const toolDiversityScore = clamp100(Math.min(100, toolKinds * 18));
  const skillDiversityScore = clamp100(Math.min(100, skillKinds * 12));
  const intensityScore = clamp100((Math.log10(toolCallsTotal + 1) / Math.log10(2000 + 1)) * 100);

  const score = clamp100(
    toolDiversityScore * 0.35 +
    skillDiversityScore * 0.35 +
    intensityScore * 0.30
  );

  const maxToolCount = sortedTools[0]?.count || 1;
  const maxSkillCount = sortedSkills[0]?.count || 1;

  const toolHeat = sortedTools.map((x) => ({
    toolName: x.name,
    count: x.count,
    heat: clamp100((x.count / maxToolCount) * 100),
  }));

  const skillHeat = sortedSkills.map((x) => ({
    skillName: x.name,
    count: x.count,
    heat: clamp100((x.count / maxSkillCount) * 100),
  }));

  return {
    score,
    toolCallsTotal,
    toolKinds,
    skillKinds,
    toolHeat,
    skillHeat,
    topTools: topN(toolHeat, 12),
    topSkills: topN(skillHeat, 20),
    subScores: {
      toolDiversityScore,
      skillDiversityScore,
      intensityScore,
    },
  };
}

function classifyWorkRhythm(peakHour) {
  if (!Number.isFinite(peakHour)) return 'unknown';
  if (peakHour >= 0 && peakHour < 6) return 'night-owl';
  if (peakHour >= 6 && peakHour < 12) return 'morning';
  if (peakHour >= 12 && peakHour < 18) return 'afternoon';
  return 'evening';
}

/**
 * 任务习惯：活跃时段 + CWD 工作目录偏好
 */
export function calculateTaskHabit(input) {
  const stats = ensureStats(input);

  const hourly = Array.isArray(stats.hourlyActivity)
    ? stats.hourlyActivity.map((x) => Math.max(0, toNumber(x, 0))).slice(0, 24)
    : new Array(24).fill(0);
  while (hourly.length < 24) hourly.push(0);

  const totalActivity = hourly.reduce((a, b) => a + b, 0);
  const activeHours = hourly.filter((x) => x > 0).length;

  const hourlyRanked = hourly
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count);
  const peakHours = topN(hourlyRanked, 3);
  const peakHour = peakHours[0]?.hour;

  const peak3Ratio = totalActivity > 0
    ? peakHours.reduce((acc, x) => acc + x.count, 0) / totalActivity
    : 0;
  const scheduleConsistencyScore = clamp100(peak3Ratio * 100);

  const cwdRanked = sortCountMap(stats.cwdUsage || {}).map((x) => ({ cwd: x.name, count: x.count }));
  const cwdTotal = cwdRanked.reduce((acc, x) => acc + x.count, 0);
  const primaryCwd = cwdRanked[0] || null;
  const workdirFocusRatio = cwdTotal > 0 && primaryCwd ? primaryCwd.count / cwdTotal : 0;
  const workdirFocusScore = clamp100(workdirFocusRatio * 100);

  const activeHoursScore = clamp100((activeHours / 24) * 100);

  const score = clamp100(
    scheduleConsistencyScore * 0.45 +
    workdirFocusScore * 0.40 +
    activeHoursScore * 0.15
  );

  return {
    score,
    totalActivity,
    activeHours,
    peakHours,
    workRhythm: classifyWorkRhythm(peakHour),
    cwdDistribution: cwdRanked,
    primaryCwd: primaryCwd ? primaryCwd.cwd : null,
    subScores: {
      scheduleConsistencyScore,
      workdirFocusScore,
      activeHoursScore,
    },
  };
}

/**
 * 稳定与健康：成功率、报错频次、异常中断频率
 */
export function calculateStabilityHealth(input) {
  const stats = ensureStats(input);

  const totalRecords = Math.max(1, toNumber(stats.totalRecords, 0));
  const eventsWithExitCode = Math.max(0, toNumber(stats.eventsWithExitCode, 0));
  const successCount = Math.max(0, toNumber(stats.successCount, 0));
  const failureCount = Math.max(0, toNumber(stats.failureCount, 0));
  const errorCount = Math.max(0, toNumber(stats.errorCount, 0));
  const abnormalInterruptions = Math.max(0, toNumber(stats.abnormalInterruptions, 0));

  const successRateFromStats = toNumber(stats.successRate, NaN);
  const successRate = Number.isFinite(successRateFromStats)
    ? clamp01(successRateFromStats)
    : (eventsWithExitCode > 0 ? clamp01(successCount / eventsWithExitCode) : 0);

  const errorRate = clamp01(errorCount / totalRecords);

  const interruptRateFromStats = toNumber(stats.abnormalInterruptionRate, NaN);
  const abnormalInterruptionRate = Number.isFinite(interruptRateFromStats)
    ? clamp01(interruptRateFromStats)
    : clamp01(abnormalInterruptions / totalRecords);

  const successScore = clamp100(successRate * 100);
  const errorControlScore = clamp100((1 - errorRate) * 100);
  const interruptionControlScore = clamp100((1 - abnormalInterruptionRate) * 100);

  const score = clamp100(
    successScore * 0.65 +
    errorControlScore * 0.20 +
    interruptionControlScore * 0.15
  );

  return {
    score,
    successRate,
    successCount,
    failureCount,
    errorRate,
    errorCount,
    abnormalInterruptionRate,
    abnormalInterruptions,
    subScores: {
      successScore,
      errorControlScore,
      interruptionControlScore,
    },
  };
}

function rankLevel(rankScore) {
  if (rankScore >= 90) return 'S';
  if (rankScore >= 80) return 'A';
  if (rankScore >= 70) return 'B';
  if (rankScore >= 60) return 'C';
  return 'D';
}

/**
 * 综合画像：根据 5 个维度输出 1-100 分
 */
export function calculateCompositePortrait(dimensions, options = {}) {
  const weights = {
    consumption: toNumber(options?.weights?.consumption, 0.20),
    modelPreference: toNumber(options?.weights?.modelPreference, 0.15),
    toolSkill: toNumber(options?.weights?.toolSkill, 0.25),
    taskHabit: toNumber(options?.weights?.taskHabit, 0.15),
    stabilityHealth: toNumber(options?.weights?.stabilityHealth, 0.25),
  };

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const normalizedWeights = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, v / weightSum])
  );

  const scoreRaw = (
    toNumber(dimensions?.consumptionCost?.score, 0) * normalizedWeights.consumption +
    toNumber(dimensions?.modelPreference?.score, 0) * normalizedWeights.modelPreference +
    toNumber(dimensions?.toolSkillHeat?.score, 0) * normalizedWeights.toolSkill +
    toNumber(dimensions?.taskHabit?.score, 0) * normalizedWeights.taskHabit +
    toNumber(dimensions?.stabilityHealth?.score, 0) * normalizedWeights.stabilityHealth
  );

  const rankScore = Math.max(1, Math.round(clamp100(scoreRaw)));

  return {
    score: rankScore,
    level: rankLevel(rankScore),
    weights: normalizedWeights,
  };
}

/**
 * Unified OpenClaw portrait analysis entry
 */
export function analyzeOpenClawPortrait(input, options = {}) {
  const consumptionCost = calculateConsumptionCost(input);
  const modelPreference = calculateModelPreference(input);
  const toolSkillHeat = calculateToolSkillHeat(input);
  const taskHabit = calculateTaskHabit(input);
  const stabilityHealth = calculateStabilityHealth(input);

  const composite = calculateCompositePortrait({
    consumptionCost,
    modelPreference,
    toolSkillHeat,
    taskHabit,
    stabilityHealth,
  }, options);

  return {
    dimensions: {
      consumptionCost,
      modelPreference,
      toolSkillHeat,
      taskHabit,
      stabilityHealth,
    },
    composite,
  };
}

export class OpenClawPortraitAnalyzer {
  constructor(options = {}) {
    this.options = options || {};
  }

  analyze(input, runtimeOptions = {}) {
    return analyzeOpenClawPortrait(input, {
      ...(this.options || {}),
      ...(runtimeOptions || {}),
    });
  }
}

