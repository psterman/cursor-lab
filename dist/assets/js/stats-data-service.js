/**
 * stats-data-service.js - 数据与 API 层
 * 职责：fetch 请求、字段适配器 adaptCloudData、last_analysis_data 保底逻辑
 * 消除 eval5 报错：IIFE 顶部 var _loc = window.location，严禁对 _loc 进行属性赋值
 */
(function() {
    'use strict';
    var _loc = window.location;

    /**
     * 字段适配器：将 Supabase/后端格式转为 WordCloud2 所需 { phrase, weight }
     * 支持对象格式（如 { "YYDS": 10 }）：使用 Object.keys().map 转为 [{ word: key, count: value }]
     * @param {Array|Object} list - 原始列表或键值对象 { "词": 权重 }
     * @returns {Array<{phrase: string, weight: number}>}
     */
    function adaptCloudData(list) {
        if (!list) return [];
        if (!Array.isArray(list)) {
            if (typeof list === 'object' && list !== null) {
                list = Object.keys(list).map(function(key) {
                    return { word: key, count: list[key] };
                });
            } else {
                return [];
            }
        }
        return list.map(function(item) {
            if (!item || typeof item !== 'object') return null;
            var phrase = '';
            // 优先识别 Supabase personality.vibe_lexicon.slang_list 格式：item.w 为词组，item.v 为权重
            if (item.w != null) {
                phrase = String(item.w);
            } else if (item.word != null) {
                phrase = String(item.word);
            } else if (item.phrase != null) {
                phrase = String(item.phrase);
            } else if (item[0] != null) {
                phrase = String(item[0]);
            } else {
                var keys = Object.keys(item);
                if (keys.length > 0 && keys[0] !== 'count' && keys[0] !== 'weight' && keys[0] !== 'v') {
                    phrase = String(keys[0]);
                }
            }
            var weight = 0;
            if (item.v != null) {
                weight = Number(item.v);
            } else if (item.count != null) {
                weight = Number(item.count);
            } else if (item.weight != null) {
                weight = Number(item.weight);
            } else if (item[1] != null) {
                weight = Number(item[1]);
            } else {
                var values = Object.values(item);
                for (var i = 0; i < values.length; i++) {
                    var num = Number(values[i]);
                    if (!isNaN(num) && isFinite(num)) { weight = num; break; }
                }
            }
            weight = Number(weight) || 0;
            phrase = String(phrase || '').trim();
            // 【核心保留】fingerprints 数组用于标识该词由哪些用户贡献，供词云高亮当前用户的词
            var fingerprints = Array.isArray(item.fingerprints) ? item.fingerprints : undefined;
            var fingerprint = item.fingerprint != null ? String(item.fingerprint) : undefined;
            if (!phrase || phrase.length === 0) return null;
            var result = { phrase: phrase, weight: weight };
            if (fingerprints) result.fingerprints = fingerprints;
            if (fingerprint) result.fingerprint = fingerprint;
            return result;
        }).filter(Boolean);
    }

    /**
     * 按维度转换词云数据并注入代表词：若存在 representativeWords[dimensionKey]，则将该词置于首位并赋予该维度最高 count，保证 Canvas 中心最大字号；若该维度为空则用代表词生成单元素数组防留白。
     * @param {Array|Object} list - 原始列表或键值对象
     * @param {string} dimensionKey - 'Novice' | 'Professional' | 'Architect'
     * @param {{ Novice?: string, Professional?: string, Architect?: string }|null} representativeWords - 代表词映射
     * @returns {Array<{phrase: string, weight: number}>}
     */
    function adaptCloudDataForLevel(list, dimensionKey, representativeWords) {
        var base = adaptCloudData(list);
        var repWord = (representativeWords && representativeWords[dimensionKey]) ? String(representativeWords[dimensionKey]).trim() : '';
        if (base.length === 0) {
            if (repWord) return [{ phrase: repWord, weight: 1 }];
            return [];
        }
        var maxWeight = Math.max.apply(null, base.map(function(x) { return Number(x.weight) || 0; })) || 1;
        var hasRep = false;
        for (var i = 0; i < base.length; i++) {
            if (String(base[i].phrase || '').trim().toLowerCase() === repWord.toLowerCase()) {
                base[i].weight = maxWeight;
                hasRep = true;
                var t = base[0]; base[0] = base[i]; base[i] = t;
                break;
            }
        }
        if (repWord && !hasRep) base.unshift({ phrase: repWord, weight: maxWeight });
        return base;
    }

    /**
     * 从 localStorage 读取 last_analysis_data 的完整保底逻辑
     * @returns {{ raw: string, data: object|null, identityLevelCloud: object|null, representativeWords: object|null }}
     */
    function getLastAnalysisData() {
        var raw = '';
        try {
            raw = (typeof localStorage !== 'undefined' && localStorage.getItem('last_analysis_data')) || '';
        } catch (e) {
            return { raw: '', data: null, identityLevelCloud: null, representativeWords: null };
        }
        if (!raw || String(raw).trim() === '') {
            return { raw: raw, data: null, identityLevelCloud: null, representativeWords: null };
        }
        var data = null;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return { raw: raw, data: null, identityLevelCloud: null, representativeWords: null };
        }
        // 词云数据位于 analysis 字段内，优先从 analysis 读取
        var root = (data && data.analysis != null && typeof data.analysis === 'object') ? data.analysis : data;
        var repWords = null;
        if (root && root.stats && typeof root.stats.representativeWords === 'object') repWords = root.stats.representativeWords;
        else if (root && root.representativeWords && typeof root.representativeWords === 'object') repWords = root.representativeWords;
        var ilc = null;
        // 优先从 data.stats 按 key 分别提取 Novice/Professional/Architect，避免三级别共用同一 adapted 导致显示断裂
        if (root && root.stats && typeof root.stats === 'object') {
            var stats = root.stats;
            var ilcFromStats = stats.identityLevelCloud;
            if (ilcFromStats && typeof ilcFromStats === 'object' && (Array.isArray(ilcFromStats.Novice) || Array.isArray(ilcFromStats.Professional) || Array.isArray(ilcFromStats.Architect))) {
                ilc = {
                    Novice: Array.isArray(ilcFromStats.Novice) ? ilcFromStats.Novice : [],
                    Professional: Array.isArray(ilcFromStats.Professional) ? ilcFromStats.Professional : [],
                    Architect: Array.isArray(ilcFromStats.Architect) ? ilcFromStats.Architect : [],
                    globalNative: ilcFromStats.globalNative || ilcFromStats.native || []
                };
            } else if (Array.isArray(stats.Novice) || Array.isArray(stats.Professional) || Array.isArray(stats.Architect)) {
                ilc = {
                    Novice: Array.isArray(stats.Novice) ? stats.Novice : [],
                    Professional: Array.isArray(stats.Professional) ? stats.Professional : [],
                    Architect: Array.isArray(stats.Architect) ? stats.Architect : [],
                    globalNative: stats.globalNative || stats.native || []
                };
            }
        }
        if (!ilc && root && root.stats && root.stats.identityLevelCloud) {
            ilc = root.stats.identityLevelCloud;
        }
        if (!ilc && root) {
            ilc = root.identityLevelCloud || null;
        }
        if (!ilc && root) {
            var pRaw = root.personality || root.personality_data;
            var pObj = null;
            if (typeof pRaw === 'string') {
                try { pObj = JSON.parse(pRaw); } catch(e) {}
            } else if (pRaw && typeof pRaw === 'object') {
                pObj = pRaw;
            }
            if (pObj) {
                ilc = pObj.identityLevelCloud || pObj.vibe_lexicon;
                // 若仅有 personality.vibe_lexicon.slang_list，且无按 key 的 stats，才用同一 adapted 兜底
                if (ilc && typeof ilc === 'object' && Array.isArray(ilc.slang_list) && ilc.slang_list.length > 0 &&
                    !ilc.Novice && !ilc.Professional && !ilc.Architect) {
                    var adapted = adaptCloudData(ilc.slang_list);
                    if (adapted.length > 0) {
                        ilc = { Novice: adapted, Professional: adapted, Architect: adapted, globalNative: ilc.globalNative || ilc.native || [] };
                    }
                }
            }
        }
        return { raw: raw, data: data, identityLevelCloud: ilc, representativeWords: repWords || null };
    }

    /**
     * 获取当前 API 端点（与 stats2 中 getApiEndpoint 行为一致）
     */
    function getApiBase() {
        var base = '';
        try {
            base = (window.getApiEndpoint && window.getApiEndpoint()) || (document.querySelector('meta[name="api-endpoint"]') && document.querySelector('meta[name="api-endpoint"]').content) || '';
        } catch (e) {}
        base = (base && String(base).trim()) || '';
        if (base && !base.endsWith('/')) base += '/';
        return base;
    }

    /**
     * 统一身份标识：从 localStorage 读取永久 vibe_user_id（后端下发的 id 会在此持久化）
     */
    function getVibeUserId() {
        try {
            return (localStorage.getItem('vibe_user_id') || '').trim();
        } catch (e) { return ''; }
    }
    function setVibeUserId(id) {
        if (!id || String(id).trim() === '') return;
        try {
            localStorage.setItem('vibe_user_id', String(id).trim());
        } catch (e) {}
    }

    /**
     * 从 _loc 与 localStorage 解析 user_id / fingerprint（与 updateCountryDashboard 一致）
     * 优先使用 vibe_user_id 作为统一身份；指纹优先从 localStorage.getItem('vibe_fp') 获取，保证与上报端对齐。
     */
    function getUserIdAndFingerprint() {
        var uid = '';
        var fp = '';
        try {
            uid = getVibeUserId();
            if (!uid) {
                uid = (window.currentUser && window.currentUser.id) || (window.currentUserData && window.currentUserData.id) || (window.supabaseAuthUser && window.supabaseAuthUser.id) || (window.authenticatedUserId) || (window.__authUserId) || '';
            }
            if (!uid) {
                uid = localStorage.getItem('github_user_id') || localStorage.getItem('supabase_user_id') || localStorage.getItem('auth_user_id') || localStorage.getItem('user_id') || localStorage.getItem('github_username') || (window.userId) || '';
            }
            fp = localStorage.getItem('vibe_fp') || '';
            if (!fp) {
                var p = new URLSearchParams(_loc.search);
                fp = p.get('fingerprint') || p.get('fp') || '';
            }
            if (!fp) fp = localStorage.getItem('user_fingerprint') || (window.fpId) || '';
        } catch (e) {}
        return { uid: String(uid || '').trim(), fp: String(fp || '').trim() };
    }

    /**
     * 国家摘要/全球平均 API：fetch 请求 + 404/超时降级到 last_analysis_data
     * @param {string} countryCode - ISO2 国家码，空或 'GLOBAL' 表示全球
     * @param {object} opts - { countryName, silent, force }
     * @returns {Promise<object>} - payload 含 countryTotals 等
     */
    function fetchCountrySummary(countryCode, opts) {
        opts = opts || {};
        var effectiveIsGlobal = !countryCode || countryCode.toUpperCase() === 'GLOBAL' || countryCode === '全网' || countryCode === '世界' || countryCode.toUpperCase() === 'WORLD';
        var target_country = effectiveIsGlobal ? '' : String(countryCode).toUpperCase();
        var base = getApiBase();
        var API_ENDPOINT = base || '/';
        var cName = (opts.countryName && String(opts.countryName).trim()) || '';
        var ids = getUserIdAndFingerprint();
        // 国家视图：主请求使用 /api/v2/summary?country= 且显式传 country_code，不信任 IP；请求头携带统一身份 vibe_user_id
        var url = effectiveIsGlobal
            ? API_ENDPOINT + 'api/global-average'
            : API_ENDPOINT + 'api/v2/summary?country=' + encodeURIComponent(target_country) + '&country_code=' + encodeURIComponent(target_country) + '&_ts=' + Date.now();

        var isLocalUser = target_country && (
            String(target_country) === String(localStorage.getItem('user_manual_location') || (window.currentUserCountry) || '').toUpperCase()
        );

        var headers = {};
        if (ids.uid) headers['X-Vibe-User-Id'] = ids.uid;

        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var signal = controller && controller.signal;
        var timeoutId = null;
        if (controller) {
            timeoutId = setTimeout(function() {
                try { if (controller && !controller.signal.aborted) controller.abort(); } catch (_) {}
            }, 10000);
        }

        return fetch(url, { signal: signal, headers: headers }).then(function(resp) {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (resp.ok) {
                return resp.json().then(function(data) {
                    // 若响应带新 id，立即持久化为统一身份
                    if (data && (data.id != null || data.user_id != null || data.vibe_user_id != null)) {
                        var newId = data.vibe_user_id || data.user_id || data.id;
                        if (newId) setVibeUserId(String(newId));
                    }
                    // 请求校验：返回的 country_code 与请求国家不一致则丢弃，防止 VPN/延迟导致错数据
                    if (!effectiveIsGlobal && target_country && data && data.country_code != null) {
                        var respCc = String(data.country_code).trim().toUpperCase();
                        if (respCc !== String(target_country).trim().toUpperCase()) {
                            return Promise.reject(new Error('country_code mismatch'));
                        }
                    }
                    // 国家关键词/词云仅由 fetchCountryKeywords -> get_user_soul_words 填充，此处不再用 vibe_lexicon 覆盖
                    if (!effectiveIsGlobal && data && data._meta && (data.jiafang_count != null || data.ketao_count != null)) {
                        data.countryTotals = data.countryTotals || {};
                        data.countryTotals.jiafang_count = data.jiafang_count != null ? data.jiafang_count : data.countryTotals.jiafang_count;
                        data.countryTotals.ketao_count = data.ketao_count != null ? data.ketao_count : data.countryTotals.ketao_count;
                        data.countryTotals._meta = data._meta;
                    }
                    return data;
                });
            }
            var status = resp.status;
            if ((status === 404 || status >= 500) && isLocalUser) {
                var last = getLastAnalysisData();
                if (last.data && last.identityLevelCloud) {
                    return {
                        countryTotals: { totalUsers: 1, ai: 1 },
                        __fallback: true,
                        __source: 'localStorage',
                        __isFallback: true
                    };
                }
            }
            throw new Error('HTTP ' + status);
        }).catch(function(fetchErr) {
            if (timeoutId) { clearTimeout(timeoutId); }
            if (fetchErr.name === 'AbortError' || (fetchErr.message && fetchErr.message.indexOf('aborted') !== -1)) {
                throw fetchErr;
            }
            if (isLocalUser) {
                var last2 = getLastAnalysisData();
                if (last2.data && last2.identityLevelCloud) {
                    return {
                        countryTotals: { totalUsers: 1, ai: 1 },
                        __fallback: true,
                        __source: 'localStorage',
                        __isFallback: true
                    };
                }
            }
            throw fetchErr;
        });
    }

    /**
     * 从 stats 对象解构 identityLevelCloud 得到 Novice/Professional/Architect 三个独立数组，分别转换后写入 __countryKeywordsByLevel；严禁使用单一变量覆盖所有维度。
     * @param {object} ilc - identityLevelCloud 或含 Novice/Professional/Architect 的对象
     * @param {object|null} representativeWords - 代表词映射，用于 adaptCloudDataForLevel
     * @param {Array} globalNativeFallback - 用于 globalNative 的兜底数据（如 RPC 的 mapped）
     */
    function buildCountryKeywordsByLevel(ilc, representativeWords, globalNativeFallback) {
        var keys = ['Novice', 'Professional', 'Architect'];
        var out = { Novice: [], Professional: [], Architect: [], globalNative: [] };
        if (!ilc || typeof ilc !== 'object') return out;
        
        // 【调试】记录解析的词云数据量，便于排查数据混乱问题
        var counts = { Novice: 0, Professional: 0, Architect: 0 };
        
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var arr = Array.isArray(ilc[key]) ? ilc[key] : [];
            out[key] = representativeWords ? adaptCloudDataForLevel(arr, key, representativeWords) : adaptCloudData(arr);
            counts[key] = out[key].length;
        }
        out.globalNative = adaptCloudData(ilc.globalNative || ilc.native || globalNativeFallback || []);
        
        console.log('[buildCountryKeywordsByLevel] 解析词云数据 - Novice:', counts.Novice, 'Professional:', counts.Professional, 'Architect:', counts.Architect);
        
        return out;
    }

    /**
     * 本国词云：彻底切断 Index 数据污染。Novice/Professional/Architect 仅由后端返回的 stats.identityLevelCloud 填充；
     * 后端返回空则三字段为 []，严禁使用用户本地 vibe_lexicon / last_analysis_data 填充。
     * @param {object} [optionalRecord] - 可选，含 .stats.identityLevelCloud 的后端记录（如 res.data[0]）
     * @returns {Promise<object>} - { Novice, Professional, Architect, globalNative }
     */
    function fetchCountryKeywords(optionalRecord) {
        var emptyResult = { Novice: [], Professional: [], Architect: [], globalNative: [] };

        function setResult(out) {
            window.__countryKeywordsByLevel = out;
            window.__nationalCloudData = out;
            return out;
        }

        // 仅当调用方显式传入后端 record 时，用其 stats.identityLevelCloud 填充三维度
        if (optionalRecord && optionalRecord.stats && typeof optionalRecord.stats === 'object') {
            var ilc = optionalRecord.stats.identityLevelCloud;
            if (ilc && typeof ilc === 'object') {
                var rep = optionalRecord.stats.representativeWords && typeof optionalRecord.stats.representativeWords === 'object' ? optionalRecord.stats.representativeWords : null;
                var out = buildCountryKeywordsByLevel(ilc, rep, null);
                window.__isCloudLoading = false;
                return Promise.resolve(setResult(out));
            }
        }

        window.__isCloudLoading = true;
        var base = getApiBase();
        var apiBase = (base && String(base).trim()) ? base : '/';
        if (apiBase && !apiBase.endsWith('/')) apiBase += '/';
        // 【核心】优先级：__selectedCountry > currentDrawerCountry.code > user_selected_country，确保切换国家后请求正确
        var selectedCountry = (window.__selectedCountry && String(window.__selectedCountry).trim()) ? String(window.__selectedCountry).toUpperCase() : '';
        if (!selectedCountry && typeof window.currentDrawerCountry === 'object' && window.currentDrawerCountry && window.currentDrawerCountry.code) {
            selectedCountry = String(window.currentDrawerCountry.code).trim().toUpperCase();
        }
        if (!selectedCountry) {
            try { selectedCountry = (localStorage.getItem('user_selected_country') || localStorage.getItem('user_manual_location') || '').trim().toUpperCase(); } catch (e) {}
        }
        var countryParam = selectedCountry && /^[A-Z]{2}$/.test(selectedCountry) ? selectedCountry : '';
        
        // 【调试】记录请求的国家，便于排查数据混乱问题
        console.log('[fetchCountryKeywords] 请求本国词云数据 - 国家:', countryParam || '未指定', '来源:', selectedCountry ? (__selectedCountry ? '__selectedCountry' : (window.currentDrawerCountry ? 'currentDrawerCountry' : 'localStorage')) : '无');
        
        var summaryUrl = countryParam ? (apiBase + 'api/country-summary?country=' + encodeURIComponent(countryParam) + '&_ts=' + Date.now()) : null;

        function fromBackendIlc(ilc, rep, globalNativeFallback) {
            if (!ilc || typeof ilc !== 'object') return emptyResult;
            var out = buildCountryKeywordsByLevel(ilc, rep || null, globalNativeFallback || []);
            return out;
        }

        if (!summaryUrl) {
            window.__isCloudLoading = false;
            return Promise.resolve(setResult(emptyResult));
        }

        function tryKeywordsApi() {
            if (!countryParam) return Promise.resolve(emptyResult);
            var keywordsUrl = apiBase + 'api/v2/stats/keywords?region=' + encodeURIComponent(countryParam) + '&_t=' + Date.now();
            return fetch(keywordsUrl, { cache: 'no-store' }).then(function(r) {
                if (!r.ok) return emptyResult;
                return r.json().then(function(payload) {
                    var raw = (payload && payload.data) ? payload.data : payload;
                    var cloudData = (raw && raw.identityLevelCloud) ? raw.identityLevelCloud : raw;
                    if (cloudData && typeof cloudData === 'object') {
                        var out = {
                            Novice: adaptCloudData(cloudData.Novice || []),
                            Professional: adaptCloudData(cloudData.Professional || []),
                            Architect: adaptCloudData(cloudData.Architect || []),
                            globalNative: adaptCloudData(cloudData.globalNative || cloudData.native || [])
                        };
                        setResult(out);
                        return out;
                    }
                    return emptyResult;
                }).catch(function() { return emptyResult; });
            }).catch(function() { return emptyResult; });
        }

        return fetch(summaryUrl).then(function(resp) {
            if (!resp.ok) return tryKeywordsApi().then(function(out) { return setResult(out); });
            return resp.json().then(function(data) {
                var ilc = (data && data.identityLevelCloud) ? data.identityLevelCloud : (data && data.vibe_lexicon) ? data.vibe_lexicon : null;
                if (ilc && typeof ilc === 'object') {
                    var rep = (data && data.representativeWords) ? data.representativeWords : null;
                    var out = setResult(fromBackendIlc(ilc, rep, null));
                    if (data && data.success !== false) { try { window.__isCloudLoading = false; } catch (err) {} }
                    return out;
                }
                if (data && data.success !== false) { try { window.__isCloudLoading = false; } catch (err) {} }
                return tryKeywordsApi().then(function(out) { return setResult(out); });
            }).catch(function() { return tryKeywordsApi().then(function(out) { return setResult(out); }); });
        }).catch(function(e) {
            console.warn('[StatsDataService] fetchCountryKeywords 后端 summary 失败:', e);
            return tryKeywordsApi().then(function(out) { return setResult(out); });
        }).finally(function() {
            try { window.__isCloudLoading = false; } catch (err) {}
        });
    }

    window.StatsDataService = {
        adaptCloudData: adaptCloudData,
        adaptCloudDataForLevel: adaptCloudDataForLevel,
        buildCountryKeywordsByLevel: buildCountryKeywordsByLevel,
        getLastAnalysisData: getLastAnalysisData,
        fetchCountrySummary: fetchCountrySummary,
        fetchCountryKeywords: fetchCountryKeywords,
        getApiBase: getApiBase,
        getUserIdAndFingerprint: getUserIdAndFingerprint,
        getVibeUserId: getVibeUserId,
        setVibeUserId: setVibeUserId
    };
})();
