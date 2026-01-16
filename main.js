/**
 * main.js - 主逻辑文件
 * 集成文件上传、数据库解析、图表渲染和图片导出功能
 */

// 检测基础路径（用于 GitHub Pages 等生产环境）
if (!window.BASE_PATH) {
  const pathname = window.location.pathname;
  const hostname = window.location.hostname;
  const isGitHubPages = hostname.includes('github.io');
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  let basePath = '';

  // 本地开发环境使用相对路径
  if (isLocalhost) {
    basePath = '';
  } else if (isGitHubPages) {
    // GitHub Pages: 从 pathname 提取仓库名
    const pathParts = pathname.split('/').filter(p => p);
    const cleanParts = pathParts.filter(p => p !== 'index.html');
    if (cleanParts.length > 0) {
      basePath = '/' + cleanParts[0];
    }
  } else {
    // 其他生产环境
    const pathParts = pathname.split('/').filter(p => p && p !== 'index.html');
    basePath = pathParts.length > 0 ? '/' + pathParts[0] : '';
  }

  // 确保 basePath 格式正确
  if (basePath && basePath !== '/' && basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }

  window.BASE_PATH = basePath;
  console.log('[Main] 检测到基础路径:', window.BASE_PATH);
}

import { CursorParser } from './src/CursorParser.js';
import { VibeCodingerAnalyzer, DIMENSIONS } from './src/VibeCodingerAnalyzer.js';
// Chart.js 和 html2canvas 通过 CDN 加载，使用全局变量
// import Chart from 'chart.js/auto';
// import html2canvas from 'html2canvas';

// 全局变量
let parser = null;
let allChatData = [];
let globalStats = null;
let vibeAnalyzer = null;
let vibeResult = null;

// 获取当前语言的辅助函数
function getCurrentLang() {
  const savedLang = localStorage.getItem('appLanguage');
  return savedLang === 'en' ? 'en' : 'zh-CN';
}

// i18n 辅助函数
function t(key) {
  if (window.i18n && window.i18n.getText) {
    return window.i18n.getText(key, getCurrentLang());
  }
  return key;
}

// 导出供 React 使用的函数和变量
export const getGlobalStats = () => globalStats;
export const getAllChatData = () => allChatData;
export const getVibeResult = () => vibeResult;
export const getParser = () => parser;
export const getVibeAnalyzer = () => vibeAnalyzer;
// 注意：updateNumberWithAnimation, formatNumber, fetchTotalTestUsers, reportNewUser, updateGlobalStats 
// 在文件后面定义，将在定义时直接导出

// 导出处理函数（需要先初始化）
export const processFiles = async (files, type, callbacks) => {
  console.log('[Main] processFiles 被调用', { filesCount: files.length, type });
  
  // 确保解析器已初始化
  if (!parser) {
    console.log('[Main] 解析器未初始化，正在初始化...');
    parser = new CursorParser();
    await parser.init();
    vibeAnalyzer = new VibeCodingerAnalyzer();
    console.log('[Main] 解析器初始化完成');
  }
  
  // 创建一个模拟的 event 对象
  const mockEvent = {
    target: { files: files, value: '' }
  };
  
  try {
    return await handleFileUpload(mockEvent, type, callbacks);
  } catch (error) {
    console.error('[Main] processFiles 错误:', error);
    if (callbacks?.onError) {
      callbacks.onError(error);
    }
    throw error;
  }
};

// 导出重新分析函数（用于语言切换）
export const reanalyzeWithLanguage = async (lang) => {
  if (!vibeAnalyzer || !allChatData || allChatData.length === 0) {
    console.warn('[Main] 无法重新分析：缺少数据或分析器');
    return null;
  }
  
  console.log('[Main] 使用新语言重新分析:', lang);
  
  // 设置分析器语言
  vibeAnalyzer.setLanguage(lang);
  
  try {
    // 重新分析
    vibeResult = await vibeAnalyzer.analyze(allChatData, lang);
    console.log('[Main] 重新分析完成');
    
    // 重新渲染
    if (document.getElementById('vibeCodingerSection')) {
      displayVibeCodingerAnalysis();
    }
    
    return vibeResult;
  } catch (error) {
    console.warn('[Main] 异步分析失败，使用同步方法:', error);
    vibeResult = vibeAnalyzer.analyzeSync(allChatData, lang);
    if (document.getElementById('vibeCodingerSection')) {
      displayVibeCodingerAnalysis();
    }
    return vibeResult;
  }
};

// 导出渲染函数
export const renderFullDashboard = () => {
  console.log('[Main] renderFullDashboard 被调用');
  console.log('[Main] 数据状态:', {
    hasGlobalStats: !!globalStats,
    hasVibeResult: !!vibeResult,
    chatDataLength: allChatData.length
  });
  
  // 重新获取 DOM 元素引用（因为 React 动态创建了新的 DOM）
  updateElementReferences();
  
  if (globalStats) {
    console.log('[Main] 调用 displayStats...');
    displayStats();
  }
  if (vibeResult) {
    console.log('[Main] 调用 displayVibeCodingerAnalysis...');
    displayVibeCodingerAnalysis();
    // 显示实时统计和维度排行榜
    displayRealtimeStats();
    displayDimensionRanking();
  }
  if (allChatData.length > 0) {
    console.log('[Main] 渲染对话列表...');
    currentPage = 1;
    renderChatList(allChatData);
  }
  console.log('[Main] 渲染词云...');
  renderWordClouds();
  console.log('[Main] renderFullDashboard 完成');
};

// 更新元素引用（用于 React 动态创建的 DOM）
function updateElementReferences() {
  console.log('[Main] 更新元素引用...');
  
  // 更新统计元素
  statsElements.totalConversations = document.getElementById('totalConversations');
  statsElements.userMessages = document.getElementById('userMessages');
  statsElements.qingCount = document.getElementById('qingCount');
  statsElements.buCount = document.getElementById('buCount');
  statsElements.totalUserChars = document.getElementById('totalUserChars');
  statsElements.avgUserMessageLength = document.getElementById('avgUserMessageLength');
  statsElements.questionMessageCount = document.getElementById('questionMessageCount');
  statsElements.topChineseWordsList = document.getElementById('topChineseWordsList');
  
  // 更新其他元素
  elements.searchInput = document.getElementById('searchInput');
  elements.chatList = document.getElementById('chatList');
  elements.paginationContainer = document.getElementById('paginationContainer');
  elements.paginationInfo = document.getElementById('paginationInfo');
  elements.paginationPages = document.getElementById('paginationPages');
  elements.paginationPrev = document.getElementById('paginationPrev');
  elements.paginationNext = document.getElementById('paginationNext');
  elements.exportBtn = document.getElementById('exportBtn');
  
  console.log('[Main] 元素引用更新完成:', {
    totalConversations: !!statsElements.totalConversations,
    userMessages: !!statsElements.userMessages,
    qingCount: !!statsElements.qingCount,
    buCount: !!statsElements.buCount,
    chatList: !!elements.chatList
  });
}

// 导出初始化函数（供 React 调用，不绑定事件）
export const initializeParser = async () => {
  if (!parser) {
    console.log('[Main] 初始化解析器（模块模式）...');
    parser = new CursorParser();
    await parser.init();
    vibeAnalyzer = new VibeCodingerAnalyzer();
    console.log('[Main] 解析器初始化完成');
  }
  return { parser, vibeAnalyzer };
};

// 分页状态
let currentPage = 1;
let itemsPerPage = 20; // 每页显示20条
let filteredChatData = []; // 当前过滤后的数据

// DOM 元素
const elements = {
  uploadSection: document.getElementById('uploadSection'),
  loadingSection: document.getElementById('loadingSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  uploadBtn: document.getElementById('uploadBtn'),
  selectFolderBtn: document.getElementById('selectFolderBtn'),
  folderInput: document.getElementById('folderInput'),
  fileInput: document.getElementById('fileInput'),
  exportBtn: document.getElementById('exportBtn'),
  selectFileBtn: document.getElementById('selectFileBtn'),
  uploadError: document.getElementById('uploadError'),
  loadingProgress: document.getElementById('loadingProgress'),
  exportArea: document.getElementById('exportArea'),
  searchInput: document.getElementById('searchInput'),
  chatList: document.getElementById('chatList'),
  paginationContainer: document.getElementById('paginationContainer'),
  paginationInfo: document.getElementById('paginationInfo'),
  paginationPages: document.getElementById('paginationPages'),
  paginationPrev: document.getElementById('paginationPrev'),
  paginationNext: document.getElementById('paginationNext'),
};

// 统计元素
const statsElements = {
  totalConversations: document.getElementById('totalConversations'),
  userMessages: document.getElementById('userMessages'),
  qingCount: document.getElementById('qingCount'),
  buCount: document.getElementById('buCount'),
  topChineseWordsList: document.getElementById('topChineseWordsList'),
  // 用户行为统计元素
  totalUserChars: document.getElementById('totalUserChars'),
  avgUserMessageLength: document.getElementById('avgUserMessageLength'),
  questionMessageCount: document.getElementById('questionMessageCount'),
};

// 初始化应用
async function init() {
  console.log('[Main] ===== 应用初始化开始 =====');
  console.log('[Main] 当前时间:', new Date().toISOString());

  // 检查 DOM 是否就绪
  if (document.readyState === 'loading') {
    console.log('[Main] 等待 DOM 加载...');
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }

  console.log('[Main] DOM 已就绪，开始获取元素...');

  // 重新获取所有元素（确保 DOM 已加载）
  elements.uploadSection = document.getElementById('uploadSection');
  elements.loadingSection = document.getElementById('loadingSection');
  elements.dashboardSection = document.getElementById('dashboardSection');
  elements.uploadBtn = document.getElementById('uploadBtn');
  elements.selectFolderBtn = document.getElementById('selectFolderBtn');
  elements.folderInput = document.getElementById('folderInput');
  elements.fileInput = document.getElementById('fileInput');
  elements.exportBtn = document.getElementById('exportBtn');
  elements.selectFileBtn = document.getElementById('selectFileBtn');
  elements.uploadError = document.getElementById('uploadError');
  elements.loadingProgress = document.getElementById('loadingProgress');
  elements.exportArea = document.getElementById('exportArea');
  elements.searchInput = document.getElementById('searchInput');
  elements.chatList = document.getElementById('chatList');
  elements.paginationContainer = document.getElementById('paginationContainer');
  elements.paginationInfo = document.getElementById('paginationInfo');
  elements.paginationPages = document.getElementById('paginationPages');
  elements.paginationPrev = document.getElementById('paginationPrev');
  elements.paginationNext = document.getElementById('paginationNext');

  // 初始化解析器
  console.log('[Main] 初始化 CursorParser...');
  parser = new CursorParser();
  await parser.init();
  console.log('[Main] CursorParser 初始化完成');

  // 初始化 Vibe Codinger 分析器
  console.log('[Main] 初始化 VibeCodingerAnalyzer...');
  vibeAnalyzer = new VibeCodingerAnalyzer();
  console.log('[Main] VibeCodingerAnalyzer 初始化完成');

  // 绑定事件
  bindEvents();

  console.log('[Main] ===== 应用初始化完成 =====');
}

// 绑定事件
function bindEvents() {
  // 验证所有元素是否正确获取
  console.log('[Main] 开始绑定事件...');

  // 验证按钮元素
  if (!elements.uploadBtn) {
    console.error('[Main] ❌ uploadBtn 元素未找到');
  } else {
    console.log('[Main] ✅ uploadBtn 元素已找到');
    elements.uploadBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击上传按钮');
      event.preventDefault();
      triggerFileInput(elements.folderInput);
    });
  }

  if (!elements.selectFolderBtn) {
    console.error('[Main] ❌ selectFolderBtn 元素未找到');
  } else {
    console.log('[Main] ✅ selectFolderBtn 元素已找到');
    elements.selectFolderBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击选择文件夹按钮');
      event.preventDefault();
      triggerFileInput(elements.folderInput);
    });
  }

  // 单文件上传按钮
  if (!elements.selectFileBtn) {
    console.error('[Main] ❌ selectFileBtn 元素未找到');
  } else {
    console.log('[Main] ✅ selectFileBtn 元素已找到');
    elements.selectFileBtn.addEventListener('click', (event) => {
      console.log('[Main] 点击选择文件按钮');
      event.preventDefault();
      triggerFileInput(elements.fileInput);
    });
  }

  // 验证文件输入元素
  if (!elements.folderInput) {
    console.error('[Main] ❌ folderInput 元素未找到');
  } else {
    console.log('[Main] ✅ folderInput 元素已找到');
    elements.folderInput.addEventListener('change', (event) => {
      console.log('[Main] 文件夹选择事件触发');
      handleFileUpload(event, 'folder');
    });
  }

  if (!elements.fileInput) {
    console.error('[Main] ❌ fileInput 元素未找到');
  } else {
    console.log('[Main] ✅ fileInput 元素已找到');
    elements.fileInput.addEventListener('change', (event) => {
      console.log('[Main] 文件选择事件触发');
      handleFileUpload(event, 'file');
    });
  }

  // 搜索
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
  }

  // 分页器事件
  if (elements.paginationPrev) {
    elements.paginationPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderChatList(filteredChatData);
      }
    });
  }

  if (elements.paginationNext) {
    elements.paginationNext.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredChatData.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderChatList(filteredChatData);
      }
    });
  }

  // 导出图片
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', handleExport);
  }

  console.log('[Main] 事件绑定完成');
}

// 触发文件选择
function triggerFileInput(inputElement) {
  console.log('[Main] 尝试触发文件选择...');
  console.log('[Main] inputElement:', inputElement);
  console.log('[Main] inputElement.type:', inputElement?.type);

  if (!inputElement) {
    console.error('[Main] ❌ inputElement 为 null');
    return;
  }

  try {
    // 重置 input 的值，允许重新选择相同文件
    inputElement.value = '';
    // 点击触发文件选择
    inputElement.click();
    console.log('[Main] ✅ 文件选择已触发');
  } catch (error) {
    console.error('[Main] ❌ 触发文件选择失败:', error);
    alert('无法打开文件选择对话框，请检查浏览器设置或刷新页面重试。');
  }
}

// 处理文件上传（支持回调函数）
async function handleFileUpload(event, type, callbacks = {}) {
  const { onProgress, onLog, onComplete, onError } = callbacks;
  console.log(`[Main] 处理文件上传，类型: ${type}`);
  console.log(`[Main] event.files.length: ${event.target.files?.length}`);

  const files = Array.from(event.target.files || []);

  // 清除错误信息（仅在非模块模式下）
  if (!callbacks || !callbacks.onLog) {
    hideUploadError();
  }

  if (files.length === 0) {
    console.warn('[Main] 没有选择文件');
    if (callbacks?.onError) {
      callbacks.onError(new Error('没有选择文件'));
    }
    return;
  }

  console.log(`[Main] 选择了 ${files.length} 个文件`);
  console.log('[Main] 文件列表:');
  files.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.name} (${formatFileSize(f.size)})`);
  });

  // 显示加载状态（仅在非模块模式下）
  if (!callbacks || !callbacks.onLog) {
    showLoading();
  } else if (callbacks.onLog) {
    const currentLang = getCurrentLang();
    const logText = window.i18n?.getText('upload.logs.startProcessing', currentLang) || '开始处理文件...';
    callbacks.onLog(`> ${logText}`);
  }

  try {
    let dbFiles = [];
    let filteredFiles = [];

    if (type === 'folder') {
      // 文件夹模式：过滤出 state.vscdb 文件
      dbFiles = files.filter((file) => file.name === 'state.vscdb');
      filteredFiles = files.filter((file) => file.name !== 'state.vscdb');

      console.log(`[Main] 文件夹模式：找到 ${dbFiles.length} 个 state.vscdb 文件`);

      if (filteredFiles.length > 0) {
        console.log(`[Main] 已过滤 ${filteredFiles.length} 个非数据库文件`);
        if (filteredFiles.length <= 10) {
          console.log('[Main] 过滤的文件:', filteredFiles.map(f => f.name));
        }
      }

      if (dbFiles.length === 0) {
        const fileList = filteredFiles.slice(0, 5).map(f => f.name).join(', ');
        const error = filteredFiles.length === 0
          ? '未找到 state.vscdb 文件，请选择正确的 Cursor workspaceStorage 目录'
          : `未找到 state.vscdb 文件。选中的文件包括：${fileList}${filteredFiles.length > 5 ? '...' : ''}`;
        throw new Error(error);
      }
    } else {
      // 单文件模式：过滤出数据库文件
      const validExtensions = ['.vscdb', '.db', '.sqlite', '.sqlite3'];
      dbFiles = files.filter((file) =>
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
      );
      filteredFiles = files.filter((file) =>
        !validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
      );

      console.log(`[Main] 单文件模式：找到 ${dbFiles.length} 个数据库文件`);

      if (filteredFiles.length > 0) {
        console.log(`[Main] 已过滤 ${filteredFiles.length} 个非数据库文件`);
        console.log('[Main] 过滤的文件:', filteredFiles.map(f => f.name));
      }

      if (dbFiles.length === 0) {
        const fileList = filteredFiles.slice(0, 3).map(f => f.name).join(', ');
        const error = filteredFiles.length === 0
          ? '未找到有效的数据库文件（.vscdb, .db, .sqlite, .sqlite3）'
          : `未找到有效的数据库文件。选择的是：${fileList}${filteredFiles.length > 3 ? '...' : ''}，请选择数据库文件`;
        throw new Error(error);
      }
    }

    // 查找所有文件中最早的修改时间
    let earliestFileTime = null;
    if (files.length > 0) {
      // 遍历所有文件（不仅仅是数据库文件），找到最早的修改时间
      for (const file of files) {
        if (file.lastModified) {
          if (earliestFileTime === null || file.lastModified < earliestFileTime) {
            earliestFileTime = file.lastModified;
          }
        }
      }
      console.log('[Main] 最早文件时间:', earliestFileTime ? new Date(earliestFileTime).toISOString() : '未找到');
    }

    // 初始化全局统计数据
    globalStats = {
      totalConversations: 0,
      modelUsage: {},
      userMessages: 0,
      aiMessages: 0,
      hourlyActivity: new Array(24).fill(0),
      dailyActivity: {},
      topPrompts: {},
      qingCount: 0,
      buCount: 0,
      topChineseWords: {},
      chineseWords: {},
      chineseEmotionWords: {}, // 新增：专门存储情绪类词组
      englishWords: {},
      earliestFileTime: earliestFileTime, // 保存最早文件时间
      userBehaviorStats: {
        totalUserChars: 0,
        avgUserMessageLength: 0,
        questionMessageCount: 0,
        techStack: {},
      },
    };

    // 重置全局对话数据
    allChatData = [];

    let processedCount = 0;

    // 逐个处理数据库文件
    for (const file of dbFiles) {
      try {
        console.log(`[Main] 正在处理: ${file.name}`);
        if (file.webkitRelativePath) {
          console.log(`[Main] 相对路径: ${file.webkitRelativePath}`);
        }

        // 读取文件
        const arrayBuffer = await file.arrayBuffer();
        console.log(`[Main] 文件大小: ${arrayBuffer.byteLength} bytes`);

        // 加载数据库
        await parser.loadDatabase(arrayBuffer);

        // 扫描数据库
        const chatData = await parser.scanDatabase();
        console.log(`[Main] 提取到 ${chatData.length} 条记录`);

        // 合并到全局数据
        allChatData = allChatData.concat(chatData);

        // 合并统计
        mergeStats(globalStats, parser.stats);

        processedCount++;
        
        // 更新进度（仅在非模块模式下）
        if (!callbacks || !callbacks.onLog) {
          updateLoadingProgress(processedCount, dbFiles.length);
        }
        
        // 调用进度回调
        if (onProgress) {
          onProgress(processedCount, dbFiles.length, file.name);
        }
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.processed', currentLang) || '已处理 {current}/{total}: {fileName}';
          const processedText = logText.replace('{current}', processedCount).replace('{total}', dbFiles.length).replace('{fileName}', file.name);
          onLog(`> ${processedText}`);
        }

        console.log(`[Main] 当前统计:`, {
          totalConversations: globalStats.totalConversations,
          userMessages: globalStats.userMessages,
          aiMessages: globalStats.aiMessages,
          topPromptsCount: Object.keys(globalStats.topPrompts).length,
        });
      } catch (error) {
        console.error(`[Main] 处理文件失败: ${file.name}`, error);
        // 继续处理其他文件，不中断
      }
    }

    console.log(`[Main] 总共提取 ${allChatData.length} 条对话记录`);

    if (allChatData.length === 0) {
      throw new Error('未找到任何对话数据，请检查数据库文件是否正确');
    }

    // 从所有对话数据重新计算统计（包括词云数据）
    console.log('[Main] 开始重新计算统计（包括词云数据）...');
    if (onLog) {
      const currentLang = getCurrentLang();
      const logText = window.i18n?.getText('upload.logs.calculatingStats', currentLang) || '计算统计数据...';
      onLog(`> ${logText}`);
    }
    calculateStatsFromData(allChatData);
    console.log('[Main] 统计计算完成，词云数据:', {
      chineseWords: Object.keys(globalStats.chineseWords || {}).length,
      englishWords: Object.keys(globalStats.englishWords || {}).length,
    });

    // 进行 Vibe Codinger 人格分析（异步）
    if (allChatData.length > 0) {
      console.log('[Main] 开始 Vibe Codinger 人格分析（Web Worker）...');
      if (onLog) {
        const currentLang = getCurrentLang();
        const logText = window.i18n?.getText('upload.logs.generatingPersonality', currentLang) || '生成人格画像（高性能匹配中）...';
        onLog(`> ${logText}`);
      }
      try {
        const currentLang = getCurrentLang();
        vibeAnalyzer.setLanguage(currentLang);
        vibeResult = await vibeAnalyzer.analyze(allChatData, currentLang);
        console.log('[Main] Vibe Codinger 分析完成:', vibeResult);
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.analysisComplete', currentLang) || '分析完成！';
          onLog(`> ${logText}`);
        }
      } catch (error) {
        console.error('[Main] Vibe Codinger 分析失败:', error);
        if (onLog) {
          const currentLang = getCurrentLang();
          const logText = window.i18n?.getText('upload.logs.analysisFailed', currentLang) || '分析失败，使用降级方案...';
          onLog(`> ${logText}`);
        }
        // 降级到同步方法
        const currentLang = getCurrentLang();
        vibeAnalyzer.setLanguage(currentLang);
        vibeResult = vibeAnalyzer.analyzeSync(allChatData, currentLang);
      }
    }
    
    // 调用完成回调（不自动显示 Dashboard，由 React 控制）
    if (onComplete) {
      onComplete({
        stats: globalStats,
        chatData: allChatData,
        vibeResult: vibeResult
      });
    } else {
      // 如果没有回调，使用原来的逻辑
      showDashboard();
      displayStats();
      if (vibeResult) {
        displayVibeCodingerAnalysis();
      }
      currentPage = 1;
      renderChatList(allChatData);
    }
  } catch (error) {
    console.error('[Main] 处理失败:', error);
    if (onError) {
      onError(error);
    } else {
      // 仅在非模块模式下显示错误
      showUploadError(error.message);
      hideLoading();
    }
  } finally {
    // 清空文件选择，允许重新选择（如果 event.target 存在）
    if (event && event.target) {
      event.target.value = '';
    }
  }
}

/**
 * 合并统计信息
 */
function mergeStats(target, source) {
  target.totalConversations += source.totalConversations;
  target.userMessages += source.userMessages;
  target.aiMessages += source.aiMessages;

  // 合并"请"和"不"的次数统计
  target.qingCount = (target.qingCount || 0) + (source.qingCount || 0);
  target.buCount = (target.buCount || 0) + (source.buCount || 0);

  // 合并用户行为统计
  if (source.userBehaviorStats) {
    target.userBehaviorStats = target.userBehaviorStats || {
      totalUserChars: 0,
      avgUserMessageLength: 0,
      questionMessageCount: 0,
      codeKeywordCount: 0,
      modifyKeywordCount: 0,
    };
    target.userBehaviorStats.totalUserChars += source.userBehaviorStats.totalUserChars || 0;
    target.userBehaviorStats.questionMessageCount += source.userBehaviorStats.questionMessageCount || 0;
    target.userBehaviorStats.codeKeywordCount += source.userBehaviorStats.codeKeywordCount || 0;
    target.userBehaviorStats.modifyKeywordCount += source.userBehaviorStats.modifyKeywordCount || 0;
    
    // 合并技术栈统计
    if (source.userBehaviorStats.techStack) {
      target.userBehaviorStats.techStack = target.userBehaviorStats.techStack || {};
      Object.entries(source.userBehaviorStats.techStack).forEach(([tech, count]) => {
        target.userBehaviorStats.techStack[tech] = (target.userBehaviorStats.techStack[tech] || 0) + count;
      });
    }
    
    // 重新计算平均长度
    if (target.userMessages > 0) {
      target.userBehaviorStats.avgUserMessageLength = Math.round(
        target.userBehaviorStats.totalUserChars / target.userMessages
      );
    }
  }

  // 合并模型使用统计
  for (const [model, count] of Object.entries(source.modelUsage)) {
    target.modelUsage[model] = (target.modelUsage[model] || 0) + count;
  }

  // 合并时段统计
  for (let i = 0; i < 24; i++) {
    target.hourlyActivity[i] += source.hourlyActivity[i];
  }

  // 合并每日活动统计
  for (const [date, count] of Object.entries(source.dailyActivity)) {
    target.dailyActivity[date] = (target.dailyActivity[date] || 0) + count;
  }

  // 合并热门提示词
  for (const [prompt, count] of Object.entries(source.topPrompts)) {
    target.topPrompts[prompt] = (target.topPrompts[prompt] || 0) + count;
  }

  // 合并汉字词组统计
  for (const [word, count] of Object.entries(source.topChineseWords || {})) {
    target.topChineseWords = target.topChineseWords || {};
    target.topChineseWords[word] = (target.topChineseWords[word] || 0) + count;
  }

  // 合并词云数据（如果源数据中有）
  if (source.chineseWords) {
    target.chineseWords = target.chineseWords || {};
    for (const [word, count] of Object.entries(source.chineseWords)) {
      target.chineseWords[word] = (target.chineseWords[word] || 0) + count;
    }
  }

  if (source.englishWords) {
    target.englishWords = target.englishWords || {};
    for (const [word, count] of Object.entries(source.englishWords)) {
      target.englishWords[word] = (target.englishWords[word] || 0) + count;
    }
  }
}

/**
 * 从所有对话数据计算统计
 */
function calculateStatsFromData(chatData) {
  console.log('[Main] 开始计算统计...');

  // 重置全局统计（保留最早文件时间）
  const earliestFileTime = globalStats?.earliestFileTime || null;
  globalStats = {
    totalConversations: 0,
    modelUsage: {},
    userMessages: 0,
    aiMessages: 0,
    hourlyActivity: new Array(24).fill(0),
    dailyActivity: {},
    topPrompts: {},
    qingCount: 0,
    buCount: 0,
    topChineseWords: {},
    chineseWords: {},
    chineseEmotionWords: {}, // 新增：专门存储情绪类词组
    englishWords: {},
    totalCodeChars: 0, // 初始化代码字符数
    earliestFileTime: earliestFileTime, // 保留最早文件时间
    userBehaviorStats: {
      totalUserChars: 0,
      avgUserMessageLength: 0,
      questionMessageCount: 0,
      techStack: {},
    },
  };

  chatData.forEach((item) => {
    // 消息数量
    if (item.role === 'USER') {
      globalStats.userMessages++;
    } else {
      globalStats.aiMessages++;
      globalStats.totalConversations++;
    }

    // 代码字符数 - 只统计AI生成的代码
    if (item.text && item.text.length > 0 && item.role !== 'USER') {
      // 方法1: 提取代码块（```代码块```）
      const codeBlockMatches = item.text.match(/```[\s\S]*?```/g);
      if (codeBlockMatches) {
        codeBlockMatches.forEach(block => {
          // 移除 ``` 标记，只计算实际代码内容
          const codeContent = block.replace(/```[\w]*\n?/g, '').replace(/```/g, '');
          const codeChars = codeContent.length;
          if (codeChars > 0) {
            globalStats.totalCodeChars += codeChars;
            console.log(`[Main] [AI] 代码块 +${codeChars} 字符，总计: ${globalStats.totalCodeChars}`);
          }
        });
      }

      // 方法2: 提取行内代码（`代码`）
      const inlineCodeMatches = item.text.match(/`[^`\n]+`/g);
      if (inlineCodeMatches) {
        inlineCodeMatches.forEach(inline => {
          // 移除 ` 标记，只计算实际代码内容
          const codeContent = inline.replace(/`/g, '');
          const codeChars = codeContent.length;
          if (codeChars > 0) {
            globalStats.totalCodeChars += codeChars;
            console.log(`[Main] [AI] 行内代码 +${codeChars} 字符，总计: ${globalStats.totalCodeChars}`);
          }
        });
      }

      // 方法3: 如果没有代码块标记，但包含大量代码特征，则提取代码部分
      if (!codeBlockMatches && !inlineCodeMatches) {
        const codePatterns = [
          /\b(function|class|const|let|var|if|else|for|while|do|switch|case|break|continue|return|import|export|from|async|await|yield|try|catch|finally|throw|new|this)\b/i,
          /\b(public|private|protected|static|final|abstract|interface|extends|implements|super)\b/i,
          /\b(def |class |import |from |if |elif |else |for |while |try |except |finally |return |yield |with |as |lambda |pass |break |continue )/,
        ];

        let codeScore = 0;
        for (const pattern of codePatterns) {
          if (pattern.test(item.text)) {
            codeScore++;
          }
        }

        const keywords = ['def ', 'def\n', 'func ', 'func\n', 'fn ', '#include', 'import ', '#define', '@', 'defclass ', 'class '];
        for (const keyword of keywords) {
          if (item.text.includes(keyword)) {
            codeScore += 2;
            break;
          }
        }

        // 如果代码特征明显（>= 3），尝试提取代码部分
        if (codeScore >= 3) {
          const codeStartPattern = /\b(function|class|const|let|var|def |func |fn |import |#include|public|private)\b/i;
          const match = item.text.match(codeStartPattern);
          if (match && match.index !== undefined) {
            const codeStart = match.index;
            const codeEnd = Math.min(codeStart + 5000, item.text.length);
            const estimatedCodeChars = codeEnd - codeStart;
            const codeChars = Math.round(estimatedCodeChars * 0.7); // 假设70%是代码
            globalStats.totalCodeChars += codeChars;
            console.log(`[Main] [AI] 代码段（估算） +${codeChars} 字符（代码特征=${codeScore}），总计: ${globalStats.totalCodeChars}`);
          }
        }
      }
    }

    // 模型使用统计
    const model = item.model || 'unknown';
    globalStats.modelUsage[model] = (globalStats.modelUsage[model] || 0) + 1;
    console.log(`[Main] 模型使用: ${model} = ${globalStats.modelUsage[model]}`);

    // 按小时活动统计
    if (item.timestamp) {
      try {
        const hour = new Date(item.timestamp).getHours();
        globalStats.hourlyActivity[hour]++;
      } catch (e) {
        console.error('[Main] 时段统计失败:', e);
      }
    }

    // 按天活动统计
    if (item.timestamp) {
      try {
        const date = new Date(item.timestamp).toISOString().split('T')[0];
        globalStats.dailyActivity[date] = (globalStats.dailyActivity[date] || 0) + 1;
      } catch (e) {
        console.error('[Main] 日期统计失败:', e);
      }
    }

    // 收集提示词（用户消息）
    if (item.role === 'USER' && item.text) {
      // 统计用户消息字符数
      const textLength = item.text.length;
      globalStats.userBehaviorStats.totalUserChars += textLength;
      
      // 统计包含问号的消息
      if (item.text.includes('?') || item.text.includes('？')) {
        globalStats.userBehaviorStats.questionMessageCount++;
      }
      
      // 统计"请"和"不"的次数
      const qingMatches = item.text.match(/请/g);
      if (qingMatches) {
        globalStats.qingCount += qingMatches.length;
      }
      const buMatches = item.text.match(/不/g);
      if (buMatches) {
        globalStats.buCount += buMatches.length;
      }
      
      extractWordsFromText(item.text);
      
      // 提取中文词组（用于Top 10显示）
      extractChineseWordsForTop10(item.text);
      
      // 提取词云数据（中英文分离）
      extractWordCloudData(item.text);
    }
  });

  // 计算平均消息长度
  if (globalStats.userMessages > 0) {
    globalStats.userBehaviorStats.avgUserMessageLength = Math.round(
      globalStats.userBehaviorStats.totalUserChars / globalStats.userMessages
    );
  }

  console.log('[Main] 统计计算完成:', {
    totalConversations: globalStats.totalConversations,
    userMessages: globalStats.userMessages,
    aiMessages: globalStats.aiMessages,
    totalCodeChars: globalStats.totalCodeChars,
    totalUserChars: globalStats.userBehaviorStats.totalUserChars,
    avgUserMessageLength: globalStats.userBehaviorStats.avgUserMessageLength,
    qingCount: globalStats.qingCount,
    buCount: globalStats.buCount,
    modelUsageCount: Object.keys(globalStats.modelUsage).length,
    topPromptsCount: Object.keys(globalStats.topPrompts).length,
    hourlyNonZero: globalStats.hourlyActivity.filter(v => v > 0).length,
    dailyCount: Object.keys(globalStats.dailyActivity).length,
    chineseWordsCount: Object.keys(globalStats.chineseWords || {}).length,
    englishWordsCount: Object.keys(globalStats.englishWords || {}).length,
  });
}

/**
 * 从文本中提取单词
 */
function extractWordsFromText(text) {
  // 常见停用词（中英文）
  const stopWords = new Set([
    // 中文停用词
    '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
    '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
    '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
    '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个', '哪个',
    '吗', '呢', '吧', '啊', '哦', '嗯', '哈', '嘿', '好',
    // 英文停用词
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'i', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
    'my', 'his', 'her', 'its', 'our', 'your', 'their', 'mine', 'theirs',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
    'please', 'help', 'write', 'a', 'one', 'some', 'any', 'all', 'both',
    'how', 'what', 'which', 'who', 'when', 'where', 'why', 'whether',
    'yes', 'no', 'not', 'just', 'only', 'also', 'too', 'very', 'really',
    'okay', 'ok', 'right', 'left', 'up', 'down', 'back', 'front', 'forward',
  ]);

  // 分词：支持中英文
  const wordPattern = /[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g;
  const words = text.match(wordPattern) || [];

  // 统计词频
  words.forEach(word => {
    if (word.length < 2) return; // 跳过太短的词
    if (word.length > 20) return; // 跳过太长的词

    const lowerWord = word.toLowerCase();
    if (stopWords.has(lowerWord)) return; // 跳过停用词

    globalStats.topPrompts[lowerWord] = (globalStats.topPrompts[lowerWord] || 0) + 1;
  });

  const uniqueWords = Object.keys(globalStats.topPrompts).length;
  console.log(`[Main] 提取到 ${uniqueWords} 个唯一词，${words.length} 个总词`);
}

// 显示加载状态
function showLoading() {
  console.log('[Main] 显示加载状态...');
  elements.uploadSection.classList.add('hidden');
  elements.loadingSection.classList.remove('hidden');
  elements.dashboardSection.classList.add('hidden');
  console.log('[Main] ✅ 加载状态已显示');
}

// 隐藏加载状态
function hideLoading() {
  if (elements.loadingSection) {
    elements.loadingSection.classList.add('hidden');
  }
}

// 显示上传错误
function showUploadError(message) {
  console.error('[Main] 上传错误:', message);
  if (elements.uploadError) {
    elements.uploadError.textContent = message;
    elements.uploadError.classList.remove('hidden');
  }
}

// 隐藏上传错误
function hideUploadError() {
  if (elements.uploadError) {
    elements.uploadError.classList.add('hidden');
    elements.uploadError.textContent = '';
  }
}

// 更新加载进度
function updateLoadingProgress(current, total) {
  const progressText = `已处理 ${current}/${total} 个文件`;
  if (elements.loadingProgress) {
    elements.loadingProgress.textContent = progressText;
  }
  console.log(`[Main] ${progressText}`);
}

// 显示分析结果
function showDashboard() {
  console.log('[Main] 显示分析结果...');
  // 隐藏上传和加载区域，显示仪表盘
  if (elements.uploadSection) elements.uploadSection.classList.add('hidden');
  if (elements.loadingSection) elements.loadingSection.classList.add('hidden');
  if (elements.dashboardSection) {
    elements.dashboardSection.classList.remove('hidden');
    elements.dashboardSection.style.display = 'block';
  }
  
  // 显示所有统计网格
  const statsGrids = document.querySelectorAll('.stats-grid');
  statsGrids.forEach(grid => {
    grid.classList.remove('hidden');
    grid.style.display = 'grid';
  });
  
  // 显示词云区域
  const wordcloudSection = document.querySelector('.wordcloud-section');
  if (wordcloudSection) {
    wordcloudSection.classList.remove('hidden');
    wordcloudSection.style.display = 'grid';
  }
  
  // 显示所有图表卡片
  const chartCards = document.querySelectorAll('.chart-card');
  chartCards.forEach(card => {
    if (!card.classList.contains('hidden') && card.id !== 'techStackSection') {
      card.style.display = 'block';
    }
  });
  
  // 显示对话列表区域
  const chatListSection = document.querySelector('.chat-list-section');
  if (chatListSection) {
    chatListSection.style.display = 'block';
  }
  
  console.log('[Main] ✅ 分析结果已显示');
}

// 显示统计信息
function displayStats() {
  console.log('[Main] 开始显示统计信息...');

  try {
    // 使用全局统计
    const stats = {
      totalConversations: globalStats.totalConversations,
      totalCodeChars: globalStats.totalCodeChars,
      modelUsage: globalStats.modelUsage,
      userMessages: globalStats.userMessages,
      qingCount: globalStats.qingCount || 0,
      buCount: globalStats.buCount || 0,
      topChineseWordsList: getTopChineseWords(globalStats.topChineseWords, 10),
    };

    console.log('[Main] 统计数据:', {
      totalConversations: stats.totalConversations,
      totalCodeChars: stats.totalCodeChars,
      userMessages: stats.userMessages,
      qingCount: stats.qingCount,
      buCount: stats.buCount,
      topChineseWordsList: stats.topChineseWordsList?.length || 0,
    });
    console.log('[Main] ✅ "请"字次数:', stats.qingCount);
    console.log('[Main] ✅ "不"字次数:', stats.buCount);

    // 计算使用时长（天数）
    let usageDays = 0;
    if (globalStats.earliestFileTime) {
      const now = Date.now();
      const earliest = globalStats.earliestFileTime;
      const diffMs = now - earliest;
      usageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      console.log('[Main] 使用时长计算:', {
        earliestTime: new Date(earliest).toISOString(),
        nowTime: new Date(now).toISOString(),
        diffMs: diffMs,
        usageDays: usageDays,
      });
    }

    // 更新统计卡片（添加安全检查）
    if (statsElements.totalConversations) {
      statsElements.totalConversations.textContent = formatNumber(usageDays);
    }
    if (statsElements.qingCount) {
      statsElements.qingCount.textContent = formatNumber(stats.qingCount);
    }
    if (statsElements.buCount) {
      statsElements.buCount.textContent = formatNumber(stats.buCount);
    }
    if (statsElements.userMessages) {
      statsElements.userMessages.textContent = formatNumber(stats.userMessages);
    }

    // 更新用户行为统计（只显示有数据的）
    if (globalStats.userBehaviorStats) {
      const behaviorStats = globalStats.userBehaviorStats;
      
      // 更新总字符数（总是显示）
      if (statsElements.totalUserChars) {
        statsElements.totalUserChars.textContent = formatNumber(behaviorStats.totalUserChars || 0);
      }
      
      // 更新平均长度（总是显示）
      if (statsElements.avgUserMessageLength) {
        statsElements.avgUserMessageLength.textContent = formatNumber(behaviorStats.avgUserMessageLength || 0);
      }
      
      // 只显示有数据的统计项
      const questionCard = document.getElementById('questionCard');
      if (questionCard && behaviorStats.questionMessageCount > 0) {
        questionCard.style.display = '';
        if (statsElements.questionMessageCount) {
          statsElements.questionMessageCount.textContent = formatNumber(behaviorStats.questionMessageCount);
        }
      }
      
      // 显示技术栈统计
      displayTechStack(behaviorStats.techStack || {});
    }

    // 显示词云（无论是否有 userBehaviorStats 都要渲染）
    console.log('[Main] 准备渲染词云，数据状态:', {
      chineseWords: Object.keys(globalStats.chineseWords || {}).length,
      englishWords: Object.keys(globalStats.englishWords || {}).length,
    });
    renderWordClouds();

    // 渲染用户提问最多汉字词组
    console.log('[Main] 开始渲染用户提问最多汉字词组...');
    renderTopChineseWords(stats.topChineseWordsList);

    console.log('[Main] ✅ 统计信息显示完成');
  } catch (error) {
    console.error('[Main] ❌ 显示统计信息失败:', error);
    throw error;
  }
}

// 格式化数字（支持多语言和大数值）
export function formatNumber(num, lang = null) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  
  // 获取当前语言
  if (!lang) {
    lang = getCurrentLang();
  }
  const isEn = lang === 'en';
  
  // 英文使用标准格式：K, M, B, T
  if (isEn) {
    if (num >= 1000000000000) {
      // Trillion (万亿)
      return (num / 1000000000000).toFixed(1) + 'T';
    }
    if (num >= 1000000000) {
      // Billion (十亿)
      return (num / 1000000000).toFixed(1) + 'B';
    }
    if (num >= 1000000) {
      // Million (百万)
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      // Thousand (千)
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
  
  // 中文使用万、亿等单位
  if (num >= 1000000000000) {
    // 万亿
    return (num / 1000000000000).toFixed(1) + '万亿';
  }
  if (num >= 100000000000) {
    // 千亿
    return (num / 100000000000).toFixed(1) + '千亿';
  }
  if (num >= 10000000000) {
    // 百亿
    return (num / 10000000000).toFixed(1) + '百亿';
  }
  if (num >= 100000000) {
    // 亿
    return (num / 100000000).toFixed(1) + '亿';
  }
  if (num >= 10000000) {
    // 千万
    return (num / 10000000).toFixed(1) + '千万';
  }
  if (num >= 1000000) {
    // 百万
    return (num / 1000000).toFixed(1) + '百万';
  }
  if (num >= 100000) {
    // 十万
    return (num / 100000).toFixed(1) + '十万';
  }
  if (num >= 10000) {
    // 万
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    // 千（使用K）
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// 获取热门提示词
function getTopPrompts(topPrompts, limit = 5) {
  const entries = Object.entries(topPrompts);
  if (entries.length === 0) return [];

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([prompt, count]) => ({ prompt, count }));
}

// 获取热门汉字词组
function getTopChineseWords(topChineseWords, limit = 10) {
  const entries = Object.entries(topChineseWords || {});
  if (entries.length === 0) return [];

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// 渲染用户提问最多汉字词组
function renderTopChineseWords(topChineseWordsList) {
  console.log('[Main] 开始渲染用户提问最多汉字词组...');
  const container = statsElements.topChineseWordsList || document.getElementById('topChineseWordsList');

  if (!container) {
    console.warn('[Main] topChineseWordsList 容器未找到');
    return;
  }

  if (!topChineseWordsList || topChineseWordsList.length === 0) {
    container.innerHTML = `
      <div class="prompt-item">
        <span class="prompt-text">暂无汉字词组数据</span>
        <span class="prompt-count">0 次</span>
      </div>
    `;
    console.log('[Main] 没有汉字词组数据');
    return;
  }

  console.log(`[Main] 共有 ${topChineseWordsList.length} 个汉字词组`);
  topChineseWordsList.forEach((item, index) => {
    console.log(`  #${index + 1} "${item.word}" ${item.count} 次`);
  });

  container.innerHTML = topChineseWordsList.map((item, index) => `
    <div class="prompt-item">
      <span class="prompt-rank">#${index + 1}</span>
      <span class="prompt-text">${escapeHtml(item.word)}</span>
      <span class="prompt-count">${item.count} 次</span>
    </div>
  `).join('');

  console.log('[Main] ✅ 汉字词组渲染完成');
}

// 渲染对话列表
function renderChatList(chatData) {
  console.log(`[Main] 渲染对话列表，共 ${chatData.length} 条记录`);

  // 保存当前过滤后的数据
  filteredChatData = chatData;

  const container = elements.chatList;
  const totalPages = Math.ceil(chatData.length / itemsPerPage);

  // 重置到第一页（如果数据变少导致当前页超出范围）
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  // 计算当前页的数据范围
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const items = chatData.slice(startIndex, endIndex);

  console.log(`[Main] 显示第 ${currentPage}/${totalPages} 页，共 ${items.length} 条记录`);

  if (items.length === 0) {
    container.innerHTML = `
      <div class="chat-item-more">
        暂无对话记录
      </div>
    `;
    // 隐藏分页器
    if (elements.paginationContainer) {
      elements.paginationContainer.style.display = 'none';
    }
    return;
  }

  try {
    container.innerHTML = items.map((item, index) => {
      // 验证 item 结构
      if (!item) {
        console.warn(`[Main] item ${index} 为 null，跳过`);
        return '';
      }

      const text = item.text || '';
      const role = item.role || 'AI';
      const timestamp = item.timestamp || new Date().toISOString();

      if (text.length === 0) {
        console.warn(`[Main] item ${index} 的文本为空，跳过`);
        return '';
      }

      return `
        <div class="chat-item">
          <div class="chat-item-header">
            <span class="chat-role ${role === 'USER' ? 'role-user' : 'role-ai'}">
              <span style="color: var(--accent-terminal);">${role === 'USER' ? '>' : '$'}</span> ${role}
            </span>
            <span class="chat-time">${formatTime(timestamp)}</span>
          </div>
          <div class="chat-item-content">
            <p>${escapeHtml(text.substring(0, 200))}${text.length > 200 ? '...' : ''}</p>
          </div>
        </div>
      `;
    }).join('');

    // 渲染分页器
    renderPagination(chatData.length, totalPages);

    console.log('[Main] ✅ 对话列表渲染完成');
  } catch (error) {
    console.error('[Main] ❌ 渲染对话列表失败:', error);
    container.innerHTML = `
      <div class="chat-item-more">
        对话列表加载失败：${error.message}
      </div>
    `;
    // 隐藏分页器
    if (elements.paginationContainer) {
      elements.paginationContainer.style.display = 'none';
    }
  }
}

// 渲染分页器
function renderPagination(totalItems, totalPages) {
  if (!elements.paginationContainer || !elements.paginationInfo || !elements.paginationPages) {
    return;
  }

  // 如果只有一页或没有数据，隐藏分页器
  if (totalPages <= 1) {
    elements.paginationContainer.style.display = 'none';
    return;
  }

  // 显示分页器
  elements.paginationContainer.style.display = 'flex';

  // 更新分页信息
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const currentLang = getCurrentLang();
  const paginationText = window.i18n?.getText('chatList.paginationInfo', currentLang) || '第 {currentPage} 页，共 {totalPages} 页（共 {totalItems} 条记录，显示 {startItem}-{endItem} 条）';
  elements.paginationInfo.textContent = paginationText
    .replace('{currentPage}', currentPage)
    .replace('{totalPages}', totalPages)
    .replace('{totalItems}', totalItems)
    .replace('{startItem}', startItem)
    .replace('{endItem}', endItem);

  // 更新上一页/下一页按钮状态
  if (elements.paginationPrev) {
    elements.paginationPrev.disabled = currentPage === 1;
  }
  if (elements.paginationNext) {
    elements.paginationNext.disabled = currentPage === totalPages;
  }

  // 生成页码按钮
  const pagesContainer = elements.paginationPages;
  pagesContainer.innerHTML = '';

  // 计算显示的页码范围
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  // 如果当前页靠近开头，显示更多后面的页码
  if (currentPage <= 3) {
    endPage = Math.min(5, totalPages);
  }

  // 如果当前页靠近结尾，显示更多前面的页码
  if (currentPage >= totalPages - 2) {
    startPage = Math.max(1, totalPages - 4);
  }

  // 添加第一页按钮（如果不在显示范围内）
  if (startPage > 1) {
    const firstBtn = document.createElement('button');
    firstBtn.className = 'pagination-page-btn';
    firstBtn.textContent = '1';
    firstBtn.addEventListener('click', () => {
      currentPage = 1;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(firstBtn);

    if (startPage > 2) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      pagesContainer.appendChild(ellipsis);
    }
  }

  // 添加页码按钮
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = 'pagination-page-btn';
    if (i === currentPage) {
      pageBtn.classList.add('active');
    }
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(pageBtn);
  }

  // 添加最后一页按钮（如果不在显示范围内）
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      pagesContainer.appendChild(ellipsis);
    }

    const lastBtn = document.createElement('button');
    lastBtn.className = 'pagination-page-btn';
    lastBtn.textContent = totalPages;
    lastBtn.addEventListener('click', () => {
      currentPage = totalPages;
      renderChatList(filteredChatData);
    });
    pagesContainer.appendChild(lastBtn);
  }
}

// 处理搜索
function handleSearch(event) {
  const keyword = event.target.value.trim();

  // 重置到第一页
  currentPage = 1;

  if (!keyword) {
    renderChatList(allChatData);
    return;
  }

  const filtered = allChatData.filter(
    (item) => item.text.toLowerCase().includes(keyword.toLowerCase())
  );

  renderChatList(filtered);
}

// 导出图片
async function handleExport() {
  const exportArea = elements.exportArea;

  try {
    // 显示导出中提示
    const originalText = elements.exportBtn.innerHTML;
    elements.exportBtn.innerHTML = '<span class="btn-icon">⏳</span><span>生成中...</span>';
    elements.exportBtn.disabled = true;

    // 使用全局 html2canvas 对象（通过 CDN 加载）
    const html2canvas = window.html2canvas || globalThis.html2canvas;
    if (!html2canvas) {
      throw new Error('html2canvas 未加载，请确保 CDN 资源已正确加载');
    }

    // 使用 html2canvas 导出
    const canvas = await html2canvas(exportArea, {
      backgroundColor: '#ffffff',
      scale: 2, // 高清导出
      useCORS: true,
      logging: false,
    });

    // 下载图片
    const link = document.createElement('a');
    link.download = `cursor-audit-${new Date().getTime()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // 恢复按钮
    elements.exportBtn.innerHTML = originalText;
    elements.exportBtn.disabled = false;

    console.log('[Main] 导出成功');
  } catch (error) {
    console.error('[Main] 导出失败:', error);
    alert('导出失败: ' + error.message);

    elements.exportBtn.innerHTML = '<span class="btn-icon">📊</span><span>晒出cursor受虐证据</span>';
    elements.exportBtn.disabled = false;
  }
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 显示 Vibe Codinger 人格分析结果
function displayVibeCodingerAnalysis() {
  if (!vibeResult) return;

  const container = document.getElementById('vibeCodingerSection');
  if (!container) return;

  const { personalityType, dimensions, analysis, semanticFingerprint, statistics, vibeIndex, roastText, personalityName, lpdef } = vibeResult;

  // 生成人格头衔（根据索引特征）
  const getPersonalityTitle = (index) => {
    const lang = getCurrentLang();
    const personalityTitles = lang === 'en' 
      ? window.i18n?.getI18nText('en')?.vibeCodinger?.personalityTitles
      : window.i18n?.getI18nText('zh-CN')?.vibeCodinger?.personalityTitles;
    
    if (!personalityTitles) {
      // Fallback to hardcoded Chinese
      const l = index[0] === '2' ? '硬核' : index[0] === '1' ? '标准' : '随性';
      const p = index[1] === '2' ? '耐心' : index[1] === '1' ? '平衡' : '急躁';
      const d = index[2] === '2' ? '细节控' : index[2] === '1' ? '适中' : '极简';
      const e = index[3] === '2' ? '探索者' : index[3] === '1' ? '观望' : '守旧';
      const f = index[4] === '2' ? '暖男' : index[4] === '1' ? '职业' : '冷酷';
      return `${l}·${p}·${d}·${e}·${f}`;
    }
    
    const l = index[0] === '2' ? personalityTitles.l[2] : index[0] === '1' ? personalityTitles.l[1] : personalityTitles.l[0];
    const p = index[1] === '2' ? personalityTitles.p[2] : index[1] === '1' ? personalityTitles.p[1] : personalityTitles.p[0];
    const d = index[2] === '2' ? personalityTitles.d[2] : index[2] === '1' ? personalityTitles.d[1] : personalityTitles.d[0];
    const e = index[3] === '2' ? personalityTitles.e[2] : index[3] === '1' ? personalityTitles.e[1] : personalityTitles.e[0];
    const f = index[4] === '2' ? personalityTitles.f[2] : index[4] === '1' ? personalityTitles.f[1] : personalityTitles.f[0];
    return `${l}·${p}·${d}·${e}·${f}`;
  };

  // 生成维度标签
  const getDimensionTags = (dimensions) => {
    const tags = [];
    const lang = getCurrentLang();
    Object.entries(dimensions).forEach(([key, value]) => {
      // E 维度特殊处理
      let level;
      const dimInfo = window.i18n?.getI18nText(lang)?.dimensions?.[key];
      if (key === 'E') {
        level = value < 5 ? (dimInfo?.levels?.low || '低') : value < 10 ? (dimInfo?.levels?.medium || '中') : (dimInfo?.levels?.high || '高');
      } else {
        level = value < 40 ? (dimInfo?.levels?.low || '低') : value < 70 ? (dimInfo?.levels?.medium || '中') : (dimInfo?.levels?.high || '高');
      }
      // 使用 i18n 获取翻译后的标签
      const label = dimInfo?.label || window.i18n?.getText(`dimensions.${key}.label`, lang) || DIMENSIONS[key].label;
      tags.push(`${label}:${level}`);
    });
    return tags;
  };

  // 渲染人格画像
  container.innerHTML = `
    <div class="vibe-header">
      <h2 class="vibe-title">${t('vibeCodinger.title')}</h2>
      <div class="vibe-badge" style="background: transparent; border: 2px solid var(--accent-terminal);">
        <span class="vibe-type">${personalityType}</span>
        <span class="vibe-name">${personalityName || analysis.name}</span>
      </div>
      <p class="vibe-description">${analysis.description}</p>
    </div>

    <!-- 新增：人格头衔和吐槽区域 -->
    <div class="vibe-roast-section">
      <div class="roast-header">
        <h3 class="roast-title">${t('vibeCodinger.roastTitle')}</h3>
        <div class="personality-title">${getPersonalityTitle(vibeIndex)}</div>
        <div class="vibe-index">${getCurrentLang() === 'en' ? `${t('vibeCodinger.lpdef')}: ${lpdef || 'N/A'}` : `${t('vibeCodinger.index')}: ${vibeIndex} | ${t('vibeCodinger.lpdef')}: ${lpdef || 'N/A'}`}</div>
      </div>
      <div class="roast-content">
        <p class="roast-text">${roastText}</p>
      </div>
      <div class="dimension-tags">
        ${getDimensionTags(dimensions).map(tag => `
          <span class="dimension-tag">${tag}</span>
        `).join('')}
      </div>
    </div>

    <div class="vibe-dimensions">
      <h3 class="dimensions-title">${t('vibeCodinger.dimensionsTitle')}</h3>
      ${Object.entries(dimensions).map(([key, value]) => {
        const dimInfo = analysis.dimensions[key];
        const percentage = value;
        const dimLabel = window.i18n?.getI18nText(getCurrentLang())?.dimensions?.[key]?.label || DIMENSIONS[key].label;
        const dimDesc = window.i18n?.getI18nText(getCurrentLang())?.dimensions?.[key]?.description || DIMENSIONS[key].description;
        return `
          <div class="dimension-card">
            <div class="dimension-header">
              <span class="dimension-key">${key}</span>
              <span class="dimension-label">${dimLabel}</span>
              <span class="dimension-value">${value}</span>
              <span class="dimension-level">${dimInfo.level}</span>
            </div>
            <div class="dimension-bar-container">
              <div class="dimension-bar" style="width: ${percentage}%; background: var(--accent-terminal)"></div>
            </div>
            <p class="dimension-interpretation">${dimInfo.interpretation}</p>
            <p class="dimension-desc">${dimDesc}</p>
          </div>
        `;
      }).join('')}
    </div>

    <div class="vibe-traits">
      <h3 class="traits-title">${t('vibeCodinger.traitsTitle')}</h3>
      <div class="traits-list">
        ${analysis.traits.map(trait => `
          <div class="trait-tag">${trait}</div>
        `).join('')}
      </div>
    </div>

    <div class="vibe-fingerprint">
      <h3 class="fingerprint-title">${t('vibeCodinger.fingerprintTitle')}</h3>
      <div class="fingerprint-grid">
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.codeRatio')}</span>
          <span class="fingerprint-value">${semanticFingerprint.codeRatio || 'N/A'}</span>
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.patienceLevel')}</span>
          <span class="fingerprint-value">${semanticFingerprint.patienceLevel || 'N/A'}</span>
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.detailLevel')}</span>
          <span class="fingerprint-value">${semanticFingerprint.detailLevel || 'N/A'}</span>
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.techExploration')}</span>
          <span class="fingerprint-value">${semanticFingerprint.techExploration || 'N/A'}</span>
        </div>
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.feedbackDensity')}</span>
          <span class="fingerprint-value">${semanticFingerprint.feedbackDensity || 'N/A'}</span>
        </div>
        ${semanticFingerprint.compositeScore ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.score')}</span>
          <span class="fingerprint-value">${semanticFingerprint.compositeScore}</span>
        </div>
        ` : ''}
        ${semanticFingerprint.techDiversity ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.diversity')}</span>
          <span class="fingerprint-value">${semanticFingerprint.techDiversity}</span>
        </div>
        ` : ''}
        ${semanticFingerprint.interactionStyle ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.style')}</span>
          <span class="fingerprint-value">${semanticFingerprint.interactionStyle}</span>
        </div>
        ` : ''}
        ${semanticFingerprint.balanceIndex ? `
        <div class="fingerprint-item">
          <span class="fingerprint-label">${t('fingerprint.balance')}</span>
          <span class="fingerprint-value">${semanticFingerprint.balanceIndex}</span>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="vibe-chart-container">
      <h3 class="chart-title">${t('vibeCodinger.chartTitle')}</h3>
      <div class="chart-wrapper">
        <canvas id="vibeRadarChart"></canvas>
      </div>
    </div>
  `;

  // 渲染雷达图（增强版，显示所有维度）
  renderVibeRadarChart();
}

// 获取维度颜色
function getDimensionColor(key) {
  const colors = {
    L: '#10b981', // 绿色 - 逻辑力
    P: '#3b82f6', // 蓝色 - 耐心值
    D: '#8b5cf6', // 紫色 - 细腻度
    E: '#f59e0b', // 橙色 - 探索欲
    F: '#ec4899', // 粉色 - 反馈感
  };
  return colors[key] || '#666';
}

// 渲染雷达图（增强版：包含全局平均基准对比层）
function renderVibeRadarChart() {
  // 使用全局 Chart 对象（通过 CDN 加载）
  const Chart = window.Chart || globalThis.Chart;
  if (!vibeResult || !Chart) {
    console.warn('[Main] Chart.js 未加载，无法渲染雷达图');
    return;
  }

  const canvas = document.getElementById('vibeRadarChart');
  if (!canvas) return;

  const { dimensions } = vibeResult;
  const ctx = canvas.getContext('2d');

  // 销毁旧图表
  if (window.vibeRadarChartInstance) {
    window.vibeRadarChartInstance.destroy();
  }

  // 获取全局平均基准（从 Worker 返回的数据中获取，如果没有则使用默认值）
  const globalAverage = vibeResult.globalAverage || {
    L: 65,
    P: 70,
    D: 60,
    E: 55,
    F: 75,
  };

  // E 维度映射到 0-100
  const eValue = dimensions.E >= 10 ? 100 : dimensions.E >= 5 ? 70 : 40;
  const eAverage = globalAverage.E >= 10 ? 100 : globalAverage.E >= 5 ? 70 : 40;
  
  // 获取当前语言
  const currentLang = getCurrentLang();
  const isEn = currentLang === 'en';
  
  // 使用 i18n 获取维度标签
  const dimLabels = ['L', 'P', 'D', 'E', 'F'].map(key => {
    const dimInfo = window.i18n?.getI18nText(currentLang)?.dimensions?.[key];
    const label = dimInfo?.label || DIMENSIONS[key]?.label || key;
    return `${label} (${key})`;
  });
  
  // 使用 i18n 获取数据集标签
  const yourScoreLabel = window.i18n?.getText('dashboard.radarChart.yourScore', currentLang) || '你的得分';
  const globalAverageLabel = window.i18n?.getText('dashboard.radarChart.globalAverage', currentLang) || '全网平均';
  
  // Chart 已在函数开头声明，直接使用
  window.vibeRadarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: dimLabels,
      datasets: [
        {
          label: yourScoreLabel,
          data: [
            dimensions.L,
            dimensions.P,
            dimensions.D,
            eValue,
            dimensions.F,
          ],
          backgroundColor: 'rgba(0, 255, 65, 0.2)',
          borderColor: 'rgba(0, 255, 65, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(0, 255, 65, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(0, 255, 65, 1)',
          pointRadius: 5,
          pointHoverRadius: 7,
        },
        {
          label: globalAverageLabel,
          data: [
            globalAverage.L,
            globalAverage.P,
            globalAverage.D,
            eAverage,
            globalAverage.F,
          ],
          backgroundColor: 'rgba(113, 113, 122, 0.1)',
          borderColor: 'rgba(113, 113, 122, 0.5)',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointBackgroundColor: 'rgba(113, 113, 122, 0.5)',
          pointBorderColor: 'rgba(113, 113, 122, 0.8)',
          pointHoverBackgroundColor: 'rgba(113, 113, 122, 0.8)',
          pointHoverBorderColor: 'rgba(113, 113, 122, 1)',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 20,
          right: 20
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20,
            display: false, // 隐藏数字
          },
          grid: {
            color: 'rgba(0, 255, 65, 0.1)',
          },
          pointLabels: {
            font: {
              size: 12,
            },
            color: '#ffffff',
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#ffffff',
            font: {
              family: "'JetBrains Mono', monospace",
            },
            // 图例颜色块会自动使用数据集的 borderColor（已在上面设置为绿色和深灰色）
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${context.parsed.r}分`;
            },
          },
        },
      },
    },
  });
}

// 更新数字并触发动画
export function updateNumberWithAnimation(element, newValue, formatter = (v) => v.toString()) {
  if (!element) return;
  
  const oldValue = parseInt(element.textContent.replace(/[^0-9]/g, '')) || 0;
  const newNum = parseInt(newValue.toString().replace(/[^0-9]/g, '')) || 0;
  
  if (oldValue !== newNum) {
    // 添加更新动画类
    element.classList.add('updating');
    
    // 数字跳动动画
    element.classList.add('animate-pulse');
    setTimeout(() => {
      element.classList.remove('animate-pulse');
    }, 600);
    
    // 更新数值（带过渡效果）
    animateNumber(element, oldValue, newNum, formatter, () => {
      element.classList.remove('updating');
    });
  } else {
    // 即使数值相同，也显示闪烁效果（表示实时更新）
    element.classList.add('animate-flash');
    setTimeout(() => {
      element.classList.remove('animate-flash');
    }, 400);
  }
}

// 数字递增动画
function animateNumber(element, from, to, formatter, onComplete) {
  const duration = 800; // 动画时长（毫秒）
  const startTime = Date.now();
  const difference = to - from;
  
  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用缓动函数（ease-out）
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + difference * easeOut);
    
    element.textContent = formatter(current);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatter(to);
      if (onComplete) onComplete();
    }
  }
  
  update();
}

// API 端点常量
const API_ENDPOINT = 'https://cursor-clinical-analysis.psterman.workers.dev/';
// 移除硬编码默认值，允许从 0 开始计数

// 获取 API 端点
function getApiEndpoint() {
  // 检查环境变量（Cloudflare Pages 可以通过 wrangler.toml 或环境变量设置）
  if (typeof window !== 'undefined') {
    // 尝试从 window 对象获取（可通过 Cloudflare Workers 注入）
    const envApiUrl = window.__API_ENDPOINT__ || window.API_ENDPOINT;
    if (envApiUrl) {
      return envApiUrl;
    }
    
    // 尝试从 meta 标签获取
    const metaApi = document.querySelector('meta[name="api-endpoint"]');
    if (metaApi && metaApi.content) {
      return metaApi.content;
    }
  }
  
  // 默认 API 端点
  return API_ENDPOINT;
}

// 创建带超时的 AbortSignal（兼容性处理）
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // 如果支持 AbortSignal.timeout，优先使用
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    clearTimeout(timeoutId);
    return AbortSignal.timeout(timeoutMs);
  }
  
  return controller.signal;
}

// 统一更新全局统计数字（支持 GET 和 POST）
export async function updateGlobalStats(shouldIncrement = false) {
  const apiEndpoint = getApiEndpoint();
  
  try {
    const response = await fetch(apiEndpoint, {
      method: shouldIncrement ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors',
      body: shouldIncrement ? JSON.stringify({
        action: 'increment',
        timestamp: Date.now(),
      }) : undefined,
      signal: createTimeoutSignal(5000), // 5秒超时
    });
    
    if (response.ok) {
      const data = await response.json();
      // API 返回的字段是 value
      const newValue = data.value || data.totalUsers || data.total || data.count || null;
      
      if (newValue !== null && newValue >= 0) {
        console.log(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求成功，数字:`, newValue);
        // 更新本地存储
        localStorage.setItem('totalTestUsers', newValue.toString());
        
        // 实时更新页面显示
        const totalTestUsersEl = document.getElementById('totalTestUsers');
        if (totalTestUsersEl) {
          if (shouldIncrement) {
            // POST 请求时使用动画
            updateNumberWithAnimation(totalTestUsersEl, newValue, formatNumber);
          } else {
            // GET 请求时直接更新
            totalTestUsersEl.textContent = formatNumber(newValue);
          }
        }
        
        return newValue;
      }
    } else {
      console.warn(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求响应状态码异常:`, response.status);
    }
  } catch (error) {
    console.warn(`[Main] ${shouldIncrement ? 'POST' : 'GET'} 请求失败，使用降级方案:`, error.message);
  }
  
  // 优雅降级：使用本地存储，如果没有则为 0
  const cachedValue = parseInt(localStorage.getItem('totalTestUsers') || '0');
  const fallbackValue = cachedValue; // 允许为 0，不再使用硬编码默认值
  
  // 更新页面显示（如果存在）
  const totalTestUsersEl = document.getElementById('totalTestUsers');
  if (totalTestUsersEl) {
    totalTestUsersEl.textContent = formatNumber(fallbackValue);
  }
  
  console.log(`[Main] 使用降级值:`, fallbackValue);
  return fallbackValue;
}

// 从 API 获取测试总人数（保留向后兼容）
export async function fetchTotalTestUsers() {
  return await updateGlobalStats(false);
}

// 向 API 报告新用户并获取更新后的数字（保留向后兼容）
export async function reportNewUser() {
  return await updateGlobalStats(true);
}

// 显示实时统计
async function displayRealtimeStats() {
  if (!vibeResult || !globalStats) return;

  // 从 API 获取测试总人数（页面加载时已获取，这里直接使用）
  let totalTestUsers = await fetchTotalTestUsers();
  const previousTotal = totalTestUsers;

  // 计算技术排名（基于综合维度得分）
  // 综合得分 = (L + P + D + F) / 4 + E * 2（E维度权重更高）
  const dimensions = vibeResult.dimensions;
  const compositeScore = (
    (dimensions.L || 0) + 
    (dimensions.P || 0) + 
    (dimensions.D || 0) + 
    (dimensions.F || 0)
  ) / 4 + (dimensions.E || 0) * 2;
  const maxScore = 100 + 20; // L/P/D/F最高100，E最高10（权重*2=20）
  const scorePercentile = Math.max(1, Math.min(99, Math.round((compositeScore / maxScore) * 98)));
  // 排名越靠前，percentile越小（前1%排名最好）
  const rankPercentile = 100 - scorePercentile;
  const estimatedRank = Math.max(1, Math.round((totalTestUsers * rankPercentile) / 100));

  // 计算人格库解锁进度（243种人格，基于vibeIndex）
  // vibeIndex是5位数字，每个位置有3种可能（0,1,2），总共3^5=243种组合
  // 当前用户解锁了1种，所以进度是 1/243
  const totalPersonalities = 243;
  const unlockedPersonalities = 1; // 当前用户解锁的人格
  const unlockProgress = Math.round((unlockedPersonalities / totalPersonalities) * 100);

  // 更新DOM（带动画）
  const totalTestUsersEl = document.getElementById('totalTestUsers');
  const techRankEl = document.getElementById('techRank');
  const personalityUnlockEl = document.getElementById('personalityUnlock');

  if (totalTestUsersEl) {
    // 如果数值发生变化，显示动画
    if (previousTotal !== totalTestUsers) {
      updateNumberWithAnimation(totalTestUsersEl, totalTestUsers, formatNumber);
    } else {
      totalTestUsersEl.textContent = formatNumber(totalTestUsers);
    }
  }
  
  if (techRankEl) {
    updateNumberWithAnimation(techRankEl, estimatedRank, formatNumber);
  }
  
  if (personalityUnlockEl) {
    const newProgress = `${unlockProgress}%`;
    if (personalityUnlockEl.textContent !== newProgress) {
      updateNumberWithAnimation(personalityUnlockEl, unlockProgress, (v) => `${v}%`);
    } else {
      personalityUnlockEl.textContent = newProgress;
    }
  }

  console.log('[Main] 实时统计已更新:', {
    totalTestUsers,
    techRank: estimatedRank,
    unlockProgress: `${unlockProgress}%`
  });
}

// 显示维度得分排行榜
function displayDimensionRanking() {
  if (!vibeResult || !vibeResult.dimensions) return;

  const container = document.getElementById('dimensionRankingList');
  if (!container) return;

  const { dimensions } = vibeResult;

  const currentLang = getCurrentLang();
  
  // 将维度转换为数组并按得分排序
  const dimensionArray = Object.entries(dimensions)
    .map(([key, value]) => {
      // 使用 i18n 获取维度标签
      const dimInfo = window.i18n?.getI18nText(currentLang)?.dimensions?.[key];
      const label = dimInfo?.label || DIMENSIONS[key]?.label || key;
      return {
        key,
        label,
        value: key === 'E' ? value : value, // E维度不需要转换，其他维度已经是0-100
        displayValue: key === 'E' ? value : Math.round(value), // E维度显示原始值
      };
    })
    .sort((a, b) => {
      // E维度需要特殊处理（值域不同）
      const aScore = a.key === 'E' ? a.value * 10 : a.value;
      const bScore = b.key === 'E' ? b.value * 10 : b.value;
      return bScore - aScore;
    });

  // 渲染排行榜
  container.innerHTML = dimensionArray.map((dim, index) => {
    const rank = index + 1;
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    // E维度最大值为10左右，其他维度最大值为100
    const maxValue = dim.key === 'E' ? 10 : 100;
    const percentage = Math.min(100, Math.round((dim.value / maxValue) * 100));
    // 使用 i18n 获取单位
    const unit = dim.key === 'E' 
      ? (window.i18n?.getText('dashboard.techUnit', currentLang) || '种技术')
      : (window.i18n?.getText('dashboard.pointsUnit', currentLang) || '分');
    
    return `
      <div class="prompt-item" style="background: ${rank <= 3 ? 'rgba(0, 255, 65, 0.1)' : 'rgba(255, 255, 255, 0.03)'}; border-color: ${rank <= 3 ? 'rgba(0, 255, 65, 0.3)' : 'var(--card-border)'};">
        <span class="prompt-rank" style="font-size: 20px; min-width: 50px;">${rankIcon}</span>
        <span class="prompt-text" style="flex: 1; font-weight: 600;">${dim.label}</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 120px; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden;">
            <div style="width: ${percentage}%; height: 100%; background: var(--accent-terminal); transition: width 0.5s ease;"></div>
          </div>
          <span class="prompt-count" style="min-width: 80px; text-align: right; font-weight: 700; color: var(--accent-terminal);">${dim.displayValue} ${unit}</span>
        </div>
      </div>
    `;
  }).join('');

  console.log('[Main] 维度排行榜已渲染:', dimensionArray);
}

// 显示技术栈统计
function displayTechStack(techStack) {
  const section = document.getElementById('techStackSection');
  const list = document.getElementById('techStackList');
  
  if (!section || !list) return;
  
  const entries = Object.entries(techStack);
  if (entries.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  // 按使用次数排序，取前10
  const topTech = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (topTech.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = '';
  list.innerHTML = topTech.map(([tech, count], index) => `
    <div class="prompt-item">
      <span class="prompt-rank">#${index + 1}</span>
      <span class="prompt-text">${escapeHtml(tech)}</span>
      <span class="prompt-count">${count} 次</span>
    </div>
  `).join('');
}

// 提取中文词组（用于Top 10显示）
function extractChineseWordsForTop10(text) {
  if (!text || text.length === 0) return;
  
  const chineseStopWords = new Set([
    '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
    '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
    '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
    '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个',
    '吗', '呢', '吧', '啊', '哦', '嗯', '哈', '嘿', '好',
  ]);
  
  const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
  const chineseWords = text.match(chinesePattern) || [];
  
  chineseWords.forEach(word => {
    if (word.length > 10) return;
    const cleanWord = word.trim();
    if (chineseStopWords.has(cleanWord)) return;
    
    globalStats.topChineseWords = globalStats.topChineseWords || {};
    globalStats.topChineseWords[cleanWord] = (globalStats.topChineseWords[cleanWord] || 0) + 1;
  });
}

// 情绪类词汇库（用于中文词云）
const EMOTION_WORDS = {
  // 正面情绪
  positive: new Set([
    '开心', '高兴', '快乐', '愉快', '兴奋', '满意', '满足', '喜欢', '爱', '感谢', '谢谢',
    '太好了', '完美', '优秀', '很棒', '不错', '很好', '厉害', '赞', '棒', '赞',
    '成功', '顺利', '正确', '准确', '清晰', '明白', '理解', '懂了', '好的', '可以',
    '惊喜', '惊喜', '感动', '温暖', '舒服', '轻松', '舒服', '爽', '爽快',
    '太好了', '完美', '优秀', '很棒', '不错', '很好', '厉害', '赞', '棒',
  ]),
  // 负面情绪
  negative: new Set([
    '生气', '愤怒', '烦躁', '焦虑', '担心', '害怕', '恐惧', '紧张', '压力', '累',
    '失望', '沮丧', '难过', '伤心', '痛苦', '难受', '不舒服', '不爽', '烦', '烦人',
    '错误', '不对', '不对', '错了', '失败', '失败', '不行', '不能', '不可以', '不行',
    '困惑', '迷茫', '不懂', '不明白', '不清楚', '模糊', '混乱', '乱', '糟糕', '糟糕',
    '麻烦', '困难', '难', '复杂', '复杂', '慢', '慢', '卡', '卡顿', '崩溃', '崩溃',
    '垃圾', '差', '差劲', '烂', '烂', '破', '破', '坏', '坏', '差', '差',
  ]),
  // 中性/表达类情绪
  neutral: new Set([
    '思考', '考虑', '想', '想想', '看看', '试试', '试试', '尝试', '尝试',
    '疑问', '疑问', '问题', '问题', '为什么', '怎么', '如何', '什么', '哪个',
    '可能', '也许', '大概', '应该', '需要', '想要', '希望', '期待',
    '注意', '注意', '小心', '小心', '提醒', '提醒', '记得', '记得',
  ]),
  // 情绪强度词
  intensity: new Set([
    '非常', '很', '特别', '极其', '超级', '超', '太', '太', '最', '最',
    '一点', '稍微', '有点', '有点', '稍微', '稍微', '不太', '不太',
  ]),
};

// 检查是否为情绪类词组
function isEmotionWord(word) {
  // 检查完整匹配
  if (EMOTION_WORDS.positive.has(word) || 
      EMOTION_WORDS.negative.has(word) || 
      EMOTION_WORDS.neutral.has(word) ||
      EMOTION_WORDS.intensity.has(word)) {
    return true;
  }
  
  // 检查是否包含情绪词（2-4字词组）
  for (const emotionSet of Object.values(EMOTION_WORDS)) {
    for (const emotionWord of emotionSet) {
      if (word.includes(emotionWord) && word.length <= 4) {
        return true;
      }
    }
  }
  
  return false;
}

// 提取词云数据（中英文分离，支持词组提取，专门收集情绪类词组）
function extractWordCloudData(text) {
  if (!text || text.length === 0) return;
  
  // 确保 globalStats 已初始化
  if (!globalStats) {
    console.warn('[Main] extractWordCloudData: globalStats 未初始化');
    return;
  }
  
  // 中文停用词
  const chineseStopWords = new Set([
    '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
    '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
    '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
    '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个',
    '吗', '呢', '吧', '啊', '哦', '嗯', '哈', '嘿', '好',
  ]);
  
  // 英文停用词
  const englishStopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'into',
    'i', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
    'my', 'his', 'her', 'its', 'our', 'your', 'their',
    'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
    'please', 'help', 'write', 'one', 'some', 'any', 'all', 'both',
    'how', 'what', 'which', 'who', 'when', 'where', 'why',
    'yes', 'no', 'not', 'just', 'only', 'also', 'too', 'very', 'really',
    'okay', 'ok', 'right', 'left', 'up', 'down', 'back', 'front',
  ]);
  
  // 初始化统计对象（包括情绪类词组）
  globalStats.chineseWords = globalStats.chineseWords || {};
  globalStats.chineseEmotionWords = globalStats.chineseEmotionWords || {}; // 专门存储情绪类词组
  globalStats.englishWords = globalStats.englishWords || {};
  
  // ========== 中文词组提取（同时收集情绪类词组）==========
  // 使用滑动窗口提取相邻的中文字符组合（2-3个字）
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  
  let chineseWordCount = 0;
  let emotionWordCount = 0;
  
  for (let i = 0; i < chineseChars.length - 1; i++) {
    // 2字词组
    const twoChar = chineseChars[i] + chineseChars[i + 1];
    // 检查：词组不在停用词中，且单个字也不在停用词中
    if (!chineseStopWords.has(twoChar) && 
        !chineseStopWords.has(chineseChars[i]) && 
        !chineseStopWords.has(chineseChars[i + 1])) {
      globalStats.chineseWords[twoChar] = (globalStats.chineseWords[twoChar] || 0) + 1;
      chineseWordCount++;
      
      // 如果是情绪类词组，额外统计到情绪词库中（权重更高）
      if (isEmotionWord(twoChar)) {
        globalStats.chineseEmotionWords[twoChar] = (globalStats.chineseEmotionWords[twoChar] || 0) + 2;
        emotionWordCount++;
      }
    }
    
    // 3字词组
    if (i < chineseChars.length - 2) {
      const threeChar = chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2];
      // 检查：词组不在停用词中，且所有单个字也不在停用词中
      if (!chineseStopWords.has(threeChar) && 
          !chineseStopWords.has(chineseChars[i]) && 
          !chineseStopWords.has(chineseChars[i + 1]) && 
          !chineseStopWords.has(chineseChars[i + 2])) {
        globalStats.chineseWords[threeChar] = (globalStats.chineseWords[threeChar] || 0) + 1;
        chineseWordCount++;
        
        // 情绪类词组
        if (isEmotionWord(threeChar)) {
          globalStats.chineseEmotionWords[threeChar] = (globalStats.chineseEmotionWords[threeChar] || 0) + 2;
          emotionWordCount++;
        }
      }
    }
  }
  
  // 也提取4字词组（常见成语、短语）
  for (let i = 0; i < chineseChars.length - 3; i++) {
    const fourChar = chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2] + chineseChars[i + 3];
    if (!chineseStopWords.has(fourChar)) {
      globalStats.chineseWords[fourChar] = (globalStats.chineseWords[fourChar] || 0) + 1;
      chineseWordCount++;
      
      // 情绪类词组
      if (isEmotionWord(fourChar)) {
        globalStats.chineseEmotionWords[fourChar] = (globalStats.chineseEmotionWords[fourChar] || 0) + 2;
        emotionWordCount++;
      }
    }
  }
  
  // ========== 英文词组提取 ==========
  // 提取所有英文单词（保留原始大小写用于词组匹配）
  const englishPattern = /\b[a-zA-Z]{2,20}\b/g;
  const englishMatches = text.match(englishPattern) || [];
  
  let englishWordCount = 0;
  
  // 提取单个词（转换为小写）
  englishMatches.forEach(word => {
    const lowerWord = word.toLowerCase();
    if (!englishStopWords.has(lowerWord) && word.length >= 2 && word.length <= 20) {
      globalStats.englishWords[lowerWord] = (globalStats.englishWords[lowerWord] || 0) + 1;
      englishWordCount++;
    }
  });
  
  // 提取英文词组（2-3个词）
  // 只提取有效的、非停用词的单词
  const validEnglishWords = englishMatches
    .map(w => w.toLowerCase())
    .filter(w => !englishStopWords.has(w) && w.length >= 2 && w.length <= 20);
  
  // 2词词组（只统计相邻的有效词）
  for (let i = 0; i < validEnglishWords.length - 1; i++) {
    const word1 = validEnglishWords[i];
    const word2 = validEnglishWords[i + 1];
    // 确保两个词都是有效的（不在停用词中）
    if (!englishStopWords.has(word1) && !englishStopWords.has(word2)) {
      const twoWord = word1 + ' ' + word2;
      globalStats.englishWords[twoWord] = (globalStats.englishWords[twoWord] || 0) + 1;
      englishWordCount++;
    }
  }
  
  // 3词词组（只统计相邻的有效词）
  for (let i = 0; i < validEnglishWords.length - 2; i++) {
    const word1 = validEnglishWords[i];
    const word2 = validEnglishWords[i + 1];
    const word3 = validEnglishWords[i + 2];
    // 确保三个词都是有效的（不在停用词中）
    if (!englishStopWords.has(word1) && !englishStopWords.has(word2) && !englishStopWords.has(word3)) {
      const threeWord = word1 + ' ' + word2 + ' ' + word3;
      globalStats.englishWords[threeWord] = (globalStats.englishWords[threeWord] || 0) + 1;
      englishWordCount++;
    }
  }
  
  // 调试信息（每100条消息输出一次）
  const messageCount = globalStats.userMessages || 0;
  if (messageCount > 0 && messageCount % 100 === 0) {
    console.log(`[Main] extractWordCloudData: 已处理 ${messageCount} 条消息，中文词组: ${Object.keys(globalStats.chineseWords).length}，情绪类词组: ${Object.keys(globalStats.chineseEmotionWords).length}，英文词组: ${Object.keys(globalStats.englishWords).length}`);
  }
}

// 渲染词云
function renderWordClouds() {
  if (typeof WordCloud === 'undefined') {
    console.warn('[Main] WordCloud库未加载');
    return;
  }

  console.log('[Main] 开始渲染词云...');
  
  // 检查数据
  const emotionWordsCount = Object.keys(globalStats.chineseEmotionWords || {}).length;
  const chineseWordsCount = Object.keys(globalStats.chineseWords || {}).length;
  const englishWordsCount = Object.keys(globalStats.englishWords || {}).length;
  
  console.log('[Main] 情绪类词组数据:', emotionWordsCount);
  console.log('[Main] 中文词组数据:', chineseWordsCount);
  console.log('[Main] 英文词组数据:', englishWordsCount);

  // 渲染AI情绪词云（只显示情绪类词组）
  const chineseCanvas = document.getElementById('chineseWordCloud');
  if (!chineseCanvas) {
    console.warn('[Main] AI情绪词云canvas未找到');
  } else if (!globalStats.chineseEmotionWords || emotionWordsCount === 0) {
    console.warn('[Main] AI情绪词云数据为空');
    // 显示提示信息
    const container = chineseCanvas.parentElement;
    if (container) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无AI情绪数据</div>';
    }
  } else {
    // 获取排名最靠前的情绪类词组（按频率排序）
    const minWords = 50;
    const maxWords = 120;
    const allEntries = Object.entries(globalStats.chineseEmotionWords)
      .filter(([word, count]) => count > 0 && word.length >= 2) // 过滤掉计数为0的和单字
      .sort((a, b) => b[1] - a[1]); // 按频率降序排序
    
    // 如果数据不足，至少显示所有可用的词
    const wordCount = Math.max(minWords, Math.min(maxWords, allEntries.length));
    const emotionData = allEntries
      .slice(0, wordCount)
      .map(([word, count]) => [word, count]);
    
    console.log('[Main] AI情绪词云数据（已排序）:', emotionData.length);
    if (emotionData.length > 0) {
      console.log('[Main] AI情绪词云Top 10:', emotionData.slice(0, 10).map(([w, c]) => `${w}(${c})`).join(', '));
    }
    
    if (emotionData.length > 0) {
      try {
        // 获取容器尺寸
        const container = chineseCanvas.parentElement;
        const width = container ? container.offsetWidth : 400;
        const height = container ? container.offsetHeight : 400;
        
        // 设置canvas尺寸
        chineseCanvas.width = width;
        chineseCanvas.height = height;
        
        // 清空canvas
        const ctx = chineseCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
        }
        
        // 计算字体大小范围（根据数据量动态调整）
        const maxCount = Math.max(...emotionData.map(([w, c]) => c));
        
        // 自定义颜色函数（情绪类词组使用暖色调）
        const emotionColors = ['#e74c3c', '#f39c12', '#e67e22', '#c0392b', '#d35400', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#16a085'];
        const colorFn = function(word, weight, fontSize, distance, theta) {
          const index = Math.floor(Math.random() * emotionColors.length);
          return emotionColors[index];
        };
        
        WordCloud(chineseCanvas, {
          list: emotionData,
          gridSize: Math.round(Math.max(8, Math.min(12, width / 40))), // 减小网格，让词更密集，但仍保持云朵形状
          weightFactor: function(size) {
            // 根据频率计算字体大小，使用平方根缩放使大小差异更明显
            const normalizedSize = Math.sqrt(size) / Math.sqrt(maxCount);
            // 字体大小范围：10px - 45px
            const minFontSize = 10;
            const maxFontSize = Math.min(45, width / 10);
            return minFontSize + normalizedSize * (maxFontSize - minFontSize);
          },
          fontFamily: '"Microsoft YaHei", "微软雅黑", "SimHei", "黑体", sans-serif',
          color: colorFn,
          rotateRatio: 0.6, // 增加旋转比例，使词云更生动
          backgroundColor: 'transparent',
          minSize: 10, // 最小字体大小
          drawOutOfBound: false, // 不绘制超出边界的词
          shrinkToFit: false, // 不自动缩放，保持原始大小
          ellipticity: 0.8, // 椭圆度，0.8稍微扁平，形成更自然的云朵形状
        });
        console.log('[Main] ✅ AI情绪词云渲染完成');
      } catch (error) {
        console.error('[Main] AI情绪词云渲染失败:', error);
        console.error('[Main] 错误详情:', error.stack);
      }
    } else {
      console.warn('[Main] AI情绪词云数据为空（过滤后）');
    }
  }

  // 渲染英文词云（合并原来的中文词云和英文词云）
  const englishCanvas = document.getElementById('englishWordCloud');
  if (!englishCanvas) {
    console.warn('[Main] 英文词云canvas未找到');
  } else {
    // 合并中文词组和英文词组
    const mergedWords = {};
    
    // 添加中文词组（原中文词云内容，排除情绪类词组）
    if (globalStats.chineseWords) {
      Object.entries(globalStats.chineseWords).forEach(([word, count]) => {
        // 排除情绪类词组（已在AI情绪词云中显示）
        if (!globalStats.chineseEmotionWords || !globalStats.chineseEmotionWords[word]) {
          mergedWords[word] = (mergedWords[word] || 0) + count;
        }
      });
    }
    
    // 添加英文词组
    if (globalStats.englishWords) {
      Object.entries(globalStats.englishWords).forEach(([word, count]) => {
        mergedWords[word] = (mergedWords[word] || 0) + count;
      });
    }
    
    const mergedWordsCount = Object.keys(mergedWords).length;
    
    if (mergedWordsCount === 0) {
      console.warn('[Main] 合并词云数据为空');
      // 显示提示信息
      const container = englishCanvas.parentElement;
      if (container) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无词云数据</div>';
      }
    } else {
      // 获取排名最靠前的词组（按频率排序）
      // 增加词数量，形成云朵形状（100-200个词）
      const minWords = 100;
      const maxWords = 200;
      const allEntries = Object.entries(mergedWords)
        .filter(([word, count]) => count > 0 && word.length >= 2) // 过滤掉计数为0的和单字符
        .sort((a, b) => b[1] - a[1]); // 按频率降序排序
      
      // 如果数据不足，至少显示所有可用的词
      const wordCount = Math.max(minWords, Math.min(maxWords, allEntries.length));
      const mergedData = allEntries
        .slice(0, wordCount)
        .map(([word, count]) => [word, count]);
    
      console.log('[Main] 合并词云数据（已排序）:', mergedData.length);
      if (mergedData.length > 0) {
        console.log('[Main] 合并词云Top 10:', mergedData.slice(0, 10).map(([w, c]) => `${w}(${c})`).join(', '));
      }
      
      if (mergedData.length > 0) {
        try {
          // 获取容器尺寸
          const container = englishCanvas.parentElement;
          const width = container ? container.offsetWidth : 400;
          const height = container ? container.offsetHeight : 400;
          
          // 设置canvas尺寸
          englishCanvas.width = width;
          englishCanvas.height = height;
          
          // 清空canvas
          const ctx = englishCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);
          }
          
          // 计算字体大小范围（根据数据量动态调整）
          const maxCount = Math.max(...mergedData.map(([w, c]) => c));
          
          // 自定义颜色函数（多种颜色）
          const colors = ['#2c3e50', '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085'];
          const colorFn = function(word, weight, fontSize, distance, theta) {
            const index = Math.floor(Math.random() * colors.length);
            return colors[index];
          };
          
          WordCloud(englishCanvas, {
            list: mergedData,
            gridSize: Math.round(Math.max(6, Math.min(10, width / 50))), // 减小网格，让词更密集
            weightFactor: function(size) {
              // 根据频率计算字体大小，使用平方根缩放使大小差异更明显
              const normalizedSize = Math.sqrt(size) / Math.sqrt(maxCount);
              // 字体大小范围：8px - 35px，减小字号
              const minFontSize = 8;
              const maxFontSize = Math.min(35, width / 12);
              return minFontSize + normalizedSize * (maxFontSize - minFontSize);
            },
            fontFamily: 'Arial, "Microsoft YaHei", "微软雅黑", sans-serif', // 支持中英文混排
            color: colorFn,
            rotateRatio: 0.6, // 增加旋转比例，使词云更生动
            backgroundColor: 'transparent',
            minSize: 8, // 最小字体大小
            drawOutOfBound: false, // 不绘制超出边界的词
            shrinkToFit: false, // 不自动缩放，保持原始大小
            ellipticity: 0.8, // 椭圆度，0.8稍微扁平，形成更自然的云朵形状
          });
          console.log('[Main] ✅ 合并词云渲染完成');
        } catch (error) {
          console.error('[Main] 合并词云渲染失败:', error);
          console.error('[Main] 错误详情:', error.stack);
        }
      } else {
        console.warn('[Main] 合并词云数据为空（过滤后）');
      }
    }
  }
}

// 启动应用（仅在非模块导入时自动初始化）
// 如果作为模块导入，不自动初始化，由调用方控制
if (typeof window !== 'undefined' && !window.__ANALYSIS_MODULE_LOADED__) {
  window.__ANALYSIS_MODULE_LOADED__ = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Main] DOMContentLoaded 事件触发');
      init();
    });
  } else {
    console.log('[Main] DOM 已加载，直接初始化');
    init();
  }
}
