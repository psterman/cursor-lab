# 指纹匹配诊断脚本使用指南

## 快速开始

1. 打开 `stats2.html` 页面
2. 按 `F12` 打开浏览器开发者工具
3. 切换到 `Console`（控制台）标签
4. 复制 `fingerprint-diagnostic.js` 文件的全部内容
5. 粘贴到控制台并按 `Enter` 执行

## 诊断脚本功能

诊断脚本会自动执行以下 9 个步骤：

### 步骤 1: 检查基础环境 ✅
- 检查 window、document、localStorage 是否可用
- 检查 Supabase 客户端是否初始化
- 检查 renderUserStatsCards 函数是否存在

**预期结果**: 所有检查项都应该显示 ✅

**如果失败**: 
- Supabase 客户端未初始化 → 等待页面完全加载后再执行
- renderUserStatsCards 函数不存在 → 检查 stats2.html 是否正确加载

---

### 步骤 2: 检查指纹生成和存储 ✅
- 从 localStorage 获取已存储的指纹
- 如果没有，自动生成新指纹并保存

**预期结果**: 
- ✅ 从 localStorage 获取到指纹 或 ✅ 已生成新指纹并保存

**如果失败**: 
- 可能是浏览器安全策略阻止了 localStorage 访问
- 检查浏览器控制台是否有安全错误

---

### 步骤 3: 检查 allData 数据加载 ✅
- 检查 window.allData 是否存在且为数组
- 统计数据量
- 显示前5个用户的摘要

**预期结果**: 
- ✅ allData 是数组类型
- 📊 allData 数据量 > 0

**如果失败**: 
- allData 为空 → 可能是 API 数据还未加载完成，等待几秒后重新执行
- allData 不是数组 → 检查 fetchData() 函数是否正常执行

---

### 步骤 4: 查找 psterman 用户记录 ✅
- 在 allData 中查找 user_name 为 "psterman" 的记录
- 如果未找到，尝试从 Supabase 数据库直接查询
- 如果找到，显示详细的用户信息

**预期结果**: 
- ✅ 在 allData 中找到 psterman 用户记录 或 ✅ 从数据库查询到 psterman 用户

**如果失败**: 
- 未找到 psterman 用户 → 检查数据库中是否存在该用户
- 数据库查询失败 → 检查 Supabase 连接和 RLS 策略

---

### 步骤 5: 检查指纹匹配逻辑 ✅
- 比较当前设备指纹与 psterman 用户的指纹
- 检查 fingerprint 和 user_identity 两个字段

**预期结果**: 
- ✅ 指纹匹配成功！

**如果失败**: 
- ❌ 指纹不匹配 → 需要重新绑定指纹（使用 GitHub OAuth 登录或手动保存 GitHub ID）

---

### 步骤 6: 检查 window.currentUser ✅
- 检查 window.currentUser 是否已设置
- 验证当前用户是否为 psterman
- 检查用户数据是否完整（维度数据、排名数据等）

**预期结果**: 
- ✅ window.currentUser 已设置
- 是否 psterman: ✅ 是
- 有维度数据: ✅
- 有排名数据: ✅

**如果失败**: 
- currentUser 未设置 → 脚本会自动尝试设置（如果找到匹配用户）
- 不是 psterman → 检查指纹匹配是否成功
- 缺少数据 → 检查数据库中该用户的完整数据

---

### 步骤 7: 检查左侧抽屉状态 ✅
- 检查左侧抽屉元素是否存在
- 检查抽屉是否打开
- 统计抽屉中的卡片数量
- 检查是否已有统计卡片

**预期结果**: 
- ✅ 左侧抽屉元素存在
- ✅ 抽屉内容区域存在
- 抽屉中的卡片数量 > 0

**如果失败**: 
- 抽屉元素不存在 → 检查 HTML 结构是否正确
- 抽屉未打开 → 脚本会自动尝试打开

---

### 步骤 8: 检查统计卡片渲染 ✅
- 检查渲染统计卡片所需的所有条件
- 验证当前用户是否为 psterman

**预期结果**: 
- ✅ 所有必要条件满足
- 是否 psterman: ✅ 是

**如果失败**: 
- 缺少必要条件 → 根据具体错误信息修复
- 不是 psterman → 需要先完成前面的步骤

---

### 步骤 9: 尝试自动修复 ✅
- 自动设置 window.currentUser（如果找到匹配用户）
- 自动渲染统计卡片（如果条件满足）
- 自动打开左侧抽屉（如果未打开）

**预期结果**: 
- ✅ 统计卡片已渲染

**如果失败**: 
- 查看具体错误信息
- 手动执行修复步骤（见下方）

---

## 诊断报告解读

脚本执行完成后，会输出一个诊断报告摘要，包含：

```javascript
{
  results: {
    step1: { name: '检查基础环境', status: 'success', details: [...] },
    step2: { name: '检查指纹生成和存储', status: 'success', details: [...] },
    // ... 其他步骤
  },
  summary: {
    totalSteps: 9,
    successSteps: 7,
    warningSteps: 1,
    errorSteps: 1,
    currentFingerprint: '3aaee760c994b...',
    pstermanUsersFound: 1,
    currentUserSet: true,
    isPsterman: true
  }
}
```

### 状态说明

- ✅ **success**: 步骤成功完成
- ⚠️ **warning**: 步骤完成但有警告（可能需要关注）
- ❌ **error**: 步骤失败（需要修复）
- ℹ️ **info**: 信息性步骤（无需操作）
- ⏳ **pending**: 步骤进行中

---

## 常见问题排查

### 问题 1: allData 为空

**症状**: 步骤 3 显示 `allData 数据量: 0`

**解决方案**:
```javascript
// 手动触发数据加载
await fetchData();
console.log('allData 数据量:', window.allData?.length);
```

### 问题 2: 未找到 psterman 用户

**症状**: 步骤 4 显示 `❌ 在 allData 中未找到 psterman 用户记录`

**解决方案**:
```javascript
// 从数据库直接查询
const { data, error } = await window.supabaseClient
    .from('user_analysis')
    .select('*')
    .eq('user_name', 'psterman')
    .maybeSingle();

if (data) {
    console.log('找到 psterman 用户:', data);
    window.currentUser = data;
} else {
    console.log('数据库中也没有找到');
}
```

### 问题 3: 指纹不匹配

**症状**: 步骤 5 显示 `❌ 指纹不匹配`

**解决方案**:
1. 使用 GitHub OAuth 登录（推荐）
2. 或手动保存 GitHub ID：
   ```javascript
   // 确保已输入 GitHub ID 后执行
   saveGitHubUsername();
   ```

### 问题 4: 统计卡片未渲染

**症状**: 步骤 8 或 9 显示统计卡片未渲染

**解决方案**:
```javascript
// 手动渲染统计卡片
const leftBody = document.getElementById('left-drawer-body');
const currentUser = window.currentUser;

if (leftBody && currentUser) {
    renderUserStatsCards(leftBody, currentUser);
    console.log('✅ 统计卡片已渲染');
} else {
    console.error('缺少必要元素');
}
```

---

## 手动修复步骤

如果自动修复失败，可以按以下步骤手动修复：

### 修复 1: 设置 currentUser

```javascript
// 如果找到了匹配的 psterman 用户
const pstermanUser = window.allData.find(user => 
    (user.user_name || user.name || '').toLowerCase() === 'psterman'
);

if (pstermanUser) {
    window.currentUser = pstermanUser;
    window.currentUserMatchedByFingerprint = true;
    console.log('✅ 已设置 currentUser');
}
```

### 修复 2: 打开左侧抽屉

```javascript
const leftDrawer = document.getElementById('left-drawer');
const rightDrawer = document.getElementById('right-drawer');

if (leftDrawer) {
    leftDrawer.classList.add('active');
    if (rightDrawer) {
        rightDrawer.classList.add('active');
    }
    console.log('✅ 已打开抽屉');
}
```

### 修复 3: 渲染统计卡片

```javascript
const leftBody = document.getElementById('left-drawer-body');
const currentUser = window.currentUser;

if (leftBody && currentUser) {
    // 移除旧的统计卡片
    const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
    existingStatsCards.forEach(card => {
        const label = card.querySelector('.drawer-item-label');
        if (label && label.textContent === '我的数据统计') {
            card.remove();
        }
    });
    
    // 渲染新的统计卡片
    renderUserStatsCards(leftBody, currentUser);
    console.log('✅ 统计卡片已渲染');
}
```

---

## 输出示例

### 成功案例

```
🔍 指纹匹配和用户数据加载完整诊断
  📋 步骤 1: 检查基础环境
    ✅ window 对象存在
    ✅ document 对象存在
    ✅ localStorage 可用
    ✅ Supabase 客户端已初始化
    ✅ renderUserStatsCards 函数存在
  ✅ 基础环境检查完成
  
  📋 步骤 2: 检查指纹生成和存储
    ✅ 从 localStorage 获取到指纹: 3aaee760c994b...
  ✅ 指纹检查完成
  
  📋 步骤 3: 检查 allData 数据加载
    ✅ allData 是数组类型
    📊 allData 数据量: 150
  ✅ allData 检查完成
  
  📋 步骤 4: 查找 psterman 用户记录
    ✅ 在 allData 中找到 1 个 psterman 用户记录
  ✅ psterman 用户查找完成
  
  📋 步骤 5: 检查指纹匹配逻辑
    ✅ 指纹匹配成功！
  ✅ 指纹匹配检查完成
  
  📋 步骤 6: 检查 window.currentUser
    ✅ window.currentUser 已设置
    用户名称: psterman
    是否 psterman: ✅ 是
  ✅ currentUser 检查完成
  
  📋 步骤 7: 检查左侧抽屉状态
    ✅ 左侧抽屉元素存在
    ✅ 抽屉内容区域存在
    ✅ 找到统计卡片
  ✅ 左侧抽屉检查完成
  
  📋 步骤 8: 检查统计卡片渲染
    ✅ 所有必要条件满足
    是否 psterman: ✅ 是
  ✅ 统计卡片渲染检查完成
  
  📋 步骤 9: 尝试自动修复
    ✅ 统计卡片已渲染
  ✅ 自动修复尝试完成
  
  📊 诊断报告摘要
    ✅ 检查基础环境: success
    ✅ 检查指纹生成和存储: success
    ✅ 检查 allData 数据加载: success
    ✅ 查找 psterman 用户记录: success
    ✅ 检查指纹匹配逻辑: success
    ✅ 检查 window.currentUser: success
    ✅ 检查左侧抽屉状态: success
    ✅ 检查统计卡片渲染: success
    ✅ 尝试自动修复: success
```

### 失败案例（指纹不匹配）

```
  📋 步骤 5: 检查指纹匹配逻辑
    🔍 开始检查指纹匹配...
    当前指纹: 3aaee760c994b...
    
    记录 1 匹配检查:
      - fingerprint 字段: null
      - user_identity 字段: null
      - fingerprint 匹配: ❌
      - user_identity 匹配: ❌
      ❌ 指纹不匹配
  ⚠️ 指纹不匹配，可能需要重新绑定指纹
```

---

## 下一步操作

根据诊断报告的结果：

1. **如果所有步骤都成功** → 统计卡片应该已经显示，问题已解决 ✅

2. **如果有警告步骤** → 查看警告详情，可能需要手动操作

3. **如果有错误步骤** → 按照上面的"常见问题排查"部分进行修复

4. **如果自动修复失败** → 使用"手动修复步骤"进行修复

---

## 联系支持

如果问题仍然存在，请提供：
1. 完整的诊断报告输出
2. 浏览器控制台的所有错误信息
3. 具体的失败步骤编号

这样可以帮助更快定位和解决问题。
