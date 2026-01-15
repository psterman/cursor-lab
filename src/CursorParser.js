/**
 * CursorParser.js - 
 *  sql.js (WebAssembly)  Cursor  SQLite 
 */

import initSqlJs from 'sql.js';

/**
 * 
 * code > implementation > text > richText > content
 */
const EXTRACTION_PRIORITY = {
  'modelResponse.code': 12,
  'modelResponse.codeBlock': 11,
  'modelResponse.implementation': 10,
  'modelResponse.suggestions': 9,
  'modelResponse.changes': 8,
  'modelResponse.diff': 7,
  'modelResponse.fixes': 6,
  'modelResponse.modifications': 5,
  'modelResponse.codeAnalysis': 4,
  'modelResponse.text': 3,
  'modelResponse.richText': 2,
  'modelResponse.content': 1,
  'bubble.code': 13,
  'bubble.codeBlock': 12,
  'bubble.implementation': 11,
  'bubble.text': 10,
  'bubble.richText': 9,
  'bubble.content': 8,
  'bubble.message.text': 7,
};

/**
 * CursorParser 
 *  Cursor  SQLite 
 */
export class CursorParser {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.chatData = [];
    this.stats = {
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
      englishWords: {},
      userBehaviorStats: {
        totalUserChars: 0,
        avgUserMessageLength: 0,
        questionMessageCount: 0,
        techStack: {},
      },
    };
  }

  /**
   *  sql.js
   */
  async init() {
    // 使用相对路径，Vite 会自动处理路径解析
    // 在开发环境：./sql-wasm.wasm
    // 在生产环境：Vite 会根据 base 配置自动处理
    const wasmPath = './sql-wasm.wasm';
    
    const SQL = await initSqlJs({
      locateFile: (file) => {
        // 如果是 wasm 文件，使用相对路径
        if (file.endsWith('.wasm')) {
          return wasmPath;
        }
        // 其他文件使用默认路径
        return file;
      }
    });
    this.SQL = SQL;
    console.log('[CursorParser] sql.js 初始化完成，WASM 路径:', wasmPath);
  }

  /**
   *  ArrayBuffer 
   */
  async loadDatabase(arrayBuffer) {
    if (!this.SQL) {
      await this.init();
    }

    try {
      this.db = new this.SQL.Database(new Uint8Array(arrayBuffer));
      console.log('[CursorParser] ');
      return true;
    } catch (error) {
      console.error('[CursorParser] :', error);
      throw error;
    }
  }

  /**
    * 
    */
   async scanDatabase() {
     if (!this.db) {
       throw new Error('');
     }

     this.chatData = [];
     this.resetStats();

     try {
       console.log('[CursorParser] ...');
       console.log('[CursorParser] :', this.db.exec("SELECT name FROM sqlite_master WHERE type='table'").length);

       //  chatdata
       const chatdataQuery = `
         SELECT value FROM itemTable
         WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
       `;
       console.log('[CursorParser]  chatdata ...');
       this.extractFromQuery(chatdataQuery, 'json');

       //  composerState
       const composerQuery = `
         SELECT value FROM itemTable
         WHERE [key] = 'composer.composerState'
       `;
       console.log('[CursorParser]  composerState ...');
       this.extractFromQuery(composerQuery, 'json');

       //  text 
       const textQuery = `
         SELECT value FROM itemTable
         WHERE value LIKE '%"text":%'
       `;
       console.log('[CursorParser]  text ...');
       this.extractFromQuery(textQuery, 'regex');

       console.log('[CursorParser] ', this.chatData.length, '');

       // 
       console.log('[CursorParser] ===========  =========');
      console.log('[CursorParser] 总对话次数:', this.stats.totalConversations);
      console.log('[CursorParser] 用户消息:', this.stats.userMessages);
      console.log('[CursorParser] AI消息:', this.stats.aiMessages);
      console.log('[CursorParser] 模型使用:', this.stats.modelUsage);
       console.log('[CursorParser] :', this.stats.hourlyActivity.filter(v => v > 0));
       console.log('[CursorParser] :', Object.keys(this.stats.topPrompts).length);
       console.log('[CursorParser] ======================================');

       return this.chatData;
     } catch (error) {
       console.error('[CursorParser] :', error);
       throw error;
     }
   }

   /**
    * 
    */
   appendData(newData) {
    const startIndex = this.chatData.length;

    newData.forEach((item, index) => {
      this.chatData.push({
        id: startIndex + index + 1,
        text: item.text,
        role: item.role,
        source: item.source,
        length: item.text.length,
        timestamp: item.timestamp || new Date().toISOString(),
        model: item.model || 'unknown',
      });
    });

    console.log(`[CursorParser]  ${newData.length} : ${this.chatData.length}`);
  }

  /**
   *  SQL 
   */
  extractFromQuery(query, method) {
    const results = this.db.exec(query);

    if (results.length === 0) {
      return;
    }

    const rows = results[0].values;
    console.log(`[CursorParser] ${method}  ${rows.length} `);

    const extractedTextSet = new Set();

    rows.forEach(([value], index) => {
      try {
        let texts = [];
        let sourcePath = '';

        if (method === 'json') {
          texts = this.extractFromJSON(value);
          sourcePath = method;
        } else if (method === 'regex') {
          texts = this.extractFromRegex(value);
          sourcePath = 'regex';
        }

        texts.forEach((item) => {
          if (!item || item.text.length < 5) return;

          // 
          const textKey = item.text;
          if (extractedTextSet.has(textKey)) {
            return;
          }
          extractedTextSet.add(textKey);

          this.chatData.push({
            id: this.chatData.length + 1,
            text: item.text,
            role: item.role,
            source: sourcePath,
            length: item.text.length,
            timestamp: item.timestamp || new Date().toISOString(),
            model: item.model || 'unknown',
          });

          // 
          this.updateStats(item);
        });
      } catch (error) {
        console.warn(`[CursorParser]  ${index + 1} :`, error.message);
      }
    });
  }

  /**
   *  JSON 
   */
  extractFromJSON(jsonString) {
    const results = [];

    try {
      const data = JSON.parse(jsonString);

      //  chatdata 
      if (data.tabs && Array.isArray(data.tabs)) {
        data.tabs.forEach((tab) => {
          if (tab.bubbles && Array.isArray(tab.bubbles)) {
            tab.bubbles.forEach((bubble) => {
              const item = this.extractBubbleText(bubble);
              if (item && item.text) {
                results.push(item);
              }
            });
          }
        });
      }

      //  composerState 
      if (data.bubbles && Array.isArray(data.bubbles)) {
        data.bubbles.forEach((bubble) => {
          const item = this.extractBubbleText(bubble);
          if (item && item.text) {
            results.push(item);
          }
        });
      }
    } catch (error) {
      // JSON 
    }

    return results;
  }

  /**
   *  bubble 
   */
  extractBubbleText(bubble, depth = 0, maxDepth = 6) {
    if (!bubble || depth > maxDepth) {
      return null;
    }

    const results = [];
    const extractStats = {};

    // 
    const text = this.extractByPriority(bubble, EXTRACTION_PRIORITY, extractStats);

    if (text) {
      const role = this.determineRole(bubble);
      const model = this.extractModel(bubble);

      results.push({
        text: text,
        role: role,
        model: model,
        timestamp: this.extractTimestamp(bubble),
      });
    } else {
      // 
      for (const key in bubble) {
        if (bubble[key] && typeof bubble[key] === 'object') {
          const nested = this.extractBubbleText(bubble[key], depth + 1, maxDepth);
          if (nested) {
            results.push(nested);
          }
        }
      }
    }

    return results[0] || null;
  }

  /**
   * 
   */
  extractByPriority(obj, priorityConfig, stats) {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    let bestText = null;
    let bestPriority = 0;
    let bestSource = '';

    // 
    for (const [path, priority] of Object.entries(priorityConfig)) {
      const text = this.getNestedValue(obj, path);
      if (text && typeof text === 'string' && text.length > 5) {
        if (priority > bestPriority) {
          bestText = text;
          bestPriority = priority;
          bestSource = path;

          // 
          stats[path] = (stats[path] || 0) + 1;
        }
      }
    }

    if (bestText) {
      console.log(`[CursorParser]  ${bestSource} : ${bestPriority}`);
    }

    return bestText;
  }

  /**
   * 
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }

    return current;
  }

   /**
    *  AI
    */
   determineRole(bubble) {
    console.log('[CursorParser] ...');

    // 1:  type 
    if (bubble.type === 'user') {
      console.log('[CursorParser]  type  USER');
      return 'USER';
    }
    if (bubble.type === 'ai') {
      console.log('[CursorParser]  type  AI');
      return 'AI';
    }

    // 2:  commandType
    if (bubble.commandType === 4) {
      console.log('[CursorParser]  commandType  USER');
      return 'USER';
    }

    // 3: 
    if (bubble.userMessage || bubble.userPrompt || bubble.question) {
      console.log('[CursorParser]  USER');
      return 'USER';
    }
    if (bubble.modelResponse || bubble.suggestions || bubble.aiMessage) {
      console.log('[CursorParser]  AI');
      return 'AI';
    }

    // 4:  bubble 
    if (bubble.role === 'user' || bubble.role === 'USER') {
      console.log('[CursorParser]  role  USER');
      return 'USER';
    }
    if (bubble.role === 'assistant' || bubble.role === 'assistant' || bubble.role === 'AI') {
      console.log('[CursorParser]  role  AI');
      return 'AI';
    }

    // 5:  sender 
    if (bubble.sender === 'user' || bubble.sender === 'USER') {
      console.log('[CursorParser]  sender  USER');
      return 'USER';
    }

    // 6: 
    if (bubble.message || bubble.text) {
      const content = (bubble.message || bubble.text).toLowerCase();
      // 
      if (content.startsWith('') || content.startsWith('') || content.startsWith('') || content.startsWith('') || content.startsWith('')) {
        console.log('[CursorParser]  USER');
        return 'USER';
      }
      // AI 
      if (content.startsWith('') || content.startsWith('') || content.startsWith('') || content.startsWith('') || content.startsWith('')) {
        console.log('[CursorParser]  AI');
        return 'AI';
      }
    }

    //  AI
    console.log('[CursorParser]  AI');
    return 'AI';
  }

  /**
   * 
   */
  extractModel(bubble) {
    // 
    const modelFields = [
      'model',
      'modelResponse.model',
      'aiModel',
      'response.model',
      'completion.model',
    ];

    for (const field of modelFields) {
      const value = this.getNestedValue(bubble, field);
      if (value && typeof value === 'string') {
        //  "gpt-4-turbo-preview"  "gpt-4"
        const shortName = value.split('-')[0];
        return shortName;
      }
    }

    return 'unknown';
  }

   /**
    * 
    */
   extractTimestamp(bubble) {
    const timestampFields = [
      'timestamp',
      'createdAt',
      'created',
      'time',
      'updatedAt',
      'updatedAt',
      'messageTime',
      'sentAt',
      'bubbleTime',
      'userTime',
      'aiTime',
    ];

    console.log('[CursorParser] ...');
    
    for (const field of timestampFields) {
      const value = this.getNestedValue(bubble, field);
      if (value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            console.log(`[CursorParser]  ${field} : ${date.toISOString()}`);
            return date.toISOString();
          }
        } catch (e) {
          console.warn(`[CursorParser]  ${field} :`, e);
        }
      }
    }

    console.warn('[CursorParser] ');
    return new Date().toISOString();
  }

   /**
    * 
    */
   extractFromRegex(jsonString) {
     console.log('[CursorParser] ...');
     const results = [];
     const patterns = [
       /"text":\s*"([^"]+)"/g,
       /"code":\s*"([^"]+)"/g,
       /"implementation":\s*"([^"]+)"/g,
       /"content":\s*"([^"]+)"/g,
     ];

     let textCount = 0;
     
     patterns.forEach((pattern) => {
       let match;
       while ((match = pattern.exec(jsonString)) !== null) {
         textCount++;
         const text = match[1];
         if (text && text.length >= 5) {
           // 
           const role = this.inferRoleFromContext(jsonString, match.index, text);
           const model = this.inferModelFromContext(jsonString, match.index);
           const timestamp = this.inferTimestampFromContext(jsonString, match.index);

           results.push({
             text: text,
             role: role,
             model: model,
             timestamp: timestamp,
           });
         }
       }
     });

     console.log(`[CursorParser]  ${textCount}  ${results.length} `);
     console.log(`[CursorParser] :`, {
       USER: results.filter(r => r.role === 'USER').length,
       AI: results.filter(r => r.role === 'AI').length,
       unknown: results.filter(r => r.role === 'unknown').length,
     });

     return results;
   }

   /**
    * 
    */
   inferRoleFromContext(jsonString, index, text) {
     // 
     const start = Math.max(0, index - 500);
     const end = Math.min(jsonString.length, index + 500);
     const context = jsonString.substring(start, end);

     // 
     const userPatterns = [
       /"type"\s*:\s*"user"/i,
       /"role"\s*:\s*"user"/i,
       /"commandType"\s*:\s*4/,
       /"userMessage"/i,
       /"userPrompt"/i,
       /"question"/i,
     ];

     //  AI 
     const aiPatterns = [
       /"type"\s*:\s*"ai"/i,
       /"role"\s*:\s*"assistant"/i,
       /"role"\s*:\s*"ai"/i,
       /"modelResponse"/i,
       /"suggestions"/i,
       /"aiMessage"/i,
     ];

     let userScore = 0;
     let aiScore = 0;

     userPatterns.forEach(pattern => {
       if (pattern.test(context)) userScore++;
     });

     aiPatterns.forEach(pattern => {
       if (pattern.test(context)) aiScore++;
     });

      //
      if (userScore > aiScore) {
        return 'USER';
      } else if (aiScore > userScore) {
        return 'AI';
      }

      return 'unknown';
    }

    /**
     *
     */
    inferModelFromContext(jsonString, index) {
      const start = Math.max(0, index - 200);
      const end = Math.min(jsonString.length, index + 200);
      const context = jsonString.substring(start, end);

      const modelPatterns = [
        /"model"\s*:\s*"([^"]+)"/i,
        /"aiModel"\s*:\s*"([^"]+)"/i,
        /"response\.model"\s*:\s*"([^"]+)"/i,
        /"completion\.model"\s*:\s*"([^"]+)"/i,
      ];

      for (const pattern of modelPatterns) {
        const match = pattern.exec(context);
        if (match && match[1]) {
          const modelName = match[1].split('-')[0]; //
          console.log(`[CursorParser] : ${modelName}`);
          return modelName;
        }
      }

      return 'unknown';
    }

    /**
     *
     */
    inferTimestampFromContext(jsonString, index) {
      const start = Math.max(0, index - 200);
      const end = Math.min(jsonString.length, index + 200);
      const context = jsonString.substring(start, end);

      const timestampPatterns = [
        /"timestamp"\s*:\s*"([^"]+)"/i,
        /"createdAt"\s*:\s*"([^"]+)"/i,
        /"created"\s*:\s*"([^"]+)"/i,
        /"time"\s*:\s*"([^"]+)"/i,
        /"updatedAt"\s*:\s*"([^"]+)"/i,
      ];

      for (const pattern of timestampPatterns) {
        const match = pattern.exec(context);
        if (match && match[1]) {
          try {
            const date = new Date(match[1]);
            if (!isNaN(date.getTime())) {
              console.log(`[CursorParser] : ${date.toISOString()}`);
              return date.toISOString();
            }
          } catch (e) {
            console.warn(`[CursorParser] :`, e);
          }
        }
      }

      //
      console.warn('[CursorParser] ');
      return new Date().toISOString();
    }

    /**
     *
     */
     updateStats(item) {
       console.log('[CursorParser] :', {
         role: item.role,
         textLength: item.text?.length,
         hasTimestamp: !!item.timestamp,
         model: item.model,
         first50Chars: item.text?.substring(0, 50),
       });

        // ========================================
        // New plan: Count qing and bu characters from all messages
        // ========================================
        if (item.text && item.text.length > 0) {
          const text = item.text;
          const messageIndex = (this.stats.totalConversations || 0) + 1;

          // 统计"请"字
          const qingMatches = text.match(/请/g);
          if (qingMatches && qingMatches.length > 0) {
            this.stats.qingCount = (this.stats.qingCount || 0) + qingMatches.length;
            console.log(`[CursorParser] [${item.role}] "请"字 +${qingMatches.length} : ${this.stats.qingCount} | 文本: "${text.substring(0, 50)}..."`);
          }

          // 统计"不"字
          const buMatches = text.match(/不/g);
          if (buMatches && buMatches.length > 0) {
            this.stats.buCount = (this.stats.buCount || 0) + buMatches.length;
            console.log(`[CursorParser] [${item.role}] "不"字 +${buMatches.length} : ${this.stats.buCount} | 文本: "${text.substring(0, 50)}..."`);
          }
        }

        //  - totalConversations
        this.stats.totalConversations++;

        if (item.role === 'USER') {
          this.stats.userMessages++;
          console.log('[CursorParser] 用户消息:', this.stats.userMessages);
        } else {
          this.stats.aiMessages++;
          console.log('[CursorParser] AI消息:', this.stats.aiMessages);
        }
        console.log('[CursorParser] 总对话次数:', this.stats.totalConversations);
        
        // 用户行为统计 - 只统计用户消息
        if (item.text && item.text.length > 0 && item.role === 'USER') {
          const text = item.text;
          const textLower = text.toLowerCase();
          
          // 1. 累计用户消息总字符数
          this.stats.userBehaviorStats.totalUserChars += text.length;
          
          // 2. 包含问号的消息（放宽匹配，不区分大小写）
          if (text.includes('?') || text.includes('？') || text.includes('如何') || text.includes('怎么') || text.includes('为什么') || text.includes('what') || text.includes('how') || text.includes('why')) {
            this.stats.userBehaviorStats.questionMessageCount++;
          }
          
          // 3. 技术栈统计（改进的精准匹配）
          this.extractTechStack(text);
          
          // 4. 词云数据统计（中英文分离）
          this.extractWordCloudData(text);
        }
        
        // 计算平均消息长度（在最后统一计算）
        if (this.stats.userMessages > 0) {
          this.stats.userBehaviorStats.avgUserMessageLength = Math.round(
            this.stats.userBehaviorStats.totalUserChars / this.stats.userMessages
          );
        }

        //
         const model = item.model || 'unknown';
         this.stats.modelUsage[model] = (this.stats.modelUsage[model] || 0) + 1;
         console.log(`[CursorParser] : ${model} = ${this.stats.modelUsage[model]}`);

         //
         if (item.timestamp) {
           try {
             const hour = new Date(item.timestamp).getHours();
             this.stats.hourlyActivity[hour]++;
             console.log(`[CursorParser] : ${hour}:00 = ${this.stats.hourlyActivity[hour]}`);
           } catch (e) {
             console.error('[CursorParser] :', e);
           }
         } else {
           console.warn('[CursorParser] ');
         }

         //
         if (item.timestamp) {
           try {
             const date = new Date(item.timestamp).toISOString().split('T')[0];
             this.stats.dailyActivity[date] = (this.stats.dailyActivity[date] || 0) + 1;
           } catch (e) {
             console.error('[CursorParser] :', e);
           }
         }

         //  -
         if (item.role === 'USER' && item.text) {
           this.extractWords(item.text);
         } else if (item.role !== 'USER') {
           console.log('[CursorParser] ');
         }

         //
         if (item.role === 'USER' && item.text) {
           this.extractChineseWords(item.text);
         }
    }

    /**
     *
     */
    extractWords(text) {
      console.log(`[CursorParser] : ${text.length}`);

      //
      const stopWords = new Set([
        //
        '', '', '', '', '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '', '',
        //
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
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

      //
      //
      const wordPattern = /[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g;
      const words = text.match(wordPattern) || [];

      console.log(`[CursorParser]  ${words.length} /`);

      //
      words.forEach(word => {
        if (word.length < 2) return; //
        if (word.length > 20) return; //

        const lowerWord = word.toLowerCase();
        if (stopWords.has(lowerWord)) return; //

        this.stats.topPrompts[lowerWord] = (this.stats.topPrompts[lowerWord] || 0) + 1;
      });

      const uniqueWords = Object.keys(this.stats.topPrompts).length;
      console.log(`[CursorParser] ${uniqueWords} ${words.length} `);
    }

    /**
     * 2
     */
    extractChineseWords(text) {
     const currentMessageCount = (this.stats.userMessages || 0) + (this.stats.aiMessages || 0);

     // 10
     if (currentMessageCount < 10) {
       console.log(`[CursorParser]  ${currentMessageCount + 1}: ${text.length}`);
       console.log(`[CursorParser]  : "${text.substring(0, 80)}..."`);
     }

     // 
     const chineseStopWords = new Set([
       '', '', '', '', '', '', '', '', '', '', '', '',
       '', '', '', '', '', '', '', '', '', '', '',
       '', '', '', '', '', '', '', '', '', '', '',
       '', '', '', '', '', '', '',
       '', '', '', '', '', '', '', '', ''
     ]);

     // 2
     const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
     const chineseWords = text.match(chinesePattern) || [];

     if (currentMessageCount < 10) {
       console.log(`[CursorParser]  ${chineseWords.length} `);

       if (chineseWords.length > 0) {
         console.log(`[CursorParser] :`, chineseWords.slice(0, 5));
       }
     }

     // 
     let addedCount = 0;
     chineseWords.forEach(word => {
       if (word.length > 10) return; // 

       const cleanWord = word.trim();
       if (chineseStopWords.has(cleanWord)) return; // 

       this.stats.topChineseWords = this.stats.topChineseWords || {};
       this.stats.topChineseWords[cleanWord] = (this.stats.topChineseWords[cleanWord] || 0) + 1;
       addedCount++;
     });

     if (currentMessageCount < 10 || addedCount > 0) {
       const uniqueChineseWords = Object.keys(this.stats.topChineseWords || {}).length;
     }
   }

  /**
   * 提取技术栈统计 - 参考GitHub的精准匹配方案
   * 使用正则表达式进行边界匹配，避免误匹配
   */
  extractTechStack(text) {
    if (!text || text.length === 0) return;
    
    if (!this.stats.userBehaviorStats.techStack) {
      this.stats.userBehaviorStats.techStack = {};
    }
    
    const techStack = this.stats.userBehaviorStats.techStack;
    
    // 技术栈匹配规则 - 使用精准的正则表达式，参考GitHub的识别方式
    const techPatterns = [
      // 编程语言 - 使用单词边界匹配
      { name: 'JavaScript', pattern: /\b(javascript|js|typescript|ts|node\.?js?|es6|es2015|ecmascript)\b/gi },
      { name: 'Python', pattern: /\b(python|py|django|flask|fastapi|pandas|numpy|scipy)\b/gi },
      { name: 'Java', pattern: /\b(java|spring|springboot|maven|gradle|jvm)\b/gi },
      { name: 'Go', pattern: /\b(go|golang|gin|echo|goroutine)\b/gi },
      { name: 'Rust', pattern: /\b(rust|cargo|rustc)\b/gi },
      { name: 'C/C++', pattern: /\b(c\+\+|cpp|c语言|clang|gcc)\b/gi },
      { name: 'PHP', pattern: /\b(php|laravel|symfony|composer)\b/gi },
      { name: 'Ruby', pattern: /\b(ruby|rails|ruby on rails|gem)\b/gi },
      { name: 'Swift', pattern: /\b(swift|swiftui|ios)\b/gi },
      { name: 'Kotlin', pattern: /\b(kotlin|android|kotlinx)\b/gi },
      { name: 'C#', pattern: /\b(c#|csharp|\.net|asp\.net|dotnet)\b/gi },
      { name: 'TypeScript', pattern: /\b(typescript|ts|tsx)\b/gi },
      
      // 前端框架 - 精准匹配
      { name: 'React', pattern: /\b(react|reactjs|jsx|redux|mobx|next\.js|nextjs|gatsby|remix)\b/gi },
      { name: 'Vue', pattern: /\b(vue|vuejs|vue\.js|nuxt|nuxtjs|vuex|pinia)\b/gi },
      { name: 'Angular', pattern: /\b(angular|angularjs|ng-|@angular)\b/gi },
      { name: 'Svelte', pattern: /\b(svelte|sveltekit)\b/gi },
      
      // 后端框架
      { name: 'Express', pattern: /\b(express|expressjs|express\.js)\b/gi },
      { name: 'Koa', pattern: /\b(koa|koajs)\b/gi },
      { name: 'NestJS', pattern: /\b(nest|nestjs|@nestjs)\b/gi },
      { name: 'FastAPI', pattern: /\b(fastapi|fast-api)\b/gi },
      { name: 'Django', pattern: /\b(django|djangorest)\b/gi },
      { name: 'Flask', pattern: /\b(flask|flask-restful)\b/gi },
      
      // 数据库
      { name: 'MySQL', pattern: /\b(mysql|mariadb)\b/gi },
      { name: 'PostgreSQL', pattern: /\b(postgresql|postgres|pg)\b/gi },
      { name: 'MongoDB', pattern: /\b(mongodb|mongo|mongoose)\b/gi },
      { name: 'Redis', pattern: /\b(redis|redisson)\b/gi },
      { name: 'SQLite', pattern: /\b(sqlite|sqlite3)\b/gi },
      { name: 'Elasticsearch', pattern: /\b(elasticsearch|elastic|es)\b/gi },
      
      // 工具和平台
      { name: 'Docker', pattern: /\b(docker|dockerfile|docker-compose)\b/gi },
      { name: 'Kubernetes', pattern: /\b(kubernetes|k8s|kubectl)\b/gi },
      { name: 'Git', pattern: /\b(git|github|gitlab|bitbucket)\b/gi },
      { name: 'AWS', pattern: /\b(aws|amazon web services|s3|ec2|lambda)\b/gi },
      { name: 'Azure', pattern: /\b(azure|azure devops)\b/gi },
      { name: 'GCP', pattern: /\b(gcp|google cloud|gcloud)\b/gi },
      { name: 'Vercel', pattern: /\b(vercel)\b/gi },
      { name: 'Netlify', pattern: /\b(netlify)\b/gi },
      
      // 机器学习框架
      { name: 'TensorFlow', pattern: /\b(tensorflow|tf|tensorflow\.js)\b/gi },
      { name: 'PyTorch', pattern: /\b(pytorch|torch)\b/gi },
      
      // CSS框架
      { name: 'Bootstrap', pattern: /\b(bootstrap|bs-)\b/gi },
      { name: 'Tailwind', pattern: /\b(tailwind|tailwindcss)\b/gi },
    ];
    
    // 使用正则表达式进行精准匹配
    techPatterns.forEach(({ name, pattern }) => {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        techStack[name] = (techStack[name] || 0) + matches.length;
      }
    });
  }

  /**
   * 提取词云数据 - 中英文分离统计
   */
  extractWordCloudData(text) {
    if (!text || text.length === 0) return;
    
    // 中文停用词
    const chineseStopWords = new Set([
      '的', '是', '在', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们',
      '和', '或', '但是', '因为', '所以', '如果', '就', '也', '都', '很', '非常',
      '可以', '能', '会', '要', '有', '没', '不', '来', '去', '这', '那', '个',
      '请', '帮', '写', '一个', '怎么', '如何', '什么', '哪个', '哪个',
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
    
    // 提取中文字词（2-10个字符）
    const chinesePattern = /[\u4e00-\u9fa5]{2,10}/g;
    const chineseWords = text.match(chinesePattern) || [];
    
    chineseWords.forEach(word => {
      if (!chineseStopWords.has(word) && word.length >= 2 && word.length <= 10) {
        this.stats.chineseWords[word] = (this.stats.chineseWords[word] || 0) + 1;
      }
    });
    
    // 提取英文单词（2-20个字符）
    const englishPattern = /\b[a-zA-Z]{2,20}\b/g;
    const englishWords = text.match(englishPattern) || [];
    
    englishWords.forEach(word => {
      const lowerWord = word.toLowerCase();
      if (!englishStopWords.has(lowerWord) && word.length >= 2 && word.length <= 20) {
        this.stats.englishWords[lowerWord] = (this.stats.englishWords[lowerWord] || 0) + 1;
      }
    });
  }

  /**
   * 
   */
  resetStats() {
    this.stats = {
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
      englishWords: {},
      userBehaviorStats: {
        totalUserChars: 0,
        avgUserMessageLength: 0,
        questionMessageCount: 0,
        techStack: {},
      },
    };
  }

  /**
    * 
    */
   getAllData() {
    return this.chatData;
  }

  /**
     * 
     */
    getStats() {

     return {
       ...this.stats,
       topChineseWordsList: this.getTopChineseWords(10),
     };
  }

  /**
   * 
   */
  getMostUsedModel() {
    const entries = Object.entries(this.stats.modelUsage);
    if (entries.length === 0) return 'unknown';

    const [model, count] = entries.sort((a, b) => b[1] - a[1])[0];
    return { model, count };
  }

  /**
   * 
   */
  getTopPrompts(limit = 5) {
    const entries = Object.entries(this.stats.topPrompts);
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([prompt, count]) => ({ prompt, count }));
  }

  /**
   * 
   */
  getTopChineseWords(limit = 10) {
    const entries = Object.entries(this.stats.topChineseWords);
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * 
   */
  formatDailyActivity() {
    const entries = Object.entries(this.stats.dailyActivity)
      .sort((a, b) => a[0].localeCompare(b[0]));

    return entries.map(([date, count]) => ({ date, count }));
  }

  /**
   * 
   */
  search(keyword) {
    if (!keyword) {
      return this.chatData;
    }

    const lowerKeyword = keyword.toLowerCase();
    return this.chatData.filter((item) => item.text.toLowerCase().includes(lowerKeyword));
  }

  /**
   * 
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
