# 修复API缺失 top_sentences 字段问题

## 问题描述

访问 `https://cursor-clinical-analysis.psterman.workers.dev/api/global-average` 返回的JSON中**没有 `top_sentences` 字段**:

```json
{
  "totalUsers": 2,
  "totalAnalysis": 2,
  "monthlyVibes": {...},
  "monthly_vibes": {...}
  // ❌ 缺少 top_sentences 字段
}
```

导致前端"国家语义爆发"卡片显示空白(如您的截图所示)。

## 根本原因

后端代码 `src/worker/index.ts` 中**尚未添加查询 `top_sentences` 的逻辑**。

虽然前端已经完成(stats2.html),但后端API还没有返回句子数据。

## 解决方案

### 方案1: 手动插入代码(推荐)

#### 步骤1: 打开文件
在 VSCode 中打开: `src/worker/index.ts`

#### 步骤2: 定位到第 3596-3598 行
找到这段代码:
```typescript
    // 兼容旧字段：monthly_slang 仅保留 slang 的 phrase 列表
    (finalRow as any).monthly_slang = slang.map((x: any) => x.phrase);

    // Debug：帮助定位"country_code=US 但返回 Global/空数组"的问题
```

#### 步骤3: 在第3597行(空行)之后插入代码
复制文件 `INSERT_AT_LINE_3597.ts` 中的全部代码,粘贴到第3597行之后。

插入后的结构:
```typescript
3596:    (finalRow as any).monthly_slang = slang.map((x: any) => x.phrase);
3597:
3598:    // 【V6.1 新增】高频句子...
3599:    try {
3600:      const sentenceUrl = ...
...
3651:    }
3652:
3653:    // Debug：帮助定位"country_code=US 但返回 Global/空数组"的问题
```

#### 步骤4: 保存并部署
```bash
cd src/worker
npm run deploy
```

### 方案2: 使用Git补丁(备选)

如果您熟悉git,可以创建并应用补丁文件 `worker_add_sentences.patch.txt`。

## 插入的代码说明

### 功能
1. **查询 sentence_pool 表**: 获取该地区TOP 10高频句子
2. **智能回退**: 如果表不存在或无数据,使用关键词(slang/merit/sv_slang)作为"句子"
3. **错误处理**: 确保API始终返回 `top_sentences` 字段(即使是空数组)

### 返回格式
```json
{
  "top_sentences": [
    {
      "sentence": "这个需求又改了",
      "hit_count": 25,
      "last_seen_at": "2026-01-30T10:00:00Z"
    },
    {
      "sentence": "明天上线",
      "hit_count": 18,
      "last_seen_at": "2026-01-29T15:30:00Z"
    },
    ...
  ]
}
```

### 回退逻辑
当 `sentence_pool` 表为空时,自动使用现有的关键词数据:
```typescript
const allPhrases = [...slang, ...merit, ...svSlang]
  .sort((a, b) => b.hit_count - a.hit_count)
  .slice(0, 10)
  .map(x => ({
    sentence: x.phrase,    // 关键词作为"句子"
    hit_count: x.hit_count,
    last_seen_at: null
  }));
```

## 验证步骤

### 1. 部署后测试API
```bash
curl https://cursor-clinical-analysis.psterman.workers.dev/api/global-average
```

**期望返回**:
```json
{
  "totalUsers": 2,
  "top_sentences": [
    {"sentence": "...", "hit_count": 10},
    ...
  ]
}
```

### 2. 检查前端展示
1. 打开 stats2.html
2. 点击美国地图
3. 查看右侧抽屉"国家语义爆发"卡片
4. **应该看到**:列表显示10条句子,每条有序号和重复次数

### 3. 检查浏览器控制台
按F12打开开发者工具,查看网络请求:
- **Request**: `GET /api/global-average?country_code=US`
- **Response**: 应包含 `top_sentences` 数组
- **Console**: 无错误信息

## 数据库准备(可选)

如果您想使用真实的句子数据(而不是关键词回退),需要:

### 1. 创建 sentence_pool 表
在 Supabase SQL Editor 中执行:
```bash
create_sentence_pool.sql
```

### 2. 插入测试数据(可选)
```sql
INSERT INTO sentence_pool (region, sentence, hit_count)
VALUES 
  ('US', '这个需求又改了', 25),
  ('US', '明天上线', 18),
  ('US', '先这样吧', 15),
  ('US', '紧急修复', 12),
  ('US', '加个班', 9),
  ('US', '测试一下', 7),
  ('US', '优化一下', 6),
  ('US', '重构代码', 5),
  ('US', '提个需求', 4),
  ('US', '改个bug', 3);
```

## 常见问题

### Q1: 插入代码后编译错误?
**A**: 检查缩进(应该是4个空格)和大括号匹配。参考 `INSERT_AT_LINE_3597.ts` 中的完整代码。

### Q2: 部署后API仍然没有 top_sentences?
**A**: 
1. 检查部署日志是否成功
2. 清除浏览器缓存
3. 检查代码是否插入到正确位置(第3597行之后)

### Q3: 前端显示空白?
**A**: 
1. 检查浏览器控制台是否有JavaScript错误
2. 检查API返回的 `top_sentences` 是否为空数组
3. 如果是空数组,说明既没有句子数据也没有关键词数据

### Q4: 想回到词云展示怎么办?
**A**: 前端代码已支持智能判断:
- 有句子数据 → 展示列表
- 无句子数据 → 自动回退到词云

## 文件清单

### 新建文件
- `INSERT_AT_LINE_3597.ts` - 要插入的代码片段
- `worker_add_sentences.patch.txt` - Git补丁文件
- `FIX_MISSING_SENTENCES_API.md` - 本文档

### 需要修改的文件
- `src/worker/index.ts` - 第3597行之后插入代码

### 已完成的文件
- `stats2.html` - 前端UI(无需修改)
- `create_sentence_pool.sql` - 数据库表(按需执行)

## 总结

**核心问题**: 后端缺少查询 `top_sentences` 的代码
**解决方法**: 在 `src/worker/index.ts` 第3597行之后插入代码
**预期效果**: API返回 `top_sentences` 数组,前端展示句子列表

完成后,您的"国家语义爆发"卡片将正确显示该国用户的高频句子! 🎉
