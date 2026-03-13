/**
 * OpenClawRadarAdapter.js
 * 将 OpenClawPortraitAnalyzer 的 5 维分数映射为 Chart.js 雷达图所需格式
 * 维度：消耗、模型、工具、习惯、稳定
 */

const DIMENSION_KEYS = [
  'consumptionCost',
  'modelPreference',
  'toolSkillHeat',
  'taskHabit',
  'stabilityHealth',
];

const LABELS_ZH = ['消耗', '模型', '工具', '习惯', '稳定'];
const LABELS_EN = ['Consumption', 'Model', 'Tool', 'Habit', 'Stability'];

/**
 * 从 portrait 结果中提取 5 维分数，供 Chart.js radar 使用
 * @param {Object} portrait - analyzeOpenClawPortrait 的返回值
 * @param {{ lang?: string }} options - lang: 'zh' | 'en'
 * @returns {{ labels: string[], values: number[] }}
 */
export function portraitToRadarData(portrait, options = {}) {
  const lang = (options.lang || '').toLowerCase();
  const isEn = lang === 'en';
  const labels = isEn ? [...LABELS_EN] : [...LABELS_ZH];
  const dims = portrait?.dimensions || {};
  const values = DIMENSION_KEYS.map((key) => {
    const d = dims[key];
    const score = d && typeof d.score === 'number' ? d.score : 0;
    return Math.max(0, Math.min(100, score));
  });
  return { labels, values };
}

/**
 * 创建 Chart.js 雷达图 dataset 配置（OpenClaw 虾青/橙主题）
 * @param {number[]} values - 5 维分数
 * @param {string} [label] - 数据集标签
 * @returns {Object} Chart.js dataset
 */
export function buildRadarDataset(values, label = 'OpenClaw') {
  const fill = 'rgba(0, 139, 139, 0.2)';
  const border = 'rgba(0, 139, 139, 1)';
  const point = 'rgba(255, 127, 80, 1)';
  return {
    label,
    data: values,
    backgroundColor: fill,
    borderColor: border,
    borderWidth: 2,
    pointBackgroundColor: point,
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: border,
    pointRadius: 5,
    pointHoverRadius: 6,
  };
}

/**
 * 使用 Chart.js 在指定 canvas 上渲染 OpenClaw 雷达图
 * @param {HTMLCanvasElement} canvas
 * @param {Object} portrait - analyzeOpenClawPortrait 返回值
 * @param {{ lang?: string, Chart?: typeof Chart }} options
 * @returns {Chart|undefined}
 */
export function renderOpenClawRadar(canvas, portrait, options = {}) {
  const Chart = options.Chart || (typeof window !== 'undefined' ? window.Chart : null);
  if (!Chart || !canvas) return undefined;

  const { labels, values } = portraitToRadarData(portrait, { lang: options.lang });
  const dataset = buildRadarDataset(values, options.lang === 'en' ? 'Your Score' : '你的得分');

  if (window.__openclawRadarChartInstance) {
    window.__openclawRadarChartInstance.destroy();
    window.__openclawRadarChartInstance = null;
  }

  const ctx = canvas.getContext('2d');
  window.__openclawRadarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [dataset],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 20 },
          pointLabels: {
            color: '#008B8B',
            font: { size: 12, family: "'JetBrains Mono', monospace" },
          },
          grid: { color: 'rgba(0, 139, 139, 0.3)' },
          angleLines: { color: 'rgba(0, 139, 139, 0.3)' },
        },
      },
      plugins: {
        legend: {
          display: !!options.showLegend,
          labels: { color: '#008B8B' },
        },
      },
    },
  });

  return window.__openclawRadarChartInstance;
}
