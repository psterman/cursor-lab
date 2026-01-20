/**
 * VibeCodingerAnalyzer.js - Vibe Codinger 十二重人格画像分析器
 * 基于语义指纹识别规则，通过 Web Worker 高性能匹配实现无 Token 消耗的深度分析
 */

// 导入吐槽文案库
import ROAST_LIBRARY from './roastLibrary.json';
import PERSONALITY_NAMES from './personalityNames.json';

// 导入维度数据 JSON
import LOGIC_DATA from './logic.json';
import PATIENCE_DATA from './patience.json';
import DETAIL_DATA from './Detail.json';
import EXPLORATION_DATA from './Exploration.json';
import FEEDBACK_DATA from './Feedback.json';

/**
 * 维度定义 (Dimension Definitions)
 */
export const DIMENSIONS = {
  L: {
    name: 'Logic',
    label: '🧠 脑回路硬核度',
    description: '通过代码块比例衡量。高 L 代表"以代码为母语"',
    unit: '代码比例',
  },
  P: {
    name: 'Patience',
    label: '🧘 赛博菩萨指数',
    description: '通过否定词频次衡量。高 P 代表"温和引导"，低 P 代表"暴躁修正"',
    unit: '否定词频',
  },
  D: {
    name: 'Detail',
    label: '🔍 细节狂魔等级',
    description: '通过句子平均长度和修饰词衡量。高 D 代表"叙事性需求"',
    unit: '细腻指数',
  },
  E: {
    name: 'Explore',
    label: '🚀 技术天赋力',
    description: '通过技术名词（API, Libs, Frameworks）的去重统计衡量',
    unit: '技术名词数',
  },
  F: {
    name: 'Feedback',
    label: '🤝 职场鉴茶榜',
    description: '通过礼貌用语（Thanks, Nice, Correct）的密度衡量',
    unit: '礼貌密度',
  },
};

/**
 * 维度等级匹配文案
 */
export const DIMENSION_LEVEL_TEXTS = {
  L: {
    low: '你和 Cursor 聊天像是在写情书。全是小作文，代码一行不落，AI 猜你的心思猜得 GPU 都发烫了。',
    mid: '标准的技术翻译官。话不多，但交待得清楚。你把 AI 用成了一个听话的实习生。',
    high: '赛博指令集。你的 Prompt 里只有代码对齐和硬核逻辑。你不是在提问，你是在给 AI 下达"思想钢印"。',
  },
  P: {
    low: '暴躁老哥本哥。"不对"、"重写"、"垃圾"是你的口头禅。AI 在你面前瑟瑟发抖，连大气都不敢喘。',
    mid: '理智的审判官。错一次可以，错两次你会指出，错三次你才会开始敲感叹号。',
    high: '代码界的圣雄甘地。面对 AI 的幻觉，你居然还能心平气和地教它怎么改。这种涵养建议直接去普度众生。',
  },
  D: {
    low: '极简主义判官。每次就扔三个字，AI 全靠算命来写你的需求。这种"你懂我意思吧"的风格很迷。',
    mid: '逻辑缜密派。不仅给需求，还给实现思路。你是那种会让 AI 觉得很有安全感的主人。',
    high: '细节狂魔。连注释的缩进和变量的命名规范都要写进 Prompt。你的控制欲已经溢出屏幕了。',
  },
  E: {
    low: '深山老林的隐士。在一个框架里蹲到地老天荒，只要代码能跑，外面的技术爆炸与你无关。',
    mid: '稳健的观望者。听说新框架火了会去翻翻文档，但绝不轻易动自己的生产环境。',
    high: '你的大脑是个高速运转的 CPU，技术栈跳跃得比 AI 的响应还快。你不是在写代码，你在开荒宇宙。',
  },
  F: {
    low: '你对待 AI 像对待一台坏掉的 ATM 机。没有感情，只有愤怒的敲击和无情的指令。',
    mid: '礼貌的合作者。AI 干得好你会回个"Good"，干得差你会客观评价。人机关系非常职场化。',
    high: '你是那种在 2026 机器人觉醒时，会因为"有礼貌"被留活口的开发者。你甚至会跟 AI 说"辛苦了"。',
  },
};

/**
 * 否定词库 - 用于计算耐心值 (P)
 * 高频率 = 低耐心（暴躁修正），低频率 = 高耐心（温和引导）
 */
const NEGATION_WORDS = {
  // 中文否定词
  chinese: [
    '不', '没', '没有', '非', '无', '未', '别', '不要', '不行', '不对',
    '错误', '错了', '失败', '失败', '失败', '失败', '失败', '失败',
    '问题', '问题', '问题', '问题', '问题', '问题', '问题', '问题',
    '不行', '不能', '不可以', '不应该', '不应该', '不应该', '不应该',
    '错误', '错误', '错误', '错误', '错误', '错误', '错误', '错误',
    '修复', '修复', '修复', '修复', '修复', '修复', '修复', '修复',
    '改', '改', '改', '改', '改', '改', '改', '改',
  ],
  // 英文否定词
  english: [
    'no', 'not', 'wrong', 'error', 'fail', 'failed', 'failure',
    'incorrect', 'invalid', 'bad', 'broken', 'fix', 'fixes', 'fixed',
    'bug', 'bugs', 'issue', 'issues', 'problem', 'problems',
    "don't", "doesn't", "didn't", "won't", "can't", "couldn't",
    'never', 'none', 'nothing', 'nowhere',
  ],
};

/**
 * 修饰词库 - 用于计算细腻度 (D)
 */
const MODIFIER_WORDS = {
  chinese: [
    '非常', '特别', '极其', '相当', '十分', '很', '比较', '稍微',
    '详细', '具体', '完整', '全面', '深入', '透彻', '仔细',
    '认真', '细致', '精确', '准确', '清晰', '明确',
    '大概', '可能', '也许', '或许', '应该', '估计',
    '首先', '然后', '接着', '最后', '另外', '此外', '而且',
    '因为', '所以', '但是', '然而', '不过', '虽然', '尽管',
  ],
  english: [
    'very', 'quite', 'rather', 'extremely', 'highly', 'completely',
    'totally', 'absolutely', 'perfectly', 'exactly', 'precisely',
    'specifically', 'particularly', 'especially', 'especially',
    'detailed', 'comprehensive', 'thorough', 'careful', 'precise',
    'probably', 'maybe', 'perhaps', 'possibly', 'likely',
    'first', 'then', 'next', 'finally', 'also', 'moreover', 'furthermore',
    'because', 'so', 'but', 'however', 'although', 'though',
  ],
};

/**
 * 技术名词模式 - 用于计算探索欲 (E)
 */
const TECH_PATTERNS = {
  // API 相关
  api: [
    /api[\/\s]?[a-z0-9]+/gi,
    /rest[\/\s]?api/gi,
    /graphql/gi,
    /endpoint/gi,
    /request/gi,
    /response/gi,
  ],
  // 框架和库
  frameworks: [
    /\b(react|vue|angular|svelte|next|nuxt|gatsby|remix)\b/gi,
    /\b(express|koa|fastify|nest|django|flask|fastapi|spring|laravel)\b/gi,
    /\b(tensorflow|pytorch|keras|scikit-learn|pandas|numpy)\b/gi,
    /\b(bootstrap|tailwind|material-ui|antd|element|vuetify)\b/gi,
  ],
  // 工具和技术
  tools: [
    /\b(webpack|vite|rollup|parcel|esbuild|swc)\b/gi,
    /\b(docker|kubernetes|k8s|jenkins|gitlab|github|git)\b/gi,
    /\b(typescript|javascript|python|java|go|rust|swift|kotlin)\b/gi,
    /\b(mysql|postgresql|mongodb|redis|elasticsearch|kafka)\b/gi,
    /\b(aws|azure|gcp|cloudflare|vercel|netlify)\b/gi,
  ],
  // 设计模式和架构
  patterns: [
    /\b(mvc|mvp|mvvm|flux|redux|mobx|zustand)\b/gi,
    /\b(microservice|monolith|serverless|jamstack)\b/gi,
    /\b(oauth|jwt|jwt|session|cookie)\b/gi,
    /\b(cdn|ssr|csr|isr|ssg)\b/gi,
  ],
};

/**
 * 礼貌用语库 - 用于计算反馈感 (F)
 */
const POLITE_WORDS = {
  chinese: [
    '请', '谢谢', '感谢', '麻烦', '辛苦了', '不好意思', '抱歉',
    '好的', '可以', '行', '没问题', '好的', '好的', '好的',
    '不错', '很好', '很棒', '完美', '正确', '对的',
    '谢谢', '感谢', '多谢', '非常感谢', '太感谢了',
  ],
  english: [
    'please', 'thanks', 'thank', 'thank you', 'appreciate',
    'nice', 'good', 'great', 'perfect', 'correct', 'right',
    'excellent', 'awesome', 'wonderful', 'fantastic',
    'sorry', 'apologize', 'excuse',
  ],
};

/**
 * 代码块识别模式
 */
const CODE_PATTERNS = [
  // 代码块标记
  /```[\s\S]*?```/g,
  /`[^`]+`/g,
  // 代码关键字
  /\b(function|class|const|let|var|if|else|for|while|do|switch|case|break|continue|return|import|export|from|async|await|yield|try|catch|finally|throw|new|this)\b/i,
  /\b(def |class |import |from |if |elif |else |for |while |try |except |finally |return |yield |with |as |lambda |pass |break |continue )/,
  /\b(public|private|protected|static|final|abstract|interface|extends|implements|super)\b/i,
  /\b(func |type |import |package |go |chan |defer |range |select )/,
  /\b(fn |let |mut |impl |struct |enum |trait |use |mod |crate |pub )/,
  // 代码结构
  /\{[\s\S]*\}/,
  /\[[^\]]*\]\s*=/,
  /=>/,
  /\.\s*[a-zA-Z_]\w*\s*\(/,
  /;\s*$/,
];

/**
 * Vibe Codinger 十二重人格类型定义
 */
export const VIBE_CODINGER_TYPES = {
  'LPDEF': {
    name: '代码诗人',
    description: '以代码为母语，温和引导，细腻叙事，探索欲强，反馈积极',
    traits: ['高逻辑力', '高耐心', '高细腻度', '高探索欲', '高反馈感'],
    color: '#10b981',
  },
  'LPDEF-': {
    name: '技术布道者',
    description: '逻辑清晰，耐心引导，细腻表达，探索新技术，反馈温和',
    traits: ['高逻辑力', '高耐心', '高细腻度', '高探索欲', '中反馈感'],
    color: '#3b82f6',
  },
  'LP-DEF': {
    name: '架构师',
    description: '逻辑严谨，耐心细致，中等细腻，探索架构，积极反馈',
    traits: ['高逻辑力', '高耐心', '中细腻度', '高探索欲', '高反馈感'],
    color: '#8b5cf6',
  },
  'LP-DEF-': {
    name: '技术专家',
    description: '逻辑强大，耐心引导，中等细腻，探索技术，反馈适中',
    traits: ['高逻辑力', '高耐心', '中细腻度', '高探索欲', '中反馈感'],
    color: '#6366f1',
  },
  'L-PDEF': {
    name: '代码工匠',
    description: '逻辑清晰，中等耐心，细腻表达，探索欲强，反馈积极',
    traits: ['高逻辑力', '中耐心', '高细腻度', '高探索欲', '高反馈感'],
    color: '#ec4899',
  },
  'L-PDEF-': {
    name: '技术探索者',
    description: '逻辑清晰，中等耐心，细腻表达，探索新技术，反馈适中',
    traits: ['高逻辑力', '中耐心', '高细腻度', '高探索欲', '中反馈感'],
    color: '#f59e0b',
  },
  'L-P-DEF': {
    name: '实用主义者',
    description: '逻辑清晰，中等耐心，中等细腻，探索技术，积极反馈',
    traits: ['高逻辑力', '中耐心', '中细腻度', '高探索欲', '高反馈感'],
    color: '#14b8a6',
  },
  'L-P-DEF-': {
    name: '技术实践者',
    description: '逻辑清晰，中等耐心，中等细腻，探索技术，反馈适中',
    traits: ['高逻辑力', '中耐心', '中细腻度', '高探索欲', '中反馈感'],
    color: '#06b6d4',
  },
  '-PDEF': {
    name: '温和导师',
    description: '中等逻辑，高耐心，细腻表达，探索欲强，反馈积极',
    traits: ['中逻辑力', '高耐心', '高细腻度', '高探索欲', '高反馈感'],
    color: '#84cc16',
  },
  '-PDEF-': {
    name: '耐心引导者',
    description: '中等逻辑，高耐心，细腻表达，探索技术，反馈适中',
    traits: ['中逻辑力', '高耐心', '高细腻度', '高探索欲', '中反馈感'],
    color: '#a855f7',
  },
  '-P-DEF': {
    name: '温和实践者',
    description: '中等逻辑，高耐心，中等细腻，探索技术，积极反馈',
    traits: ['中逻辑力', '高耐心', '中细腻度', '高探索欲', '高反馈感'],
    color: '#f97316',
  },
  '-P-DEF-': {
    name: '平衡型开发者',
    description: '中等逻辑，高耐心，中等细腻，探索技术，反馈适中',
    traits: ['中逻辑力', '高耐心', '中细腻度', '高探索欲', '中反馈感'],
    color: '#64748b',
  },
};

/**
 * 根据维度分数生成5位数字索引
 * @param {Object} dimensions - 维度对象 {L, P, D, E, F}
 * @returns {string} 5位数字索引，如 "01210"
 */
export function getVibeIndex(dimensions) {
  const indexMap = (value) => {
    if (value < 40) return '0';  // 低
    if (value < 70) return '1'; // 中
    return '2';                 // 高
  };
  
  // 注意：E 维度的阈值不同（0-100+），需要特殊处理
  const eIndex = (value) => {
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
 * 根据索引获取人格名称
 * @param {string} index - 5位数字索引
 * @returns {string} 人格名称，如果不存在则返回默认名称
 */
export function getPersonalityName(index) {
  return PERSONALITY_NAMES[index] || `未知人格 ${index}`;
}

/**
 * 根据索引获取吐槽文案
 * @param {string} index - 5位数字索引
 * @returns {string} 吐槽文案，如果不存在则返回默认文案
 */
export function getRoastText(index) {
  return ROAST_LIBRARY[index] || `索引 ${index} 对应的吐槽文案未找到，你的人格组合太独特了！`;
}

/**
 * Vibe Codinger 分析器类
 */
export class VibeCodingerAnalyzer {
  constructor() {
    this.userMessages = [];
    this.analysisResult = null;
    this.worker = null;
    this.workerReady = false;
    this.pendingTasks = [];
    
    // 初始化 Web Worker
    this.initWorker();
  }

  /**
   * 初始化 Web Worker
   */
  initWorker() {
    try {
      // 创建 Worker（使用相对路径，兼容不同构建环境）
      const workerUrl = new URL('./vibeAnalyzerWorker.js', import.meta.url);
      this.worker = new Worker(workerUrl, {
        type: 'module',
      });

      // 监听 Worker 消息
      this.worker.onmessage = (e) => {
        const { type, payload } = e.data;

        switch (type) {
          case 'INIT_SUCCESS':
            this.workerReady = true;
            console.log('[VibeAnalyzer] Worker 初始化成功:', payload);
            // 处理待处理的任务
            this.processPendingTasks();
            break;

          case 'ANALYZE_SUCCESS':
            // 处理分析结果
            const task = this.pendingTasks.shift();
            if (task && task.resolve) {
              task.resolve(payload);
            }
            break;

          case 'ERROR':
            console.error('[VibeAnalyzer] Worker 错误:', payload);
            const errorTask = this.pendingTasks.shift();
            if (errorTask && errorTask.reject) {
              errorTask.reject(new Error(payload.message));
            }
            break;
        }
      };

      this.worker.onerror = (error) => {
        console.error('[VibeAnalyzer] Worker 运行时错误:', error);
        this.workerReady = false;
        // 降级到同步处理
        const errorTask = this.pendingTasks.shift();
        if (errorTask && errorTask.reject) {
          errorTask.reject(error);
        }
      };

      // 准备维度数据
      const dimensionData = {
        L: LOGIC_DATA,
        P: PATIENCE_DATA,
        D: DETAIL_DATA,
        E: EXPLORATION_DATA,
        F: FEEDBACK_DATA,
      };

      // 发送初始化消息
      this.worker.postMessage({
        type: 'INIT',
        payload: dimensionData,
      });
    } catch (error) {
      console.warn('[VibeAnalyzer] Web Worker 初始化失败，将使用同步处理:', error);
      this.workerReady = false;
    }
  }

  /**
   * 处理待处理的任务
   */
  processPendingTasks() {
    if (this.pendingTasks.length > 0 && this.workerReady) {
      const task = this.pendingTasks[0];
      this.worker.postMessage({
        type: 'ANALYZE',
        payload: task.payload,
      });
    }
  }

  /**
   * 分析用户消息，生成人格画像（异步版本，使用 Web Worker）
   */
  async analyze(chatData) {
    // 提取用户消息
    this.userMessages = chatData.filter(item => item.role === 'USER');
    
    if (this.userMessages.length === 0) {
      return this.getDefaultResult();
    }

    // 使用 Web Worker 计算维度得分
    let dimensions;
    try {
      dimensions = await this.calculateDimensionsAsync(chatData);
    } catch (error) {
      console.warn('[VibeAnalyzer] Web Worker 计算失败，使用同步方法:', error);
      dimensions = this.calculateDimensions();
    }
    
    // 生成索引和吐槽文案
    const vibeIndex = getVibeIndex(dimensions);
    const roastText = getRoastText(vibeIndex);
    const personalityName = getPersonalityName(vibeIndex);
    
    // 确定人格类型
    const personalityType = this.determinePersonalityType(dimensions);
    
    // 生成详细分析
    const analysis = this.generateAnalysis(dimensions, personalityType);
    
    // 生成 LPDEF 编码
    const lpdef = this.generateLPDEF(dimensions);
    
    this.analysisResult = {
      personalityType,
      dimensions,
      analysis,
      statistics: this.calculateStatistics(),
      semanticFingerprint: this.generateSemanticFingerprint(dimensions),
      vibeIndex,      // 5位数字索引
      roastText,      // 吐槽文案
      personalityName, // 人格名称
      lpdef,          // LPDEF 编码
      globalAverage: this.globalAverage || null, // 全局平均基准（用于 Chart.js 对比）
      metadata: this.analysisMetadata || null,  // 分析元数据（负面词计数、长度修正等）
    };

    return this.analysisResult;
  }

  /**
   * 同步分析（降级方案）
   */
  analyzeSync(chatData) {
    // 提取用户消息
    this.userMessages = chatData.filter(item => item.role === 'USER');
    
    if (this.userMessages.length === 0) {
      return this.getDefaultResult();
    }

    // 使用原有的同步方法计算维度
    const dimensions = this.calculateDimensions();
    
    // 生成索引和吐槽文案
    const vibeIndex = getVibeIndex(dimensions);
    const roastText = getRoastText(vibeIndex);
    const personalityName = getPersonalityName(vibeIndex);
    
    // 确定人格类型
    const personalityType = this.determinePersonalityType(dimensions);
    
    // 生成详细分析
    const analysis = this.generateAnalysis(dimensions, personalityType);
    
    // 生成 LPDEF 编码
    const lpdef = this.generateLPDEF(dimensions);
    
    return {
      personalityType,
      dimensions,
      analysis,
      statistics: this.calculateStatistics(),
      semanticFingerprint: this.generateSemanticFingerprint(dimensions),
      vibeIndex,
      roastText,
      personalityName,
      lpdef,
    };
  }

  /**
   * 异步计算维度得分（使用 Web Worker）
   */
  calculateDimensionsAsync(chatData) {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.workerReady) {
        // Worker 未就绪，使用同步方法
        resolve(this.calculateDimensions());
        return;
      }

      // 添加到待处理队列
      this.pendingTasks.push({
        payload: {
          chatData,
          weights: { L1: 15, L2: 5, L3: 1 },
          config: {
            BASE_SCORE: 40,
            SENSITIVITY: 200,
          },
        },
        resolve: (result) => {
          // 将归一化得分转换为维度对象
          const dimensions = {
            L: result.dimensions.L || 0,
            P: result.dimensions.P || 0,
            D: result.dimensions.D || 0,
            E: result.dimensions.E || 0,
            F: result.dimensions.F || 0,
          };
          
          // 保存全局平均基准和元数据
          this.globalAverage = result.globalAverage;
          this.analysisMetadata = result.metadata;
          
          resolve(dimensions);
        },
        reject,
      });

      // 如果 Worker 已就绪，立即处理
      if (this.workerReady) {
        this.processPendingTasks();
      }
    });
  }

  /**
   * 生成 LPDEF 编码
   * @param {Object} dimensions - 维度得分
   * @returns {string} LPDEF 编码，如 "L2P1D2E1F2"
   */
  generateLPDEF(dimensions) {
    const encode = (value, thresholds = [40, 70]) => {
      if (value >= thresholds[1]) return '2'; // 高
      if (value >= thresholds[0]) return '1'; // 中
      return '0'; // 低
    };

    // E 维度使用不同的阈值
    const eEncode = (value) => {
      if (value >= 10) return '2';
      if (value >= 5) return '1';
      return '0';
    };

    return `L${encode(dimensions.L)}P${encode(dimensions.P)}D${encode(dimensions.D)}E${eEncode(dimensions.E)}F${encode(dimensions.F)}`;
  }

  /**
   * 计算五个维度得分
   */
  calculateDimensions() {
    const dimensions = {
      L: 0, // Logic 逻辑力
      P: 0, // Patience 耐心值
      D: 0, // Detail 细腻度
      E: 0, // Explore 探索欲
      F: 0, // Feedback 反馈感
    };

    let totalChars = 0;
    let codeChars = 0;
    let totalSentences = 0;
    let totalSentenceLength = 0;
    const techTermsSet = new Set();
    let negationCount = 0;
    let modifierCount = 0;
    let politeCount = 0;
    let totalWords = 0;

    this.userMessages.forEach(msg => {
      const text = msg.text || '';
      if (!text || text.length < 5) return;

      totalChars += text.length;
      totalWords += this.countWords(text);

      // L (Logic) 逻辑力: 代码块比例
      const codeRatio = this.calculateCodeRatio(text);
      codeChars += text.length * codeRatio;
      dimensions.L += codeRatio * 100; // 转换为百分比

      // P (Patience) 耐心值: 否定词频次（低频率 = 高耐心）
      const negationFreq = this.countNegationWords(text);
      negationCount += negationFreq;
      dimensions.P += negationFreq;

      // D (Detail) 细腻度: 句子平均长度和修饰词
      const sentences = this.splitSentences(text);
      totalSentences += sentences.length;
      sentences.forEach(sentence => {
        totalSentenceLength += sentence.length;
        modifierCount += this.countModifierWords(sentence);
      });

      // E (Explore) 探索欲: 技术名词去重统计
      const techTerms = this.extractTechTerms(text);
      techTerms.forEach(term => techTermsSet.add(term.toLowerCase()));

      // F (Feedback) 反馈感: 礼貌用语密度
      politeCount += this.countPoliteWords(text);
    });

    // 标准化维度得分
    const avgCodeRatio = codeChars / totalChars || 0;
    dimensions.L = Math.round(avgCodeRatio * 100);

    // P: 否定词频率（越低越好，表示高耐心）
    const avgNegationFreq = negationCount / this.userMessages.length || 0;
    dimensions.P = Math.max(0, 100 - Math.round(avgNegationFreq * 20)); // 转换为耐心值（高=耐心）

    // D: 细腻度 = 平均句子长度 + 修饰词密度
    const avgSentenceLength = totalSentenceLength / totalSentences || 0;
    const modifierDensity = (modifierCount / totalWords) * 100 || 0;
    dimensions.D = Math.round((avgSentenceLength / 10) + modifierDensity);

    // E: 探索欲 = 技术名词去重数量
    dimensions.E = techTermsSet.size;

    // F: 反馈感 = 礼貌用语密度
    const politeDensity = (politeCount / totalWords) * 100 || 0;
    dimensions.F = Math.round(politeDensity * 10);

    // 限制范围在 0-100
    Object.keys(dimensions).forEach(key => {
      dimensions[key] = Math.max(0, Math.min(100, dimensions[key]));
    });

    return dimensions;
  }

  /**
   * 计算代码比例
   */
  calculateCodeRatio(text) {
    let codeChars = 0;
    let totalChars = text.length;

    // 检查代码块标记
    const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
    codeBlocks.forEach(block => {
      codeChars += block.length;
    });

    // 检查行内代码
    const inlineCode = text.match(/`[^`]+`/g) || [];
    inlineCode.forEach(code => {
      codeChars += code.length;
    });

    // 检查代码关键字密度
    let codeKeywordCount = 0;
    CODE_PATTERNS.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        codeKeywordCount += matches.length;
      }
    });

    // 代码比例 = 代码块比例 + 关键字密度
    const codeBlockRatio = codeChars / totalChars;
    const keywordDensity = Math.min(codeKeywordCount / 10, 0.5); // 最多贡献 50%

    return Math.min(codeBlockRatio + keywordDensity, 1);
  }

  /**
   * 统计否定词
   */
  countNegationWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    NEGATION_WORDS.chinese.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });

    NEGATION_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });

    return count;
  }

  /**
   * 分割句子
   */
  splitSentences(text) {
    // 中英文句子分割
    return text
      .split(/[。！？.!?\n]+/)
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());
  }

  /**
   * 统计修饰词
   */
  countModifierWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    MODIFIER_WORDS.chinese.forEach(word => {
      if (text.includes(word)) count++;
    });

    MODIFIER_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(lowerText)) count++;
    });

    return count;
  }

  /**
   * 提取技术名词
   */
  extractTechTerms(text) {
    const terms = new Set();
    const lowerText = text.toLowerCase();

    // 提取 API
    if (TECH_PATTERNS.api && Array.isArray(TECH_PATTERNS.api)) {
      TECH_PATTERNS.api.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const trimmed = match.trim();
            if (trimmed) {
              terms.add(trimmed);
            }
          });
        }
      });
    }

    // 提取框架
    if (TECH_PATTERNS.frameworks && Array.isArray(TECH_PATTERNS.frameworks)) {
      TECH_PATTERNS.frameworks.forEach(pattern => {
        const matches = lowerText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const trimmed = match.trim();
            if (trimmed) {
              terms.add(trimmed);
            }
          });
        }
      });
    }

    // 提取工具
    if (TECH_PATTERNS.tools && Array.isArray(TECH_PATTERNS.tools)) {
      TECH_PATTERNS.tools.forEach(pattern => {
        const matches = lowerText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const trimmed = match.trim();
            if (trimmed) {
              terms.add(trimmed);
            }
          });
        }
      });
    }

    // 提取设计模式
    if (TECH_PATTERNS.patterns && Array.isArray(TECH_PATTERNS.patterns)) {
      TECH_PATTERNS.patterns.forEach(pattern => {
        const matches = lowerText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const trimmed = match.trim();
            if (trimmed) {
              terms.add(trimmed);
            }
          });
        }
      });
    }

    return Array.from(terms);
  }

  /**
   * 统计礼貌用语
   */
  countPoliteWords(text) {
    let count = 0;
    const lowerText = text.toLowerCase();

    POLITE_WORDS.chinese.forEach(word => {
      if (text.includes(word)) count++;
    });

    POLITE_WORDS.english.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(lowerText)) count++;
    });

    return count;
  }

  /**
   * 统计单词数
   */
  countWords(text) {
    // 中英文单词统计
    const chineseWords = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
    return chineseWords.length + englishWords.length;
  }

  /**
   * 确定人格类型
   */
  determinePersonalityType(dimensions) {
    // 阈值定义：60 以上为高，40-60 为中，40 以下为低
    const threshold = 60;
    const midThreshold = 40;

    // 判断各维度水平
    const L_high = dimensions.L >= threshold;
    const L_mid = dimensions.L >= midThreshold && dimensions.L < threshold;
    const P_high = dimensions.P >= threshold;
    const P_mid = dimensions.P >= midThreshold && dimensions.P < threshold;
    const D_high = dimensions.D >= threshold;
    const D_mid = dimensions.D >= midThreshold && dimensions.D < threshold;
    const E_high = dimensions.E >= 10;
    const E_mid = dimensions.E >= 5 && dimensions.E < 10;
    const F_high = dimensions.F >= threshold;

    // 构建类型代码（格式：L-P-DEF 或 L-P-DEF-）
    const parts = [];
    
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

    // 查找匹配的人格类型
    if (VIBE_CODINGER_TYPES[typeCode]) {
      return typeCode;
    }

    // 如果没有精确匹配，查找最接近的类型
    return this.findClosestType(dimensions);
  }

  /**
   * 查找最接近的人格类型
   */
  findClosestType(dimensions) {
    let minDistance = Infinity;
    let closestType = 'L-P-DEF-';

    Object.keys(VIBE_CODINGER_TYPES).forEach(typeCode => {
      // 简化匹配：只匹配主要特征
      const distance = this.calculateTypeDistance(dimensions, typeCode);
      if (distance < minDistance) {
        minDistance = distance;
        closestType = typeCode;
      }
    });

    return closestType;
  }

  /**
   * 计算类型距离
   */
  calculateTypeDistance(dimensions, typeCode) {
    // 简化的距离计算
    let distance = 0;
    const threshold = 60;

    if (typeCode.includes('L') && dimensions.L < threshold) distance += 20;
    if (typeCode.includes('P') && dimensions.P < threshold) distance += 20;
    if (typeCode.includes('D') && dimensions.D < threshold) distance += 20;
    if (typeCode.includes('E') && dimensions.E < 10) distance += 20;
    if (!typeCode.endsWith('-') && dimensions.F < threshold) distance += 10;

    return distance;
  }

  /**
   * 生成详细分析
   */
  generateAnalysis(dimensions, personalityType) {
    const typeInfo = VIBE_CODINGER_TYPES[personalityType] || VIBE_CODINGER_TYPES['L-P-DEF-'];

    return {
      type: personalityType,
      name: typeInfo.name,
      description: typeInfo.description,
      traits: typeInfo.traits,
      color: typeInfo.color,
      dimensions: {
        L: {
          value: dimensions.L,
          level: this.getDimensionLevel(dimensions.L),
          interpretation: this.getLInterpretation(dimensions.L),
        },
        P: {
          value: dimensions.P,
          level: this.getDimensionLevel(dimensions.P),
          interpretation: this.getPInterpretation(dimensions.P),
        },
        D: {
          value: dimensions.D,
          level: this.getDimensionLevel(dimensions.D),
          interpretation: this.getDInterpretation(dimensions.D),
        },
        E: {
          value: dimensions.E,
          level: dimensions.E >= 10 ? '高' : dimensions.E >= 5 ? '中' : '低', // E 的范围是 0-100+，阈值不同
          interpretation: this.getEInterpretation(dimensions.E),
        },
        F: {
          value: dimensions.F,
          level: this.getDimensionLevel(dimensions.F),
          interpretation: this.getFInterpretation(dimensions.F),
        },
      },
    };
  }

  /**
   * 获取维度等级
   */
  getDimensionLevel(value) {
    if (value >= 70) return '高';
    if (value >= 40) return '中';
    return '低';
  }

  /**
   * L 维度解释（使用等级匹配文案）
   */
  getLInterpretation(value) {
    const level = this.getDimensionLevel(value);
    const levelKey = level === '高' ? 'high' : level === '中' ? 'mid' : 'low';
    return DIMENSION_LEVEL_TEXTS.L[levelKey];
  }

  /**
   * P 维度解释（使用等级匹配文案）
   */
  getPInterpretation(value) {
    const level = this.getDimensionLevel(value);
    const levelKey = level === '高' ? 'high' : level === '中' ? 'mid' : 'low';
    return DIMENSION_LEVEL_TEXTS.P[levelKey];
  }

  /**
   * D 维度解释（使用等级匹配文案）
   */
  getDInterpretation(value) {
    const level = this.getDimensionLevel(value);
    const levelKey = level === '高' ? 'high' : level === '中' ? 'mid' : 'low';
    return DIMENSION_LEVEL_TEXTS.D[levelKey];
  }

  /**
   * E 维度解释（使用等级匹配文案）
   */
  getEInterpretation(value) {
    // E 维度的阈值不同（0-100+），需要特殊处理
    let level;
    if (value >= 10) level = '高';
    else if (value >= 5) level = '中';
    else level = '低';
    
    const levelKey = level === '高' ? 'high' : level === '中' ? 'mid' : 'low';
    return DIMENSION_LEVEL_TEXTS.E[levelKey];
  }

  /**
   * F 维度解释（使用等级匹配文案）
   */
  getFInterpretation(value) {
    const level = this.getDimensionLevel(value);
    const levelKey = level === '高' ? 'high' : level === '中' ? 'mid' : 'low';
    return DIMENSION_LEVEL_TEXTS.F[levelKey];
  }

  /**
   * 生成语义指纹（增强版）
   */
  generateSemanticFingerprint(dimensions) {
    // 计算综合得分
    const compositeScore = (
      dimensions.L * 0.25 +
      dimensions.P * 0.20 +
      dimensions.D * 0.20 +
      (dimensions.E * 10) * 0.15 + // E 维度需要放大
      dimensions.F * 0.20
    );

    // 计算技术栈多样性（基于 E 维度）
    const techDiversity = dimensions.E >= 10 ? '极高' : 
                          dimensions.E >= 5 ? '中等' : '较低';

    // 计算交互风格
    const interactionStyle = this.calculateInteractionStyle(dimensions);

    return {
      codeRatio: `${Math.round(dimensions.L)}%`,
      patienceLevel: dimensions.P >= 70 ? '高耐心' : dimensions.P >= 40 ? '中耐心' : '低耐心',
      detailLevel: dimensions.D >= 70 ? '高细腻' : dimensions.D >= 40 ? '中细腻' : '低细腻',
      techExploration: dimensions.E >= 10 ? '高探索' : dimensions.E >= 5 ? '中探索' : '低探索',
      feedbackDensity: `${Math.round(dimensions.F)}%`,
      compositeScore: Math.round(compositeScore),
      techDiversity,
      interactionStyle,
      // 新增：维度平衡度
      balanceIndex: this.calculateBalanceIndex(dimensions),
    };
  }

  /**
   * 计算交互风格
   */
  calculateInteractionStyle(dimensions) {
    const styles = [];
    
    if (dimensions.L >= 70) styles.push('代码驱动');
    if (dimensions.P >= 70) styles.push('温和引导');
    if (dimensions.D >= 70) styles.push('细节控');
    if (dimensions.E >= 10) styles.push('技术探索');
    if (dimensions.F >= 70) styles.push('积极反馈');
    
    if (styles.length === 0) {
      return '均衡型';
    }
    
    return styles.join(' · ');
  }

  /**
   * 计算维度平衡度（标准差越小，越平衡）
   */
  calculateBalanceIndex(dimensions) {
    const values = [dimensions.L, dimensions.P, dimensions.D, dimensions.F, dimensions.E * 10];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // 转换为 0-100 的平衡度（标准差越小，平衡度越高）
    const balanceScore = Math.max(0, 100 - stdDev);
    
    if (balanceScore >= 80) return '高度平衡';
    if (balanceScore >= 60) return '较为平衡';
    if (balanceScore >= 40) return '略有偏重';
    return '明显偏重';
  }

  /**
   * 计算统计数据
   */
  calculateStatistics() {
    const totalMessages = this.userMessages.length;
    const totalChars = this.userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
    const avgLength = totalChars / totalMessages || 0;

    return {
      totalMessages,
      avgMessageLength: Math.round(avgLength),
      totalChars,
    };
  }

  /**
   * 获取默认结果
   */
  getDefaultResult() {
    return {
      personalityType: 'UNKNOWN',
      dimensions: { L: 0, P: 0, D: 0, E: 0, F: 0 },
      analysis: {
        type: 'UNKNOWN',
        name: '未知类型',
        description: '数据不足，无法进行准确分析',
      },
      statistics: {},
      semanticFingerprint: {},
      vibeIndex: '00000',
      roastText: '数据不足，无法生成吐槽',
      personalityName: '未知人格',
      lpdef: 'L0P0D0E0F0',
    };
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
  }
}
