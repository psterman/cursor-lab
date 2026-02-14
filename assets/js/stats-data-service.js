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
            return phrase && phrase.length > 0 ? { phrase: phrase, weight: weight } : null;
        }).filter(Boolean);
    }

    /**
     * 从 localStorage 读取 last_analysis_data 的完整保底逻辑
     * @returns {{ raw: string, data: object|null, identityLevelCloud: object|null }}
     */
    function getLastAnalysisData() {
        var raw = '';
        try {
            raw = (typeof localStorage !== 'undefined' && localStorage.getItem('last_analysis_data')) || '';
        } catch (e) {
            return { raw: '', data: null, identityLevelCloud: null };
        }
        if (!raw || String(raw).trim() === '') {
            return { raw: raw, data: null, identityLevelCloud: null };
        }
        var data = null;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return { raw: raw, data: null, identityLevelCloud: null };
        }
        // 词云数据位于 analysis 字段内，优先从 analysis 读取
        var root = (data && data.analysis != null && typeof data.analysis === 'object') ? data.analysis : data;
        var ilc = (root && root.stats && root.stats.identityLevelCloud) || (root && root.identityLevelCloud) || null;
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
                // 若仅有 personality.vibe_lexicon.slang_list，补全为 Novice/Professional/Architect 供词云使用
                if (ilc && typeof ilc === 'object' && Array.isArray(ilc.slang_list) && ilc.slang_list.length > 0 &&
                    !ilc.Novice && !ilc.Professional && !ilc.Architect) {
                    var adapted = adaptCloudData(ilc.slang_list);
                    if (adapted.length > 0) {
                        ilc = { Novice: adapted, Professional: adapted, Architect: adapted, globalNative: ilc.globalNative || ilc.native || [] };
                    }
                }
            }
        }
        return { raw: raw, data: data, identityLevelCloud: ilc };
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
     * 从 _loc 与 localStorage 解析 user_id / fingerprint（与 updateCountryDashboard 一致）
     * 指纹优先从 localStorage.getItem('vibe_fp') 获取，保证与上报端对齐。
     */
    function getUserIdAndFingerprint() {
        var uid = '';
        var fp = '';
        try {
            uid = (window.currentUser && window.currentUser.id) || (window.currentUserData && window.currentUserData.id) || (window.supabaseAuthUser && window.supabaseAuthUser.id) || (window.authenticatedUserId) || (window.__authUserId) || '';
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
        // 国家视图：主请求使用 /api/v2/summary?country= 获取 vibe_lexicon 与聚合；全球仍用 global-average
        var url = effectiveIsGlobal
            ? API_ENDPOINT + 'api/global-average'
            : API_ENDPOINT + 'api/v2/summary?country=' + encodeURIComponent(target_country) + '&_ts=' + Date.now();

        var isLocalUser = target_country && (
            String(target_country) === String(localStorage.getItem('user_manual_location') || (window.currentUserCountry) || '').toUpperCase()
        );

        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var signal = controller && controller.signal;
        var timeoutId = null;
        if (controller) {
            timeoutId = setTimeout(function() {
                try { if (controller && !controller.signal.aborted) controller.abort(); } catch (_) {}
            }, 10000);
        }

        return fetch(url, { signal: signal }).then(function(resp) {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (resp.ok) {
                return resp.json().then(function(data) {
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
     * 国家关键词/词云：仅从 Supabase RPC get_user_soul_words 获取，phrase + hit_count 按 hit_count 降序供词云中心显示。
     * 若用户选择了国家，在客户端按 country 过滤（RPC 当前仅支持 p_fingerprint）。
     * @param {string} countryCode - ISO2，可选，用于客户端过滤
     * @returns {Promise<object>} - { Novice, Professional, Architect, globalNative } 已用 adaptCloudData 转换
     */
    function fetchCountryKeywords(countryCode) {
        var effectiveCountry = (countryCode && String(countryCode).trim()) || (window.__selectedCountry && String(window.__selectedCountry).trim()) || '';
        var ids = getUserIdAndFingerprint();
        var fp = ids.fp;
        var supabase = window.supabase || window.supabaseClient;
        var emptyResult = {
            Novice: [],
            Professional: [],
            Architect: [],
            globalNative: []
        };

        if (!supabase || typeof supabase.rpc !== 'function' || !fp) {
            window.__countryKeywordsByLevel = emptyResult;
            window.__nationalCloudData = emptyResult;
            return Promise.resolve(emptyResult);
        }

        return supabase.rpc('get_user_soul_words', { p_fingerprint: fp }).then(function(result) {
            var err = result.error;
            var rows = (result && result.data && Array.isArray(result.data)) ? result.data : [];
            if (err) {
                console.warn('[StatsDataService] get_user_soul_words RPC 失败:', err);
                window.__countryKeywordsByLevel = emptyResult;
                window.__nationalCloudData = emptyResult;
                return emptyResult;
            }
            var countryFilter = effectiveCountry ? String(effectiveCountry).toUpperCase() : '';
            if (countryFilter) {
                rows = rows.filter(function(r) { return (r.country || '').toUpperCase() === countryFilter; });
            }
            rows.sort(function(a, b) { return (b.hit_count || 0) - (a.hit_count || 0); });
            var mapped = rows.map(function(r) { return { phrase: r.phrase, count: r.hit_count }; });
            var adapted = adaptCloudData(mapped);
            var out = {
                Novice: adapted,
                Professional: adapted,
                Architect: adapted,
                globalNative: adapted
            };
            window.__countryKeywordsByLevel = out;
            window.__nationalCloudData = out;
            return out;
        }).catch(function(e) {
            console.warn('[StatsDataService] fetchCountryKeywords 异常:', e);
            window.__countryKeywordsByLevel = emptyResult;
            window.__nationalCloudData = emptyResult;
            return emptyResult;
        });
    }

    window.StatsDataService = {
        adaptCloudData: adaptCloudData,
        getLastAnalysisData: getLastAnalysisData,
        fetchCountrySummary: fetchCountrySummary,
        fetchCountryKeywords: fetchCountryKeywords,
        getApiBase: getApiBase,
        getUserIdAndFingerprint: getUserIdAndFingerprint
    };
})();
