/**
 * i18n - 多语言配置文件
 * 支持中文和英文UI文本
 */

export const I18N = {
  'zh-CN': {
    // 标题和描述
    title: 'Cursor迷惑行为报告',
    subtitle: '基于 Cursor 聊天记录的深度受虐分析',

    // 统计卡片标签
    statsLabels: {
      totalConversations: 'Cursor上岗天数',
      codeOutput: '代码输出量',
      userInput: '废话文学输出',
      aiMessages: '调戏 AI 次数',
      unit: {
        days: '天',
        chars: '字',
        count: '条'
      }
    },

    // 词云
    wordCloud: {
      chineseTitle: 'AI情绪',
      englishTitle: '中英文词云',
      emptyData: '暂无数据'
    },

    // Vibe Codinger
    vibeCodinger: {
      title: '🔮 你的cursor人格已被锁定',
      roastTitle: '🔥 精准吐槽',
      dimensionsTitle: '📊 五维语义指纹',
      traitsTitle: '🎯 人格特征',
      fingerprintTitle: '🔍 语义指纹',
      chartTitle: '📈 维度雷达图',
      index: '索引',
      lpdef: 'LPDEF',
      personalityTitles: {
        l: ['随性', '标准', '硬核'],
        p: ['急躁', '平衡', '耐心'],
        d: ['极简', '适中', '细节控'],
        e: ['守旧', '观望', '探索者'],
        f: ['冷酷', '职业', '暖男']
      }
    },

    // 维度标签
    dimensions: {
      L: {
        label: '逻辑力',
        description: '基于代码逻辑复杂度和提问质量的综合评估',
        levels: {
          low: '低',
          medium: '中',
          high: '高'
        }
      },
      P: {
        label: '耐心值',
        description: '基于对话轮次和修正次数的耐心程度评估',
        levels: {
          low: '低',
          medium: '中',
          high: '高'
        }
      },
      D: {
        label: '细腻度',
        description: '基于需求描述详细程度的细致程度评估',
        levels: {
          low: '低',
          medium: '中',
          high: '高'
        }
      },
      E: {
        label: '探索欲',
        description: '基于技术栈多样性和尝试频率的探索精神评估',
        levels: {
          low: '低',
          medium: '中',
          high: '高'
        }
      },
      F: {
        label: '反馈感',
        description: '基于反馈及时性和礼貌程度的交互态度评估',
        levels: {
          low: '低',
          medium: '中',
          high: '高'
        }
      }
    },

    // 语义指纹
    fingerprint: {
      codeRatio: '代码比例',
      patienceLevel: '耐心水平',
      detailLevel: '细腻程度',
      techExploration: '技术探索',
      feedbackDensity: '反馈密度',
      score: '综合得分',
      diversity: '技术多样性',
      style: '交互风格',
      balance: '维度平衡度'
    },

    // 聊天记录
    chatList: {
      title: '💬 聊天记录',
      searchPlaceholder: '搜索关键词...',
      emptySearch: '未找到匹配的记录',
      noRecords: '暂无对话记录',
      loadFailed: '对话记录加载失败',
      prev: '上一页',
      next: '下一页',
      page: '页',
      total: '共',
      records: '条记录',
      pagePrefix: '第',
      pageSuffix: '页',
      totalPrefix: '共',
      totalSuffix: '页',
      recordsPrefix: '共',
      recordsSuffix: '条记录',
      showingPrefix: '显示',
      showingSuffix: '条',
      paginationInfo: '第 {currentPage} 页，共 {totalPages} 页（共 {totalItems} 条记录，显示 {startItem}-{endItem} 条）'
    },

    // 用户角色
    roles: {
      user: '用户',
      ai: 'AI'
    },

    // 导出功能
    export: {
      title: '保存体检报告',
      download: '下载图片',
      filename: 'cursor-clinical-analysis'
    },

    upload: {
      title: '数据本地解析 隐私绝对隔离',
      subtitle: '救赎之道 就在其中',
      button: '选择文件',
      dragText: '拖拽文件到此处',
      processing: '处理中...',
      error: '上传失败，请重试',
      pathHelp: '在弹出窗口的地址栏粘贴此路径可瞬间抵达',
      pathHelpMac: '复制路径后，请先打开访达-前往-前往文件夹-粘贴路径-将workspaceStorage文件夹拖到左侧后，再点击上传',
      selectFolder: '上传',
      viewHistory: '复诊',
      privacyNote: '救赎之道 就在其中',
      logs: {
        startParsing: '开始解析数据库文件...',
        waitingModule: '等待分析模块加载...',
        startProcessing: '开始处理文件...',
        processingProgress: '处理进度: {current}/{total} - {fileName}',
        processed: '已处理 {current}/{total}: {fileName}',
        calculatingStats: '计算统计数据...',
        generatingPersonality: '生成人格画像（高性能匹配中）...',
        analysisComplete: '分析完成！',
        analysisFailed: '分析失败，使用降级方案...',
        parserReady: '分析模块已就绪',
        initializingParser: '初始化解析器...'
        ,
        // 后台同步：不阻塞用户进入报告
        backgroundSync: '后台同步全球排名中…（不影响使用）',
        rankUploadFailed: '全球排名同步失败（稍后重试或刷新）'
      }
    },

    // 分析预览
    preview: {
      personalityLabel: '人格鉴定结果',
      analyzing: '分析中...',
      deciphering: '正在破译你的人格密码...',
      globalRank: '全网排名',
      fullReport: '查看完整报告',
      diagnosisTitle: '专家诊断',
      diagnosisFormat: '你对 Cursor 说了 {count} 次"请"',
      diagnosisPolite: '你对你老板可能都没这么客气过。',
      diagnosisNormal: '还算正常。',
      diagnosisAdvice: '建议适当增加"直接命令"语气，找回丢失的码农尊严。',
      shareBtn: '晒出我的受虐证据'
    },

    dashboard: {
      clinicalAnalysis: 'Vibe Coding行为临床实验室 v1.0',
      reportTitle: 'CURSOR 迷惑行为报告',
      reportSubtitle: '基于Cursor聊天记录的深度受虐分析',
      realtimeStats: '📊 实时统计',
      totalUsers: '全网受虐人数',
      techRank: '技术排名',
      personalityUnlock: '人格库解锁',
      personalityUnit: '种人格',
      globalRankings: '🏆 全网横向排名',
      cyberBowRanking: '赛博磕头排名',
      bossModeRanking: '甲方上身排名',
      aiTeasingRanking: '调戏AI排名',
      banterOutputRanking: '废话输出排名',
      avgLengthRanking: '平均长度排名',
      daysOnDutyRanking: '上岗天数排名',
      questionRanking: '黑人问号排名',
      cyberBowCount: '赛博磕头次数',
      bossModeCount: '甲方爸爸上身',
      aiTeasingCount: '调戏 AI 次数',
      banterOutputCount: '废话文学输出',
      avgLengthCount: '平均吹水长度',
      daysOnDutyCount: 'Cursor上岗天数',
      questionCount: '黑人问号次数',
      dimensionRankingTitle: '🏆 六大硬核维度得分排行榜',
      dimensionRankingTitleEn: '🏆 Top 6 Hardcore Dimension Scores',
      aiMerits: '☁️ AI功德簿',
      siliconValleySlang: '🔤 你的硅谷黑话口头禅',
      vibeCodingSlang: 'vibe coding黑话榜',
      techUnit: '种技术',
      pointsUnit: '分',
      charUnit: '字符',
      timesUnit: '次',
      personUnit: '人',
      rankUnit: '名',
      numberUnits: {
        trillion: '万亿',
        hundredBillion: '千亿',
        tenBillion: '百亿',
        billion: '亿',
        tenMillion: '千万',
        million: '百万',
        hundredThousand: '十万',
        tenThousand: '万',
        thousand: 'K'
      },
      radarChart: {
        yourScore: '你的得分',
        globalAverage: '全网平均',
        switch: '切换'
      },
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败，请手动复制',
      systemAnalysis: 'System Analysis',
      friendLinks: {
        nmer: '牛马（cursor windows工具箱）',
        curser: '抠搜（cursor聊天记录查看器）'
      },
      exportBtn: '生成受虐证据海报',
      loading: '加载中...',
      unknownError: '未知错误',
      unknownPersonality: '未知人格'
    },
  },

  'en': {
    // 标题和描述
    title: 'Cursor Diagnostics',
    subtitle: 'Analyze your coding behavior patterns',

    // 统计卡片标签
    statsLabels: {
      totalConversations: 'Days Using AI',
      codeOutput: 'Code Output',
      userInput: 'User Input',
      aiMessages: 'AI Messages',
      unit: {
        days: 'days',
        chars: 'chars',
        count: 'items'
      }
    },

    // 词云
    wordCloud: {
      chineseTitle: 'AI Emotions',
      englishTitle: 'Word Cloud',
      emptyData: 'No data available'
    },

    // Vibe Codinger
    vibeCodinger: {
      title: '🔮 Personality Lock',
      roastTitle: '🔥 Precision Roast',
      dimensionsTitle: '📊 5D Semantic Fingerprint',
      traitsTitle: '🎯 Personality Traits',
      fingerprintTitle: '🔍 Semantic Fingerprint',
      chartTitle: '📈 Dimension Radar',
      index: 'Index',
      lpdef: 'LPDEF',
      personalityTitles: {
        l: ['Casual', 'Standard', 'Hardcore'],
        p: ['Impatient', 'Balanced', 'Patient'],
        d: ['Minimal', 'Moderate', 'Detail'],
        e: ['Traditional', 'Observer', 'Explorer'],
        f: ['Cold', 'Professional', 'Warm']
      }
    },

    // 维度标签
    dimensions: {
      L: {
        label: 'Logic',
        description: 'Comprehensive assessment based on code logic complexity and question quality',
        levels: {
          low: 'Low',
          medium: 'Medium',
          high: 'High'
        }
      },
      P: {
        label: 'Patience',
        description: 'Patience assessment based on conversation rounds and correction frequency',
        levels: {
          low: 'Low',
          medium: 'Medium',
          high: 'High'
        }
      },
      D: {
        label: 'Detail',
        description: 'Detail level assessment based on description thoroughness',
        levels: {
          low: 'Low',
          medium: 'Medium',
          high: 'High'
        }
      },
      E: {
        label: 'Exploration',
        description: 'Exploration spirit assessment based on tech stack diversity and experimentation frequency',
        levels: {
          low: 'Low',
          medium: 'Medium',
          high: 'High'
        }
      },
      F: {
        label: 'Feedback',
        description: 'Interaction attitude assessment based on feedback timeliness and politeness',
        levels: {
          low: 'Low',
          medium: 'Medium',
          high: 'High'
        }
      }
    },

    // 语义指纹
    fingerprint: {
      codeRatio: 'Code Ratio',
      patienceLevel: 'Patience Level',
      detailLevel: 'Detail Level',
      techExploration: 'Tech Exploration',
      feedbackDensity: 'Feedback Density',
      score: 'Score',
      diversity: 'Diversity',
      style: 'Style',
      balance: 'Balance'
    },

    // 聊天记录
    chatList: {
      title: '💬 Chat History',
      searchPlaceholder: 'Search keywords...',
      emptySearch: 'No matching records found',
      noRecords: 'No records found',
      loadFailed: 'Failed to load records',
      prev: 'Prev',
      next: 'Next',
      page: 'Page',
      total: 'Total',
      records: 'records',
      pagePrefix: 'Page',
      pageSuffix: '',
      totalPrefix: 'of',
      totalSuffix: '',
      recordsPrefix: '(Total',
      recordsSuffix: 'records',
      showingPrefix: 'showing',
      showingSuffix: ')',
      paginationInfo: 'Page {currentPage} of {totalPages} (Total {totalItems} records, showing {startItem}-{endItem})'
    },

    // 用户角色
    roles: {
      user: 'User',
      ai: 'AI'
    },

    // 导出功能
    export: {
      title: 'Export Report',
      download: 'Download Image',
      filename: 'cursor-clinical-analysis'
    },

    upload: {
      title: 'Upload Cursor Database',
      subtitle: 'The salvation lies within',
      button: 'Upload',
      dragText: 'Drag files here',
      viewHistory: 'Follow-up',
      processing: 'Processing...',
      error: 'Upload failed, please try again',
      pathHelp: 'Suggested path: %APPDATA%\\Cursor\\User\\workspaceStorage',
      pathHelpMac: 'After copying the path, first open Finder → Go → Go to Folder → paste the path → drag the workspaceStorage folder to the sidebar, then click the upload button.',
      selectFolder: 'Upload',
      logs: {
        startParsing: 'Starting to parse database files...',
        waitingModule: 'Waiting for analysis module to load...',
        startProcessing: 'Starting to process files...',
        processingProgress: 'Processing progress: {current}/{total} - {fileName}',
        processed: 'Processed {current}/{total}: {fileName}',
        calculatingStats: 'Calculating statistics...',
        generatingPersonality: 'Generating personality profile (high-performance matching)...',
        analysisComplete: 'Analysis complete!',
        analysisFailed: 'Analysis failed, using fallback method...',
        parserReady: 'Analysis module ready',
        initializingParser: 'Initializing parser...',
        backgroundSync: 'Background syncing global ranking… (you can continue)',
        rankUploadFailed: 'Global ranking sync failed (retry later)'
      }
    },

    // Analysis Preview
    preview: {
      personalityLabel: 'Personality Verdict',
      analyzing: 'Analyzing...',
      deciphering: 'Deciphering your personality...',
      globalRank: 'Global Rank',
      fullReport: 'View Full Report',
      diagnosisTitle: 'Expert Diagnosis',
      diagnosisFormat: 'You said "please" to Cursor {count} times',
      diagnosisPolite: "You probably aren't even this polite to your boss.",
      diagnosisNormal: "That's quite normal.",
      diagnosisAdvice: 'Recommended to increase "direct command" tone to reclaim your lost coder dignity.',
      shareBtn: 'Share My Evidence of Suffering'
    },

    // Dashboard
    dashboard: {
      clinicalAnalysis:'Vibe Coding Behavioral Clinical Laboratory v1.0',
      reportTitle: 'CURSOR Behavior Report',
      reportSubtitle: 'Deep "vibe coding" analysis based on Cursor logs',
      realtimeStats: '📊 Real-time Stats',
      totalUsers: 'Total Victims',
      techRank: 'Tech Rank',
      personalityUnlock: 'Personality Unlock',
      globalRankings: '🏆 Global Rankings',
      cyberBowRanking: 'Cyber Bow Rank',
      bossModeRanking: 'Boss Mode Rank',
      aiTeasingRanking: 'AI Teasing Rank',
      banterOutputRanking: 'Banter Output Rank',
      avgLengthRanking: 'Avg Length Rank',
      daysOnDutyRanking: 'Days Worked Rank',
      questionRanking: 'Question Mark Rank',
      cyberBowCount: 'Cyber Bows',
      bossModeCount: 'Boss Modes',
      aiTeasingCount: 'AI Teasings',
      banterOutputCount: 'Banter Output',
      avgLengthCount: 'Avg Length',
      daysOnDutyCount: 'Days Worked',
      questionCount: 'Questions',
      dimensionRankingTitle: '🏆 Top 6 Hardcore Dimension Scores',
      dimensionRankingTitleZh: '🏆 六大硬核维度得分排行榜',
      aiMerits: '☁️ AI Merits',
      siliconValleySlang: '🔤 Silicon Valley Slang',
      vibeCodingSlang: 'Vibe Coding Buzzwords',
      userTechStack: '🛠️ User Tech Stack Top 10',
      personUnit: 'UV',
      rankUnit: '#',
      personalityUnlockSuffix: '%',
      dayUnit: 'days',
      techUnit: 'techs',
      pointsUnit: 'pts',
      charUnit: 'chars',
      timesUnit: 'times',
      numberUnits: {
        trillion: 'T',
        hundredBillion: 'B',
        tenBillion: 'B',
        billion: 'B',
        tenMillion: 'M',
        million: 'M',
        hundredThousand: 'K',
        tenThousand: 'K',
        thousand: 'K'
      },
      radarChart: {
        yourScore: 'Your Score',
        globalAverage: 'Global Average',
        switch: 'Switch'
      },
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed, please copy manually',
      systemAnalysis: 'System Analysis',
      friendLinks: {
        nmer: 'Cursor windows toolbox',
        curser: 'Cursor chat history viewer'
      },
      exportBtn: 'Generate Evidence Poster',
      loading: 'Loading...',
      unknownError: 'Unknown Error',
      unknownPersonality: 'Unknown Personality'
    }
  }
};

export const DIMENSIONS = {
  L: { label: 'Logic', description: 'Code Logic Strength' },
  P: { label: 'Patience', description: 'Patience Level' },
  D: { label: 'Detail', description: 'Detail Level' },
  E: { label: 'Exploration', description: 'Exploration Desire' },
  F: { label: 'Feedback', description: 'Feedback Quality' }
};

/**
 * 获取当前语言的所有文本
 * @param {string} lang - 语言代码 ('zh-CN' | 'en')
 * @returns {Object} 语言文本对象
 */
export function getI18nText(lang = 'zh-CN') {
  return I18N[lang] || I18N['zh-CN'];
}

/**
 * 获取指定键的文本
 * @param {string} key - 文本键路径，如 'statsLabels.totalConversations'
 * @param {string} lang - 语言代码
 * @returns {string} 翻译文本
 */
export function getText(key, lang = 'zh-CN') {
  const texts = getI18nText(lang);
  const keys = key.split('.');
  let value = texts;

  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) return key;
  }

  return value;
}

/**
 * 获取维度标签
 * @param {string} dimension - 维度代码 (L|P|D|E|F)
 * @param {string} lang - 语言代码
 * @returns {Object} 维度信息
 */
export function getDimensionInfo(dimension, lang = 'zh-CN') {
  const texts = getI18nText(lang);
  return texts.dimensions[dimension] || DIMENSIONS[dimension];
}
