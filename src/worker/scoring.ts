/**
 * scoring.ts - 算法核心模块
 * 从 VibeCodingerAnalyzer.js 提取的算法逻辑，原封不动迁移
 */

/**
 * 稀有度分值（IDF 模拟值）
 * 专业词汇权重大于通用词汇
 * L1 (专家词): 稀有度高，IDF = 5.0
 * L2 (中等词): 稀有度中等，IDF = 2.0
 * L3 (常用词): 稀有度低，IDF = 1.0
 */
export const RARITY_SCORES = {
  L1: 5.0, // 专家词/神谕词（如"幂等性"、"依赖反转"）
  L2: 2.0, // 中等词（如"初始化"、"队列"）
  L3: 1.0, // 常用词/噪音词（如"先"、"然后"）
};

/**
 * 语义权重矩阵（保持原有配置）
 */
export const SEMANTIC_WEIGHTS = { L1: 10, L2: 5, L3: 1 };

/**
 * 维度定义 (Dimension Definitions)
 */
export const DIMENSIONS = {
  L: {
    name: 'Logic',
    label: '逻辑力',
    description: '代码与逻辑在对话中的占比',
    unit: '代码比例',
  },
  P: {
    name: 'Patience',
    label: '耐心值',
    description: '对 AI 错误的容忍度',
    unit: '耐心等级',
  },
  D: {
    name: 'Detail',
    label: '细腻度',
    description: '需求描述的详细程度',
    unit: '细节等级',
  },
  E: {
    name: 'Explore',
    label: '探索欲',
    description: '对新技术的好奇心',
    unit: '技术探索',
  },
  F: {
    name: 'Feedback',
    label: '反馈感',
    description: '对 AI 的礼貌程度',
    unit: '反馈密度',
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
  // 1. 编程语言 (Core Languages)
  languages: [
    // C/C++ Ecosystem
    /\b(c\+\+|cpp|cplusplus|objective-c|objc)\b/gi,
    /\b(c lang|gcc|clang|msvc|cmake|makefile|stl|boost|qt|mfc|win32 api)\b/gi,
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
    /\b(enes|webos|enact|luna-service|palm)\b/gi,
    // Cross Platform
    /\b(flutter|react native|uniapp|taro|ionic|cordova|capacitor|expo|weex|qt quick|qml)\b/gi,
  ],

  // 3. 计算机科学基础与底层 (CS Fundamentals)
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
 * 计算代码比例
 */
function calculateCodeRatio(text: string): number {
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
function countNegationWords(text: string): number {
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
function splitSentences(text: string): string[] {
  // 中英文句子分割
  return text
    .split(/[。！？.!?\n]+/)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());
}

/**
 * 统计修饰词
 */
function countModifierWords(text: string): number {
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
function extractTechTerms(text: string): string[] {
  const terms = new Set<string>();
  const lowerText = text.toLowerCase();

  // 遍历所有 TECH_PATTERNS 的属性
  Object.keys(TECH_PATTERNS).forEach(category => {
    const patterns = TECH_PATTERNS[category as keyof typeof TECH_PATTERNS];
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
function countPoliteWords(text: string): number {
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
function countWords(text: string): number {
  // 中英文单词统计
  const chineseWords = text.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
  return chineseWords.length + englishWords.length;
}

/**
 * 计算五个维度得分
 * 这是核心算法函数，从 VibeCodingerAnalyzer.js 原封不动迁移
 * @param userMessages - 用户消息数组，格式: [{ role: 'USER', text: '...' }]
 * @returns 维度得分对象 { L, P, D, E, F }
 */
export function calculateDimensions(userMessages: Array<{ role: string; text?: string }>): {
  L: number;
  P: number;
  D: number;
  E: number;
  F: number;
} {
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
  const techTermsSet = new Set<string>();
  let negationCount = 0;
  let modifierCount = 0;
  let politeCount = 0;
  let totalWords = 0;

  userMessages.forEach(msg => {
    const text = msg.text || '';
    if (!text || text.length < 5) return;

    totalChars += text.length;
    totalWords += countWords(text);

    // L (Logic) 逻辑力: 代码块比例
    const codeRatio = calculateCodeRatio(text);
    codeChars += text.length * codeRatio;

    // P (Patience) 耐心值: 否定词频次（低频率 = 高耐心）
    const negationFreq = countNegationWords(text);
    negationCount += negationFreq;

    // D (Detail) 细腻度: 句子平均长度和修饰词
    const sentences = splitSentences(text);
    totalSentences += sentences.length;
    sentences.forEach(sentence => {
      totalSentenceLength += sentence.length;
      modifierCount += countModifierWords(sentence);
    });

    // E (Explore) 探索欲: 技术名词去重统计
    const techTerms = extractTechTerms(text);
    techTerms.forEach(term => techTermsSet.add(term.toLowerCase()));

    // F (Feedback) 反馈感: 礼貌用语密度
    politeCount += countPoliteWords(text);
  });

  // 标准化维度得分
  const avgCodeRatio = totalChars > 0 ? codeChars / totalChars : 0;
  const codeBlockScore = Math.round(avgCodeRatio * 100);
  
  // 优化：检查是否有代码关键字（即使没有代码块）
  // 统计代码关键字数量，作为补充分数
  let codeKeywordCount = 0;
  userMessages.forEach(msg => {
    const text = msg.text || '';
    CODE_PATTERNS.forEach(pattern => {
      // 创建新的正则表达式，避免全局标志的影响
      const regex = pattern.global ? new RegExp(pattern.source, pattern.flags) : pattern;
      const matches = text.match(regex);
      if (matches) {
        codeKeywordCount += matches.length;
      }
    });
  });
  
  // 代码关键字贡献：每10个关键字贡献10分，最多贡献30分
  const keywordBonus = Math.min(30, Math.floor(codeKeywordCount / 10) * 10);
  dimensions.L = Math.min(100, codeBlockScore + keywordBonus);

  // P: 否定词频率（越低越好，表示高耐心）
  // 如果用户消息数为 0，使用默认值 50（中等耐心）
  const avgNegationFreq = userMessages.length > 0 ? negationCount / userMessages.length : 0;
  // 优化：调整计算方式，使耐心值更容易达到中等水平
  // 如果没有否定词，耐心值应该是 100（最高耐心）
  if (negationCount === 0 && userMessages.length > 0) {
    dimensions.P = 100;
  } else {
    // 调整：降低惩罚系数，使耐心值更容易达到中等水平
    // 例如：平均每消息1个否定词，耐心值 = 100 - 1*15 = 85（高耐心）
    dimensions.P = Math.max(0, 100 - Math.round(avgNegationFreq * 15)); // 从 20 降低到 15
  }

  // D: 细腻度 = 平均句子长度 + 修饰词密度
  // 优化：提高句子长度的权重，使其更容易达到中等水平
  const avgSentenceLength = totalSentences > 0 ? totalSentenceLength / totalSentences : 0;
  const modifierDensity = totalWords > 0 ? (modifierCount / totalWords) * 100 : 0;
  // 调整：句子长度贡献更多（除以5而不是10），并增加基础分
  const sentenceScore = Math.min(50, (avgSentenceLength / 5)); // 最多贡献50分
  const modifierScore = Math.min(50, modifierDensity); // 最多贡献50分
  dimensions.D = Math.round(sentenceScore + modifierScore);

  // E: 探索欲 = 技术名词去重数量
  dimensions.E = techTermsSet.size;

  // F: 反馈感 = 礼貌用语密度
  // 优化：提高礼貌用语的权重，使其更容易达到中等水平
  const politeDensity = totalWords > 0 ? (politeCount / totalWords) * 100 : 0;
  // 调整：礼貌用语密度乘以更大的系数，并增加基础分
  // 如果礼貌用语密度是2%，那么F维度 = 2 * 20 = 40（中等水平）
  dimensions.F = Math.round(politeDensity * 20); // 从 10 提高到 20

  // 限制范围在 0-100
  Object.keys(dimensions).forEach(key => {
    const k = key as keyof typeof dimensions;
    dimensions[k] = Math.max(0, Math.min(100, dimensions[k]));
  });

  return dimensions;
}
