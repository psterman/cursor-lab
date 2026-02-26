/**
 * github-card-renderer.js - GitHub Combat 卡片渲染
 * 将后端 22 项 github_stats 注入左侧抽屉：Header(头像/ID/RANK/组织)、2x3 战力阵列、Language DNA、Status Bar
 * 样式：bg-zinc-900/90、hacker-border(#00ff41)、JetBrains Mono、数值滚动动画、刷新 ANALYZING 状态
 */
(function () {
    'use strict';

    var TERMINAL_GREEN = '#00ff41';
    var TERMINAL_GREEN_RGBA = 'rgba(0, 255, 65, 0.3)';
    var TERMINAL_GREEN_GLOW = 'rgba(0, 255, 65, 0.15)';
    var CARD_BG = 'rgba(24, 24, 27, 0.9)';

    var LANG_COLORS = {
        JavaScript: '#f7df1e',
        TypeScript: '#3178c6',
        Python: '#3572A5',
        Java: '#b07219',
        Go: '#00ADD8',
        Rust: '#dea584',
        Ruby: '#701516',
        PHP: '#4F5D95',
        C: '#555555',
        'C++': '#f34b7d',
        CSharp: '#23920d',
        Kotlin: '#A97BFF',
        Swift: '#F05138',
        Vue: '#41b883',
        HTML: '#e34c26',
        CSS: '#563d7c',
        Shell: '#89e051',
        default: '#8b949e'
    };

    function esc(s) {
        if (s == null) return '';
        var str = String(s);
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getLangColor(name) {
        return LANG_COLORS[name] || LANG_COLORS.default;
    }

    /**
     * 数值从 0 滚动到目标值（easeOutCubic）
     */
    function animateNumber(element, targetValue, duration) {
        duration = duration || 800;
        var start = 0;
        var startTime = null;

        function update(currentTime) {
            if (!startTime) startTime = currentTime;
            var elapsed = currentTime - startTime;
            var progress = Math.min(elapsed / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = Math.floor(start + (targetValue - start) * eased);
            if (element) element.textContent = typeof current.toLocaleString === 'function' ? current.toLocaleString() : String(current);
            if (progress < 1) requestAnimationFrame(update);
        }

        requestAnimationFrame(update);
    }

    /**
     * 刷新按钮状态：loading 时显示 ANALYZING...
     */
    function setRefreshButtonState(btn, isLoading, label) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-pulse">ANALYZING...</span>';
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            btn.disabled = false;
            btn.innerHTML = label || 'REFRESH';
            btn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    /**
     * 骨架屏/加载态：数据同步时在左侧抽屉显示「DNA Scanning...」赛博朋克风格占位符
     * @param {HTMLElement} container - 挂载容器（如 #left-drawer-body）
     * @returns {HTMLElement|null} 卡片根元素
     */
    function renderLoadingState(container) {
        if (!container) return null;
        var card = document.createElement('div');
        card.className = 'drawer-item github-combat-card hacker-border';
        card.setAttribute('data-github-combat', '1');
        card.style.cssText = 'background:' + CARD_BG + ';border-radius:8px;padding:14px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;';
        card.innerHTML = [
            '<style>.github-combat-scan{animation:github-combat-scan 1.5s ease-in-out infinite;}@keyframes github-combat-scan{0%{transform:translateX(-100%);}100%{transform:translateX(400%);}}</style>',
            '<div class="flex flex-col items-center justify-center py-8">',
            '  <div class="animate-pulse text-[#00ff41] text-sm mb-2">&#9889; DNA SCANNING...</div>',
            '  <div class="w-32 h-1 bg-[#00ff41]/20 rounded-full overflow-hidden">',
            '    <div class="github-combat-scan h-full bg-[#00ff41]" style="width:25%;"></div>',
            '  </div>',
            '  <div class="text-[10px] text-zinc-500 mt-3">Analyzing GitHub combat stats...</div>',
            '</div>'
        ].join('');
        var existing = container.querySelector('.github-combat-card');
        if (existing) existing.remove();
        container.appendChild(card);
        return card;
    }

    /**
     * 格式化同步时间
     */
    function formatSyncedAt(isoStr) {
        if (!isoStr) return '--';
        try {
            var d = new Date(isoStr);
            if (isNaN(d.getTime())) return '--';
            var now = new Date();
            var diffMs = now.getTime() - d.getTime();
            if (diffMs < 60000) return 'Just now';
            if (diffMs < 3600000) return Math.floor(diffMs / 60000) + 'm ago';
            if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + 'h ago';
            return d.toLocaleDateString();
        } catch (e) {
            return '--';
        }
    }

    /**
     * 渲染 Language DNA 渐变条：5px 高，按 Top 5 百分比切分，hover 显示语言名；空数据或异常时显示占位文案
     */
    function renderLangDna(languageDistribution) {
        try {
            if (!languageDistribution || !Array.isArray(languageDistribution) || languageDistribution.length === 0) {
                return '<div class="lang-dna-empty text-[10px] text-zinc-500">Waiting for initialization...</div>';
            }
            var parts = [];
            for (var i = 0; i < languageDistribution.length; i++) {
                var item = languageDistribution[i];
                var name = item && (item.name || '');
                var pct = Math.max(0, Math.min(100, Number(item && item.percentage) || 0));
                var color = getLangColor(name);
                parts.push('<span class="lang-dna-segment inline-block h-[5px] align-bottom transition-opacity hover:opacity-100" style="width:' + pct + '%;background:' + color + ';" title="' + esc(name) + ' ' + pct.toFixed(1) + '%"></span>');
            }
            var titleStr = languageDistribution.map(function (x) { return (x && x.name || '') + ' ' + (x && (x.percentage != null) ? Number(x.percentage).toFixed(1) : '0') + '%'; }).join(' | ');
            return '<div class="lang-dna flex w-full overflow-hidden rounded" style="height:5px;min-height:5px;" title="' + esc(titleStr) + '">' + parts.join('') + '</div>';
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) console.error('[GitHubCard] renderLangDna error:', e);
            return '<div class="lang-dna-empty text-[10px] text-zinc-500">Language data unavailable</div>';
        }
    }

    /**
     * 主渲染函数：将 stats 注入到左侧抽屉卡片
     * @param {Object} stats - 后端返回的 github_stats（22 项扁平数据）
     * @param {Object} options - { containerId?: string, container?: HTMLElement, onRefresh?: function(): Promise<{ success, data?, cached? }> }
     * @returns {HTMLElement} 卡片根元素
     */
    function renderGithubCard(stats, options) {
        options = options || {};
        var container = options.container || (options.containerId ? document.getElementById(options.containerId) : null);
        if (!container) {
            if (options.containerId) {
                var containerId = options.containerId;
                var observer = new MutationObserver(function () {
                    var c = document.getElementById(containerId);
                    if (c) {
                        observer.disconnect();
                        var opts = {};
                        for (var k in options) { if (options.hasOwnProperty(k)) opts[k] = options[k]; }
                        opts.container = c;
                        renderGithubCard(stats, opts);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(function () { observer.disconnect(); }, 5000);
            }
            if (typeof console !== 'undefined' && console.warn) console.warn('[GitHubCard] No container, will retry when available');
            return null;
        }

        var onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;

        if (!stats || typeof stats !== 'object') {
            var emptyCard = document.createElement('div');
            emptyCard.className = 'drawer-item github-combat-card hacker-border';
            emptyCard.setAttribute('data-github-combat', '1');
            emptyCard.innerHTML = '<div class="p-4 text-center text-zinc-500 text-sm">Sync to unlock GitHub stats</div>';
            var existing = container.querySelector('.github-combat-card');
            if (existing) existing.remove();
            container.appendChild(emptyCard);
            return emptyCard;
        }

        var login = stats.login || '--';
        var avatarUrl = stats.avatarUrl || '';
        var globalRanking = stats.globalRanking || '--';
        var accountAge = Number(stats.accountAge) || 0;
        var syncedAt = stats.syncedAt || '';
        var orgs = Array.isArray(stats.organizations) ? stats.organizations : [];
        var mergedPRs = Number(stats.mergedPRs) || 0;
        var totalRepoStars = Number(stats.totalRepoStars) || 0;
        var commitVelocity = Number(stats.commitVelocity) || 0;
        var prReviews = Number(stats.prReviews) || 0;
        var activeDays = Number(stats.activeDays) || 0;
        var publicRepos = Number(stats.publicRepos) || 0;
        var privateRepos = Number(stats.privateRepos) || 0;
        var totalRepos = publicRepos + privateRepos;
        var langDist = Array.isArray(stats.languageDistribution) ? stats.languageDistribution : [];

        var card = document.createElement('div');
        card.className = 'drawer-item github-combat-card hacker-border';
        card.setAttribute('data-github-combat', '1');
        card.style.cssText = 'background:' + CARD_BG + ';border-radius:8px;padding:14px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;';

        var orgsHtml = '';
        try {
            if (orgs.length > 0) {
                orgsHtml = '<div class="flex items-center gap-1.5 mt-2 flex-wrap">' + orgs.slice(0, 5).map(function (o) {
                    if (!o || typeof o !== 'object') return '';
                    var url = (o.avatarUrl != null) ? String(o.avatarUrl) : '';
                    var name = (o.name != null) ? String(o.name) : '';
                    return '<img class="org-icon w-6 h-6 rounded-full object-cover" src="' + esc(url) + '" alt="' + esc(name) + '" title="' + esc(name) + '" loading="lazy" style="filter:grayscale(100%);opacity:0.6;transition:filter .2s,opacity .2s;" onmouseover="this.style.filter=\'grayscale(0%)\';this.style.opacity=1" onmouseout="this.style.filter=\'grayscale(100%)\';this.style.opacity=0.6" />';
                }).filter(Boolean).join('') + '</div>';
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) console.error('[GitHubCard] organizations render error:', e);
        }

        card.innerHTML = [
            '<div class="card-header mb-3">',
            '  <div class="flex items-center gap-3">',
            '    <img class="w-10 h-10 rounded-full border border-[#00ff41]/30 object-cover" src="' + esc(avatarUrl) + '" alt="' + esc(login) + '" loading="lazy" />',
            '    <div class="flex-1 min-w-0">',
            '      <div class="text-[#00ff41] font-bold text-sm truncate">' + esc(login) + '</div>',
            '      <div class="text-[10px] text-[#00ff41]/80 uppercase tracking-wider">' + esc(globalRanking) + '</div>',
            '    </div>',
            '  </div>',
            orgsHtml,
            '</div>',
            '<div class="stats-grid grid grid-cols-2 gap-2 mb-3">',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + mergedPRs + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">STRIKE</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalRepoStars + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">INFLUENCE</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + commitVelocity + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">30D VELOCITY</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + prReviews + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">CODE REVIEWS</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + activeDays + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">ANNUAL VITALITY</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalRepos + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">NODES COUNT</div>',
            '  </div>',
            '</div>',
            '<div class="card-footer border-t border-[#00ff41]/20 pt-3 mt-2">',
            '  <div class="mb-2">',
            '    <div class="text-[10px] text-zinc-500 uppercase mb-1">Language DNA</div>',
            '    ' + renderLangDna(langDist),
            '  </div>',
            '  <div class="status-bar flex justify-between text-[10px] text-zinc-500">',
            '    <span>Active for ' + (accountAge > 0 ? accountAge.toLocaleString() : '0') + ' days</span>',
            '    <span>Synced: ' + formatSyncedAt(syncedAt) + '</span>',
            '  </div>',
            '</div>',
            '<div class="flex justify-end mt-3">',
            '<button type="button" class="github-combat-refresh-btn px-3 py-1.5 rounded text-xs font-bold border border-[#00ff41] text-[#00ff41] bg-transparent cursor-pointer hover:bg-[#00ff41]/10 transition-colors" style="font-family:inherit;">REFRESH</button>',
            '</div>'
        ].join('');

        var existing = container.querySelector('.github-combat-card');
        if (existing) existing.remove();
        container.appendChild(card);

        var valueEls = card.querySelectorAll('.stat-value[data-target]');
        var duration = 800;
        var delayStep = 40;
        valueEls.forEach(function (el, idx) {
            var target = parseInt(el.getAttribute('data-target'), 10) || 0;
            setTimeout(function () {
                animateNumber(el, target, duration);
            }, idx * delayStep);
        });

        var refreshBtn = card.querySelector('.github-combat-refresh-btn');
        if (refreshBtn && onRefresh) {
            refreshBtn.addEventListener('click', function () {
                setRefreshButtonState(refreshBtn, true);
                var p = onRefresh();
                if (p && typeof p.then === 'function') {
                    p.then(function (result) {
                        setRefreshButtonState(refreshBtn, false, 'REFRESH');
                        if (result && result.success && result.data) {
                            var parent = card.parentNode;
                            if (parent) {
                                renderGithubCard(result.data, { container: parent, onRefresh: onRefresh });
                            }
                        }
                    }).catch(function () {
                        setRefreshButtonState(refreshBtn, false, 'REFRESH');
                    });
                } else {
                    setRefreshButtonState(refreshBtn, false, 'REFRESH');
                }
            });
        }

        return card;
    }

    window.renderGithubCard = renderGithubCard;
    window.renderGithubCardLoading = renderLoadingState;
})();
