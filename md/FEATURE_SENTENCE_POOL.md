# 国家语义爆发 - 高频句子展示功能

## 功能说明
在用户点击国家地图后,右侧抽屉的"国家语义爆发"卡片中展示该国用户**多次重复出现的完整句子**(按雷同次数排序),替代原有的关键词词云。

## 需求分析
- **原有功能**: 展示关键词词云(slang/merit/sv_slang)
- **新需求**: 展示完整句子,按雷同次数排序,最多10条
- **数据来源**: 新增 `sentence_pool` 表存储用户输入的完整句子

## 实现方案

### 1. 数据库层 (已完成)

#### 新建表: `sentence_pool`
文件: `create_sentence_pool.sql`

```sql
CREATE TABLE sentence_pool (
  sentence      TEXT NOT NULL,           -- 完整句子
  region        TEXT NOT NULL,           -- 国家代码(US, CN等)
  hit_count     BIGINT DEFAULT 1,        -- 重复次数
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (region, sentence)
);
```

#### RPC函数
1. **`upsert_sentence_pool_v1`**: 原子累加句子计数
   - 参数: `p_sentence`, `p_region`, `p_delta`
   - 自动过滤: 空句子、过短(<3字符)、过长(>500字符)
   
2. **`get_top_sentences_v1`**: 查询TOP句子
   - 参数: `p_region`, `p_limit` (默认10)
   - 返回: `sentence`, `hit_count`, `last_seen_at`
   
3. **`cleanup_sentence_pool_v1`**: 清理过期/低频句子

### 2. 后端层 (待部署)

#### 修改 `/api/global-average` 路由
文件: `src/worker/index.ts` (第3598行之后)

**新增逻辑**:
```typescript
// 查询 sentence_pool 表
const sentenceUrl = new URL(`${env.SUPABASE_URL}/rest/v1/sentence_pool`);
sentenceUrl.searchParams.set('select', 'sentence,hit_count,last_seen_at');
sentenceUrl.searchParams.set('region', `eq.${region}`);
sentenceUrl.searchParams.set('order', 'hit_count.desc');
sentenceUrl.searchParams.set('limit', '10');

// 返回数据
(finalRow as any).top_sentences = topSentences;
```

**返回格式**:
```json
{
  "top_sentences": [
    {
      "sentence": "这个需求又改了",
      "hit_count": 25,
      "last_seen_at": "2026-01-30T10:00:00Z"
    },
    ...
  ]
}
```

### 3. 前端层 (已完成)

#### 修改文件: `stats2.html`

##### 3.1 数据接收 (第2123行)
```javascript
// 保存后端返回的句子数据到全局变量
window.__latestTopSentences = data.top_sentences || null;
```

##### 3.2 数据处理 (第10862行)
```javascript
// 优先使用 top_sentences,否则回退到关键词
const topSentences = window.__latestTopSentences || null;

if (Array.isArray(topSentences) && topSentences.length > 0) {
    combined0 = topSentences.map(x => ({
        name: x.sentence,
        value: x.hit_count,
        category: 'sentence'
    }));
} else {
    // 回退：使用关键词
    combined0 = [...slang, ...merit, ...sv_slang]
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, 10);
}
```

##### 3.3 UI渲染 (第10913行)
```javascript
if (useSentenceList) {
    // 渲染为列表(10条)
    nationalContainer.innerHTML = `
        <div class="flex items-start gap-3 p-3">
            <div class="w-6 h-6 rounded-full bg-gradient-to-br">
                ${index + 1}
            </div>
            <div class="flex-1 text-sm text-zinc-200">
                ${sentence}
            </div>
            <div class="text-sm font-bold" style="color: ${countColor}">
                ×${count}
            </div>
        </div>
    `;
} else {
    // 回退：词云渲染
}
```

## 数据流程

```
用户输入 → 前端提取句子 → POST /api/report-sentence
                            ↓
                  upsert_sentence_pool_v1()
                            ↓
                    sentence_pool表累加
                            
用户点击地图 → GET /api/global-average?country_code=US
                            ↓
                  查询 sentence_pool (TOP 10)
                            ↓
                前端展示列表(按hit_count降序)
```

## 待实现功能

### 阶段1: 数据库准备 ✅
- [x] 创建 `sentence_pool` 表
- [x] 创建 RPC 函数

### 阶段2: 前端展示 ✅
- [x] 修改UI渲染逻辑(列表替代词云)
- [x] 添加回退逻辑(无句子时显示关键词)
- [x] 更新提示文本

### 阶段3: 后端API (待部署)
- [ ] 在 `/api/global-average` 中添加查询逻辑
- [ ] 部署到 Cloudflare Workers
- [ ] 测试验证数据返回

### 阶段4: 数据采集 (待实现)
- [ ] 前端提取用户输入的完整句子
- [ ] 创建 `/api/report-sentence` 端点
- [ ] 调用 `upsert_sentence_pool_v1` 上报

## 临时方案

**当前状态**: 前端已完成,后端API尚未部署

**临时展示**:
- 如果 `data.top_sentences` 不存在
- 自动回退到使用 `slang_trends_pool` 的关键词作为"句子"展示
- 按 `hit_count` 排序,显示前10条

## 测试验证

### 验证步骤
1. ✅ 执行 `create_sentence_pool.sql` 创建表
2. ⏳ 部署后端代码到 Workers
3. ⏳ 点击美国地图,检查网络请求
4. ⏳ 验证返回数据中包含 `top_sentences` 字段
5. ⏳ 检查右侧抽屉是否展示句子列表

### 预期效果
- **有句子数据**: 展示列表,每行显示 `序号 + 句子内容 + 重复次数`
- **无句子数据**: 回退到关键词列表(临时方案)
- **颜色编码**: 
  - ≥10次: 绿色 (#00ff41)
  - 5-9次: 蓝色 (#3b82f6)
  - <5次: 灰色 (#9ca3af)

## 文件清单

### 新增文件
- `create_sentence_pool.sql` - 数据库表和函数
- `FEATURE_SENTENCE_POOL.md` - 功能说明文档

### 修改文件
- `stats2.html` (前端渲染逻辑)
  - 第2123行: 保存 `top_sentences`
  - 第10853行: 获取并回退逻辑
  - 第10862-10882行: 数据处理
  - 第10913-10947行: 列表渲染
  - 第1528行: 更新提示文本
  
- `src/worker/index.ts` (后端API) **[待部署]**
  - 第3598行之后: 添加查询 `sentence_pool` 逻辑

## 注意事项

1. **数据隐私**: 句子内容可能包含敏感信息,建议:
   - 限制句子长度(3-500字符)
   - 定期清理低频/过期句子
   - 不存储用户身份信息

2. **性能优化**:
   - 索引: `(region, hit_count DESC)`
   - 限制查询: `LIMIT 10`
   - 考虑缓存热门地区数据

3. **数据质量**:
   - 过滤空句子、过短句子
   - 去除特殊字符/emoji(可选)
   - 考虑使用相似度算法合并近似句子

## 下一步

1. **执行SQL脚本**:
   ```bash
   # 在 Supabase SQL Editor 中执行
   create_sentence_pool.sql
   ```

2. **部署后端代码**:
   ```bash
   cd src/worker
   npm run deploy
   ```

3. **实现数据采集**:
   - 前端提取句子(按标点符号分割)
   - POST /api/report-sentence
   - 异步上报,不阻塞用户体验
