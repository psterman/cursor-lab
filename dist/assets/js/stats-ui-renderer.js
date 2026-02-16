/**
 * stats-ui-renderer.js - 渲染与交互层
 * 职责：词云渲染(_renderNationalIdentityCloud/initWordCloud)、评分卡片与 Loading(cloud-loading-hint)、抽屉(toggleDrawer/closeDrawers)
 * 消除 eval5：IIFE 顶部 var _loc = window.location，严禁对 _loc 进行属性赋值
 */
(function() {
    'use strict';
    var _loc = window.location;

    if (typeof window.__drawerExpanded === 'undefined') window.__drawerExpanded = true;
    if (typeof window.__selectedCountry === 'undefined') window.__selectedCountry = null;
    if (typeof window.__cloudRenderToken === 'undefined') window.__cloudRenderToken = 0;

    function _hexToRgba(hex, alpha) {
        var m = (hex || '').replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!m) return 'rgba(107, 114, 128, ' + (alpha != null ? alpha : 0.8) + ')';
        return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + (alpha != null ? alpha : 0.8) + ')';
    }

    /**
     * 用当前级别的灵魂词数据填充右侧抽屉 Top10 列表（清空硬编码，改用 Supabase 动态数据）
     * @param {string} level - Novice | Professional | Architect
     */
    function fillSoulWordsList(level) {
        var ol = document.getElementById('vibe-top10-list');
        var emptyEl = document.getElementById('vibe-top10-empty');
        var metaEl = document.getElementById('vibe-country-top10-meta');
        if (!ol) return;
        var list = (window.__countryKeywordsByLevel && window.__countryKeywordsByLevel[level]) ? window.__countryKeywordsByLevel[level] : [];
        if (!Array.isArray(list)) list = [];
        var items = list.slice(0, 10).map(function(x) {
            var phrase = String(x.phrase || x.word || '').trim();
            var weight = Number(x.weight || x.count || 0) || 0;
            return { phrase: phrase, hit: weight };
        }).filter(function(x) { return x.phrase.length > 0; });
        ol.innerHTML = '';
        if (items.length === 0) {
            if (emptyEl) {
                emptyEl.textContent = '暂无数据（正在收录中...）';
                emptyEl.classList.remove('hidden');
            }
            if (metaEl) metaEl.textContent = '--';
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (metaEl) metaEl.textContent = 'N=' + items.length;
        var escapeHtml = function(s) {
            var div = document.createElement('div');
            div.textContent = s;
            return div.innerHTML;
        };
        ol.innerHTML = items.map(function(it, idx) {
            var rank = idx + 1;
            var name = escapeHtml(it.phrase);
            var count = it.hit;
            var countColor = count >= 30 ? '#00ff41' : count >= 10 ? 'rgba(0,255,65,0.7)' : '#9ca3af';
            return '<li class="flex items-center gap-3 p-2 border-b border-white/5 hover:bg-white/5 transition-colors">' +
                '<div class="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent-terminal)]/20 to-[var(--accent-terminal)]/10 flex items-center justify-center text-[10px] font-bold text-white/70">' + rank + '</div>' +
                '<div class="flex-1 min-w-0"><div class="text-[12px] text-zinc-200 font-mono truncate" title="词汇">' + name + '</div></div>' +
                '<div class="flex-shrink-0 flex items-center gap-1"><span class="text-[10px] text-zinc-500">频次</span><span class="text-[12px] font-bold tabular-nums" style="color:' + countColor + '">' + count + '</span></div></li>';
        }).join('');
    }

    /**
     * 绘制词云：开始时暴力清空画布，再调用 WordCloud；避免与上一次绘制竞态。
     * 若使用 wordcloud2.js，其默认 clearCanvas: true 会在库内清空，此处仍显式 clearRect 确保旧内容被清掉。
     */
    /**
     * 绘制词云：支持 highlightWords 参数高亮当前用户贡献的词（金色 #FFD700）
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {Array} list - 词云数据 [[phrase, weight], ...]
     * @param {string} level - 维度 Novice/Professional/Architect
     * @param {HTMLElement} emptyEl - 空状态提示元素
     * @param {string} baseHex - 基础颜色
     * @param {Object} highlightWords - 需要高亮的词 { phrase: true, ... }
     */
    function drawWordCloud(canvas, list, level, emptyEl, baseHex, highlightWords) {
        if (!canvas || !list || list.length === 0) return;
        var ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        }
        if (typeof WordCloud === 'undefined') {
            if (emptyEl) {
                emptyEl.textContent = '暂无数据（未加载 WordCloud2.js）';
                emptyEl.classList.remove('hidden');
            }
            return;
        }
        var maxW = Math.max.apply(null, list.map(function(item) { return Number(item[1]) || 0; })) || 1;
        var wordToRatio = {};
        list.forEach(function(item) {
            var w = Number(item[1]) || 0;
            wordToRatio[item[0]] = maxW > 0 ? w / maxW : 0.5;
        });
        var hl = highlightWords || {};
        try {
            WordCloud(canvas, {
                list: list,
                clearCanvas: true,
                gridSize: 4,
                weightFactor: function(weight) { return Math.max(12, Math.min(80, 10 + Math.log2((weight || 0) + 1) * 14)); },
                fontFamily: '"Microsoft YaHei", "微软雅黑", SimHei, sans-serif',
                color: function(word) {
                    // 【核心高亮】用户贡献的词使用金色高亮
                    if (hl[word]) return _hexToRgba('#FFD700', 0.95);
                    var ratio = wordToRatio[word] != null ? wordToRatio[word] : 0.5;
                    var alpha = 0.5 + 0.5 * Math.pow(ratio, 0.7);
                    return _hexToRgba(baseHex, alpha);
                },
                rotateRatio: 0.6,
                backgroundColor: 'transparent',
                minSize: 12,
                drawOutOfBound: false,
                shrinkToFit: false,
                ellipticity: 0.8
            });
        } catch (err) {
            console.warn('[WordCloud] 本国词云渲染失败:', err);
            if (emptyEl) {
                emptyEl.textContent = '暂无数据';
                emptyEl.classList.remove('hidden');
            }
        }
    }

    /** 三身份 Canvas 与数据的严格映射：仅通过 level Key 路由，禁止混用维度 */
    var LEVEL_TO_KEY = { Novice: 'Novice', Professional: 'Professional', Architect: 'Architect', Pro: 'Professional', novice: 'Novice', pro: 'Professional', architect: 'Architect' };
    /** Canvas ID 路由：canvas-novice 仅加载新手数据，canvas-pro 仅加载脱发数据，canvas-arch 仅加载霸天数据 */
    var LEVEL_TO_CANVAS_ID = { Novice: 'canvas-novice', Professional: 'canvas-pro', Architect: 'canvas-arch' };

    /**
     * 本国词云：必须接收明确的 level 参数，且仅从 window.__countryKeywordsByLevel[level] 读取数据，禁止混用其他维度。
     * 切换 Tab 时先清空当前 Canvas 及其容器内对应 canvas 内容，再渲染。
     */
    function _renderNationalIdentityCloud(level) {
        if (window.__isCloudLoading) {
            showCloudLoadingHint();
            return;
        }
        var levelKey = LEVEL_TO_KEY[level] || (level === 'Professional' || level === 'Architect' ? level : 'Novice');
        var container = document.getElementById('vibe-cloud50-container');
        var canvasId = LEVEL_TO_CANVAS_ID[levelKey] || 'canvas-novice';
        var canvas = document.getElementById(canvasId);
        if (!canvas) canvas = document.getElementById('national-identity-cloud-canvas');
        if (!container) return;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = canvasId;
            canvas.setAttribute('data-level', levelKey);
            canvas.setAttribute('style', 'display:block;width:100%;height:100%');
            container.appendChild(canvas);
        }
        var allCanvasIds = ['canvas-novice', 'canvas-pro', 'canvas-arch'];
        allCanvasIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.style.display = id === canvasId ? 'block' : 'none';
                el.setAttribute('aria-hidden', id === canvasId ? 'false' : 'true');
                var ctx = el.getContext && el.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, el.width || 0, el.height || 0);
            }
        });
        var ctx0 = canvas.getContext && canvas.getContext('2d');
        if (ctx0) ctx0.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        var empty = document.getElementById('vibe-cloud50-empty');
        var meta = document.getElementById('vibe-cloud50-meta');
        var data = (window.__countryKeywordsByLevel && window.__countryKeywordsByLevel[levelKey]) ? window.__countryKeywordsByLevel[levelKey] : [];
        if (!Array.isArray(data)) data = [];
        if (data.length === 0) {
            var svc = window.StatsDataService;
            if (svc && typeof svc.fetchCountryKeywords === 'function') {
                showCloudLoadingHint();
                if (empty) {
                    empty.textContent = '正在扫描该国开发者指纹...';
                    empty.classList.remove('hidden');
                }
                svc.fetchCountryKeywords().then(function(result) {
                    hideCloudLoadingHint();
                    // 检查获取到的数据是否有效
                    var hasData = result && (
                        (result.Novice && result.Novice.length > 0) ||
                        (result.Professional && result.Professional.length > 0) ||
                        (result.Architect && result.Architect.length > 0) ||
                        (result.globalNative && result.globalNative.length > 0)
                    );
                    if (hasData) {
                        fillSoulWordsList(levelKey);
                        _renderNationalIdentityCloud(level);
                    } else {
                        // 数据为空，可能是 Supabase 未准备好，延迟重试
                        if (empty) {
                            empty.textContent = '正在初始化数据...';
                            empty.classList.remove('hidden');
                        }
                        // 3秒后重试
                        setTimeout(function() {
                            _renderNationalIdentityCloud(level);
                        }, 3000);
                    }
                }).catch(function(err) {
                    hideCloudLoadingHint();
                    console.warn('[StatsUIRenderer] 获取词云数据失败:', err);
                    if (empty) { 
                        empty.textContent = '正在加载数据...'; 
                        empty.classList.remove('hidden'); 
                    }
                    if (meta) meta.textContent = '--';
                    // 出错后5秒重试
                    setTimeout(function() {
                        _renderNationalIdentityCloud(level);
                    }, 5000);
                });
                return;
            }
            if (!window.__isCloudLoading) {
                var ctx = canvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
                if (meta) meta.textContent = '--';
                if (empty) {
                    empty.textContent = '正在初始化...';
                    empty.classList.remove('hidden');
                }
                // 如果 StatsDataService 不可用，延迟重试
                setTimeout(function() {
                    _renderNationalIdentityCloud(level);
                }, 2000);
            }
            return;
        }
        fillSoulWordsList(levelKey);
        if (empty) empty.classList.add('hidden');
        if (meta) meta.textContent = 'N=' + data.length;
        var colorByLevel = { Novice: '#10b981', Professional: '#3b82f6', Architect: '#5b21b6', globalNative: '#8b5cf6', native: '#8b5cf6' };
        var baseHex = colorByLevel[levelKey] || '#5b21b6';
        // 【核心匹配】获取当前用户 fingerprint，用于高亮其贡献的词
        var currentUserFp = '';
        try {
            if (window.StatsDataService && typeof window.StatsDataService.getUserIdAndFingerprint === 'function') {
                currentUserFp = (window.StatsDataService.getUserIdAndFingerprint().fp || '').toString().trim();
            }
            if (!currentUserFp) currentUserFp = (localStorage.getItem('vibe_fp') || localStorage.getItem('user_fingerprint') || window.fpId || '').toString().trim();
        } catch (e) { /* ignore */ }
        var highlightWords = {};
        var list = data.map(function(x) {
            var phrase = String(x.phrase || x.word || '').trim();
            var weight = Number(x.weight || x.count || 0) || 0;
            // 【核心匹配】通过 fingerprint 或 fingerprints 数组匹配当前用户
            var isUserWord = false;
            if (currentUserFp) {
                if (x.fingerprint && String(x.fingerprint).trim() === currentUserFp) {
                    isUserWord = true;
                }
                if (!isUserWord && Array.isArray(x.fingerprints)) {
                    for (var i = 0; i < x.fingerprints.length; i++) {
                        if (String(x.fingerprints[i]).trim() === currentUserFp) {
                            isUserWord = true;
                            break;
                        }
                    }
                }
            }
            if (isUserWord) highlightWords[phrase] = true;
            return [phrase, weight];
        }).filter(function(item) { return item[0].length > 0 && item[1] >= 0; });
        if (list.length === 0) return;
        var width = container.offsetWidth || 0;
        var height = container.offsetHeight || 0;
        if (width <= 0 || height <= 0) {
            container.style.minHeight = container.style.minHeight || '200px';
            requestAnimationFrame(function() {
                var w2 = container.offsetWidth || 0;
                var h2 = container.offsetHeight || 0;
                if ((w2 <= 0 || h2 <= 0) && container.style.minHeight !== '260px') {
                    container.style.minHeight = '260px';
                }
                if (typeof _renderNationalIdentityCloud === 'function') _renderNationalIdentityCloud(level);
            });
            return;
        }
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, width, height);
        drawWordCloud(canvas, list, level, empty, baseHex, highlightWords);
    }

    function showCloudLoadingHint() {
        var el = document.getElementById('cloud-loading-hint');
        if (el) el.classList.remove('hidden');
    }

    function hideCloudLoadingHint() {
        var el = document.getElementById('cloud-loading-hint');
        if (el) el.classList.add('hidden');
    }

    /**
     * 切换 Live Nodes 抽屉展开/折叠
     */
    function toggleDrawer() {
        window.__drawerExpanded = !window.__drawerExpanded;
        var drawer = document.getElementById('live-nodes-drawer');
        if (!drawer) return;
        if (window.__drawerExpanded) {
            drawer.classList.remove('collapsed');
            drawer.classList.add('expanded');
        } else {
            drawer.classList.remove('expanded');
            drawer.classList.add('collapsed');
        }
        try { localStorage.setItem('drawer_expanded', window.__drawerExpanded.toString()); } catch (e) {}
        console.log('[Drawer] 抽屉状态已切换:', window.__drawerExpanded ? '展开' : '折叠');
    }

    /**
     * 关闭左右抽屉并可选清除选中国家
     */
    function closeDrawers(clearSelection) {
        if (clearSelection === undefined) clearSelection = true;
        var leftDrawer = document.getElementById('left-drawer');
        var rightDrawer = document.getElementById('right-drawer');
        if (leftDrawer) {
            leftDrawer.classList.remove('active');
            try { localStorage.setItem('left_drawer_open', 'false'); } catch (e) {}
        }
        if (rightDrawer) {
            rightDrawer.classList.remove('active');
            try { localStorage.setItem('right_drawer_open', 'false'); } catch (e) {}
        }
        if (clearSelection) {
            window.__selectedCountry = null;
            try { localStorage.removeItem('selected_country'); } catch (e) {}
        }
    }

    /**
     * initWordCloud：由主脚本提供 loadWordCloud 时在此做别名挂载
     */
    function initWordCloud() {
        if (typeof window.loadWordCloud === 'function') {
            try { window.loadWordCloud(); } catch (e) { /* ignore */ }
        }
    }

    window.StatsUIRenderer = {
        _renderNationalIdentityCloud: _renderNationalIdentityCloud,
        showCloudLoadingHint: showCloudLoadingHint,
        hideCloudLoadingHint: hideCloudLoadingHint,
        toggleDrawer: toggleDrawer,
        closeDrawers: closeDrawers,
        initWordCloud: initWordCloud
    };

    window._renderNationalIdentityCloud = _renderNationalIdentityCloud;
    window.toggleDrawer = toggleDrawer;
    window.closeDrawers = closeDrawers;
    window.initWordCloud = initWordCloud;
})();
