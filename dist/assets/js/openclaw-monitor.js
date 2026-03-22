/**
 * OpenClaw 个人数据监视器
 * 聚合 Local Data (last_analysis_data) 与 Supabase (v_openclaw_stats_latest)，渲染左侧抽屉监视器卡片
 */
(function() {
    'use strict';

    var VIBE_OPENCLAW_CACHE = 'vibe_openclaw_analysis_cache';
    var TOKEN_EVOLUTION_MAX = 500000;
    var GATEWAY_CHANNEL_CACHE_KEY = 'openclaw_channel_status_cache_v1';
    var GATEWAY_CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;
    var GATEWAY_UNAVAILABLE_CACHE_KEY = 'openclaw_gateway_unavailable_until_v1';
    var GATEWAY_UNAVAILABLE_TTL_MS = 5 * 60 * 1000;
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
            '<div class="openclaw-monitor-footer">' +
                '<a href="openclaw2.html" target="_blank" rel="noopener noreferrer" class="openclaw-monitor-hub-link">OpenClaw 数据报告</a>' +
            '</div>' +
        '</div>';
    var openclawDrawerObserver = null;
    var openclawDrawerObserverLock = false;
    var openclawGatewayChannelCache = null;
    /** 合并短时间内对 auth.getSession 的调用，减轻 gotrue-js 锁争用（多脚本同时 getSession 时） */
    var OC_AUTH_SESSION_CACHE_MS = 4000;
    var ocAuthSessionCache = { token: '', until: 0, inflight: null };
    function getCachedSupabaseSession(sb) {
        if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') {
            return Promise.resolve({ data: { session: null }, error: null });
        }
        if (Date.now() < ocAuthSessionCache.until && ocAuthSessionCache.token) {
            return Promise.resolve({
                data: { session: { access_token: ocAuthSessionCache.token } },
                error: null
            });
        }
        if (ocAuthSessionCache.inflight) return ocAuthSessionCache.inflight;
        ocAuthSessionCache.inflight = sb.auth.getSession().then(function(res) {
            ocAuthSessionCache.inflight = null;
            var tok = res && res.data && res.data.session && res.data.session.access_token;
            if (tok && String(tok).trim()) {
                ocAuthSessionCache.token = String(tok).trim();
                ocAuthSessionCache.until = Date.now() + OC_AUTH_SESSION_CACHE_MS;
            }
            return res;
        }).catch(function(err) {
            ocAuthSessionCache.inflight = null;
            return { data: { session: null }, error: err };
        });
        return ocAuthSessionCache.inflight;
    }
    var CHANNEL_ICON_META = [
        { id: 'telegram', label: 'Telegram', domain: 'telegram.org', keywords: ['telegram', 'tg'] },
        { id: 'feishu', label: 'Feishu', domain: 'feishu.cn', keywords: ['feishu', 'lark', '飞书'] },
        { id: 'discord', label: 'Discord', domain: 'discord.com', keywords: ['discord'] },
        { id: 'imessage', label: 'iMessage', domain: 'apple.com', keywords: ['imessage', 'i-message', 'messages'] }
    ];

    // OpenClaw 网关动态地址（由 stats2.html 的 Slot2 探测写入）
    var OPENCLAW_GATEWAY_HOST_KEY = 'openclaw2_gateway_host';
    var OPENCLAW_GATEWAY_PORT_KEY = 'openclaw2_gateway_port';
    var OPENCLAW_GATEWAY_DEFAULT_HOST = '127.0.0.1';
    var OPENCLAW_GATEWAY_DEFAULT_PORT = 18789;

    function getOpenClawGatewayAddress() {
        var host = OPENCLAW_GATEWAY_DEFAULT_HOST;
        var port = OPENCLAW_GATEWAY_DEFAULT_PORT;
        try {
            if (typeof localStorage !== 'undefined') {
                var h = localStorage.getItem(OPENCLAW_GATEWAY_HOST_KEY);
                if (h && String(h).trim()) host = String(h).trim();
                var p = localStorage.getItem(OPENCLAW_GATEWAY_PORT_KEY);
                if (p && String(p).trim()) {
                    var parsed = parseInt(String(p).trim(), 10);
                    if (Number.isFinite(parsed) && parsed > 0) port = parsed;
                }
            }
        } catch (_) { /* ignore */ }

        var httpBase = 'http://' + host + ':' + port;
        var wsBase = 'ws://' + host + ':' + port;
        return { host: host, port: port, httpBase: httpBase, wsBase: wsBase };
    }

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

    /** 解析 JSON 字符串或对象，用于判定是否含真实 OpenClaw 载荷（非 Cursor 体检通用字段） */
    function asObjectLoose(value) {
        if (!value) return {};
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch (_) { return {}; }
        }
        return (typeof value === 'object' && !Array.isArray(value)) ? value : {};
    }
    function jsonObjectKeyCount(o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return 0;
        return Object.keys(o).length;
    }
    /** OpenClaw 统计块是否含可展示实质 */
    function openclawStatsBlobHasSubstance(blob) {
        var b = asObjectLoose(blob);
        if (b.stat_id != null && String(b.stat_id).trim() !== '') return true;
        if (Number(b.total_tokens) > 0) return true;
        if (Number(b.total_messages) > 0 || Number(b.records_total) > 0) return true;
        if (String(b.primary_model || b.top_model_id || '').trim()) return true;
        if (jsonObjectKeyCount(b.model_usage) > 0) return true;
        if (jsonObjectKeyCount(b.skills_stats) > 0) return true;
        if (jsonObjectKeyCount(b.tool_usage) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(b.raw_summary)) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(b.portrait)) > 0) return true;
        return false;
    }
    /** user_analysis / v_openclaw 原始行是否应视为 OpenClaw 来源 */
    function rawRecordHasOpenClawEvidence(record) {
        if (!record || typeof record !== 'object') return false;
        if (record.stat_id != null && record.stat_id !== '') return true;
        var openclawMeta = asObjectLoose(record.openclaw_metadata);
        if (jsonObjectKeyCount(openclawMeta) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(record.model_usage)) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(record.skills_stats)) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(record.tool_usage)) > 0) return true;
        if (jsonObjectKeyCount(asObjectLoose(record.raw_summary)) > 0) return true;
        var statsRoot = asObjectLoose(record.stats);
        var openclawRoot = asObjectLoose(openclawMeta || statsRoot.openclaw || record.openclaw);
        var openclawStats = asObjectLoose(openclawRoot.stats || openclawMeta.stats || statsRoot.openclaw_stats || record.openclaw_stats);
        var openclawStatsFlat = asObjectLoose(statsRoot.openclaw_stats || record.openclaw_stats);
        if (jsonObjectKeyCount(openclawStatsFlat) > 0) return true;
        if (openclawStatsBlobHasSubstance(openclawStats)) return true;
        if (openclawRoot.portrait || openclawRoot.sessionsSummary) return true;
        return false;
    }
    /** 当前登录用户 stats JSON 中是否嵌有 OpenClaw 块 */
    function statsRootHasOpenClawEvidence(statsRoot) {
        var s = asObjectLoose(statsRoot);
        var openclawRoot = asObjectLoose(s.openclaw);
        var openclawStats = asObjectLoose(openclawRoot.stats || s.openclaw_stats);
        var flatOcs = asObjectLoose(s.openclaw_stats);
        if (Number(flatOcs.total_tokens) > 0 || flatOcs.primary_model || flatOcs.top_model_id) return true;
        if (Number(openclawStats.total_tokens) > 0 || openclawStats.primary_model || openclawStats.stat_id) return true;
        if (openclawStatsBlobHasSubstance(openclawStats)) return true;
        if (openclawRoot.portrait || openclawRoot.sessionsSummary) return true;
        return false;
    }
    /**
     * 本地合并后的对象是否像真实 OpenClaw 采集（Cursor 体检里也有 skills/model，不得单独作为依据）
     */
    function localMergedHasOpenClawEvidence(merged) {
        if (!merged || typeof merged !== 'object') return false;
        if (merged.source === 'openclaw') return true;
        if (merged.openclawPortrait || merged.openclawSessionsSummary) return true;
        var st = merged.stats || {};
        if (st.source === 'openclaw') return true;
        var oc = asObjectLoose(st.openclaw);
        if (oc.portrait || oc.sessionsSummary) return true;
        var ocsFlat = asObjectLoose(st.openclaw_stats);
        if (ocsFlat.stat_id != null && String(ocsFlat.stat_id).trim() !== '') return true;
        if (Number(ocsFlat.total_tokens) > 0) return true;
        if (ocsFlat.primary_model || ocsFlat.top_model_id) return true;
        if (openclawStatsBlobHasSubstance(st.openclaw_stats)) return true;
        if (openclawStatsBlobHasSubstance(oc.stats)) return true;
        return false;
    }

    /** 从已登录用户的 user_analysis.stats（含 openclaw_stats）补一条本地合并对象，解决「仅云端有 OpenClaw、localStorage 未写」时监视器全 -- */
    function getCurrentUserOpenclawOverlay() {
        try {
            var u = window.currentUserData || window.currentUser;
            if (!u || (u.stats == null && u.openclaw_metadata == null)) return null;
            var st = u.stats;
            if (typeof st === 'string') {
                try { st = JSON.parse(st); } catch (_) { st = null; }
            }
            var openclawMeta = asObjectLoose(u.openclaw_metadata);
            if (!st || typeof st !== 'object') st = {};
            var ocs = st.openclaw_stats || openclawMeta.stats;
            var oc = st.openclaw || openclawMeta;
            if (!ocs && !oc && jsonObjectKeyCount(openclawMeta) === 0) return null;
            var out = { stats: {}, source: 'current_user_overlay' };
            if (ocs && typeof ocs === 'object') out.stats.openclaw_stats = ocs;
            if (openclawMeta && typeof openclawMeta === 'object' && jsonObjectKeyCount(openclawMeta) > 0) {
                out.stats.openclaw = openclawMeta;
                if (openclawMeta.stats && typeof openclawMeta.stats === 'object') {
                    out.stats.openclaw_stats = Object.assign({}, out.stats.openclaw_stats || {}, openclawMeta.stats);
                    out.stats = Object.assign({}, out.stats, openclawMeta.stats);
                }
                if (openclawMeta.portrait) out.openclawPortrait = openclawMeta.portrait;
                if (openclawMeta.sessionsSummary) out.openclawSessionsSummary = openclawMeta.sessionsSummary;
            }
            if (oc && typeof oc === 'object') {
                out.stats.openclaw = oc;
                if (oc.portrait) out.openclawPortrait = oc.portrait;
                if (oc.sessionsSummary) out.openclawSessionsSummary = oc.sessionsSummary;
                if (oc.stats && typeof oc.stats === 'object') {
                    out.stats = Object.assign({}, out.stats, oc.stats);
                }
            }
            return localMergedHasOpenClawEvidence(out) ? out : null;
        } catch (_) {
            return null;
        }
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

    function readGatewayUnavailableUntil() {
        try {
            if (typeof localStorage === 'undefined') return 0;
            var raw = localStorage.getItem(GATEWAY_UNAVAILABLE_CACHE_KEY);
            var until = Number(raw || 0) || 0;
            return until > Date.now() ? until : 0;
        } catch (_) {
            return 0;
        }
    }

    function markGatewayUnavailable() {
        try {
            var until = Date.now() + GATEWAY_UNAVAILABLE_TTL_MS;
            if (typeof localStorage !== 'undefined') localStorage.setItem(GATEWAY_UNAVAILABLE_CACHE_KEY, String(until));
        } catch (_) {}
    }

    function clearGatewayUnavailable() {
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(GATEWAY_UNAVAILABLE_CACHE_KEY);
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

            var addr = getOpenClawGatewayAddress();
            var urls = [
                addr.httpBase + '/api/channels/status',
                addr.httpBase + '/api/channels'
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
            if (readGatewayUnavailableUntil() > Date.now()) {
                resolve([]);
                return;
            }
            var token = getGatewayToken();
            if (!token) {
                resolve([]);
                return;
            }
            fetchGatewayConfiguredChannelIconsViaHttp(token).then(function(httpIcons) {
                if (Array.isArray(httpIcons) && httpIcons.length > 0) {
                    clearGatewayUnavailable();
                    writeGatewayChannelCache(httpIcons);
                    resolve(httpIcons);
                    return;
                }
                if (typeof WebSocket === 'undefined' || !token) {
                    markGatewayUnavailable();
                    resolve([]);
                    return;
                }

                var ws = null;
                var done = false;
                var connectSeq = 1;
                var timeout = null;
                var rpcId = 'rpc-openclaw-channel-status';
                var connectSent = false;
                var addr2 = getOpenClawGatewayAddress();
                var wsUrl = addr2.wsBase + '?token=' + encodeURIComponent(token);

                var finish = function(icons) {
                    if (done) return;
                    done = true;
                    try { if (timeout) clearTimeout(timeout); } catch (_) {}
                    try { if (ws && ws.readyState === 1) ws.close(); } catch (_) {}
                    var finalIcons = Array.isArray(icons) ? icons : [];
                    if (finalIcons.length > 0) clearGatewayUnavailable();
                    else markGatewayUnavailable();
                    resolve(finalIcons);
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
                markGatewayUnavailable();
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
     * 确保左侧抽屉里始终存在 OpenClaw 卡片（直接挂在 left-drawer-body 顶部）
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
            leftBody.insertBefore(mount, leftBody.firstChild || null);
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
        try {
            if (typeof window.normalizeLeftDrawerCardOrder === 'function') window.normalizeLeftDrawerCardOrder();
        } catch (_) {}
        return { mount: mount, card: card };
    }
    function getOpenClawLocalData() {
        try {
            var parsed = null;
            var parsedLast = null;
            var parsedSession = null;
            
            var raw = typeof localStorage !== 'undefined' && localStorage.getItem(VIBE_OPENCLAW_CACHE);
            if (raw) {
                try { parsed = JSON.parse(raw); } catch (_) {}
            }
            
            var rawLast = typeof localStorage !== 'undefined' && localStorage.getItem('last_analysis_data');
            if (rawLast) {
                try { 
                    var tempLast = JSON.parse(rawLast);
                    // 勿用 skillsByName/skillsUsage：Cursor 体检同样具备，会误判为 OpenClaw
                    var stLast = tempLast && tempLast.stats;
                    var ocNested = stLast && stLast.openclaw;
                    var ocStatsFlat = stLast && stLast.openclaw_stats;
                    var ocStatsObj = ocStatsFlat && typeof ocStatsFlat === 'object' ? ocStatsFlat : {};
                    var isOC = tempLast && (
                        tempLast.source === 'openclaw' ||
                        tempLast.openclawPortrait ||
                        tempLast.openclawSessionsSummary ||
                        (stLast && stLast.source === 'openclaw') ||
                        (stLast && openclawStatsBlobHasSubstance(stLast.openclaw_stats)) ||
                        (ocStatsObj.stat_id != null && String(ocStatsObj.stat_id).trim() !== '') ||
                        Number(ocStatsObj.total_tokens) > 0 ||
                        !!(ocStatsObj.primary_model || ocStatsObj.top_model_id) ||
                        (ocNested && typeof ocNested === 'object' && (ocNested.portrait || ocNested.sessionsSummary || openclawStatsBlobHasSubstance(ocNested.stats)))
                    );
                    if (isOC) {
                        parsedLast = tempLast;
                    }
                } catch (_) {}
            }
            
            var rawSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('openclaw_analysis_data');
            if (rawSession) {
                try { parsedSession = JSON.parse(rawSession); } catch (_) {}
            }
            
            var hasDataFromAnySource = !!(
                (parsed && Object.keys(parsed).length > 0) ||
                (parsedLast && Object.keys(parsedLast).length > 0) ||
                (parsedSession && Object.keys(parsedSession).length > 0)
            );
            
            if (!hasDataFromAnySource) return null;
            
            if (!parsed || typeof parsed !== 'object') parsed = {};
            if (!parsedLast || typeof parsedLast !== 'object') parsedLast = {};
            if (!parsedSession || typeof parsedSession !== 'object') parsedSession = {};
            
            var merged = {
                ...parsedLast,
                ...parsedSession,
                ...parsed,
                stats: {
                    ...(parsedLast.stats || {}),
                    ...(parsedSession.stats || {}),
                    ...(parsed.stats || {})
                }
            };
            
            var nestedSources = [parsedLast, parsedSession, parsed];
            nestedSources.forEach(function(source) {
                if (!source || typeof source !== 'object') return;
                var nestedOpenclaw = source.stats && source.stats.openclaw;
                var nestedOpenclawStats = source.stats && source.stats.openclaw_stats;
                if (!merged.openclawPortrait && nestedOpenclaw && typeof nestedOpenclaw === 'object' && nestedOpenclaw.portrait) {
                    merged.openclawPortrait = nestedOpenclaw.portrait;
                }
                if (!merged.openclawSessionsSummary && nestedOpenclaw && typeof nestedOpenclaw === 'object' && nestedOpenclaw.sessionsSummary) {
                    merged.openclawSessionsSummary = nestedOpenclaw.sessionsSummary;
                }
                if (nestedOpenclaw && typeof nestedOpenclaw === 'object' && nestedOpenclaw.stats && typeof nestedOpenclaw.stats === 'object') {
                    merged.stats = Object.assign({}, nestedOpenclaw.stats, merged.stats || {});
                }
                if (nestedOpenclawStats && typeof nestedOpenclawStats === 'object') {
                    merged.stats = Object.assign({}, nestedOpenclawStats, merged.stats || {});
                }
            });
            
            if (!merged.openclawPortrait && parsedLast.openclawPortrait) merged.openclawPortrait = parsedLast.openclawPortrait;
            if (!merged.openclawPortrait && parsedSession.openclawPortrait) merged.openclawPortrait = parsedSession.openclawPortrait;
            if (!merged.openclawSessionsSummary && parsedLast.openclawSessionsSummary) merged.openclawSessionsSummary = parsedLast.openclawSessionsSummary;
            if (!merged.openclawSessionsSummary && parsedSession.openclawSessionsSummary) merged.openclawSessionsSummary = parsedSession.openclawSessionsSummary;

            var cuOverlay = getCurrentUserOpenclawOverlay();
            if (cuOverlay) {
                merged.stats = Object.assign({}, merged.stats || {}, cuOverlay.stats || {});
                if (!merged.openclawPortrait && cuOverlay.openclawPortrait) merged.openclawPortrait = cuOverlay.openclawPortrait;
                if (!merged.openclawSessionsSummary && cuOverlay.openclawSessionsSummary) merged.openclawSessionsSummary = cuOverlay.openclawSessionsSummary;
            }

            if (!localMergedHasOpenClawEvidence(merged)) {
                if (cuOverlay) return cuOverlay;
                return null;
            }
            return merged;
        } catch (e) {
            return null;
        }
    }

    /**
     * 从 Supabase v_openclaw_stats_latest 获取远程数据
     */
    function normalizeOpenClawRemoteRecord(record) {
        if (!record || typeof record !== 'object') return null;
        var asObject = function(value) {
            if (!value) return {};
            if (typeof value === 'string') {
                try { return JSON.parse(value); } catch (_) { return {}; }
            }
            return (typeof value === 'object') ? value : {};
        };
        var statsRoot = asObject(record.stats);
        var openclawMeta = asObject(record.openclaw_metadata);
        var openclawRoot = asObject(record.openclaw || openclawMeta || statsRoot.openclaw);
        var openclawStats = asObject(openclawRoot.stats || openclawMeta.stats || statsRoot.openclaw_stats || record.openclaw_stats);
        var portrait = asObject(record.portrait || record.openclaw_portrait || openclawRoot.portrait || openclawMeta.portrait || openclawStats.portrait);
        var modelUsage = record.model_usage || openclawStats.model_usage || openclawRoot.modelUsage || openclawMeta.modelUsage || openclawMeta.model_usage || {};
        var skillsStats = record.skills_stats || openclawStats.skills_stats || openclawMeta.skills_stats || {};
        var rawSummary = record.raw_summary || openclawStats.raw_summary || openclawMeta.raw_summary || {};
        if (!rawRecordHasOpenClawEvidence(record)) return null;
        return Object.assign({}, openclawStats, record, {
            user_id: record.user_id || openclawStats.user_id || record.id || null,
            total_tokens: record.total_tokens != null ? record.total_tokens : openclawStats.total_tokens,
            primary_model: record.primary_model || openclawStats.primary_model || openclawStats.top_model_id || record.top_model_id || null,
            top_model_id: record.top_model_id || openclawStats.top_model_id || openclawStats.primary_model || record.primary_model || null,
            skills_tags: record.skills_tags || openclawStats.skills_tags || [],
            analyzed_at: record.analyzed_at || openclawStats.analyzed_at || openclawMeta.analyzed_at || record.last_active_at || record.last_sync_at || record.updated_at || null,
            last_sync_at: record.last_sync_at || record.last_active_at || record.updated_at || openclawStats.analyzed_at || null,
            github_synced_at: record.github_synced_at || null,
            first_event_at: record.first_event_at || openclawStats.first_event_at || openclawMeta.first_event_at || portrait.startedAt || null,
            portrait: portrait,
            model_usage: modelUsage,
            skills_stats: skillsStats,
            raw_summary: rawSummary,
            openclaw_metadata: openclawMeta,
            openclaw_stats: openclawStats,
            total_messages: record.total_messages != null ? record.total_messages : (openclawStats.total_messages != null ? openclawStats.total_messages : openclawStats.records_total),
            records_total: record.records_total != null ? record.records_total : (openclawStats.records_total != null ? openclawStats.records_total : openclawStats.total_messages)
        });
    }

    function getOpenClawSupabaseData(userId, fingerprint, identityHint) {
        return new Promise(function(resolve) {
            var sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
            if (!sb || !sb.from) {
                resolve(null);
                return;
            }
            // 不含 openclaw_metadata：未跑迁移的库会因列不存在返回 PostgREST 400；OpenClaw 可从 stats JSON 读取
            var userAnalysisFields = 'id, stats, total_tokens, primary_model, skills_tags, last_active_at, last_sync_at, github_synced_at, updated_at';
            var resolveUserAnalysisByIdentity = function(identity) {
                var login = String(identity || '').trim();
                if (!login) {
                    resolve(null);
                    return;
                }
                sb.from('user_analysis')
                    .select(userAnalysisFields)
                    .eq('github_login', login)
                    .limit(1)
                    .maybeSingle()
                    .then(function(r) {
                        if (r && r.data) {
                            resolve(normalizeOpenClawRemoteRecord(r.data));
                            return;
                        }
                        return sb.from('user_analysis')
                            .select(userAnalysisFields)
                            .ilike('user_name', login)
                            .limit(1)
                            .maybeSingle()
                            .then(function(r2) {
                                resolve(normalizeOpenClawRemoteRecord(r2.data || null));
                            });
                    })
                    .catch(function() {
                        resolve(null);
                    });
            };
            var resolveUserAnalysisById = function(uid) {
                if (!uid) {
                    resolve(null);
                    return;
                }
                sb.from('user_analysis')
                    .select(userAnalysisFields)
                    .eq('id', uid)
                    .maybeSingle()
                    .then(function(r) {
                        resolve(normalizeOpenClawRemoteRecord(r.data || null));
                    })
                    .catch(function() {
                        resolve(null);
                    });
            };
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
                        if (r && r.data) {
                            resolve(normalizeOpenClawRemoteRecord(r.data));
                            return;
                        }
                        resolveUserAnalysisById(uid);
                    })
                    .catch(function() {
                        resolveUserAnalysisById(uid);
                    });
            };
            if (userId) {
                resolveUserId(userId);
                return;
            }
            if (fingerprint) {
                sb.from('user_analysis')
                    .select(userAnalysisFields)
                    .eq('fingerprint', fingerprint)
                    .limit(1)
                    .maybeSingle()
                    .then(function(r) {
                        if (r && r.data && r.data.id) {
                            resolveUserId(r.data.id);
                            return;
                        }
                        resolve(normalizeOpenClawRemoteRecord(r.data || null));
                    })
                    .catch(function() {
                        resolve(null);
                    });
                return;
            }
            if (identityHint) {
                resolveUserAnalysisByIdentity(identityHint);
                return;
            }
            resolve(null);
        });
    }

    /**
     * 合并本地与远程数据
     */
    function mergeOpenClawData(local, remote) {
        var currentUserRecord = window.currentUserData || window.currentUser || null;
        var asObject = function(value) {
            if (!value) return {};
            if (typeof value === 'string') {
                try { return JSON.parse(value); } catch (_) { return {}; }
            }
            return (typeof value === 'object') ? value : {};
        };
        var asStringList = function(value) {
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') {
                try {
                    var parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) return parsed;
                } catch (_) {}
                return value.split(/[,\n|/]/).map(function(item) { return String(item || '').trim(); }).filter(Boolean);
            }
            return [];
        };
        var currentStatsRoot = asObject(currentUserRecord && currentUserRecord.stats);
        var currentOpenclaw = asObject(currentStatsRoot.openclaw);
        var currentOpenclawStats = asObject(currentOpenclaw.stats || currentStatsRoot.openclaw_stats);
        var currentPortrait = asObject(currentOpenclaw.portrait);
        /** 行级字段与 stats.openclaw_stats 双通道：部分入库只写根字段或只写 JSON 内一层 */
        function pickUserNumeric(obj, keys) {
            if (!obj) return null;
            for (var pi = 0; pi < keys.length; pi++) {
                var kk = keys[pi];
                if (obj[kk] == null || obj[kk] === '') continue;
                var n = Number(obj[kk]);
                if (Number.isFinite(n)) return n;
            }
            return null;
        }
        function pickUserString(obj, keys) {
            if (!obj) return '';
            for (var si = 0; si < keys.length; si++) {
                var ks = keys[si];
                if (obj[ks] == null) continue;
                var s = String(obj[ks]).trim();
                if (s) return s;
            }
            return '';
        }
        var accumulateModelCounts = function(bucket, source) {
            if (!source || typeof source !== 'object') return;
            if (Array.isArray(source)) {
                source.forEach(function(item) {
                    if (!item) return;
                    var id = item.modelId || item.name || item.id || item.label || String(item);
                    var count = item.count != null ? item.count : (item.value != null ? item.value : item.ratio);
                    bucket[id] = (bucket[id] || 0) + (Number(count) || 0);
                });
                return;
            }
            Object.keys(source).forEach(function(k) {
                bucket[k] = (bucket[k] || 0) + (Number(source[k]) || 0);
            });
        };
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
        var localSummaryToken = asObject(localSummary && localSummary.token);
        var localSummaryModel = asObject(localSummary && localSummary.model);
        var localUsage = (localStats && localStats.usage) || {};
        var localModelUsage = (localStats && localStats.modelUsage) || (localPortrait && localPortrait.dimensions && localPortrait.dimensions.modelPreference && localPortrait.dimensions.modelPreference.distribution) || {};
        var localTotalTokens = (localUsage && localUsage.totalTokens) ||
            (localPortrait && localPortrait.dimensions && localPortrait.dimensions.consumptionCost && localPortrait.dimensions.consumptionCost.totalTokens) ||
            pickUserNumeric(localSummaryToken, ['totalTokensSum', 'total_tokens_sum', 'totalTokens', 'total_tokens']) ||
            pickUserNumeric(localSummary, ['totalTokens', 'total_tokens']) ||
            0;
        var localEarliest = (localStats && localStats.earliestFileTime) ||
            pickUserNumeric(localSummary, ['first_event_at', 'firstEventAt', 'startedAt', 'startAt']) ||
            null;
        var localSkills = (localStats && (localStats.skillsByName || localStats.skillsUsage)) || {};
        var ocsFromRoot = asObject(currentStatsRoot.openclaw_stats);
        var remoteTotalTokens = (remote && remote.total_tokens) ||
            pickUserNumeric(currentUserRecord, ['total_tokens', 'totalTokens', 'openclaw_total_tokens']) ||
            pickUserNumeric(currentOpenclawStats, ['total_tokens', 'totalTokens']) ||
            pickUserNumeric(ocsFromRoot, ['total_tokens', 'totalTokens']) ||
            getNestedValue(currentOpenclawStats, 'raw_summary.dimensions.consumptionCost.totalTokens') ||
            0;
        var remoteModelUsage = (remote && remote.model_usage) ||
            currentOpenclawStats.model_usage ||
            currentOpenclaw.modelUsage ||
            getNestedValue(currentOpenclawStats, 'raw_summary.dimensions.modelPreference.distribution') ||
            {};
        var remoteSkills = (remote && remote.skills_stats) || currentOpenclawStats.skills_stats || {};
        var remoteRawSummary = (remote && remote.raw_summary) || currentOpenclawStats.raw_summary || {};
        var remoteEarliest = (remote && (remote.first_event_at || remote.analyzed_at)) ||
            currentPortrait.startedAt ||
            currentOpenclawStats.first_event_at ||
            currentOpenclawStats.analyzed_at ||
            (currentUserRecord && currentUserRecord.last_active_at) ||
            null;

        merged.total_tokens = Math.max(Number(localTotalTokens) || 0, Number(remoteTotalTokens) || 0);
        merged.total_messages = (localStats && localStats.totalMessages) ||
            pickUserNumeric(localSummary, ['records_total', 'recordsTotal', 'total_messages', 'totalMessages', 'sessionCount']) ||
            (remote && remote.total_messages) ||
            (remote && remote.records_total) ||
            currentOpenclawStats.total_messages ||
            currentOpenclawStats.records_total ||
            currentPortrait.totalDialogRounds ||
            0;
        merged.last_sync_at = (remote && remote.analyzed_at) ||
            (localSummary && (localSummary.updatedAt || localSummary.lastActiveAt || localSummary.last_active_at)) ||
            (currentUserRecord && (currentUserRecord.last_active_at || currentUserRecord.last_sync_at)) ||
            currentOpenclawStats.analyzed_at ||
            null;
        merged.github_synced_at = (currentUserRecord && currentUserRecord.github_synced_at) || null;

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
        if (currentUserRecord && currentUserRecord.created_at) {
            var ca3 = new Date(currentUserRecord.created_at).getTime();
            if (Number.isFinite(ca3) && (!firstSeen || ca3 < firstSeen)) firstSeen = ca3;
        }
        if (!firstSeen) {
            var lifeDaysFromPortrait = Number(localPortrait && localPortrait.lifeDays);
            if (Number.isFinite(lifeDaysFromPortrait) && lifeDaysFromPortrait > 0) {
                firstSeen = Date.now() - (lifeDaysFromPortrait * 86400000);
            }
        }
        merged.first_seen = firstSeen;
        if (firstSeen) {
            merged.longevity = Math.max(1, Math.floor((Date.now() - firstSeen) / 86400000));
        }

        var modelCounts = {};
        accumulateModelCounts(modelCounts, localModelUsage);
        accumulateModelCounts(modelCounts, remoteModelUsage);
        var topModel = null;
        var topCount = 0;
        Object.keys(modelCounts).forEach(function(k) {
            if (modelCounts[k] > topCount) {
                topCount = modelCounts[k];
                topModel = k;
            }
        });
        merged.primary_model = topModel ||
            (remote && (remote.top_model_id || remote.primary_model)) ||
            pickUserString(currentUserRecord, ['primary_model', 'top_model_id', 'primaryModel', 'topModelId']) ||
            pickUserString(currentOpenclawStats, ['primary_model', 'top_model_id', 'top_model']) ||
            pickUserString(ocsFromRoot, ['primary_model', 'top_model_id', 'top_model']) ||
            pickUserString(localSummaryModel, ['model', 'modelId', 'top_model_id', 'primary_model']) ||
            (Array.isArray(localSummaryModel.uniqueModels) && localSummaryModel.uniqueModels.length > 0 ? String(localSummaryModel.uniqueModels[0] || '').trim() : '') ||
            currentOpenclawStats.top_model_id ||
            (localPortrait && localPortrait.dimensions && localPortrait.dimensions.modelPreference && localPortrait.dimensions.modelPreference.dominantModelId) ||
            null;

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
        asStringList(currentOpenclawStats.skills_tags).forEach(function(k) {
            if (k && String(k).trim()) skillsSet[String(k).trim()] = true;
        });
        asStringList(currentUserRecord && currentUserRecord.skills_tags).forEach(function(k) {
            if (k && String(k).trim()) skillsSet[String(k).trim()] = true;
        });
        merged.skills_tags = Object.keys(skillsSet).slice(0, 12);

        var installedSkillsSet = new Set();
        addStringsToSet(installedSkillsSet, localStats && localStats.skills);
        addStringsToSet(installedSkillsSet, localSummary && localSummary.skills);
        addStringsToSet(installedSkillsSet, localStats && localStats.skillsByName);
        addStringsToSet(installedSkillsSet, localStats && localStats.skillsUsage);
        addStringsToSet(installedSkillsSet, remote && remote.skills_tags);
        addStringsToSet(installedSkillsSet, remoteSkills);
        addStringsToSet(installedSkillsSet, currentOpenclawStats.skills_tags);
        addStringsToSet(installedSkillsSet, currentUserRecord && currentUserRecord.skills_tags);
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.taskHabit.topSkills'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.toolSkillHeat.skillHeat'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(localPortrait, 'dimensions.toolSkillHeat.topTools'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(remoteRawSummary, 'sessions.skills'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(currentOpenclawStats, 'raw_summary.dimensions.toolSkillHeat.skillHeat'));
        addSkillNamesFromArray(installedSkillsSet, getNestedValue(currentOpenclawStats, 'raw_summary.dimensions.toolSkillHeat.topTools'));
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

        var hasRenderableMetrics =
            Number(merged.total_tokens) > 0 ||
            Number(merged.total_messages) > 0 ||
            !!String(merged.primary_model || '').trim() ||
            merged.longevity != null ||
            !!String(merged.last_sync_at || '').trim() ||
            (Array.isArray(merged.installed_skills) && merged.installed_skills.length > 0) ||
            (Array.isArray(merged.active_channels) && merged.active_channels.length > 0);

        var openclawMonitorActive = false;
        if (localMergedHasOpenClawEvidence(local) && hasRenderableMetrics) {
            openclawMonitorActive = true;
        }
        // 只认远程 OpenClaw 快照行（stat_id）。不要再尝试从 user_analysis 的通用字段“推断” OpenClaw。
        if (!openclawMonitorActive) {
            if (hasRenderableMetrics && remote && typeof remote === 'object' && remote.stat_id != null && remote.stat_id !== '') {
                openclawMonitorActive = true;
            }
        }
        if (!openclawMonitorActive) {
            if (hasRenderableMetrics) {
                openclawMonitorActive = true;
            }
        }
        if (!openclawMonitorActive && hasRenderableMetrics && statsRootHasOpenClawEvidence(currentStatsRoot)) {
            openclawMonitorActive = true;
        }
        if (!openclawMonitorActive && currentUserRecord) {
            if (hasRenderableMetrics && pickUserNumeric(currentUserRecord, ['total_tokens', 'totalTokens']) > 0) openclawMonitorActive = true;
            if (hasRenderableMetrics && pickUserString(currentUserRecord, ['primary_model', 'top_model_id'])) openclawMonitorActive = true;
        }
        merged.openclaw_monitor_active = openclawMonitorActive;

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
     * 渲染 OpenClaw 未激活占位（无本地采集且远程/用户 stats 中无 OpenClaw 实质载荷时）
     */
    function renderOpenClawInactivePlaceholder(card) {
        if (!card) return;
        var body = card.querySelector('.openclaw-monitor-body');
        if (!body) return;
        card.classList.add('stats2-inactive-placeholder');
        var hasAuthenticatedSession = !(typeof window.hasAuthenticatedDrawerAccess === 'function') || window.hasAuthenticatedDrawerAccess();
        var desc = hasAuthenticatedSession
            ? '当前还没有可用的 OpenClaw 数据。请返回体检首页上传一次 OpenClaw 数据文件，随后这里才会显示真实指标。'
            : '当前还没有可用的 OpenClaw 数据。请先使用 GitHub 登录，再回到体检首页上传 OpenClaw 数据文件，以获取真实指标。';
        body.innerHTML = '<div class="stats2-inactive-placeholder-title">OpenClaw 监视器未激活</div>' +
            '<div class="stats2-inactive-placeholder-desc">' + desc + '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            (!hasAuthenticatedSession
                ? '<button type="button" class="stats2-inactive-placeholder-btn" data-action="github-login" aria-label="GitHub 登录后查看 OpenClaw 完整数据">GitHub 登录</button>'
                : '') +
            '<button type="button" class="stats2-inactive-placeholder-btn" onclick="typeof window.navigateToIndexPage === \'function\' && window.navigateToIndexPage()" aria-label="返回体检首页补全 OpenClaw 数据">返回体检首页</button>' +
            '</div>';
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
        var hasAuthenticatedSession = !(typeof window.hasAuthenticatedDrawerAccess === 'function') || window.hasAuthenticatedDrawerAccess();
        // 未登录时强制占位，避免刷新后异步加载把“Cursor 体检通用字段”误当 OpenClaw 点亮
        if (!hasAuthenticatedSession) {
            renderOpenClawInactivePlaceholder(card);
            return;
        }
        var longevityEl = document.getElementById('oc-longevity');
        var genomeEl = document.getElementById('oc-genome');
        var tokensEl = document.getElementById('oc-tokens');
        var channelsEl = document.getElementById('oc-channels');
        var skillsEl = document.getElementById('oc-skills');
        var syncEl = document.getElementById('oc-github-sync');
        if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) {
            var body = card.querySelector('.openclaw-monitor-body');
            if (body) {
                body.innerHTML = '<div class="openclaw-row"><span class="label">Longevity</span><span id="oc-longevity">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">Genome</span><span id="oc-genome">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">Tokens</span><span id="oc-tokens">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">Channels</span><div id="oc-channels" class="oc-channel-icons" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">--</div></div>' +
                    '<div class="openclaw-row openclaw-row-skills"><span class="label">Skills</span><div id="oc-skills" class="oc-tags"></div></div>' +
                    '<div class="openclaw-row"><span class="label">Status</span><span id="oc-github-sync">--</span></div>';
                ensureOpenClawCardEnhancements(card);
            }
            longevityEl = document.getElementById('oc-longevity');
            genomeEl = document.getElementById('oc-genome');
            tokensEl = document.getElementById('oc-tokens');
            channelsEl = document.getElementById('oc-channels');
            skillsEl = document.getElementById('oc-skills');
            syncEl = document.getElementById('oc-github-sync');
            if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) return;
        }

        if (!merged || merged.openclaw_monitor_active !== true) {
            renderOpenClawInactivePlaceholder(card);
            return;
        }

        card.classList.remove('stats2-inactive-placeholder');
        if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) {
            var body = card.querySelector('.openclaw-monitor-body');
            if (body) {
                body.innerHTML = '<div class="openclaw-row"><span class="label">寿命 (Longevity)</span><span id="oc-longevity">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">基因模型 (Genome)</span><span id="oc-genome">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">生物能量 (Tokens)</span><span id="oc-tokens">--</span></div>' +
                    '<div class="openclaw-row"><span class="label">已开通频道</span><div id="oc-channels" class="oc-channel-icons" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">--</div></div>' +
                    '<div class="openclaw-row openclaw-row-skills"><span class="label">已安装 Skills</span><div id="oc-skills" class="oc-tags"></div></div>' +
                    '<div class="openclaw-row"><span class="label">任务状态</span><span id="oc-github-sync">--</span></div>';
                ensureOpenClawCardEnhancements(card);
            }
        }
        longevityEl = document.getElementById('oc-longevity');
        genomeEl = document.getElementById('oc-genome');
        tokensEl = document.getElementById('oc-tokens');
        channelsEl = document.getElementById('oc-channels');
        skillsEl = document.getElementById('oc-skills');
        syncEl = document.getElementById('oc-github-sync');
        if (!longevityEl || !genomeEl || !tokensEl || !skillsEl || !syncEl) return;

        longevityEl.textContent = merged.longevity != null ? merged.longevity + ' 天' : '--';
        genomeEl.textContent = merged.primary_model || '--';
        var tokNum = Number(merged.total_tokens) || 0;
        var tokVal = tokNum > 0 ? tokNum.toLocaleString() : '--';
        var pct = tokenEvolutionPercent(tokNum);
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
     * 识别安装环境机型
     */
    function detectPlatform() {
        try {
            var ua = (navigator.userAgent || '').toLowerCase();
            var platform = (navigator.platform || '').toLowerCase();

            // Mac 系列识别
            if (/macintosh|mac os x/i.test(ua) || /mac/i.test(platform)) {
                if (/mac mini/i.test(ua)) return 'Mac mini';
                if (/macbook pro/i.test(ua)) return 'MacBook Pro';
                if (/macbook air/i.test(ua)) return 'MacBook Air';
                if (/macbook/i.test(ua)) return 'MacBook';
                if (/imac/i.test(ua)) return 'iMac';
                if (/mac studio/i.test(ua)) return 'Mac Studio';
                return 'Mac';
            }

            // Windows 识别
            if (/win/i.test(platform) || /windows/i.test(ua)) {
                if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
                return 'Windows';
            }

            // Linux 识别
            if (/linux/i.test(platform) || /x11/i.test(ua)) {
                if (/ubuntu/i.test(ua)) return 'Ubuntu';
                if (/fedora/i.test(ua)) return 'Fedora';
                if (/arch/i.test(ua)) return 'Arch Linux';
                if (/debian/i.test(ua)) return 'Debian';
                return 'Linux';
            }

            return 'Unknown';
        } catch (_) {
            return 'Unknown';
        }
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
            var ghTok = (window.__VIBE_GITHUB_ACCESS_TOKEN__ || (localStorage && localStorage.getItem('vibe_github_access_token'))) || '';
            if (ghTok && String(ghTok).split('.').length >= 2) {
                var ghPayload = JSON.parse(atob(ghTok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                var ghMeta = ghPayload.user_metadata || ghPayload.meta || {};
                github_login = ghMeta.user_name || ghMeta.login || ghMeta.preferred_username || ghMeta.full_name || ghPayload.email || '';
            }
        } catch (_) {}
        if (!github_login || !String(github_login).trim()) {
            try {
                var cuSync = window.currentUserData || window.currentUser || window.supabaseAuthUser;
                if (cuSync && typeof cuSync === 'object') {
                    var umSync = cuSync.user_metadata || cuSync.userMetadata || {};
                    github_login = cuSync.github_login || cuSync.github_username || cuSync.user_name || cuSync.name ||
                        umSync.user_name || umSync.preferred_username || umSync.login || umSync.full_name || '';
                }
            } catch (_) {}
        }
        github_login = String(github_login || '').trim();
        if (github_login === 'OpenClaw ??') github_login = '';
        // 计算寿命天数（从最早记录到现在）
        var lifeDays = 0;
        try {
            var earliestTime = stats.earliestFileTime || portrait.startedAt;
            if (earliestTime && Number(earliestTime) > 0) {
                lifeDays = Math.max(1, Math.floor((Date.now() - Number(earliestTime)) / 86400000));
            }
        } catch (_) {}

        // 计算总对话回合数
        var totalDialogRounds = 0;
        try {
            totalDialogRounds = stats.totalMessages || (consumption && consumption.totalMessages) || (portrait && portrait.totalConversations) || 0;
        } catch (_) {}

        // 提取技能标签数组（确保是字符串数组）
        var skillsArray = [];
        try {
            var skillsObj = stats.skillsByName || stats.skillsUsage || {};
            if (typeof skillsObj === 'object' && !Array.isArray(skillsObj)) {
                skillsArray = Object.keys(skillsObj).slice(0, 20);
            } else if (Array.isArray(skillsObj)) {
                skillsArray = skillsObj.map(function(s) { return String(s || '').trim(); }).filter(Boolean).slice(0, 20);
            }
        } catch (_) {}

        // 识别机型
        var detectedPlatform = detectPlatform();

        // 从 localStorage 缓存补充数据（兜底）
        var cacheRaw = null;
        try { cacheRaw = localStorage.getItem(VIBE_OPENCLAW_CACHE); } catch (_) {}
        var cacheData = null;
        if (cacheRaw) { try { cacheData = JSON.parse(cacheRaw); } catch (_) {} }
        var cachedStats = (cacheData && cacheData.stats) || {};
        var cachedUsage = cachedStats.usage || {};
        var cachedPortrait = (cacheData && cacheData.openclawPortrait) || {};
        var cachedConsumption = (cachedPortrait.dimensions && cachedPortrait.dimensions.consumptionCost) || {};

        // 从 modelUsage 动态计算 primary_model（使用次数最多的模型）
        var modelCounts = {};
        var mu = stats.modelUsage || cachedStats.modelUsage || {};
        if (mu && typeof mu === 'object') {
            if (Array.isArray(mu)) {
                mu.forEach(function(x) {
                    var id = x.modelId || x.name || String(x);
                    var c = x.count || 1;
                    modelCounts[id] = (modelCounts[id] || 0) + c;
                });
            } else {
                Object.keys(mu).forEach(function(k) {
                    modelCounts[k] = (modelCounts[k] || 0) + (Number(mu[k]) || 0);
                });
            }
        }
        var computedPrimaryModel = null;
        var topCount = 0;
        Object.keys(modelCounts).forEach(function(k) {
            if (modelCounts[k] > topCount) {
                topCount = modelCounts[k];
                computedPrimaryModel = k;
            }
        });
        var primaryModel = computedPrimaryModel || modelDim.dominantModelId || null;

        // 技能标签：从缓存补充（若本地为空）
        if (skillsArray.length === 0 && cachedStats.skillsByName) {
            skillsArray = Object.keys(cachedStats.skillsByName).slice(0, 20);
        }
        if (skillsArray.length === 0 && cachedStats.skillsUsage && typeof cachedStats.skillsUsage === 'object') {
            skillsArray = Object.keys(cachedStats.skillsUsage).slice(0, 20);
        }
        if (skillsArray.length === 0 && cachedStats.skills && Array.isArray(cachedStats.skills)) {
            skillsArray = cachedStats.skills.map(function(s) { return String(s || '').trim(); }).filter(Boolean).slice(0, 20);
        }

        var totalTokensVal = (consumption && consumption.totalTokens) != null ? consumption.totalTokens : ((stats.usage && stats.usage.totalTokens) != null ? stats.usage.totalTokens : ((cachedUsage && cachedUsage.totalTokens) != null ? cachedUsage.totalTokens : ((cachedConsumption && cachedConsumption.totalTokens) != null ? cachedConsumption.totalTokens : 0)));
        var promptTokensVal = (consumption && consumption.promptTokens) != null ? consumption.promptTokens : ((stats.usage && stats.usage.promptTokens) != null ? stats.usage.promptTokens : ((cachedUsage && cachedUsage.promptTokens) != null ? cachedUsage.promptTokens : 0));
        var completionTokensVal = (consumption && consumption.completionTokens) != null ? consumption.completionTokens : ((stats.usage && stats.usage.completionTokens) != null ? stats.usage.completionTokens : ((cachedUsage && cachedUsage.completionTokens) != null ? cachedUsage.completionTokens : 0));
        var cachedTokensVal = (consumption && consumption.cachedTokens) != null ? consumption.cachedTokens : ((stats.usage && stats.usage.cachedTokens) != null ? stats.usage.cachedTokens : ((cachedUsage && cachedUsage.cachedTokens) != null ? cachedUsage.cachedTokens : 0));
        var totalCostVal = (consumption && consumption.totalCostUSD) != null ? consumption.totalCostUSD : ((stats.usage && stats.usage.totalCostUSD) != null ? stats.usage.totalCostUSD : ((cachedUsage && cachedUsage.totalCostUSD) != null ? cachedUsage.totalCostUSD : 0));
        var cacheHitRateVal = (consumption && consumption.cacheHitRate) != null ? consumption.cacheHitRate : (stats.cacheHitRate != null ? stats.cacheHitRate : ((cachedStats && cachedStats.cacheHitRate != null) ? cachedStats.cacheHitRate : 0));

        var lastActiveAt = new Date().toISOString();

        var body = {
            fingerprint: fingerprint || null,
            github_login: github_login || null,
            model_usage: stats.modelUsage || cachedStats.modelUsage || {},
            tool_usage: stats.toolUsage || cachedStats.toolUsage || {},
            skills_stats: stats.skillsByName || stats.skillsUsage || cachedStats.skillsByName || cachedStats.skillsUsage || {},
            skills_tags: skillsArray,
            hourly_heatmap: hourlyHeatmap,
            records_total: stats.totalMessages || stats.recordsTotal || cachedStats.totalMessages || cachedStats.recordsTotal || 0,
            total_tokens: totalTokensVal,
            prompt_tokens: promptTokensVal,
            completion_tokens: completionTokensVal,
            cached_tokens: cachedTokensVal,
            total_cost_usd: totalCostVal,
            cache_hit_rate: cacheHitRateVal,
            top_model_id: primaryModel,
            primary_model: primaryModel,
            success_rate: (health && health.successRate) != null ? health.successRate : (stats.successRate != null ? stats.successRate : 0),
            abnormal_interrupt_rate: (health && health.abnormalInterruptRate) != null ? health.abnormalInterruptRate : (stats.abnormalInterruptRate != null ? stats.abnormalInterruptRate : 0),
            success_count: (health && health.successCount) != null ? health.successCount : (stats.successCount != null ? stats.successCount : 0),
            failure_count: (health && health.failureCount) != null ? health.failureCount : (stats.failureCount != null ? stats.failureCount : 0),
            abnormal_interrupt_count: (health && health.abnormalInterruptions) != null ? health.abnormalInterruptions : (stats.abnormalInterruptions != null ? stats.abnormalInterruptions : 0),
            tool_calls_total: stats.toolCallsTotal != null ? stats.toolCallsTotal : 0,
            raw_summary: { dimensions: dims, composite: portrait.composite || {} },
            analyzed_at: lastActiveAt,
            last_active_at: lastActiveAt,
            portrait: {
                device: detectedPlatform,
                lifeDays: lifeDays,
                totalDialogRounds: totalDialogRounds,
                startedAt: stats.earliestFileTime || (portrait && portrait.startedAt) || null,
                lastActiveAt: lastActiveAt,
                environment: {
                    platform: detectedPlatform,
                    userAgent: navigator.userAgent || '',
                    hardwareConcurrency: navigator.hardwareConcurrency || 0,
                    language: navigator.language || 'en-US',
                    timezone: (function() { try { return (typeof Intl !== 'undefined' && Intl.DateTimeFormat) ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC'; } catch (_) { return 'UTC'; } })()
                }
            }
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
        function openclawAnalyzeCanPost(supabaseAccessToken) {
            if (supabaseAccessToken && String(supabaseAccessToken).trim()) return true;
            if (fingerprint && String(fingerprint).trim()) return true;
            if (github_login && String(github_login).trim()) return true;
            return false;
        }
        function postOpenclawAnalyze(bearerToken) {
            var headers = { 'Content-Type': 'application/json' };
            if (bearerToken && String(bearerToken).trim()) headers['Authorization'] = 'Bearer ' + String(bearerToken).trim();
            return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
                .then(function(res) {
                    if (res.ok) {
                        try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
                    }
                    return res;
                })
                .catch(function() {});
        }
        var sbSync = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (sbSync && sbSync.auth && typeof sbSync.auth.getSession === 'function') {
            return getCachedSupabaseSession(sbSync).then(function(sessRes) {
                var supaTok = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.access_token;
                if (!openclawAnalyzeCanPost(supaTok)) return Promise.resolve();
                return postOpenclawAnalyze(supaTok || '');
            }).catch(function() {
                if (!openclawAnalyzeCanPost('')) return Promise.resolve();
                return postOpenclawAnalyze('');
            });
        }
        if (!openclawAnalyzeCanPost('')) return Promise.resolve();
        return postOpenclawAnalyze('');
    }

    /**
     * 刷新监视器：聚合数据并渲染，有本地数据时尝试上报后端
     */
    function refreshOpenClawMonitor() {
        try {
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
        var currentUserRef = window.currentUserData || window.currentUser || null;
        var userId = (window.currentUser && window.currentUser.id) || (window.currentUserData && window.currentUserData.id) || (window.supabaseAuthUser && window.supabaseAuthUser.id) || '';
        var identityHint = '';
        try {
            identityHint = String((currentUserRef && (currentUserRef.github_login || currentUserRef.user_name || currentUserRef.github_username || currentUserRef.name)) || '').trim();
            if (!identityHint && window.supabaseAuthUser && window.supabaseAuthUser.user_metadata) {
                var umHint = window.supabaseAuthUser.user_metadata;
                identityHint = String(umHint.user_name || umHint.preferred_username || umHint.login || umHint.full_name || '').trim();
            }
        } catch (_) {}
        var fingerprint = '';
        try {
            fingerprint = (localStorage.getItem('user_fingerprint') || window.fpId || '').trim();
        } catch (_) {}
        if (local) {
            try { syncOpenClawToUserAnalysis(local).catch(function() {}); } catch (_) {}
            getOpenClawSupabaseData(userId, fingerprint, identityHint).then(function(remote) {
                var merged = mergeOpenClawData(local, remote);
                renderWithGatewayChannels(merged);
            }).catch(function() {
                renderWithGatewayChannels(mergeOpenClawData(local, null));
            });
        } else {
            getOpenClawSupabaseData(userId, fingerprint, identityHint).then(function(remote) {
                var merged = mergeOpenClawData(null, remote);
                renderWithGatewayChannels(merged);
            }).catch(function() {
                renderWithGatewayChannels(mergeOpenClawData(null, null));
            });
        }
        } catch (err) {
            try {
                console.warn('[OpenClawMonitor] refreshOpenClawMonitor failed:', err && err.message ? err.message : err);
            } catch (_) {}
            try {
                renderOpenClawMonitorCard(mergeOpenClawData(getOpenClawLocalData(), null));
            } catch (_) {}
        }
    }

    window.getOpenClawLocalData = getOpenClawLocalData;
    window.getOpenClawSupabaseData = getOpenClawSupabaseData;
    window.mergeOpenClawData = mergeOpenClawData;
    window.renderOpenClawMonitorCard = renderOpenClawMonitorCard;
    window.refreshOpenClawMonitor = refreshOpenClawMonitor;
    window.syncOpenClawToUserAnalysis = syncOpenClawToUserAnalysis;

    function invalidateGatewayAddressCaches() {
        try {
            openclawGatewayChannelCache = null;
        } catch (_) {}
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(GATEWAY_CHANNEL_CACHE_KEY);
                localStorage.removeItem(GATEWAY_UNAVAILABLE_CACHE_KEY);
            }
        } catch (_) {}
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', function(e) {
            if (e.key === VIBE_OPENCLAW_CACHE || e.key === 'openclaw_analysis_data') {
                refreshOpenClawMonitor();
                return;
            }
            if (e.key === 'last_analysis_data' || e.key === 'vibe_openclaw_analysis_cache') {
                refreshOpenClawMonitor();
                return;
            }
            if (e.key === OPENCLAW_GATEWAY_PORT_KEY || e.key === OPENCLAW_GATEWAY_HOST_KEY) {
                invalidateGatewayAddressCaches();
                refreshOpenClawMonitor();
            }
        });
        try {
            if (!window.__openclawLocalStoragePatched) {
                window.__openclawLocalStoragePatched = true;
                var _ocLsTimer = null;
                var _setItem = Storage.prototype.setItem;
                Storage.prototype.setItem = function(key, value) {
                    _setItem.apply(this, arguments);
                    var k = String(key || '');
                    if (k === 'last_analysis_data' || k === VIBE_OPENCLAW_CACHE || k === 'openclaw_analysis_data' || k === 'vibe_openclaw_analysis_cache') {
                        if (_ocLsTimer) clearTimeout(_ocLsTimer);
                        _ocLsTimer = setTimeout(function() {
                            _ocLsTimer = null;
                            try {
                                if (typeof refreshOpenClawMonitor === 'function') refreshOpenClawMonitor();
                            } catch (_) {}
                        }, 150);
                    }
                };
            }
        } catch (_) {}
        try {
            window.addEventListener('vibe-analysis-saved', function() {
                setTimeout(function() {
                    try { refreshOpenClawMonitor(); } catch (_) {}
                }, 50);
            });
        } catch (_) {}
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
