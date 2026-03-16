/**
 * OpenClaw 个人数据监视器
 * 聚合 Local Data (last_analysis_data) 与 Supabase (v_openclaw_stats_latest)，渲染左侧抽屉监视器卡片
 */
(function() {
    'use strict';

    var PERSONAL_CLOUD_STORAGE_KEY = 'last_analysis_data';
    var TOKEN_EVOLUTION_MAX = 500000;
    var OPENCLAW_CARD_TEMPLATE = '' +
        '<div id="openclaw-monitor-card" class="drawer-item openclaw-monitor-card hacker-border" data-card="openclaw-monitor">' +
            '<div class="openclaw-monitor-header">' +
                '<span class="drawer-icon pulse">◉</span>' +
                '<span class="openclaw-monitor-title">OpenClaw 个人数据监视器</span>' +
            '</div>' +
            '<div class="openclaw-monitor-body font-mono text-[11px]">' +
                '<div class="openclaw-row"><span class="label">寿命 (Longevity)</span><span id="oc-longevity">--</span></div>' +
                '<div class="openclaw-row"><span class="label">基因模型 (Genome)</span><span id="oc-genome">--</span></div>' +
                '<div class="openclaw-row"><span class="label">生物能量 (Tokens)</span><span id="oc-tokens">--</span></div>' +
                '<div class="openclaw-row openclaw-row-skills"><span class="label">技能树 (Skills)</span><div id="oc-skills" class="oc-tags"></div></div>' +
                '<div class="openclaw-row"><span class="label">任务状态</span><span id="oc-github-sync">--</span></div>' +
            '</div>' +
        '</div>';
    var openclawDrawerObserver = null;
    var openclawDrawerObserverLock = false;

    function isGuestDrawerMode() {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem('stats2_guest_mode') === '1';
        } catch (_) {
            return false;
        }
    }

    /**
     * 确保左侧抽屉里始终存在 OpenClaw 卡片（某些渲染流程会清空 left-drawer-body）
     */
    function ensureOpenClawMonitorCard() {
        if (isGuestDrawerMode()) return null;
        var leftBody = document.getElementById('left-drawer-body');
        if (!leftBody) return null;

        var mount = document.getElementById('openclaw-monitor-mount');
        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'openclaw-monitor-mount';
        }

        if (!leftBody.contains(mount)) {
            var scroll = document.getElementById('left-drawer-scroll');
            if (scroll && scroll.parentNode === leftBody) leftBody.insertBefore(mount, scroll);
            else leftBody.insertBefore(mount, leftBody.firstChild || null);
        }

        var card = document.getElementById('openclaw-monitor-card');
        if (!card) {
            mount.insertAdjacentHTML('afterbegin', OPENCLAW_CARD_TEMPLATE);
            card = document.getElementById('openclaw-monitor-card');
        } else if (card.parentNode !== mount) {
            mount.appendChild(card);
        }

        if (mount && mount.style) {
            mount.style.display = '';
            mount.style.visibility = 'visible';
            mount.setAttribute('aria-hidden', 'false');
        }
        if (card && card.style) {
            card.style.display = '';
            card.style.visibility = 'visible';
            card.setAttribute('aria-hidden', 'false');
        }
        return { mount: mount, card: card };
    }

    /**
     * 从 localStorage 读取 OpenClaw 相关数据
     */
    function getOpenClawLocalData() {
        try {
            var raw = typeof localStorage !== 'undefined' && localStorage.getItem(PERSONAL_CLOUD_STORAGE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            var hasOpenClaw = !!(parsed.openclawPortrait || (parsed.stats && (parsed.stats.modelUsage || parsed.stats.usage)));
            return hasOpenClaw ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 从 Supabase v_openclaw_stats_latest 获取远程数据
     */
    function getOpenClawSupabaseData(userId, fingerprint) {
        return new Promise(function(resolve) {
            var sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
            if (!sb || !sb.from) {
                resolve(null);
                return;
            }
            var resolveUserId = function(uid) {
                if (!uid) {
                    resolve(null);
                    return;
                }
                sb.from('v_openclaw_stats_latest')
                    .select('*')
                    .eq('user_id', uid)
                    .maybeSingle()
                    .then(function(r) {
                        resolve(r.data || null);
                    })
                    .catch(function() {
                        resolve(null);
                    });
            };
            if (userId) {
                resolveUserId(userId);
                return;
            }
            if (fingerprint) {
                sb.from('user_analysis')
                    .select('id')
                    .eq('fingerprint', fingerprint)
                    .limit(1)
                    .maybeSingle()
                    .then(function(r) {
                        resolveUserId(r.data && r.data.id ? r.data.id : null);
                    })
                    .catch(function() {
                        resolve(null);
                    });
                return;
            }
            resolve(null);
        });
    }

    /**
     * 合并本地与远程数据
     */
    function mergeOpenClawData(local, remote) {
        var merged = {
            longevity: null,
            first_seen: null,
            primary_model: null,
            total_tokens: 0,
            total_messages: 0,
            skills_tags: [],
            last_sync_at: null,
            github_synced_at: null
        };
        var localPortrait = local && local.openclawPortrait;
        var localStats = local && local.stats;
        var localUsage = (localStats && localStats.usage) || {};
        var localModelUsage = (localStats && localStats.modelUsage) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.modelPreference && localPortrait.dimensions.modelPreference.distribution) || {};
        var localTotalTokens = (localUsage && localUsage.totalTokens) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.consumptionCost && localPortrait.dimensions.consumptionCost.totalTokens) || 0;
        var localEarliest = (localStats && localStats.earliestFileTime) || null;
        var localSkills = (localStats && (localStats.skillsByName || localStats.skillsUsage)) || {};
        var remoteTotalTokens = (remote && remote.total_tokens) || 0;
        var remoteModelUsage = (remote && remote.model_usage) || {};
        var remoteSkills = (remote && remote.skills_stats) || {};
        var remoteEarliest = (remote && (remote.first_event_at || remote.analyzed_at)) || null;

        merged.total_tokens = Math.max(Number(localTotalTokens) || 0, Number(remoteTotalTokens) || 0);
        merged.total_messages = (localStats && localStats.totalMessages) || (remote && remote.total_messages) || 0;
        merged.last_sync_at = (remote && remote.analyzed_at) || (window.currentUser && window.currentUser.last_sync_at) || null;
        merged.github_synced_at = (window.currentUser && window.currentUser.github_synced_at) || null;

        var firstSeen = null;
        if (localEarliest && Number(localEarliest) > 0) firstSeen = Number(localEarliest);
        if (remoteEarliest) {
            var re = new Date(remoteEarliest).getTime();
            if (!firstSeen || re < firstSeen) firstSeen = re;
        }
        if (window.currentUser && window.currentUser.created_at) {
            var ca = new Date(window.currentUser.created_at).getTime();
            if (!firstSeen || ca < firstSeen) firstSeen = ca;
        }
        merged.first_seen = firstSeen;
        if (firstSeen) {
            merged.longevity = Math.max(1, Math.floor((Date.now() - firstSeen) / 86400000));
        }

        var modelCounts = {};
        if (localModelUsage && typeof localModelUsage === 'object') {
            if (Array.isArray(localModelUsage)) {
                localModelUsage.forEach(function(x) {
                    var id = x.modelId || x.name || String(x);
                    var c = x.count || 1;
                    modelCounts[id] = (modelCounts[id] || 0) + c;
                });
            } else {
                Object.keys(localModelUsage).forEach(function(k) {
                    modelCounts[k] = (modelCounts[k] || 0) + (Number(localModelUsage[k]) || 0);
                });
            }
        }
        if (remoteModelUsage && typeof remoteModelUsage === 'object') {
            Object.keys(remoteModelUsage).forEach(function(k) {
                modelCounts[k] = (modelCounts[k] || 0) + (Number(remoteModelUsage[k]) || 0);
            });
        }
        var topModel = null;
        var topCount = 0;
        Object.keys(modelCounts).forEach(function(k) {
            if (modelCounts[k] > topCount) {
                topCount = modelCounts[k];
                topModel = k;
            }
        });
        merged.primary_model = topModel || (remote && remote.top_model_id) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.modelPreference && localPortrait.dimensions.modelPreference.dominantModelId) || null;

        var skillsSet = {};
        if (localSkills && typeof localSkills === 'object') {
            Object.keys(localSkills).forEach(function(k) {
                if (k && k.trim()) skillsSet[k.trim()] = true;
            });
        }
        if (remoteSkills && typeof remoteSkills === 'object') {
            Object.keys(remoteSkills).forEach(function(k) {
                if (k && k.trim()) skillsSet[k.trim()] = true;
            });
        }
        merged.skills_tags = Object.keys(skillsSet).slice(0, 12);

        return merged;
    }

    /**
     * 计算 Token 进化进度条宽度 (0-100)
     */
    function tokenEvolutionPercent(tokens) {
        var t = Math.max(0, Number(tokens) || 0);
        if (t <= 0) return 0;
        return Math.min(100, (Math.log10(t + 1) / Math.log10(TOKEN_EVOLUTION_MAX + 1)) * 100);
    }

    /**
     * 渲染 OpenClaw 监视器卡片
     */
    function renderOpenClawMonitorCard(merged) {
        if (isGuestDrawerMode()) return;
        var ensured = ensureOpenClawMonitorCard();
        var mount = ensured && ensured.mount ? ensured.mount : document.getElementById('openclaw-monitor-mount');
        var card = ensured && ensured.card ? ensured.card : (document.getElementById('openclaw-monitor-card') || (mount && mount.querySelector('#openclaw-monitor-card')));
        if (!card) return;
        var longevityEl = document.getElementById('oc-longevity');
        var genomeEl = document.getElementById('oc-genome');
        var tokensEl = document.getElementById('oc-tokens');
        var skillsEl = document.getElementById('oc-skills');
        var syncEl = document.getElementById('oc-github-sync');
        if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) return;

        if (!merged || (merged.total_tokens <= 0 && !merged.longevity && merged.skills_tags.length === 0)) {
            longevityEl.textContent = '--';
            genomeEl.textContent = '--';
            tokensEl.textContent = '--';
            skillsEl.innerHTML = '';
            syncEl.textContent = '--';
            return;
        }

        longevityEl.textContent = merged.longevity != null ? merged.longevity + ' 天' : '--';
        genomeEl.textContent = merged.primary_model || '--';
        var tokVal = merged.total_tokens > 0 ? (merged.total_tokens).toLocaleString() : '--';
        var pct = tokenEvolutionPercent(merged.total_tokens);
        tokensEl.innerHTML = tokVal + ' <div class="oc-token-bar"><div class="oc-token-fill" style="width:' + pct + '%"></div></div>';
        skillsEl.innerHTML = '';
        if (merged.skills_tags && merged.skills_tags.length > 0) {
            merged.skills_tags.forEach(function(tag) {
                var span = document.createElement('span');
                span.className = 'oc-tag';
                span.textContent = tag;
                skillsEl.appendChild(span);
            });
        }
        var syncTs = merged.github_synced_at || merged.last_sync_at;
        var syncText = '--';
        if (syncTs) {
            var syncDate = new Date(syncTs);
            var diffMs = Date.now() - syncDate.getTime();
            var diffH = diffMs / 3600000;
            if (diffH < 24) {
                syncText = '活跃';
            } else {
                syncText = Math.floor(diffH / 24) + ' 天前';
            }
        }
        syncEl.textContent = syncText;
    }

    function installOpenClawDrawerObserver() {
        if (openclawDrawerObserver || typeof MutationObserver === 'undefined') return;
        var leftBody = document.getElementById('left-drawer-body');
        if (!leftBody) return;
        openclawDrawerObserver = new MutationObserver(function() {
            if (openclawDrawerObserverLock) return;
            if (isGuestDrawerMode()) return;
            var hasCard = !!document.getElementById('openclaw-monitor-card');
            var hasMount = !!document.getElementById('openclaw-monitor-mount');
            if (hasCard && hasMount) return;
            openclawDrawerObserverLock = true;
            try {
                ensureOpenClawMonitorCard();
                refreshOpenClawMonitor();
            } finally {
                openclawDrawerObserverLock = false;
            }
        });
        openclawDrawerObserver.observe(leftBody, { childList: true, subtree: true });
    }

    /**
     * 将本地 OpenClaw 数据上报到后端，写入 openclaw_stats 与 user_analysis，打通全球统计
     */
    function syncOpenClawToUserAnalysis(local) {
        if (!local || (!local.openclawPortrait && !(local.stats && (local.stats.modelUsage || local.stats.usage)))) return Promise.resolve();
        var key = 'last_openclaw_sync_ts';
        try {
            var last = parseInt(localStorage.getItem(key) || '0', 10);
            if (Date.now() - last < 5 * 60 * 1000) return Promise.resolve();
        } catch (_) {}
        var portrait = local.openclawPortrait || {};
        var stats = local.stats || {};
        var dims = portrait.dimensions || {};
        var consumption = dims.consumptionCost || {};
        var modelDim = dims.modelPreference || {};
        var health = dims.stabilityHealth || {};
        var hourlyActivity = stats.hourlyActivity || (stats.hourlyHeatmap && Array.isArray(stats.hourlyHeatmap) ? stats.hourlyHeatmap.map(function(h) { return h.count || 0; }) : Array(24).fill(0));
        var hourlyHeatmap = Array.isArray(hourlyActivity) && hourlyActivity.length >= 24
            ? hourlyActivity.map(function(count, hour) { return { hour: hour, count: count }; })
            : Array.from({ length: 24 }, function(_, i) { return { hour: i, count: 0 }; });
        var fingerprint = '';
        try { fingerprint = (localStorage.getItem('user_fingerprint') || window.fpId || '').trim(); } catch (_) {}
        var github_login = '';
        try {
            var token = (window.__VIBE_GITHUB_ACCESS_TOKEN__ || (localStorage && localStorage.getItem('vibe_github_access_token'))) || '';
            if (token && String(token).split('.').length >= 2) {
                var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                var meta = payload.user_metadata || payload.meta || {};
                github_login = meta.user_name || meta.login || meta.preferred_username || meta.full_name || payload.email || '';
            }
        } catch (_) {}
        var body = {
            fingerprint: fingerprint,
            github_login: github_login || null,
            model_usage: stats.modelUsage || {},
            tool_usage: stats.toolUsage || {},
            skills_stats: stats.skillsByName || stats.skillsUsage || {},
            hourly_heatmap: hourlyHeatmap,
            total_tokens: consumption.totalTokens ?? stats.usage?.totalTokens ?? 0,
            prompt_tokens: consumption.promptTokens ?? stats.usage?.promptTokens ?? 0,
            completion_tokens: consumption.completionTokens ?? stats.usage?.completionTokens ?? 0,
            cached_tokens: consumption.cachedTokens ?? stats.usage?.cachedTokens ?? 0,
            total_cost_usd: consumption.totalCostUSD ?? stats.usage?.totalCostUSD ?? 0,
            cache_hit_rate: consumption.cacheHitRate ?? stats.cacheHitRate ?? 0,
            top_model_id: modelDim.dominantModelId || null,
            success_rate: health.successRate ?? stats.successRate ?? 0,
            abnormal_interrupt_rate: health.abnormalInterruptRate ?? stats.abnormalInterruptRate ?? 0,
            success_count: health.successCount ?? stats.successCount ?? 0,
            failure_count: health.failureCount ?? stats.failureCount ?? 0,
            abnormal_interrupt_count: health.abnormalInterruptions ?? stats.abnormalInterruptions ?? 0,
            tool_calls_total: stats.toolCallsTotal ?? 0,
            raw_summary: { dimensions: dims, composite: portrait.composite || {} },
            analyzed_at: new Date().toISOString(),
        };
        var apiEndpoint = '';
        try {
            if (typeof window.getApiEndpoint === 'function') {
                apiEndpoint = (window.getApiEndpoint() || '').trim().replace(/\/+$/, '');
            }
            if (!apiEndpoint && document.querySelector) {
                var meta = document.querySelector('meta[name="api-endpoint"]');
                apiEndpoint = (meta && meta.getAttribute('content')) ? meta.getAttribute('content').trim().replace(/\/+$/, '') : '';
            }
            if (!apiEndpoint) apiEndpoint = 'https://cursor-clinical-analysis.psterman.workers.dev';
        } catch (_) {}
        var url = apiEndpoint ? (apiEndpoint + '/api/v2/openclaw/analyze') : '/api/v2/openclaw/analyze';
        var headers = { 'Content-Type': 'application/json' };
        try {
            var t = (window.__VIBE_GITHUB_ACCESS_TOKEN__ || (localStorage && localStorage.getItem('vibe_github_access_token'))) || '';
            if (t && String(t).trim()) headers['Authorization'] = 'Bearer ' + String(t).trim();
        } catch (_) {}
        return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
            .then(function(res) {
                if (res.ok) {
                    try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
                }
                return res;
            })
            .catch(function() {});
    }

    /**
     * 刷新监视器：聚合数据并渲染，有本地数据时尝试上报后端
     */
    function refreshOpenClawMonitor() {
        var local = getOpenClawLocalData();
        var userId = (window.currentUser && window.currentUser.id) || (window.currentUserData && window.currentUserData.id) || (window.supabaseAuthUser && window.supabaseAuthUser.id) || '';
        var fingerprint = '';
        try {
            fingerprint = (localStorage.getItem('user_fingerprint') || window.fpId || '').trim();
        } catch (_) {}
        if (local) {
            syncOpenClawToUserAnalysis(local).then(function() {
                getOpenClawSupabaseData(userId, fingerprint).then(function(remote) {
                    var merged = mergeOpenClawData(local, remote);
                    renderOpenClawMonitorCard(merged);
                }).catch(function() {
                    renderOpenClawMonitorCard(mergeOpenClawData(local, null));
                });
            }).catch(function() {
                getOpenClawSupabaseData(userId, fingerprint).then(function(remote) {
                    var merged = mergeOpenClawData(local, remote);
                    renderOpenClawMonitorCard(merged);
                }).catch(function() {
                    renderOpenClawMonitorCard(mergeOpenClawData(local, null));
                });
            });
        } else {
            getOpenClawSupabaseData(userId, fingerprint).then(function(remote) {
                var merged = mergeOpenClawData(null, remote);
                renderOpenClawMonitorCard(merged);
            }).catch(function() {
                renderOpenClawMonitorCard(mergeOpenClawData(null, null));
            });
        }
    }

    window.getOpenClawLocalData = getOpenClawLocalData;
    window.getOpenClawSupabaseData = getOpenClawSupabaseData;
    window.mergeOpenClawData = mergeOpenClawData;
    window.renderOpenClawMonitorCard = renderOpenClawMonitorCard;
    window.refreshOpenClawMonitor = refreshOpenClawMonitor;
    window.syncOpenClawToUserAnalysis = syncOpenClawToUserAnalysis;

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', function(e) {
            if (e.key === PERSONAL_CLOUD_STORAGE_KEY || e.key === 'cursor_clinical_history') {
                refreshOpenClawMonitor();
            }
        });
        var openclawInitDone = false;
        function runOpenClawInit() {
            if (openclawInitDone) return;
            openclawInitDone = true;
            setTimeout(function() {
                ensureOpenClawMonitorCard();
                installOpenClawDrawerObserver();
                refreshOpenClawMonitor();
            }, 400);
        }
        window.addEventListener('DOMContentLoaded', runOpenClawInit);
        if (document.readyState === 'complete') runOpenClawInit();
        else window.addEventListener('load', runOpenClawInit);
    }
})();
