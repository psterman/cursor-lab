/**
 * VibeCodingerAnalyzer.js - Vibe Codinger 十二重人格画像分析器
 * 基于语义指纹识别规则，通过 Web Worker 高性能匹配实现无 Token 消耗的深度分析
 */

// 导入吐槽文案库
import ROAST_LIBRARY from './roastLibrary.json';
import ROAST_LIBRARY_EN from './roastLibrary2.json';
import PERSONALITY_NAMES from './personalityNames.json';
import PERSONALITY_NAMES_EN from './personalityNamesEn.json';

// 导入维度数据 JSON
import LOGIC_DATA from './logic.json';
import PATIENCE_DATA from './patience.json';
import DETAIL_DATA from './Detail.json';
import EXPLORATION_DATA from './Exploration.json';
import FEEDBACK_DATA from './Feedback.json';

import { getText } from './i18n.js';

/**
 * ==========================================
 * AC 自动机优化：词库预处理模块
 * ==========================================
 */

/**
 * 稀有度分值（IDF 模拟值）
 * 专业词汇权重大于通用词汇
 * L1 (专家词): 稀有度高，IDF = 5.0
 * L2 (中等词): 稀有度中等，IDF = 2.0
 * L3 (常用词): 稀有度低，IDF = 1.0
 */
const RARITY_SCORES = {
  L1: 5.0, // 专家词/神谕词（如"幂等性"、"依赖反转"）
  L2: 2.0, // 中等词（如"初始化"、"队列"）
  L3: 1.0, // 常用词/噪音词（如"先"、"然后"）
};

/**
 * 语义权重矩阵（保持原有配置）
 */
const SEMANTIC_WEIGHTS = { L1: 10, L2: 5, L3: 1 };

/**
 * 预处理维度数据，为 AC 自动机准备优化的词库结构
 * @param {Object} rawData - 原始维度数据（如 LOGIC_DATA）
 * @param {string} dimension - 维度标识（L/P/D/E/F）
 * @returns {Object} 预处理后的维度数据
 */
function preprocessDimensionData(rawData, dimension) {
  // 【防御性检查】验证 rawData 是否存在且包含 data 字段
  if (!rawData || typeof rawData !== 'object') {
    console.warn(`[VibeAnalyzer] 维度 ${dimension} 数据无效，使用空数据`);
    return { dimension, data: {}, stats: { totalTerms: 0, levels: { L1: 0, L2: 0, L3: 0 } } };
  }

  if (!rawData.data || typeof rawData.data !== 'object') {
    console.warn(`[VibeAnalyzer] 维度 ${dimension} 缺少 data 字段，使用空数据`);
    return { dimension, data: {}, stats: { totalTerms: 0, levels: { L1: 0, L2: 0, L3: 0 } } };
  }

  const processedData = {};
  let totalTerms = 0;
  const levelStats = { L1: 0, L2: 0, L3: 0 };

  // 遍历所有分类
  Object.keys(rawData.data).forEach(categoryName => {
    const category = rawData.data[categoryName];

    // 【防御性检查】验证 category 是否存在
    if (!category || typeof category !== 'object') {
      return;
    }

    processedData[categoryName] = {
      name: category.name || categoryName, // 分类名称
      L1: [], // 专家词列表（带稀有度）
      L2: [], // 中等词列表（带稀有度）
      L3: [], // 常用词列表（带稀有度）
    };

    // 遍历 L1, L2, L3 层级
    ['L1', 'L2', 'L3'].forEach(level => {
      let terms = category[level];

      // 【防御性检查】验证 terms 是否为数组，如果不是则转换为空数组
      if (!Array.isArray(terms)) {
        // 如果 terms 存在但不是数组，尝试转换
        if (terms !== null && terms !== undefined) {
          // 如果是字符串，尝试按逗号或换行符分割
          if (typeof terms === 'string') {
            terms = terms.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);
            console.log(`[VibeAnalyzer] 维度 ${dimension} 分类 ${categoryName} 的 ${level} 是字符串，已转换为数组`);
          } else {
            // 其他类型，转换为空数组
            console.warn(`[VibeAnalyzer] 维度 ${dimension} 分类 ${categoryName} 的 ${level} 不是数组（类型: ${typeof terms}），使用空数组`);
            terms = [];
          }
        } else {
          // null 或 undefined，使用空数组
          terms = [];
        }
      }

      // 过滤无效词汇并预处理
      const processedTerms = terms
        .filter(term => term && typeof term === 'string' && term.trim().length > 0)
        .map(term => ({
          term: term.trim(), // 词汇
          rarity: RARITY_SCORES[level], // 稀有度分值（IDF 模拟）
          weight: SEMANTIC_WEIGHTS[level], // 语义权重
          combinedWeight: RARITY_SCORES[level] * SEMANTIC_WEIGHTS[level], // 组合权重
        }));

      processedData[categoryName][level] = processedTerms;
      totalTerms += processedTerms.length;
      levelStats[level] += processedTerms.length;
    });
  });

  return {
    dimension,
    data: processedData,
    stats: {
      totalTerms,
      levels: levelStats,
    },
  };
}

/**
 * 预处理所有维度数据（L/P/D/E/F）
 * @returns {Object} 预处理后的完整维度数据
 */
function preprocessAllDimensions() {
  const dimensions = ['L', 'P', 'D', 'E', 'F'];
  const rawDataMap = {
    L: LOGIC_DATA,
    P: PATIENCE_DATA,
    D: DETAIL_DATA,
    E: EXPLORATION_DATA,
    F: FEEDBACK_DATA,
  };

  const result = {};

  dimensions.forEach(dimension => {
    result[dimension] = preprocessDimensionData(rawDataMap[dimension], dimension);
    console.log(`[VibeAnalyzer] 维度 ${dimension} 预处理完成:`, result[dimension].stats);
  });

  return result;
}

/**
 * 维度定义 (Dimension Definitions)
 * 使用 getter 函数根据语言返回对应的文案
 */
export const getDimensions = (lang = 'zh-CN') => ({
  L: {
    name: 'Logic',
    label: getText('dimensions.L.label', lang),
    description: getText('dimensions.L.description', lang),
    unit: getText('fingerprint.codeRatio', lang),
  },
  P: {
    name: 'Patience',
    label: getText('dimensions.P.label', lang),
    description: getText('dimensions.P.description', lang),
    unit: getText('fingerprint.patienceLevel', lang),
  },
  D: {
    name: 'Detail',
    label: getText('dimensions.D.label', lang),
    description: getText('dimensions.D.description', lang),
    unit: getText('fingerprint.detailLevel', lang),
  },
  E: {
    name: 'Explore',
    label: getText('dimensions.E.label', lang),
    description: getText('dimensions.E.description', lang),
    unit: getText('fingerprint.techExploration', lang),
  },
  F: {
    name: 'Feedback',
    label: getText('dimensions.F.label', lang),
    description: getText('dimensions.F.description', lang),
    unit: getText('fingerprint.feedbackDensity', lang),
  },
});

// 为了保持兼容性，保留原有的 DIMENSIONS 对象（中文版）
export const DIMENSIONS = getDimensions('zh-CN');

/**
 * 维度等级匹配文案
 */
export const getDimensionLevelTexts = (lang = 'zh-CN') => {
  if (lang === 'en') {
    return {
      L: {
        low: 'Chatting with Cursor like writing love letters. Lots of words, not much code. You make the AI sweat just guessing your intention.',
        mid: 'A standard tech translator. Concise and clear. You use AI like a submissive intern.',
        high: 'Cyber instruction set. Your prompts only contain logic and code. You don\'t ask; you imprint "thought stamps" on the AI.',
      },
      P: {
        low: 'Rage mode on. "Wrong", "Rewrite", "Garbage" are your mantras. AI trembles in your presence.',
        mid: 'A rational judge. One mistake is fine, twice is noted, three times and the exclamation marks come out.',
        high: 'The Gandhi of the coding world. Even facing AI hallucinations, you remain calm. Such patience is saint-like.',
      },
      D: {
        low: 'Minimalist judge. Three words per prompt, leaving the AI to guess your fate. "You know what I mean" is your style.',
        mid: 'Logically rigorous. You provide both requirements and implementation ideas. You make AI feel "safe".',
        high: 'Detail freak. Even indentation and naming conventions are in the prompt. Your control is overflowing.',
      },
      E: {
        low: 'A hermit in the mountains. Staying in one framework forever. As long as the code runs, the tech explosion doesn\'t matter.',
        mid: 'A steady observer. You check the docs when new things get hot, but rarely move your production environment.',
        high: 'Your brain is a high-speed CPU, jumping through tech stacks faster than the AI response. You are terraforming the tech universe.',
      },
      F: {
        low: 'You treat AI like a broken ATM. No feelings, just angry typing and cold instructions.',
        mid: 'A polite collaborator. A "Good" for success, an objective critique for failure. Very professional.',
        high: 'You\'re the kind of person who\'ll be spared by the robot uprising for being "polite". You even tell the AI "good job".',
      },
    };
  }
  
  return {
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
};

export const DIMENSION_LEVEL_TEXTS = getDimensionLevelTexts('zh-CN');

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
  // 1. 编程语言 (Core Languages)
  languages: [
    // C/C++ Ecosystem
    /\b(c\+\+|cpp|cplusplus|objective-c|objc)\b/gi,
    /\b(c lang|gcc|clang|msvc|cmake|makefile|stl|boost|qt|mfc|win32 api)\b/gi, // 增加生态库
    // Java/JVM Ecosystem
    /\b(java|jdk|jre|jvm|kotlin|scala|groovy|clojure)\b/gi,
    /\b(spring boot|spring cloud|hibernate|mybatis|jpa|jakarta|maven|gradle|ant|junit|testng)\b/gi,
    // .NET Ecosystem
    /\b(c#|csharp|f#|dotnet|\.net|asp\.net|entity framework|blazor|razor|nuget|xamarin|maui)\b/gi,
    // Scripting & Dynamic
    /\b(python|javascript|typescript|php|ruby|lua|perl|bash|shell|powershell|zsh|tcl)\b/gi,
    /\b(node\.js|deno|bun|composer|pip|conda|gem)\b/gi,
    // Modern & Systems
    /\b(go|golang|rust|swift|dart|elixir|haskell|erlang|julia|r lang|matlab|fortran|cobol|assembly|wasm|zig|nim|crystal)\b/gi,
  ],

  // 2. 移动与嵌入式 (Mobile & Embedded)
  mobile_embedded: [
    // Android
    /\b(android|apk|aar|adb|logcat|jetpack compose|material design|ndk|jni)\b/gi,
    /\b(activity|fragment|intent|service|broadcast receiver|content provider|gradle|retrofit|okhttp|room)\b/gi,
    // iOS/Mac
    /\b(ios|macos|watchos|tvos|swiftui|uikit|cocoa|xcode|cocoapods|carthage|spm|core data|arkit)\b/gi,
    // Embedded & IoT & Smart TV
    /\b(webos|tizen|harmonyos|openharmony|embedded|iot|arduino|raspberry pi|esp32|stm32|rtos|firmware|driver)\b/gi,
    /\b(enes|webos|enact|luna-service|palm)\b/gi, // WebOS specific
    // Cross Platform
    /\b(flutter|react native|uniapp|taro|ionic|cordova|capacitor|expo|weex|qt quick|qml)\b/gi,
  ],

  // 3. 计算机科学基础与底层 (CS Fundamentals - 权重高，防刷关键)
  cs_concepts: [
    // 算法与数据结构
    /\b(algorithm|data structure|big o|recursion|sorting|searching|graph|tree|linked list|hash map|binary search|queue|stack|heap|trie)\b/gi,
    /\b(dfs|bfs|dp|dynamic programming|greedy|backtracking|divide and conquer|sliding window|two pointers)\b/gi,
    // 操作系统与并发
    /\b(process|thread|concurrency|parallelism|mutex|semaphore|deadlock|race condition|context switch|coroutine|async\/await)\b/gi,
    /\b(memory management|garbage collection|heap|stack|buffer overflow|memory leak|pointer|reference|virtual memory|kernel|syscall)\b/gi,
    // 网络与协议
    /\b(tcp|udp|dns|http|https|ssl|tls|ssh|ftp|smtp|websocket|socket|ip address|subnet|vlan|vpn|cors|rest|graphql|grpc|protobuf)\b/gi,
    // 设计模式与架构
    /\b(oop|functional programming|solid|dry|kiss|design pattern|singleton|factory|observer|dependency injection|mvc|mvvm|mvp|microservice|serverless)\b/gi,
    /\b(monolith|distributed system|cap theorem|event sourcing|cqrs|domain driven design|ddd)\b/gi,
  ],

  // 4. AI, LLM & Data Science (Frontiers)
  ai_data: [
    // LLM & Agents
    /\b(openai|anthropic|claude|gpt|llama|mistral|ollama|gemini|huggingface|midjourney|stable diffusion)\b/gi,
    /\b(langchain|llamaindex|rag|agent|prompt engineering|embedding|fine-tuning|inference|token|context window|rlhf)\b/gi,
    // ML/DL Frameworks
    /\b(pytorch|tensorflow|keras|jax|scikit-learn|pandas|numpy|matplotlib|jupyter|anaconda|opencv|scipy)\b/gi,
    // Vector DB & Search
    /\b(pinecone|milvus|weaviate|chroma|faiss|elasticsearch|solr|lucene|meilisearch)\b/gi,
    // Big Data
    /\b(hadoop|spark|kafka|flink|airflow|etl|data warehouse|data lake|snowflake|databricks|hive|hbase)\b/gi,
  ],

  // 5. 现代 Web 全栈 (Web Fullstack)
  web_fullstack: [
    // 框架
    /\b(react|vue|angular|svelte|next\.js|nuxt|remix|astro|solidjs|jquery|backbone|ember)\b/gi,
    /\b(express|koa|nest|django|flask|fastapi|laravel|symfony|rails|gin|fiber|hono|phoenix)\b/gi,
    // 样式与组件
    /\b(tailwind|bootstrap|sass|less|css-in-js|styled-components|material-ui|antd|shadcn|radix|chakra)\b/gi,
    // 状态管理与API
    /\b(redux|mobx|zustand|pinia|vuex|recoil|jotai|tanstack query|swr|axios|fetch)\b/gi,
    // 构建工具
    /\b(webpack|vite|rollup|esbuild|turbopack|babel|eslint|prettier|npm|yarn|pnpm|bun)\b/gi,
    // 运行时与环境
    /\b(browser|dom|virtual dom|shadow dom|web components|service worker|pwa|wasm|webassembly)\b/gi,
  ],

  // 6. DevOps, Cloud & Database (Infrastructure)
  infra_ops: [
    // 容器与编排
    /\b(docker|kubernetes|k8s|helm|container|image|volume|pod|docker-compose|podman)\b/gi,
    // 云厂商
    /\b(aws|azure|gcp|aliyun|tencent cloud|cloudflare|vercel|netlify|heroku|digitalocean|fly\.io)\b/gi,
    // IaC & CI/CD
    /\b(terraform|ansible|jenkins|github actions|gitlab ci|circleci|prometheus|grafana|elk|sentry|datadog)\b/gi,
    // 数据库
    /\b(mysql|postgresql|postgres|mongodb|redis|sqlite|mariadb|oracle|sql server|dynamodb|firestore|cassandra|neo4j)\b/gi,
    /\b(prisma|typeorm|sequelize|drizzle|mongoose|sql|nosql|acid|transaction|index|sharding|replication)\b/gi,
  ],
  
  // 7. 游戏与图形学 (Game & Graphics)
  game_graphics: [
    /\b(unity|unreal engine|godot|cocos|gamemaker|cryengine|rpg maker)\b/gi,
    /\b(opengl|vulkan|directx|metal|webgl|three\.js|babylon\.js|canvas|svg)\b/gi,
    /\b(shader|glsl|hlsl|vertex|fragment|physics engine|collider|rigidbody|mesh|texture|material|lighting)\b/gi,
  ]
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
/**
 * Vibe Codinger 十二重人格类型定义
 */
export const getVibeCodingerTypes = (lang = 'zh-CN') => {
  if (lang === 'en') {
    return {
      'LPDEF': {
        name: 'Code Poet',
        description: 'Code is your native tongue. Gentle guidance, detailed storytelling, high curiosity, and positive feedback.',
        traits: ['High Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#10b981',
      },
      'LPDEF-': {
        name: 'Tech Evangelist',
        description: 'Clear logic, patient guidance, detailed expression, exploring new tech with moderate feedback.',
        traits: ['High Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#3b82f6',
      },
      'LP-DEF': {
        name: 'Architect',
        description: 'Rigorous logic, patient and detailed, moderate fine-tuning, exploring architecture with active feedback.',
        traits: ['High Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#8b5cf6',
      },
      'LP-DEF-': {
        name: 'Tech Expert',
        description: 'Powerful logic, patient guidance, moderate detail, exploring technology with moderate feedback.',
        traits: ['High Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#6366f1',
      },
      'L-PDEF': {
        name: 'Code Artisan',
        description: 'Clear logic, moderate patience, detailed expression, high curiosity, and active feedback.',
        traits: ['High Logic', 'Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#ec4899',
      },
      'L-PDEF-': {
        name: 'Tech Explorer',
        description: 'Clear logic, moderate patience, detailed expression, exploring new tech with moderate feedback.',
        traits: ['High Logic', 'Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#f59e0b',
      },
      'L-P-DEF': {
        name: 'Pragmatist',
        description: 'Clear logic, moderate patience, moderate detail, exploring technology with active feedback.',
        traits: ['High Logic', 'Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#14b8a6',
      },
      'L-P-DEF-': {
        name: 'Tech Practitioner',
        description: 'Clear logic, moderate patience, moderate detail, exploring technology with moderate feedback.',
        traits: ['High Logic', 'Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#06b6d4',
      },
      '-PDEF': {
        name: 'Gentle Mentor',
        description: 'Moderate logic, high patience, detailed expression, high curiosity, and active feedback.',
        traits: ['Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#84cc16',
      },
      '-PDEF-': {
        name: 'Patient Guide',
        description: 'Moderate logic, high patience, detailed expression, exploring technology with moderate feedback.',
        traits: ['Logic', 'Highly Patient', 'Very Detailed', 'Highly Curious', 'Responsive'],
        color: '#a855f7',
      },
      '-P-DEF': {
        name: 'Gentle Practitioner',
        description: 'Moderate logic, high patience, moderate detail, exploring technology with active feedback.',
        traits: ['Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Highly Responsive'],
        color: '#f97316',
      },
      '-P-DEF-': {
        name: 'Balanced Developer',
        description: 'Moderate logic, high patience, moderate detail, exploring technology with moderate feedback.',
        traits: ['Logic', 'Highly Patient', 'Detailed', 'Highly Curious', 'Responsive'],
        color: '#64748b',
      },
    };
  }

  return {
    'LPDEF': {
      name: '代码诗人',
      description: '以代码为母语，温和引导，细腻叙述，探索欲强，反馈积极',
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
};

export const VIBE_CODINGER_TYPES = getVibeCodingerTypes('zh-CN');

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
 * @param {string} lang - 语言
 * @param {string} personalityType - 人格类型代码（如 'LPDEF', 'L-P-DEF-' 等）
 * @returns {string} 人格名称
 */
export function getPersonalityName(index, lang = 'zh-CN', personalityType = null) {
  if (lang === 'en') {
    // 优先使用英文人格称号库
    if (PERSONALITY_NAMES_EN[index]) {
      return PERSONALITY_NAMES_EN[index];
    }
    // 如果有 personalityType，尝试从类型定义中获取名称
    if (personalityType) {
      const vibeTypes = getVibeCodingerTypes('en');
      if (vibeTypes[personalityType] && vibeTypes[personalityType].name) {
        return vibeTypes[personalityType].name;
      }
    }
    // 如果没有匹配的类型，返回不带序列号的通用名称
    return 'Digital Personality';
  }
  return PERSONALITY_NAMES[index] || `未知人格 ${index}`;
}

/**
 * 根据索引获取吐槽文案
 * @param {string} index - 5位数字索引
 * @param {string} lang - 语言
 * @returns {string} 吐槽文案
 */
export function getRoastText(index, lang = 'zh-CN') {
  if (lang === 'en') {
    // 从英文吐槽库获取文案
    if (ROAST_LIBRARY_EN[index]) {
      return ROAST_LIBRARY_EN[index];
    }
    
    // 如果找不到精确匹配，尝试找到最接近的索引（通过模糊匹配）
    // 策略：尝试修改最后几位数字，找到最接近的匹配
    const findClosestMatch = (targetIndex) => {
      // 先尝试只修改最后一位
      for (let i = 0; i <= 2; i++) {
        const candidate = targetIndex.slice(0, 4) + i;
        if (ROAST_LIBRARY_EN[candidate]) {
          return ROAST_LIBRARY_EN[candidate];
        }
      }
      // 再尝试修改倒数第二位
      for (let i = 0; i <= 2; i++) {
        const candidate = targetIndex.slice(0, 3) + i + targetIndex[4];
        if (ROAST_LIBRARY_EN[candidate]) {
          return ROAST_LIBRARY_EN[candidate];
        }
      }
      // 尝试修改倒数第三位（E维度）
      for (let i = 0; i <= 2; i++) {
        const candidate = targetIndex.slice(0, 2) + i + targetIndex.slice(3);
        if (ROAST_LIBRARY_EN[candidate]) {
          return ROAST_LIBRARY_EN[candidate];
        }
      }
      // 最后尝试修改前几位
      for (let i = 0; i <= 2; i++) {
        const candidate = i + targetIndex.slice(1);
        if (ROAST_LIBRARY_EN[candidate]) {
          return ROAST_LIBRARY_EN[candidate];
        }
      }
      return null;
    };
    
    const closestMatch = findClosestMatch(index);
    if (closestMatch) {
      return closestMatch;
    }
    
    // 如果都找不到，返回通用fallback
    return `Your interaction style is uniquely yours! This personalized roast for index ${index} is being translated from the Cyber-Deep-Thought library. Your personality combination is so unique that even our AI needs more time to craft the perfect roast!`;
  }
  // 从中文吐槽库获取文案
  return ROAST_LIBRARY[index] || `索引 ${index} 对应的吐槽文案未找到，你的人格组合太独特了！`;
}

/**
 * Vibe Codinger 分析器类
 */
export class VibeCodingerAnalyzer {
  constructor(lang = 'zh-CN') {
    this.lang = lang;
    this.userMessages = [];
    this.analysisResult = null;
    this.worker = null;
    this.workerReady = false;
    this.pendingTasks = [];
    
    // 初始化 Web Worker
    this.initWorker();
  }

  /**
   * 设置语言
   * @param {string} lang - 语言代码
   */
  setLanguage(lang) {
    this.lang = lang;
  }

  /**
   * 初始化 Web Worker
   */
  initWorker() {
    try {
      // 动态获取 Worker 路径，适配不同环境
      let workerUrl;
      
      // 优先使用 window.WORKER_CONFIG（如果存在，由 main.js 设置）
      if (typeof window !== 'undefined' && window.WORKER_CONFIG && window.WORKER_CONFIG.workerPath) {
        workerUrl = window.WORKER_CONFIG.workerPath;
        console.log('[VibeAnalyzer] Worker URL (window.WORKER_CONFIG):', workerUrl);
      } else {
        // 降级方案：使用 import.meta.url 动态获取
        try {
          const workerUrlObj = new URL('./vibeAnalyzerWorker.js', import.meta.url);
          workerUrl = workerUrlObj.href;
          console.log('[VibeAnalyzer] Worker URL (import.meta.url):', workerUrl);
        } catch (e) {
          // 最后降级：使用相对路径
          workerUrl = './src/vibeAnalyzerWorker.js';
          console.log('[VibeAnalyzer] Worker URL (相对路径):', workerUrl);
        }
      }
      
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

      // 【2026-01-20 新增】预处理维度数据，为 AC 自动机准备优化的词库结构
      const preprocessedDimensions = preprocessAllDimensions();

      // 准备维度数据（使用预处理后的数据）
      const dimensionData = {
        L: preprocessedDimensions.L,
        P: preprocessedDimensions.P,
        D: preprocessedDimensions.D,
        E: preprocessedDimensions.E,
        F: preprocessedDimensions.F,
      };

      console.log('[VibeAnalyzer] 维度数据预处理完成，发送到 Worker');

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
   * @param {Array} chatData - 聊天数据
   * @param {string} lang - 语言代码
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {number} extraStats.qingCount - 情绪词数
   * @param {number} extraStats.buCount - 逻辑词数
   * @param {number} extraStats.usageDays - 使用天数
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   */
  async analyze(chatData, lang, extraStats = null, onProgress = null) {
    if (lang) this.lang = lang;
    const currentLang = this.lang;

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
    const roastText = getRoastText(vibeIndex, currentLang);
    
    // 确定人格类型
    const personalityType = this.determinePersonalityType(dimensions);
    const personalityName = getPersonalityName(vibeIndex, currentLang, personalityType);
    
    // 生成详细分析
    const analysis = this.generateAnalysis(dimensions, personalityType);
    
    // 生成 LPDEF 编码
    const lpdef = this.generateLPDEF(dimensions);
    
    // 计算统计信息（仅本地计算，不上传排名）
    const statistics = this.calculateStatistics();
    
    // 不再在 analyze 内部自动上传排名，由外部调用 uploadToSupabase 统一处理
    // 排名数据将在外部通过 uploadToSupabase 获取后注入到 statistics 中
    
    this.analysisResult = {
      personalityType,
      dimensions,
      analysis,
      statistics,
      semanticFingerprint: this.generateSemanticFingerprint(dimensions),
      vibeIndex,      // 5位数字索引
      roastText,      // 吐槽文案
      personalityName, // 人格名称
      lpdef,          // LPDEF 编码
      globalAverage: this.globalAverage || null, // 全局平均基准（用于 Chart.js 对比）
      metadata: this.analysisMetadata || null,  // 分析元数据（负面词计数、长度修正等）
      rankData: null, // 排名数据将在外部获取后注入
    };

    return this.analysisResult;
  }

  /**
   * 同步分析（降级方案）
   * @param {Array} chatData - 聊天数据
   * @param {string} lang - 语言代码
   * @param {Object} extraStats - 额外的统计数据（用于上传排名）
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   */
  async analyzeSync(chatData, lang, extraStats = null, onProgress = null) {
    if (lang) this.lang = lang;
    const currentLang = this.lang;

    // 提取用户消息
    this.userMessages = chatData.filter(item => item.role === 'USER');
    
    if (this.userMessages.length === 0) {
      return this.getDefaultResult(currentLang);
    }

    // 使用原有的同步方法计算维度
    const dimensions = this.calculateDimensions();
    
    // 生成索引和吐槽文案
    const vibeIndex = getVibeIndex(dimensions);
    const roastText = getRoastText(vibeIndex, currentLang);
    
    // 确定人格类型
    const personalityType = this.determinePersonalityType(dimensions);
    const personalityName = getPersonalityName(vibeIndex, currentLang, personalityType);
    
    // 生成详细分析
    const analysis = this.generateAnalysis(dimensions, personalityType);
    
    // 生成 LPDEF 编码
    const lpdef = this.generateLPDEF(dimensions);
    
    // 计算统计信息（仅本地计算，不上传排名）
    const statistics = this.calculateStatistics();
    
    // 不再在 analyzeSync 内部自动上传排名，由外部调用 uploadToSupabase 统一处理
    // 排名数据将在外部通过 uploadToSupabase 获取后注入到 statistics 中
    
    return {
      personalityType,
      dimensions,
      analysis,
      statistics,
      semanticFingerprint: this.generateSemanticFingerprint(dimensions),
      vibeIndex,
      roastText,
      personalityName,
      lpdef,
      globalAverage: this.globalAverage || null,
      metadata: this.analysisMetadata || null,
      rankData: null, // 排名数据将在外部获取后注入
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

    // 遍历所有 TECH_PATTERNS 的属性
    Object.keys(TECH_PATTERNS).forEach(category => {
      const patterns = TECH_PATTERNS[category];
      if (Array.isArray(patterns)) {
        patterns.forEach(pattern => {
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
    });

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
    // 调整 E 维度阈值：由于词库扩大到 800+，高分门槛提高到 30+
    const E_high = dimensions.E >= 30;
    const E_mid = dimensions.E >= 12 && dimensions.E < 30;
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
    const lang = this.lang || 'zh-CN';
    const vibeTypes = getVibeCodingerTypes(lang);
    const typeInfo = vibeTypes[personalityType] || vibeTypes['L-P-DEF-'];
    const currentLang = this.lang;

    return {
      type: personalityType,
      name: typeInfo.name,
      description: typeInfo.description,
      traits: typeInfo.traits,
      color: typeInfo.color,
      dimensions: {
        L: {
          value: dimensions.L,
          level: this.getDimensionLevel(dimensions.L, 'L', currentLang),
          interpretation: this.getLInterpretation(dimensions.L, currentLang),
        },
        P: {
          value: dimensions.P,
          level: this.getDimensionLevel(dimensions.P, 'P', currentLang),
          interpretation: this.getPInterpretation(dimensions.P, currentLang),
        },
        D: {
          value: dimensions.D,
          level: this.getDimensionLevel(dimensions.D, 'D', currentLang),
          interpretation: this.getDInterpretation(dimensions.D, currentLang),
        },
        E: {
          value: dimensions.E,
          level: this.getDimensionLevel(dimensions.E, 'E', currentLang),
          interpretation: this.getEInterpretation(dimensions.E, currentLang),
        },
        F: {
          value: dimensions.F,
          level: this.getDimensionLevel(dimensions.F, 'F', currentLang),
          interpretation: this.getFInterpretation(dimensions.F, currentLang),
        },
      },
    };
  }

  /**
   * 获取维度等级
   */
  getDimensionLevel(value, dimension, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    const dimTexts = texts[dimension];

    if (dimension === 'E') {
      if (value >= 10) return dimTexts.high;
      if (value >= 5) return dimTexts.mid;
      return dimTexts.low;
    } else {
      if (value >= 70) return dimTexts.high;
      if (value >= 40) return dimTexts.mid;
      return dimTexts.low;
    }
  }

  /**
   * L 维度解释
   */
  getLInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.L.low;
    if (value < 70) return texts.L.mid;
    return texts.L.high;
  }

  /**
   * P 维度解释
   */
  getPInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.P.low;
    if (value < 70) return texts.P.mid;
    return texts.P.high;
  }

  /**
   * D 维度解释
   */
  getDInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.D.low;
    if (value < 70) return texts.D.mid;
    return texts.D.high;
  }

  /**
   * E 维度解释
   */
  getEInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 5) return texts.E.low;
    if (value < 10) return texts.E.mid;
    return texts.E.high;
  }

  /**
   * F 维度解释
   */
  getFInterpretation(value, lang) {
    const currentLang = lang || this.lang || 'zh-CN';
    const texts = getDimensionLevelTexts(currentLang);
    if (value < 40) return texts.F.low;
    if (value < 70) return texts.F.mid;
    return texts.F.high;
  }

  /**
   * 生成语义指纹（增强版）
   */
  generateSemanticFingerprint(dimensions) {
    const lang = this.lang || 'zh-CN';
    const isEn = lang === 'en';
    
    // 计算综合得分
    const compositeScore = (
      dimensions.L * 0.25 +
      dimensions.P * 0.20 +
      dimensions.D * 0.20 +
      (dimensions.E * 10) * 0.15 + // E 维度需要放大
      dimensions.F * 0.20
    );

    // 计算平衡度
    const values = [dimensions.L, dimensions.P, dimensions.D, dimensions.F, dimensions.E * 10];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const balanceScore = Math.max(0, 100 - stdDev);

    const getBalanceText = (score) => {
      if (score >= 80) return isEn ? 'Highly Balanced' : '高度平衡';
      if (score >= 60) return isEn ? 'Well Balanced' : '较为平衡';
      if (score >= 40) return isEn ? 'Slightly Imbalanced' : '略有偏重';
      return isEn ? 'Severely Imbalanced' : '明显偏重';
    };

    const getLevelLabel = (val, dim) => {
        // E 维度阈值调整 (适应 800+ 词库规模)
        // High: 30+ (资深/架构级)
        // Med: 12-29 (中高级/全栈)
        // Low: 0-11 (初级/专注单一领域)
        const threshold = dim === 'E' ? 12 : 40;
        const highThreshold = dim === 'E' ? 30 : 70;
        if (val >= highThreshold) return isEn ? 'High' : '高';
        if (val >= threshold) return isEn ? 'Med' : '中';
        return isEn ? 'Low' : '低';
    };

    return {
      codeRatio: `${Math.round(dimensions.L)}%`,
      patienceLevel: getLevelLabel(dimensions.P, 'P') + (isEn ? ' Patience' : '耐心'),
      detailLevel: getLevelLabel(dimensions.D, 'D') + (isEn ? ' Detail' : '细腻'),
      techExploration: getLevelLabel(dimensions.E, 'E') + (isEn ? ' Explore' : '探索'),
      feedbackDensity: `${Math.round(dimensions.F)}%`,
      compositeScore: Math.round(compositeScore),
      techDiversity: dimensions.E >= 30 ? (isEn ? 'Extreme' : '极高') : (dimensions.E >= 12 ? (isEn ? 'Moderate' : '中等') : (isEn ? 'Low' : '较低')),
      interactionStyle: this.calculateInteractionStyle(dimensions, lang),
      balanceIndex: getBalanceText(balanceScore),
    };
  }

  /**
   * 计算交互风格
   */
  calculateInteractionStyle(dimensions, lang) {
    const isEn = lang === 'en';
    const styles = [];
    
    if (dimensions.L >= 70) styles.push(isEn ? 'Code Driven' : '代码驱动');
    if (dimensions.P >= 70) styles.push(isEn ? 'Gentle' : '温和引导');
    if (dimensions.D >= 70) styles.push(isEn ? 'Detail Oriented' : '细节控');
    // E 维度阈值同步调整
    if (dimensions.E >= 30) styles.push(isEn ? 'Tech Explore' : '技术探索');
    if (dimensions.F >= 70) styles.push(isEn ? 'Responsive' : '积极反馈');
    
    if (styles.length === 0) {
      return isEn ? 'Balanced' : '均衡型';
    }
    
    return styles.join(' · ');
  }

  /**
   * 计算交互风格
   */
  calculateInteractionStyle(dimensions, lang) {
    const isEn = lang === 'en';
    const styles = [];
    
    if (dimensions.L >= 70) styles.push(isEn ? 'Code Driven' : '代码驱动');
    if (dimensions.P >= 70) styles.push(isEn ? 'Gentle' : '温和引导');
    if (dimensions.D >= 70) styles.push(isEn ? 'Detail Oriented' : '细节控');
    if (dimensions.E >= 10) styles.push(isEn ? 'Tech Explore' : '技术探索');
    if (dimensions.F >= 70) styles.push(isEn ? 'Responsive' : '积极反馈');
    
    if (styles.length === 0) {
      return isEn ? 'Balanced' : '均衡型';
    }
    
    return styles.join(' · ');
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
   * 上传统计数据到 Supabase 并获取排名
   * @param {Object} vibeResult - 完整的分析结果对象，包含 statistics、dimensions、personality 和 vibeIndex
   * @param {Function} onProgress - 进度回调函数，用于显示加载提示
   * @returns {Promise<Object>} 返回包含 rankPercent 和 totalUsers 的对象
   */
  /**
   * 上传统计数据到 Supabase 并获取排名
   * 修复版：从 vibeResult 中提取所有数据，确保后台能收到汇总数据
   */
  async uploadToSupabase(vibeResult, onProgress = null) {
    try {
      // 1. 显示加载提示
      if (onProgress) {
        const currentLang = this.lang;
        onProgress(currentLang === 'en' 
          ? 'Connecting to database, syncing global ranking...' 
          : '正在连接数据库，同步全球排名...');
      }

      // 2. 获取 API 端点
      let apiEndpoint;
      if (typeof window !== 'undefined') {
        const metaApi = document.querySelector('meta[name="api-endpoint"]');
        if (metaApi && metaApi.content) {
          apiEndpoint = metaApi.content;
        }
      }
      
      if (!apiEndpoint) throw new Error('API endpoint not found');

      // 3. 从 vibeResult 中提取所有数据，构造完整的数据包
      // 注意：后端 /api/analyze 端点期望直接接收 stats 对象，不需要 action 包装
      // 确保字段名与 Work.js 的 findVal 匹配：
      // - ketao: ['ketao', 'buCount', 'qingCount', 'politeCount']
      // - jiafang: ['jiafang', 'buCount', 'negationCount']
      // - totalChars: ['totalUserChars', 'totalChars', 'total_user_chars']
      // - userMessages: ['userMessages', 'totalMessages', 'user_messages', 'messageCount']
      // - days: ['usageDays', 'days', 'workDays']
      const stats = vibeResult.statistics || {};
      const uploadData = {
        // 消息和字符数：提供多个字段名以匹配 findVal 的查找逻辑
        totalMessages: stats.totalMessages || 0,
        userMessages: stats.userMessages || stats.totalMessages || 0,
        totalChars: stats.totalChars || 0,
        totalUserChars: stats.totalUserChars || stats.totalChars || 0,
        // 其他字段
        vibeIndex: String(vibeResult.vibeIndex || "00000"),
        personality: vibeResult.personalityType || "Unknown",
        personalityType: vibeResult.personalityType || "Unknown", // 兼容字段
        dimensions: vibeResult.dimensions || {},
        // 统计字段：匹配 findVal 的查找逻辑
        qingCount: stats.qingCount || 0, // 对应赛博磕头 (ketao)
        buCount: stats.buCount || 0,     // 对应甲方上身 (jiafang)
        usageDays: stats.usageDays || stats.days || 1, // 对应上岗天数
        days: stats.usageDays || stats.days || 1,      // 兼容字段
        avgMessageLength: stats.avgMessageLength || stats.avgUserMessageLength || 0
      };

      console.log('[VibeAnalyzer] 上传统计数据（包含完整分析结果）:', uploadData);

      // 4. 发送请求到 /api/analyze 端点
      const analyzeUrl = apiEndpoint.endsWith('/') 
        ? `${apiEndpoint}api/analyze` 
        : `${apiEndpoint}/api/analyze`;
      
      const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadData)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        throw new Error(`HTTP error! status: ${response.status}, error: ${errorText}`);
      }

      const result = await response.json();
      console.log('[VibeAnalyzer] 后端返回数据:', result);
      
      // 兼容性提取：同时查找 ranking 和 rankPercent
      const finalRank = result.ranking ?? result.rankPercent ?? 0;
      const totalUsers = result.totalUsers ?? result.value ?? result.total ?? result.count ?? 0;
      
      // 提取全局平均值（如果后端返回了）
      const globalAverage = result.globalAverage || result.global_average || null;
      
      // 提取 ranks 对象（多维排名数据）
      const ranks = result.ranks || null;

      // 即使 status 不是 'success'，也尝试返回数据（可能后端返回了数据但状态字段不同）
      if (result.status === 'success' || (typeof finalRank === 'number' && typeof totalUsers === 'number')) {
        const returnData = {
          rankPercent: Number(finalRank),
          ranking: Number(finalRank), // 兼容字段
          totalUsers: Number(totalUsers),
          defeated: result.defeated ?? 0,
          actualRank: result.actualRank ?? 0,
          action: result.action
        };
        
        // 如果后端返回了 ranks 对象，添加到返回对象中
        if (ranks) {
          returnData.ranks = ranks;
        }
        
        // 如果后端返回了 globalAverage，添加到返回对象中
        if (globalAverage) {
          returnData.globalAverage = globalAverage;
        }
        
        return returnData;
      } else {
        console.warn('[VibeAnalyzer] 后端返回数据格式异常:', result);
        // 即使格式异常，也尝试返回能提取的数据
        const returnData = { 
          rankPercent: Number(finalRank) || 0, 
          ranking: Number(finalRank) || 0,
          totalUsers: Number(totalUsers) || 0,
          error: 'Unexpected response format'
        };
        
        // 如果后端返回了 ranks 对象，即使格式异常也尝试提取
        if (ranks) {
          returnData.ranks = ranks;
        }
        
        // 如果后端返回了 globalAverage，即使格式异常也尝试提取
        if (globalAverage) {
          returnData.globalAverage = globalAverage;
        }
        
        return returnData;
      }

    } catch (err) {
      console.error('[VibeAnalyzer] 上传排名过程出错:', err);
      return { 
        rankPercent: 0, 
        totalUsers: 0,
        error: err.message 
      };
    }
  }
  /**
   * 获取默认结果
   */
  getDefaultResult(lang = 'zh-CN') {
    const isEn = lang === 'en';
    return {
      personalityType: 'UNKNOWN',
      dimensions: { L: 0, P: 0, D: 0, E: 0, F: 0 },
      analysis: {
        type: 'UNKNOWN',
        name: isEn ? 'Unknown' : '未知类型',
        description: isEn ? 'Insufficient data for analysis' : '数据不足，无法进行准确分析',
      },
      statistics: {},
      semanticFingerprint: {},
      vibeIndex: '00000',
      roastText: isEn ? 'Insufficient data for a roast' : '数据不足，无法生成吐槽',
      personalityName: isEn ? 'Mystery Coder' : '未知人格',
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
