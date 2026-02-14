# stats-app.js 拆分计划

## 概述

将 21,507 行的 `stats-app.js` 拆分为 6 个功能模块文件 + 1 个入口文件。

## 拆分方案

### 最终文件结构

```
assets/js/
├── stats-app-core.js        # 核心功能 (6000行)
├── stats-app-map.js        # 地图与光标 (4000行)
├── stats-app-ranking.js     # 排行榜与榜单 (3500行)
├── stats-app-realtime.js   # 实时与消息 (3000行)
├── stats-app-ui.js         # UI 辅助函数 (2500行)
├── stats-app-data.js       # 数据处理 (2000行)
├── stats-app.js            # 入口文件 (整合+初始化)
├── stats-constants.js      # 常量 (已有)
├── stats-data-service.js   # 数据服务 (已有)
└── stats-ui-renderer.js    # UI渲染器 (已有)
```

---

## 详细拆分规范

### 1. stats-app-core.js (~6000行)
**职责**: 国家选择、仪表板、初始化

**包含函数**:
```javascript
// 强制选籍拦截
closeCountryPickerModal()
run()

// 国家选择器
initLeftDrawerCountrySelector()        // line 10033
initCountrySelectDropdown()              // line 10264
renderCountryList()                     // line 10586
selectCountryFromSelector()             // line 10666
saveManualLocation()                    // line 10753
resetToAutoLocation()                   // line 10870
updateResetButtonVisibility()           // line 10933
openCountrySelector()                   // line 10950

// 国家切换
onCountrySwitch()                       // line 3823
switchToCountryView()                    // line 6591
switchToCountryViewFromGlobal()          // line 8185

// 仪表板
updateCountryDashboard()                 // line 484
showDrawersWithCountryData()            // line 5070
renderCountryRightPanel()                // line 6638
refreshCountryRightPanel()               // line 6759

// 视图切换
switchView()                            // line 6771
switchBackToGlobalView()                // line 8178
toggleGlobalCountryView()               // line 8237
updateHeaderViewToggleBtn()             // line 8251
closeDrawers()                          // line 8270
```

---

### 2. stats-app-map.js (~4000行)
**职责**: 地图渲染、光标管理、地理定位

**包含函数**:
```javascript
// 地理辅助
getCountryByCoords()                    // line 3787
getCountryAtCoordinates()               // line 3806
getAllCountries()                       // line 9982
resolveCountryCodeFromMapName()         // line 3408
normalizeCountryKey()                   // line 3281
getMapNameFromIso2()                    // line 8418

// 光标管理
setFixedCursorOnScreen()                // line 4246
removeFixedCursor()                     // line 4331
restoreFixedCursor()                    // line 4410
syncFixedCursorGraphicPosition()        // line 4438
bindFixedCursorFollowMap()              // line 4476
setOrUpdateCurrentLocationCursor()       // line 9230
setOrUpdateCurrentLocationCursorECharts() // line 9267
setOrUpdateCurrentLocationCursorLeaflet() // line 9377

// 地图事件
initLeafletMapEventHandlers()           // line 9517
bindCurrentLocationDragHandlers()        // line 9801
bindMapCursorSelfHeal()                 // line 9766
ensureCurrentLocationCursor()            // line 9700
forceRestoreLockedCursor()              // line 9718

// 校准
setCalibrationMode()                     // line 9960
setAnchorMode()                         // line 10505
scheduleGeoFenceByCoords()              // line 4072

// 地图初始化
initGlobalMap()                         // line 8434
initMapCursorTools()                    // line 10481
initCountrySelector()                   // line 10538
```

---

### 3. stats-app-ranking.js (~3500行)
**职责**: 排行榜、高分图谱、榜单渲染

**包含函数**:
```javascript
// 排行榜核心
drawHighScores()                        // line 77
ensureLeaderboardParentVisible()        // line 68

// 视图渲染
renderRankingView()                     // line 6891
renderMatrixLaddersFromRPC()             // line 7049
renderMatrixLaddersFromDirectQuery()    // line 7082
renderMatrixLadderTable()                // line 7148
renderEmptyMatrixLadder()               // line 7213
renderGreenLadders()                    // line 7452
renderGreenLaddersToContainer()         // line 7485

// 详情面板
showUserRankingDetail()                  // line 7653
closeUserRankingDetail()                 // line 7912
showRankingDetailSimple()                // line 7929
showRankingDetail()                      // line 8019
closeRankingDetail()                     // line 8137

// 格式化
formatRankingValue()                    // line 8162

// 维度卡片
createDimensionCard()                   // line 4766

// 实时榜单
fetchGlobalRankings()                   // line 7226
```

---

### 4. stats-app-realtime.js (~3000行)
**职责**: 实时数据、在线列表、消息通知

**包含函数**:
```javascript
// 实时监听
startRealtimeListener()                 // line 12237
stopRealtimeListener()                  // line 12774

// 在线列表
updateOnlineList()                      // line 13095
renderOnlineUsersListUnavailable()      // line 13112
renderOnlineUsersList()                  // line 13126
toggleUserPopup()                       // line 13230

// 消息系统
closeInboxDrawer()                      // line 13651
openInboxDrawer()                       // line 13655
refreshHasNewMessage()                   // line 13662
updateInboxRedDotFromApi()              // line 13670
loadInbox()                             // line 13691
openBurnReader()                        // line 13762
openMessageSender()                      // line 13574
openMessageInput()                       // line 13800
sendMessage()                           // line 13920

// 通知
showNotification()                      // line 13899
showBurnMsg()                           // line 13990
showMessagePopup()                       // line 14063

// 同步
syncPresenceState()                     // line 12959
```

---

### 5. stats-app-ui.js (~2500行)
**职责**: UI 辅助、动画、语言切换

**包含函数**:
```javascript
// 格式化
formatNumber()                          // line 4553
animateValue()                          // line 4574
safeAnimateValue()                      // line 12136
escapeHtml()                            // line 2815
_escapeHtml()                           // line 19333

// 加载状态
setLoadingState()                       // line 4621
setRightDrawerLoading()                 // line 3815
_renderLoader()                         // line 19314
_showEmpty()                            // line 19326

// 语言
translatePage()                         // line 2819
updateLanguageContext()                  // line 2978
switchLang()                            // line 4635
toggleLangByUSFlag()                    // line 4642

// 头部
syncTopHeaderHeight()                   // line 4647

// 抽屉
toggleDrawer()                          // line 12966
initDrawerState()                       // line 12987

// 认证UI
showSyncingOverlay()                    // line 14162
hideSyncingOverlay()                    // line 14224
showApiStatusWarning()                  // line 16349
```

---

### 6. stats-app-data.js (~2000行)
**职责**: 数据处理、词云、统计

**包含函数**:
```javascript
// 数据源
getLatestGlobalData()                   // line 4883
getFinalStatsSource()                   // line 4918
normalizeStats()                        // line 4936
mergeDeep()                             // line 4895

// 用户数据
buildUserDataFromLocalAnalysis()        // line 16941
getBestUserRecordForStats()             // line 16852
extractDimensionValues()                 // line 18135
findTopDimension()                      // line 18322
renderRankCards()                       // line 18352

// 词云
filterReadableWords()                   // line 19545
applyLogFontSize()                     // line 19602
_buildWordCloudOption()                 // line 19503

// 关键词提取
extractVibeKeywords()                   // line 20813
extractNationalPhrases()                // line 20888
extractRealSentences()                  // line 21016
categorizeKeyword()                     // line 20781

// NLP 辅助
_splitSentencesForBoard()               // line 19361
_hasZh()                               // line 19370
_extractChineseNgrams()                // line 19372
_extractEnglishWordNgrams()             // line 19386
_normForCompare()                       // line 19399
_levenshteinWithin()                    // line 19401
_extractPersonalSentences()             // line 19431
```

---

### 7. stats-app.js (入口文件)
**职责**: 整合所有模块、初始化

**需要做**:
```javascript
// 1. 保留: 匿名自执行函数包装
(function() {
  'use strict';
  
  // 2. 保留: 强制选籍拦截代码 (line 4-37)
  
  // 3. 保留: 事件委托绑定 (line 43-58)
  
  // 4. 替换为: 模块加载
  // 删除所有函数定义，只保留:
  // - window.XXX 暴露 (如 window.updateCountryDashboard)
  // - 初始化调用
  
  // 5. 加载顺序 (通过 stats2.html):
  /*
  <script src="assets/js/stats-libs.min.js" defer></script>
  <script src="assets/js/stats-data-service.js" defer></script>
  <script src="assets/js/stats-constants.js" defer></script>
  <script src="assets/js/stats-ui-renderer.js" defer></script>
  <script src="assets/js/stats-app-core.js" defer></script>    <!-- 新增 -->
  <script src="assets/js/stats-app-map.js" defer></script>      <!-- 新增 -->
  <script src="assets/js/stats-app-ranking.js" defer></script>  <!-- 新增 -->
  <script src="assets/js/stats-app-realtime.js" defer></script> <!-- 新增 -->
  <script src="assets/js/stats-app-ui.js" defer></script>      <!-- 新增 -->
  <script src="assets/js/stats-app-data.js" defer></script>     <!-- 新增 -->
  <script src="assets/js/stats-app.js" defer></script>         <!-- 入口 -->
  <script src="assets/js/stats2.js" defer></script>
  */
})();
```

---

## 执行步骤

### 步骤 1: 备份
```bash
cp stats-app.js "stats-app-$(date +%Y%m%d).js.backup"
```

### 步骤 2: 创建新文件
按上述规范创建 6 个新文件 + 修改入口

### 步骤 3: 更新 HTML 引用
修改 `stats2.html` 中的 script 标签顺序

### 步骤 4: 测试
验证所有功能正常工作

---

## 预期效果

| 指标 | 拆分前 | 拆分后 |
|------|--------|--------|
| 最大单文件 | 21,507 行 | ~6,000 行 |
| 文件数 | 1 | 7 |
| 缓存粒度 | 全部失效 | 按模块缓存 |
| 首屏加载 | 全量 | 核心模块 |

---

## 风险控制

1. **保持向后兼容**: 所有 `window.XXX` 暴露的函数必须在入口文件中重新挂载
2. **依赖顺序**: 确保模块加载顺序正确 (core → map → ranking → realtime → ui → data)
3. **全局变量**: 记录所有全局变量访问，确保拆分后仍可访问
4. **测试充分**: 拆分后必须在浏览器中完整测试所有功能
