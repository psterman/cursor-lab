# 前端适配指南

## 📋 概述

为了配合后端重构，前端需要修改数据上报格式，确保 40+ 维度数据能够完整传递给后端。

---

## 🔄 核心变化

### 变化 1：完整上报 stats 对象

**之前**：前端只发送 `chatData`，后端自己计算

```javascript
// 旧版本
const payload = {
  chatData: messages,
  lang: 'zh-CN'
};
```

**现在**：前端计算完整的 stats 并上报

```javascript
// 新版本
const payload = {
  chatData: messages,
  stats: {
    totalChars: 12345,
    totalMessages: 50,
    ketao_count: 15,
    jiafang_count: 8,
    tease_count: 3,
    nonsense_count: 5,
    slang_count: 20,
    abuse_count: 2,
    abuse_value: 10,
    tech_stack: {
      'React': 15,
      'Python': 10,
      'TypeScript': 8
    },
    work_days: 7,
    code_ratio: 0.35,
    feedback_density: 0.12,
    balance_score: 75,
    diversity_score: 8,
    style_index: 85.5,
    style_label: '雄辩家',
    avg_payload: 246.9,
    blackword_hits: {
      chinese_slang: {
        '赋能': 5,
        '闭环': 3
      },
      english_slang: {
        'leverage': 8,
        'synergy': 6
      }
    }
  },
  dimensions: { L: 65, P: 72, D: 58, E: 45, F: 80 },
  fingerprint: 'a1b2c3d4...',
  lang: 'zh-CN',
  userName: '匿名受害者',
  hourlyActivity: {
    '0': 0, '1': 0, '2': 0, '3': 0,
    '9': 5, '10': 8, '11': 12,
    '14': 15, '15': 20, '16': 18
  },
  metadata: {
    browser: 'Chrome 120',
    os: 'Windows 10',
    timezone: 'Asia/Shanghai',
    screen: '1920x1080'
  }
};
```

---

## 📝 详细修改步骤

### 步骤 1：修改 `vibeAnalyzerWorker.js`

在 `vibeAnalyzerWorker.js` 中，确保 `postMessage` 发送完整的数据结构：

```javascript
// 找到 postMessage 的地方，修改为：
self.postMessage({
  type: 'analysis_complete',
  data: {
    chatData: messages,  // 保留原有的 chatData
    stats: {             // 新增：完整的 stats 对象
      totalChars: totalChars,
      totalMessages: totalMessages,
      ketao_count: ketaoCount,
      jiafang_count: jiafangCount,
      tease_count: teaseCount,
      nonsense_count: nonsenseCount,
      slang_count: slangCount,
      abuse_count: abuseCount,
      abuse_value: abuseValue,
      tech_stack: techStackMap,  // 技术栈词频统计
      work_days: workDays,
      code_ratio: codeRatio,
      feedback_density: feedbackDensity,
      balance_score: balanceScore,
      diversity_score: diversityScore,
      style_index: styleIndex,
      style_label: styleLabel,
      avg_payload: avgPayload,
      blackword_hits: {
        chinese_slang: chineseSlangHits,
        english_slang: englishSlangHits
      }
    },
    dimensions: {        // 新增：维度得分
      L: logicScore,
      P: patienceScore,
      D: detailScore,
      E: exploreScore,
      F: feedbackScore
    },
    fingerprint: generateFingerprint(messages),  // 新增：语义指纹
    lang: detectLanguage(),  // 新增：语言检测
    hourlyActivity: calculateHourlyActivity(messages),  // 新增：时段活跃度
    metadata: {          // 新增：元数据
      browser: navigator.userAgent,
      os: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`
    }
  }
});
```

### 步骤 2：添加辅助函数

在 `vibeAnalyzerWorker.js` 中添加以下辅助函数：

```javascript
/**
 * 生成语义指纹
 */
function generateFingerprint(messages) {
  const stableContent = messages
    .slice(0, 10)
    .map(m => m.text || '')
    .join('');
  
  // 使用 Web Crypto API 生成 SHA-256 哈希
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableContent))
    .then(buffer => {
      return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    });
}

/**
 * 检测语言
 */
function detectLanguage() {
  const lang = navigator.language || navigator.userLanguage || 'zh-CN';
  return lang;
}

/**
 * 计算时段活跃度
 */
function calculateHourlyActivity(messages) {
  const hourlyMap = {};
  
  // 初始化 24 小时
  for (let i = 0; i < 24; i++) {
    hourlyMap[i] = 0;
  }
  
  // 统计每小时的消息数
  messages.forEach(msg => {
    if (msg.timestamp) {
      const date = new Date(msg.timestamp);
      const hour = date.getHours();
      hourlyMap[hour]++;
    }
  });
  
  return hourlyMap;
}

/**
 * 计算技术栈词频
 */
function calculateTechStack(messages) {
  const techMap = {};
  
  // 技术名词列表（从 scoring.ts 的 TECH_PATTERNS 提取）
  const techPatterns = [
    /\b(react|vue|angular|svelte|next\.js|nuxt)\b/gi,
    /\b(python|javascript|typescript|java|go|rust)\b/gi,
    /\b(docker|kubernetes|aws|azure|gcp)\b/gi,
    // ... 更多技术名词
  ];
  
  messages.forEach(msg => {
    const text = msg.text || '';
    techPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const tech = match.toLowerCase();
          techMap[tech] = (techMap[tech] || 0) + 1;
        });
      }
    });
  });
  
  return techMap;
}
```

### 步骤 3：修改主页面的请求逻辑

在主页面（如 `index.html` 或 `main.js`）中，修改发送请求的部分：

```javascript
// 监听 Worker 消息
vibeAnalyzerWorker.onmessage = async (event) => {
  if (event.data.type === 'analysis_complete') {
    const analysisData = event.data.data;
    
    // 等待指纹生成完成（如果是 Promise）
    if (analysisData.fingerprint instanceof Promise) {
      analysisData.fingerprint = await analysisData.fingerprint;
    }
    
    // 发送到后端
    const response = await fetch('https://your-worker.workers.dev/api/v2/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(analysisData)
    });
    
    const result = await response.json();
    
    // 处理返回结果
    if (result.status === 'success') {
      console.log('分析结果:', result);
      console.log('匹配程度:', result.matchingLevel);  // 新增字段
      console.log('地理位置:', result.geo);            // 新增字段
      
      // 显示结果
      displayResults(result);
    }
  }
};
```

---

## 🔍 数据完整性检查

在发送请求前，添加数据完整性检查：

```javascript
/**
 * 验证数据完整性
 */
function validatePayload(payload) {
  const errors = [];
  
  // 检查必需字段
  if (!payload.chatData || !Array.isArray(payload.chatData)) {
    errors.push('chatData 必须是数组');
  }
  
  if (!payload.stats) {
    errors.push('stats 对象缺失');
  } else {
    // 检查 stats 的必需字段
    const requiredStatsFields = [
      'totalChars', 'totalMessages', 'ketao_count', 'jiafang_count',
      'tech_stack', 'work_days', 'avg_payload', 'blackword_hits'
    ];
    
    requiredStatsFields.forEach(field => {
      if (payload.stats[field] === undefined) {
        errors.push(`stats.${field} 缺失`);
      }
    });
  }
  
  if (!payload.dimensions) {
    errors.push('dimensions 对象缺失');
  } else {
    // 检查维度范围
    const dims = ['L', 'P', 'D', 'E', 'F'];
    dims.forEach(dim => {
      const value = payload.dimensions[dim];
      if (value === undefined || value < 0 || value > 100) {
        errors.push(`dimensions.${dim} 无效（应在 0-100 之间）`);
      }
    });
  }
  
  if (!payload.fingerprint || payload.fingerprint.length !== 64) {
    errors.push('fingerprint 格式无效（应为 64 位十六进制字符串）');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 使用示例
const validation = validatePayload(analysisData);
if (!validation.valid) {
  console.error('数据验证失败:', validation.errors);
  // 显示错误提示
  return;
}

// 验证通过，发送请求
const response = await fetch('...', { ... });
```

---

## 📊 响应处理

处理新增的响应字段：

```javascript
function displayResults(result) {
  // 原有字段
  console.log('维度得分:', result.dimensions);
  console.log('人格类型:', result.personalityType);
  console.log('吐槽文案:', result.roastText);
  
  // 新增字段
  console.log('匹配程度:', result.matchingLevel);
  // - 'full': 后端使用了前端传来的完整数据
  // - 'partial': 后端只能从 Supabase 获取部分数据
  // - 'none': 后端使用了默认值
  
  console.log('地理位置:', result.geo);
  // - country: 国家代码（如 'CN', 'US'）
  // - city: 城市名称（可选）
  // - riskLevel: 'low' | 'high'（是否检测到 VPN/Proxy）
  
  console.log('完整统计:', result.data.stats);
  // - 包含前端上报的所有 40+ 维度数据
  
  // 显示风险提示
  if (result.geo.riskLevel === 'high') {
    showWarning('检测到您可能在使用 VPN 或代理，排名可能受到影响');
  }
  
  // 显示匹配程度提示
  if (result.matchingLevel === 'partial') {
    showInfo('部分数据使用了历史记录，建议重新分析以获得最准确的结果');
  } else if (result.matchingLevel === 'none') {
    showWarning('无法获取历史数据，使用了默认值');
  }
}
```

---

## 🧪 测试清单

### 前端测试

- [ ] Worker 能正确计算所有 40+ 维度
- [ ] 指纹生成正常（64 位十六进制）
- [ ] 时段活跃度统计正确
- [ ] 技术栈词频统计准确
- [ ] 元数据正确收集
- [ ] 数据验证逻辑生效
- [ ] 请求体大小 < 5MB

### 集成测试

- [ ] 前端上报的数据能被后端正确接收
- [ ] 后端返回的 `matchingLevel` 为 `full`
- [ ] 地理位置信息正确显示
- [ ] 风险等级正确标记
- [ ] 完整的 stats 数据能在响应中找到

### 兼容性测试

- [ ] Chrome 90+
- [ ] Firefox 88+
- [ ] Safari 14+
- [ ] Edge 90+
- [ ] 移动端浏览器

---

## 🐛 常见问题

### 问题 1：指纹生成失败

**症状**：`crypto.subtle.digest` 报错

**原因**：Web Crypto API 只在 HTTPS 或 localhost 环境下可用

**解决**：
```javascript
// 降级方案：使用简单哈希
function generateFingerprintFallback(messages) {
  const content = messages.slice(0, 10).map(m => m.text || '').join('');
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16).padStart(64, '0');
}
```

### 问题 2：Worker 消息丢失

**症状**：主页面收不到 Worker 的消息

**原因**：Worker 可能在处理过程中崩溃

**解决**：
```javascript
// 添加超时处理
const workerTimeout = setTimeout(() => {
  console.error('Worker 响应超时');
  showError('分析超时，请重试');
}, 30000); // 30 秒超时

vibeAnalyzerWorker.onmessage = (event) => {
  clearTimeout(workerTimeout);
  // 处理消息
};
```

### 问题 3：技术栈统计不准确

**症状**：某些技术名词没有被识别

**原因**：正则表达式不完整

**解决**：
```javascript
// 从后端的 scoring.ts 同步技术名词列表
// 或者直接使用后端的算法
```

---

## 📚 参考代码

### 完整的 Worker 消息示例

```javascript
// vibeAnalyzerWorker.js

self.onmessage = async (event) => {
  const { messages } = event.data;
  
  try {
    // 1. 计算基础统计
    const totalChars = messages.reduce((sum, m) => sum + (m.text?.length || 0), 0);
    const totalMessages = messages.length;
    
    // 2. 计算各种计数
    const ketaoCount = countPoliteWords(messages);
    const jiafangCount = countNegationWords(messages);
    const teaseCount = countTeaseWords(messages);
    const nonsenseCount = countNonsenseWords(messages);
    const slangCount = countSlangWords(messages);
    const abuseCount = countAbuseWords(messages);
    const abuseValue = calculateAbuseValue(messages);
    
    // 3. 计算技术栈
    const techStackMap = calculateTechStack(messages);
    
    // 4. 计算工作天数
    const workDays = calculateWorkDays(messages);
    
    // 5. 计算代码比例
    const codeRatio = calculateCodeRatio(messages);
    
    // 6. 计算反馈密度
    const feedbackDensity = calculateFeedbackDensity(messages);
    
    // 7. 计算平衡度和多样性
    const balanceScore = calculateBalanceScore(messages);
    const diversityScore = Object.keys(techStackMap).length;
    
    // 8. 计算风格指数
    const styleIndex = calculateStyleIndex(messages);
    const styleLabel = determineStyleLabel(styleIndex);
    
    // 9. 计算平均载荷
    const avgPayload = totalMessages > 0 ? totalChars / totalMessages : 0;
    
    // 10. 统计黑话
    const chineseSlangHits = countChineseSlang(messages);
    const englishSlangHits = countEnglishSlang(messages);
    
    // 11. 计算五维得分
    const dimensions = calculateDimensions(messages);
    
    // 12. 生成指纹
    const fingerprint = await generateFingerprint(messages);
    
    // 13. 计算时段活跃度
    const hourlyActivity = calculateHourlyActivity(messages);
    
    // 14. 收集元数据
    const metadata = {
      browser: navigator.userAgent,
      os: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`
    };
    
    // 15. 发送完整数据
    self.postMessage({
      type: 'analysis_complete',
      data: {
        chatData: messages,
        stats: {
          totalChars,
          totalMessages,
          ketao_count: ketaoCount,
          jiafang_count: jiafangCount,
          tease_count: teaseCount,
          nonsense_count: nonsenseCount,
          slang_count: slangCount,
          abuse_count: abuseCount,
          abuse_value: abuseValue,
          tech_stack: techStackMap,
          work_days: workDays,
          code_ratio: codeRatio,
          feedback_density: feedbackDensity,
          balance_score: balanceScore,
          diversity_score: diversityScore,
          style_index: styleIndex,
          style_label: styleLabel,
          avg_payload: avgPayload,
          blackword_hits: {
            chinese_slang: chineseSlangHits,
            english_slang: englishSlangHits
          }
        },
        dimensions,
        fingerprint,
        lang: detectLanguage(),
        hourlyActivity,
        metadata
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'analysis_error',
      error: error.message
    });
  }
};
```

---

## 🎯 下一步

1. 修改 `vibeAnalyzerWorker.js`，添加完整的数据计算逻辑
2. 修改主页面的请求逻辑，发送完整的 payload
3. 添加数据验证逻辑
4. 测试前后端数据流通
5. 部署到生产环境

---

## 📞 支持

如有问题，请参考：
- `REFACTOR_GUIDE.md`（后端重构指南）
- 浏览器控制台日志
- Network 面板（查看请求体和响应体）

或联系开发团队。
