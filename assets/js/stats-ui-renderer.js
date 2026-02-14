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

    function _hexToRgba(hex, alpha) {
        var m = (hex || '').replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!m) return 'rgba(107, 114, 128, ' + (alpha != null ? alpha : 0.8) + ')';
        return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + (alpha != null ? alpha : 0.8) + ')';
    }

    /**
     * 本国词云三身份 Tab：WordCloud2 渲染
     */
    function _renderNationalIdentityCloud(level) {
        var container = document.getElementById('vibe-cloud50-container');
        var canvas = document.getElementById('national-identity-cloud-canvas');
        if (!container) return;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'national-identity-cloud-canvas';
            canvas.setAttribute('style', 'display:block;width:100%;height:100%');
            container.appendChild(canvas);
        }
        var empty = document.getElementById('vibe-cloud50-empty');
        var meta = document.getElementById('vibe-cloud50-meta');
        var data = window.__countryKeywordsByLevel && Array.isArray(window.__countryKeywordsByLevel[level]) ? window.__countryKeywordsByLevel[level] : [];
        if (data.length === 0) {
            if (canvas.getContext) canvas.getContext('2d').clearRect(0, 0, canvas.width || 0, canvas.height || 0);
            if (meta) meta.textContent = '--';
            if (empty) {
                empty.textContent = '暂无该国词云数据';
                empty.classList.remove('hidden');
            }
            return;
        }
        if (empty) empty.classList.add('hidden');
        if (meta) meta.textContent = 'N=' + data.length;
        var colorByLevel = { Novice: '#10b981', Professional: '#3b82f6', Architect: '#5b21b6', globalNative: '#8b5cf6', native: '#8b5cf6' };
        var baseHex = colorByLevel[level] || '#10b981';
        var maxW = Math.max.apply(null, data.map(function(x) { return Number(x.weight) || 0; })) || 1;
        // WordCloud2.js 要求 list 为二维数组 [['词', 权重], ...]，此处从 [{phrase, weight}] 转换
        var list = data.map(function(x) {
            var phrase = String(x.phrase || x.word || '').trim();
            var weight = Number(x.weight || x.count || 0) || 0;
            return [phrase, weight];
        }).filter(function(item) { return item[0].length > 0 && item[1] > 0; });
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
        if (typeof WordCloud === 'undefined') {
            if (empty) {
                empty.textContent = '暂无该国词云数据（未加载 WordCloud2.js）';
                empty.classList.remove('hidden');
            }
            return;
        }
        try {
            var wordToRatio = {};
            list.forEach(function(item, i) {
                var w = Number(item[1]) || 0;
                wordToRatio[item[0]] = maxW > 0 ? w / maxW : 0.5;
            });
            WordCloud(canvas, {
                list: list,
                gridSize: 4,
                weightFactor: function(weight) { return Math.max(12, Math.min(80, 10 + Math.log2((weight || 0) + 1) * 14)); },
                fontFamily: '"Microsoft YaHei", "微软雅黑", SimHei, sans-serif',
                color: function(word) {
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
            if (empty) {
                empty.textContent = '暂无该国词云数据';
                empty.classList.remove('hidden');
            }
        }
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
