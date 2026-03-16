/**
 * OpenClaw 个人数据监视器
 * 聚合 Local Data (last_analysis_data) 与 Supabase (v_openclaw_stats_latest)，渲染左侧抽屉监视器卡片
 */
(function() {
    'use strict';

    var PERSONAL_CLOUD_STORAGE_KEY = 'last_analysis_data';
    var TOKEN_EVOLUTION_MAX = 500000;
    var GATEWAY_CHANNEL_CACHE_KEY = 'openclaw_channel_status_cache_v1';
    var GATEWAY_CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;
    var OPENCLAW_CARD_TEMPLATE = '' +
        '<div id="openclaw-monitor-card" class="drawer-item openclaw-monitor-card hacker-border" data-card="openclaw-monitor">' +
            '<div class="openclaw-monitor-header">' +
                '<span class="drawer-icon pulse" style="color:#ff4d4f;text-shadow:0 0 10px rgba(255,77,79,0.75);">🦞</span>' +
                '<span class="openclaw-monitor-title">OpenClaw 个人数据监视器</span>' +
            '</div>' +
            '<div class="openclaw-monitor-body font-mono text-[11px]">' +
                '<div class="openclaw-row"><span class="label">寿命 (Longevity)</span><span id="oc-longevity">--</span></div>' +
                '<div class="openclaw-row"><span class="label">基因模型 (Genome)</span><span id="oc-genome">--</span></div>' +
                '<div class="openclaw-row"><span class="label">生物能量 (Tokens)</span><span id="oc-tokens">--</span></div>' +
                '<div class="openclaw-row"><span class="label">已开通频道</span><div id="oc-channels" class="oc-channel-icons" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">--</div></div>' +
                '<div class="openclaw-row openclaw-row-skills"><span class="label">已安装 Skills</span><div id="oc-skills" class="oc-tags"></div></div>' +
                '<div class="openclaw-row"><span class="label">任务状态</span><span id="oc-github-sync">--</span></div>' +
            '</div>' +
        '</div>';
    var openclawDrawerObserver = null;
    var openclawDrawerObserverLock = false;
    var openclawGatewayChannelCache = null;
    var CHANNEL_ICON_META = [
        { id: 'telegram', label: 'Telegram', domain: 'telegram.org', keywords: ['telegram', 'tg'] },
        { id: 'feishu', label: 'Feishu', domain: 'feishu.cn', keywords: ['feishu', 'lark', '飞书'] },
        { id: 'discord', label: 'Discord', domain: 'discord.com', keywords: ['discord'] },
        { id: 'imessage', label: 'iMessage', domain: 'apple.com', keywords: ['imessage', 'i-message', 'messages'] }
    ];

    function isGuestDrawerMode() {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem('stats2_guest_mode') === '1';
        } catch (_) {
            return false;
        }
    }

    function toStringList(input) {
        var out = [];
        if (input == null) return out;
        if (Array.isArray(input)) {
            input.forEach(function(item) {
                out = out.concat(toStringList(item));
            });
            return out;
        }
        if (typeof input === 'string') {
            input
                .split(/[,\n|/]/)
                .map(function(s) { return String(s || '').trim(); })
                .filter(Boolean)
                .forEach(function(s) { out.push(s); });
            return out;
        }
        if (typeof input === 'object') {
            Object.keys(input).forEach(function(k) {
                if (k && k.trim()) out.push(k.trim());
            });
            return out;
        }
        return out;
    }

    function addStringsToSet(set, value) {
        toStringList(value).forEach(function(item) {
            var clean = String(item || '').trim();
            if (clean) set.add(clean);
        });
    }

    function getNestedValue(obj, path) {
        if (!obj || !path) return null;
        var cur = obj;
        var segs = String(path).split('.');
        for (var i = 0; i < segs.length; i++) {
            if (cur == null || typeof cur !== 'object') return null;
            cur = cur[segs[i]];
        }
        return cur;
    }

    function addSkillNamesFromArray(set, arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(item) {
            if (typeof item === 'string') {
                var s = item.trim();
                if (s) set.add(s);
                return;
            }
            if (!item || typeof item !== 'object') return;
            var name = item.skillName || item.name || item.id || item.path || item.key || '';
            var clean = String(name || '').trim();
            if (clean) set.add(clean);
        });
    }

    function resolveChannelIcons(channelValues) {
        var flat = toStringList(channelValues)
            .map(function(x) { return String(x || '').toLowerCase(); })
            .join(' | ');
        if (!flat) return [];
        return CHANNEL_ICON_META.filter(function(meta) {
            return meta.keywords.some(function(keyword) { return flat.indexOf(keyword) !== -1; });
        });
    }

    function parseGatewayChannels(payload) {
        if (!payload || typeof payload !== 'object') return [];
        var channels = payload.channels && typeof payload.channels === 'object' ? payload.channels : {};
        var enabledSet = new Set();
        Object.keys(channels).forEach(function(id) {
            var item = channels[id] || {};
            if (item.configured === true || item.running === true) enabledSet.add(String(id).toLowerCase());
        });
        if (Array.isArray(payload.channelOrder)) {
            payload.channelOrder.forEach(function(id) {
                var key = String(id || '').toLowerCase();
                var item = channels[id] || channels[key] || null;
                if (item && (item.configured === true || item.running === true)) enabledSet.add(key);
            });
        }
        return CHANNEL_ICON_META.filter(function(meta) { return enabledSet.has(meta.id); });
    }

    function getGatewayToken() {
        try {
            var keys = ['openclaw_gatewayToken', 'openclaw_token', 'maca_token'];
            for (var i = 0; i < keys.length; i++) {
                var val = (typeof localStorage !== 'undefined' && localStorage.getItem(keys[i])) || '';
                if (val && String(val).trim()) return String(val).trim();
            }
        } catch (_) {}
        return '';
    }

    function readGatewayChannelCache() {
        try {
            if (openclawGatewayChannelCache && Date.now() - openclawGatewayChannelCache.ts < GATEWAY_CHANNEL_CACHE_TTL_MS) {
                return openclawGatewayChannelCache.icons || [];
            }
            var raw = typeof localStorage !== 'undefined' && localStorage.getItem(GATEWAY_CHANNEL_CACHE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return [];
            if (Date.now() - Number(parsed.ts || 0) >= GATEWAY_CHANNEL_CACHE_TTL_MS) return [];
            var icons = Array.isArray(parsed.icons) ? parsed.icons : [];
            openclawGatewayChannelCache = { icons: icons, ts: Number(parsed.ts || 0) };
            return icons;
        } catch (_) {
            return [];
        }
    }

    function writeGatewayChannelCache(icons) {
        try {
            var payload = { icons: Array.isArray(icons) ? icons : [], ts: Date.now() };
            openclawGatewayChannelCache = payload;
            if (typeof localStorage !== 'undefined') localStorage.setItem(GATEWAY_CHANNEL_CACHE_KEY, JSON.stringify(payload));
        } catch (_) {}
    }

    function parseGatewayPayloadToIcons(payload) {
        if (!payload || typeof payload !== 'object') return [];
        var direct = parseGatewayChannels(payload);
        if (direct.length > 0) return direct;
        if (payload.payload && typeof payload.payload === 'object') {
            var fromPayload = parseGatewayChannels(payload.payload);
            if (fromPayload.length > 0) return fromPayload;
        }
        if (payload.data && typeof payload.data === 'object') {
            var fromData = parseGatewayChannels(payload.data);
            if (fromData.length > 0) return fromData;
        }
        return [];
    }

    function fetchGatewayConfiguredChannelIconsViaHttp(token) {
        return new Promise(function(resolve) {
            if (typeof fetch !== 'function') {
                resolve([]);
                return;
            }

            var urls = [
                'http://127.0.0.1:18789/api/channels/status',
                'http://127.0.0.1:18789/api/channels'
            ];

            var headers = {};
            if (token) headers.Authorization = 'Bearer ' + token;

            var tryIndex = 0;
            var tryNext = function() {
                if (tryIndex >= urls.length) {
                    resolve([]);
                    return;
                }
                var url = urls[tryIndex++];
                fetch(url, {
                    method: 'GET',
                    headers: headers,
                    credentials: 'include',
                    mode: 'cors'
                }).then(function(resp) {
                    if (!resp || !resp.ok) {
                        tryNext();
                        return;
                    }
                    return resp.json().then(function(json) {
                        var icons = parseGatewayPayloadToIcons(json);
                        if (icons.length > 0) resolve(icons);
                        else tryNext();
                    }).catch(function() {
                        tryNext();
                    });
                }).catch(function() {
                    tryNext();
                });
            };

            tryNext();
        });
    }

    function fetchGatewayConfiguredChannelIcons() {
        return new Promise(function(resolve) {
            var cached = readGatewayChannelCache();
            if (cached.length > 0) {
                resolve(cached);
                return;
            }
            var token = getGatewayToken();
            fetchGatewayConfiguredChannelIconsViaHttp(token).then(function(httpIcons) {
                if (Array.isArray(httpIcons) && httpIcons.length > 0) {
                    writeGatewayChannelCache(httpIcons);
                    resolve(httpIcons);
                    return;
                }
                if (typeof WebSocket === 'undefined' || !token) {
                    resolve([]);
                    return;
                }

                var ws = null;
                var done = false;
                var connectSeq = 1;
                var timeout = null;
                var rpcId = 'rpc-openclaw-channel-status';
                var connectSent = false;
                var wsUrl = 'ws://127.0.0.1:18789?token=' + encodeURIComponent(token);

                var finish = function(icons) {
                    if (done) return;
                    done = true;
                    try { if (timeout) clearTimeout(timeout); } catch (_) {}
                    try { if (ws && ws.readyState === 1) ws.close(); } catch (_) {}
                    resolve(Array.isArray(icons) ? icons : []);
                };

                var send = function(payload) {
                    try {
                        if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
                    } catch (_) {}
                };

                var sendConnect = function() {
                    connectSent = true;
                    send({
                        type: 'req',
                        id: 'connect-' + String(connectSeq++),
                        method: 'connect',
                        params: {
                            minProtocol: 3,
                            maxProtocol: 3,
                            client: {
                                id: 'webchat',
                                version: 'dev',
                                platform: 'stats2',
                                mode: 'webchat',
                                instanceId: 'stats2-openclaw-monitor'
                            },
                            role: 'operator',
                            scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
                            caps: [],
                            userAgent: 'stats2-openclaw-monitor',
                            locale: 'zh-CN',
                            auth: { token: token }
                        }
                    });
                };

                try {
                    ws = new WebSocket(wsUrl);
                } catch (_) {
                    finish([]);
                    return;
                }

                timeout = setTimeout(function() { finish([]); }, 3500);

                ws.onopen = function() { sendConnect(); };
                ws.onerror = function() { finish([]); };
                ws.onclose = function() { if (!done) finish([]); };
                ws.onmessage = function(evt) {
                    var msg = null;
                    try { msg = JSON.parse(String(evt.data || '')); } catch (_) { return; }
                    var event = msg.event || msg.type || msg.method || '';
                    if (event === 'connect.challenge') {
                        sendConnect();
                        return;
                    }
                    if (typeof msg.id === 'string' && msg.id.indexOf('connect-') === 0) {
                        if (msg.ok === true || msg.result != null || (msg.payload && msg.payload.type === 'hello-ok')) {
                            send({ type: 'req', id: rpcId, method: 'channels.status', params: {} });
                        } else {
                            finish([]);
                        }
                        return;
                    }
                    if (msg.id === rpcId) {
                        if (msg.ok === true && msg.payload && typeof msg.payload === 'object') {
                            var icons = parseGatewayChannels(msg.payload);
                            writeGatewayChannelCache(icons);
                            finish(icons);
                        } else {
                            finish([]);
                        }
                        return;
                    }
                    if (!connectSent && (event === 'hello-ok' || (msg.ok === true && msg.payload))) {
                        send({ type: 'req', id: rpcId, method: 'channels.status', params: {} });
                    }
                };
            }).catch(function() {
                resolve([]);
            });
        });
    }

    function mergeChannelMetaLists(primary, secondary) {
        var seen = new Set();
        var merged = [];
        [primary, secondary].forEach(function(list) {
            if (!Array.isArray(list)) return;
            list.forEach(function(item) {
                if (!item || !item.id) return;
                if (seen.has(item.id)) return;
                seen.add(item.id);
                merged.push(item);
            });
        });
        return merged;
    }

    function inferChannelIconsFromSkills(skills) {
        var flat = toStringList(skills)
            .map(function(x) { return String(x || '').toLowerCase(); })
            .join(' | ');
        if (!flat) return [];
        var inferred = [];
        if (/(^|[^a-z])(feishu|lark)([^a-z]|$)|feishu[-_]|lark[-_]/i.test(flat)) {
            inferred.push(CHANNEL_ICON_META.find(function(x) { return x.id === 'feishu'; }));
        }
        if (/(^|[^a-z])(telegram)([^a-z]|$)|telegram[-_]/i.test(flat)) {
            inferred.push(CHANNEL_ICON_META.find(function(x) { return x.id === 'telegram'; }));
        }
        return inferred.filter(Boolean);
    }

    function inferConfiguredChannelIconsFromFlags(sources) {
        if (!Array.isArray(sources)) return [];
        var enabled = new Set();
        var addIfTrue = function(source, path, id) {
            var value = getNestedValue(source, path);
            if (value === true) enabled.add(id);
        };
        var addIfString = function(source, path, id) {
            var value = getNestedValue(source, path);
            if (typeof value === 'string' && value.trim()) enabled.add(id);
        };
        sources.forEach(function(source) {
            if (!source || typeof source !== 'object') return;
            addIfTrue(source, 'channels.telegram.enabled', 'telegram');
            addIfTrue(source, 'plugins.entries.telegram.enabled', 'telegram');
            addIfTrue(source, 'openclawChannelStatus.channels.telegram.configured', 'telegram');
            addIfTrue(source, 'openclawChannelStatus.channels.telegram.running', 'telegram');

            addIfTrue(source, 'channels.feishu.enabled', 'feishu');
            addIfString(source, 'channels.feishu.appId', 'feishu');
            addIfTrue(source, 'plugins.entries.feishu.enabled', 'feishu');
            addIfTrue(source, 'openclawChannelStatus.channels.feishu.configured', 'feishu');
            addIfTrue(source, 'openclawChannelStatus.channels.feishu.running', 'feishu');

            addIfTrue(source, 'channels.discord.enabled', 'discord');
            addIfTrue(source, 'plugins.entries.discord.enabled', 'discord');
            addIfTrue(source, 'openclawChannelStatus.channels.discord.configured', 'discord');
            addIfTrue(source, 'openclawChannelStatus.channels.discord.running', 'discord');

            addIfTrue(source, 'channels.imessage.enabled', 'imessage');
            addIfTrue(source, 'plugins.entries.imessage.enabled', 'imessage');
            addIfTrue(source, 'openclawChannelStatus.channels.imessage.configured', 'imessage');
            addIfTrue(source, 'openclawChannelStatus.channels.imessage.running', 'imessage');
        });
        return CHANNEL_ICON_META.filter(function(meta) { return enabled.has(meta.id); });
    }

    function renderChannelIcons(container, channels) {
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(channels) || channels.length === 0) {
            container.textContent = '--';
            return;
        }
        channels.forEach(function(meta) {
            var badge = document.createElement('span');
            badge.className = 'oc-channel-badge';
            badge.style.display = 'inline-flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.width = '18px';
            badge.style.height = '18px';
            badge.style.border = '1px solid rgba(255,255,255,0.18)';
            badge.style.background = 'rgba(0,0,0,0.25)';
            badge.style.borderRadius = '4px';
            badge.title = meta.label;

            var img = document.createElement('img');
            img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(meta.domain) + '&sz=32';
            img.alt = meta.label;
            img.width = 14;
            img.height = 14;
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.onerror = function() {
                if (!img.dataset.retry) {
                    img.dataset.retry = '1';
                    img.src = 'https://www.google.com/s2/favicons?domain_url=' + encodeURIComponent('https://' + meta.domain) + '&sz=32';
                    return;
                }
                badge.textContent = meta.label.charAt(0).toUpperCase();
                badge.style.color = '#9ca3af';
                badge.style.fontSize = '10px';
                badge.style.fontWeight = '700';
            };

            badge.appendChild(img);
            container.appendChild(badge);
        });
    }

    function renderSkillTags(container, skills) {
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(skills) || skills.length === 0) {
            container.textContent = '--';
            return;
        }
        skills.slice(0, 16).forEach(function(tag) {
            var clean = String(tag || '').trim();
            if (!clean) return;
            var span = document.createElement('span');
            span.className = 'oc-tag';
            span.textContent = clean;
            container.appendChild(span);
        });
    }

    function ensureOpenClawCardEnhancements(card) {
        if (!card) return;
        var icon = card.querySelector('.openclaw-monitor-header .drawer-icon');
        if (icon) {
            icon.textContent = '🦞';
            icon.style.color = '#ff4d4f';
            icon.style.textShadow = '0 0 10px rgba(255,77,79,0.75)';
        }
        var body = card.querySelector('.openclaw-monitor-body');
        if (!body) return;

        var skillsEl = card.querySelector('#oc-skills');
        var skillsRow = skillsEl && skillsEl.closest ? skillsEl.closest('.openclaw-row') : null;
        if (skillsRow) {
            var skillsLabel = skillsRow.querySelector('.label');
            if (skillsLabel) skillsLabel.textContent = '已安装 Skills';
        }

        var channelsEl = card.querySelector('#oc-channels');
        if (!channelsEl) {
            var row = document.createElement('div');
            row.className = 'openclaw-row';
            row.innerHTML = '<span class="label">已开通频道</span><div id="oc-channels" class="oc-channel-icons" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">--</div>';
            if (skillsRow && skillsRow.parentNode === body) body.insertBefore(row, skillsRow);
            else body.appendChild(row);
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
        ensureOpenClawCardEnhancements(card);

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
            var parsed = null;
            var parsedSession = null;
            var parsedHistory = null;
            var raw = typeof localStorage !== 'undefined' && localStorage.getItem(PERSONAL_CLOUD_STORAGE_KEY);
            if (raw) {
                try { parsed = JSON.parse(raw); } catch (_) {}
            }
            var rawSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('openclaw_analysis_data');
            if (rawSession) {
                try { parsedSession = JSON.parse(rawSession); } catch (_) {}
            }
            var rawHistory = typeof localStorage !== 'undefined' && localStorage.getItem('cursor_clinical_history');
            if (rawHistory) {
                try {
                    var historyObj = JSON.parse(rawHistory);
                    parsedHistory = (historyObj && historyObj.analysisData) ? historyObj.analysisData : historyObj;
                } catch (_) {}
            }
            if (
                (!parsed || typeof parsed !== 'object') &&
                (!parsedSession || typeof parsedSession !== 'object') &&
                (!parsedHistory || typeof parsedHistory !== 'object')
            ) return null;
            if (!parsed || typeof parsed !== 'object') parsed = {};
            if (!parsedSession || typeof parsedSession !== 'object') parsedSession = {};
            if (!parsedHistory || typeof parsedHistory !== 'object') parsedHistory = {};
            var merged = {
                ...parsedHistory,
                ...parsedSession,
                ...parsed,
                stats: {
                    ...(parsedHistory.stats || {}),
                    ...(parsedSession.stats || {}),
                    ...(parsed.stats || {})
                }
            };
            if (!merged.openclawPortrait && parsedHistory.openclawPortrait) merged.openclawPortrait = parsedHistory.openclawPortrait;
            if (!merged.openclawPortrait && parsedSession.openclawPortrait) merged.openclawPortrait = parsedSession.openclawPortrait;
            if (!merged.openclawSessionsSummary && parsedHistory.openclawSessionsSummary) merged.openclawSessionsSummary = parsedHistory.openclawSessionsSummary;
            if (!merged.openclawSessionsSummary && parsedSession.openclawSessionsSummary) merged.openclawSessionsSummary = parsedSession.openclawSessionsSummary;
            var hasOpenClaw = !!(
                merged.openclawPortrait ||
                merged.openclawSessionsSummary ||
                (merged.stats && (merged.stats.modelUsage || merged.stats.usage || merged.stats.skillsByName || merged.stats.skillsUsage))
            );
            return hasOpenClaw ? merged : null;
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
            installed_skills: [],
            active_channels: [],
            last_sync_at: null,
            github_synced_at: null
        };
        var localPortrait = local && local.openclawPortrait;
        var localStats = local && local.stats;
        var localSummary = local && (local.openclawSessionsSummary || local.sessionsSummary);
        var localUsage = (localStats && localStats.usage) || {};
        var localModelUsage = (localStats && localStats.modelUsage) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.modelPreference && localPortrait.dimensions.modelPreference.distribution) || {};
        var localTotalTokens = (localUsage && localUsage.totalTokens) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.consumptionCost && localPortrait.dimensions.consumptionCost.totalTokens) || 0;
        var localEarliest = (localStats && localStats.earliestFileTime) || null;
        var localSkills = (localStats && (localStats.skillsByName || localStats.skillsUsage)) || {};
        var remoteTotalTokens = (remote && remote.total_tokens) || 0;
        var remoteModelUsage = (remote && remote.model_usage) || {};
        var remoteSkills = (remote && remote.skills_stats) || {};
        var remoteRawSummary = (remote && remote.raw_summary) || {};
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

        var installedSkillsSet = new Set();
        addStringsToSet(installedSkillsSet, localStats && localStats.skills);
        addStringsToSet(installedSkillsSet, localSummary && localSummary.skills);
        addStringsToSet(installedSkillsSet, localStats && localStats.skillsByName);
        addStringsToSet(installedSkillsSet, localStats && localStats.skillsUsage);
        addStringsToSet(installedSkillsSet, remote && remote.skills_tags);
        addStringsToSet(installedSkillsSet, remoteSkills);
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.taskHabit.topSkills'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.toolSkillHeat.skillHeat'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.toolSkillHeat.topTools'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(remoteRawSummary, 'sessions.skills'));
        merged.installed_skills = Array.from(installedSkillsSet).slice(0, 24);
        if (merged.skills_tags.length === 0 && merged.installed_skills.length > 0) {
            merged.skills_tags = merged.installed_skills.slice(0, 12);
        }

        var channelSet = new Set();
        addStringsToSet(channelSet, localStats && getNestedValue(localStats, 'channel.lastChannel'));
        addStringsToSet(channelSet, localStats && getNestedValue(localStats, 'channel.originProvider'));
        addStringsToSet(channelSet, localStats && getNestedValue(localStats, 'channel.originSurface'));
        addStringsToSet(channelSet, localStats && getNestedValue(localStats, 'channel.deliveryChannel'));
        addStringsToSet(channelSet, localStats && getNestedValue(localStats, 'channel.routeHints'));
        addStringsToSet(channelSet, localSummary && getNestedValue(localSummary, 'channel.lastChannel'));
        addStringsToSet(channelSet, localSummary && getNestedValue(localSummary, 'channel.originProvider'));
        addStringsToSet(channelSet, localSummary && getNestedValue(localSummary, 'channel.originSurface'));
        addStringsToSet(channelSet, localSummary && getNestedValue(localSummary, 'channel.deliveryChannel'));
        addStringsToSet(channelSet, localSummary && getNestedValue(localSummary, 'channel.routeHints'));
        addStringsToSet(channelSet, localSummary && localSummary.lastChannel);
        addStringsToSet(channelSet, localSummary && localSummary.originProvider);
        addStringsToSet(channelSet, localSummary && localSummary.originSurface);
        addStringsToSet(channelSet, localSummary && localSummary.deliveryChannel);
        addStringsToSet(channelSet, localSummary && localSummary.routeHints);
        addStringsToSet(channelSet, localSummary && localSummary.deliveryContext && localSummary.deliveryContext.channel);
        addStringsToSet(channelSet, localSummary && localSummary.deliveryContext && localSummary.deliveryContext.to);
        addStringsToSet(channelSet, localSummary && localSummary.lastTo);
        addStringsToSet(channelSet, localSummary && localSummary.origin && localSummary.origin.to);
        addStringsToSet(channelSet, localSummary && localSummary.origin && localSummary.origin.from);
        addStringsToSet(channelSet, localSummary && localSummary.origin && localSummary.origin.label);
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.channel.lastChannel'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.channel.originProvider'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.channel.originSurface'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.channel.deliveryChannel'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.channel.routeHints'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.deliveryContext.channel'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.deliveryContext.to'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.origin.to'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.origin.from'));
        addStringsToSet(channelSet, getNestedValue(remoteRawSummary, 'sessions.origin.label'));
        addStringsToSet(channelSet, remote && remote.last_channel);
        var byChannelFields = resolveChannelIcons(Array.from(channelSet));
        var bySkillsInference = inferChannelIconsFromSkills(merged.installed_skills.concat(merged.skills_tags || []));
        var byConfiguredFlags = inferConfiguredChannelIconsFromFlags([
            local,
            localSummary,
            localStats,
            localPortrait,
            remote,
            remoteRawSummary
        ]);
        merged.active_channels = mergeChannelMetaLists(
            mergeChannelMetaLists(byChannelFields, byConfiguredFlags),
            bySkillsInference
        );

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
        var channelsEl = document.getElementById('oc-channels');
        var skillsEl = document.getElementById('oc-skills');
        var syncEl = document.getElementById('oc-github-sync');
        if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) return;

        if (!merged || (merged.total_tokens <= 0 && !merged.longevity && merged.skills_tags.length === 0)) {
            longevityEl.textContent = '--';
            genomeEl.textContent = '--';
            tokensEl.textContent = '--';
            if (channelsEl) channelsEl.textContent = '--';
            skillsEl.textContent = '--';
            syncEl.textContent = '--';
            return;
        }

        longevityEl.textContent = merged.longevity != null ? merged.longevity + ' 天' : '--';
        genomeEl.textContent = merged.primary_model || '--';
        var tokVal = merged.total_tokens > 0 ? (merged.total_tokens).toLocaleString() : '--';
        var pct = tokenEvolutionPercent(merged.total_tokens);
        tokensEl.innerHTML = tokVal + ' <div class="oc-token-bar"><div class="oc-token-fill" style="width:' + pct + '%"></div></div>';
        renderChannelIcons(channelsEl, merged.active_channels);
        renderSkillTags(skillsEl, merged.installed_skills && merged.installed_skills.length > 0 ? merged.installed_skills : merged.skills_tags);
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
        var renderWithGatewayChannels = function(merged) {
            fetchGatewayConfiguredChannelIcons().then(function(gatewayIcons) {
                if (Array.isArray(gatewayIcons) && gatewayIcons.length > 0) {
                    merged.active_channels = mergeChannelMetaLists(gatewayIcons, merged.active_channels || []);
                }
                renderOpenClawMonitorCard(merged);
            }).catch(function() {
                renderOpenClawMonitorCard(merged);
            });
        };
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
                    renderWithGatewayChannels(merged);
                }).catch(function() {
                    renderWithGatewayChannels(mergeOpenClawData(local, null));
                });
            }).catch(function() {
                getOpenClawSupabaseData(userId, fingerprint).then(function(remote) {
                    var merged = mergeOpenClawData(local, remote);
                    renderWithGatewayChannels(merged);
                }).catch(function() {
                    renderWithGatewayChannels(mergeOpenClawData(local, null));
                });
            });
        } else {
            getOpenClawSupabaseData(userId, fingerprint).then(function(remote) {
                var merged = mergeOpenClawData(null, remote);
                renderWithGatewayChannels(merged);
            }).catch(function() {
                renderWithGatewayChannels(mergeOpenClawData(null, null));
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
