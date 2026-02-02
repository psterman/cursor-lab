
        let calibrationDebounceTimer = null; // 脚本最顶部声明，彻底拦截定位漂移，避免 ReferenceError

        // ==========================================
        // ==========================================
        // 【v4.0 示例】VibeCodingerAnalyzer 全球各国数据切换示例
        // ==========================================
        /**
         * 示例：如何使用重构后的 VibeCodingerAnalyzer 处理全球260国数据
         * 
         * 核心功能：
         * 1. 元数据驱动：动态维度识别，支持40+维度
         * 2. 容差对比：影子调用使用±5%容差
         * 3. 国家上下文：自动计算个人得分与国家平均分的偏离度
         * 4. 性能优化：并发锁、5秒超时保护
         * 5. V6 Stats对接：完整解析tech_stack、ketao_count等
         */
        
        // 示例：初始化分析器并切换国家上下文
        async function exampleGlobalCountrySwitching() {
            // 1. 导入分析器（假设已通过ES模块导入）
            // import { VibeCodingerAnalyzer } from './src/VibeCodingerAnalyzer.js';
            
            // 2. 创建分析器实例（支持动态维度配置）
            const analyzer = new VibeCodingerAnalyzer('zh-CN', {
                // 可选：如果已知维度配置，可以预先传入
                // keys: ['L', 'P', 'D', 'E', 'F', 'G', 'H', ...], // 40+维度
                // metadata: { ... }
            });
            
            // 3. 模拟聊天数据
            const chatData = [
                { role: 'USER', text: '帮我写一个React组件，使用TypeScript和Tailwind CSS' },
                { role: 'ASSISTANT', text: '好的，我来帮你...' },
                { role: 'USER', text: '谢谢，这个实现很棒！' }
            ];
            
            // 4. 全球260国数据切换示例
            const countries = [
                { code: 'US', name: 'United States' },
                { code: 'CN', name: 'China' },
                { code: 'JP', name: 'Japan' },
                { code: 'GB', name: 'United Kingdom' },
                { code: 'DE', name: 'Germany' },
                // ... 更多国家
            ];
            
            // 遍历各国进行分析
            for (const country of countries) {
                try {
                    console.log(`[Example] 分析 ${country.name} (${country.code}) 的数据...`);
                    
                    // 4.1 设置国家上下文（从后端API获取国家平均值）
                    const countryAverage = await fetchCountryAverage(country.code);
                    analyzer.setCountryContext(country.code, countryAverage, {
                        countryName: country.name,
                        region: getRegionByCountryCode(country.code)
                    });
                    
                    // 4.2 执行分析（自动计算偏离度）
                    const result = await analyzer.analyze(chatData, 'zh-CN');
                    
                    // 4.3 处理分析结果
                    console.log(`[Example] ${country.name} 分析结果:`, {
                        dimensions: result.dimensions,
                        personalityType: result.personalityType,
                        deviationFromCountry: result.deviationFromCountry, // 【v4.0新增】偏离度
                        countryAverage: result.countryAverage, // 【v4.0新增】国家平均分
                        stats: result.statistics, // 【v4.0 V6 Stats】包含tech_stack、ketao_count等
                        hasRageWord: result.metadata?.hasRageWord // 【v4.0新增】咆哮词检测
                    });
                    
                    // 4.4 上传排名并获取全球排名
                    const rankData = await analyzer.uploadToSupabase(result, chatData, (progress) => {
                        console.log(`[Example] ${country.name} 上传进度:`, progress);
                    });
                    
                    console.log(`[Example] ${country.name} 排名数据:`, {
                        rankPercent: rankData.rankPercent,
                        totalUsers: rankData.totalUsers,
                        countryRank: rankData.countryRank // 如果后端返回
                    });
                    
                    // 4.5 更新UI（示例）
                    updateCountryDashboard(country.code, {
                        result,
                        rankData,
                        deviation: result.deviationFromCountry
                    });
                    
                } catch (error) {
                    console.error(`[Example] ${country.name} 分析失败:`, error);
                    // 【v4.0 超时保护】如果超时，会自动降级到本地简单匹配
                    if (error.message.includes('timeout')) {
                        console.warn(`[Example] ${country.name} 分析超时，使用降级方案`);
                    }
                }
                
                // 避免过快切换导致并发冲突（【v4.0 并发锁】会自动处理）
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // 辅助函数：从后端获取国家平均值
        async function fetchCountryAverage(countryCode) {
            try {
                const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || 
                                   'https://cursor-clinical-analysis.psterman.workers.dev/';
                const url = `${apiEndpoint}api/v2/country-average?countryCode=${countryCode}`;
                
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                return data.average || null; // 格式：{L: 65, P: 70, D: 60, E: 8, F: 55}
            } catch (error) {
                console.warn(`[Example] 获取 ${countryCode} 国家平均值失败:`, error);
                return null;
            }
        }
        
        // 辅助函数：根据国家代码获取地区
        function getRegionByCountryCode(code) {
            const regionMap = {
                'US': 'North America',
                'CN': 'Asia',
                'JP': 'Asia',
                'GB': 'Europe',
                'DE': 'Europe',
                // ... 更多映射
            };
            return regionMap[code] || 'Unknown';
        }
        
        // 辅助函数：更新国家仪表板UI
        async function updateCountryDashboard(countryNameOrCode, maybeData) {
            // 兼容旧示例调用：updateCountryDashboard(countryCode, { result, ... })
            if (maybeData && typeof maybeData === 'object' && maybeData.result) {
                const countryCode = countryNameOrCode;
                const data = maybeData;
                const dashboard = document.getElementById(`country-dashboard-${countryCode}`);
                if (dashboard) {
                    dashboard.innerHTML = `
                        <div class="country-stats">
                            <h3>${countryCode} 分析结果</h3>
                            <div class="dimensions">
                                ${Object.entries(data.result.dimensions).map(([key, value]) =>
                                    `<div class="dimension">
                                        <span>${key}:</span>
                                        <span>${value}</span>
                                        ${data.deviation ? `<span class="deviation">${data.deviation.deviations[key]?.deviationPercent || ''}</span>` : ''}
                                    </div>`
                                ).join('')}
                            </div>
                            <div class="deviation-summary">
                                ${data.deviation ? `
                                    <p>整体偏离度: ${data.deviation.overallDeviation}%</p>
                                    <p>${data.deviation.interpretation}</p>
                                ` : ''}
                            </div>
                            <div class="stats">
                                <p>技术栈: ${JSON.stringify(data.result.statistics?.tech_stack || {})}</p>
                                <p>客套词数: ${data.result.statistics?.ketao_count || 0}</p>
                                <p>加方词数: ${data.result.statistics?.jiafang_count || 0}</p>
                                <p>工作天数: ${data.result.statistics?.work_days || 0}</p>
                            </div>
                            ${data.result.metadata?.hasRageWord ? '<div class="rage-warning">⚠️ 检测到咆哮词</div>' : ''}
                        </div>
                    `;
                }
                return;
            }

            // 新逻辑：用于右侧抽屉国家透视（支持任意国家代码）
            const rawCountry = String(countryNameOrCode || '').trim();
            const isGlobal =
                !rawCountry ||
                rawCountry.toUpperCase() === 'GLOBAL' ||
                rawCountry === '全网' ||
                rawCountry === '世界' ||
                rawCountry.toUpperCase() === 'WORLD';

            let countryCode = '';
            if (!isGlobal) {
                if (/^[A-Za-z]{2}$/.test(rawCountry)) {
                    countryCode = rawCountry.toUpperCase();
                } else if (typeof resolveCountryCodeFromMapName === 'function') {
                    const cc = resolveCountryCodeFromMapName(rawCountry);
                    countryCode = cc ? String(cc).toUpperCase() : '';
                }
                // 无法解析 ISO2 时：退回全网口径（避免错误查询导致 ratio 失真）
                if (!/^[A-Z]{2}$/.test(countryCode)) {
                    countryCode = '';
                }
            }
            const effectiveIsGlobal = isGlobal || !/^[A-Z]{2}$/.test(countryCode);

            const base = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim();
            const API_ENDPOINT = base.endsWith('/') ? base : `${base}/`;
            const url = effectiveIsGlobal
                ? `${API_ENDPOINT}api/global-average`
                : `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(countryCode)}`;

            // DOM 绑定点
            const usersValEl = document.getElementById('rtDiagnosedTotal');
            const analysisValEl = document.getElementById('rtScanTotal');
            const usersCardEl = document.getElementById('rtUsersCard');
            const analysisCardEl = document.getElementById('rtAnalysisCard');
            const statusEl = document.getElementById('rtDataStatus');
            const radarDom = document.getElementById('rtRadar');
            const realtimeDom = document.getElementById('rtRealtimeList');

            // vNext: 支持第三参数 options（preferCache / silent）
            const opts = (() => {
                try {
                    const o = arguments && arguments.length >= 3 ? arguments[2] : null;
                    return o && typeof o === 'object' ? o : {};
                } catch {
                    return {};
                }
            })();

            const flash = (el) => {
                if (!el) return;
                el.classList.remove('breathe-flash');
                // 强制重排以重启动画
                void el.offsetWidth; // eslint-disable-line no-unused-expressions
                el.classList.add('breathe-flash');
                window.setTimeout(() => el.classList.remove('breathe-flash'), 950);
            };

            const stopFlash = (el) => {
                if (!el) return;
                el.classList.remove('breathe-flash');
            };

            const escapeHtml = (s) =>
                String(s ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

            const setValueOrNA = (el, rawValue) => {
                if (!el) return;
                // UI 降级：仅将“空/不可解析”视为缺失；0 应该显示为 0（否则会误判为 N/A）
                if (
                    rawValue === null ||
                    rawValue === undefined ||
                    (typeof rawValue === 'string' && rawValue.trim() === '')
                ) {
                    el.textContent = 'N/A';
                    stopFlash(el);
                    return;
                }
                const n = Number(rawValue);
                if (!Number.isFinite(n)) {
                    el.textContent = 'N/A';
                    stopFlash(el);
                    return;
                }
                el.textContent = new Intl.NumberFormat('zh-CN').format(n);
            };

            // 雷达图（ECharts）
            if (!window.__countryRadarChart) window.__countryRadarChart = null;
            const disposeRadar = () => {
                try {
                    if (window.__countryRadarChart && typeof window.__countryRadarChart.dispose === 'function') {
                        window.__countryRadarChart.dispose();
                    }
                } catch (e) {
                    // ignore
                } finally {
                    window.__countryRadarChart = null;
                }
            };

            const renderRadarMessage = (msg) => {
                if (!radarDom) return;
                disposeRadar();
                radarDom.innerHTML = `
                    <div class="flex items-center justify-center h-full w-full text-center text-zinc-500 text-sm border border-white/10 bg-zinc-950/30">
                        ${escapeHtml(msg)}
                    </div>
                `;
            };

            const renderRadar = (values) => {
                const dom = document.getElementById('rtRadar');
                if (!dom || typeof echarts === 'undefined') return;
                try {
                    if (window.__countryRadarChart && typeof window.__countryRadarChart.dispose === 'function') {
                        window.__countryRadarChart.dispose();
                    }
                } catch (e) {
                    // ignore
                }
                dom.innerHTML = '';
                window.__countryRadarChart = echarts.init(dom, null, { renderer: 'canvas' });
                const radarLabel = effectiveIsGlobal
                    ? 'GLOBAL_AVG'
                    : (countryCode && /^[A-Z]{2}$/.test(String(countryCode).toUpperCase())
                        ? `${String(countryCode).toUpperCase()}_AVG`
                        : 'REGION_AVG');
                const option = {
                    backgroundColor: 'transparent',
                    radar: {
                        indicator: [
                            { name: 'L', max: 100 },
                            { name: 'P', max: 100 },
                            { name: 'D', max: 100 },
                            { name: 'E', max: 100 },
                            { name: 'F', max: 100 },
                        ],
                        axisName: { color: '#e5e7eb', fontFamily: 'JetBrains Mono', fontSize: 11 },
                        splitLine: { lineStyle: { color: 'rgba(0,255,65,0.18)' } },
                        splitArea: { areaStyle: { color: ['rgba(0,255,65,0.02)', 'rgba(0,255,65,0.01)'] } },
                        axisLine: { lineStyle: { color: 'rgba(0,255,65,0.22)' } },
                    },
                    series: [
                        {
                            type: 'radar',
                            data: [
                                {
                                    value: values,
                                    name: radarLabel,
                                    areaStyle: { color: 'rgba(0,255,65,0.15)' },
                                    backgroundStyle: { color: 'transparent' },
                                    lineStyle: { color: '#00ff41', width: 2 },
                                    itemStyle: { color: '#00ff41' },
                                },
                            ],
                        },
                    ],
                    tooltip: { show: true },
                };
                window.__countryRadarChart.setOption(option, true);
                try {
                    window.__countryRadarChart.resize();
                } catch (e) {
                    // ignore
                }
            };

            // Cache-first：切换国家时先展示缓存，再后台静默刷新
            const cacheKey = effectiveIsGlobal ? 'GLOBAL' : (countryCode || rawCountry || 'UNKNOWN');
            // 竞态保护：保证旧国家请求不会覆盖新国家 UI
            const requestKey = String(cacheKey || '').toUpperCase();
            const requestSeq = (() => {
                try {
                    if (!window.__countryDashboardRequestSeq) window.__countryDashboardRequestSeq = 0;
                    const seq = ++window.__countryDashboardRequestSeq;
                    window.__countryDashboardLatestRequest = { seq, key: requestKey, at: Date.now() };
                    return seq;
                } catch {
                    return 0;
                }
            })();
            const isStaleRequest = () => {
                try {
                    const latest = window.__countryDashboardLatestRequest;
                    if (!latest) return false;
                    if (latest.seq !== requestSeq) return true;
                    if (String(latest.key || '').toUpperCase() !== requestKey) return true;
                    // 在国家透视模式下，还要校验 currentDrawerCountry（避免 US 请求回写 CN 面板）
                    if (!effectiveIsGlobal && typeof currentViewState === 'string' && currentViewState === 'COUNTRY') {
                        const cur = String(currentDrawerCountry?.code || '').toUpperCase();
                        const expected = String(countryCode || '').toUpperCase();
                        if (cur && expected && cur !== expected) return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            };
            try {
                if (!window.__countryDashboardCache) window.__countryDashboardCache = new Map();
                if (opts.preferCache) {
                    const hit = window.__countryDashboardCache.get(cacheKey);
                    const cachedData = hit && typeof hit === 'object' ? (hit.data || null) : null;
                    if (cachedData && typeof cachedData === 'object') {
                        try {
                            // 状态：缓存命中即视为稳定（避免“闪白”）
                            if (statusEl) statusEl.textContent = 'DATA: STABLE';
                            setValueOrNA(usersValEl, cachedData.totalUsers ?? cachedData.total_users ?? null);
                            setValueOrNA(analysisValEl, cachedData.totalAnalysis ?? cachedData.total_analysis ?? null);

                            const l = cachedData.avg_l ?? cachedData.avgL ?? null;
                            const p = cachedData.avg_p ?? cachedData.avgP ?? null;
                            const d1 = cachedData.avg_d ?? cachedData.avgD ?? null;
                            const e1 = cachedData.avg_e ?? cachedData.avgE ?? null;
                            const f1 = cachedData.avg_f ?? cachedData.avgF ?? null;
                            const radar = [l, p, d1, e1, f1].map((v) => Number(v || 0));
                            if (radarDom) {
                                // 只要有一个非 0 值就渲染（避免全 0 覆盖）
                                if (radar.some((x) => Number(x) > 0)) renderRadar(radar);
                            }
                        } catch { /* ignore */ }
                    }
                }
            } catch { /* ignore */ }

            // 人格分布（基于最新记录/实时流的轻量聚合展示）
            const INVALID_NAMES = new Set(['自动上报用户', 'anonymous', 'guest', '']);
            const _cleanHandle = (s) => String(s ?? '').trim().replace(/^@+/, '').trim();
            const _isInvalidHandle = (s) => {
                const x = _cleanHandle(s).toLowerCase();
                return INVALID_NAMES.has(x) || INVALID_NAMES.has(String(s ?? '').trim());
            };
            const _looksLikeGitHubUsername = (s, identity = null) => {
                const h = _cleanHandle(s);
                if (!h) return false;
                if (_isInvalidHandle(h)) return false;
                // 优先使用项目内既有校验函数（支持 user_identity 兜底）
                try {
                    if (typeof isValidGitHubUsername === 'function') return !!isValidGitHubUsername(h, identity);
                } catch { /* ignore */ }
                // fallback：GitHub 用户名规则（近似）
                if (h.length > 39) return false;
                if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(h)) return false;
                if (h.includes('--')) return false;
                return true;
            };
            const _regionName = (maybeCode) => {
                const raw = String(maybeCode ?? '').trim();
                if (!raw) return '';
                const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : '';
                if (!code) return raw;
                try {
                    const loc = (typeof currentLang === 'string' && currentLang === 'en') ? 'en' : 'zh-CN';
                    const dn = new Intl.DisplayNames([loc], { type: 'region' });
                    return dn.of(code) || code;
                } catch {
                    return code;
                }
            };
            const _resolveUserMeta = (r) => {
                const identity = r?.user_identity ?? r?.userIdentity ?? null;
                const githubRaw = _cleanHandle(r?.github_username ?? r?.githubUsername ?? r?.gh ?? r?.github ?? '');
                const u1 = _cleanHandle(r?.user_name ?? r?.userName ?? r?.username ?? r?.user ?? '');
                const fp = _cleanHandle(r?.fingerprint ?? r?.fp ?? r?.fpId ?? r?.user_fingerprint ?? '');
                const id = _cleanHandle(r?.user_id ?? r?.userId ?? r?.id ?? '');

                // GitHub 优先：显式 github_username，其次 user_name 也可能就是 GitHub 用户名
                const github = _looksLikeGitHubUsername(githubRaw, identity)
                    ? githubRaw
                    : (_looksLikeGitHubUsername(u1, identity) ? u1 : '');
                const chosen = github || (!_isInvalidHandle(u1) ? u1 : '');
                const display = chosen
                    ? `@${chosen}`
                    : (fp ? `user_${fp.slice(0, 6)}` : (id ? `user_${id.slice(0, 6)}` : (currentLang === 'en' ? 'unknown' : '未知')));
                const avatar = github
                    ? `https://github.com/${encodeURIComponent(github)}.png?size=64`
                    : DEFAULT_AVATAR;
                const profileUrl = github ? `https://github.com/${encodeURIComponent(github)}` : '';
                return { display, avatar, profileUrl };
            };
            const renderRealtime = (records) => {
                const box = document.getElementById('rtRealtimeList');
                if (!box) return;
                if (!Array.isArray(records) || records.length === 0) {
                    box.innerHTML = `<div class="text-zinc-500 text-xs">${escapeHtml(getI18nText('realtime.none') || (currentLang === 'en' ? 'No data' : '暂无人格分布数据'))}</div>`;
                    return;
                }
                box.innerHTML = records
                    .map((r) => {
                        const type =
                            r.personality_type ??
                            r.p_type ??
                            r.type ??
                            (r.personality && (r.personality.type || r.personality['type'])) ??
                            'UNKNOWN';
                        const rawLoc =
                            r.country_code ??
                            r.countryCode ??
                            r.region ??
                            r.ip_location ??
                            r.location ??
                            r.ipLocation ??
                            '';
                        const loc = _regionName(rawLoc) || (currentLang === 'en' ? 'Unknown' : '未知');
                        const u = _resolveUserMeta(r);
                        const nameHtml = u.profileUrl
                            ? `<a href="${escapeHtml(u.profileUrl)}" target="_blank" rel="noopener noreferrer" class="text-[10px] text-green-400/90 mt-1 truncate hover:underline">${escapeHtml(u.display)}</a>`
                            : `<div class="text-[10px] text-green-400/90 mt-1 truncate">${escapeHtml(u.display)}</div>`;
                        return `
                            <div class="border border-white/10 bg-zinc-950/40 p-3">
                                <div class="flex items-center gap-3">
                                    <img src="${escapeHtml(u.avatar)}" alt="" width="28" height="28" style="width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid rgba(0,255,65,0.25);" />
                                    <div class="min-w-0 flex-1">
                                        <div class="flex justify-between gap-3">
                                            <div class="text-white font-bold truncate">${escapeHtml(String(type).toUpperCase())}</div>
                                            <div class="text-[10px] text-zinc-500 truncate">${escapeHtml(loc)}</div>
                                        </div>
                                        ${nameHtml}
                                    </div>
                                </div>
                            </div>
                        `;
                    })
                    .join('');
            };

            const renderErrorState = (message) => {
                if (statusEl) statusEl.textContent = 'DATA: ERROR';
                if (usersValEl) usersValEl.textContent = 'N/A';
                if (analysisValEl) analysisValEl.textContent = 'N/A';
                stopFlash(usersCardEl || usersValEl);
                stopFlash(analysisCardEl || analysisValEl);

                renderRadarMessage(message);
                const topTalentsEl = document.getElementById('rtTopTalentsList');
                if (topTalentsEl) topTalentsEl.innerHTML = '';
                const globalRatioEl = document.getElementById('rtGlobalRatio');
                if (globalRatioEl) globalRatioEl.textContent = 'N/A';
                const meritEl = document.getElementById('rtMeritBoard');
                if (meritEl) meritEl.textContent = currentLang === 'en' ? 'Analyzed -- ×10k chars' : '已累计分析 -- 万字';
                if (realtimeDom) {
                    // countryName 变量在此作用域不存在，使用入参回退重试
                    const retryArg = escapeHtml(JSON.stringify(countryNameOrCode));
                    realtimeDom.innerHTML = `
                        <div class="border border-red-500/30 bg-red-950/20 p-4">
                            <div class="text-red-300 text-sm font-bold mb-2">${escapeHtml(getI18nText('error.data_load_failed') || 'Failed to load data')}</div>
                            <div class="text-zinc-400 text-xs mb-3">${escapeHtml(message || '')}</div>
                            <button
                                type="button"
                                class="px-3 py-1.5 text-xs border border-red-400/60 text-red-200 hover:bg-red-400/10 transition-colors"
                                onclick="updateCountryDashboard(${retryArg})"
                            >[RETRY]</button>
                        </div>
                    `;
                }
            };

            // 非全网：仅更新状态（词云由 loadWordCloud() 负责渲染）
            if (!effectiveIsGlobal && !opts.silent) {
                if (statusEl) statusEl.textContent = 'DATA: FETCHING';
            }

            try {
                if (statusEl) statusEl.textContent = 'DATA: FETCHING';
                // 请求发起前先给出加载态，避免旧数据误导
                if (!opts.silent) {
                    renderRadarMessage(getI18nText('radar.loading') || 'Loading...');
                    if (realtimeDom) realtimeDom.innerHTML = `<div class="text-zinc-500 text-xs">${escapeHtml(getI18nText('common.loading') || (currentLang === 'en' ? 'Loading...' : '加载中...'))}</div>`;
                }

                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const payload = await resp.json();
                // 后端返回可能是“顶层完整字段 + data(兼容包装)”的结构。
                // 不能直接取 payload.data（它可能只包含部分字段），否则会导致 totalAnalysis/totalChars 等变成 N/A。
                const root = (payload && typeof payload === 'object') ? payload : {};
                const nested = (root && typeof root.data === 'object' && root.data) ? root.data : {};
                const data = { ...root, ...nested };
                if (isStaleRequest()) return;

                // 写入缓存（供下次“秒切换”使用）
                try {
                    if (!window.__countryDashboardCache) window.__countryDashboardCache = new Map();
                    window.__countryDashboardCache.set(cacheKey, { data, ts: Date.now() });
                } catch { /* ignore */ }
                
                // =========================
                // 语义爆发（黑话榜）数据源：top10 + cloud50（按国家过滤）
                // =========================
                try {
                    if (isStaleRequest()) return;
                    window.__latestTop10 = Array.isArray(data.top10) ? data.top10 : null;
                    window.__latestCloud50 = Array.isArray(data.cloud50) ? data.cloud50 : null;
                    // 直接用本次响应渲染（避免重复请求）
                    try { window.renderVibeCardFromData && window.renderVibeCardFromData(countryNameOrCode, data); } catch (e2) { /* ignore */ }
                } catch (e1) { /* ignore */ }

                // 字段映射（兼容 total_users/totalUsers 等）
                // 【注意】国家模式下,data.totalUsers 已经是该国数据,不需要从 data.us_stats 读取
                const globalTotalUsersRaw =
                    data.totalUsers ??
                    data.total_users ??
                    data.totalusers ??
                    null;
                const globalTotalAnalysisRaw =
                    data.totalAnalysis ??
                    data.total_analysis ??
                    data.totalanalysis ??
                    null;

                // 雷达图数据：兼容两种后端结构：
                // 1) v_global_stats_v6 / RPC: avg_l/avg_p/... 或 avgL/avgP/...
                // 2) 聚合版：globalAverage / averages: {L,P,D,E,F}
                const avgObj =
                    (data.globalAverage && typeof data.globalAverage === 'object' ? data.globalAverage : null) ||
                    (data.averages && typeof data.averages === 'object' ? data.averages : null) ||
                    (data.average && typeof data.average === 'object' ? data.average : null) ||
                    null;
                const avg_l = data.avg_l ?? data.avgL ?? avgObj?.L ?? avgObj?.l ?? null;
                const avg_p = data.avg_p ?? data.avgP ?? avgObj?.P ?? avgObj?.p ?? null;
                const avg_d = data.avg_d ?? data.avgD ?? avgObj?.D ?? avgObj?.d ?? null;
                const avg_e = data.avg_e ?? data.avgE ?? avgObj?.E ?? avgObj?.e ?? null;
                const avg_f = data.avg_f ?? data.avgF ?? avgObj?.F ?? avgObj?.f ?? null;

                // 雷达图数据强制转换：避免 "55.0" 这类字符串导致 ECharts 异常
                const radarData = [
                    Number(avg_l || 0),
                    Number(avg_p || 0),
                    Number(avg_d || 0),
                    Number(avg_e || 0),
                    Number(avg_f || 0),
                ];

                // AI 功德簿：累计字数（万字）
                // 【修复】国家模式下直接从 data 读取(不再依赖 data.us_stats)
                const meritEl = document.getElementById('rtMeritBoard');
                const totalCharsSumRaw =
                    data.totalCharsSum ??
                    data.total_chars_sum ??
                    data.totalcharssum ??
                    data.totalChars ??
                    data.total_chars ??
                    null;
                const totalCharsSum = Number(totalCharsSumRaw);
                if (meritEl) {
                    // 0 也应显示（否则看起来像“未加载”）
                    if (Number.isFinite(totalCharsSum) && totalCharsSum >= 0) {
                        meritEl.textContent =
                            currentLang === 'en'
                                ? `Analyzed ${(totalCharsSum / 10000).toFixed(1)} ×10k chars`
                                : `已累计分析 ${(totalCharsSum / 10000).toFixed(1)} 万字`;
                    } else {
                        meritEl.textContent = currentLang === 'en' ? 'Analyzed -- ×10k chars' : '已累计分析 -- 万字';
                    }
                }

                // 如果是美国，需要同时拿到：本地区 totalUsers / totalAnalysis 和全球 totalUsers（用于 Ratio）
                // 【修复】根据请求类型判断数据结构:
                // - 全网请求 (isGlobal=true): data.totalUsers 是全网数据
                // - 国家请求 (country_code=US): data.totalUsers 已经是该国过滤后的数据，需要额外请求全网数据用于占比计算
                let globalTotalUsers = Number(
                    data.totalUsers ?? data.total_users ?? data.totalusers ?? null
                );
                let globalTotalAnalysis = Number(
                    data.totalAnalysis ?? data.total_analysis ?? data.totalanalysis ?? null
                );
                
                let localTotalUsers;
                let localTotalAnalysis;
                
                if (effectiveIsGlobal) {
                    // 全网模式:本地=全球
                    localTotalUsers = globalTotalUsers;
                    localTotalAnalysis = globalTotalAnalysis;
                } else {
                    // 【修复核心问题】国家/地区模式:
                    // 当传入 country_code=US 时，API返回的 data.totalUsers 已经是该国数据(已过滤)
                    // 不应该再从 data.us_stats 中读取(那是旧的嵌套结构)
                    localTotalUsers = Number(
                        data.totalUsers ?? data.total_users ?? data.totalusers ?? null
                    );
                    localTotalAnalysis = Number(
                        data.totalAnalysis ?? data.total_analysis ?? data.totalanalysis ?? null
                    );
                    
                // 国家模式下，需要重新获取全网数据用于占比计算
                // (因为上面的 globalTotalUsers 实际是该国数据)
                    try {
                        const gResp = await fetch(`${API_ENDPOINT}api/global-average`);
                        if (gResp.ok) {
                            const gPayload = await gResp.json();
                        // 与主请求一致：合并 root + data（避免只取到部分字段）
                        const gRoot = (gPayload && typeof gPayload === 'object') ? gPayload : {};
                        const gNested = (gRoot && typeof gRoot.data === 'object' && gRoot.data) ? gRoot.data : {};
                        const gData = { ...gRoot, ...gNested };
                            globalTotalUsers = Number(gData.totalUsers ?? gData.total_users ?? gData.totalusers ?? 0);
                            globalTotalAnalysis = Number(gData.totalAnalysis ?? gData.total_analysis ?? gData.totalanalysis ?? 0);
                        }
                    } catch (e) {
                        console.warn('[CountryDashboard] 获取全网数据失败，占比可能不准确:', e);
                    }
                }

                // 兜底：确保 finite number
                if (!Number.isFinite(globalTotalUsers)) globalTotalUsers = 0;
                if (!Number.isFinite(globalTotalAnalysis)) globalTotalAnalysis = 0;
                if (!Number.isFinite(localTotalUsers)) localTotalUsers = 0;
                if (!Number.isFinite(localTotalAnalysis)) localTotalAnalysis = 0;

                const latest =
                    data.latest_records ??
                    data.latestRecords ??
                    data.latest_records_v6 ??
                    data.latest ??
                    data.latestRecordsV6 ??
                    [];

                // =========================
                // 国家累计 & 我的排名（来自 /api/country-summary 扩展字段）
                // - 拆分成两张卡：#rtCountryTotals（Σ）与 #rtMyCountryRanks（me + rank）
                // =========================
                try {
                    const totalsBox = document.getElementById('rtCountryTotals');
                    const ranksBox = document.getElementById('rtMyCountryRanks');
                    if (totalsBox || ranksBox) {
                        const fmt = (n) => new Intl.NumberFormat('zh-CN').format(Number(n) || 0);
                        const fp = (() => { try { return localStorage.getItem('user_fingerprint') || window.fpId || ''; } catch { return ''; } })();
                        const uid = (() => {
                            try {
                                // GitHub 登录后通常清掉 fingerprint，此时必须带 user_id 才能算“我的排名”
                                const fromWindow = (window.currentUser && window.currentUser.id) ||
                                    (window.currentUserData && window.currentUserData.id) ||
                                    (window.supabaseAuthUser && window.supabaseAuthUser.id) ||
                                    (window.authenticatedUserId) ||
                                    (window.__authUserId) ||
                                    '';
                                if (fromWindow) return String(fromWindow);
                                // 兜底：尝试从 localStorage 取（部分登录链路会持久化）
                                return localStorage.getItem('github_user_id') ||
                                    localStorage.getItem('supabase_user_id') ||
                                    localStorage.getItem('auth_user_id') ||
                                    localStorage.getItem('user_id') ||
                                    '';
                            } catch { return ''; }
                        })();
                        const cName = (() => {
                            try {
                                const cc = String(countryCode || '').trim().toUpperCase();
                                // 优先使用内置映射的英文国名（更可能与数据库中的 legacy 全名一致，如 "United States"）
                                const mapped = (typeof countryNameMap === 'object' && countryNameMap && countryNameMap[cc])
                                    ? (countryNameMap[cc].en || countryNameMap[cc].zh || '')
                                    : '';
                                if (mapped) return String(mapped);
                                return (currentDrawerCountry && currentDrawerCountry.name) ? String(currentDrawerCountry.name) : '';
                            } catch {
                                return '';
                            }
                        })();
                        // 加时间戳：避免 edge cache/中间层缓存导致“永远是 0”
                        const url2 = `${API_ENDPOINT}api/country-summary?country=${encodeURIComponent(String(countryCode || '').toUpperCase())}${cName ? `&country_name=${encodeURIComponent(cName)}` : ''}${uid ? `&user_id=${encodeURIComponent(uid)}` : ''}${fp ? `&fingerprint=${encodeURIComponent(fp)}` : ''}&_ts=${Date.now()}`;

                        // cache-first：避免切换抖动
                        if (!window.__countryTotalsCache) window.__countryTotalsCache = new Map();
                        const cacheKey2 = `CT:${String(countryCode || '').toUpperCase()}`;
                        const hit2 = window.__countryTotalsCache.get(cacheKey2);
                        if (hit2 && typeof hit2 === 'object') {
                            if (totalsBox && hit2.totalsHtml) totalsBox.innerHTML = hit2.totalsHtml;
                            if (ranksBox && hit2.ranksHtml) ranksBox.innerHTML = hit2.ranksHtml;
                        }
                        if (totalsBox && !String(totalsBox.innerHTML || '').trim()) totalsBox.innerHTML = '<div class="text-zinc-500 text-xs">加载中...</div>';
                        if (ranksBox && !String(ranksBox.innerHTML || '').trim()) ranksBox.innerHTML = '<div class="text-zinc-500 text-xs">加载中...</div>';

                        // 并发保护：复用 updateCountryDashboard 的 requestSeq / isStaleRequest
                        const resp2 = await fetch(url2, { cache: 'no-cache' });
                        if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
                        const payload2 = await resp2.json().catch(() => null);
                        if (!payload2 || typeof payload2 !== 'object') throw new Error('bad payload');
                        if (isStaleRequest()) return;

                        const totals = payload2.countryTotals || payload2.data?.countryTotals || null;
                        const totalsRanks = payload2.countryTotalsRanks || payload2.data?.countryTotalsRanks || null;
                        const ranks = payload2.myCountryRanks || payload2.data?.myCountryRanks || null;
                        const meVals = payload2.myCountryValues || payload2.data?.myCountryValues || null;
                        // 关键：高分图谱的数据源来自 country-summary，而不是 global-average
                        try {
                            data.topByMetrics = payload2.topByMetrics || payload2.data?.topByMetrics || [];
                        } catch { /* ignore */ }

                        const rowTotals = (label, totalVal, r) => {
                            const hasRank = r && (r.rank !== null && r.rank !== undefined) && Number.isFinite(Number(r.rank));
                            const rankText = hasRank ? `#${Number(r.rank)}/${Number(r.total) || ''}` : '--';
                            return `
                                <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                                    <div class="text-zinc-200">${label}</div>
                                    <div class="flex items-center gap-3 min-w-0">
                                        <span class="text-[10px] text-zinc-500">Σ ${fmt(totalVal)}</span>
                                        <span class="text-[10px] text-green-500 font-bold tabular-nums">${rankText}</span>
                                    </div>
                                </div>
                            `;
                        };
                        const fmtMe = (v) => (v === undefined || v === null || Number.isNaN(Number(v))) ? '--' : fmt(v);
                        const rowRanks = (label, myVal, r) => {
                            const hasRank = r && (r.rank !== null && r.rank !== undefined) && Number.isFinite(Number(r.rank));
                            const rankText = hasRank ? `#${Number(r.rank)}/${Number(r.total) || ''}` : '--';
                            return `
                                <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                                    <div class="text-zinc-200">${label}</div>
                                    <div class="flex items-center gap-3 min-w-0">
                                        <span class="text-[10px] text-zinc-400">me ${fmtMe(myVal)}</span>
                                        <span class="text-[10px] text-green-500 font-bold tabular-nums">${rankText}</span>
                                    </div>
                                </div>
                            `;
                        };

                        const totalsHtml = totals
                            ? [
                                rowTotals(getI18nText('countryTotals.messages') || 'Messages', totals.total_messages, totalsRanks?.total_messages),
                                rowTotals(getI18nText('countryTotals.totalChars') || 'Total Chars', totals.total_chars, totalsRanks?.total_chars),
                                rowTotals(getI18nText('countryTotals.userChars') || 'User Chars', totals.total_user_chars, totalsRanks?.total_user_chars),
                                rowTotals(getI18nText('countryTotals.avgLen') || 'Avg Len', Math.round(Number(totals.avg_user_message_length) || 0), totalsRanks?.avg_user_message_length),
                                rowTotals(getI18nText('countryTotals.jiafang') || 'Jiafang', totals.jiafang_count, totalsRanks?.jiafang_count),
                                rowTotals(getI18nText('countryTotals.ketao') || 'Ketao', totals.ketao_count, totalsRanks?.ketao_count),
                              ].join('')
                            : `<div class="text-zinc-500 text-xs">${currentLang === 'en' ? 'No data' : '暂无数据'}</div>`;

                        const ranksHtml = totals
                            ? [
                                rowRanks(getI18nText('countryTotals.messages') || 'Messages', meVals?.total_messages, ranks?.total_messages),
                                rowRanks(getI18nText('countryTotals.totalChars') || 'Total Chars', meVals?.total_chars, ranks?.total_chars),
                                rowRanks(getI18nText('countryTotals.userChars') || 'User Chars', meVals?.total_user_chars, ranks?.total_user_chars),
                                rowRanks(getI18nText('countryTotals.avgLen') || 'Avg Len', Math.round(Number(meVals?.avg_user_message_length) || 0), ranks?.avg_user_message_length),
                                rowRanks(getI18nText('countryTotals.jiafang') || 'Jiafang', meVals?.jiafang_count, ranks?.jiafang_count),
                                rowRanks(getI18nText('countryTotals.ketao') || 'Ketao', meVals?.ketao_count, ranks?.ketao_count),
                              ].join('')
                            : `<div class="text-zinc-500 text-xs">${currentLang === 'en' ? 'No data' : '暂无数据'}</div>`;

                        if (totalsBox) totalsBox.innerHTML = totalsHtml;
                        if (ranksBox) ranksBox.innerHTML = ranksHtml;
                        try { window.__countryTotalsCache.set(cacheKey2, { totalsHtml, ranksHtml, ts: Date.now() }); } catch { /* ignore */ }
                    }
                } catch (e) {
                    // 不阻断主面板
                    try {
                        const totalsBox = document.getElementById('rtCountryTotals');
                        const ranksBox = document.getElementById('rtMyCountryRanks');
                        const noData = escapeHtml(getI18nText('common.no_data') || 'No data');
                        if (totalsBox && !totalsBox.innerHTML.trim()) totalsBox.innerHTML = `<div class="text-zinc-500 text-xs">${noData}</div>`;
                        if (ranksBox && !ranksBox.innerHTML.trim()) ranksBox.innerHTML = `<div class="text-zinc-500 text-xs">${noData}</div>`;
                    } catch { /* ignore */ }
                }

                // 数值填充 + UI 降级：0/空不闪烁
                // 规则：地区卡片展示“当前地区”口径；全网模式展示全网
                setValueOrNA(usersValEl, effectiveIsGlobal ? globalTotalUsers : localTotalUsers);
                setValueOrNA(analysisValEl, effectiveIsGlobal ? globalTotalAnalysis : localTotalAnalysis);
                if (usersValEl && usersValEl.textContent !== 'N/A') flash(usersCardEl || usersValEl);
                if (analysisValEl && analysisValEl.textContent !== 'N/A') flash(analysisCardEl || analysisValEl);

                // 雷达图空状态：全部为 0 时显示提示而不是渲染空图
                if (radarData.every((v) => Number(v) === 0)) {
                    renderRadarMessage(getI18nText('radar.insufficient') || 'Not enough data');
                } else {
                    renderRadar(radarData);
                }

                // =========================
                // 派生指标计算与渲染
                // =========================
                const clampPct = (n) => {
                    const x = Number(n);
                    if (!Number.isFinite(x)) return 0;
                    return Math.max(0, Math.min(100, x));
                };
                const avgL = radarData[0];
                const avgP = radarData[1];
                const avgD = radarData[2];
                const avgE = radarData[3];
                const avgF = radarData[4];

                const metrics = {
                    power: clampPct(avgD * 0.7 + avgP * 0.3),
                    breakdown: clampPct((100 - avgE) * 0.8),
                    semantic: clampPct(avgL * 0.6 + avgF * 0.4),
                    ratio: clampPct(globalTotalUsers > 0 ? (localTotalUsers / globalTotalUsers) * 100 : 0),
                };
                if (effectiveIsGlobal) metrics.ratio = 100;

                // 数值填充
                const powerScoreEl = document.getElementById('rtPowerScore');
                const breakdownRateEl = document.getElementById('rtBreakdownRate');
                const semanticScoreEl = document.getElementById('rtSemanticScore');
                const ratioPctEl = document.getElementById('rtRatioPct');
                if (powerScoreEl) powerScoreEl.textContent = Number.isFinite(metrics.power) ? metrics.power.toFixed(1) : 'N/A';
                if (breakdownRateEl) breakdownRateEl.textContent = Number.isFinite(metrics.breakdown) ? `${metrics.breakdown.toFixed(1)}%` : 'N/A';
                if (semanticScoreEl) semanticScoreEl.textContent = Number.isFinite(metrics.semantic) ? metrics.semantic.toFixed(1) : 'N/A';
                if (ratioPctEl) ratioPctEl.textContent = `${metrics.ratio.toFixed(2)}%`;

                // 进度条联动
                const setBar = (id, v) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    const pct = clampPct(v);
                    el.style.width = `${pct.toFixed(1)}%`;
                };
                setBar('power-bar', metrics.power);
                setBar('breakdown-bar', metrics.breakdown);
                setBar('semantic-bar', metrics.semantic);
                setBar('ratio-bar', metrics.ratio);

                // =========================
                // 需求：高分图谱 (#rtTopTalentsList)
                // 新口径：该国 6 项指标 TopN（/api/country-summary.topByMetrics[].leaders）
                // - 新版 UI：6 个标签 -> 6 张纵向卡片（每张卡片：标题 + TopN）
                // - 行字段：名次 / 用户（头像+用户名）/ 分数 / 每日晋级（▲/▼，无数据则 --）
                // =========================
                const topTalentsEl = document.getElementById('rtTopTalentsList');
                const topTalentsHeroesEl = document.getElementById('rtTopTalentsHeroes');
                let topBy = Array.isArray(data.topByMetrics) ? data.topByMetrics : [];
                const eliteHintEl = document.getElementById('rtEliteHint');

                const metricOrder = [
                    'total_messages',
                    'total_chars',
                    'total_user_chars',
                    'avg_user_message_length',
                    'jiafang_count',
                    'ketao_count'
                ];
                topBy = topBy
                    .slice()
                    .sort((a, b) => metricOrder.indexOf(String(a?.key || '')) - metricOrder.indexOf(String(b?.key || '')));

                // 旧 UI：顶部指示器 + “Swipe” 提示 -> 新 UI 不再需要
                if (topTalentsHeroesEl) {
                    topTalentsHeroesEl.innerHTML = '';
                    try { topTalentsHeroesEl.style.display = 'none'; } catch { /* ignore */ }
                }
                if (eliteHintEl) {
                    try { eliteHintEl.style.display = 'none'; } catch { /* ignore */ }
                }
                if (topTalentsEl) {
                    if (!topBy || topBy.length === 0) {
                        topTalentsEl.innerHTML = `<div class="text-zinc-500 text-xs text-center">${escapeHtml(getI18nText('lpdef.none') || 'No data')}</div>`;
                    } else {
                        const formatMetricValue = (value, key) => {
                            const n = Number(value);
                            if (!Number.isFinite(n)) return '--';
                            const k = String(key || '').toLowerCase();
                            // chars: 超过 1000 => k（如 275.3k）
                            if (k.includes('chars')) {
                                if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
                                return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN').format(Math.round(n));
                            }
                            // avg_user_message_length：保留 1 位小数
                            if (k === 'avg_user_message_length') return n.toFixed(1);
                            // 其余整数：直接显示（带分隔符）
                            return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN').format(Math.round(n));
                        };
                        const labelForMetric = (it) => {
                            return (currentLang === 'en')
                                ? (it?.labelEn || it?.key || '--')
                                : (it?.labelZh || it?.key || '--');
                        };

                        // “日变”字段兼容：后端未来可返回任一字段名即可直接显示
                        const _resolveDailyDelta = (row) => {
                            try {
                                const currRank = Number(row?.rn ?? row?.rank ?? row?.position ?? row?.pos ?? NaN);
                                const prevRank = Number(row?.prev_rank ?? row?.prevRank ?? row?.yesterday_rank ?? row?.yesterdayRank ?? row?.rank_prev ?? row?.rankPrev ?? NaN);
                                if (Number.isFinite(currRank) && Number.isFinite(prevRank)) {
                                    // 约定：prev - curr > 0 表示名次上升（更靠前）
                                    return prevRank - currRank;
                                }
                                const d = Number(
                                    row?.delta_rank ??
                                    row?.deltaRank ??
                                    row?.rank_delta ??
                                    row?.rankDelta ??
                                    row?.rank_change ??
                                    row?.rankChange ??
                                    row?.daily_delta_rank ??
                                    row?.dailyDeltaRank ??
                                    row?.dailyChange ??
                                    row?.daily_change ??
                                    NaN
                                );
                                return Number.isFinite(d) ? d : null;
                            } catch {
                                return null;
                            }
                        };
                        const _renderDelta = (delta) => {
                            if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) {
                                return `<span class="lpdef-rank-delta na">--</span>`;
                            }
                            const d = Number(delta) || 0;
                            if (d > 0) return `<span class="lpdef-rank-delta up">▲ ${Math.abs(d)}</span>`;
                            if (d < 0) return `<span class="lpdef-rank-delta down">▼ ${Math.abs(d)}</span>`;
                            return `<span class="lpdef-rank-delta flat">—</span>`;
                        };
                        const _headerRow = () => {
                            return `
                                <div class="lpdef-rank-row lpdef-rank-header-row">
                                    <div class="lpdef-rank-left">
                                        <span class="lpdef-rank-rn">${escapeHtml(currentLang === 'en' ? 'Rank' : '名次')}</span>
                                        <span class="lpdef-rank-name" style="min-width:0;flex:1 1 auto;">${escapeHtml(currentLang === 'en' ? 'User' : '用户')}</span>
                                    </div>
                                    <div class="lpdef-rank-right">
                                        <span class="lpdef-rank-score">${escapeHtml(currentLang === 'en' ? 'Score' : '分数')}</span>
                                        <span class="lpdef-rank-delta">${escapeHtml(currentLang === 'en' ? 'Daily' : '日变')}</span>
                                    </div>
                                </div>
                            `;
                        };

                        const cardsHtml = topBy.map((it, idx) => {
                            const label = String(labelForMetric(it) || '').trim() || `M${idx + 1}`;
                            const leaders = Array.isArray(it?.leaders) ? it.leaders : (it?.user ? [{ rank: 1, score: it.score, user: it.user }] : []);
                            const rows = leaders.slice(0, 10).map((row) => {
                                const user = row?.user || {};
                                const meta = _resolveUserMeta(user);
                                const metricKey = String(it?.key || it?.col || '').trim();
                                const scoreText = formatMetricValue(row?.score, metricKey);
                                const rn = Number(row?.rn ?? row?.rank ?? '') || 0;
                                const rankText = rn > 0 ? `#${rn}` : (row?.rank ? `#${row.rank}` : '#--');
                                const lpdefText = (() => {
                                    const v = user?.lpdef ?? user?.lpDef ?? '';
                                    const s = String(v || '').trim();
                                    return s ? s : '';
                                })();
                                // 可选但推荐：基于 lpdef 的简短性格标签（优先用 personalityNamesEn，否则用 5 位 vibe_index）
                                const personaTag = (() => {
                                    try {
                                        const idx5 = lpdefText ? lpdefToVibeIndex(lpdefText) : null;
                                        if (!idx5 || String(idx5).length !== 5) return '';
                                        if (currentLang === 'en') {
                                            const cfg = window.__LANG_CONFIG;
                                            const namesEn = cfg && cfg.personalityNamesEn ? cfg.personalityNamesEn : null;
                                            if (namesEn && typeof namesEn[idx5] === 'string' && String(namesEn[idx5]).trim()) {
                                                return String(namesEn[idx5]).trim();
                                            }
                                        }
                                        return `V${idx5}`;
                                    } catch {
                                        return '';
                                    }
                                })();
                                const nameHtml = meta.profileUrl
                                    ? `<a href="${escapeHtml(meta.profileUrl)}" target="_blank" rel="noopener noreferrer" class="lpdef-rank-name hover:underline">${escapeHtml(meta.display)}</a>`
                                    : `<span class="lpdef-rank-name" style="color: rgba(229,231,235,0.75)">${escapeHtml(meta.display)}</span>`;
                                const delta = _resolveDailyDelta(row);
                                return `
                                    <div class="lpdef-rank-row">
                                        <div class="lpdef-rank-left">
                                            <span class="lpdef-rank-rn">${escapeHtml(rankText)}</span>
                                            <img class="lpdef-rank-avatar" src="${escapeHtml(meta.avatar)}" alt="" onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';" />
                                            <div class="lpdef-name-wrap">
                                                ${nameHtml}
                                                ${personaTag ? `<span class="lpdef-persona-tag">${escapeHtml(personaTag)}</span>` : ``}
                                            </div>
                                        </div>
                                        <div class="lpdef-rank-right">
                                            <div class="lpdef-rank-score">${escapeHtml(String(scoreText))}</div>
                                            ${_renderDelta(delta)}
                                        </div>
                                    </div>
                                `;
                            }).join('');

                            return `
                                <div class="lpdef-metric-card" data-metric-index="${idx}">
                                    <div class="lpdef-metric-title">${escapeHtml(label)}</div>
                                    <div class="lpdef-rank-list">
                                        ${_headerRow()}
                                        ${rows || `<div class="text-zinc-500 text-xs text-center">${escapeHtml(getI18nText('common.no_data') || 'No data')}</div>`}
                                    </div>
                                </div>
                            `;
                        }).join('');

                        topTalentsEl.innerHTML = `<div class="lpdef-metric-cards">${cardsHtml}</div>`;
                    }
                }

                // 语义爆发词云卡片：仅保留词云形态（ECharts wordCloud），不再渲染 slang/merit/sv_slang 文本区
                // 词云数据由 loadWordCloud() 通过 /api/v2/wordcloud-data 动态拉取

                // =========================
                // 需求：全球占比 (#rtGlobalRatio)
                // 【修复】使用前面修复的 localTotalUsers 和 globalTotalUsers
                // 公式：(localTotalUsers / globalTotalUsers * 100).toFixed(1) + '%'
                // 同步更新文字与进度条
                // =========================
                const globalRatioEl = document.getElementById('rtGlobalRatio');
                const ratioPct = (globalTotalUsers > 0)
                    ? (localTotalUsers / globalTotalUsers) * 100
                    : (effectiveIsGlobal ? 100 : metrics.ratio);
                const ratioPctClamped = clampPct(Number.isFinite(ratioPct) ? ratioPct : 0);
                const ratioText = `${ratioPctClamped.toFixed(1)}%`;
                if (globalRatioEl) globalRatioEl.textContent = ratioText;
                if (ratioPctEl) ratioPctEl.textContent = ratioText;
                setBar('ratio-bar', ratioPctClamped);

                // 饼图（ECharts pie）：替换旧 SVG 环形图
                try {
                    const pieDom = document.getElementById('rtGlobalRatioPie');
                    if (pieDom && typeof echarts !== 'undefined') {
                        const own = clampPct(ratioPctClamped);
                        const rest = clampPct(100 - own);
                        const label = effectiveIsGlobal ? 'GLOBAL' : (countryCode || 'REGION');
                        try {
                            const existing = window.__rtGlobalRatioPieChart;
                            const domChanged = existing && typeof existing.getDom === 'function' && existing.getDom() !== pieDom;
                            if (domChanged) {
                                try { existing.dispose(); } catch { /* ignore */ }
                                window.__rtGlobalRatioPieChart = null;
                            }
                        } catch { /* ignore */ }
                        if (!window.__rtGlobalRatioPieChart) {
                            window.__rtGlobalRatioPieChart = echarts.init(pieDom, null, { renderer: 'canvas' });
                            if (!window.__rtGlobalRatioPieResizeBound) {
                                window.__rtGlobalRatioPieResizeBound = true;
                                window.addEventListener('resize', () => {
                                    try { window.__rtGlobalRatioPieChart && window.__rtGlobalRatioPieChart.resize(); } catch { /* ignore */ }
                                });
                            }
                        }
                        window.__rtGlobalRatioPieChart.setOption({
                            backgroundColor: 'transparent',
                            tooltip: { trigger: 'item' },
                            series: [
                                {
                                    type: 'pie',
                                    radius: ['58%', '82%'],
                                    avoidLabelOverlap: true,
                                    label: { show: false },
                                    labelLine: { show: false },
                                    data: [
                                        { name: label, value: own, itemStyle: { color: '#00ff41' } },
                                        { name: 'OTHERS', value: rest, itemStyle: { color: '#3f3f46' } },
                                    ],
                                }
                            ]
                        }, true);
                    }
                } catch { /* ignore */ }

                // 复用现有 PK 条（左=Power，右=100-Power）
                const pkLeftFill = document.getElementById('rtPkLeftFill');
                const pkRightFill = document.getElementById('rtPkRightFill');
                const pkLeftPct = document.getElementById('rtPkLeftPct');
                const pkRightPct = document.getElementById('rtPkRightPct');
                if (pkLeftFill) pkLeftFill.style.width = `${metrics.power.toFixed(1)}%`;
                if (pkRightFill) pkRightFill.style.width = `${(100 - metrics.power).toFixed(1)}%`;
                if (pkLeftPct) pkLeftPct.textContent = `${metrics.power.toFixed(1)}%`;
                if (pkRightPct) pkRightPct.textContent = `${(100 - metrics.power).toFixed(1)}%`;

                // 破防等级 / 受虐人数（派生展示）
                const meltdownLevelEl = document.getElementById('rtMeltdownLevel');
                const meltdownVictimsEl = document.getElementById('rtMeltdownVictims');
                if (meltdownLevelEl) {
                    meltdownLevelEl.textContent =
                        metrics.breakdown >= 70 ? 'ELEVATED' :
                        metrics.breakdown >= 40 ? 'WARNING' :
                        'STABLE';
                }
                if (meltdownVictimsEl) {
                    meltdownVictimsEl.textContent = Number.isFinite(localTotalUsers)
                        ? new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN').format(Math.max(0, localTotalUsers))
                        : 'N/A';
                }

                // 语义爆发补充文案：核心特质 + 指标
                const dimKeys = ['L', 'P', 'D', 'E', 'F'];
                let maxIdx = 0;
                for (let i = 1; i < radarData.length; i++) {
                    if (Number(radarData[i]) > Number(radarData[maxIdx])) maxIdx = i;
                }
                const coreTrait = dimKeys[maxIdx] || 'L';
                const coreTraitEl = document.getElementById('rtCoreTrait');
                const traitMap = {
                    L: { zh: '逻辑力', en: 'Logic' },
                    P: { zh: '耐心值', en: 'Patience' },
                    D: { zh: '细腻度', en: 'Detail' },
                    E: { zh: '探索欲', en: 'Exploration' },
                    F: { zh: '反馈感', en: 'Feedback' },
                };
                const traitName = (currentLang === 'en' ? (traitMap[coreTrait]?.en) : (traitMap[coreTrait]?.zh)) || coreTrait;
                if (coreTraitEl) {
                    coreTraitEl.textContent =
                        (currentLang === 'en')
                            ? `Core trait: ${traitName} (${coreTrait}) · highest of 5D averages`
                            : `该地区核心特质：${traitName}（${coreTrait}）· 该国 5 维平均分最高项`;
                }

                const semanticMostUsedEl = document.getElementById('rtSemanticMostUsed');
                const semanticFreqEl = document.getElementById('rtSemanticFreq');
                if (semanticMostUsedEl) semanticMostUsedEl.textContent = `CORE_TRAIT: ${traitName} (${coreTrait})`;
                if (semanticFreqEl) semanticFreqEl.textContent = `SEMANTIC: ${metrics.semantic.toFixed(1)}`;

                // 全球占比列表（简单两项）
                const ratioListEl = document.getElementById('rtRatioList');
                if (ratioListEl) {
                    const label = effectiveIsGlobal ? 'GLOBAL' : (countryCode ? countryCode : 'REGION');
                    const ownPct = clampPct(Number.isFinite(ratioPct) ? ratioPct : metrics.ratio);
                    const rest = clampPct(100 - ownPct);
                    ratioListEl.innerHTML = `
                        <div class="flex justify-between text-xs">
                            <span class="flex items-center gap-2"><div class="w-2 h-2 bg-[#00ff41]"></div> ${label}</span>
                            <span class="font-bold">${ownPct.toFixed(2)}%</span>
                        </div>
                        <div class="flex justify-between text-xs text-zinc-500">
                            <span class="flex items-center gap-2"><div class="w-2 h-2 bg-zinc-700"></div> OTHERS</span>
                            <span class="font-bold">${rest.toFixed(2)}%</span>
                        </div>
                    `;
                }

                // NOTE: 已在上方“派生指标计算与渲染 / 语义爆发（真实动态化）”完成渲染，
                // 这里不再重复覆盖 powerScore / semanticBurst，避免 UI 抖动与逻辑分叉。

                renderRealtime(latest);

                if (statusEl) statusEl.textContent = 'DATA: STABLE';
            } catch (err) {
                console.error('[CountryDashboard] ❌ 更新失败:', err);
                renderErrorState(err && err.message ? String(err.message) : '网络异常或服务器错误');
            } finally {
                try { setRightDrawerLoading(false); } catch { /* ignore */ }
            }
        }
        
        // ==========================================
        // 原有代码继续...
        // ==========================================
        
        // =========================
        // 全局变量声明（确保在全局作用域，不在闭包内）
        // =========================
        const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content;
        // stats2 多语言：以 localStorage.lang 为准（'en' | 'zh'）
        const LANG_STORAGE_KEY = 'lang';
        const normalizeLang = (v) => {
            const s = String(v || '').trim().toLowerCase();
            if (s === 'en' || s.startsWith('en')) return 'en';
            if (s === 'zh' || s === 'zh-cn' || s.startsWith('zh')) return 'zh';
            return 'zh';
        };
        let currentLang = (() => {
            try {
                const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
                // 兼容旧键：appLanguage（index.html 历史遗留）
                const fallback = localStorage.getItem('appLanguage');
                return normalizeLang(savedLang || fallback || 'zh');
            } catch {
                return 'zh';
            }
        })();
        
        // Supabase 相关变量（全局作用域，不在任何函数内）
        let supabaseClient = null;
        let realtimeChannel = null;
        let presenceChannel = null; // Presence 频道，用于统计在线人数
        const SUPABASE_URL = 'https://dtcplfhcgnxdzpigmotb.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_-rrlujgXDNxqb-UsMJckNw_G2rn2e8x';
        
        // 默认头像常量（匿名受害者：使用内置 SVG，避免依赖外链 identicon）
        const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#00ff41" stop-opacity="0.9"/>
                  <stop offset="1" stop-color="#00b7ff" stop-opacity="0.9"/>
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="60" height="60" rx="14" fill="#0a0a0a" stroke="url(#g)" stroke-width="2"/>
              <circle cx="24" cy="28" r="5" fill="#e5e7eb"/>
              <circle cx="40" cy="28" r="5" fill="#e5e7eb"/>
              <rect x="20" y="40" width="24" height="6" rx="3" fill="#e5e7eb" opacity="0.9"/>
              <path d="M18 18h28" stroke="#00ff41" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>
              <path d="M18 50h28" stroke="#00ff41" stroke-opacity="0.25" stroke-width="3" stroke-linecap="round"/>
            </svg>
        `);
        
        // 无效用户名的默认值列表（这些值不应该请求GitHub头像）
        const INVALID_USERNAME_VALUES = ['自动上报用户', 'Anonymous', 'Guest', 'guest', 'anonymous', ''];
        
        // 用户状态配置
        const USER_STATUSES = {
            idle: { 
                label: '极速', 
                emoji: '🟢', 
                color: '#00ff41',
                status_color: '#00ff41',
                status: 'idle'
            },
            busy: { 
                label: '忙碌', 
                emoji: '🟠', 
                color: '#ff8c00',
                status_color: '#ff8c00',
                status: 'busy'
            },
            sprint: { 
                label: '冲刺', 
                emoji: '🚀', 
                color: '#ff006e',
                status_color: '#ff006e',
                status: 'sprint'
            }
        };
        
        // 当前用户状态（从localStorage加载）
        let currentUserStatus = localStorage.getItem('user_status') || 'idle';
        
        // 抽屉展开/折叠状态（从localStorage加载）
        let drawerExpanded = localStorage.getItem('drawer_expanded') !== 'false'; // 默认展开

        // 维度排名数据资源（从 rank-content.ts 加载）
        let RANK_RESOURCES = null;

        // ============================================
        // 【全局错误捕获】防止单个模块崩溃导致整个页面无法加载
        // ============================================
        window.addEventListener('error', (event) => {
            console.error('[Global Error Handler] ❌ 捕获到全局错误:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
            
            // 如果是语法错误，尝试继续执行关键初始化
            if (event.error && event.error.name === 'SyntaxError') {
                console.warn('[Global Error Handler] ⚠️ 检测到语法错误，尝试继续初始化关键功能...');
                // 不阻止默认行为，但记录错误
            }
        });
        
        // 捕获未处理的 Promise 拒绝
        window.addEventListener('unhandledrejection', (event) => {
            console.error('[Global Error Handler] ❌ 捕获到未处理的 Promise 拒绝:', event.reason);
            // 阻止默认行为（控制台报错），但记录错误
            event.preventDefault();
        });
        
        // ============================================
        // 初始化 Supabase 客户端（全局作用域直接执行）
        // ============================================
        // 使用轮询方式等待 SDK 加载完成
        let initAttempts = 0;
        const maxAttempts = 50; // 最多尝试 5 秒（50 * 100ms）

        const initInterval = setInterval(() => {
            initAttempts++;
            
            // 检查 supabase 是否已加载
            if (typeof supabase !== 'undefined') {
                clearInterval(initInterval);
                
                try {
                    // 实例化客户端（直接赋值给全局变量）
                    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                    
                    // 挂载到全局 window，供控制台脚本使用
                    window.supabaseClient = supabaseClient;
                    
                    console.log('[Init] ✅ Supabase 客户端已成功挂载至 window.supabaseClient');
                    console.log('[Init] 💡 可在控制台使用 window.supabaseClient 访问客户端');
                } catch (err) {
                    console.error('[Init] ❌ 初始化失败:', err);
                }
            } else if (initAttempts >= maxAttempts) {
                clearInterval(initInterval);
                console.error('[Init] ❌ Supabase SDK 加载超时，请检查网络连接或 CDN 是否可访问');
            }
        }, 100);
        const i18n = {
            zh: {
                // Buttons / panel header / hotlist / PK
                'btn.back_global': '[返回全网]',
                'btn.refresh': '[刷新]',
                'panel.country_panel': '国家透视',
                'pk.domineering': '霸道值',
                'pk.bootlick': '跪舔值',
                'hotlist.title': '黑话榜',
                'hotlist.building': '正在建立该地区黑话榜...',
                'hotlist.collecting': '暂无数据（正在收录中...）',
                'semantic.core_trait_empty': '该地区核心特质：--',

                // Badges (card top-right)
                'badge.config': '配置',
                'badge.stats': '统计',
                'badge.live': '实时',
                'badge.connect': '连接',
                'badge.syncing': '同步',
                'top-title': 'Cursor行为报告全球分布图',
                'sub-title': '实时远程监测状态 // 节点：太平洋中部',
                'total-victims': '已诊断开发者',
                'total-analysis': '全网扫描次数',
                'total-roast': '累计吐槽字数',
                'avg-chars': '人均吐槽量',
                'radar-title': '全网平均开发者画像',
                'personality-dist': '人格分布排行',
                'active-nodes': '活跃节点',
                'threat-level': '风险评级',
                'top-hotspot': '最密集热区',
                'sys-days': '运行天数',
                'city-coverage': '城市覆盖',
                'sync-rate': '同步速率',
                'hot-list': '地理位置热力排行',
                'recent-activity': '实时诊断活动',
                'victim': '受害者',
                'loading': '初始化中...',
                'rank': '排名'
            },
            en: {
                'top-title': 'Cursor Behavior Report · Global Distribution Map',
                'sub-title': 'Telemetry Status // Node: Central_Pacific',
                'total-victims': 'Total Developers',
                'total-analysis': 'Total Scans',
                'total-roast': 'Total Roast Words',
                'avg-chars': 'Avg Roast Per User',
                'radar-title': 'Global Developer Persona',
                'personality-dist': 'Personality Distribution',
                'active-nodes': 'Active Nodes',
                'threat-level': 'Threat Level',
                'top-hotspot': 'Primary Hotspot',
                'sys-days': 'Days Online',
                'city-coverage': 'City Coverage',
                'sync-rate': 'Sync Rate',
                'hot-list': 'Geographic Hotspots',
                'recent-activity': 'Live Activity Feed',
                'victim': 'Victim',
                'loading': 'Initializing...',
                'rank': 'Rank'
            }
        };

        // ============================================
        // I18N_MAP：动态文案映射（不要直接信任 RPC label）
        // ============================================
        const I18N_MAP = {
            zh: {
                // Drawer / Panels
                'drawer.my_stats': '我的数据统计',
                'drawer.tech_rank': '技术排名',
                'drawer.personality_title': '人格称号',
                'drawer.real_evaluation': '真实评价',

                // Country panel titles
                'panel.stats': '统计',
                'panel.radar': '开发者画像',
                'panel.personality_distribution': '人格分布',
                'panel.country_totals': '国家累计',
                'panel.my_country_rank': '我的排名',
                'panel.qa_attitude': '问答态度',
                'panel.meltdown_audit': '破防监测',
                'panel.meltdown_index': '破防指数',
                'panel.meltdown_level': '破防等级',
                'panel.meltdown_victims': '受虐人数',
                'panel.wordcloud': '本国词云',
                'panel.lpdef_ranking': '高分图谱',
                'panel.global_ratio': '全球占比',

                // Country panel labels
                'panel.country_code': '国家识别码',
                'panel.dev_scale': '开发者规模',
                'panel.scan_count': '诊断次数',

                // Common
                'common.no_data': '暂无数据',
                'common.loading': '加载中...',
                'common.current_device': '（当前设备）',
                'common.recruiting': '待招募',
                'common.waiting': '等待加入',
                'common.syncing': '数据同步中',
                'common.connecting_cloud': '正在连接云端数据源，请稍候…',
                'common.no_cloud_summary': '暂未获取到云端汇总数据',
                'common.suggestion_run_once': '建议：先在主页面完成一次分析/上报，然后刷新此页面。',

                // Personality / evaluation
                'personality.unknown': '未知人格',

                // Metrics
                'metric.ai_interrogations': '调戏AI次数',
                'metric.jiafang': '甲方上身次数',
                'metric.ketao': '赛博磕头次数',
                'metric.banter_total': '废话输出总数',
                'metric.avg_len': '平均吹水长度',
                'metric.avg_len_unit': '字/条',

                // Country totals table labels
                'countryTotals.messages': '调戏AI次数',
                'countryTotals.totalChars': '对话字符数',
                'countryTotals.userChars': '废话输出',
                'countryTotals.avgLen': '平均长度',
                'countryTotals.jiafang': '甲方上身',
                'countryTotals.ketao': '磕头',

                // Radar / states
                'radar.loading': '数据加载中...',
                'radar.insufficient': '该地区画像数据不足，正在汇总中...',
                'realtime.none': '暂无人格分布数据',
                'lpdef.none': '暂无高分图谱数据',

                // Tooltip labels
                'tooltip.active_nodes': '活跃节点',
                'tooltip.record': '战绩',
                'tooltip.roast': '吐槽',
                'tooltip.answers': '答案之书',

                // Errors
                'error.data_load_failed': '数据加载失败，请检查网络连接'
            },
            en: {
                // Drawer / Panels
                'drawer.my_stats': 'My Stats',
                'drawer.tech_rank': 'Tech Rank',
                'drawer.personality_title': 'Title',
                'drawer.real_evaluation': 'Real Evaluation',

                // Country panel titles
                'panel.stats': 'Stats',
                'panel.radar': 'Radar',
                'panel.personality_distribution': 'Personality Distribution',
                'panel.country_totals': 'Country Totals',
                'panel.my_country_rank': 'My Country Rank',
                'panel.qa_attitude': 'Q&A Attitude',
                'panel.meltdown_audit': 'Meltdown Audit',
                'panel.meltdown_index': 'Meltdown Index',
                'panel.meltdown_level': 'Meltdown Level',
                'panel.meltdown_victims': 'Victims',
                'panel.wordcloud': 'National Word Cloud',
                'panel.lpdef_ranking': 'LPDEF Ranking',
                'panel.global_ratio': 'Global Ratio',

                // Country panel labels
                'panel.country_code': 'Country Code',
                'panel.dev_scale': 'Developer Scale',
                'panel.scan_count': 'Scan Count',

                // Common
                'common.no_data': 'No data',
                'common.loading': 'Loading...',
                'common.current_device': ' (This Device)',
                'common.recruiting': 'Recruiting',
                'common.waiting': 'Waiting',
                'common.syncing': 'Syncing',
                'common.connecting_cloud': 'Connecting to cloud source…',
                'common.no_cloud_summary': 'No cloud summary available yet',
                'common.suggestion_run_once': 'Tip: run an analysis on the main page first, then refresh this page.',

                // Personality / evaluation
                'personality.unknown': 'Unknown Title',

                // Buttons / panel header / hotlist / PK
                'btn.back_global': '[Back to Global]',
                'btn.refresh': '[REFRESH]',
                'panel.country_panel': 'Country Panel',
                'pk.domineering': 'Dominance',
                'pk.bootlick': 'Bootlick',
                'hotlist.title': 'Vibe Hotlist',
                'hotlist.building': 'Building regional hotlist...',
                'hotlist.collecting': 'No data (collecting...)',
                'semantic.core_trait_empty': 'Core trait: --',

                // Badges (card top-right)
                'badge.config': 'CONFIG',
                'badge.stats': 'STATS',
                'badge.live': 'LIVE',
                'badge.connect': 'CONNECT',
                'badge.syncing': 'SYNCING',

                // Metrics
                'metric.ai_interrogations': 'AI Interactions',
                'metric.jiafang': 'Client Mode',
                'metric.ketao': 'Humble Mode',
                'metric.banter_total': 'Banter Output',
                'metric.avg_len': 'Avg Prompt Length',
                'metric.avg_len_unit': 'chars/msg',

                // Country totals table labels
                'countryTotals.messages': 'AI Interactions',
                'countryTotals.totalChars': 'Total Chars',
                'countryTotals.userChars': 'User Chars',
                'countryTotals.avgLen': 'Avg Len',
                'countryTotals.jiafang': 'Client Mode',
                'countryTotals.ketao': 'Humble Mode',

                // Radar / states
                'radar.loading': 'Loading...',
                'radar.insufficient': 'Not enough data yet. Aggregating...',
                'realtime.none': 'No personality distribution yet',
                'lpdef.none': 'No LPDEF ranking yet',

                // Tooltip labels
                'tooltip.active_nodes': 'Active Nodes',
                'tooltip.record': 'Record',
                'tooltip.roast': 'Roast',
                'tooltip.answers': 'Answers',

                // Errors
                'error.data_load_failed': 'Failed to load data. Check your connection.'
            }
        };

        const DIMENSION_NAME_I18N = {
            ai: { zh: '调戏AI次数', en: 'AI Interactions', icon: '💬', suffixZh: '次', suffixEn: 'times' },
            word: { zh: '平均长度', en: 'Avg Length', icon: '📏', suffixZh: '字/条', suffixEn: 'chars/msg' },
            day: { zh: '上岗天数', en: 'Days On Duty', icon: '📅', suffixZh: '天', suffixEn: 'days' },
            no: { zh: '甲方上身', en: 'Client Mode', icon: '🚫', suffixZh: '次', suffixEn: 'times' },
            say: { zh: '废话输出', en: 'Banter Output', icon: '💭', suffixZh: '字', suffixEn: 'chars' },
            please: { zh: '赛博磕头', en: 'Humble Mode', icon: '🙏', suffixZh: '次', suffixEn: 'times' }
        };

        const getI18nText = (key, fallback = '') => {
            const lang = currentLang === 'en' ? 'en' : 'zh';
            return (
                (I18N_MAP[lang] && I18N_MAP[lang][key]) ||
                (i18n[lang] && i18n[lang][key]) ||
                fallback ||
                ''
            );
        };

        // 全局 HTML 转义（历史代码里有多处引用 escapeHtml）
        // 注意：底层实现使用 _escapeHtml（函数声明会被提升，可安全在其定义前调用）
        function escapeHtml(s) {
            try { return _escapeHtml(String(s ?? '')); } catch { return String(s ?? ''); }
        }

        function translatePage() {
            const lang = currentLang === 'en' ? 'en' : 'zh';
            try {
                // 按用户要求：优先 data-t
                document.querySelectorAll('[data-t]').forEach((el) => {
                    const k = el.getAttribute('data-t');
                    if (!k) return;
                    const v = getI18nText(k, '');
                    if (v) el.textContent = v;
                });
            } catch { /* ignore */ }

            // 兼容现存实现：lang-key + data-key
            try {
                document.querySelectorAll('.lang-key').forEach((el) => {
                    const k = el.getAttribute('data-key');
                    if (!k) return;
                    const v = (i18n[lang] && i18n[lang][k]) ? i18n[lang][k] : '';
                    if (v) el.textContent = v;
                });
            } catch { /* ignore */ }
        }

        // ============================================
        // 可选：加载英文称号/标签配置（如 rank_en.json）
        // ============================================
        let __languageConfigLoaded = false;
        async function loadLanguageConfig() {
            if (__languageConfigLoaded) return;
            __languageConfigLoaded = true;
            try {
                const tryFetchJson = async (paths) => {
                    for (const p of paths) {
                        try {
                            const resp = await fetch(p, { cache: 'no-cache' });
                            if (!resp.ok) continue;
                            const ct = resp.headers.get('content-type') || '';
                            if (!ct.includes('json')) continue;
                            return await resp.json();
                        } catch { /* ignore */ }
                    }
                    return null;
                };

                // 这些文件不是强依赖：不存在时静默跳过
                const rankEn = await tryFetchJson([
                    './rank_en.json',
                    './src/rank_en.json',
                    './rank-en.json',
                    './src/rank-en.json'
                ]);

                const personalityNamesEn = await tryFetchJson([
                    './personalityNames_en.json',
                    './src/personalityNames_en.json',
                    './personality-names-en.json',
                    './src/personality-names-en.json'
                ]);

                // 答案之书：中英文共用同一份 JSON（{[vibeIndex]: {title_zh,content_zh,title_en,content_en}}）
                const answerBookByVibeIndex = await tryFetchJson([
                    './answerBookByVibeIndex.json',
                    './src/answerBookByVibeIndex.json',
                    './answer-book-by-vibe-index.json',
                    './src/answer-book-by-vibe-index.json'
                ]);

                window.__LANG_CONFIG = { rankEn, personalityNamesEn, answerBookByVibeIndex };
            } catch { /* ignore */ }
        }

        const translateDimensionName = (dimId) => {
            const x = DIMENSION_NAME_I18N[dimId];
            if (!x) return String(dimId || '');
            return currentLang === 'en' ? x.en : x.zh;
        };
        const translateDimensionSuffix = (dimId) => {
            const x = DIMENSION_NAME_I18N[dimId];
            if (!x) return '';
            return currentLang === 'en' ? (x.suffixEn || '') : (x.suffixZh || '');
        };

        // “码农”英文映射：按分数段切换 Code Monkey / Architect
        const mapCoderTitleToEn = (userData) => {
            try {
                const totalUsers = Number(window.lastData?.totalUsers) || 0;
                const vibeRank = Number(userData?.vibe_rank || userData?.vibeRank || NaN);
                const vibePercentile = Number(userData?.vibe_percentile || userData?.vibePercentile || NaN);
                const avgRank = Number(userData?.avg_rank || userData?.avgRank || NaN); // 0-100，越大越强

                // 规则：Top 10% 或 percentile>=90 或 avgRank>=80 => Architect，否则 Code Monkey
                if (Number.isFinite(vibeRank) && totalUsers > 0) {
                    if (vibeRank <= Math.max(1, Math.floor(totalUsers * 0.10))) return 'Architect';
                }
                if (Number.isFinite(vibePercentile) && vibePercentile >= 90) return 'Architect';
                if (Number.isFinite(avgRank) && avgRank >= 80) return 'Architect';
                return 'Code Monkey';
            } catch {
                return 'Code Monkey';
            }
        };

        const translatePersonalityName = (name, userData) => {
            const raw = String(name || '').trim();
            if (currentLang !== 'en') return raw;
            if (!raw) return raw;
            if (raw.includes('码农')) return mapCoderTitleToEn(userData);
            // 若外部英文称号表存在，优先使用（vibe_index_str -> name）
            try {
                const idx = String(userData?.vibe_index_str || userData?.vibeIndexStr || userData?.vibeIndex || '').trim();
                const cfg = window.__LANG_CONFIG;
                if (cfg && cfg.personalityNamesEn && idx && idx.length === 5) {
                    const hit = cfg.personalityNamesEn[idx];
                    if (typeof hit === 'string' && hit.trim()) return hit.trim();
                    if (hit && typeof hit === 'object' && (hit.name || hit.title)) return String(hit.name || hit.title).trim();
                }
            } catch { /* ignore */ }
            return raw;
        };

        const translateRankFeedbackLabel = (dimId, label, value) => {
            const raw = String(label || '').trim();
            if (currentLang !== 'en') return raw;
            if (!raw) return raw;
            try {
                const cfg = window.__LANG_CONFIG;
                const rankEn = cfg && cfg.rankEn ? cfg.rankEn : null;
                const d = String(dimId || '').trim();
                if (rankEn && d) {
                    // 支持多种可能结构：rankEn[dimId][label] / rankEn[dimId].labels[label]
                    const direct = rankEn?.[d]?.[raw];
                    if (typeof direct === 'string' && direct.trim()) return direct.trim();
                    const nested = rankEn?.[d]?.labels?.[raw];
                    if (typeof nested === 'string' && nested.trim()) return nested.trim();
                }
            } catch { /* ignore */ }

            // 小范围兜底：若某些 label 恰好是中文称号
            if (raw.includes('码农')) {
                return (Number(value) >= 80) ? 'Architect' : 'Code Monkey';
            }
            return raw;
        };

        function updateLanguageContext() {
            // 读取最新语言设置（以 localStorage.lang 为准）
            let next = currentLang;
            try {
                next = normalizeLang(localStorage.getItem(LANG_STORAGE_KEY) || localStorage.getItem('appLanguage') || currentLang);
            } catch { /* ignore */ }
            currentLang = next === 'en' ? 'en' : 'zh';

            // 持久化：新键 lang + 兼容旧键 appLanguage
            try { localStorage.setItem(LANG_STORAGE_KEY, currentLang); } catch { /* ignore */ }
            try { localStorage.setItem('appLanguage', currentLang === 'en' ? 'en' : 'zh-CN'); } catch { /* ignore */ }
            try { document.documentElement.setAttribute('lang', currentLang === 'en' ? 'en' : 'zh-CN'); } catch { /* ignore */ }

            // 顶部国旗按钮选中态
            const btnZh = document.getElementById('btn-zh');
            const btnEn = document.getElementById('btn-en');
            if (btnZh) btnZh.classList.toggle('active', currentLang === 'zh');
            if (btnEn) btnEn.classList.toggle('active', currentLang === 'en');

            // 静态文案：sub-title + 页面 data-t/data-key
            try {
                const sub = document.getElementById('sub-title');
                if (sub) sub.innerText = (i18n[currentLang] && i18n[currentLang]['sub-title']) ? i18n[currentLang]['sub-title'] : (sub.innerText || '');
            } catch { /* ignore */ }
            translatePage();

            // 重新渲染：依赖 currentLang 的列表/地图/抽屉内容
            try {
                if (window.lastData) {
                    renderLocationList(window.lastData.locationRank);
                    const activityData = window.lastData.latestRecords || window.lastData.recentVictims || [];
                    renderRecentActivity(activityData);
                    renderPersonalityDistribution(window.lastData.personalityDistribution);
                    initGlobalMap(window.lastData.locationRank).catch(() => {});
                }
            } catch { /* ignore */ }

            // 如果国家透视面板处于打开状态：静默刷新右侧抽屉（文案会随 currentLang 更新）
            try {
                if (typeof refreshCountryRightPanel === 'function') {
                    refreshCountryRightPanel();
                } else if (typeof updateCountryDashboard === 'function' && currentDrawerCountry && currentDrawerCountry.code) {
                    updateCountryDashboard(String(currentDrawerCountry.code).toUpperCase(), { preferCache: true, silent: true });
                }
            } catch { /* ignore */ }
        }

        const countryNameMap = {
            'CN': { zh: '中国', en: 'China' },
            // 注意：ECharts world 地图对美国的标准名称通常是 'United States' / 'United States of America'
            // 这里用 'United States' 作为 en，便于地图 name 匹配与点击解析
            'US': { zh: '美国', en: 'United States' },
            'JP': { zh: '日本', en: 'Japan' },
            'GB': { zh: '英国', en: 'UK' },
            'DE': { zh: '德国', en: 'Germany' },
            'SG': { zh: '新加坡', en: 'Singapore' },
            'HK': { zh: '中国香港', en: 'Hong Kong' },
            'TW': { zh: '中国台湾', en: 'Taiwan' }
        };

        /**
         * 将国家名标准化为可比对 key
         * - 去括号内容、标点、连字符、重音符、压缩空白
         * @param {string} s
         * @returns {string}
         */
        function normalizeCountryKey(s) {
            try {
                return String(s || '')
                    .trim()
                    .toLowerCase()
                    // 去括号内容：Bolivia (Plurinational State of) -> Bolivia
                    .replace(/\s*\([^)]*\)\s*/g, ' ')
                    // 逗号/点/撇号等
                    .replace(/[.,'’]/g, ' ')
                    // 连接符
                    .replace(/[-_/]/g, ' ')
                    // 去重音符（Côte d'Ivoire -> Cote d Ivoire）
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            } catch {
                return String(s || '').trim().toLowerCase();
            }
        }

        /**
         * 预加载 ISO3166 英文名 -> ISO2 映射（用于 ECharts 的 world.js 未包含 iso_a2 的情况）
         * - 优先 localStorage 缓存，失败再走网络拉取
         * - 网络数据来源：lukes/ISO-3166-Countries-with-Regional-Codes slim-2（仅 name + alpha-2）
         */
        async function ensureIsoNameToIso2MapLoaded() {
            try {
                if (window.__isoNameToIso2 instanceof Map && window.__isoNameToIso2.size > 50) return;
            } catch { /* ignore */ }

            // 1) localStorage 缓存（压成对象存储，恢复为 Map）
            try {
                const cached = localStorage.getItem('__isoNameToIso2_v1');
                if (cached) {
                    const obj = JSON.parse(cached);
                    if (obj && typeof obj === 'object') {
                        const m = new Map(Object.entries(obj));
                        if (m.size > 50) {
                            window.__isoNameToIso2 = m;
                            return;
                        }
                    }
                }
            } catch { /* ignore */ }

            // 2) 网络拉取（不阻塞主流程：失败就降级）
            try {
                const url = 'https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/slim-2/slim-2.json';
                const res = await fetch(url, { cache: 'force-cache' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const arr = await res.json();
                const m = new Map();

                const setIfMissing = (k, v) => {
                    const key = normalizeCountryKey(k);
                    const val = String(v || '').trim().toUpperCase();
                    if (!key || !/^[A-Z]{2}$/.test(val)) return;
                    if (!m.has(key)) m.set(key, val);
                };

                if (Array.isArray(arr)) {
                    for (const row of arr) {
                        const name = row && (row.name || row['name']);
                        const iso2 = row && (row['alpha-2'] || row.alpha2 || row['alpha2']);
                        if (!name || !iso2) continue;

                        // 完整名
                        setIfMissing(name, iso2);

                        // 逗号前（Moldova, Republic of -> Moldova）
                        try {
                            const beforeComma = String(name).split(',')[0].trim();
                            if (beforeComma && beforeComma !== name) setIfMissing(beforeComma, iso2);
                        } catch { /* ignore */ }

                        // 括号前（Iran (Islamic Republic of) -> Iran）
                        try {
                            const beforeParen = String(name).split('(')[0].trim();
                            if (beforeParen && beforeParen !== name) setIfMissing(beforeParen, iso2);
                        } catch { /* ignore */ }
                    }
                }

                // ✅ 额外别名（适配 ECharts world.js 常见缩写/写法）
                // 注意：这些 key 走 normalizeCountryKey，所以这里直接写“人类可读”的原始形式即可
                const extraAliases = {
                    'W. Sahara': 'EH',
                    'Bosnia and Herz.': 'BA',
                    'Antigua and Barb.': 'AG',
                    'Fr. S. Antarctic Lands': 'TF',
                    'Aland': 'AX',
                    'S. Korea': 'KR',
                    'N. Korea': 'KP',
                    'Russia': 'RU',
                    'Iran': 'IR',
                    'Laos': 'LA',
                    'Syria': 'SY',
                    'Palestine': 'PS',
                    'Czech Rep.': 'CZ',
                    'Macedonia': 'MK',
                    'Venezuela': 'VE',
                    'Bolivia': 'BO',
                    'Tanzania': 'TZ',
                    'Moldova': 'MD',
                    'Brunei': 'BN',
                    'Vietnam': 'VN',
                    'Ivory Coast': 'CI',
                };
                for (const [k, v] of Object.entries(extraAliases)) setIfMissing(k, v);

                window.__isoNameToIso2 = m;

                // 写回缓存（避免每次加载都 fetch）
                try {
                    const obj = Object.fromEntries(m.entries());
                    localStorage.setItem('__isoNameToIso2_v1', JSON.stringify(obj));
                } catch { /* ignore */ }
            } catch (e) {
                // 静默降级：不影响页面其他功能
                try { console.warn('[ISO] ⚠️ ISO 名称映射加载失败，国家透视可能降级为仅支持少数国家:', e?.message || e); } catch { /* ignore */ }
            }
        }

        /**
         * 将 ECharts world 地图的国家名称解析为 ISO2 国家码（如 'United States of America' -> 'US'）
         * 仅做 UI 层路由用（抽屉/国家透视），失败时返回 null。
         */
        function resolveCountryCodeFromMapName(name) {
            const raw = String(name || '').trim();
            if (!raw) return null;
            // 直接是 ISO2
            if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

            // 1) 优先：从 ECharts world geoJson 中读取 iso2（覆盖全球国家，最可靠）
            try {
                if (!window.__worldGeoNameToIso2) {
                    const m = new Map();
                    const mapObj = (typeof echarts !== 'undefined' && echarts && typeof echarts.getMap === 'function')
                        ? echarts.getMap('world')
                        : null;
                    const geoJson = mapObj?.geoJson || mapObj?.geoJSON || mapObj?.geojson || null;
                    const feats = geoJson?.features;
                    if (Array.isArray(feats)) {
                        for (const f of feats) {
                            const props = f?.properties || {};
                            const iso2 =
                                props.iso_a2 ||
                                props.iso2 ||
                                props.ISO2 ||
                                props['ISO_A2'] ||
                                props['iso_3166_1_alpha_2'] ||
                                null;
                            const iso2Upper = String(iso2 || '').trim().toUpperCase();
                            if (!/^[A-Z]{2}$/.test(iso2Upper) || iso2Upper === '-99') continue;
                            const names = [
                                props.name,
                                props.name_long,
                                props.name_en,
                                props.admin,
                                f?.name,
                            ].filter(Boolean);
                            for (const nm of names) {
                                const k = normalizeCountryKey(nm);
                                if (k) m.set(k, iso2Upper);
                                // 额外：逗号前半段（"Korea, Republic of" -> "Korea"）
                                try {
                                    const beforeComma = String(nm).split(',')[0].trim();
                                    const kc = normalizeCountryKey(beforeComma);
                                    if (kc) m.set(kc, iso2Upper);
                                } catch { /* ignore */ }
                            }
                        }
                    }
                    window.__worldGeoNameToIso2 = m;
                }
                const hit = window.__worldGeoNameToIso2.get(normalizeCountryKey(raw));
                if (hit) return String(hit).toUpperCase();
            } catch { /* ignore */ }

            const n = normalizeCountryKey(raw);

            // 2) 高优先级别名：ECharts world 常见命名差异
            const alias = {
                'usa': 'US',
                'u s a': 'US',
                'u s': 'US',
                'united states': 'US',
                'united states of america': 'US',
                'uk': 'GB',
                'united kingdom': 'GB',
                'russian federation': 'RU',
                'iran islamic republic of': 'IR',
                'korea republic of': 'KR',
                'korea democratic peoples republic of': 'KP',
                'viet nam': 'VN',
                'cote d ivoire': 'CI',
                'cote divoire': 'CI',
                'bolivia': 'BO',
                'tanzania': 'TZ',
                'venezuela': 'VE',
                'syrian arab republic': 'SY',
                'moldova republic of': 'MD',
                'lao peoples democratic republic': 'LA',
                'brunei darussalam': 'BN',
                'cabo verde': 'CV',
                'swaziland': 'SZ',
                'eswatini': 'SZ',
                'czechia': 'CZ',
                'myanmar': 'MM',
                'palestine': 'PS',
                'state of palestine': 'PS',
                'micronesia federated states of': 'FM',
                'congo': 'CG',
                'democratic republic of the congo': 'CD',
            };
            if (alias[n]) return alias[n];
            // contains 规则
            if (n.includes('united states')) return 'US';
            if (n.includes('united kingdom')) return 'GB';
            if (n.includes('democratic republic of the congo')) return 'CD';

            // 2.5) 使用 ISO3166 国家名映射（适配 world.js 仅有 name 字段的情况）
            try {
                const m = window.__isoNameToIso2;
                if (m instanceof Map) {
                    const hit = m.get(n);
                    if (hit) return String(hit).toUpperCase();
                }
            } catch { /* ignore */ }

            // 3) 从 countryNameMap 反查（en/zh 都支持；仅覆盖你手工维护的国家）
            try {
                for (const [code, names] of Object.entries(countryNameMap || {})) {
                    if (!names) continue;
                    const en = normalizeCountryKey(names.en || '');
                    const zh = normalizeCountryKey(names.zh || '');
                    if (en && en === n) return String(code).toUpperCase();
                    if (zh && zh === n) return String(code).toUpperCase();
                }
            } catch { /* ignore */ }
            return null;
        }

        // 预热：尽量在用户点击地图前把映射准备好
        try { ensureIsoNameToIso2MapLoaded(); } catch { /* ignore */ }

        let mapChart, radarChart;
        let currentViewState = 'GLOBAL'; // GLOBAL 或 COUNTRY（右侧抽屉：实时动态流 / 国家透视）
        let selectedCountry = null; // 当前选中的国家
        let currentChampionInfo = null; // 当前选中的冠军信息（用于地图 tooltip 展示）
        /** 校准模式：点击「Current Location」光标后为 true，停止操作 1.5 秒后恢复 false */
        let isCalibrating = false;
        /** 待确认的校准数据（lng, lat, countryCode, countryName） */
        let pendingCalibration = { lng: null, lat: null, countryCode: null, countryName: null };
        /** 国家英文名 -> 近似中心 [lng, lat]（用于校准时光标移动） */
        const countryCenterMap = {
            'China': [105, 35], 'United States': [-95, 38], 'United States of America': [-95, 38],
            'Japan': [138, 36], 'United Kingdom': [-2, 54], 'Germany': [10, 51], 'France': [2, 46],
            'Singapore': [104, 1.3], 'Hong Kong': [114, 22.3], 'Taiwan': [121, 24],
            'Canada': [-106, 56], 'Australia': [134, -25], 'India': [78, 21], 'Brazil': [-55, -10],
            'South Korea': [128, 36], 'Russia': [100, 60], 'Italy': [12, 43], 'Spain': [-3, 40],
            'Netherlands': [5, 52], 'Sweden': [15, 62], 'Poland': [20, 52], 'Indonesia': [118, -5],
            'Mexico': [-102, 23], 'South Africa': [25, -29], 'Turkey': [35, 39], 'Vietnam': [108, 16],
            'Thailand': [100, 15], 'Malaysia': [112, 4], 'Philippines': [122, 13], 'Pakistan': [68, 30],
            'Egypt': [30, 27], 'Nigeria': [8, 10], 'Argentina': [-64, -34], 'Colombia': [-72, 4],
            'USA': [-95, 38], 'UK': [-2, 54], 'Korea': [128, 36]
        };

        // ==========================================
        // 地域锚定（手动地域修正）：anchored_country（兼容旧键 selected_country）
        // - 用于：下一次扫描上报时 Analyzer 读取并作为 manual_region
        // - 用于：右侧抽屉提示“你正在为哪个国家贡献”
        // ==========================================
        function _getAnchoredCountryFromStorage() {
            try {
                const v =
                    String(localStorage.getItem('anchored_country') || '').trim().toUpperCase() ||
                    String(localStorage.getItem('selected_country') || '').trim().toUpperCase();
                return /^[A-Z]{2}$/.test(v) ? v : null;
            } catch {
                return null;
            }
        }

        function _setAnchoredCountry(countryCode) {
            const cc = String(countryCode || '').trim().toUpperCase();
            if (!/^[A-Z]{2}$/.test(cc)) return null;
            try { localStorage.setItem('anchored_country', cc); } catch { /* ignore */ }
            // 兼容旧键：部分老逻辑仍读取 selected_country
            try { localStorage.setItem('selected_country', cc); } catch { /* ignore */ }
            try { window.__anchoredCountry = cc; } catch { /* ignore */ }
            _renderAnchoredCountryBadge(cc);
            return cc;
        }

        function _renderAnchoredCountryBadge(countryCode) {
            try {
                const cc = String(countryCode || '').trim().toUpperCase();
                const badge = document.getElementById('anchor-country-badge');
                if (!badge) return;
                badge.textContent = `锚定: ${/^[A-Z]{2}$/.test(cc) ? cc : '--'}`;
                badge.classList.toggle('border-[#00ff41]/30', true);
            } catch { /* ignore */ }
        }

        // 页面加载时回填一次
        try { _renderAnchoredCountryBadge(_getAnchoredCountryFromStorage()); } catch { /* ignore */ }

        // ==========================================
        // 【新功能】光标固定在母国机制
        // ==========================================

        /** 全局标志：光标是否已固定在母国 */
        let __cursorFixedToHomeland = false;

        /**
         * 轻量坐标判国（仅覆盖核心区域：CN / US）
         * - CN: 73.5E~134.8E, 18N~53.6N（粗略包围盒）
         * - US: 覆盖 CONUS + Alaska + Hawaii（粗略包围盒）
         * @returns {string|null} 'CN' | 'US' | null
         */
        function getCountryByCoords(lng, lat) {
            const x = Number(lng);
            const y = Number(lat);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

            // CN (approx bounding box)
            if (y >= 18.0 && y <= 53.6 && x >= 73.5 && x <= 134.8) return 'CN';

            // US (CONUS)
            if (y >= 24.4 && y <= 49.6 && x >= -125.0 && x <= -66.5) return 'US';
            // US (Alaska)
            if (y >= 50.0 && y <= 72.5 && x >= -170.0 && x <= -130.0) return 'US';
            // US (Hawaii)
            if (y >= 18.8 && y <= 22.6 && x >= -160.6 && x <= -154.5) return 'US';

            return null;
        }

        /** 兼容旧调用点：返回 {code,name,enName} 或 null */
        function getCountryAtCoordinates(lng, lat) {
            const cc = getCountryByCoords(lng, lat);
            if (!cc) return null;
            const name = countryNameMap?.[cc]
                ? (currentLang === 'zh' ? countryNameMap[cc].zh : countryNameMap[cc].en)
                : cc;
            return { code: cc, name, enName: countryNameMap?.[cc]?.en || cc };
        }

        function setRightDrawerLoading(isLoading) {
            try {
                const d = document.getElementById('right-drawer');
                if (!d) return;
                d.classList.toggle('drawer-loading', !!isLoading);
            } catch { /* ignore */ }
        }

        function onCountrySwitch(newCode, meta = {}) {
            const cc = String(newCode || '').trim().toUpperCase();
            if (!/^[A-Z]{2}$/.test(cc)) return;
            const prev = _getAnchoredCountryFromStorage();
            if (prev === cc && !meta?.force) return;

            // 母国锚定更新：写入 anchored_country（兼容 selected_country）
            _setAnchoredCountry(cc);

            // 记录“切换国籍”时间（用于 location_weight 平滑迁移）
            try {
                localStorage.setItem('country_switch_from', String(prev || '').toUpperCase());
                localStorage.setItem('country_switch_to', cc);
                localStorage.setItem('country_switch_ts', String(Date.now()));
            } catch { /* ignore */ }

            // 缓存清理：切换后清除旧的“国家/全局平均值”缓存，避免旧口径残留
            try {
                if (window.__countryDashboardCache && typeof window.__countryDashboardCache.delete === 'function') {
                    window.__countryDashboardCache.delete('GLOBAL');
                    window.__countryDashboardCache.delete(cc);
                }
            } catch { /* ignore */ }
            try {
                if (window.__countrySummaryCache && typeof window.__countrySummaryCache.delete === 'function') {
                    window.__countrySummaryCache.delete(cc);
                }
            } catch { /* ignore */ }
            try { localStorage.removeItem('vibe_global_stats'); } catch { /* ignore */ }

            // 抽屉手动切换国籍：通知后端更新用户画像 current_location（不影响历史快照聚合）
            try {
                const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
                const base = apiEndpoint.endsWith('/') ? apiEndpoint : (apiEndpoint ? `${apiEndpoint}/` : '');
                const url = base ? `${base}api/v2/update_location` : '/api/v2/update_location';
                const fp = (() => {
                    try { return localStorage.getItem('user_fingerprint') || window.fpId || null; } catch { return null; }
                })();
                if (fp) {
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        keepalive: true,
                        body: JSON.stringify({
                            fingerprint: fp,
                            current_location: cc,
                            switched_at: new Date().toISOString(),
                        }),
                    }).catch(() => {});
                }
            } catch { /* ignore */ }

            // 个人分析记录：跨国切换时触发一次重新上报（避免依赖抽屉是否打开）
            try {
                if (!window.__countrySwitchRefreshUserStatsTimer) window.__countrySwitchRefreshUserStatsTimer = null;
                if (window.__countrySwitchRefreshUserStatsTimer) clearTimeout(window.__countrySwitchRefreshUserStatsTimer);
                if (!meta?.silent && typeof window.refreshUserStats === 'function') {
                    window.__countrySwitchRefreshUserStatsTimer = setTimeout(() => {
                        window.__countrySwitchRefreshUserStatsTimer = null;
                        try { window.refreshUserStats(); } catch { /* ignore */ }
                    }, 0);
                }
            } catch { /* ignore */ }

            // 派发事件：Right Drawer & 其他模块自动迁移
            try {
                window.dispatchEvent(new CustomEvent('country:switch', {
                    detail: {
                        code: cc,
                        prevCode: prev || null,
                        name: meta?.name || null,
                        source: meta?.source || 'unknown',
                        coords: meta?.coords || null,
                        ts: Date.now(),
                        silent: !!meta?.silent,
                    }
                }));
            } catch { /* ignore */ }
        }

        // Geo-Fencing：移动光标时 300ms 防抖
        let __geoFenceDebounceTimer = null;
        function scheduleGeoFenceByCoords(lng, lat, meta = {}) {
            try {
                if (__geoFenceDebounceTimer) clearTimeout(__geoFenceDebounceTimer);
            } catch { /* ignore */ }
            __geoFenceDebounceTimer = setTimeout(() => {
                __geoFenceDebounceTimer = null;
                const cc = getCountryByCoords(lng, lat);
                if (!cc) return;
                onCountrySwitch(cc, { ...meta, coords: { lng, lat } });
            }, 300);
        }

        // Right Drawer：监听国家切换，自动迁移上下文（缓存优先 + 静默更新）
        try {
            if (!window.__countrySwitchListenerBound) {
                window.__countrySwitchListenerBound = true;
                window.addEventListener('country:switch', (ev) => {
                    const d = ev?.detail || {};
                    const cc = String(d.code || '').trim().toUpperCase();
                    if (!/^[A-Z]{2}$/.test(cc)) return;

                    const leftDrawer = document.getElementById('left-drawer');
                    const rightDrawer = document.getElementById('right-drawer');
                    const shouldRender =
                        (leftDrawer && leftDrawer.classList.contains('active')) ||
                        (rightDrawer && rightDrawer.classList.contains('active')) ||
                        (localStorage.getItem('left_drawer_open') === 'true') ||
                        (localStorage.getItem('right_drawer_open') === 'true');
                    // 地图点击国家：即便抽屉未打开，也必须“无感打开并切换”
                    const forceRender = String(d.source || '') === 'map-country-click';
                    if (!shouldRender && !forceRender) return;

                    const displayName = countryNameMap?.[cc]
                        ? (currentLang === 'zh' ? countryNameMap[cc].zh : countryNameMap[cc].en)
                        : (d.name || cc);

                    setRightDrawerLoading(true);
                    // ISO2 国家：等待国家透视数据请求完成后再结束 loading（由 updateCountryDashboard 收尾）
                    // 非 ISO2（兜底展示）：用短延迟结束 loading
                    if (!/^[A-Z]{2}$/.test(cc)) {
                        setTimeout(() => setRightDrawerLoading(false), 220);
                    }

                    // 抽屉实时上下文切换：只要是 ISO2，就进入“国家透视（右侧模板）”
                    if (/^[A-Z]{2}$/.test(cc)) {
                        switchToCountryView(cc, displayName);
                    } else {
                        showDrawersWithCountryData(cc, displayName);
                    }

                    // 数据流重定向
                    try { window.refreshVibeCard && window.refreshVibeCard(cc); } catch { /* ignore */ }
                });
            }
        } catch { /* ignore */ }

        /**
         * 显示母国确认弹窗
         * @param {string} countryName - 国家名称
         * @param {Function} onConfirm - 确认回调
         * @param {Function} onCancel - 取消回调
         */
        function showHomelandConfirmation(countryName, onConfirm, onCancel) {
            // 检查是否已有弹窗，避免重复显示
            const existingDialog = document.getElementById('homeland-confirm-dialog');
            if (existingDialog) {
                existingDialog.remove();
            }

            const dialog = document.createElement('div');
            dialog.id = 'homeland-confirm-dialog';
            dialog.className = 'fixed inset-0 flex items-center justify-center bg-black/70 z-50';
            dialog.innerHTML = `
                <div class="bg-zinc-900 border border-[#00ff41]/30 rounded-lg p-6 max-w-sm mx-4 shadow-[0_0_20px_rgba(0,255,65,0.3)]">
                    <h3 class="text-white text-lg font-bold mb-3">🏠 设置为母国</h3>
                    <p class="text-zinc-300 text-sm mb-4">是否将 <span class="text-[#00ff41] font-bold">${countryName}</span> 设置为您的母国？</p>
                    <p class="text-zinc-500 text-xs mb-6">设置后，光标将固定在此位置，不再随地图移动。</p>
                    <div class="flex gap-3">
                        <button id="homeland-confirm-cancel" class="flex-1 px-4 py-2 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm">
                            取消
                        </button>
                        <button id="homeland-confirm-ok" class="flex-1 px-4 py-2 rounded bg-[#00ff41] text-black font-bold hover:bg-[#00ff41]/80 transition-colors text-sm">
                            确认
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);

            // 绑定事件
            document.getElementById('homeland-confirm-ok').onclick = () => {
                dialog.remove();
                if (typeof onConfirm === 'function') onConfirm();
            };
            document.getElementById('homeland-confirm-cancel').onclick = () => {
                dialog.remove();
                if (typeof onCancel === 'function') onCancel();
            };
            dialog.onclick = (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    if (typeof onCancel === 'function') onCancel();
                }
            };
        }

        /**
         * 显示解除固定弹窗
         * @param {Function} onConfirm - 确认回调
         * @param {Function} onCancel - 取消回调
         */
        function showUnfixConfirmation(onConfirm, onCancel) {
            // 检查是否已有弹窗，避免重复显示
            const existingDialog = document.getElementById('unfix-confirm-dialog');
            if (existingDialog) {
                existingDialog.remove();
            }

            const dialog = document.createElement('div');
            dialog.id = 'unfix-confirm-dialog';
            dialog.className = 'fixed inset-0 flex items-center justify-center bg-black/70 z-50';
            dialog.innerHTML = `
                <div class="bg-zinc-900 border border-[#00ff41]/30 rounded-lg p-6 max-w-sm mx-4 shadow-[0_0_20px_rgba(0,255,65,0.3)]">
                    <h3 class="text-white text-lg font-bold mb-3">🗺️ 重新寻找母国</h3>
                    <p class="text-zinc-300 text-sm mb-4">确定要解除当前母国设置，重新寻找母国吗？</p>
                    <p class="text-zinc-500 text-xs mb-6">解除后，光标将可以自由移动。</p>
                    <div class="flex gap-3">
                        <button id="unfix-confirm-cancel" class="flex-1 px-4 py-2 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm">
                            取消
                        </button>
                        <button id="unfix-confirm-ok" class="flex-1 px-4 py-2 rounded bg-[#00ff41] text-black font-bold hover:bg-[#00ff41]/80 transition-colors text-sm">
                            确定
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);

            // 绑定事件
            document.getElementById('unfix-confirm-ok').onclick = () => {
                dialog.remove();
                if (typeof onConfirm === 'function') onConfirm();
            };
            document.getElementById('unfix-confirm-cancel').onclick = () => {
                dialog.remove();
                if (typeof onCancel === 'function') onCancel();
            };
            dialog.onclick = (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    if (typeof onCancel === 'function') onCancel();
                }
            };
        }

        /**
         * 使用 graphic 组件在屏幕上固定光标位置
         * @param {number} lng - 经度
         * @param {number} lat - 纬度
         * @param {string} color - 颜色
         * @param {string} avatarUrl - 头像 URL
         * @param {string} username - 用户名
         */
        function setFixedCursorOnScreen(lng, lat, color = '#00ff41', avatarUrl = null, username = null) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;

            try {
                // 【修改】完全移除 "Current Location" effectScatter 系列
                const currentOption = mapChart.getOption();
                if (currentOption && currentOption.series && Array.isArray(currentOption.series)) {
                    const newSeries = currentOption.series.filter(s => s.name !== 'Current Location');
                    mapChart.setOption({ series: newSeries }, { notMerge: false, lazyUpdate: false });
                }

                // 将地理坐标转换为屏幕坐标
                const px = mapChart.convertToPixel('geo', [lng, lat]);
                if (!px || !Array.isArray(px) || px.length < 2) return;

                const screenX = px[0];
                const screenY = px[1];

                // 使用 graphic 组件在屏幕上固定显示
                const existingGraphic = currentOption.graphic || { elements: [] };

                // 移除旧的光标 graphic
                const newElements = (existingGraphic.elements || []).filter(el => el.id !== 'fixed-cursor');

                // 【修改】使用深色光标，避免与地图混淆
                const fixedColor = '#ffffff'; // 白色光标，在深色地图上更明显
                const fixedTextColor = '#ffffff'; // 白色文本

                // 添加新的固定光标
                newElements.push({
                    id: 'fixed-cursor',
                    type: 'group',
                    // 使用 x/y（而非 left/top）避免 bbox/layout 导致的“飘移”
                    x: screenX,
                    y: screenY,
                    children: [
                        {
                            type: 'circle',
                            shape: { cx: 0, cy: 0, r: 10 },
                            style: {
                                fill: fixedColor,
                                stroke: '#000000',
                                lineWidth: 2,
                                shadowBlur: 20,
                                shadowColor: 'rgba(0, 0, 0, 0.8)'
                            }
                        },
                        {
                            type: 'text',
                            style: {
                                text: 'YOU',
                                fill: fixedTextColor,
                                fontSize: 12,
                                fontWeight: 'bold',
                                fontFamily: 'JetBrains Mono',
                                x: 0,
                                y: -20
                            }
                        }
                    ]
                });

                mapChart.setOption({ graphic: { elements: newElements } }, { notMerge: false, lazyUpdate: false });

                // 保存固定状态
                localStorage.setItem('cursor_fixed_to_homeland', 'true');
                localStorage.setItem('fixed_cursor_lng', String(lng));
                localStorage.setItem('fixed_cursor_lat', String(lat));
                localStorage.setItem('fixed_cursor_color', color);

                // 绑定跟随地图的同步逻辑，保证拖拽/缩放/重绘后仍定位在保存坐标
                try {
                    bindFixedCursorFollowMap();
                    syncFixedCursorGraphicPosition('setFixedCursorOnScreen');
                } catch { /* ignore */ }

                console.log('[Homeland] ✅ 光标已固定在屏幕位置（深色）:', { lng, lat, screenX, screenY });
            } catch (e) {
                console.warn('[Homeland] 设置固定光标失败:', e);
            }
        }

        /**
         * 移除固定的屏幕光标
         */
        function removeFixedCursor() {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;

            try {
                const currentOption = mapChart.getOption();
                const existingGraphic = currentOption.graphic || { elements: [] };
                const newElements = (existingGraphic.elements || []).filter(el => el.id !== 'fixed-cursor');

                mapChart.setOption({ graphic: { elements: newElements } }, { notMerge: false, lazyUpdate: false });

                // 【修改】恢复 effectScatter 系列光标
                const fixedLng = localStorage.getItem('fixed_cursor_lng');
                const fixedLat = localStorage.getItem('fixed_cursor_lat');
                const fixedColor = localStorage.getItem('fixed_cursor_color') || '#00ff41';

                if (fixedLng && fixedLat && !isNaN(Number(fixedLng)) && !isNaN(Number(fixedLat))) {
                    const lng = Number(fixedLng);
                    const lat = Number(fixedLat);

                    // 读取用户信息（头像、用户名）
                    let githubUsername = 'YOU';
                    let avatarUrl = DEFAULT_AVATAR;
                    try {
                        githubUsername = localStorage.getItem('github_username') || 'YOU';
                        if (githubUsername && isValidGitHubUsername(githubUsername)) {
                            avatarUrl = getGitHubAvatarUrl(githubUsername);
                        }
                    } catch (e) { /* ignore */ }

                    // 恢复 effectScatter 系列光标
                    if (currentOption && currentOption.series && Array.isArray(currentOption.series)) {
                        const otherSeries = currentOption.series.filter(s => s.name !== 'Current Location');
                        const pulseSeries = {
                            name: 'Current Location',
                            type: 'effectScatter',
                            coordinateSystem: 'geo',
                            data: [{ value: [lng, lat], name: 'YOU', avatarUrl: avatarUrl || null, username: username || null }],
                            symbolSize: 20,
                            showEffectOn: 'render',
                            rippleEffect: { brushType: 'stroke', scale: 5, period: 4, color: fixedColor },
                            itemStyle: { color: fixedColor, shadowBlur: 20, shadowColor: fixedColor },
                            label: { show: true, formatter: 'YOU', position: 'top', color: fixedColor, fontSize: 10, fontFamily: 'JetBrains Mono' },
                            avatarUrl: avatarUrl || null,
                            username: username || null,
                            zlevel: 10,
                            z: 10
                        };
                        mapChart.setOption({ series: [...otherSeries, pulseSeries] }, { notMerge: false, lazyUpdate: false });
                    }

                    // 记录当前光标状态
                    try {
                        window.__currentLocationCursorState = {
                            lng,
                            lat,
                            color: fixedColor,
                            avatarUrl: avatarUrl || null,
                            username: username || null,
                            updatedAt: Date.now()
                        };
                        window.currentUserLocation = { lng, lat, color: fixedColor };
                    } catch { /* ignore */ }
                }

                // 清除固定状态
                localStorage.removeItem('cursor_fixed_to_homeland');
                localStorage.removeItem('fixed_cursor_lng');
                localStorage.removeItem('fixed_cursor_lat');
                localStorage.removeItem('fixed_cursor_color');

                console.log('[Homeland] ✅ 已移除固定的屏幕光标并恢复 effectScatter 光标');
            } catch (e) {
                console.warn('[Homeland] 移除固定光标失败:', e);
            }
        }

        /**
         * 恢复固定的屏幕光标
         */
        function restoreFixedCursor() {
            if (localStorage.getItem('cursor_fixed_to_homeland') === 'true') {
                const lng = localStorage.getItem('fixed_cursor_lng');
                const lat = localStorage.getItem('fixed_cursor_lat');
                const color = localStorage.getItem('fixed_cursor_color') || '#00ff41';

                if (lng && lat && !isNaN(Number(lng)) && !isNaN(Number(lat))) {
                    __cursorFixedToHomeland = true;
                    setFixedCursorOnScreen(Number(lng), Number(lat), color);
                    console.log('[Homeland] ✅ 已恢复固定的屏幕光标');
                }
            }
        }

        // ==========================================================
        // 固定光标位置同步（拖拽/缩放/重绘/刷新后仍定在保存坐标）
        // ==========================================================
        let __fixedCursorSyncRaf = 0;
        let __fixedCursorFollowHandlers = null;

        function _normalizeGraphicElements(graphicOpt) {
            if (!graphicOpt) return { elements: [] };
            // 某些情况下 getOption() 可能返回数组形式
            if (Array.isArray(graphicOpt)) return { elements: graphicOpt };
            if (typeof graphicOpt === 'object' && Array.isArray(graphicOpt.elements)) return { elements: graphicOpt.elements };
            return { elements: [] };
        }

        function syncFixedCursorGraphicPosition(reason = '') {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return false;
            if (localStorage.getItem('cursor_fixed_to_homeland') !== 'true') return false;

            const lngStr = localStorage.getItem('fixed_cursor_lng');
            const latStr = localStorage.getItem('fixed_cursor_lat');
            if (!lngStr || !latStr) return false;
            const lng = Number(lngStr);
            const lat = Number(latStr);
            if (isNaN(lng) || isNaN(lat)) return false;

            try {
                const px = mapChart.convertToPixel('geo', [lng, lat]);
                if (!px || !Array.isArray(px) || px.length < 2) return false;
                const x = Number(px[0]);
                const y = Number(px[1]);
                if (!isFinite(x) || !isFinite(y)) return false;

                const opt = mapChart.getOption();
                const { elements } = _normalizeGraphicElements(opt?.graphic);
                if (!elements || !Array.isArray(elements) || elements.length === 0) return false;

                const next = elements.map((el) => {
                    if (!el || el.id !== 'fixed-cursor') return el;
                    // 强制使用 x/y，清除 left/top（避免布局计算导致漂移）
                    const { left, top, ...rest } = el;
                    return { ...rest, x, y };
                });

                mapChart.setOption({ graphic: { elements: next } }, { notMerge: false, lazyUpdate: false });
                if (reason) console.log('[Homeland] 📌 同步固定光标位置:', reason, { lng, lat, x, y });
                return true;
            } catch (e) {
                console.warn('[Homeland] 同步固定光标位置失败:', reason, e);
                return false;
            }
        }

        function bindFixedCursorFollowMap() {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;

            // 解绑旧 handler，避免重复绑定
            try {
                if (__fixedCursorFollowHandlers) {
                    try { mapChart.off('georoam', __fixedCursorFollowHandlers.georoam); } catch { /* ignore */ }
                    try { mapChart.off('finished', __fixedCursorFollowHandlers.finished); } catch { /* ignore */ }
                }
            } catch { /* ignore */ }

            const scheduleSync = (reason) => {
                if (__fixedCursorSyncRaf) return;
                __fixedCursorSyncRaf = requestAnimationFrame(() => {
                    __fixedCursorSyncRaf = 0;
                    syncFixedCursorGraphicPosition(reason);
                });
            };

            const georoam = () => scheduleSync('echarts.georoam');
            const finished = () => scheduleSync('echarts.finished');
            __fixedCursorFollowHandlers = { georoam, finished };

            try { mapChart.on('georoam', georoam); } catch { /* ignore */ }
            try { mapChart.on('finished', finished); } catch { /* ignore */ }

            // 初次绑定后立即对齐一次（尤其是刷新/首次渲染完成后）
            scheduleSync('bindFixedCursorFollowMap.init');
        }

        // 🔍 LPDEF 5维度称号与说明（中英双语）
        const DIMENSION_TITLES = {
            L: {
                zh: { title: '架构师的直觉', description: '在逻辑迷宫中一眼看穿本质' },
                en: { title: "Architect's Intuition", description: 'Spot the core through any logic maze' }
            },
            P: {
                zh: { title: '深海潜航者', description: '面对复杂逻辑拥有极致的静气' },
                en: { title: 'Deep Sea Diver', description: 'Stay calm under complex logic' }
            },
            D: {
                zh: { title: '像素级侦探', description: '任何微小的代码瑕疵都无所遁形' },
                en: { title: 'Pixel-level Detective', description: 'Catch even the tiniest bug' }
            },
            E: {
                zh: { title: '共情架构师', description: '代码中流淌着对用户体验的极致理解' },
                en: { title: 'Empathy Architect', description: 'Build with user experience in mind' }
            },
            F: {
                zh: { title: '指尖打击乐手', description: '极致的输入频率下保持着惊人的准确率' },
                en: { title: 'Finger Drummer', description: 'High-frequency input, high accuracy' }
            }
        };

        const getLpdefTitle = (dim) => {
            const d = DIMENSION_TITLES[dim];
            if (!d) return '';
            return currentLang === 'en' ? (d.en?.title || '') : (d.zh?.title || '');
        };
        const getLpdefDescription = (dim) => {
            const d = DIMENSION_TITLES[dim];
            if (!d) return '';
            return currentLang === 'en' ? (d.en?.description || '') : (d.zh?.description || '');
        };
        
        let lpdefExperts = { L: null, P: null, D: null, E: null, F: null }; // 存储当前五个维度的专家信息
        // 地图渲染令牌：防止并发 init / dispose 导致 getZr 为空
        let mapRenderSeq = 0;
        
        // 全局数据存储：用于 Realtime 更新
        let latestRecords = [];

        /**
         * 数字格式化函数（智能处理大数字）
         * @param {number} num - 要格式化的数字
         * @returns {string} 格式化后的字符串（如 1.2M, 3.5K）
         */
        function formatNumber(num) {
            if (typeof num !== 'number' || isNaN(num)) {
                return '0';
            }
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            }
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toString();
        }

        /**
         * 数字滚动动画（requestAnimationFrame）
         * 需求：animateValue(id, end, duration) + 千分位格式化
         * @param {string} id - 目标元素 id
         * @param {number} end - 结束值
         * @param {number} duration - 动画持续时间（毫秒）
         * @param {Object} options - 可选项
         */
        function animateValue(id, end, duration = 1200, options = {}) {
            const el = document.getElementById(id);
            if (!el) return;

            const { start = 0, decimals = 0, useThousands = true } = options;
            const s = Number(start) || 0;
            const e = Number(end) || 0;
            const startTime = performance.now();

            const format = (val) => {
                const n = Number(val) || 0;
                if (useThousands) {
                    return n.toLocaleString(undefined, {
                        minimumFractionDigits: decimals,
                        maximumFractionDigits: decimals
                    });
                }
                return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
            };

            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

            function tick(now) {
                const t = Math.min((now - startTime) / duration, 1);
                const eased = easeOutCubic(t);
                const current = s + (e - s) * eased;
                el.textContent = format(decimals > 0 ? current : Math.floor(current));
                if (t < 1) requestAnimationFrame(tick);
                else el.textContent = format(e);
            }

            requestAnimationFrame(tick);
        }

        /**
         * 加载态骨架屏注入/移除
         */
        const numericIds = [
            'totalUsers',
            'totalAnalysis',
            'totalChars',
            'avgPerUser',
            'avgPerScan',
            'systemDays',
            'cityCount',
        ];

        function setLoadingState(isLoading) {
            const scan = document.getElementById('scanLine');
            if (scan) scan.classList.toggle('active', !!isLoading);

            numericIds.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.classList.toggle('skeleton', !!isLoading);
                if (isLoading) {
                    el.textContent = '000000';
                }
            });
        }

        function switchLang(lang) {
            const next = (String(lang || '').trim().toLowerCase() === 'en') ? 'en' : 'zh';
            try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* ignore */ }
            updateLanguageContext();
        }

        // 右上角国旗：点击切换中/英（并写入 localStorage.lang）
        function toggleLangByUSFlag() {
            try { switchLang(currentLang === 'en' ? 'zh' : 'en'); } catch { /* ignore */ }
        }

        // 动态同步顶部标题栏高度（避免抽屉/内容遮挡）
        function syncTopHeaderHeight() {
            try {
                const header = document.querySelector('.top-header');
                if (!header) return;
                const h = Math.max(0, Math.round(header.getBoundingClientRect().height || header.offsetHeight || 0));
                if (h > 0) {
                    document.documentElement.style.setProperty('--top-header-height', `${h}px`);
                }
            } catch { /* ignore */ }
        }
        try {
            // 首次渲染
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', async () => {
                    // 绑定国旗交互：点击写入 localStorage.lang，并刷新语言上下文
                    try {
                        const btnZh = document.getElementById('btn-zh');
                        const btnEn = document.getElementById('btn-en');
                        const setLangAndReload = (next) => {
                            const v = (String(next || '').trim().toLowerCase() === 'en') ? 'en' : 'zh';
                            try { localStorage.setItem(LANG_STORAGE_KEY, v); } catch { /* ignore */ }
                            // 兼容：部分页面/旧逻辑读取 localStorage.lang/appLanguage
                            try { localStorage.setItem('lang', v); } catch { /* ignore */ }
                            try { localStorage.setItem('appLanguage', v === 'en' ? 'en' : 'zh-CN'); } catch { /* ignore */ }
                            try { location.reload(); } catch { /* ignore */ }
                        };
                        if (btnZh) btnZh.addEventListener('click', () => setLangAndReload('zh'));
                        if (btnEn) btnEn.addEventListener('click', () => setLangAndReload('en'));
                    } catch { /* ignore */ }

                    // 初始化语言配置（可选）+ 首次刷新语言上下文
                    try { await loadLanguageConfig(); } catch { /* ignore */ }
                    try { updateLanguageContext(); } catch { /* ignore */ }
                    syncTopHeaderHeight();
                    setTimeout(syncTopHeaderHeight, 60);
                });
            } else {
                try {
                    const btnZh = document.getElementById('btn-zh');
                    const btnEn = document.getElementById('btn-en');
                    const setLangAndReload = (next) => {
                        const v = (String(next || '').trim().toLowerCase() === 'en') ? 'en' : 'zh';
                        try { localStorage.setItem(LANG_STORAGE_KEY, v); } catch { /* ignore */ }
                        try { localStorage.setItem('lang', v); } catch { /* ignore */ }
                        try { localStorage.setItem('appLanguage', v === 'en' ? 'en' : 'zh-CN'); } catch { /* ignore */ }
                        try { location.reload(); } catch { /* ignore */ }
                    };
                    if (btnZh) btnZh.addEventListener('click', () => setLangAndReload('zh'));
                    if (btnEn) btnEn.addEventListener('click', () => setLangAndReload('en'));
                } catch { /* ignore */ }
                try { loadLanguageConfig().then(() => updateLanguageContext()).catch(() => updateLanguageContext()); } catch { /* ignore */ }
                syncTopHeaderHeight();
                setTimeout(syncTopHeaderHeight, 60);
            }
            // resize 适配
            let __topHeaderResizeTimer = null;
            window.addEventListener('resize', () => {
                try { if (__topHeaderResizeTimer) clearTimeout(__topHeaderResizeTimer); } catch { /* ignore */ }
                __topHeaderResizeTimer = setTimeout(() => syncTopHeaderHeight(), 80);
            });
        } catch { /* ignore */ }

        /**
         * 检查地图数据是否已加载
         * world.js 加载后会在 echarts 中注册 'world' 地图
         */
        async function checkMapLoaded() {
            if (typeof echarts === 'undefined') {
                return false;
            }
            
            // 检查地图是否已注册
            // ECharts 5.x 使用 getMap 方法检查
            try {
                if (typeof echarts.getMap === 'function') {
                    const mapData = echarts.getMap('world');
                    if (mapData) {
                        console.log('[Map] ✅ 地图数据已注册');
                        return true;
                    }
                }
                
                // 降级检查：尝试注册地图（如果 world.js 已加载，地图数据会在全局变量中）
                // world.js 通常会将地图数据存储在某个全局变量中
                // 如果存在，手动注册
                if (typeof window !== 'undefined' && window.worldMapData) {
                    echarts.registerMap('world', window.worldMapData);
                    console.log('[Map] ✅ 从全局变量注册地图');
                    return true;
                }
                
                // 检查脚本标签是否已加载
                const worldScript = document.querySelector('script[src*="world.js"]');
                if (worldScript && worldScript.getAttribute('data-loaded') === 'true') {
                    console.log('[Map] ✅ world.js 脚本已标记为加载');
                    return true;
                }
                
                console.warn('[Map] ⚠️ 地图数据未找到，等待 world.js 加载...');
                return false;
            } catch (error) {
                console.warn('[Map] ⚠️ 检查地图数据时出错:', error);
                return false;
            }
        }

        /**
         * 创建单个维度卡片（用于抽屉显示）
         * @param {string} dimId - 维度ID
         * @param {Object} config - 维度配置
         * @param {number} maxValue - 最大值
         * @param {string} targetUserName - 用户名
         * @param {string|null} targetIpLocation - IP位置
         * @param {Object|null} feedback - 反馈信息
         * @param {boolean} isGlobalTopMode - 是否为全球最强模式
         * @returns {HTMLElement} 卡片元素
         */
        function createDimensionCard(dimId, config, maxValue, targetUserName, targetIpLocation, feedback, isGlobalTopMode) {
            const displayVal = new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN').format(maxValue);
            const unit = config.suffix || '';

            const card = document.createElement('div');
            card.className = `drawer-item cursor-pointer`;
            card.setAttribute('data-dim-id', dimId);
            if (targetIpLocation) {
                card.setAttribute('data-ip-location', targetIpLocation);
            }
            card.setAttribute('data-champion-name', targetUserName);
            card.setAttribute('data-champion-value', maxValue);
            card.setAttribute('data-champion-feedback', feedback ? JSON.stringify(feedback) : '');

            card.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">${config.icon}</span>
                    <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                        ${isGlobalTopMode ? 'TOP' : 'MINE'}
                    </span>
                </div>
                <div class="drawer-item-label">${config.name}</div>
                <div class="drawer-item-value text-2xl">${displayVal}<span class="text-[10px] ml-1 font-normal opacity-70">${unit}</span></div>
                <div class="drawer-item-desc mt-2 pt-2 border-t border-[#00ff41]/10">
                    <div class="text-[10px] text-white font-bold truncate">${feedback ? translateRankFeedbackLabel(dimId, feedback.label, maxValue) : 'RANKED'}</div>
                    <div class="text-[8px] text-[#00ff41]/60 truncate italic">@${targetUserName || 'ANONYMOUS'}</div>
                </div>
            `;

            // 添加地图联动交互
            card.addEventListener('click', () => {
                const ipLocation = card.getAttribute('data-ip-location');
                if (ipLocation && mapChart && !(typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) {
                    let countryName = null;
                    if (countryNameMap && countryNameMap[ipLocation]) {
                        countryName = countryNameMap[ipLocation].en;
                    } else {
                        countryName = ipLocation;
                    }
                    
                    if (countryName) {
                        const championName = card.getAttribute('data-champion-name');
                        const championValue = card.getAttribute('data-champion-value');
                        const championFeedback = card.getAttribute('data-champion-feedback');
                        const dimId = card.getAttribute('data-dim-id');
                        
                        currentChampionInfo = {
                            countryName: countryName,
                            championName: championName,
                            championValue: championValue,
                            feedback: championFeedback,
                            dimId: dimId
                        };
                        
                        try {
                            mapChart.dispatchAction({
                                type: 'highlight',
                                name: countryName
                            });
                            mapChart.dispatchAction({
                                type: 'showTip',
                                name: countryName
                            });
                            console.log(`[Drawer] ✅ 点击卡片，高亮国家: ${countryName}`);
                        } catch (error) {
                            console.error('[Drawer] ❌ 高亮国家失败:', error);
                        }
                    }
                }
            });

            return card;
        }

        // 保存当前打开抽屉的国家信息，用于刷新
        let currentDrawerCountry = { code: null, name: null };

        /**
         * 显示抽屉并填充国家数据和维度卡片
         * @param {string} countryCode - 国家代码
         * @param {string} countryName - 国家名称
         * @param {Object} [overrideRightData] - 可选，校准后拉取的国家摘要，用于右侧抽屉 10 项核心指标
         */
        function showDrawersWithCountryData(countryCode, countryName, overrideRightData, options) {
            const opts = (options && typeof options === 'object') ? options : {};
            // 保存当前国家信息
            currentDrawerCountry.code = countryCode;
            currentDrawerCountry.name = countryName;
            const leftDrawer = document.getElementById('left-drawer');
            const rightDrawer = document.getElementById('right-drawer');
            const leftTitle = document.getElementById('left-drawer-title');
            const rightTitle = document.getElementById('right-drawer-title');
            const leftBody = document.getElementById('left-drawer-body');
            const globalFlowPanel = document.getElementById('globalFlowPanel');
            const countryPanelEl = document.getElementById('countryPanel');
            const rightBody = globalFlowPanel || document.getElementById('right-drawer-body');

            if (!leftDrawer || !rightDrawer) return;
            // ✅ 关键：当用户正在看“国家透视”时，不允许 showDrawersWithCountryData 把右侧切回全网/实时流
            // 否则会出现“点 US/CN -> 立刻又回到全国/全网”的错觉。
            const ccUpperForPanel = String(countryCode || '').trim().toUpperCase();
            const preserveCountryPanel =
                !!opts.preserveCountryPanel ||
                (typeof currentViewState === 'string' &&
                    currentViewState === 'COUNTRY' &&
                    /^[A-Z]{2}$/.test(ccUpperForPanel));
            if (preserveCountryPanel) {
                if (globalFlowPanel) globalFlowPanel.style.display = 'none';
                if (countryPanelEl) countryPanelEl.style.display = '';
            } else {
                if (globalFlowPanel) globalFlowPanel.style.display = '';
                if (countryPanelEl) countryPanelEl.style.display = 'none';
            }

            // 获取国家显示名称
            const countryDisplayName = countryNameMap[countryCode] 
                ? (currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en)
                : countryName;

            // 更新标题
            if (rightTitle) rightTitle.textContent = countryDisplayName;

            // 清空抽屉内容
            if (leftBody) leftBody.innerHTML = '';
            if (rightBody) rightBody.innerHTML = '';

            // 右侧抽屉数据源：校准后传入的国家摘要优先；否则缓存优先；最后才用全局 lastData 兜底
            const ccUpper = String(countryCode || '').trim().toUpperCase();
            if (!window.__countrySummaryCache) window.__countrySummaryCache = new Map();
            const cachedSummary = (() => {
                try {
                    const hit = window.__countrySummaryCache.get(ccUpper);
                    return hit && typeof hit === 'object' ? (hit.summary || null) : null;
                } catch {
                    return null;
                }
            })();
            const rightDrawerData =
                overrideRightData != null
                    ? overrideRightData
                    : (cachedSummary != null ? cachedSummary : (window.lastData || {}));
            
            // 若没有传入国家摘要，则异步拉取“国家汇总(10项核心指标)”用于右侧抽屉汇总卡片
            // 不阻塞当前抽屉渲染：先用全局 lastData 兜底展示，拉取完成后自动刷新为国家口径
            try {
                const cc = ccUpper;
                const shouldFetchSummary =
                    overrideRightData == null &&
                    cc.length === 2 &&
                    typeof fetchCountrySummaryV3 === 'function';
                if (shouldFetchSummary) {
                    fetchCountrySummaryV3(cc)
                        .then((summary) => {
                            // 避免竞态：只在用户仍停留在同一国家时刷新
                            if (!summary) return;
                            try { window.__countrySummaryCache.set(cc, { summary, ts: Date.now() }); } catch { /* ignore */ }
                            if (!currentDrawerCountry || String(currentDrawerCountry.code || '').toUpperCase() !== cc) return;
                            // 关键保护：若当前处于国家透视（COUNTRY）模式，不允许这条“全球流面板”的刷新覆盖右抽屉
                            // 否则会出现“美区统计闪一下又被切回全球”的现象
                            if (typeof currentViewState === 'string' && currentViewState === 'COUNTRY') return;
                            showDrawersWithCountryData(cc, countryName, summary);
                        })
                        .catch(() => {});
                }
            } catch (e) {
                // ignore
            }

            // 定义维度配置（名称/单位随语言切换）
            const dimensionConfig = {
                ai: { name: translateDimensionName('ai'), icon: DIMENSION_NAME_I18N.ai?.icon || '💬', suffix: translateDimensionSuffix('ai') },
                word: { name: translateDimensionName('word'), icon: DIMENSION_NAME_I18N.word?.icon || '📏', suffix: translateDimensionSuffix('word') },
                day: { name: translateDimensionName('day'), icon: DIMENSION_NAME_I18N.day?.icon || '📅', suffix: translateDimensionSuffix('day') },
                no: { name: translateDimensionName('no'), icon: DIMENSION_NAME_I18N.no?.icon || '🚫', suffix: translateDimensionSuffix('no') },
                say: { name: translateDimensionName('say'), icon: DIMENSION_NAME_I18N.say?.icon || '💭', suffix: translateDimensionSuffix('say') },
                please: { name: translateDimensionName('please'), icon: DIMENSION_NAME_I18N.please?.icon || '🙏', suffix: translateDimensionSuffix('please') }
            };

            // 定义左右抽屉的维度分配
            // 左边抽屉：user_identity_config 卡片
            // 右边抽屉：所有维度卡片（ai, word, day, no, say, please）
            const leftDrawerDimensions = []; // 左边只显示 user_identity_config
            const rightDrawerDimensions = ['ai', 'word', 'day', 'no', 'say', 'please']; // 所有维度卡片

            // 获取当前用户数据（用于判断是否为全球最强模式）
            // 尝试从多个来源获取用户数据（与 window.onload 逻辑一致）
            let currentUser = null;
            try {
                // 方法1: 从全局变量获取
                if (window.currentUser) {
                    currentUser = window.currentUser;
                    console.log('[Drawer] ✅ 从全局变量获取到用户数据:', currentUser.user_name || currentUser.name);
                } else {
                    // 方法2: 从 localStorage 和 URL 参数获取，与 renderRankCards 逻辑一致
                    // 辅助函数：规范化指纹字符串（忽略大小写并剔除首尾空格）
                    const normalizeFingerprint = (fp) => {
                        if (!fp) return '';
                        return String(fp).trim().toLowerCase();
                    };

                    // 统一稳定指纹：user_fingerprint（缺失则生成并写入，避免抽屉一直 N/A）
                    const getOrCreateStableFingerprint = () => {
                        const KEY = 'user_fingerprint';
                        try {
                            const cur = normalizeFingerprint(localStorage.getItem(KEY) || '');
                            if (cur) return cur;
                            // 迁移旧 key
                            const legacy = normalizeFingerprint(
                                localStorage.getItem('cursor_clinical_fingerprint') ||
                                localStorage.getItem('vibe_fp') ||
                                localStorage.getItem('fingerprint') ||
                                ''
                            );
                            if (legacy) {
                                try { localStorage.setItem(KEY, legacy); } catch { /* ignore */ }
                                return legacy;
                            }
                            // 生成 32 位 hex（持久化）
                            let hex = '';
                            try {
                                const bytes = new Uint8Array(16);
                                (crypto || window.crypto).getRandomValues(bytes);
                                hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                            } catch {
                                hex = (String(Math.random()) + String(Date.now())).replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32);
                            }
                            const fp = normalizeFingerprint(hex.slice(0, 32));
                            if (fp) {
                                try { localStorage.setItem(KEY, fp); } catch { /* ignore */ }
                            }
                            return fp;
                        } catch {
                            return '';
                        }
                    };
                    
                    let localGitHubName = null;
                    let currentFingerprint = null;
                    try {
                        localGitHubName = localStorage.getItem('github_username');
                        currentFingerprint = getOrCreateStableFingerprint();
                        console.log('[Drawer] 🔍 从 localStorage 读取:', {
                            hasFingerprint: !!currentFingerprint,
                            fingerprintPrefix: currentFingerprint ? currentFingerprint.substring(0, 8) : null,
                            hasGitHub: !!localGitHubName
                        });
                    } catch (e) {
                        console.warn('[Drawer] ⚠️ 读取 localStorage 失败:', e);
                    }
                    
                    const urlParams = new URLSearchParams(window.location.search);
                    const urlFingerprint = urlParams.get('fingerprint');
                    const urlGitHubName = urlParams.get('github');
                    
                    // 规范化当前指纹
                    const normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                    const normalizedUrlFingerprint = normalizeFingerprint(urlFingerprint);
                    
                    // 查找匹配的用户数据（优先级：指纹优先 > GitHub ID）
                    let allData = window.allData || [];
                    console.log('[Drawer] 📊 allData 数据量:', allData.length);
                    
                    // 如果 allData 为空或很少，尝试重新获取数据
                    if (allData.length === 0 && normalizedCurrentFingerprint) {
                        console.log('[Drawer] ⚠️ allData 为空，尝试重新获取数据...');
                        // 异步重新获取数据（不阻塞抽屉显示）
                        fetchData().then(() => {
                            allData = window.allData || [];
                            console.log('[Drawer] ✅ 重新获取数据完成，allData 数据量:', allData.length);
                            
                            // 重新尝试匹配用户
                            const matchedUser = allData.find(item => {
                                const itemFingerprint = normalizeFingerprint(item.fingerprint || item.user_fingerprint);
                                const itemIdentity = normalizeFingerprint(item.user_identity);
                                return (itemFingerprint && itemFingerprint === normalizedCurrentFingerprint) ||
                                       (itemIdentity && itemIdentity === normalizedCurrentFingerprint);
                            });
                            
                            if (matchedUser) {
                                console.log('[Drawer] ✅ 重新匹配到用户:', matchedUser.user_name || matchedUser.name);
                                // 更新全局变量
                                window.currentUser = matchedUser;
                                // 重新渲染统计卡片
                                const leftBody = document.getElementById('left-drawer-body');
                                if (leftBody) {
                                    renderUserStatsCards(leftBody, matchedUser);
                                }
                            }
                        }).catch(err => {
                            console.error('[Drawer] ❌ 重新获取数据失败:', err);
                        });
                    }

                    // ✅ GitHub 兜底：如果 allData 为空但本机有 GitHub ID，也应尝试 fetchData() 再匹配
                    if (allData.length === 0 && !currentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                        console.log('[Drawer] ⚠️ allData 为空（GitHub 用户），尝试重新获取数据...');
                        fetchData().then(() => {
                            allData = window.allData || [];
                            console.log('[Drawer] ✅ 重新获取数据完成（GitHub 兜底），allData 数据量:', allData.length);

                            const normalizedLocalGitHub = normalizeFingerprint(localGitHubName);
                            const normalizedUrlGitHub = normalizeFingerprint(urlGitHubName);
                            const matchedUser = allData.find(item => {
                                const itemGitHub = normalizeFingerprint(item.github_username || item.github_id || item.user_name || item.name);
                                return itemGitHub && (itemGitHub === normalizedLocalGitHub || itemGitHub === normalizedUrlGitHub);
                            });

                            if (matchedUser) {
                                console.log('[Drawer] ✅ 重新匹配到 GitHub 用户:', matchedUser.user_name || matchedUser.name);
                                window.currentUser = matchedUser;
                                const leftBody = document.getElementById('left-drawer-body');
                                if (leftBody) {
                                    renderUserStatsCards(leftBody, getBestUserRecordForStats(matchedUser));
                                }
                                return;
                            }

                            // 二级兜底：直接从 Supabase 查询 GitHub 用户（避免不在 latestRecords 时一直 WAIT）
                            try {
                                if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function') {
                                    supabaseClient
                                        .from('v_unified_analysis_v2')
                                        .select('*')
                                        // GitHub 用户名大小写不敏感：避免 user_name 大小写不一致导致查不到
                                        .ilike('user_name', String(localGitHubName).trim())
                                        .maybeSingle()
                                        .then(({ data: dbUser }) => {
                                            if (!dbUser) return;
                                            console.log('[Drawer] ✅ Supabase 兜底找到 GitHub 用户:', dbUser.user_name || dbUser.name);
                                            window.currentUser = dbUser;
                                            const leftBody2 = document.getElementById('left-drawer-body');
                                            if (leftBody2) {
                                                renderUserStatsCards(leftBody2, getBestUserRecordForStats(dbUser));
                                            }
                                        })
                                        .catch(() => {});
                                }
                            } catch (e) { /* ignore */ }
                        }).catch(err => {
                            console.error('[Drawer] ❌ 重新获取数据失败（GitHub 兜底）:', err);
                        });
                    }
                    
                    // 优先通过指纹匹配
                    if (normalizedCurrentFingerprint || normalizedUrlFingerprint) {
                        console.log('[Drawer] 🔍 开始指纹匹配，目标指纹:', normalizedCurrentFingerprint || normalizedUrlFingerprint);
                        currentUser = allData.find(item => {
                            const itemFingerprint = normalizeFingerprint(item.fingerprint || item.user_fingerprint);
                            const itemIdentity = normalizeFingerprint(item.user_identity);
                            
                            const matchFingerprint = itemFingerprint && (itemFingerprint === normalizedCurrentFingerprint || itemFingerprint === normalizedUrlFingerprint);
                            const matchIdentity = itemIdentity && (itemIdentity === normalizedCurrentFingerprint || itemIdentity === normalizedUrlFingerprint);
                            
                            if (matchFingerprint || matchIdentity) {
                                console.log('[Drawer] ✅ 指纹匹配成功:', {
                                    itemFingerprint: itemFingerprint ? itemFingerprint.substring(0, 8) : null,
                                    itemIdentity: itemIdentity ? itemIdentity.substring(0, 8) : null,
                                    userName: item.user_name || item.name
                                });
                            }
                            
                            return matchFingerprint || matchIdentity;
                        });
                        
                        if (!currentUser) {
                            console.log('[Drawer] ⚠️ 指纹匹配失败，allData 中的指纹样本:', 
                                allData.slice(0, 3).map(item => ({
                                    fingerprint: item.fingerprint ? item.fingerprint.substring(0, 8) : null,
                                    user_identity: item.user_identity ? item.user_identity.substring(0, 8) : null,
                                    user_name: item.user_name || item.name
                                }))
                            );
                        }
                    }
                    
                    // 如果指纹未匹配，再退而求其次寻找 github_username
                    if (!currentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                        console.log('[Drawer] 🔍 开始 GitHub ID 匹配:', localGitHubName);
                        const normalizedLocalGitHub = normalizeFingerprint(localGitHubName);
                        const normalizedUrlGitHub = normalizeFingerprint(urlGitHubName);
                        
                        currentUser = allData.find(item => {
                            const itemGitHub = normalizeFingerprint(item.github_username || item.user_name || item.name);
                            return itemGitHub && (itemGitHub === normalizedLocalGitHub || itemGitHub === normalizedUrlGitHub);
                        });
                        
                        if (currentUser) {
                            console.log('[Drawer] ✅ 通过 GitHub ID 找到用户:', currentUser.user_name || currentUser.name);
                        }
                    }

                    // ✅ 最终兜底：allData 里没有但本机有 GitHub ID 时，直接查统一视图
                    if (!currentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                        try {
                            if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function') {
                                supabaseClient
                                    .from('v_unified_analysis_v2')
                                    .select('*')
                                    // GitHub 用户名大小写不敏感：避免 user_name 大小写不一致导致查不到
                                    .ilike('user_name', String(localGitHubName).trim())
                                    .maybeSingle()
                                    .then(({ data: dbUser }) => {
                                        if (!dbUser) return;
                                        console.log('[Drawer] ✅ Supabase 最终兜底找到 GitHub 用户:', dbUser.user_name || dbUser.name);
                                        window.currentUser = dbUser;
                                        const leftBody = document.getElementById('left-drawer-body');
                                        if (leftBody) {
                                            renderUserStatsCards(leftBody, getBestUserRecordForStats(dbUser));
                                        }
                                    })
                                    .catch(() => {});
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            } catch (e) {
                console.error('[Drawer] ❌ 获取用户数据失败:', e);
            }
            
            const isGlobalTopMode = !currentUser;
            const userData = currentUser;
            
            if (!currentUser) {
                console.log('[Drawer] ⚠️ 未找到当前用户数据，将显示全球最强模式');
            } else {
                console.log('[Drawer] ✅ 找到当前用户数据，将显示个人统计:', userData.user_name || userData.name);
            }

            // 填充左侧抽屉 - user_identity_config 卡片
            if (leftBody) {
                // 获取 GitHub 用户名和指纹（增加异常处理）
                let githubUsername = '';
                let currentFingerprint = null;
                try {
                    githubUsername = localStorage.getItem('github_username') || '';
                    currentFingerprint = localStorage.getItem('user_fingerprint');
                } catch (e) {
                    console.warn('[Drawer] ⚠️ 读取 localStorage 失败:', e);
                }
                
                // 判断是否为纯指纹用户（无 GitHub ID）
                // 【Task 3】传入 user_identity 参数，对 fingerprint 用户跳过严格校验
                const userIdentity = currentUser?.user_identity || null;
                const isFingerprintOnlyUser = !githubUsername || !isValidGitHubUsername(githubUsername, userIdentity);
                const fingerprintPrefix = currentFingerprint ? currentFingerprint.substring(0, 6).toUpperCase() : '';
                
                // 确定显示的用户名和头像
                let displayName = '';
                let displayLabel = '';
                let avatarUrl = DEFAULT_AVATAR;
                
                if (isFingerprintOnlyUser && currentFingerprint) {
                    // 纯指纹用户：显示"匿名专家 [指纹前6位]"
                    displayName = `匿名专家 ${fingerprintPrefix}`;
                    displayLabel = '设备指纹';
                    // 使用基于指纹的 Identicon
                    avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(currentFingerprint)}`;
                } else if (githubUsername && isValidGitHubUsername(githubUsername, userIdentity)) {
                    // 有 GitHub ID 的用户
                    displayName = githubUsername;
                    displayLabel = 'GitHub ID';
                    avatarUrl = getGitHubAvatarUrl(githubUsername);
                } else {
                    // 默认状态
                    displayName = '未设置';
                    displayLabel = 'GitHub ID';
                    avatarUrl = DEFAULT_AVATAR;
                }

                // 左侧抽屉标题：始终显示“当前用户”，避免地图点击后左侧看起来像丢了个人数据
                try {
                    if (leftTitle) leftTitle.textContent = displayName || '我的数据';
                } catch (e) { /* ignore */ }
                
                // 获取当前状态
                const currentStatus = localStorage.getItem('user_status') || 'idle';
                const statusConfig = USER_STATUSES[currentStatus] || USER_STATUSES.idle;
                
                // 创建 user_identity_config 卡片
                const identityCard = document.createElement('div');
                identityCard.className = 'drawer-item';
                identityCard.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">🕶️</span>
                        <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                            ${escapeHtml(getI18nText('badge.config') || 'CONFIG')}
                        </span>
                    </div>
                    
                    <div class="drawer-item-label mb-2">用户身份配置</div>
                    
                    <!-- 用户信息（GitHub 或指纹） -->
                    <div class="mb-3 pb-3 border-b border-[#00ff41]/10">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full overflow-hidden border border-[#00ff41]/30 flex-shrink-0">
                                <img 
                                    src="${avatarUrl}" 
                                    alt="Avatar" 
                                    class="w-full h-full object-cover"
                                    onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                                />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="drawer-item-value text-sm truncate">${displayName}</div>
                                <div class="drawer-item-desc text-[8px]">${displayLabel}</div>
                            </div>
                            ${githubUsername && isValidGitHubUsername(githubUsername, userIdentity)
                                ? `
                                <button 
                                    onclick="logout()"
                                    class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[8px] text-zinc-300 hover:text-white transition-colors rounded"
                                    title="退出登录"
                                >
                                    退出
                                </button>
                                `
                                : ''
                            }
                        </div>
                        <!-- 用户国家/地区：国旗 + 自动识别 / 用户校准 -->
                        <div id="user-country-flag" class="flex items-center gap-2 mt-2 text-[10px]"></div>
                        ${githubUsername && isValidGitHubUsername(githubUsername, userIdentity)
                            ? `
                            <a 
                                href="https://github.com/${githubUsername}" 
                                target="_blank"
                                rel="noopener noreferrer"
                                class="mt-2 inline-block text-[9px] text-[#00ff41]/70 hover:text-[#00ff41] transition-colors font-mono"
                            >
                                github.com/${githubUsername}
                            </a>
                            `
                            : ''
                        }
                    </div>
                    
                    <!-- 状态切换按钮（简约：仅用选中态表达当前状态） -->
                    <div class="drawer-item-label mb-2">${currentLang === 'zh' ? '状态' : 'Status'}</div>
                    <div class="flex gap-1.5">
                        <button 
                            onclick="setUserStatus('idle'); if(currentDrawerCountry.code) showDrawersWithCountryData(currentDrawerCountry.code, currentDrawerCountry.name);"
                            class="flex-1 px-2 py-1.5 bg-zinc-900/50 border ${currentStatus === 'idle' ? 'border-[#00ff41]' : 'border-zinc-800'} text-[10px] font-bold uppercase tracking-wider hover:border-[#00ff41] transition-colors"
                            style="color: ${currentStatus === 'idle' ? '#00ff41' : '#71717a'};"
                        >
                            🟢 极速
                        </button>
                        <button 
                            onclick="setUserStatus('busy'); if(currentDrawerCountry.code) showDrawersWithCountryData(currentDrawerCountry.code, currentDrawerCountry.name);"
                            class="flex-1 px-2 py-1.5 bg-zinc-900/50 border ${currentStatus === 'busy' ? 'border-[#ff8c00]' : 'border-zinc-800'} text-[10px] font-bold uppercase tracking-wider hover:border-[#ff8c00] transition-colors"
                            style="color: ${currentStatus === 'busy' ? '#ff8c00' : '#71717a'};"
                        >
                            🟠 忙碌
                        </button>
                        <button 
                            onclick="setUserStatus('sprint'); if(currentDrawerCountry.code) showDrawersWithCountryData(currentDrawerCountry.code, currentDrawerCountry.name);"
                            class="flex-1 px-2 py-1.5 bg-zinc-900/50 border ${currentStatus === 'sprint' ? 'border-[#ff006e]' : 'border-zinc-800'} text-[10px] font-bold uppercase tracking-wider hover:border-[#ff006e] transition-colors"
                            style="color: ${currentStatus === 'sprint' ? '#ff006e' : '#71717a'};"
                        >
                            🚀 冲刺
                        </button>
                    </div>
                    
                    <!-- GitHub OAuth 登录区域 -->
                    <div class="mt-3 pt-3 border-t border-[#00ff41]/10" id="auth-login-section">
                        ${githubUsername && isValidGitHubUsername(githubUsername, userIdentity) 
                            ? ''
                            : `
                            <!-- 未登录状态：显示 GitHub 登录按钮 -->
                            <div class="drawer-item-label mb-2">GitHub 登录</div>
                            <button 
                                onclick="loginWithGitHub()"
                                class="w-full px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] border border-[#444d56] rounded-md text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
                            >
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path>
                                </svg>
                                <span>使用 GitHub 登录</span>
                            </button>
                            <div class="text-[8px] text-[#00ff41]/40 mt-2 text-center">
                                安全、快速、一键登录
                            </div>
                            `
                        }
                    </div>
                `;
                
                leftBody.appendChild(identityCard);

                // 填充用户国家/地区：优先使用 localStorage 中的手动校准信息
                if (typeof updateUserCountryFlag === 'function') {
                    let countryCode = '';
                    let countryName = '';
                    let isManual = false;

                    // 优先级 1: localStorage 中的手动校准信息
                    if (localStorage.getItem('loc_fixed') === 'true' && localStorage.getItem('loc_locked') === 'true') {
                        countryCode = localStorage.getItem('manual_location') || '';
                        if (countryCode) {
                            countryName = (countryNameMap[countryCode] ? countryNameMap[countryCode].en : countryCode) || '';
                            isManual = true;
                        }
                    }

                    // 优先级 2: currentUser 中的手动校准信息
                    if (!countryCode && currentUser) {
                        countryCode = currentUser.manual_location || '';
                        if (countryCode) {
                            countryName = (countryNameMap[countryCode] ? countryNameMap[countryCode].en : countryCode) || '';
                            isManual = true;
                        }
                    }

                    // 优先级 3: currentUser 中的国家代码
                    if (!countryCode && currentUser) {
                        countryCode = currentUser.country_code || currentUser.ip_location || '';
                        if (countryCode) {
                            countryName = (countryNameMap[countryCode] ? countryNameMap[countryCode].en : countryCode) || '';
                            isManual = !!(currentUser.manual_location || currentUser.manual_lat != null);
                        }
                    }

                    if (countryCode) {
                        updateUserCountryFlag(countryCode, countryName, isManual);
                    }
                }

                // 添加实时诊断活动卡片
                const activityCard = document.createElement('div');
                activityCard.className = 'drawer-item';
                activityCard.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">📡</span>
                        <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                            ${escapeHtml(getI18nText('badge.live') || 'LIVE')}
                        </span>
                    </div>
                    <div class="drawer-item-label mb-3">${escapeHtml((i18n[currentLang] && i18n[currentLang]['recent-activity']) ? i18n[currentLang]['recent-activity'] : (currentLang === 'en' ? 'Live Activity Feed' : '实时诊断活动'))}</div>
                    <div id="drawer-recentActivity" class="flex-1 overflow-y-auto max-h-[400px] text-[10px] font-mono space-y-3 pr-2"></div>
                `;
                leftBody.appendChild(activityCard);
                
                // 渲染实时诊断活动
                const data = window.lastData || {};
                const activityData = data.latestRecords || data.recentVictims || [];
                const drawerActivityList = document.getElementById('drawer-recentActivity');
                if (drawerActivityList) {
                    if (activityData.length === 0) {
                        drawerActivityList.innerHTML = `<div class="text-zinc-500 text-center py-4 text-[10px]">${escapeHtml(getI18nText('common.no_data') || (currentLang === 'en' ? 'No data' : '暂无数据'))}</div>`;
                    } else {
                        drawerActivityList.innerHTML = activityData.map((v, index) => {
                            const time = v.time || v.created_at || new Date().toISOString();
                            const type = v.type || v.personality_type || 'UNKNOWN';
                            const location = v.location || v.ip_location || (currentLang === 'en' ? 'Unknown' : '未知');
                            const name = v.name || (currentLang === 'en' ? `Record ${index + 1}` : `记录${index + 1}`);
                            
                            const avatarUrl = v.avatar_url || null;
                            const githubUsername = v.github_username || null;
                            
                            // 【修复】将 recordUserIdentity 定义移到 if 块外，确保在所有情况下都能访问
                            const recordUserIdentity = v.user_identity || null;
                            
                            let finalAvatarUrl = avatarUrl;
                            if (!finalAvatarUrl && githubUsername) {
                                // 【Task 3】传入 user_identity，对 fingerprint 用户跳过严格校验
                                if (isValidGitHubUsername(githubUsername, recordUserIdentity)) {
                                    finalAvatarUrl = getGitHubAvatarUrl(githubUsername);
                                } else {
                                    finalAvatarUrl = DEFAULT_AVATAR;
                                }
                            }
                            if (!finalAvatarUrl) {
                                finalAvatarUrl = DEFAULT_AVATAR;
                            }
                            
                            const finalUsername = githubUsername || name;
                            // 【修复】传入 user_identity，对 fingerprint 用户跳过严格校验
                            // 只传有效的 GitHub 用户名，避免"记录1"这样的值触发校验警告
                            const usernameForAvatar = githubUsername && isValidGitHubUsername(githubUsername, recordUserIdentity) 
                                ? githubUsername 
                                : null;
                            const avatarHtml = createAvatarHtml(finalAvatarUrl, usernameForAvatar, 24, recordUserIdentity);
                            
                            return `
                                <div class="border-l-2 border-[#00ff41]/20 pl-2 py-1.5 flex items-start gap-2">
                                    <div class="flex-shrink-0 mt-0.5">
                                        ${avatarHtml}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-zinc-500 text-[9px]">${new Date(time).toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'zh-CN')}</div>
                                        <div class="text-white text-[10px] font-bold">${name.length > 8 ? name.slice(0,8) + '...' : name}</div>
                                        <div class="text-[#00ff41] text-[9px]">${type} @ ${location}</div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }
                
                // 如果检测到当前用户数据，自动加载用户统计卡片（优先使用 allData 中同人的完整记录，以显示提交聊天记录对应的数值）
                if (currentUser) {
                    const userForStats = getBestUserRecordForStats(currentUser);
                    console.log('[Drawer] 📊 开始渲染用户统计卡片，使用', userForStats !== currentUser ? 'allData 中的完整记录' : '当前用户记录');
                    renderUserStatsCards(leftBody, userForStats);
                } else {
                    console.log('[Drawer] ⚠️ 未找到用户数据，跳过统计卡片渲染');
                    // 即使没有匹配到用户，如果 localStorage 中有 fingerprint：
                    // - 先尝试直接从 v_unified_analysis_v2 按 fingerprint 拉取（避免一直 WAIT）
                    // - 失败则有限次数重试，最终给出明确提示（避免无限“处理中”）
                    try {
                        const currentFingerprint = (() => {
                            try { return localStorage.getItem('user_fingerprint') || localStorage.getItem('fingerprint') || ''; } catch { return ''; }
                        })();
                        const canQuerySupabase = (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function');
                        const attemptKey = '__drawerUserWaitAttempts';
                        const attempts = Number(window[attemptKey] || 0);

                        const showWaitCard = (mode = 'WAIT') => {
                            const waitingCard = document.createElement('div');
                            waitingCard.className = 'drawer-item';
                            waitingCard.innerHTML = `
                                <div class="flex items-center justify-between mb-3">
                                    <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">⏳</span>
                                    <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                                        ${mode}
                                    </span>
                                </div>
                                <div class="drawer-item-label mb-2">${escapeHtml(getI18nText('common.loading') || (currentLang === 'en' ? 'Loading...' : '数据加载中'))}</div>
                                <div class="text-[10px] text-[#00ff41]/60">
                                    ${escapeHtml(attempts >= 6
                                        ? (currentLang === 'en'
                                            ? 'No cloud summary found yet. Upload once on index.html, then refresh this page.'
                                            : '暂未找到云端汇总数据。请先在 index.html 上传一次聊天记录后再刷新。')
                                        : (currentLang === 'en'
                                            ? 'Syncing cloud data...'
                                            : '正在同步云端数据，请稍候…'))}
                                </div>
                                <div class="text-[8px] text-[#00ff41]/40 mt-2">
                                    ${escapeHtml(currentLang === 'en' ? 'Fingerprint' : '指纹')}: ${currentFingerprint ? currentFingerprint.substring(0, 8) : 'N/A'}...
                                </div>
                            `;
                            leftBody.appendChild(waitingCard);
                        };

                        if (currentFingerprint) {
                            // 先展示占位符（避免空白）
                            showWaitCard(attempts >= 6 ? 'EMPTY' : 'WAIT');

                            // 尝试直接查统一视图：按 fingerprint 精确匹配
                            if (canQuerySupabase && attempts < 6) {
                                window[attemptKey] = attempts + 1;
                                supabaseClient
                                    .from('v_unified_analysis_v2')
                                    .select('*')
                                    .eq('fingerprint', currentFingerprint)
                                    .maybeSingle()
                                    .then(({ data: dbUser }) => {
                                        if (!dbUser) return;
                                        console.log('[Drawer] ✅ 通过 fingerprint 从 v_unified_analysis_v2 找到用户:', dbUser.user_name || dbUser.name);
                                        window.currentUser = dbUser;
                                        const lb = document.getElementById('left-drawer-body');
                                        if (lb) renderUserStatsCards(lb, getBestUserRecordForStats(dbUser));
                                    })
                                    .catch(() => {});

                                // 退避重试：再次拉取大盘数据并重绘抽屉（避免永远卡住）
                                const delayMs = 600 + attempts * 600;
                                setTimeout(() => {
                                    try {
                                        if (typeof fetchData === 'function') fetchData();
                                        // 触发一次刷新：用“当前国家”重绘左侧抽屉
                                        if (currentDrawerCountry?.code) {
                                            showDrawersWithCountryData(currentDrawerCountry.code, currentDrawerCountry.name);
                                        }
                                    } catch { /* ignore */ }
                                }, delayMs);
                            }
                        }
                    } catch (e) {
                        console.warn('[Drawer] ⚠️ 显示/重试等待卡片失败:', e);
                    }
                }
            }

            // 填充右侧抽屉 - 维度卡片和统计卡片
            if (rightBody) {
                // 先添加维度卡片
                if (RANK_RESOURCES) {
                    rightDrawerDimensions.forEach((dimId) => {
                        const config = dimensionConfig[dimId];
                        if (!config) return;

                        // 获取维度数据
                        let targetData = null;
                        let maxValue = 0;
                        let targetUserName = '';
                        let targetIpLocation = null;

                        if (isGlobalTopMode) {
                            const allData = window.allData || [];
                            if (allData.length > 0) {
                                targetData = allData.reduce((maxUser, currentUser) => {
                                    const currentValues = extractDimensionValues(currentUser);
                                    const maxValues = extractDimensionValues(maxUser);
                                    const currentValue = currentValues[dimId] || 0;
                                    const maxValue = maxValues[dimId] || 0;
                                    return currentValue > maxValue ? currentUser : maxUser;
                                }, allData[0]);
                                
                                const targetValues = extractDimensionValues(targetData);
                                maxValue = targetValues[dimId] || 0;
                                targetUserName = targetData.user_name || targetData.name || targetData.github_username || '未知用户';
                                targetIpLocation = targetData.ip_location || null;
                            } else {
                                maxValue = 0;
                                targetUserName = '暂无数据';
                                targetIpLocation = null;
                            }
                        } else {
                            targetData = userData;
                            const values = extractDimensionValues(userData);
                            maxValue = values[dimId] || 0;
                            targetUserName = userData.user_name || userData.name || userData.github_username || '我的数据';
                            targetIpLocation = userData.ip_location || null;
                        }

                        const feedback = getRankFeedback(dimId, maxValue);
                        const card = createDimensionCard(dimId, config, maxValue, targetUserName, targetIpLocation, feedback, isGlobalTopMode);
                        rightBody.appendChild(card);
                    });
                }

                // 添加统计卡片（使用 rightDrawerData：校准后国家摘要或全局 lastData）
                const data = rightDrawerData;
                
                // 已诊断开发者
                const totalUsersCard = document.createElement('div');
                totalUsersCard.className = 'drawer-item';
                const totalUsers = data.totalUsers !== undefined && data.totalUsers !== null ? Number(data.totalUsers) : undefined;
                const nfDrawer = new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN');
                totalUsersCard.innerHTML = `
                    <div class="drawer-item-label">${(i18n[currentLang] && i18n[currentLang]['total-victims']) ? i18n[currentLang]['total-victims'] : (currentLang === 'en' ? 'Total Developers' : '已诊断开发者')}</div>
                    <div class="drawer-item-value text-3xl">${totalUsers !== undefined ? nfDrawer.format(totalUsers) : 'N/A'}</div>
                    <div class="drawer-item-desc">USERS_RECOGNIZED_SUCCESSFULLY</div>
                `;
                rightBody.appendChild(totalUsersCard);

                // 全网扫描次数
                const totalAnalysisCard = document.createElement('div');
                totalAnalysisCard.className = 'drawer-item';
                const totalAnalysis = data.totalAnalysis !== undefined && data.totalAnalysis !== null ? Number(data.totalAnalysis) : undefined;
                totalAnalysisCard.innerHTML = `
                    <div class="drawer-item-label">${(i18n[currentLang] && i18n[currentLang]['total-analysis']) ? i18n[currentLang]['total-analysis'] : (currentLang === 'en' ? 'Total Scans' : '全网扫描次数')}</div>
                    <div class="drawer-item-value text-3xl">${totalAnalysis !== undefined ? nfDrawer.format(totalAnalysis) : 'N/A'}</div>
                    <div class="drawer-item-desc">TOTAL_SCAN_COUNT</div>
                `;
                rightBody.appendChild(totalAnalysisCard);

                // 累计吐槽字数：绑定到 json.totalChars (276355)
                const totalCharsCard = document.createElement('div');
                totalCharsCard.className = 'drawer-item';
                const totalChars = data.totalChars !== undefined && data.totalChars !== null ? Number(data.totalChars) : (data.totalRoastWords !== undefined && data.totalRoastWords !== null ? Number(data.totalRoastWords) : undefined);
                totalCharsCard.innerHTML = `
                    <div class="drawer-item-label">${(i18n[currentLang] && i18n[currentLang]['total-roast']) ? i18n[currentLang]['total-roast'] : (currentLang === 'en' ? 'Total Roast Words' : '累计吐槽字数')}</div>
                    <div class="drawer-item-value text-3xl">${totalChars !== undefined ? nfDrawer.format(totalChars) : 'N/A'}</div>
                    <div class="drawer-item-desc">累计总字数统计</div>
                `;
                rightBody.appendChild(totalCharsCard);

                // 人均平均篇幅和单次平均篇幅（并排显示）
                const avgCard = document.createElement('div');
                avgCard.className = 'drawer-item';
                
                // 人均平均篇幅：totalChars / totalUsers
                let avgPerUser = data.avgPerUser !== undefined && data.avgPerUser !== null ? Number(data.avgPerUser) : undefined;
                if ((avgPerUser === undefined || avgPerUser === 0) && totalChars !== undefined && totalUsers !== undefined && totalUsers > 0) {
                    avgPerUser = Number(totalChars) / Number(totalUsers);
                }
                
                // 单次平均篇幅：totalChars / totalAnalysis
                let avgPerScan = data.avgPerScan !== undefined && data.avgPerScan !== null ? Number(data.avgPerScan) : undefined;
                if ((avgPerScan === undefined || avgPerScan === 0) && totalChars !== undefined && data.totalAnalysis !== undefined && data.totalAnalysis !== null && data.totalAnalysis > 0) {
                    avgPerScan = Number(totalChars) / Number(data.totalAnalysis);
                }
                avgCard.innerHTML = `
                    <div class="drawer-item-label mb-2">${escapeHtml(currentLang === 'en' ? 'Average Length' : '平均篇幅统计')}</div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <div class="drawer-item-value text-xl">${avgPerUser !== undefined ? avgPerUser.toFixed(1) : 'N/A'}</div>
                            <div class="drawer-item-desc text-[8px]">${escapeHtml(currentLang === 'en' ? 'Per User' : '人均平均篇幅')}</div>
                        </div>
                        <div>
                            <div class="drawer-item-value text-xl" style="color: #60a5fa;">${avgPerScan !== undefined ? avgPerScan.toFixed(1) : 'N/A'}</div>
                            <div class="drawer-item-desc text-[8px]">${escapeHtml(currentLang === 'en' ? 'Per Scan' : '单次平均篇幅')}</div>
                        </div>
                    </div>
                `;
                rightBody.appendChild(avgCard);

                // 全网平均开发者画像（雷达图）
                const radarCard = document.createElement('div');
                radarCard.className = 'drawer-item';
                const radarData = data.globalAverage || data.averages;
                radarCard.innerHTML = `
                    <div class="drawer-item-label mb-3">${escapeHtml((i18n[currentLang] && i18n[currentLang]['radar-title']) ? i18n[currentLang]['radar-title'] : (currentLang === 'en' ? 'Global Developer Persona' : '全网平均开发者画像'))}</div>
                    <div class="aspect-square">
                        <canvas id="drawer-radarChart"></canvas>
                    </div>
                `;
                rightBody.appendChild(radarCard);
                
                // 渲染雷达图
                setTimeout(() => {
                    const drawerRadarCanvas = document.getElementById('drawer-radarChart');
                    if (drawerRadarCanvas && typeof Chart !== 'undefined' && radarData) {
                        const normalizedRadarData = {
                            L: radarData.L !== undefined && radarData.L !== null ? Number(radarData.L) : undefined,
                            P: radarData.P !== undefined && radarData.P !== null ? Number(radarData.P) : undefined,
                            D: radarData.D !== undefined && radarData.D !== null ? Number(radarData.D) : undefined,
                            E: radarData.E !== undefined && radarData.E !== null ? Number(radarData.E) : undefined,
                            F: radarData.F !== undefined && radarData.F !== null ? Number(radarData.F) : undefined,
                        };
                        renderRadarChartToCanvas(drawerRadarCanvas, normalizedRadarData);
                    }
                }, 100);

                // 地理位置热力排行
                const locationCard = document.createElement('div');
                locationCard.className = 'drawer-item';
                locationCard.innerHTML = `
                    <div class="drawer-item-label mb-3">${escapeHtml((i18n[currentLang] && i18n[currentLang]['hot-list']) ? i18n[currentLang]['hot-list'] : (currentLang === 'en' ? 'Geographic Hotspots' : '地理位置热力排行'))}</div>
                    <div id="drawer-locationList" class="space-y-2"></div>
                `;
                rightBody.appendChild(locationCard);
                
                // 渲染地理位置列表
                if (data.locationRank && Array.isArray(data.locationRank)) {
                    const drawerLocationList = document.getElementById('drawer-locationList');
                    if (drawerLocationList) {
                        drawerLocationList.innerHTML = data.locationRank.slice(0, 5).map((item, i) => {
                            const name = countryNameMap[item.name] ? countryNameMap[item.name][currentLang] : item.name;
                            return `
                                <div class="flex justify-between items-center text-[10px] border-b border-[#00ff41]/10 pb-2">
                                    <span class="text-zinc-500 font-mono">0${i+1}</span>
                                    <span class="font-bold uppercase tracking-tighter text-white">${name}</span>
                                    <span class="text-[#00ff41] font-bold">${item.value}</span>
                                </div>`;
                        }).join('');
                    }
                }

                // 人格分布排行
                const personalityCard = document.createElement('div');
                personalityCard.className = 'drawer-item';
                personalityCard.innerHTML = `
                    <div class="drawer-item-label mb-3">${escapeHtml((i18n[currentLang] && i18n[currentLang]['personality-dist']) ? i18n[currentLang]['personality-dist'] : (currentLang === 'en' ? 'Personality Distribution' : '人格分布排行'))}</div>
                    <div id="drawer-personalityDistribution" class="space-y-2"></div>
                `;
                rightBody.appendChild(personalityCard);
                
                // 渲染人格分布
                if (data.personalityRank && Array.isArray(data.personalityRank)) {
                    const drawerPersonalityList = document.getElementById('drawer-personalityDistribution');
                    if (drawerPersonalityList) {
                        drawerPersonalityList.innerHTML = data.personalityRank.map((item, i) => {
                            const type = item.type || 'UNKNOWN';
                            const count = Number(item.count) || 0;
                            return `
                                <div class="flex justify-between items-center text-[10px] border-b border-[#00ff41]/10 pb-2">
                                    <span class="text-zinc-500 font-mono">0${i+1}</span>
                                    <span class="font-bold uppercase tracking-tighter text-white">${type}</span>
                                    <span class="text-[#00ff41] font-bold">${count}</span>
                                </div>`;
                        }).join('');
                    }
                }
            }

            // 显示抽屉
            leftDrawer.classList.add('active');
            rightDrawer.classList.add('active');

            // 【修复】保存抽屉打开状态和选中国家到 localStorage
            localStorage.setItem('left_drawer_open', 'true');
            localStorage.setItem('right_drawer_open', 'true');
            localStorage.setItem('selected_country', countryCode);
            console.log('[Drawer] 抽屉已打开:', countryDisplayName);
        }

        /**
         * 切换到「国家数据透视」模式（右侧抽屉显示该国雷达图 + 战神榜）
         * 先调用 showDrawersWithCountryData 填充左侧个人数据，再把右侧切为国家透视。
         * @param {string} code - 国家代码，如 'US'
         * @param {string} name - 国家名称，如 'United States'
         */
        function switchToCountryView(code, name) {
            showDrawersWithCountryData(code, name);
            currentViewState = 'COUNTRY';
            const rightDrawer = document.getElementById('right-drawer');
            const globalFlowPanel = document.getElementById('globalFlowPanel');
            const countryPanelEl = document.getElementById('countryPanel');
            if (!rightDrawer || !countryPanelEl) return;
            if (globalFlowPanel) globalFlowPanel.style.display = 'none';
            countryPanelEl.style.display = '';

            const leftTitle = document.getElementById('left-drawer-title');
            const rightTitle = document.getElementById('right-drawer-title');
            const displayName = countryNameMap[String(code || '').toUpperCase()]
                ? (currentLang === 'zh'
                    ? countryNameMap[String(code || '').toUpperCase()].zh
                    : countryNameMap[String(code || '').toUpperCase()].en)
                : name;
            if (leftTitle) leftTitle.textContent = displayName;
            if (rightTitle) rightTitle.textContent = displayName;

            renderCountryRightPanel(code, displayName);
            // 触发国家抽屉数据拉取（缓存优先 + 静默更新）
            try { updateCountryDashboard(code, null, { preferCache: true, silent: true }); } catch (e) { /* ignore */ }

            selectedCountry = code === 'US' ? 'US' : code;
            currentDrawerCountry.code = code;
            currentDrawerCountry.name = displayName;
            console.log('[Drawer] 国家透视已打开:', name);
        }

        // ============================
        // 国家透视（right.html 模板渲染，无打字机）
        // ============================
        function clamp(n, min, max) {
            const x = Number(n);
            if (isNaN(x)) return min;
            return Math.max(min, Math.min(max, x));
        }

        function pct(n) {
            const x = clamp(n, 0, 100);
            return `${x.toFixed(1)}%`;
        }

        function renderCountryRightPanel(code, name) {
            const mount = document.getElementById('countryTemplateMount');
            const tpl = document.getElementById('rightDrawerTemplate');
            if (!mount || !tpl) return;

            mount.innerHTML = '';
            const node = tpl.content.cloneNode(true);
            mount.appendChild(node);

            // 先渲染基础骨架（不再硬编码美国数据；数据由 updateCountryDashboard(countryName) 拉取）
            const cc = String(code || '').trim().toUpperCase();
            const model = {
                coord: (cc === 'US' || name === 'United States')
                    ? 'COORD: 37.0902° N, 95.7129° W'
                    : (cc === 'CN' || name === 'China' || name === '中国')
                        ? 'COORD: 35.8617° N, 104.1954° E'
                        : 'COORD: --',
                dataStatus: 'DATA: READY',
                flag: (cc === 'US' || name === 'United States')
                    ? '🇺🇸'
                    : (cc === 'CN' || name === 'China' || name === '中国')
                        ? '🇨🇳'
                        : (countryCodeToFlagEmoji(code) || '🏳️'),
                nodeName: `${String(name || 'REGION').toUpperCase()}_NODE`,
                diagnosedTotal: '--',
                scanTotal: '--',
                pk: {
                    leftLabel: currentLang === 'en' ? 'Tsundere' : '傲娇',
                    rightLabel: currentLang === 'en' ? 'Bootlick' : '跪舔',
                    leftPct: 50,
                    rightPct: 50,
                    quote: ''
                },
                meltdown: { words: '-- WORDS', fillPct: 0, level: 'PENDING', victims: '--' },
                semantic: { tags: [], mostUsed: 'MOST_USED: --', freq: 'FREQ: --' },
                elite: [],
                ratio: []
            };

            const q = (sel) => mount.querySelector(sel);
            const setText = (sel, v) => { const el = q(sel); if (el) el.textContent = String(v); };

            setText('#rtCoord', model.coord);
            setText('#rtDataStatus', model.dataStatus);
            setText('#rtFlag', model.flag);
            setText('#rtNodeName', model.nodeName);
            setText('#rtDiagnosedTotal', model.diagnosedTotal);
            setText('#rtScanTotal', model.scanTotal);
            setText('#rtMeritBoard', currentLang === 'en' ? 'Analyzed -- ×10k chars' : '已累计分析 -- 万字');

            setText('#rtPkLeftLabel', `${model.pk.leftLabel}`);
            setText('#rtPkRightLabel', `${model.pk.rightLabel}`);
            setText('#rtPkLeftPct', pct(model.pk.leftPct));
            setText('#rtPkRightPct', pct(model.pk.rightPct));
            // 兼容：rtPkQuote 已隐藏，不再渲染占位文案
            setText('#rtPkQuote', model.pk.quote || '');
            const pkLeftFill = q('#rtPkLeftFill');
            const pkRightFill = q('#rtPkRightFill');
            if (pkLeftFill) pkLeftFill.style.width = `${clamp(model.pk.leftPct, 0, 100)}%`;
            if (pkRightFill) pkRightFill.style.width = `${clamp(model.pk.rightPct, 0, 100)}%`;

            setText('#rtMeltdownWords', model.meltdown.words);
            setText('#rtMeltdownLevel', model.meltdown.level);
            setText('#rtMeltdownVictims', model.meltdown.victims);
            const meltdownFill = q('#rtMeltdownFill');
            if (meltdownFill) meltdownFill.style.width = `${clamp(model.meltdown.fillPct, 0, 100)}%`;

            // 注意：#rtSemanticTags 现在包含完整的“语义爆发”模板（含词云容器），不要在这里覆盖 innerHTML
            setText('#rtSemanticMostUsed', model.semantic.mostUsed);
            setText('#rtSemanticFreq', model.semantic.freq);

            // 注意：#rtEliteList 内包含 #rtTopTalentsList（高分图谱容器），
            // 骨架渲染阶段不要覆盖其 innerHTML，否则会把榜单 DOM 删掉导致一直空白。

            const ratioEl = q('#rtRatioList');
            if (ratioEl) {
                ratioEl.innerHTML = (model.ratio || []).map((r) => `
                    <div class="flex justify-between text-xs ${r.dim ? 'text-zinc-500' : ''}">
                        <span class="flex items-center gap-2"><div class="w-2 h-2 ${r.dotClass}"></div> ${String(r.label)}</span>
                        <span class="font-bold">${Number(r.pct).toFixed(1)}%</span>
                    </div>
                `).join('');
            }

            // 初始化 Lucide 图标（只要库加载完成即可）
            try {
                if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
                    lucide.createIcons();
                }
            } catch (e) {
                // ignore
            }

            // 初始化词云：非核心图表使用 requestIdleCallback，避免滚动卡顿
            try {
                const ric = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 0));
                ric(() => { try { loadWordCloud(); } catch (e) { /* ignore */ } }, { timeout: 1500 });
            } catch (e) {
                try { setTimeout(() => { loadWordCloud(); }, 50); } catch (e2) { /* ignore */ }
            }

            // 将“暂无数据”的占位渲染出来，避免空白
            const realtimeBox = q('#rtRealtimeList');
            if (realtimeBox && !realtimeBox.innerHTML.trim()) {
                realtimeBox.innerHTML = `<div class="text-zinc-500 text-xs">${escapeHtml(getI18nText('realtime.none') || (currentLang === 'en' ? 'No personality distribution yet' : '暂无人格分布数据'))}</div>`;
            }

            // 关键：国家透视模板渲染完毕后，立即执行页面翻译（避免英文模式仍显示中文硬编码）
            try { translatePage(); } catch { /* ignore */ }
        }

        function refreshCountryRightPanel() {
            if (currentViewState !== 'COUNTRY') return;
            if (!currentDrawerCountry || !currentDrawerCountry.code) return;
            renderCountryRightPanel(currentDrawerCountry.code, currentDrawerCountry.name);
            try { updateCountryDashboard(currentDrawerCountry.code); } catch (e) { /* ignore */ }
        }

        /**
         * 从国家透视切回「实时动态流」视图
         */
        function switchBackToGlobalView() {
            currentViewState = 'GLOBAL';
            const globalFlowPanel = document.getElementById('globalFlowPanel');
            const countryPanelEl = document.getElementById('countryPanel');
            if (globalFlowPanel) globalFlowPanel.style.display = '';
            if (countryPanelEl) countryPanelEl.style.display = 'none';
            if (currentDrawerCountry.code && currentDrawerCountry.name) {
                showDrawersWithCountryData(currentDrawerCountry.code, currentDrawerCountry.name);
            }
            console.log('[Drawer] 已切回全球/实时动态流');
        }

        /**
         * 关闭抽屉
         * @param {boolean} clearSelection - 是否清除选中状态，默认为 true
         */
        function closeDrawers(clearSelection = true) {
            const leftDrawer = document.getElementById('left-drawer');
            const rightDrawer = document.getElementById('right-drawer');

            if (leftDrawer) {
                leftDrawer.classList.remove('active');
                localStorage.setItem('left_drawer_open', 'false');
            }
            if (rightDrawer) {
                rightDrawer.classList.remove('active');
                localStorage.setItem('right_drawer_open', 'false');
            }

            if (clearSelection) {
                selectedCountry = null;
                localStorage.removeItem('selected_country');
                // 注意：anchored_country 是“地理标签/母国锚定”，不随关闭抽屉清除（刷新后仍应保持）
            }
            console.log('[Drawer] 抽屉已关闭, selectedCountry =', selectedCountry);
        }

        // 添加 ESC 键关闭抽屉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDrawers();
            }
        });

        // 点击抽屉外部区域关闭抽屉（简化版）
        // 只处理点击 UI 元素外部的情况，地图点击事件已经处理了地图区域的点击
        document.addEventListener('click', (e) => {
            const leftDrawer = document.getElementById('left-drawer');
            const rightDrawer = document.getElementById('right-drawer');
            
            if (!leftDrawer || !rightDrawer) return;
            
            // 如果抽屉是激活状态
            const isDrawerActive = leftDrawer.classList.contains('active') || rightDrawer.classList.contains('active');
            
            if (!isDrawerActive) return;
            
            // 检查点击是否在抽屉内部
            const isClickInsideDrawer = leftDrawer.contains(e.target) || rightDrawer.contains(e.target);
            
            // 如果点击在抽屉内部，不处理
            if (isClickInsideDrawer) return;
            
            // 【修复地图点击】检查是否点击了地图容器（包括 ECharts canvas 元素）
            // ECharts 渲染后，点击目标可能是 canvas 元素，需要检查其父容器
            const mapContainer = document.getElementById('map-container');
            const isMapClick = mapContainer && (
                e.target === mapContainer || 
                e.target.closest('#map-container') ||
                (e.target.tagName === 'CANVAS' && mapContainer.contains(e.target)) ||
                e.target.closest('canvas')
            );
            if (isMapClick) {
                // 地图点击事件由 ECharts 处理，这里不重复处理（避免关闭抽屉）
                console.log('[Drawer] 检测到地图点击，跳过关闭抽屉逻辑');
                return;
            }
            
            // 检查是否点击了 UI 交互元素（按钮、输入框等）
            const isUIClick = e.target.closest('.max-w-\\[1600px\\]') && 
                             (e.target.tagName === 'BUTTON' || 
                              e.target.tagName === 'INPUT' || 
                              e.target.tagName === 'SELECT' ||
                              e.target.tagName === 'TEXTAREA' ||
                              e.target.tagName === 'A' ||
                              e.target.closest('button') ||
                              e.target.closest('input') ||
                              e.target.closest('select') ||
                              e.target.closest('a'));
            
            // 如果点击的不是 UI 元素，也不是地图，则关闭抽屉
            if (!isUIClick) {
                console.log('[Drawer] 点击外部区域，关闭抽屉');
                selectedCountry = null;
                closeDrawers();
            }
        });

        /**
         * 等待地图数据加载完成
         */
        async function waitForMapData(maxWait = 10000) {
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWait) {
                if (await checkMapLoaded()) {
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.warn('[Map] ⚠️ 等待地图数据超时');
            return false;
        }

        // 保存全局地图数据，供抽屉使用
        let globalLocationData = [];

        /**
         * 初始化全球 2D 地图（支持缩放与拖动）
         * @param {Array} locationData - 地理位置数据 [{name: string, value: number}]
         */
        async function initGlobalMap(locationData) {
            try {
                // 保存到全局变量
                globalLocationData = locationData || [];
                const chartDom = document.getElementById('map-container');
                if (!chartDom) {
                    console.warn('[Map] ⚠️ 找不到地图容器元素');
                    return;
                }
                
                // 检查 ECharts 和 ECharts GL 是否已加载
                if (typeof echarts === 'undefined') {
                    console.warn('[Map] ⚠️ ECharts 未加载，无法渲染地图');
                    return;
                }
                
                // 渲染令牌（只允许最后一次调用继续执行）
                const seq = ++mapRenderSeq;
                // 如果这次调用已经过期，直接退出（避免 dispose 后还继续 setOption）
                if (seq !== mapRenderSeq) return;

                // 等待地图数据加载完成（尽量等待，但不强制阻断渲染）
                try {
                    await waitForMapData(5000);
                } catch (e) {
                    console.warn('[Map] ⚠️ 地图数据检查超时，继续尝试渲染');
                }

                // 复用实例：不存在则 init，存在则 clear（避免 dispose 并发问题）
                try {
                    if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) {
                        mapChart = echarts.init(chartDom, null, { renderer: 'canvas' });
                    } else {
                        mapChart.clear();
                    }
                } catch (e) {
                    // 兜底：如果实例异常，尝试重新创建
                    mapChart = echarts.init(chartDom, null, { renderer: 'canvas' });
                }
                
                // 地图数据必须已注册，否则等待并重试
                if (!echarts.getMap || !echarts.getMap('world')) {
                    console.warn('[Map] ⚠️ world 地图数据未注册（world.js 未加载完成），等待重试...');
                    // 等待 world.js 加载，最多等待 5 秒
                    let retryCount = 0;
                    const maxRetries = 50; // 50 * 100ms = 5秒
                    while (retryCount < maxRetries && (!echarts.getMap || !echarts.getMap('world'))) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        retryCount++;
                    }
                    
                    if (!echarts.getMap || !echarts.getMap('world')) {
                        console.error('[Map] ❌ world 地图数据加载超时');
                        chartDom.innerHTML = '<div class="flex items-center justify-center h-full text-zinc-500 text-sm">地图数据加载超时，请刷新页面</div>';
                        return;
                    }
                    console.log('[Map] ✅ world 地图数据已加载');
                }

                // 处理地理位置数据（2D 世界地图名称需与 world.js 的英文国家名匹配）
                const processedData = (locationData || []).map(item => ({
                    name: (countryNameMap[item.name]
                        ? countryNameMap[item.name].en
                        : (item.name === 'USA' ? 'United States' : item.name)),
                    value: item.value || 0
                }));

                const maxVal = Math.max(20, ...processedData.map(d => d.value || 0));

                const option2D = {
                    backgroundColor: 'transparent',
                    tooltip: {
                        trigger: 'item',
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        textStyle: { color: '#00ff41', fontFamily: 'JetBrains Mono' },
                        formatter: function(params) {
                            // 防御性检查：确保 params 存在
                            if (!params) {
                                return '<div class="font-mono text-xs">未知区域</div>';
                            }
                            
                            // 如果是地图国家数据，显示国家信息
                            if (params.seriesType === 'map') {
                                const name = params.name || params.data?.name || '未知区域';
                                const value = params.value || 0;
                                // 安全获取中文名称
                                const code = typeof resolveCountryCodeFromMapName === 'function'
                                    ? resolveCountryCodeFromMapName(name)
                                    : null;
                                const label =
                                    (code && countryNameMap && countryNameMap[code] && countryNameMap[code].zh)
                                        ? countryNameMap[code].zh
                                        : name;
                                
                                // Proxy 提示：判断 is_proxy 字段，若为 true，在地理位置后增加 [Proxy] 红色警告标签
                                const dataItem = params.data || {};
                                const isProxy = dataItem.is_proxy || dataItem.isProxy || false;
                                const proxyLabel = isProxy ? '<span style="color: #ef4444; font-weight: bold;"> [Proxy]</span>' : '';
                                
                                // 数据展示：在地图弹窗（Tooltip）中同步展示该冠军的称号和战绩
                                const activeNodesLabel = getI18nText('tooltip.active_nodes') || (currentLang === 'en' ? 'Active Nodes' : '活跃节点');
                                let tooltipContent = `<div class="font-mono text-xs">${label}${proxyLabel}<br/>${escapeHtml(activeNodesLabel)}: ${value}</div>`;
                                
                                // 如果当前有选中的冠军信息，且国家名称匹配，显示冠军信息
                                if (currentChampionInfo && currentChampionInfo.countryName === name) {
                                    const feedback = currentChampionInfo.feedback ? JSON.parse(currentChampionInfo.feedback) : null;
                                    const recordLabel = getI18nText('tooltip.record') || (currentLang === 'en' ? 'Record' : '战绩');
                                    const roastLabel = getI18nText('tooltip.roast') || (currentLang === 'en' ? 'Roast' : '吐槽');
                                    const translatedFbLabel = feedback ? translateRankFeedbackLabel(currentChampionInfo.dimId, feedback.label, currentChampionInfo.championValue) : '';
                                    tooltipContent = `
                                        <div class="font-mono text-xs">
                                            <div class="text-[#00ff41] font-bold mb-1">🏆 ${currentChampionInfo.championName}</div>
                                            <div class="text-white mb-1">${label}${proxyLabel}</div>
                                            <div class="text-zinc-400 text-[10px] mb-1">${escapeHtml(recordLabel)}: ${currentChampionInfo.championValue}</div>
                                            ${feedback ? `
                                                <div class="text-zinc-500 text-[9px] mt-2 pt-2 border-t border-zinc-700">
                                                    <div class="text-[#00ff41]">${escapeHtml(roastLabel)}${translatedFbLabel ? ` · ${escapeHtml(translatedFbLabel)}` : ''}</div>
                                                    <div class="text-white">${escapeHtml(String(feedback.title || '').trim())}</div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }
                                
                                return tooltipContent;
                            }
                            // 如果是脉冲点（effectScatter），显示用户信息（包含头像预览）
                            if (params.seriesType === 'effectScatter' && params.data) {
                                const pointData = params.data;
                                // 从数据点中获取头像信息
                                const avatarUrl = pointData.avatarUrl || params.series?.avatarUrl || null;
                                const username = pointData.username || params.series?.username || null;
                                const userName = params.name || username || '用户';
                                
                                if (avatarUrl || username) {
                                    // 判断逻辑：如果 username 无效，使用 DEFAULT_AVATAR
                                    let finalAvatarUrl = avatarUrl;
                                    if (!finalAvatarUrl && username) {
                                        // 【Task 3】对于地图上的用户点，如果是 fingerprint 用户则跳过严格校验
                                        // 注意：这里无法获取 user_identity，所以保持原逻辑（只检查 GitHub 用户名格式）
                                        if (isValidGitHubUsername(username)) {
                                            finalAvatarUrl = getGitHubAvatarUrl(username);
                                        } else {
                                            finalAvatarUrl = DEFAULT_AVATAR;
                                        }
                                    }
                                    // 如果还是没有有效的头像URL，使用默认头像
                                    if (!finalAvatarUrl) {
                                        finalAvatarUrl = DEFAULT_AVATAR;
                                    }
                                    
                                    // 使用HTML格式返回，包含头像图片
                                    // ECharts tooltip支持HTML，可以直接嵌入img标签
                                    return `
                                        <div style="display: flex; align-items: center; gap: 8px; padding: 4px;">
                                            <img 
                                                src="${finalAvatarUrl}" 
                                                alt="avatar" 
                                                style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #27272a;"
                                                onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                                            />
                                            <div>
                                                <div style="color: #00ff41; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: bold;">${userName}</div>
                                                <div style="color: #71717a; font-family: 'JetBrains Mono', monospace; font-size: 10px;">用户</div>
                                            </div>
                                        </div>
                                    `;
                                }
                                
                                return `<div style="color: #00ff41; font-family: 'JetBrains Mono', monospace;">👤 ${userName}</div>`;
                            }
                            return params.name || '';
                        },
                        // 启用HTML渲染模式
                        extraCssText: 'box-shadow: 0 0 10px rgba(0, 255, 65, 0.2);'
                    },
                    visualMap: {
                        min: 0,
                        max: maxVal,
                        show: false,
                        inRange: {
                            color: ['#064e3b', '#065f46', '#00ff41', '#34d399']
                        }
                    },
                    geo: {
                        map: 'world',
                        roam: true, // 启用拖动和缩放
                        scaleLimit: { min: 1, max: 8 },
                        zoom: 1.2,
                        itemStyle: {
                            areaColor: 'transparent',
                            borderColor: 'transparent',
                            borderWidth: 0
                        },
                        silent: true // 静默模式，不响应鼠标事件，让 map 系列处理
                    },
                    series: [{
                        type: 'map',
                        map: 'world',
                        // 启用拖动和缩放
                        roam: true,
                        // 限制缩放范围，避免无限放大/缩小
                        scaleLimit: { min: 1, max: 8 },
                        zoom: 1.2,
                        itemStyle: {
                            areaColor: 'transparent',
                            borderColor: 'rgba(0, 255, 65, 0.2)',
                            borderWidth: 1
                        },
                        emphasis: {
                            itemStyle: { areaColor: '#00ff41' },
                            label: { show: false }
                        },
                        data: processedData
                    }]
                };

                // notMerge: true 彻底替换，避免残留旧配置
                mapChart.setOption(option2D, { notMerge: true, lazyUpdate: false });

                // ====== 自愈：地图重绘后，确保「Current Location」光标不会被 notMerge:true 清掉 ======
                try {
                    bindMapCursorSelfHeal();
                    // 如果本地/全局已有坐标，渲染后立即恢复光标（解决“随机消失且刷新无效”）
                    ensureCurrentLocationCursorIfMissing('initGlobalMap-after-setOption');
                    // 绑定校准拖拽交互（仅校准模式下生效）
                    bindCurrentLocationDragHandlers();
                 } catch (e) {
                     console.warn('[Map] ⚠️ 绑定光标自愈/拖拽失败:', e);
                 }

                  // 【新功能】恢复固定的屏幕光标
                  try {
                      restoreFixedCursor();
                      // 绑定 roam/finished 同步，避免拖动地图或刷新重绘后“飘移”
                      bindFixedCursorFollowMap();
                      syncFixedCursorGraphicPosition('initGlobalMap-after-restoreFixedCursor');
                  } catch (e) {
                      console.warn('[Map] ⚠️ 恢复固定光标失败:', e);
                  }

                  // 【新增】绑定 graphic 元素的点击事件（用于固定光标的点击处理）
                  try {
                      const zr = typeof mapChart.getZr === 'function' ? mapChart.getZr() : null;
                      if (zr) {
                          // 解绑旧 handler，避免重复绑定
                          try {
                              if (window.__graphicClickHandler) {
                                  zr.off('click', window.__graphicClickHandler);
                              }
                          } catch { /* ignore */ }

                          window.__graphicClickHandler = (evt) => {
                              console.log('[Homeland] 🖱️ 检测到 zr click 事件:', evt);
                              if (!__cursorFixedToHomeland) return;

                              // 检查点击的是否是固定光标
                              try {
                                  const target = evt.target;
                                  console.log('[Homeland] 点击目标:', target);

                                  // 检查是否点击了固定光标相关的元素
                                  let isFixedCursorClick = false;
                                  if (target && target.type === 'group' && target.id === 'fixed-cursor') {
                                      isFixedCursorClick = true;
                                  } else if (target && target.parent && target.parent.id === 'fixed-cursor') {
                                      isFixedCursorClick = true;
                                  } else if (evt.relatedTarget && evt.relatedTarget.id === 'fixed-cursor') {
                                      isFixedCursorClick = true;
                                  }

                                  if (isFixedCursorClick) {
                                      console.log('[Homeland] 🖱️ 点击固定光标，弹出解除固定提示');
                                      showUnfixConfirmation(() => {
                                          // 确认解除固定
                                          removeFixedCursor();
                                          __cursorFixedToHomeland = false;
                                          localStorage.removeItem('cursor_fixed_to_homeland');
                                          console.log('[Homeland] ✅ 已解除母国固定');
                                      }, () => {
                                          // 取消
                                          console.log('[Homeland] ⚠️ 取消解除固定');
                                      });
                                  }
                              } catch (e) {
                                  console.warn('[Homeland] 处理 graphic 点击事件失败:', e);
                              }
                          };

                          zr.on('click', window.__graphicClickHandler);
                          console.log('[Homeland] ✅ 已绑定 graphic 元素的点击事件');
                      }
                  } catch (e) {
                      console.warn('[Homeland] ⚠️ 绑定 graphic 点击事件失败:', e);
                  }

                  // 添加地图点击事件处理 - 重新设计逻辑（含校准模式）
                mapChart.off('click'); // 移除旧的事件监听器
                mapChart.on('click', (params) => {
                    console.log('[Map] ✅ 地图点击事件已触发:', params);
                    
                     // ========== 点击「Current Location」光标：进入校准模式或解除固定 ==========
                     const isCurrentLocationClick = params.seriesType === 'effectScatter' && params.seriesName === 'Current Location';
                     if (isCurrentLocationClick) {
                         // 【新功能】如果光标已固定在母国，弹出解除固定提示
                         if (__cursorFixedToHomeland) {
                             showUnfixConfirmation(() => {
                                 // 确认解除固定
                                 removeFixedCursor();
                                 __cursorFixedToHomeland = false;
                                 localStorage.removeItem('cursor_fixed_to_homeland');
                                 console.log('[Homeland] ✅ 已解除母国固定');
                             }, () => {
                                 // 取消
                                 console.log('[Homeland] ⚠️ 取消解除固定');
                             });
                             return;
                         }

                         // 原有逻辑：进入校准模式
                         if (!isCalibrating) {
                             isCalibrating = true;
                             updateCurrentLocationCursorColor('#3b82f6');
                             console.log('[Map] 📍 进入校准模式，光标已变蓝');
                         }
                         return;
                     }
                    
                    // ========== 校准模式下点击地图任意位置：convertFromPixel 捕获经纬度并移动光标 ==========
                    if (isCalibrating) {
                        try {
                            const dom = mapChart.getDom();
                            if (dom && params.event) {
                                const rect = dom.getBoundingClientRect();
                                const x = (params.event.clientX != null ? params.event.clientX : params.event.offsetX) - rect.left;
                                const y = (params.event.clientY != null ? params.event.clientY : params.event.offsetY) - rect.top;
                                const point = mapChart.convertFromPixel('geo', [x, y]);
                                if (point && Array.isArray(point) && point.length >= 2) {
                                    const lng = Number(point[0]), lat = Number(point[1]);
                                    if (!isNaN(lng) && !isNaN(lat)) {
                                        pendingCalibration.lng = lng;
                                        pendingCalibration.lat = lat;
                                        // Geo-Fencing（300ms 防抖）：按坐标自动判国并触发母国锚定迁移
                                        scheduleGeoFenceByCoords(lng, lat, { source: 'map-click-calibrating' });
                                        const hasValidName = params.name && typeof params.name === 'string' && params.name.trim() !== '';
                                        if (params.seriesType === 'map' && hasValidName) {
                                            const countryName = params.name;
                                            let countryCode = null;
                                            for (const [code, names] of Object.entries(countryNameMap)) {
                                                if (names.en === countryName || names.zh === countryName || code === countryName) {
                                                    countryCode = code;
                                                    break;
                                                }
                                            }
                                            pendingCalibration.countryCode = countryCode || getCountryByCoords(lng, lat) || countryName;
                                            pendingCalibration.countryName = countryName;
                                        } else {
                                            // 无国家名称（点到海上等）：仍可用轻量判国兜底
                                            const ccGuess = getCountryByCoords(lng, lat);
                                            if (ccGuess) {
                                                pendingCalibration.countryCode = ccGuess;
                                                pendingCalibration.countryName = countryNameMap?.[ccGuess]?.en || ccGuess;
                                            }
                                        }
                                        moveCurrentLocationCursor(lng, lat);
                                        if (calibrationDebounceTimer) {
                                            clearTimeout(calibrationDebounceTimer);
                                            calibrationDebounceTimer = null;
                                        }
                                        calibrationDebounceTimer = setTimeout(() => {
                                            calibrationDebounceTimer = null;
                                            confirmCalibrationAndLock(
                                                pendingCalibration.countryCode,
                                                pendingCalibration.countryName,
                                                pendingCalibration.lng,
                                                pendingCalibration.lat
                                            );
                                        }, 1500);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[Map] convertFromPixel 失败:', e);
                        }
                        return;
                    }
                    
                    // 判断是否点击到了国家
                    const hasValidName = params.name && typeof params.name === 'string' && params.name.trim() !== '';
                    const isCountryClick = params.seriesType === 'map' && hasValidName;
                    console.log('[Map] 点击事件详情:', { seriesType: params.seriesType, name: params.name, isCountryClick, selectedCountryBefore: selectedCountry });

                    if (isCountryClick) {
                        const countryName = params.name;
                        // 优先用统一解析函数：适配 world 地图的英文全称/别名（尤其是美国）
                        let countryCode = typeof resolveCountryCodeFromMapName === 'function'
                            ? resolveCountryCodeFromMapName(countryName)
                            : null;
                        if (!countryCode) {
                            // 兜底：旧逻辑（ISO2 映射表 en/zh）
                            try {
                                for (const [code, names] of Object.entries(countryNameMap || {})) {
                                    if (names.en === countryName || names.zh === countryName || code === countryName) {
                                        countryCode = code;
                                        break;
                                    }
                                }
                            } catch (e) {}
                        }
                        if (!countryCode) countryCode = countryName;
                        console.log(`[Map] 🗺️ 点击国家: ${countryName} (${countryCode})`);
                        selectedCountry = countryCode;
                        // ✅ 统一事件流：
                        // - 解析到 ISO2：进入“国家透视右侧抽屉”（非全局面板），并做锚定/迁移
                        // - 解析不到 ISO2：兜底只打开抽屉（无法进入国家透视）
                        const ccUpper = String(countryCode || '').trim().toUpperCase();
                        if (/^[A-Z]{2}$/.test(ccUpper)) {
                            try { onCountrySwitch(ccUpper, { source: 'map-country-click', name: countryName }); } catch { /* ignore */ }
                        } else {
                            console.warn('[Map] ⚠️ 无法解析 ISO2 国家码，暂无法进入国家透视右抽屉:', { countryName, countryCode });
                            // 兜底：仍允许任意国家弹出抽屉（但不进入国家透视/不触发后端国籍更新）
                            try { showDrawersWithCountryData(countryCode, countryName); } catch { /* ignore */ }
                        }
                        return;
                    } else {
                        console.log('[Map] 🌊 点击空白处，清除选中状态并关闭抽屉');
                        selectedCountry = null;
                        closeDrawers(false);
                    }
                });

                
                // 添加双击事件，重置为全球视图
                mapChart.off('dblclick');
                mapChart.on('dblclick', (params) => {
                    if (params.seriesType === 'map') {
                        selectedCountry = null;
                        console.log('[Map] 🌍 双击重置为全球视图');
                        closeDrawers();
                        
                        // 地图双击后不再需要重新渲染 LPDEF 卡片（已废弃，使用 rank-cards-container）
                    }
                });
                
                // 响应式调整（移除旧 handler，避免多次绑定 + 并发 resize）
                try {
                    if (window.mapResizeHandler) {
                        window.removeEventListener('resize', window.mapResizeHandler);
                    }
                } catch (e) {
                    // ignore
                }
                const resizeHandler = () => {
                    if (mapChart && !(typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) {
                        mapChart.resize();
                        // resize 后 convertToPixel 的结果会变化，必须同步 fixed-cursor
                        try { syncFixedCursorGraphicPosition('window.resize'); } catch { /* ignore */ }
                    }
                };
                window.mapResizeHandler = resizeHandler;
                window.addEventListener('resize', resizeHandler);

                // 防止滚轮缩放地图时页面跟着滚动（仅在指针停留地图区域时生效）
                if (!chartDom.dataset.wheelLocked) {
                    chartDom.addEventListener('wheel', (e) => {
                        // ECharts 自己会消费滚轮用于缩放，这里阻止页面滚动
                        e.preventDefault();
                    }, { passive: false });
                    chartDom.dataset.wheelLocked = 'true';
                }

                console.log('[Map] ✅ 2D 地图渲染完成（已启用缩放/拖动）');
            } catch (error) {
                console.error('[Map] ❌ 2D 地图渲染失败:', error);
                chartDom.innerHTML = '<div class="flex items-center justify-center h-full text-zinc-500 text-sm">地图渲染失败</div>';
            }
        }

        /**
         * 地图脉冲特效：在地图上动态添加涟漪特效点（支持动态颜色）
         * @param {number} lng - 经度
         * @param {number} lat - 纬度
         * @param {string} label - 显示的标签文字
         * @param {string} color - 颜色值（十六进制，如 '#00ff41' 或 '#ffffff'）
         */
        /**
         * 设置或更新「当前用户」持久光标（seriesName: 'Current Location'），不自动移除
         */
        function setOrUpdateCurrentLocationCursor(lng, lat, color = '#00ff41', avatarUrl = null, username = null) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return;
            if (!color || typeof color !== 'string') color = '#00ff41';

            // 【新增】如果光标已被锁定，检查是否允许更新
            if (window.__cursorLocked) {
                // 只有当坐标与锁定的坐标一致时，才允许更新（用于颜色/头像更新）
                const lockedLat = localStorage.getItem('manual_lat');
                const lockedLng = localStorage.getItem('manual_lng');
                if (lockedLat && lockedLng && !isNaN(Number(lockedLat)) && !isNaN(Number(lockedLng))) {
                    const lockedLatNum = Number(lockedLat);
                    const lockedLngNum = Number(lockedLng);
                    // 允许小的浮点误差（0.0001 度约等于 11 米）
                    if (Math.abs(lat - lockedLatNum) > 0.0001 || Math.abs(lng - lockedLngNum) > 0.0001) {
                        console.warn('[MapCursor] 🔒 光标已锁定，拒绝位置更新:', {
                            requested: { lat, lng },
                            locked: { lat: lockedLatNum, lng: lockedLngNum }
                        });
                        return;
                    }
                }
            }

            try {
                const currentOption = mapChart.getOption();
                if (!currentOption || !currentOption.series || !Array.isArray(currentOption.series)) return;
                const otherSeries = currentOption.series.filter(s => s.name !== 'Current Location');
                const pulseSeries = {
                    name: 'Current Location',
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    data: [{ value: [lng, lat], name: 'YOU', avatarUrl: avatarUrl || null, username: username || null }],
                    symbolSize: 20,
                    showEffectOn: 'render',
                    rippleEffect: { brushType: 'stroke', scale: 5, period: 4, color: color },
                    itemStyle: { color: color, shadowBlur: 20, shadowColor: color },
                    label: { show: true, formatter: 'YOU', position: 'top', color: color, fontSize: 10, fontFamily: 'JetBrains Mono' },
                    avatarUrl: avatarUrl || null,
                    username: username || null,
                    zlevel: 10,
                    z: 10
                };
                mapChart.setOption({ series: [...otherSeries, pulseSeries] }, { notMerge: false, lazyUpdate: false });
                // 记录当前光标状态，供地图重绘自愈（避免"刷新也不回来"）
                try {
                    window.__currentLocationCursorState = {
                        lng,
                        lat,
                        color,
                        avatarUrl: avatarUrl || null,
                        username: username || null,
                        updatedAt: Date.now()
                    };
                    window.currentUserLocation = { lng, lat, color: color };
                } catch { /* ignore */ }
            } catch (e) { console.warn('[MapPulse] setOrUpdateCurrentLocationCursor:', e); }
        }

        /** 仅更新「Current Location」系列颜色（校准模式蓝 / 正常绿） */
        function updateCurrentLocationCursorColor(color) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            try {
                const opt = mapChart.getOption();
                if (!opt || !opt.series) return;
                const series = opt.series.map(s => {
                    if (s.name === 'Current Location') {
                        return {
                            ...s,
                            rippleEffect: { ...(s.rippleEffect || {}), color },
                            itemStyle: { ...(s.itemStyle || {}), color, shadowColor: color },
                            label: { ...(s.label || {}), color }
                        };
                    }
                    return s;
                });
                mapChart.setOption({ series }, { notMerge: false, lazyUpdate: false });
            } catch (e) { console.warn('[MapPulse] updateCurrentLocationCursorColor:', e); }
        }

        /** 将「Current Location」光标移动到 [lng, lat]（ECharts 动画） */
        function moveCurrentLocationCursor(lng, lat) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            try {
                const opt = mapChart.getOption();
                if (!opt || !opt.series) return;
                const series = opt.series.map(s => {
                    if (s.name === 'Current Location' && s.data && s.data.length > 0) {
                        return { ...s, data: [{ ...s.data[0], value: [lng, lat] }] };
                    }
                    return s;
                });
                mapChart.setOption({ series }, { notMerge: false, lazyUpdate: false });
                try {
                    // 同步记录，保证拖拽/点击移动后依旧可被自愈逻辑恢复
                    const prev = window.__currentLocationCursorState || {};
                    window.__currentLocationCursorState = {
                        ...prev,
                        lng,
                        lat,
                        updatedAt: Date.now()
                    };
                    window.currentUserLocation = { lng, lat, color: prev.color || '#00ff41' };

                    // 【新增】同步更新 localStorage 中的坐标（用于持久化）
                    if (localStorage.getItem('loc_fixed') === 'true' && localStorage.getItem('loc_locked') === 'true') {
                        localStorage.setItem('manual_lat', String(lat));
                        localStorage.setItem('manual_lng', String(lng));
                        console.log('[MapCursor] ✅ 已同步更新 localStorage 中的坐标:', { lat, lng });
                    }
                } catch { /* ignore */ }
            } catch (e) { console.warn('[MapPulse] moveCurrentLocationCursor:', e); }
        }

        // ==========================================================
        // 地图光标自愈 + 可拖拽校准（解决光标/脉冲随机消失 & 提升可用性）
        // ==========================================================
        function _getBestKnownUserCoords() {
            // 【修复】最高优先级：本地已锁定校准坐标（loc_fixed + loc_locked 双重保护）
            try {
                if (localStorage.getItem('loc_fixed') === 'true' && localStorage.getItem('loc_locked') === 'true') {
                    const lat = localStorage.getItem('manual_lat') ? Number(localStorage.getItem('manual_lat')) : null;
                    const lng = localStorage.getItem('manual_lng') ? Number(localStorage.getItem('manual_lng')) : null;
                    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
                        console.log('[MapCursor] 🔒 使用锁定的校准坐标:', { lat, lng, source: 'localStorage.manual_locked' });
                        return { lng, lat, source: 'localStorage.manual_locked' };
                    }
                }
            } catch { /* ignore */ }

            // 次优：本地已锁定校准坐标（loc_fixed + manual_lat/manual_lng，兼容旧逻辑）
            try {
                if (localStorage.getItem('loc_fixed') === 'true') {
                    const lat = localStorage.getItem('manual_lat') ? Number(localStorage.getItem('manual_lat')) : null;
                    const lng = localStorage.getItem('manual_lng') ? Number(localStorage.getItem('manual_lng')) : null;
                    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) return { lng, lat, source: 'localStorage.manual' };
                }
            } catch { /* ignore */ }

            // 第三优：全局用户数据（manual 优先）
            try {
                const u = window.currentUserData || window.currentUser || null;
                if (u) {
                    const lat = (u.manual_lat != null && !isNaN(Number(u.manual_lat))) ? Number(u.manual_lat)
                        : (u.lat != null && !isNaN(Number(u.lat)) ? Number(u.lat) : null);
                    const lng = (u.manual_lng != null && !isNaN(Number(u.manual_lng))) ? Number(u.manual_lng)
                        : (u.lng != null && !isNaN(Number(u.lng)) ? Number(u.lng) : null);
                    if (lat != null && lng != null) return { lng, lat, source: 'currentUser' };
                }
            } catch { /* ignore */ }

            // 兜底：最近一次在页面内绘制过的光标
            try {
                const s = window.__currentLocationCursorState;
                if (s && typeof s.lng === 'number' && typeof s.lat === 'number' && !isNaN(s.lng) && !isNaN(s.lat)) {
                    return { lng: s.lng, lat: s.lat, source: 'window.__currentLocationCursorState' };
                }
            } catch { /* ignore */ }
            return null;
        }

        function _getBestKnownCursorMeta() {
            // 颜色：跟随当前用户状态
            let color = '#00ff41';
            try {
                const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                if (statusConfig && statusConfig.status_color) color = statusConfig.status_color;
            } catch { /* ignore */ }

            // 用户名 + 头像：优先使用本地 GitHub 用户名
            let username = 'YOU';
            let avatarUrl = DEFAULT_AVATAR;
            try {
                const gh = localStorage.getItem('github_username') || null;
                if (gh) username = gh;
                avatarUrl = isValidGitHubUsername(gh) ? getGitHubAvatarUrl(gh) : DEFAULT_AVATAR;
            } catch { /* ignore */ }

            // 如果已有缓存状态，优先保留（避免颜色/头像抖动）
            try {
                const s = window.__currentLocationCursorState || null;
                if (s) {
                    if (s.color) color = s.color;
                    if (s.username) username = s.username;
                    if (s.avatarUrl) avatarUrl = s.avatarUrl;
                }
            } catch { /* ignore */ }

            return { color, avatarUrl, username };
        }

        function ensureCurrentLocationCursor(reason = '') {
            const coords = _getBestKnownUserCoords();
            if (!coords) return false;
            const meta = _getBestKnownCursorMeta();
            try {
                setOrUpdateCurrentLocationCursor(coords.lng, coords.lat, meta.color, meta.avatarUrl, meta.username);
                if (reason) console.log('[MapCursor] ✅ 已确保光标存在:', reason, coords.source);
                return true;
            } catch (e) {
                console.warn('[MapCursor] ⚠️ ensureCurrentLocationCursor 失败:', e);
                return false;
            }
        }

        // 全局标志：表示光标已被锁定，阻止其他操作更新
        window.__cursorLocked = false;

        // 【新增】强制恢复锁定的光标位置（更强的锁定保护）
        function forceRestoreLockedCursor() {
            if (localStorage.getItem('loc_locked') === 'true' && localStorage.getItem('loc_fixed') === 'true') {
                const manualLat = localStorage.getItem('manual_lat');
                const manualLng = localStorage.getItem('manual_lng');
                if (manualLat && manualLng && !isNaN(Number(manualLat)) && !isNaN(Number(manualLng))) {
                    const lat = Number(manualLat);
                    const lng = Number(manualLng);
                    // 读取用户信息（头像、用户名）
                    let githubUsername = 'YOU';
                    let avatarUrl = DEFAULT_AVATAR;
                    try {
                        githubUsername = localStorage.getItem('github_username') || 'YOU';
                        if (githubUsername && isValidGitHubUsername(githubUsername)) {
                            avatarUrl = getGitHubAvatarUrl(githubUsername);
                        }
                    } catch (e) { /* ignore */ }
                    // 强制恢复光标位置
                    if (typeof setOrUpdateCurrentLocationCursor === 'function') {
                        const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                        const pulseColor = statusConfig.status_color || '#00ff41';
                        setOrUpdateCurrentLocationCursor(lng, lat, pulseColor, avatarUrl, githubUsername);
                        window.__cursorLocked = true;
                        console.log('[MapCursor] 🔒 已强制恢复锁定的光标位置:', { lat, lng });
                        return true;
                    }
                }
            }
            return false;
        }

        function ensureCurrentLocationCursorIfMissing(reason = '') {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return false;
            try {
                const opt = mapChart.getOption();
                const has = !!(opt && Array.isArray(opt.series) && opt.series.some(s => s && s.name === 'Current Location'));
                // 【新增】如果光标已被锁定，不执行恢复逻辑（避免被覆盖）
                if (has && window.__cursorLocked) {
                    console.log('[MapCursor] 🔒 光标已锁定，跳过自愈恢复:', reason);
                    return true;
                }
                if (!has) return ensureCurrentLocationCursor(reason || 'missing');
                return true;
            } catch (e) {
                console.warn('[MapCursor] ⚠️ ensureCurrentLocationCursorIfMissing 失败:', e);
                return false;
            }
        }

        function bindMapCursorSelfHeal() {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            try {
                if (window.__mapCursorSelfHealHandler) {
                    try { mapChart.off('finished', window.__mapCursorSelfHealHandler); } catch { /* ignore */ }
                }
                window.__mapCursorSelfHealHandler = () => {
                    try {
                        if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
                        ensureCurrentLocationCursorIfMissing('echarts.finished-self-heal');
                    } catch { /* ignore */ }
                };
                mapChart.on('finished', window.__mapCursorSelfHealHandler);
            } catch (e) {
                console.warn('[MapCursor] ⚠️ bindMapCursorSelfHeal 失败:', e);
            }
        }

        function _setMapRoamEnabled(enabled) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            try {
                const opt = mapChart.getOption();
                if (!opt) return;
                const nextGeo = Array.isArray(opt.geo) ? opt.geo.map(g => ({ ...g, roam: !!enabled })) : opt.geo;
                const nextSeries = Array.isArray(opt.series) ? opt.series.map(s => {
                    if (s && s.type === 'map') return { ...s, roam: !!enabled };
                    return s;
                }) : opt.series;
                mapChart.setOption({ geo: nextGeo, series: nextSeries }, { notMerge: false, lazyUpdate: false });
            } catch { /* ignore */ }
        }

        // 校准拖拽状态
        let __isDraggingCurrentLocation = false;

        function bindCurrentLocationDragHandlers() {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
            const zr = typeof mapChart.getZr === 'function' ? mapChart.getZr() : null;
            if (!zr) return;

            // 解绑旧 handler，避免重复绑定导致“概率性失效”
            try {
                const prev = window.__currentLocationDragHandlers;
                if (prev) {
                    zr.off('mousedown', prev.mousedown);
                    zr.off('mousemove', prev.mousemove);
                    zr.off('mouseup', prev.mouseup);
                    zr.off('globalout', prev.mouseup);
                }
            } catch { /* ignore */ }

            const getXY = (evt) => {
                const x = (evt && (evt.offsetX ?? evt.zrX ?? evt.event?.offsetX ?? evt.event?.clientX)) ?? null;
                const y = (evt && (evt.offsetY ?? evt.zrY ?? evt.event?.offsetY ?? evt.event?.clientY)) ?? null;
                if (x == null || y == null) return null;
                // 如果是 clientX/clientY，需要减去 canvas 的 bounding rect
                if (evt && evt.event && evt.event.clientX != null && evt.event.clientY != null) {
                    try {
                        const dom = mapChart.getDom();
                        const rect = dom ? dom.getBoundingClientRect() : null;
                        if (rect) return { x: evt.event.clientX - rect.left, y: evt.event.clientY - rect.top };
                    } catch { /* ignore */ }
                }
                return { x, y };
            };

            const getCurrentCursorPixel = () => {
                try {
                    const opt = mapChart.getOption();
                    const s = Array.isArray(opt?.series) ? opt.series.find(ss => ss && ss.name === 'Current Location') : null;
                    const v = s?.data?.[0]?.value;
                    if (!v || !Array.isArray(v) || v.length < 2) return null;
                    const lng = Number(v[0]), lat = Number(v[1]);
                    if (isNaN(lng) || isNaN(lat)) return null;
                    const px = mapChart.convertToPixel('geo', [lng, lat]);
                    if (!px || !Array.isArray(px) || px.length < 2) return null;
                    return { x: Number(px[0]), y: Number(px[1]), lng, lat };
                } catch {
                    return null;
                }
            };

            const mousedown = (evt) => {
                if (!isCalibrating) return;

                // 【新功能】如果光标已固定在母国，禁止拖动
                if (__cursorFixedToHomeland) {
                    console.log('[Homeland] 🔒 光标已固定在母国，禁止拖动');
                    return;
                }

                const xy = getXY(evt);
                if (!xy) return;
                const cur = getCurrentCursorPixel();
                if (!cur) return;
                const dx = xy.x - cur.x, dy = xy.y - cur.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // 命中阈值：略大于 symbolSize（20），方便拖拽
                if (dist <= 26) {
                    __isDraggingCurrentLocation = true;
                    _setMapRoamEnabled(false); // 拖拽时暂时禁用漫游，避免地图跟着跑
                    try { evt.event && evt.event.preventDefault && evt.event.preventDefault(); } catch { /* ignore */ }
                }
            };

            const mousemove = (evt) => {
                if (!isCalibrating || !__isDraggingCurrentLocation) return;
                const xy = getXY(evt);
                if (!xy) return;
                try {
                    const point = mapChart.convertFromPixel('geo', [xy.x, xy.y]);
                    if (!point || !Array.isArray(point) || point.length < 2) return;
                    const lng = Number(point[0]), lat = Number(point[1]);
                    if (isNaN(lng) || isNaN(lat)) return;
                    pendingCalibration.lng = lng;
                    pendingCalibration.lat = lat;
                    // Geo-Fencing（300ms 防抖）：拖拽光标时自动判国；跨境时触发 onCountrySwitch
                    scheduleGeoFenceByCoords(lng, lat, { source: 'cursor-drag-calibrating' });
                    // 国家优先沿用锚定国家（可先点国家，再拖光标）
                    if (!pendingCalibration.countryCode) {
                        const anchored = _getAnchoredCountryFromStorage();
                        if (anchored) {
                            pendingCalibration.countryCode = anchored;
                            pendingCalibration.countryName = (countryNameMap[anchored]?.en || anchored);
                        }
                    }
                    moveCurrentLocationCursor(lng, lat);
                } catch { /* ignore */ }
            };

            const mouseup = () => {
                if (!__isDraggingCurrentLocation) return;
                __isDraggingCurrentLocation = false;
                _setMapRoamEnabled(true);
                // 松手后快速确认一次（避免频繁请求）
                try {
                    if (pendingCalibration && pendingCalibration.lng != null && pendingCalibration.lat != null) {
                        const anchored = _getAnchoredCountryFromStorage();
                        const cc = pendingCalibration.countryCode || anchored || (window.currentUser?.manual_location || window.currentUser?.country_code) || null;
                        const cn = pendingCalibration.countryName ||
                            (cc && countryNameMap[String(cc).toUpperCase()] ? countryNameMap[String(cc).toUpperCase()].en : null) ||
                            cc;

                        // 【新功能】弹出母国确认提示
                        if (cn) {
                            showHomelandConfirmation(cn, () => {
                                // 确认后：固定光标在屏幕上
                                const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                                const pulseColor = statusConfig.status_color || '#00ff41';
                                setFixedCursorOnScreen(pendingCalibration.lng, pendingCalibration.lat, pulseColor);
                                __cursorFixedToHomeland = true;

                                // 保存到 localStorage
                                localStorage.setItem('manual_location', cc || '');
                                localStorage.setItem('manual_lat', String(pendingCalibration.lat));
                                localStorage.setItem('manual_lng', String(pendingCalibration.lng));
                                localStorage.setItem('loc_fixed', 'true');
                                localStorage.setItem('loc_locked', 'true');

                                // 更新 UI
                                updateUserCountryFlag(cc || '', cn || '', true);
                                if (typeof renderRankCards === 'function' && window.currentUser) {
                                    window.currentUser.manual_location = cc;
                                    window.currentUser.country_code = cc;
                                    window.currentUser.manual_lat = pendingCalibration.lat;
                                    window.currentUser.manual_lng = pendingCalibration.lng;
                                    renderRankCards(window.currentUser);
                                }

                                console.log('[Homeland] ✅ 已将', cn, '设置为母国');
                            }, () => {
                                // 取消后：继续原来的逻辑（使用 effectScatter）
                                confirmCalibrationAndLock(cc, cn, pendingCalibration.lng, pendingCalibration.lat);
                            });
                        } else {
                            // 如果没有国家名称，直接使用原来的逻辑
                            confirmCalibrationAndLock(cc, cn, pendingCalibration.lng, pendingCalibration.lat);
                        }
                    }
                } catch (e) {
                    console.warn('[MapCursor] ⚠️ 拖拽确认失败:', e);
                }
            };

            zr.on('mousedown', mousedown);
            zr.on('mousemove', mousemove);
            zr.on('mouseup', mouseup);
            zr.on('globalout', mouseup);
            window.__currentLocationDragHandlers = { mousedown, mousemove, mouseup };
        }

        function setCalibrationMode(enabled) {
            isCalibrating = !!enabled;
            try {
                const hintEl = document.getElementById('map-cursor-hint');
                if (hintEl) hintEl.style.display = isCalibrating ? '' : 'none';
                const dot = document.querySelector('#btn-calibrate-location span');
                if (dot) dot.style.background = isCalibrating ? '#3b82f6' : '#00ff41';
                const t = document.getElementById('btn-calibrate-location-text');
                if (t) t.textContent = isCalibrating ? '退出校准' : '校准位置';
            } catch { /* ignore */ }

            // 进入校准模式：确保光标存在并变蓝；退出则恢复绿色
            try {
                ensureCurrentLocationCursorIfMissing('toggle-calibration');
                updateCurrentLocationCursorColor(isCalibrating ? '#3b82f6' : '#00ff41');
            } catch { /* ignore */ }
        }

        function initMapCursorTools() {
            try {
                const btn = document.getElementById('btn-calibrate-location');
                if (!btn) return;
                btn.addEventListener('click', () => setCalibrationMode(!isCalibrating));
                // 页面首次加载：如果本地已锁定校准，则默认显示绿色光标（即使地图重绘也能自愈）
                setTimeout(() => {
                    try { ensureCurrentLocationCursorIfMissing('init-tools'); } catch { /* ignore */ }
                }, 0);
            } catch (e) {
                console.warn('[MapCursor] ⚠️ initMapCursorTools 失败:', e);
            }
        }

        /**
         * 校准确认：调用 /api/v2/analyze 持久化 manual_location（国家代码）、manual_lat、manual_lng，退出校准并更新 UI
         * @param {string} countryCode - 国家代码（如 CN、US），用于 manual_location
         * @param {string} countryName - 国家名称（用于展示）
         * @param {number} lng - 经度
         * @param {number} lat - 纬度
         */
        async function confirmCalibrationAndLock(countryCode, countryName, lng, lat) {
            if (calibrationDebounceTimer) {
                clearTimeout(calibrationDebounceTimer);
                calibrationDebounceTimer = null;
            }
            isCalibrating = false;
            updateCurrentLocationCursorColor('#00ff41');

            const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
            const base = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
            const analyzeUrl = base ? `${base}/api/v2/analyze` : '/api/v2/analyze';
            let fingerprint = null;
            try {
                fingerprint = localStorage.getItem('user_fingerprint') || window.fpId || null;
            } catch (e) {}
            const payload = {
                chatData: [{ role: 'USER', text: '.' }],
                manual_location: countryCode || null,
                manual_lat: lat,
                manual_lng: lng,
                fingerprint: fingerprint
            };
            try {
                const res = await fetch(analyzeUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    console.warn('[Calibration] ⚠️ 校准接口返回非 2xx:', res.status);
                } else {
                    const data = await res.json().catch(() => ({}));
                    // 【新增】锁定标志：防止后续异步操作覆盖
                    localStorage.setItem('loc_locked', 'true');
                    window.__cursorLocked = true; // 设置全局锁定标志
                    // 状态持久化：确认定居后立即写入锁定标记与坐标，并重绘地图光标为绿色
                    localStorage.setItem('loc_fixed', 'true');
                    if (!window.currentUserData) window.currentUserData = window.currentUser || {};
                    window.currentUserData.manual_lat = lat;
                    window.currentUserData.manual_lng = lng;
                    window.currentUserData.manual_location = countryCode;
                    localStorage.setItem('manual_lat', String(lat));
                    localStorage.setItem('manual_lng', String(lng));
                    if (countryCode && String(countryCode).trim() !== '') localStorage.setItem('manual_location', String(countryCode).trim());
                    // 同步“锚定国家”：用于 report-vibe manual_region
                    try { _setAnchoredCountry(countryCode); } catch { /* ignore */ }
                    updateCurrentLocationCursorColor('#00ff41'); // 立即重绘地图光标为绿色
                    // 【新增】设置全局锁定标志
                    window.__cursorLocked = true;
                    // 【新增】立即恢复锁定的光标位置（确保一致性）
                    setTimeout(() => forceRestoreLockedCursor(), 100);
                    // 视觉锁定：同步 currentUser，防止刷新前延迟导致跳动
                    if (window.currentUser) {
                        window.currentUser.manual_location = countryCode;
                        window.currentUser.country_code = countryCode;
                        window.currentUser.manual_lat = lat;
                        window.currentUser.manual_lng = lng;
                    }
                    updateUserCountryFlag(countryCode, countryName, true);
                    if (typeof renderRankCards === 'function' && window.currentUser) renderRankCards(window.currentUser);
                    if (typeof window.refreshUserStats === 'function') {
                        setTimeout(() => window.refreshUserStats(), 300);
                    }
                    // 校准确认后立即重载黑话榜（右侧抽屉）
                    try { window.refreshVibeCard && window.refreshVibeCard(String(countryCode).toUpperCase()); } catch { /* ignore */ }
                    if (countryCode && typeof fetchCountrySummaryV3 === 'function') {
                        fetchCountrySummaryV3(countryCode).then((summary) => {
                            if (summary) showDrawersWithCountryData(countryCode, countryName || countryCode, summary);
                        }).catch(() => {});
                    } else if (countryCode) {
                        showDrawersWithCountryData(countryCode, countryName || countryCode);
                    }
                    console.log('[Calibration] ✅ 校准已确认并持久化（已锁定）:', { countryCode, countryName, lng, lat });
                }
            } catch (err) {
                console.warn('[Calibration] ⚠️ 校准请求失败:', err);
            }
        }

        /**
         * 拉取某国家的 10 项核心指标（get_country_summary_v3），用于校准后右侧抽屉渲染
         * @param {string} countryCode - 2 位国家代码（如 CN、US）
         * @returns {Promise<Object|null>} 与 lastData 结构兼容的摘要对象
         */
        async function fetchCountrySummaryV3(countryCode) {
            if (!countryCode || String(countryCode).trim().length !== 2) return null;
            const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
            const base = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
            const url = base ? `${base}/api/country-summary?country=${encodeURIComponent(String(countryCode).toUpperCase())}` : `/api/country-summary?country=${encodeURIComponent(String(countryCode).toUpperCase())}`;
            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                const payload = await res.json();
                // 保持旧语义：明确失败时不刷新抽屉（避免把有效的全局数据覆盖成 N/A）
                if (payload && typeof payload === 'object' && 'success' in payload && payload.success !== true) {
                    return null;
                }
                // 兼容后端多种包装格式：{success, data/result/summary/...}
                // 目标：返回与 window.lastData 兼容的“扁平结构”，供右侧抽屉直接渲染
                const raw =
                    payload?.data ??
                    payload?.result ??
                    payload?.summary ??
                    payload?.payload ??
                    payload;

                // 某些接口会返回 { success: true, ...fields }（字段直接在根上）
                // 这种情况下 raw 可能仍带 success 标记，但 normalizeData 对此是安全的
                const normalized = typeof normalizeData === 'function' ? normalizeData(raw) : raw;
                // 附带国家码，方便调试/下游使用（不影响渲染）
                if (normalized && typeof normalized === 'object') {
                    normalized.countryCode = String(countryCode).toUpperCase();
                }
                return normalized && typeof normalized === 'object' ? normalized : null;
            } catch (e) {
                console.warn('[CountrySummary] 拉取失败:', e);
                return null;
            }
        }

        /** 国家代码转国旗 Emoji（如 CN -> 🇨🇳） */
        function countryCodeToFlagEmoji(code) {
            if (!code || typeof code !== 'string') return '';
            const s = code.toUpperCase().trim();
            if (s.length !== 2) return '';
            const a = s.charCodeAt(0), b = s.charCodeAt(1);
            if (a < 65 || a > 90 || b < 65 || b > 90) return '';
            return String.fromCodePoint(0x1F1E6 + a - 65, 0x1F1E6 + b - 65);
        }

        /**
         * 更新左侧抽屉中的用户国家/地区展示：国旗 Emoji + 文案（自动识别 / 用户校准）
         * 利用 v_unified_analysis_v2 的 country_code，用 JS 转为国旗 Emoji
         */
        function updateUserCountryFlag(countryCode, countryName, isManual) {
            const el = document.getElementById('user-country-flag');
            if (!el) return;
            const code = (countryCode || '').toUpperCase();
            const flagEmoji = countryCodeToFlagEmoji(code);
            const desc = isManual ? (currentLang === 'zh' ? '用户校准' : 'User calibrated') : (currentLang === 'zh' ? '自动识别' : 'Auto detected');
            if (flagEmoji) {
                el.innerHTML = `<span class="text-lg" aria-hidden="true">${flagEmoji}</span> <span class="text-[10px] text-zinc-400">${desc}</span>`;
            } else {
                el.innerHTML = `<span class="text-[10px] text-zinc-400">${countryName || code || ''} · ${desc}</span>`;
            }
        }

        /**
         * 地图脉冲特效：在地图上动态添加涟漪特效点（支持动态颜色和头像）
         * 当 label 为 'YOU' 时，改为更新持久「Current Location」光标，不自动移除
         */
        function triggerMapPulse(lng, lat, label = '', color = '#00ff41', avatarUrl = null, username = null) {
            if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) {
                console.warn('[MapPulse] ⚠️ 地图实例未初始化，跳过脉冲特效');
                return;
            }
            if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) {
                console.warn('[MapPulse] ⚠️ 经纬度数据格式无效，跳过脉冲特效');
                return;
            }
            if (!color || typeof color !== 'string') color = '#00ff41';

            // 当前用户位置：使用持久「Current Location」系列，不 5 秒移除
            if (label === 'YOU' || label === '用户') {
                // 【新增】如果光标已被锁定，检查是否允许更新
                if (window.__cursorLocked) {
                    const lockedLat = localStorage.getItem('manual_lat');
                    const lockedLng = localStorage.getItem('manual_lng');
                    if (lockedLat && lockedLng && !isNaN(Number(lockedLat)) && !isNaN(Number(lockedLng))) {
                        const lockedLatNum = Number(lockedLat);
                        const lockedLngNum = Number(lockedLng);
                        // 允许小的浮点误差（0.0001 度约等于 11 米）
                        if (Math.abs(lat - lockedLatNum) > 0.0001 || Math.abs(lng - lockedLngNum) > 0.0001) {
                            console.warn('[MapPulse] 🔒 光标已锁定，拒绝位置更新:', {
                                requested: { lat, lng },
                                locked: { lat: lockedLatNum, lng: lockedLngNum }
                            });
                            return;
                        }
                    }
                }

                setOrUpdateCurrentLocationCursor(lng, lat, color, avatarUrl, username);
                console.log(`[MapPulse] ✅ 当前用户光标已更新: [${lng}, ${lat}] (颜色: ${color})`);
                return;
            }

            try {
                const currentOption = mapChart.getOption();
                if (!currentOption || !currentOption.series || !Array.isArray(currentOption.series)) return;

                const pulseSeries = {
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    data: [{ value: [lng, lat], name: label || '用户', avatarUrl: avatarUrl || null, username: username || null }],
                    symbolSize: 20,
                    showEffectOn: 'render',
                    rippleEffect: { brushType: 'stroke', scale: 5, period: 4, color: color },
                    itemStyle: { color: color, shadowBlur: 20, shadowColor: color },
                    label: { show: !!label, formatter: label || '', position: 'top', color: color, fontSize: 10, fontFamily: 'JetBrains Mono' },
                    avatarUrl: avatarUrl || null,
                    username: username || null,
                    zlevel: 10,
                    z: 10
                };
                const updatedSeries = [...currentOption.series, pulseSeries];
                mapChart.setOption({ series: updatedSeries }, { notMerge: false, lazyUpdate: false });
                console.log(`[MapPulse] ✅ 脉冲特效已添加: [${lng}, ${lat}] ${label || ''} (颜色: ${color})`);

                setTimeout(() => {
                    try {
                        if (!mapChart || (typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) return;
                        const currentOpt = mapChart.getOption();
                        if (!currentOpt || !currentOpt.series || !Array.isArray(currentOpt.series)) return;
                        const filteredSeries = currentOpt.series.filter((s) => {
                            if (s.type === 'effectScatter' && s.name !== 'Current Location' && s.data && s.data.length > 0) {
                                const point = s.data[0];
                                if (point && Array.isArray(point.value) && point.value.length >= 2) {
                                    if (Math.abs(point.value[0] - lng) < 0.0001 && Math.abs(point.value[1] - lat) < 0.0001) return false;
                                }
                            }
                            return true;
                        });
                        mapChart.setOption({ series: filteredSeries }, { notMerge: false, lazyUpdate: false });
                    } catch (err) { console.warn('[MapPulse] ⚠️ 移除脉冲特效时出错:', err); }
                }, 5000);
            } catch (error) {
                console.error('[MapPulse] ❌ 添加脉冲特效失败:', error);
            }
        }

        /**
         * 渲染雷达图到指定的 canvas
         * @param {HTMLCanvasElement} canvas - Canvas 元素
         * @param {Object} averages - 平均值数据
         */
        function renderRadarChartToCanvas(canvas, averages) {
            if (!canvas) {
                console.warn('[雷达图] ❌ Canvas 元素不存在');
                return;
            }
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn('[雷达图] ❌ 无法获取 Canvas 上下文');
                return;
            }
            
            const labels = currentLang === 'zh' ? ['语言', '模式', '深度', '效率', '频率'] : ['Lang', 'Pattern', 'Depth', 'Effi', 'Freq'];
            const targetData = [
                averages.L !== undefined && averages.L !== null ? Number(averages.L) : 0,
                averages.P !== undefined && averages.P !== null ? Number(averages.P) : 0,
                averages.D !== undefined && averages.D !== null ? Number(averages.D) : 0,
                averages.E !== undefined && averages.E !== null ? Number(averages.E) : 0,
                averages.F !== undefined && averages.F !== null ? Number(averages.F) : 0
            ];
            const zeroData = [0, 0, 0, 0, 0];

            const chart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: zeroData,
                        borderColor: '#00ff41',
                        backgroundColor: 'rgba(0, 255, 65, 0.1)',
                        borderWidth: 1,
                        pointRadius: 2
                    }]
                },
                options: {
                    animation: {
                        duration: 900,
                        easing: 'easeOutQuart',
                        animateScale: true,
                        animateRotate: true
                    },
                    scales: {
                        r: {
                            angleLines: { color: '#27272a' },
                            grid: { color: '#27272a' },
                            pointLabels: { color: '#71717a', font: { size: 9 } },
                            ticks: { display: false },
                            suggestedMin: 0,
                            suggestedMax: 100
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });

            // 触发一次 update，让雷达图从中心扩张到真实值
            try {
                chart.data.datasets[0].data = targetData;
                chart.update();
            } catch (e) {
                console.warn('[雷达图] ⚠️ update 动画触发失败:', e);
            }
            
            return chart;
        }

        function renderRadarChart(averages) {
            // 【ID 存在性检查】在执行前，必须检查 document.getElementById 是否非空
            const radarCanvas = document.getElementById('radarChart');
            if (!radarCanvas) {
                console.warn('[雷达图] ❌ DOM 元素不存在');
                return;
            }
            
            const ctx = radarCanvas.getContext('2d');
            if (!ctx) {
                console.warn('[雷达图] ❌ 无法获取 Canvas 上下文');
                return;
            }
            
            if (radarChart) radarChart.destroy();

            const labels = currentLang === 'zh' ? ['语言', '模式', '深度', '效率', '频率'] : ['Lang', 'Pattern', 'Depth', 'Effi', 'Freq'];
            // 【雷达图数据格式】更新 globalRadarChart 时，传入 [stats.L, stats.P, stats.D, stats.E, stats.F]
            // 彻底删除硬编码，如果接口有值则必须显示接口的值
            const targetData = [
                averages.L !== undefined && averages.L !== null ? Number(averages.L) : 0,
                averages.P !== undefined && averages.P !== null ? Number(averages.P) : 0,
                averages.D !== undefined && averages.D !== null ? Number(averages.D) : 0,
                averages.E !== undefined && averages.E !== null ? Number(averages.E) : 0,
                averages.F !== undefined && averages.F !== null ? Number(averages.F) : 0
            ];
            const zeroData = [0, 0, 0, 0, 0];

            radarChart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: zeroData,
                        borderColor: '#00ff41',
                        backgroundColor: 'rgba(0, 255, 65, 0.1)',
                        borderWidth: 1,
                        pointRadius: 2
                    }]
                },
                options: {
                    animation: {
                        duration: 900,
                        easing: 'easeOutQuart',
                        animateScale: true,
                        animateRotate: true
                    },
                    scales: {
                        r: {
                            angleLines: { color: '#27272a' },
                            grid: { color: '#27272a' },
                            pointLabels: { color: '#71717a', font: { size: 9 } },
                            ticks: { display: false },
                            suggestedMin: 0,
                            suggestedMax: 100
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });

            // 触发一次 update，让雷达图从中心扩张到真实值
            try {
                radarChart.data.datasets[0].data = targetData;
                radarChart.update();
            } catch (e) {
                console.warn('[雷达图] ⚠️ update 动画触发失败:', e);
            }
        }

        function renderLocationList(data) {
            const list = document.getElementById('locationList');
            if (!data || data.length === 0) return;
            
            list.innerHTML = data.slice(0, 5).map((item, i) => {
                const name = countryNameMap[item.name] ? countryNameMap[item.name][currentLang] : item.name;
                return `
                <div class="flex justify-between items-center text-[11px] border-b border-zinc-800 pb-2">
                    <span class="text-zinc-500 font-mono">0${i+1}</span>
                    <span class="font-bold uppercase tracking-tighter">${name}</span>
                    <span class="text-[var(--accent-terminal)] font-bold">${item.value}</span>
                </div>`;
            }).join('');

            // 修复：top-country 元素已移除，添加 null 检查
            const topCountryEl = document.getElementById('top-country');
            if (topCountryEl && data.length > 0) {
                const top = data[0];
                topCountryEl.innerText = countryNameMap[top.name] ? countryNameMap[top.name][currentLang] : top.name;
            }
        }

        /**
         * 判断用户名是否为有效GitHub用户名
         * @param {string} username - 用户名
         * @returns {boolean} 是否为有效用户名
         */
        function isValidGitHubUsername(username, userIdentity = null) {
            if (!username || typeof username !== 'string') {
                return false;
            }
            const trimmed = username.trim();
            if (trimmed === '') {
                return false;
            }
            
            // 【Task 3】优化用户名合法性校验：如果是 fingerprint 用户（匿名用户），跳过严格的 GitHub 格式校验
            if (userIdentity === 'fingerprint' || userIdentity === 'anonymous') {
                // 对于匿名用户，只做基本检查，允许中文等特殊字符
                console.log('[GitHub] ℹ️ 检测到 fingerprint 用户，跳过严格格式校验:', trimmed);
                // 只检查是否为无效的默认值
                if (INVALID_USERNAME_VALUES.includes(trimmed)) {
                    return false;
                }
                // 允许包含中文和其他字符
                return trimmed.length > 0;
            }
            
            // 检查是否为无效的默认值
            if (INVALID_USERNAME_VALUES.includes(trimmed)) {
                return false;
            }
            // 检查是否以 'Guest_' 开头（自动生成的访客用户名）
            if (trimmed.startsWith('Guest_')) {
                return false;
            }
            // 检查是否包含中文字符（GitHub用户名不支持中文）
            if (/[\u4e00-\u9fa5]/.test(trimmed)) {
                console.warn('[GitHub] ⚠️ GitHub用户名不能包含中文字符:', trimmed);
                return false;
            }
            // GitHub用户名只能包含字母、数字、连字符和下划线
            // 必须以字母或数字开头，长度在1-39之间
            const githubUsernamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9]|-(?![.-])){0,38}$/;
            if (!githubUsernamePattern.test(trimmed)) {
                console.warn('[GitHub] ⚠️ GitHub用户名格式无效:', trimmed);
                return false;
            }
            return true;
        }

        /**
         * 获取GitHub头像URL
         * @param {string} username - GitHub用户名
         * @returns {string|null} 头像URL，如果用户名无效则返回null
         */
        function getGitHubAvatarUrl(username) {
            // 如果用户名无效，返回null（不请求GitHub图片）
            if (!isValidGitHubUsername(username)) {
                return null;
            }
            // GitHub头像URL格式: https://github.com/[用户名].png
            return `https://github.com/${username.trim()}.png`;
        }

        /**
         * 创建头像HTML，包含onerror兜底逻辑
         * @param {string} avatarUrl - 头像URL
         * @param {string} username - GitHub用户名（用于identicon）
         * @param {number} size - 头像尺寸（像素）
         * @returns {string} 头像HTML字符串
         */
        function createAvatarHtml(avatarUrl, username, size = 32, userIdentity = null) {
            // 【修复】如果没有有效的头像URL，直接使用默认头像
            // 如果 username 为 null 或无效，也使用默认头像（不进行严格校验）
            if (!avatarUrl) {
                return `<img 
                    src="${DEFAULT_AVATAR}" 
                    alt="avatar" 
                    class="rounded-full" 
                    width="${size}" 
                    height="${size}" 
                    loading="lazy" 
                    style="object-fit: cover;"
                    onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                />`;
            }
            
            // 只有当 username 存在且需要校验时才进行校验
            // 如果 username 为 null，说明是匿名用户，直接使用提供的 avatarUrl
            if (username && !isValidGitHubUsername(username, userIdentity)) {
                // 用户名无效，使用默认头像
                return `<img 
                    src="${DEFAULT_AVATAR}" 
                    alt="avatar" 
                    class="rounded-full" 
                    width="${size}" 
                    height="${size}" 
                    loading="lazy" 
                    style="object-fit: cover;"
                    onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                />`;
            }

            // 如果有有效的头像URL，使用它，但onerror时回退到DEFAULT_AVATAR
            return `<img 
                src="${avatarUrl}" 
                alt="avatar" 
                class="rounded-full" 
                width="${size}" 
                height="${size}" 
                loading="lazy" 
                style="object-fit: cover;"
                onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
            />`;
        }

        function renderRecentActivity(victims) {
            const box = document.getElementById('recentActivity');
            if (!box) return;
            
            // 优先使用 latestRecords，如果没有则使用 recentVictims
            const records = victims || [];
            
            if (records.length === 0) {
                box.innerHTML = `<div class="text-zinc-500 text-center py-4">${escapeHtml(getI18nText('common.no_data') || (currentLang === 'en' ? 'No data' : '暂无数据'))}</div>`;
                return;
            }
            
            box.innerHTML = records.map((v, index) => {
                // 兼容两种数据格式：latestRecords 和 recentVictims
                const time = v.time || v.created_at || new Date().toISOString();
                const type = v.type || v.personality_type || 'UNKNOWN';
                const location = v.location || v.ip_location || (currentLang === 'en' ? 'Unknown' : '未知');
                const name = v.name || (currentLang === 'en' ? `Record ${index + 1}` : `记录${index + 1}`);
                
                // 获取头像信息
                const avatarUrl = v.avatar_url || null;
                const githubUsername = v.github_username || null;
                
                // 判断逻辑：如果 github_username 为空、或者是默认值，则不要请求 GitHub 图片
                // 【Task 3】传入 user_identity，对 fingerprint 用户跳过严格校验
                const recordUserIdentity = v.user_identity || null;
                let finalAvatarUrl = avatarUrl;
                if (!finalAvatarUrl && githubUsername) {
                    if (isValidGitHubUsername(githubUsername, recordUserIdentity)) {
                        // 只有有效的GitHub用户名才生成头像URL
                        finalAvatarUrl = getGitHubAvatarUrl(githubUsername);
                    } else {
                        // 无效用户名时，使用默认头像
                        finalAvatarUrl = DEFAULT_AVATAR;
                    }
                }
                // 如果还是没有有效的头像URL，使用默认头像
                if (!finalAvatarUrl) {
                    finalAvatarUrl = DEFAULT_AVATAR;
                }
                
                // 【修复】finalUsername 应该使用 githubUsername（如果有效），否则使用 name
                // 但传给 createAvatarHtml 时，应该只传有效的 GitHub 用户名或 null
                // 因为 createAvatarHtml 会校验用户名，而 name 可能是"记录1"这样的值
                const finalUsername = githubUsername || name;
                const usernameForAvatar = githubUsername && isValidGitHubUsername(githubUsername, recordUserIdentity) 
                    ? githubUsername 
                    : null;
                
                // 生成头像HTML（只传有效的 GitHub 用户名，避免校验警告）
                // 【修复】传入 user_identity 参数，对 fingerprint 用户跳过严格校验
                const avatarHtml = createAvatarHtml(finalAvatarUrl, usernameForAvatar, 32, recordUserIdentity);
                
                return `
                <div class="border-l-2 border-zinc-800 pl-3 py-1 flex items-start gap-2">
                    <div class="flex-shrink-0 mt-0.5">
                        ${avatarHtml}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-zinc-500">${new Date(time).toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'zh-CN')}</div>
                        <div class="text-white">${name.length > 6 ? name.slice(0,6) + '...' : name}</div>
                        <div class="text-[var(--accent-terminal)]">${type} @ ${location}</div>
                    </div>
                </div>
            `;
            }).join('');
        }


        /**
         * 更新专家卡片 UI
         * @param {string} dim - 维度标识 (L, P, D, E, F)
         * @param {Object|null} expert - 专家数据对象
         * @param {boolean} isNoDataArea - 是否为无人区状态（true 时显示"待招募"）
         */
        function updateExpertCard(dim, expert, isNoDataArea = false) {
            // 防御性编程：所有 DOM 操作前先检查元素是否存在
            const card = document.getElementById(`card-${dim}`);
            if (!card) {
                console.warn(`[LPDEF] ⚠️ 卡片 card-${dim} 不存在`);
                return;
            }
            
            const avatarEl = document.getElementById(`expert-avatar-${dim}`);
            const nameEl = document.getElementById(`expert-name-${dim}`);
            const titleEl = document.getElementById(`expert-title-${dim}`);
            const scoreEl = document.getElementById(`expert-score-${dim}`);
            const labelEl = document.getElementById(`expert-label-${dim}`);
            const descEl = document.getElementById(`expert-desc-${dim}`);

            if (expert) {
                // 更新头像
                if (avatarEl) {
                    let avatarUrl = DEFAULT_AVATAR;
                    
                    // 优先级 1: 如果有 GitHub ID，使用 GitHub 头像
                    // 【Task 3】传入 user_identity，对 fingerprint 用户跳过严格校验
                    const expertUserIdentity = expert.user?.user_identity || null;
                    if (expert.githubUsername && isValidGitHubUsername(expert.githubUsername, expertUserIdentity)) {
                        avatarUrl = getGitHubAvatarUrl(expert.githubUsername);
                    } else if (expert.user?.github_username && isValidGitHubUsername(expert.user.github_username, expertUserIdentity)) {
                        // 降级：从 user 对象中获取
                        avatarUrl = getGitHubAvatarUrl(expert.user.github_username);
                    }
                    // 优先级 2: 如果有 fingerprint，使用基于指纹的唯一头像
                    else if (expert.fingerprint) {
                        avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(expert.fingerprint)}`;
                    }
                    // 否则使用默认头像
                    
                    avatarEl.innerHTML = `<img 
                        src="${avatarUrl}" 
                        alt="${expert.username || 'Expert'}"
                        class="w-full h-full object-cover rounded-full"
                        onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                    />`;
                }

                // 更新用户名
                if (nameEl) {
                    nameEl.textContent = expert.username || 'Unknown';
                }

                // 更新称号（左上角）- 使用维度专属称号（中英切换）
                if (labelEl) {
                    labelEl.textContent = getLpdefTitle(dim) || labelEl.textContent || '';
                }
                
                // 更新说明（分数下方）- 使用维度专属说明（中英切换）
                if (descEl) {
                    descEl.textContent = getLpdefDescription(dim) || descEl.textContent || '';
                }
                
                // 更新 personality_type（保留原有逻辑，但不在主要位置显示）
                if (titleEl) {
                    titleEl.textContent = expert.personalityType || 'UNKNOWN';
                }

                // 更新分数（使用提取到的 score）
                if (scoreEl) {
                    scoreEl.textContent = Math.round(expert.score || 0);
                }
                
                // 恢复点击事件（如果有专家数据）
                if (card) {
                    card.onclick = () => openExpertGitHub(dim);
                    card.style.cursor = 'pointer';
                }
            } else {
                // 无数据时的显示（包括无人区状态）
                // 保持称号和说明（维度专属，中英切换）
                if (labelEl) {
                    labelEl.textContent = getLpdefTitle(dim) || labelEl.textContent || '';
                }
                
                if (descEl) {
                    descEl.textContent = getLpdefDescription(dim) || descEl.textContent || '';
                }
                
                if (avatarEl) {
                    // 无人区状态：使用默认头像
                    avatarEl.innerHTML = `<img 
                        src="${DEFAULT_AVATAR}" 
                        alt="待招募"
                        class="w-full h-full object-cover rounded-full opacity-50"
                    />`;
                }
                
                if (nameEl) {
                    nameEl.textContent = isNoDataArea
                        ? (getI18nText('common.recruiting') || 'Recruiting')
                        : (getI18nText('common.no_data') || 'No data');
                }
                
                if (titleEl) {
                    titleEl.textContent = isNoDataArea
                        ? (getI18nText('common.waiting') || 'Waiting')
                        : '...';
                }
                
                if (scoreEl) {
                    scoreEl.textContent = '0';
                }
                
                // 无人区状态：取消点击跳转事件
                if (card) {
                    card.onclick = null;
                    card.style.cursor = 'default';
                }
            }
        }

        /**
         * 打开专家的 GitHub 主页
         * @param {string} dim - 维度标识 (L, P, D, E, F)
         */
        function openExpertGitHub(dim) {
            const expert = lpdefExperts[dim];
            if (expert && expert.githubUsername && isValidGitHubUsername(expert.githubUsername)) {
                window.open(`https://github.com/${expert.githubUsername}`, '_blank');
            } else if (expert && expert.user && expert.user.github_username && isValidGitHubUsername(expert.user.github_username)) {
                window.open(`https://github.com/${expert.user.github_username}`, '_blank');
            } else {
                console.warn(`[LPDEF] ⚠️ 维度 ${dim} 的专家没有有效的 GitHub 用户名`);
            }
        }

        /**
         * 渲染人格分布排行
         * @param {Array} distribution - 人格分布数据 [{type: string, count: number}]
         */
        function renderPersonalityDistribution(distribution) {
            const list = document.getElementById('personalityDistribution');
            if (!list) return;
            
            if (!distribution || !Array.isArray(distribution) || distribution.length === 0) {
                list.innerHTML = '<div class="text-center text-zinc-500 py-4 text-[10px]">暂无数据</div>';
                return;
            }
            
            list.innerHTML = distribution.map((item, i) => {
                const type = item.type || 'UNKNOWN';
                const count = Number(item.count) || 0;
                return `
                <div class="flex justify-between items-center text-[11px] border-b border-zinc-800 pb-2">
                    <span class="text-zinc-500 font-mono">0${i+1}</span>
                    <span class="font-bold uppercase tracking-tighter">${type}</span>
                    <span class="text-[var(--accent-terminal)] font-bold">${count}</span>
                </div>`;
            }).join('');
        }

        /**
         * 【适配层重写】强制映射层：从多个可能的字段路径提取数据
         * @param {Object} result - API 返回的原始数据
         * @returns {Object} 标准化后的数据对象
         */
        function normalizeData(result) {
            // 兼容：某些接口把真实数据包在 {success, data/result/...} 中
            const unwrap = (v) => {
                if (!v || typeof v !== 'object') return v;
                // 仅在出现 success 标记时尝试解包，避免误把普通 data 字段当成包裹层
                if ('success' in v) {
                    return v.data ?? v.result ?? v.summary ?? v.payload ?? v;
                }
                return v;
            };
            const data = unwrap(result) || {};
            
            // 【核心指标提取】从 json.totalAnalysis 提取总扫描数，从 json.totalUsers 提取总人数
            let totalAnalysis =
                data.totalAnalysis ??
                data.total_analysis ??
                data.data?.totalAnalysis ??
                data.data?.total_analysis ??
                undefined;
            if (totalAnalysis === undefined || totalAnalysis === null) {
                const recentVictims = data.recentVictims || data.latestRecords || data.latest_records || [];
                if (Array.isArray(recentVictims)) totalAnalysis = recentVictims.length;
            }
            const totalAnalysisNum = Number(totalAnalysis);
            totalAnalysis = Number.isFinite(totalAnalysisNum) ? totalAnalysisNum : undefined;
            
            // 【总人数提取】从 json.totalUsers 提取
            const totalUsersRaw =
                data.totalUsers ??
                data.total_users ??
                data.data?.totalUsers ??
                data.data?.total_users ??
                data.us_stats?.totalUsers ??
                data.us_stats?.total_users ??
                undefined;
            const totalUsersNum = Number(totalUsersRaw);
            const totalUsers = Number.isFinite(totalUsersNum) ? totalUsersNum : undefined;
            
            // 【累计吐槽字数修复】不要读取 json.totalRoastWords（它是 0），请尝试从 json.totalChars 或 json.latestRecords[0].total_chars 获取数据
            let totalRoastWords =
                data.totalChars ??
                data.total_chars ??
                data.totalCharsSum ??
                data.total_chars_sum ??
                data.totalCharsTotal ??
                data.total_chars_total ??
                undefined;
            if (totalRoastWords === undefined || totalRoastWords === null || totalRoastWords === 0) {
                // 尝试从 latestRecords 中获取
                const latestRecords =
                    data.latestRecords ||
                    data.latest_records ||
                    data.recentVictims ||
                    data.recent_victims ||
                    [];
                if (Array.isArray(latestRecords) && latestRecords.length > 0) {
                    const first = latestRecords[0] || {};
                    if (first.total_chars !== undefined && first.total_chars !== null) {
                        totalRoastWords = first.total_chars;
                    } else if (first.totalChars !== undefined && first.totalChars !== null) {
                        totalRoastWords = first.totalChars;
                    }
                }
            }
            // 最后兜底：如果还是 0 或未定义，尝试其他路径
            if (totalRoastWords === undefined || totalRoastWords === null || totalRoastWords === 0) {
                totalRoastWords =
                    data.totalRoastWords ??
                    data.total_roast_words ??
                    data.data?.totalRoastWords ??
                    data.data?.total_roast_words ??
                    undefined;
            }
            
            // 【累计吐槽字数修复】绑定到 json.totalChars
            const totalCharsRaw =
                data.totalChars ??
                data.total_chars ??
                data.totalCharsSum ??
                data.total_chars_sum ??
                totalRoastWords;
            const totalCharsNum = Number(totalCharsRaw);
            const totalChars = Number.isFinite(totalCharsNum) ? totalCharsNum : undefined;
            
            // 【强制映射层】avgPerUser 和 avgPerScan：依次尝试 result.avgPerUser/avgPerScan, result.data.avgPerUser/avgPerScan
            let avgPerUser =
                data.avgPerUser ??
                data.avg_per_user ??
                data.data?.avgPerUser ??
                data.data?.avg_per_user ??
                undefined;
            // 兼容旧字段名
            if (avgPerUser === undefined || avgPerUser === null) {
                avgPerUser = data.avgChars ?? data.avg_chars ?? undefined;
            }
            // 如果 avgPerUser 为 0 或无效，且 totalChars 和 totalUsers 都存在，则计算：totalChars / totalUsers
            const avgPerUserNum = Number(avgPerUser);
            if ((!Number.isFinite(avgPerUserNum) || avgPerUserNum === 0) && totalChars !== undefined && totalUsers !== undefined && totalUsers > 0) {
                avgPerUser = totalChars / totalUsers;
            } else {
                avgPerUser = Number.isFinite(avgPerUserNum) ? avgPerUserNum : undefined;
            }
            
            let avgPerScan =
                data.avgPerScan ??
                data.avg_per_scan ??
                data.data?.avgPerScan ??
                data.data?.avg_per_scan ??
                undefined;
            // 如果 avgPerScan 为 0 或无效，且 totalChars 和 totalAnalysis 都存在，则计算：totalChars / totalAnalysis
            const avgPerScanNum = Number(avgPerScan);
            if ((!Number.isFinite(avgPerScanNum) || avgPerScanNum === 0) && totalChars !== undefined && totalAnalysis !== undefined && totalAnalysis !== null && totalAnalysis > 0) {
                avgPerScan = totalChars / totalAnalysis;
            } else {
                avgPerScan = Number.isFinite(avgPerScanNum) ? avgPerScanNum : undefined;
            }
            
            // 【五维平均分提取】必须从 json.averages 或 json.globalAverage 对象中提取（例如：json.averages.L）
            // 彻底删除硬编码，如果接口有值则必须显示接口的值
            let averages = data.averages || data.globalAverage || data.global_average;
            if (!averages || typeof averages !== 'object') {
                // 兼容：有些接口返回 avg_l/avg_p/... 而不是对象
                const avgL = data.avg_l ?? data.avgL ?? data.data?.avg_l ?? data.data?.avgL ?? undefined;
                const avgP = data.avg_p ?? data.avgP ?? data.data?.avg_p ?? data.data?.avgP ?? undefined;
                const avgD = data.avg_d ?? data.avgD ?? data.data?.avg_d ?? data.data?.avgD ?? undefined;
                const avgE = data.avg_e ?? data.avgE ?? data.data?.avg_e ?? data.data?.avgE ?? undefined;
                const avgF = data.avg_f ?? data.avgF ?? data.data?.avg_f ?? data.data?.avgF ?? undefined;
                const hasAny = [avgL, avgP, avgD, avgE, avgF].some((v) => v !== undefined && v !== null && v !== '');
                averages = hasAny ? { L: avgL, P: avgP, D: avgD, E: avgE, F: avgF } : {};
            }
            // 确保所有维度都有值，但不使用硬编码默认值
            averages = {
                L: averages.L !== undefined && averages.L !== null ? Number(averages.L) : undefined,
                P: averages.P !== undefined && averages.P !== null ? Number(averages.P) : undefined,
                D: averages.D !== undefined && averages.D !== null ? Number(averages.D) : undefined,
                E: averages.E !== undefined && averages.E !== null ? Number(averages.E) : undefined,
                F: averages.F !== undefined && averages.F !== null ? Number(averages.F) : undefined
            };
            
            // 为了兼容性，同时设置 globalAverage
            const globalAverage = averages;
            
            // 【上岗天数修复】从 json.systemDays 或 json.latestRecords[0].work_days 提取，不硬编码
            let systemDays = data.systemDays;
            if (systemDays === undefined || systemDays === null) {
                const latestRecords =
                    data.latestRecords ||
                    data.latest_records ||
                    data.recentVictims ||
                    data.recent_victims ||
                    [];
                if (Array.isArray(latestRecords) && latestRecords.length > 0) {
                    const first = latestRecords[0] || {};
                    if (first.work_days !== undefined && first.work_days !== null) systemDays = first.work_days;
                    else if (first.workDays !== undefined && first.workDays !== null) systemDays = first.workDays;
                }
            }
            
            return {
                totalUsers: totalUsers !== undefined && totalUsers !== null ? totalUsers : undefined,
                totalAnalysis: totalAnalysis !== undefined && totalAnalysis !== null ? totalAnalysis : undefined,
                totalRoastWords: totalRoastWords !== undefined && totalRoastWords !== null ? totalRoastWords : undefined,
                totalChars: totalChars,
                avgPerUser: avgPerUser !== undefined && avgPerUser !== null ? avgPerUser : undefined,
                avgPerScan: avgPerScan !== undefined && avgPerScan !== null ? avgPerScan : undefined,
                cityCount: data.cityCount !== undefined && data.cityCount !== null ? data.cityCount : undefined,
                systemDays: systemDays !== undefined && systemDays !== null ? systemDays : undefined,
                personalityRank:
                    data.personalityRank ||
                    data.personality_rank ||
                    data.personalityDistribution ||
                    data.personality_distribution ||
                    [],
                personalityDistribution:
                    data.personalityDistribution ||
                    data.personality_distribution ||
                    data.personalityRank ||
                    data.personality_rank ||
                    [],
                globalAverage: globalAverage,
                averages: averages,
                locationRank: data.locationRank || data.location_rank || [],
                recentVictims:
                    data.recentVictims ||
                    data.recent_victims ||
                    data.latestRecords ||
                    data.latest_records ||
                    [],
                latestRecords:
                    data.latestRecords ||
                    data.latest_records ||
                    data.recentVictims ||
                    data.recent_victims ||
                    [],
                // 【新增】保存各维度的最高记录（用于"全球最强模式"）
                topRecords: data.topRecords || {},
            };
        }

        /**
         * 【动画容错】安全的动画函数，防止 NaN 或 undefined 导致崩溃
         * @param {HTMLElement} element - 目标元素
         * @param {number} start - 起始值
         * @param {number} end - 结束值
         * @param {number} duration - 动画持续时间
         * @param {boolean} useFormat - 是否使用格式化
         */
        function safeAnimateValue(element, start, end, duration = 1500, useFormat = true) {
            if (!element) {
                console.warn('[动画] ❌ DOM 元素不存在');
                return;
            }
            
            // 【动画容错】在调用 animateValue 之前，添加 if (isNaN(value)) value = 0; 的判断
            if (isNaN(start)) start = 0;
            if (isNaN(end)) end = 0;
            
            start = Number(start) || 0;
            end = Number(end) || 0;
            
            animateValue(element, start, end, duration, useFormat);
        }

        /**
         * 【人格排行渲染函数】独立的 renderPersonalityRank 函数，包含前端自计算降级逻辑
         * @param {Array} rankData - 人格排行数据 [{type, count, percentage}]
         * @param {Array} recentVictims - 最近受害者数据（用于降级计算）
         */
        function renderPersonalityRank(rankData, recentVictims = []) {
            const personalityEl = document.getElementById('personalityDistribution');
            if (!personalityEl) {
                console.warn('[人格排行] ❌ DOM 元素不存在');
                return;
            }
            
            // 如果后端 personalityRank 存在且不为空，直接渲染
            if (rankData && Array.isArray(rankData) && rankData.length > 0) {
                personalityEl.innerHTML = rankData.map((item, i) => {
                    const type = item.type || '未知';
                    const count = Number(item.count || 0);
                    const percentage = Number(item.percentage || 0);
                    return `
                        <div class="mb-3">
                            <div class="flex justify-between text-[10px] mb-1 uppercase tracking-widest">
                                <span class="text-zinc-400">${i+1}. ${type}</span>
                                <span class="text-[var(--accent-terminal)]">${count} Hits</span>
                            </div>
                            <div class="w-full bg-zinc-800/50 h-1">
                                <div class="bg-[var(--accent-terminal)] h-full shadow-[0_0_8px_rgba(0,255,65,0.4)]" 
                                     style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('');
                console.log(`[人格排行] ✅ 渲染成功 (${rankData.length} 条)`);
                return;
            }
            
            // 【前端自计算降级逻辑】若后端 personalityRank 为空，则根据 recentVictims 实时计算占比并渲染进度条
            if (recentVictims && recentVictims.length > 0) {
                console.log('[人格排行] ⚠️ personalityRank 为空，使用 recentVictims 降级方案');
                const typeMap = new Map();
                recentVictims.forEach((v) => {
                    const type = v.type || v.personality_type || 'UNKNOWN';
                    typeMap.set(type, (typeMap.get(type) || 0) + 1);
                });
                
                const total = recentVictims.length;
                const personalityRank = Array.from(typeMap.entries())
                    .map(([type, count]) => ({
                        type: type,
                        count: Number(count) || 0,
                        percentage: Math.round((Number(count) / total) * 100) || 0,
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);
                
                personalityEl.innerHTML = personalityRank.map((item, i) => {
                    const type = item.type || '未知';
                    const count = Number(item.count || 0);
                    const percentage = Number(item.percentage || 0);
                    return `
                        <div class="mb-3">
                            <div class="flex justify-between text-[10px] mb-1 uppercase tracking-widest">
                                <span class="text-zinc-400">${i+1}. ${type}</span>
                                <span class="text-[var(--accent-terminal)]">${count} Hits</span>
                            </div>
                            <div class="w-full bg-zinc-800/50 h-1">
                                <div class="bg-[var(--accent-terminal)] h-full shadow-[0_0_8px_rgba(0,255,65,0.4)]" 
                                     style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('');
                console.log(`[人格排行] ✅ 降级方案渲染成功 (${personalityRank.length} 条)`);
                return;
            }
            
            // 如果都没有数据，显示空状态
            personalityEl.innerHTML = '<div class="text-center text-zinc-500 py-4 text-[10px]">暂无数据</div>';
            console.warn('[人格排行] ❌ 无可用数据');
        }

        /**
         * 启动 Supabase Realtime 监听
         * 监听 user_analysis 表的 INSERT 事件
         */
        function startRealtimeListener() {
            // 健壮性检查：确保 Supabase 客户端已初始化
            if (!supabaseClient) {
                console.warn('[Realtime] ⚠️ Supabase 客户端未初始化，跳过 Realtime 监听');
                return;
            }

            // 如果已有监听通道，先取消订阅
            if (realtimeChannel) {
                try {
                    supabaseClient.removeChannel(realtimeChannel);
                    console.log('[Realtime] ✅ 已取消旧的监听通道');
                } catch (error) {
                    console.warn('[Realtime] ⚠️ 取消旧通道时出错:', error);
                }
            }

            try {
                // 创建新的监听通道
                realtimeChannel = supabaseClient
                    .channel('user_analysis_changes')
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'user_analysis'
                        },
                        (payload) => {
                            console.log('[Realtime] 📨 收到新数据:', payload);
                            
                            // 健壮性检查：确保 payload 和 payload.new 存在
                            if (!payload || !payload.new) {
                                console.warn('[Realtime] ⚠️ 数据格式不完整，跳过处理');
                                return;
                            }

                            const newRecord = payload.new;
                            
                            // 局部更新：将新数据插入到 latestRecords 最前面
                            if (!Array.isArray(latestRecords)) {
                                latestRecords = [];
                            }
                            
                            latestRecords.unshift(newRecord);
                            
                            // 长度控制：保持数组长度不超过 10
                            if (latestRecords.length > 10) {
                                latestRecords = latestRecords.slice(0, 10);
                            }

                            // 同步更新 window.allData（用于 LPDEF 专家筛选）
                            if (!window.allData) {
                                window.allData = [];
                            }
                            // 检查是否已存在（避免重复）
                            const exists = window.allData.some(item => 
                                (item.id && newRecord.id && item.id === newRecord.id) ||
                                (item.name === newRecord.name && item.created_at === newRecord.created_at)
                            );
                            if (!exists) {
                                window.allData.unshift(newRecord);
                                // 限制 allData 长度（保留最近 1000 条，避免内存过大）
                                if (window.allData.length > 1000) {
                                    window.allData = window.allData.slice(0, 1000);
                                }
                            }
                            
                            console.log(`[Realtime] ✅ 已更新 latestRecords (当前长度: ${latestRecords.length})，window.allData (当前长度: ${window.allData.length})`);

                            // 重新渲染右侧卡片列表
                            try {
                                renderRecentActivity(latestRecords);
                                console.log('[Realtime] ✅ 已刷新实时诊断活动列表');
                            } catch (error) {
                                console.error('[Realtime] ❌ 渲染活动列表失败:', error);
                            }
                            
                            // Realtime 更新后不再需要重新渲染 LPDEF 卡片（已废弃）

                            // 地图联动特效：如果新数据包含地理位置信息，触发地图脉冲
                            try {
                                // 尝试从新数据中提取经纬度信息
                                // 根据实际数据字段调整（可能是 lng/lat, longitude/latitude, location 等）
                                let lng = null;
                                let lat = null;
                                let vibeName = '';

                                // 方式1：直接字段（优先检查经纬度字段）
                                if (newRecord.lng !== undefined && newRecord.lat !== undefined) {
                                    lng = Number(newRecord.lng);
                                    lat = Number(newRecord.lat);
                                } else if (newRecord.longitude !== undefined && newRecord.latitude !== undefined) {
                                    lng = Number(newRecord.longitude);
                                    lat = Number(newRecord.latitude);
                                }
                                // 方式2：从 location 或 ip_location 字段解析（如果包含坐标）
                                else {
                                    const locationSource = newRecord.location || newRecord.ip_location;
                                    if (locationSource) {
                                        // 尝试解析 "lng,lat" 格式的坐标字符串
                                        const locationStr = String(locationSource);
                                        const coords = locationStr.split(',');
                                        if (coords.length >= 2) {
                                            const parsedLng = Number(coords[0].trim());
                                            const parsedLat = Number(coords[1].trim());
                                            if (!isNaN(parsedLng) && !isNaN(parsedLat)) {
                                                lng = parsedLng;
                                                lat = parsedLat;
                                            }
                                        }
                                    }
                                }

                                // 提取名称（可能是 name, vibe_name, personality_type 等）
                                const baseName = newRecord.name || newRecord.vibe_name || newRecord.personality_type || '';

                                // VPN 穿透检测判定逻辑（已移除VPN关键字显示）
                                // =========================
                                let pulseColor = '#ffffff'; // 默认白色（正常用户）
                                let pulseLabel = baseName ? `${baseName}` : '用户';

                                // 获取判定所需字段
                                const ipLocation = String(newRecord.ip_location || '').toUpperCase().trim();
                                const timezone = String(newRecord.timezone || '').trim();

                                // 判定条件：如果 ip_location 不属于 'CN'，但 timezone 是 'Asia/Shanghai'，则使用特殊颜色
                                const isNotChina = ipLocation !== 'CN' && ipLocation !== '';
                                const isShanghaiTimezone = timezone === 'Asia/Shanghai';

                                if (isNotChina && isShanghaiTimezone) {
                                    // 特殊用户：海外 IP + 上海时区
                                    pulseColor = '#00ff41'; // 终端绿
                                    pulseLabel = baseName ? `${baseName}` : '用户';
                                    console.log('[Realtime] 🔍 用户判定: 检测到特殊用户', {
                                        ipLocation,
                                        timezone,
                                        reason: '海外IP但时区为Asia/Shanghai'
                                    });
                                } else {
                                    // 正常用户：直接连接
                                    pulseColor = '#ffffff'; // 正常用户：纯白色
                                    pulseLabel = baseName ? `${baseName}` : '用户';
                                    console.log('[Realtime] 🔍 用户判定: 正常用户', {
                                        ipLocation,
                                        timezone,
                                        reason: isNotChina ? '时区不匹配' : 'IP位置正常'
                                    });
                                }

                                // 如果成功提取到经纬度，触发地图脉冲（使用判定后的颜色和标签）
                                if (lng !== null && lat !== null && !isNaN(lng) && !isNaN(lat)) {
                                    // 提取头像信息
                                    let avatarUrl = newRecord.avatar_url || null;
                                    const githubUsername = newRecord.github_username || newRecord.github_id || null;
                                    const userName = newRecord.name || newRecord.vibe_name || newRecord.personality_type || '';
                                    
                                    // 判断逻辑：如果 github_username 为空、或者是默认值，则不要请求 GitHub 图片
                                    // 【Task 3】传入 user_identity，对 fingerprint 用户跳过严格校验
                                    const recordUserIdentity = newRecord.user_identity || null;
                                    if (!avatarUrl && githubUsername) {
                                        if (isValidGitHubUsername(githubUsername, recordUserIdentity)) {
                                            // 只有有效的GitHub用户名才生成头像URL
                                            avatarUrl = getGitHubAvatarUrl(githubUsername);
                                        } else {
                                            // 无效用户名时，使用默认头像
                                            avatarUrl = DEFAULT_AVATAR;
                                        }
                                    }
                                    // 如果还是没有有效的头像URL，使用默认头像
                                    if (!avatarUrl) {
                                        avatarUrl = DEFAULT_AVATAR;
                                    }
                                    
                                    // 获取用户状态颜色（如果存在），否则使用默认颜色
                                    const statusColor = newRecord.status_color || pulseColor;
                                    
                                    triggerMapPulse(lng, lat, pulseLabel, statusColor, avatarUrl, githubUsername || userName);
                                    console.log(`[Realtime] ✅ 已触发地图脉冲: [${lng}, ${lat}] ${pulseLabel} (颜色: ${statusColor}, 头像: ${avatarUrl}, 用户名: ${githubUsername || userName})`);
                                } else {
                                    console.log('[Realtime] ℹ️ 新数据未包含有效的地理位置信息，跳过地图脉冲');
                                }
                            } catch (error) {
                                console.warn('[Realtime] ⚠️ 处理地图联动特效时出错:', error);
                            }
                        }
                    )
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'user_analysis'
                        },
                        (payload) => {
                            console.log('[Realtime] 🔄 收到数据更新:', payload);
                            
                            // 健壮性检查：确保 payload 和 payload.new 存在
                            if (!payload || !payload.new) {
                                console.warn('[Realtime] ⚠️ 更新数据格式不完整，跳过处理');
                                return;
                            }

                            const updatedRecord = payload.new;
                            
                            // 同步更新 window.allData（用于身份匹配和排名卡片）
                            if (!window.allData) {
                                window.allData = [];
                            }

                            // 【修复】用“规范化匹配 + upsert”替代简单 push/unshift，避免重复累加
                            const normalizeFp = (fp) => {
                                if (!fp) return '';
                                return String(fp).trim().toLowerCase();
                            };
                            const recordId = (updatedRecord.id != null) ? String(updatedRecord.id) : '';
                            const recordFp = normalizeFp(updatedRecord.fingerprint || updatedRecord.user_fingerprint);
                            const recordIdentity = normalizeFp(updatedRecord.user_identity);

                            const index = window.allData.findIndex((item) => {
                                if (!item) return false;
                                const itemId = (item.id != null) ? String(item.id) : '';
                                if (recordId && itemId && itemId === recordId) return true;
                                const itemFp = normalizeFp(item.fingerprint || item.user_fingerprint);
                                const itemIdentity = normalizeFp(item.user_identity);
                                return (
                                    (recordFp && itemFp && itemFp === recordFp) ||
                                    (recordIdentity && itemIdentity && itemIdentity === recordIdentity) ||
                                    (recordFp && itemIdentity && itemIdentity === recordFp) ||
                                    (recordIdentity && itemFp && itemFp === recordIdentity)
                                );
                            });

                            if (index !== -1) {
                                window.allData[index] = { ...window.allData[index], ...updatedRecord };
                                console.log(`[Realtime] ✅ 已更新 window.allData 中的记录 (索引: ${index})`);
                            } else {
                                window.allData.unshift(updatedRecord);
                                if (window.allData.length > 1000) window.allData = window.allData.slice(0, 1000);
                                console.log(`[Realtime] ✅ 已 upsert 更新记录到 window.allData`);
                            }
                            
                            // 检查更新的记录是否是当前用户，如果是则刷新排名卡片
                            // 实时更新：确保再次触发 renderRankCards(currentUser)，让卡片数字能够随着数据库实时变动
                            try {
                                // 辅助函数：规范化指纹字符串（忽略大小写并剔除首尾空格）
                                const normalizeFingerprint = (fp) => {
                                    if (!fp) return '';
                                    return String(fp).trim().toLowerCase();
                                };
                                
                                // 获取当前用户的标识信息（增加异常处理）
                                let localGitHubName = null;
                                let currentFingerprint = null;
                                try {
                                    localGitHubName = localStorage.getItem('github_username');
                                    currentFingerprint = localStorage.getItem('user_fingerprint');
                                } catch (e) {
                                    console.warn('[Realtime] ⚠️ 读取 localStorage 失败:', e);
                                }
                                
                                const urlParams = new URLSearchParams(window.location.search);
                                const urlId = urlParams.get('id');
                                
                                // 规范化当前指纹
                                const normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                                
                                // 判断是否是当前用户的记录（优先级匹配策略：指纹优先 > GitHub ID）
                                let isCurrentUser = false;
                                let matchedByFingerprint = false;
                                
                                // 方式1：通过 URL 参数匹配（最高优先级，用于调试）
                                if (urlId) {
                                    const recordId = (updatedRecord.id || '').toString();
                                    const recordFingerprint = (updatedRecord.fingerprint || updatedRecord.user_identity || '').toString();
                                    if (recordId === urlId || recordFingerprint === urlId) {
                                        isCurrentUser = true;
                                    }
                                }
                                
                                // 方式2：通过 Fingerprint 匹配（优先于GitHub ID，忽略大小写和空格）
                                if (!isCurrentUser && normalizedCurrentFingerprint) {
                                    const recordFingerprint = normalizeFingerprint(updatedRecord.fingerprint || updatedRecord.user_fingerprint);
                                    const recordIdentity = normalizeFingerprint(updatedRecord.user_identity);
                                    
                                    if ((recordFingerprint && recordFingerprint === normalizedCurrentFingerprint) ||
                                        (recordIdentity && recordIdentity === normalizedCurrentFingerprint)) {
                                        isCurrentUser = true;
                                        matchedByFingerprint = true;
                                    }
                                }
                                
                                // 方式3：通过 GitHub ID 匹配（在指纹匹配失败后尝试）
                                if (!isCurrentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                                    // 【修复】统一使用 user_name 字段，不使用 github_username
                                    const recordGithubId = normalizeFingerprint(updatedRecord.user_name || updatedRecord.github_id || '');
                                    const normalizedLocalGitHub = normalizeFingerprint(localGitHubName);
                                    if (recordGithubId && recordGithubId === normalizedLocalGitHub) {
                                        isCurrentUser = true;
                                    }
                                }
                                
                                // 如果是当前用户的记录，刷新排名卡片和全局变量
                                if (isCurrentUser) {
                                    console.log('[Realtime] ✅ 检测到当前用户数据更新，刷新排名卡片');
                                    
                                    // 更新全局变量
                                    window.currentUser = updatedRecord;
                                    window.currentUserMatchedByFingerprint = matchedByFingerprint;
                                    
                                    // 更新 window.allData 中的对应记录
                                    const allData = window.allData || [];
                                    const updateIndex = allData.findIndex(item => {
                                        const itemFingerprint = normalizeFingerprint(item.fingerprint || item.user_fingerprint);
                                        const itemIdentity = normalizeFingerprint(item.user_identity);
                                        const recordFingerprint = normalizeFingerprint(updatedRecord.fingerprint || updatedRecord.user_fingerprint);
                                        const recordIdentity = normalizeFingerprint(updatedRecord.user_identity);
                                        
                                        return (itemFingerprint && itemFingerprint === recordFingerprint) ||
                                               (itemIdentity && itemIdentity === recordIdentity) ||
                                               (item.id && item.id === updatedRecord.id);
                                    });
                                    
                                    if (updateIndex !== -1) {
                                        allData[updateIndex] = updatedRecord;
                                        window.allData = allData;
                                    } else {
                                        // 如果没找到，说明上面的 upsert 已做过（或匹配条件不同）；这里不再 push，避免重复
                                        window.allData = allData;
                                    }
                                    
                                    // 使用更新后的记录直接渲染，确保卡片数字能够实时变动
                                    renderRankCards(updatedRecord);
                                } else {
                                    console.debug('[Realtime] ℹ️ 更新的记录不是当前用户，跳过排名卡片刷新');
                                }
                            } catch (error) {
                                console.error('[Realtime] ❌ 刷新排名卡片失败:', error);
                            }
                        }
                    )
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('[Realtime] ✅ 已成功订阅 user_analysis 表的 INSERT 和 UPDATE 事件');
                        } else if (status === 'CHANNEL_ERROR') {
                            console.error('[Realtime] ❌ 订阅通道错误');
                        } else {
                            console.log(`[Realtime] ℹ️ 订阅状态: ${status}`);
                        }
                    });

                console.log('[Realtime] 🚀 Realtime 监听已启动');

                // =========================
                // Supabase Presence 功能：统计实时在线人数
                // =========================
                
                // 如果已有 Presence 频道，先取消订阅
                if (presenceChannel) {
                    try {
                        supabaseClient.removeChannel(presenceChannel);
                        console.log('[Presence] ✅ 已取消旧的 Presence 频道');
                    } catch (error) {
                        console.warn('[Presence] ⚠️ 取消旧 Presence 频道时出错:', error);
                    }
                }

                try {
                    // 创建名为 online_users 的 Presence 频道
                    presenceChannel = supabaseClient
                        .channel('online_users')
                        .on('presence', { event: 'sync' }, () => {
                            // sync 回调：获取当前在线的所有状态对象
                            const newState = presenceChannel.presenceState();
                            
                            // 调试日志：输出所有同步到的用户
                            console.log('[Presence] 当前同步到的所有用户:', newState);
                            
                            // 计算在线人数：遍历所有状态对象并计算总数（使用 user_name 去重）
                            const userMap = new Map();
                            if (newState) {
                                Object.keys(newState).forEach((key) => {
                                    const presenceEntries = newState[key];
                                    const entries = Array.isArray(presenceEntries) ? presenceEntries : [presenceEntries];
                                    
                                    entries.forEach(entry => {
                                        if (!entry || !entry.online_at) return;
                                        // 使用 user_name 作为去重键
                                        const userName = entry.user_name || entry.github_id || entry.github_username || 'Guest';
                                        if (!userMap.has(userName) || new Date(entry.online_at) > new Date(userMap.get(userName).online_at)) {
                                            userMap.set(userName, entry);
                                        }
                                    });
                                });
                            }
                            
                            // 注意：不排除当前用户自己，因为用户要求在列表中可见
                            const onlineCount = userMap.size;
                            console.log('[Presence] 👥 在线人数同步（去重后，包含自己）:', onlineCount);

                            // 更新页面上 #online-count-value 的数字（地图上的）
                            const onlineCountElement = document.getElementById('online-count-value');
                            if (onlineCountElement) {
                                // 添加缩放动画类
                                onlineCountElement.classList.add('online-count-update');
                                
                                // 更新数字
                                onlineCountElement.textContent = onlineCount;
                                
                                // 动画结束后移除类（以便下次更新时可以再次触发动画）
                                setTimeout(() => {
                                    onlineCountElement.classList.remove('online-count-update');
                                }, 400); // 与 CSS 动画时长一致
                                
                                console.log('[Presence] ✅ 已更新在线人数显示（地图）:', onlineCount);
                            } else {
                                console.warn('[Presence] ⚠️ 找不到 #online-count-value 元素');
                            }
                            
                            // 更新抽屉中的在线人数（即使折叠状态也要更新）
                            const onlineCountText = document.getElementById('online-count-text');
                            if (onlineCountText) {
                                onlineCountText.textContent = onlineCount;
                            }
                            
                            // 渲染用户列表（使用 updateOnlineList 确保获取最新状态）
                            updateOnlineList();
                        })
                        .on('broadcast', { event: 'burn_msg' }, ({ payload }) => {
                            // 接收私信（阅后即焚消息）
                            console.log('[Message] 收到原始广播:', payload);
                            
                            const githubUsername = localStorage.getItem('github_username') || null;
                            const myId = githubUsername;
                            
                            // 检查是否是发给当前用户的消息
                            // 统一使用 target_id 或 to 字段进行匹配，支持 GitHub ID 和 user_name
                            const targetId = payload.target_id || payload.to;
                            const isForMe = targetId === myId || 
                                          targetId === githubUsername || 
                                          (!myId && targetId === 'Guest');
                            
                            if (payload && isForMe) {
                                console.log('[Message] 📨 收到私信:', payload);
                                const content = payload.content || payload.message || '';
                                const fromId = payload.from || 'Unknown';
                                const statusColor = payload.status_color || '#00ff41';
                                
                                showBurnMsg(content, fromId, statusColor);
                            } else {
                                console.log('[Message] ⚠️ 消息不是发给我的:', { targetId, myId, githubUsername });
                            }
                        })
                        .on('broadcast', { event: 'private_message' }, ({ payload }) => {
                            // 兼容旧的事件名
                            console.log('[Message] 收到原始广播 (private_message):', payload);
                            
                            const githubUsername = localStorage.getItem('github_username') || null;
                            const myId = githubUsername;
                            
                            const targetId = payload.target_id || payload.to;
                            const isForMe = targetId === myId || 
                                          targetId === githubUsername || 
                                          (!myId && targetId === 'Guest');
                            
                            if (payload && isForMe) {
                                console.log('[Message] 📨 收到私信 (兼容模式):', payload);
                                const content = payload.content || payload.message || '';
                                const fromId = payload.from || 'Unknown';
                                const statusColor = payload.status_color || '#00ff41';
                                
                                showBurnMsg(content, fromId, statusColor);
                            }
                        })
                        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                            console.log('[Presence] ➕ 用户加入:', key, newPresences);
                        })
                        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                            console.log('[Presence] ➖ 用户离开:', key, leftPresences);
                        })
                        .subscribe(async (status) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('[Presence] ✅ 已成功订阅 online_users 频道');
                                
                                // 强制同步自身状态（必须显式调用）
                                await trackSelf();
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('[Presence] ❌ Presence 频道错误');
                            } else {
                                console.log(`[Presence] ℹ️ Presence 订阅状态: ${status}`);
                            }
                        });

                    console.log('[Presence] 🚀 Presence 监听已启动');
                } catch (presenceError) {
                    console.error('[Presence] ❌ 启动 Presence 监听失败:', presenceError);
                }

            } catch (error) {
                console.error('[Realtime] ❌ 启动 Realtime 监听失败:', error);
            }
        }

        /**
         * 停止 Supabase Realtime 监听
         */
        function stopRealtimeListener() {
            // 停止 postgres_changes 监听
            if (realtimeChannel && supabaseClient) {
                try {
                    supabaseClient.removeChannel(realtimeChannel);
                    realtimeChannel = null;
                    console.log('[Realtime] ✅ 已停止 Realtime 监听');
                } catch (error) {
                    console.warn('[Realtime] ⚠️ 停止监听时出错:', error);
                }
            }

            // 停止 Presence 监听
            if (presenceChannel && supabaseClient) {
                try {
                    // 先取消跟踪，然后移除频道
                    presenceChannel.untrack();
                    supabaseClient.removeChannel(presenceChannel);
                    presenceChannel = null;
                    console.log('[Presence] ✅ 已停止 Presence 监听');
                } catch (error) {
                    console.warn('[Presence] ⚠️ 停止 Presence 监听时出错:', error);
                }
            }
        }

        /**
         * 设置用户状态
         * @param {string} status - 状态类型 ('idle', 'busy', 'sprint')
         */
        function setUserStatus(status) {
            if (!USER_STATUSES[status]) {
                console.warn('[Status] ⚠️ 无效的状态类型:', status);
                return;
            }
            
            currentUserStatus = status;
            localStorage.setItem('user_status', status);
            
            // 更新按钮样式
            document.querySelectorAll('.status-btn').forEach(btn => {
                btn.classList.remove('active');
                const btnStatus = btn.getAttribute('data-status');
                if (btnStatus === status) {
                    btn.classList.add('active');
                    const statusConfig = USER_STATUSES[status];
                    btn.style.borderColor = statusConfig.color;
                    btn.style.color = statusConfig.color;
                } else {
                    btn.style.borderColor = '';
                    btn.style.color = '';
                }
            });
            
            // 立即同步状态到Presence
            syncPresenceState();
            
            console.log('[Status] ✅ 用户状态已更新:', status, USER_STATUSES[status]);
        }
        
        /**
         * 初始化状态按钮样式
         */
        function initStatusButtons() {
            const savedStatus = localStorage.getItem('user_status') || 'idle';
            setUserStatus(savedStatus);
        }
        
        /**
         * 获取用户地理位置（经纬度）
         * @returns {Promise<Object>} 包含 lat, lng 的对象
         */
        async function getUserLocation() {
            try {
                // 使用 ip-api.com API 获取 IP 归属地信息
                const ipResponse = await fetch('http://ip-api.com/json/', {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (ipResponse.ok) {
                    const ipInfo = await ipResponse.json();
                    const lat = ipInfo.lat ? Number(ipInfo.lat) : null;
                    const lng = ipInfo.lon ? Number(ipInfo.lon) : null; // 注意：ip-api.com 使用 lon
                    return { lat, lng };
                }
            } catch (error) {
                console.warn('[Location] ⚠️ 获取地理位置失败:', error);
            }
            return { lat: null, lng: null };
        }

        /**
         * 强制同步自身状态（trackSelf）
         * 在 SUBSCRIBED 回调中显式调用
         */
        async function trackSelf() {
            if (!presenceChannel) {
                console.warn('[Presence] ⚠️ Presence频道未初始化');
                return;
            }
            
            try {
                // 获取 GitHub 用户名
                const ghUsername = localStorage.getItem('github_username') || null;
                
                // 生成 user_name
                const userName = ghUsername && isValidGitHubUsername(ghUsername) 
                    ? ghUsername 
                    : `Guest_${Math.floor(Math.random() * 1000)}`;
                
                // 生成 avatar_url
                const avatarUrl = ghUsername && isValidGitHubUsername(ghUsername)
                    ? `https://github.com/${ghUsername}.png`
                    : DEFAULT_AVATAR;
                
                // 获取状态信息
                const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                const status = statusConfig.status || 'idle';
                const statusColor = statusConfig.status_color || '#00ff41';
                
                // 获取经纬度
                const location = await getUserLocation();
                
                // 构建 Presence 数据
                const myPresence = {
                    user_name: userName,
                    avatar_url: avatarUrl,
                    github_id: ghUsername || null,
                    github_username: ghUsername || null,
                    status: status,
                    status_color: statusColor,
                    online_at: new Date().toISOString(),
                    lat: location.lat,
                    lng: location.lng,
                    last_vibe: new Date().toISOString()
                };
                
                // 显式调用 track
                await presenceChannel.track(myPresence);
                
                console.log('[Presence] ✅ 自身状态已同步:', myPresence);
            } catch (error) {
                console.error('[Presence] ❌ 同步自身状态失败:', error);
            }
        }

        /**
         * 同步Presence状态（包含所有用户信息）
         * 兼容旧代码，内部调用 trackSelf
         */
        async function syncPresenceState() {
            await trackSelf();
        }
        
        /**
         * 切换抽屉展开/折叠状态
         */
        function toggleDrawer() {
            drawerExpanded = !drawerExpanded;
            const drawer = document.getElementById('live-nodes-drawer');
            if (!drawer) return;
            
            if (drawerExpanded) {
                drawer.classList.remove('collapsed');
                drawer.classList.add('expanded');
            } else {
                drawer.classList.remove('expanded');
                drawer.classList.add('collapsed');
            }
            
            // 保存到localStorage
            localStorage.setItem('drawer_expanded', drawerExpanded.toString());
            console.log('[Drawer] ✅ 抽屉状态已切换:', drawerExpanded ? '展开' : '折叠');
        }
        
        /**
         * 初始化抽屉状态
         */
        function initDrawerState() {
            const drawer = document.getElementById('live-nodes-drawer');
            if (!drawer) return;

            if (drawerExpanded) {
                drawer.classList.remove('collapsed');
                drawer.classList.add('expanded');
            } else {
                drawer.classList.remove('expanded');
                drawer.classList.add('collapsed');
            }

            // 【修复】恢复左侧/右侧抽屉状态
            const leftDrawerOpen = localStorage.getItem('left_drawer_open') === 'true';
            const rightDrawerOpen = localStorage.getItem('right_drawer_open') === 'true';

            const leftDrawer = document.getElementById('left-drawer');
            const rightDrawer = document.getElementById('right-drawer');

            if (leftDrawer && leftDrawerOpen) {
                leftDrawer.classList.add('active');
                // 【修复】优先使用手动校准的国家/地区，否则使用保存的选中国家
                let countryCode = null;
                let countryName = '';

                // 优先级 1: 手动校准的国家 (manual_location)
                if (localStorage.getItem('loc_fixed') === 'true') {
                    countryCode = localStorage.getItem('manual_location') || null;
                    if (countryCode && countryNameMap[countryCode]) {
                        countryName = currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en;
                    }
                }

                // 优先级 2: 锚定国家 (anchored_country / selected_country)
                if (!countryCode) {
                    countryCode = _getAnchoredCountryFromStorage() || null;
                    if (countryCode && countryNameMap[countryCode]) {
                        countryName = currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en;
                    }
                }

                // 如果有国家代码，更新抽屉标题和内容
                if (countryCode) {
                    // 延迟执行，确保其他初始化完成
                    setTimeout(() => {
                        try {
                            // 统一走 onCountrySwitch：保证 anchored_country 更新 + Right Drawer 监听生效
                            onCountrySwitch(String(countryCode).toUpperCase(), { source: 'init-restore', name: countryName || countryCode, silent: true, force: true });
                            // 显式恢复抽屉视角（不依赖事件监听的 shouldRender 判定）
                            const cc = String(countryCode).toUpperCase();
                            if (/^[A-Z]{2}$/.test(cc)) {
                                switchToCountryView(cc, countryName || countryCode);
                            } else if (typeof showDrawersWithCountryData === 'function') {
                                showDrawersWithCountryData(countryCode, countryName || countryCode);
                            }
                        } catch { /* ignore */ }
                    }, 100);
                }

                // 【新增】恢复用户国家/地区显示（从 localStorage 读取手动校准的信息）
                if (localStorage.getItem('loc_fixed') === 'true') {
                    const manualLocation = localStorage.getItem('manual_location') || '';
                    const manualLat = localStorage.getItem('manual_lat');
                    const manualLng = localStorage.getItem('manual_lng');
                    if (manualLocation || (manualLat && manualLng)) {
                        setTimeout(() => {
                            if (typeof updateUserCountryFlag === 'function') {
                                const isManual = true;
                                const savedCountryName = countryNameMap[manualLocation]
                                    ? (currentLang === 'zh' ? countryNameMap[manualLocation].zh : countryNameMap[manualLocation].en)
                                    : manualLocation;
                                updateUserCountryFlag(manualLocation, savedCountryName || manualLocation, isManual);
                                console.log('[Drawer] ✅ 已恢复手动校准的国家/地区信息:', { manualLocation, manualLat, manualLng });
                            }
                        }, 200);
                    }
                }
            }

            if (rightDrawer && rightDrawerOpen) {
                rightDrawer.classList.add('active');
            }
        }
        
        /**
         * 更新在线用户列表（核心渲染逻辑）
         * 在 onlineChannel.on('presence', { event: 'sync' }) 回调中调用
         */
        function updateOnlineList() {
            if (!presenceChannel) {
                console.warn('[UserList] ⚠️ Presence频道未初始化');
                return;
            }
            
            // 通过 onlineChannel.presenceState() 获取最新状态
            const state = presenceChannel.presenceState();
            renderOnlineUsersList(state);
        }
        
        /**
         * 渲染在线用户列表（分类显示：已实名/匿名）
         * @param {Object} presenceState - Presence状态对象
         */
        function renderOnlineUsersList(presenceState) {
            const listContainer = document.getElementById('online-users-list');
            if (!listContainer) {
                console.warn('[UserList] ⚠️ 找不到用户列表容器');
                return;
            }
            
            // 即时清空容器，移除 "Scanning..." 提示
            listContainer.innerHTML = '';
            
            // 收集所有用户，使用 user_name 作为去重键
            const userMap = new Map();
            
            if (presenceState && Object.keys(presenceState).length > 0) {
                Object.keys(presenceState).forEach((key) => {
                    const presenceEntries = presenceState[key];
                    const entries = Array.isArray(presenceEntries) ? presenceEntries : [presenceEntries];
                    
                    entries.forEach(entry => {
                        if (!entry || !entry.online_at) return;
                        
                        // 使用 user_name 作为去重键
                        const userName = entry.user_name || entry.github_id || entry.github_username || 'Guest';
                        
                        // 去重逻辑：如果已存在该用户，保留最新的
                        if (!userMap.has(userName) || new Date(entry.online_at) > new Date(userMap.get(userName).online_at)) {
                            userMap.set(userName, {
                                ...entry,
                                user_name: userName,
                                github_id: entry.github_id || entry.github_username || null,
                                github_username: entry.github_username || entry.github_id || null
                            });
                        }
                    });
                });
            }
            
            // 注意：不排除当前用户自己，因为用户要求在列表中可见
            
            // 转换为数组并分类
            const allUsers = Array.from(userMap.values());
            
            // 分类：已实名用户（有 github_id 且不为默认值）和匿名用户
            const verifiedUsers = allUsers.filter(user => {
                const githubId = user.github_id || user.github_username;
                return githubId && isValidGitHubUsername(githubId) && !githubId.startsWith('Guest_');
            });
            
            const anonymousUsers = allUsers.filter(user => {
                const githubId = user.github_id || user.github_username;
                return !githubId || !isValidGitHubUsername(githubId) || githubId.startsWith('Guest_');
            });
            
            // 排序：按在线时间倒序
            verifiedUsers.sort((a, b) => new Date(b.online_at) - new Date(a.online_at));
            anonymousUsers.sort((a, b) => new Date(b.online_at) - new Date(a.online_at));
            
            // 如果没有用户，显示空状态
            if (verifiedUsers.length === 0 && anonymousUsers.length === 0) {
                listContainer.innerHTML = '<div class="text-zinc-500 text-center py-8 text-[10px]">Scanning for nearby nodes...</div>';
                return;
            }
            
            // 渲染已实名用户（排在最前）
            let html = '';
            
            if (verifiedUsers.length > 0) {
                html += verifiedUsers.map(user => {
                    const userName = user.user_name || user.github_id || user.github_username || 'Guest';
                    const githubId = user.github_id || user.github_username || userName;
                    const avatarUrl = user.avatar_url || DEFAULT_AVATAR;
                    const status = user.status || 'idle';
                    const statusConfig = USER_STATUSES[status] || USER_STATUSES.idle;
                    const statusLabel = statusConfig.label;
                    
                    // 使用用户要求的 HTML 结构，包裹 <a> 标签，链接指向 GitHub
                    // 添加 onclick="event.stopPropagation()" 防止触发抽屉折叠
                    return `
                        <a 
                            href="https://github.com/${userName}" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg transition-all group"
                            onclick="event.stopPropagation(); openMessageInput('${userName}'); return false;"
                        >
                            <img 
                                src="${avatarUrl}" 
                                alt="${userName}" 
                                class="w-8 h-8 rounded-full border border-[var(--accent-terminal)]"
                                loading="lazy"
                                onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                            />
                            <div class="flex flex-col flex-1 min-w-0">
                                <span class="text-xs text-white font-mono group-hover:text-[var(--accent-terminal)] truncate">${userName}</span>
                                <span class="text-[10px] text-[var(--text-dim)] uppercase">${statusLabel}</span>
                            </div>
                            <i class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--accent-terminal)]">🔗</i>
                        </a>
                    `;
                }).join('');
            }
            
            // 渲染匿名用户
            if (anonymousUsers.length > 0) {
                html += anonymousUsers.map(user => {
                    const userName = user.user_name || 'Guest';
                    const avatarUrl = user.avatar_url || DEFAULT_AVATAR;
                    const status = user.status || 'idle';
                    const statusConfig = USER_STATUSES[status] || USER_STATUSES.idle;
                    const statusLabel = statusConfig.label;
                    
                    return `
                        <div 
                            class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-all opacity-70"
                            onclick="openMessageInput('${userName}')"
                        >
                            <img 
                                src="${avatarUrl}" 
                                alt="${userName}" 
                                class="w-8 h-8 rounded-full border border-zinc-700"
                                loading="lazy"
                                onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                            />
                            <div class="flex flex-col flex-1 min-w-0">
                                <span class="text-xs text-zinc-400 font-mono truncate">${userName}</span>
                                <span class="text-[10px] text-zinc-600 uppercase">${statusLabel}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            listContainer.innerHTML = html;
        }
        
        /**
         * 打开私信输入框
         * @param {string} targetUserId - 目标用户ID
         */
        function openMessageInput(targetUserId) {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.className = 'message-input-overlay';
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            };
            
            // 创建输入框
            const inputBox = document.createElement('div');
            inputBox.className = 'message-input-box';
            inputBox.onclick = (e) => e.stopPropagation();
            
            inputBox.innerHTML = `
                <div class="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest">发送私信给 ${targetUserId}</div>
                <textarea 
                    id="messageTextInput" 
                    placeholder="输入消息（阅后即焚，5秒后自动销毁）"
                    class="w-full bg-zinc-900/50 border border-zinc-800 px-3 py-2 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[var(--accent-terminal)] transition-colors resize-none"
                    rows="4"
                ></textarea>
                <div class="flex gap-2 mt-3">
                    <button 
                        onclick="sendMessage('${targetUserId}')"
                        class="flex-1 px-4 py-2 bg-[var(--accent-terminal)]/20 border border-[var(--accent-terminal)] text-[var(--accent-terminal)] text-xs font-bold uppercase tracking-wider hover:bg-[var(--accent-terminal)]/30 transition-colors"
                    >
                        发送
                    </button>
                    <button 
                        onclick="this.closest('.message-input-overlay').remove()"
                        class="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider hover:bg-zinc-700 transition-colors"
                    >
                        取消
                    </button>
                </div>
            `;
            
            overlay.appendChild(inputBox);
            document.body.appendChild(overlay);
            
            // 聚焦输入框
            setTimeout(() => {
                const textarea = document.getElementById('messageTextInput');
                if (textarea) textarea.focus();
            }, 100);
        }
        
        /**
         * 显示发送成功提示
         * @param {string} message - 提示消息
         */
        function showNotification(message) {
            // 创建提示元素
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-[var(--accent-terminal)]/20 border border-[var(--accent-terminal)] px-4 py-2 rounded text-[var(--accent-terminal)] text-xs font-bold uppercase tracking-wider z-50';
            notification.textContent = message;
            notification.style.animation = 'popup-appear 0.3s ease-out';
            
            document.body.appendChild(notification);
            
            // 3秒后自动移除
            setTimeout(() => {
                notification.style.animation = 'popup-destroy 0.3s ease-out forwards';
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, 3000);
        }

        /**
         * 发送私信（使用Broadcast）
         * @param {string} targetUserId - 目标用户ID
         */
        function sendMessage(targetUserId) {
            const textarea = document.getElementById('messageTextInput');
            const message = textarea?.value.trim();
            
            if (!message) {
                alert('消息不能为空');
                return;
            }
            
            if (!presenceChannel) {
                alert('连接未建立，无法发送消息');
                return;
            }
            
            const myId = localStorage.getItem('github_username') || null;
            const githubUsername = myId || 'Guest';
            const statusConfig = USER_STATUSES[currentUserStatus];
            
            // 使用Broadcast发送消息
            presenceChannel.send({
                type: 'broadcast',
                event: 'burn_msg',
                payload: {
                    from: githubUsername,
                    to: targetUserId,
                    target_id: targetUserId,
                    content: message,
                    message: message, // 兼容旧字段名
                    timestamp: new Date().toISOString(),
                    status_color: statusConfig.status_color
                }
            });
            
            console.log('[Message] ✅ 私信已发送:', { from: githubUsername, to: targetUserId, message });
            
            // 💡 修复逻辑：如果是发给自己，直接在本地运行显示逻辑
            if (targetUserId === myId || targetUserId === githubUsername) {
                // 自接收：直接显示消息
                showBurnMsg(message, githubUsername, statusConfig.status_color);
                console.log('[Message] 🔄 自接收消息已显示');
            } else {
                // 发送给他人：显示发送成功提示
                showNotification('密信已发出');
            }
            
            // 关闭输入框
            const overlay = document.querySelector('.message-input-overlay');
            if (overlay) overlay.remove();
        }
        
        // 全局变量：用于管理倒计时，防止多个弹窗重叠
        let currentBurnMsgInterval = null;
        let currentBurnMsgPopup = null;

        /**
         * 统一消息显示函数（阅后即焚弹窗）
         * @param {string} content - 消息内容
         * @param {string} fromId - 发送者ID
         * @param {string} statusColor - 状态颜色（可选）
         */
        function showBurnMsg(content, fromId, statusColor = '#00ff41') {
            // 如果已有弹窗，先清除旧的倒计时
            if (currentBurnMsgInterval) {
                clearInterval(currentBurnMsgInterval);
                currentBurnMsgInterval = null;
            }
            
            // 如果已有弹窗，先移除
            if (currentBurnMsgPopup) {
                currentBurnMsgPopup.classList.add('destroying');
                setTimeout(() => {
                    if (currentBurnMsgPopup && currentBurnMsgPopup.parentNode) {
                        currentBurnMsgPopup.remove();
                    }
                }, 300);
            }
            
            // 创建新弹窗
            const popup = document.createElement('div');
            popup.className = 'message-popup';
            currentBurnMsgPopup = popup;
            
            let countdown = 5;
            
            // 判断是否为自传消息
            const myId = localStorage.getItem('github_username') || null;
            const isSelf = fromId === myId || fromId === '系统 (自传)';
            const fromLabel = isSelf ? '系统 (自传)' : fromId;
            
            popup.innerHTML = `
                <div class="flex items-center gap-3 mb-3">
                    <div class="text-[10px] text-zinc-500 uppercase tracking-widest">From: ${fromLabel}</div>
                    <div class="flex-1"></div>
                    <div class="text-[10px] font-bold" style="color: ${statusColor};" id="countdown-${Date.now()}">5秒</div>
                </div>
                <div class="text-white text-sm mb-3 font-mono" style="min-height: 60px; word-break: break-word;">${content}</div>
                <div class="text-[9px] text-zinc-600 font-mono">阅后即焚 // 自动销毁</div>
            `;
            
            document.body.appendChild(popup);
            
            // 倒计时逻辑（确保每次新消息到达时都能正确重置）
            const countdownId = `countdown-${Date.now()}`;
            const countdownEl = popup.querySelector(`#${countdownId}`);
            
            currentBurnMsgInterval = setInterval(() => {
                countdown--;
                if (countdownEl) {
                    countdownEl.textContent = `${countdown}秒`;
                }
                
                if (countdown <= 0) {
                    clearInterval(currentBurnMsgInterval);
                    currentBurnMsgInterval = null;
                    // 销毁动画
                    popup.classList.add('destroying');
                    setTimeout(() => {
                        if (popup && popup.parentNode) {
                            popup.remove();
                        }
                        if (currentBurnMsgPopup === popup) {
                            currentBurnMsgPopup = null;
                        }
                    }, 500);
                }
            }, 1000);
        }

        /**
         * 显示私信弹窗（接收端）- 兼容旧函数名
         * @param {Object} messageData - 消息数据
         */
        function showMessagePopup(messageData) {
            const content = messageData.content || messageData.message || '';
            const fromId = messageData.from || 'Unknown';
            const statusColor = messageData.status_color || '#00ff41';
            
            showBurnMsg(content, fromId, statusColor);
        }
        
        /**
         * GitHub OAuth 登录
         * 调用 Supabase Auth 的 signInWithOAuth 方法
         */
        async function loginWithGitHub() {
            if (!supabaseClient) {
                console.error('[Auth] ❌ Supabase 客户端未初始化');
                alert('数据库连接未就绪，请稍候再试');
                return;
            }
            
            try {
                console.log('[Auth] 🚀 开始 GitHub OAuth 登录流程...');
                
                // 获取当前页面 URL 作为重定向地址
                const redirectTo = window.location.origin + window.location.pathname;
                
                const { data, error } = await supabaseClient.auth.signInWithOAuth({
                    provider: 'github',
                    options: {
                        redirectTo: redirectTo,
                        scopes: 'read:user user:email', // 请求读取用户信息和邮箱的权限
                    }
                });
                
                if (error) {
                    console.error('[Auth] ❌ GitHub OAuth 登录失败:', error);
                    alert(`登录失败: ${error.message}`);
                    return;
                }
                
                console.log('[Auth] ✅ GitHub OAuth 登录请求已发送，等待重定向...');
                // 注意：signInWithOAuth 会触发页面重定向，后续逻辑在 handleAuthStateChange 中处理
                
            } catch (error) {
                console.error('[Auth] ❌ GitHub OAuth 登录异常:', error);
                alert(`登录失败: ${error.message || '未知错误'}`);
            }
        }
        
        /**
         * 退出登录
         * 清理会话和本地数据
         */
        async function logout() {
            if (!supabaseClient) {
                console.error('[Auth] ❌ Supabase 客户端未初始化');
                return;
            }
            
            try {
                console.log('[Auth] 🚪 开始退出登录...');
                
                // 清理 localStorage
                localStorage.removeItem('github_username');
                // 保留 fingerprint，以便静默登录
                
                // 调用 Supabase Auth 退出
                const { error } = await supabaseClient.auth.signOut();
                
                if (error) {
                    console.error('[Auth] ❌ 退出登录失败:', error);
                    alert(`退出失败: ${error.message}`);
                    return;
                }
                
                // 清理全局变量
                window.currentUser = null;
                window.currentUserMatchedByFingerprint = false;
                
                // 刷新 UI
                updateAuthUI(null);
                
                // 刷新排名卡片（显示全球最强模式）
                renderRankCards(null);
                
                console.log('[Auth] ✅ 已退出登录');
                alert('已退出登录');
                
            } catch (error) {
                console.error('[Auth] ❌ 退出登录异常:', error);
                alert(`退出失败: ${error.message || '未知错误'}`);
            }
        }
        
        /**
         * 显示同步遮罩
         */
        function showSyncingOverlay() {
            try {
                const leftDrawer = document.getElementById('left-drawer');
                const leftBody = document.getElementById('left-drawer-body');
                
                if (!leftDrawer || !leftBody) {
                    console.warn('[Auth] ⚠️ 无法找到抽屉元素，跳过显示同步遮罩');
                    return;
                }
                
                // 移除旧的同步占位符（如果存在）
                const existingSyncingCards = leftBody.querySelectorAll('.drawer-item');
                existingSyncingCards.forEach(card => {
                    const label = card.querySelector('.drawer-item-label');
                    if (label && label.textContent === '数据同步中') {
                        card.remove();
                    }
                });
                
                // 创建"数据同步中"占位符卡片
                const loadingCard = document.createElement('div');
                loadingCard.className = 'drawer-item';
                loadingCard.id = 'syncing-overlay-card';
                loadingCard.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">⏳</span>
                        <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                            SYNCING
                        </span>
                    </div>
                    <div class="drawer-item-label mb-2">数据同步中</div>
                    <div class="text-[10px] text-[#00ff41]/60 mb-3">
                        正在迁移指纹数据，请稍候...
                    </div>
                    <div class="flex items-center space-x-2 mb-2">
                        <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse"></div>
                        <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                        <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                    </div>
                `;
                
                // 先移除旧的统计卡片（如果存在）
                const existingStatsCards = leftBody.querySelectorAll('.drawer-item:not(#syncing-overlay-card)');
                existingStatsCards.forEach(card => card.remove());
                
                // 添加同步占位符
                leftBody.appendChild(loadingCard);
                
                // 确保抽屉打开
                if (!leftDrawer.classList.contains('active')) {
                    leftDrawer.classList.add('active');
                }
                
                console.log('[Auth] ✅ 已显示同步遮罩');
            } catch (error) {
                console.error('[Auth] ❌ 显示同步遮罩失败:', error);
            }
        }
        
        /**
         * 隐藏同步遮罩
         */
        function hideSyncingOverlay() {
            try {
                const leftBody = document.getElementById('left-drawer-body');
                if (!leftBody) {
                    console.warn('[Auth] ⚠️ 无法找到抽屉 body 元素，跳过隐藏同步遮罩');
                    return;
                }
                
                // 移除同步占位符卡片
                const syncingCard = document.getElementById('syncing-overlay-card');
                if (syncingCard) {
                    syncingCard.remove();
                    console.log('[Auth] ✅ 已移除同步遮罩');
                }
                
                // 如果有当前用户数据，重新渲染统计卡片（优先使用 allData 中的完整记录）
                if (window.currentUser) {
                    renderUserStatsCards(leftBody, getBestUserRecordForStats(window.currentUser));
                }
            } catch (error) {
                console.error('[Auth] ❌ 隐藏同步遮罩失败:', error);
            }
        }
        
        /**
         * 处理认证状态变化
         * 当用户登录/退出时自动调用
         * @param {Object} session - Supabase 会话对象
         */
        async function handleAuthStateChange(session) {
            console.log('[Auth] 🔔 认证状态变化:', session ? '已登录' : '未登录');
            
            // 超时兜底定时器
            let timeoutTimer = null;
            
            // 确保 finally 块中能访问的变量
            let migrationCompleted = false;
            
            try {
                if (session && session.user) {
                    const user = session.user;
                    console.log('[Auth] 👤 用户信息:', {
                        id: user.id,
                        email: user.email,
                        user_metadata: user.user_metadata
                    });
                    
                    // 从 user_metadata 中提取 GitHub 信息
                    // GitHub OAuth 返回的数据通常在 user_metadata 中
                    const githubUsername = user.user_metadata?.user_name || 
                                         user.user_metadata?.preferred_username ||
                                         user.user_metadata?.login ||
                                         user.email?.split('@')[0] || // 降级：使用邮箱前缀
                                         null;
                    
                    const avatarUrl = user.user_metadata?.avatar_url || 
                                    user.user_metadata?.picture ||
                                    (githubUsername ? getGitHubAvatarUrl(githubUsername) : null) ||
                                    DEFAULT_AVATAR;
                    
                    if (!githubUsername) {
                        console.warn('[Auth] ⚠️ 无法从 user_metadata 中提取 GitHub 用户名');
                        updateAuthUI(null);
                        return;
                    }
                    
                    console.log('[Auth] ✅ 提取到 GitHub 信息:', {
                        username: githubUsername,
                        avatarUrl: avatarUrl
                    });
                    
                    // 保存到 localStorage（兼容旧代码）
                    localStorage.setItem('github_username', githubUsername);
                    
                    // 【变量修正】统一使用 currentFp 变量
                    // 【修复】确保在调用 migrate 接口前，代码能够正确从 localStorage 获取 user_fingerprint
                    let currentFp = null;
                    try {
                        // 优先尝试从 localStorage 获取，这是匿名用户数据的唯一标识
                        currentFp = localStorage.getItem('user_fingerprint') || window.fpId;
                    } catch (e) {
                        console.warn('[Auth] ⚠️ 读取 localStorage user_fingerprint 失败:', e);
                    }
                    
                    if (!currentFp) {
                        console.warn('[Auth] ⚠️ 无法获取指纹，尝试生成...');
                        try {
                            const generatedFp = await getCurrentFingerprint();
                            if (generatedFp) {
                                currentFp = generatedFp;
                                window.fpId = generatedFp;
                                try {
                                    localStorage.setItem('user_fingerprint', generatedFp);
                                } catch (e) {
                                    console.warn('[Auth] ⚠️ 写入 localStorage user_fingerprint 失败:', e);
                                }
                            }
                        } catch (genError) {
                            console.error('[Auth] ❌ 生成指纹失败:', genError);
                        }
                    }
                    
                    const githubUserId = user.id; // 从 Supabase Auth 用户对象获取 user_id
                    let migrationSuccess = false;
                    
                    // 【迁移优先】在检测到 GitHub 登录后，先调用 /api/fingerprint/migrate 接口
                    if (currentFp && githubUserId) {
                        console.log('[Auth] 🔄 检测到指纹和 GitHub 用户，开始数据迁移...');
                        console.log('[Auth] 📋 迁移信息:', {
                            currentFp: currentFp.substring(0, 8) + '...',
                            githubUserId: githubUserId.substring(0, 8) + '...',
                            username: githubUsername
                        });
                        
                        // 【合并确认弹窗】在迁移前检查是否需要用户确认
                        const claimToken = localStorage.getItem('vibe_claim_token');
                        const hasLocalData = claimToken || currentFp;
                        const localDataExists = localStorage.getItem('last_analysis_data') || claimToken;
                        
                        // 【严格校验迁移逻辑】检查是否有影子令牌
                        // 注意:新的强制认领机制只认 claimToken,不再支持纯指纹迁移
                        if (!claimToken) {
                            // 【修复】无 claim_token 时不弹“无用弹窗”，直接静默跳过迁移
                            // 说明：用户可能只是想登录查看数据；没有待认领数据并不需要阻塞交互。
                            console.warn('[Auth] ℹ️ 本地无 claim_token，跳过数据认领（静默，无弹窗）');
                            migrationSuccess = false;
                            // 继续后续正常流程（更新 UI / 尝试拉取用户数据）
                        } else
                        
                        // 如果需要确认，先显示弹窗
                        if (hasLocalData && localDataExists) {
                            const shouldMerge = await new Promise((resolve) => {
                                const dialog = document.createElement('div');
                                dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
                                dialog.id = 'merge-confirm-dialog';
                                dialog.innerHTML = `
                                    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                                        <h3 class="text-lg font-semibold text-gray-900 mb-2">数据合并确认</h3>
                                        <p class="text-sm text-gray-600 mb-4">检测到您有未归档的战绩，是否合并到 GitHub 账号？</p>
                                        <div class="flex gap-3 justify-end">
                                            <button class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors" id="merge-cancel">取消</button>
                                            <button class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors" id="merge-confirm">合并</button>
                                        </div>
                                    </div>
                                `;
                                document.body.appendChild(dialog);
                                
                                const removeDialog = () => {
                                    const dialogElement = document.getElementById('merge-confirm-dialog');
                                    if (dialogElement && dialogElement.parentNode) {
                                        dialogElement.parentNode.removeChild(dialogElement);
                                    }
                                };
                                
                                dialog.querySelector('#merge-confirm')?.addEventListener('click', () => {
                                    removeDialog();
                                    resolve(true);
                                });
                                
                                dialog.querySelector('#merge-cancel')?.addEventListener('click', () => {
                                    removeDialog();
                                    resolve(false);
                                });
                            });
                            
                            if (!shouldMerge) {
                                console.log('[Auth] ℹ️ 用户取消合并，跳过迁移');
                                return;
                            }
                        }
                        
                        // 显示同步遮罩
                        showSyncingOverlay();
                        
                        // 设置 8 秒超时兜底
                        timeoutTimer = setTimeout(() => {
                            if (!migrationCompleted) {
                                console.warn('[Auth] ⚠️ 迁移接口超时（8秒），强制执行 hideSyncingOverlay()');
                                migrationCompleted = true;
                                hideSyncingOverlay();
                            }
                        }, 8000);
                        
                        try {
                            // 【Task 1】获取 API 基准地址
                            const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || 
                                              'https://cursor-clinical-analysis.psterman.workers.dev/';
                            const migrateUrl = `${apiEndpoint}api/fingerprint/migrate`;
                            
                            console.log('[Auth] 📡 使用 API 地址:', migrateUrl);
                            
                            // 【修复 AbortError】添加 AbortController 和超时处理
                            const abortController = new AbortController();
                            const timeoutId = setTimeout(() => {
                                abortController.abort();
                            }, 10000); // 10秒超时
                            
                            let migrateResponse;
                            try {
                                // 调用后端接口迁移数据
                                // 【必须在 Body 中携带：{ userId, claimToken }】
                                const migrateBody = {
                                    userId: githubUserId
                                };
                                
                                // 【影子令牌优先】如果存在 claimToken，优先使用它
                                if (claimToken) {
                                    migrateBody.claimToken = claimToken; // 后端接收 claimToken（驼峰命名）
                                    console.log('[Auth] 🔑 检测到 vibe_claim_token，执行强行认领:', claimToken.substring(0, 8) + '...');
                                } else {
                                    // 【修复】没有 claimToken 也允许继续登录并加载 GitHub 用户数据
                                    // 迁移/认领只是“把匿名战绩合并到账号”，不应阻断“查看自己数据”。
                                    console.warn('[Auth] ⚠️ 无 claimToken，跳过迁移（仅跳过认领，不阻断登录）');
                                    migrationSuccess = false;
                                    // 跳过迁移请求，继续后续流程（会走 user_id 同步 + 刷新抽屉）
                                    migrateResponse = null;
                                }

                                
                                migrateResponse = await fetch(migrateUrl, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${session.access_token}` // 传递认证 token
                                    },
                                    body: JSON.stringify(migrateBody),
                                    signal: abortController.signal // 添加 signal 支持取消
                                });
                                
                                clearTimeout(timeoutId); // 清除超时定时器
                            } catch (fetchError) {
                                clearTimeout(timeoutId); // 确保清除超时定时器
                                
                                // 处理 AbortError
                                if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
                                    console.warn('[Auth] ⚠️ 迁移请求被取消（超时或页面刷新）:', fetchError);
                                    throw new Error('请求超时或被取消，请稍后重试');
                                }
                                throw fetchError; // 重新抛出其他错误
                            }
                            
                            // 清除超时兜底定时器
                            if (timeoutTimer) {
                                clearTimeout(timeoutTimer);
                                timeoutTimer = null;
                            }
                            
                            // 【Task 4】修复 JSON 解析异常：检查响应状态和 Content-Type
                            let migrateResult = null;
                            if (migrateResponse.status !== 204) {
                                const contentType = migrateResponse.headers.get('content-type') || '';
                                if (contentType.includes('application/json')) {
                                    try {
                                        migrateResult = await migrateResponse.json();
                                    } catch (jsonError) {
                                        console.error('[Auth] ❌ JSON 解析失败:', jsonError);
                                        const responseText = await migrateResponse.text();
                                        console.error('[Auth] 响应内容:', responseText);
                                        throw new Error(`JSON 解析失败: ${jsonError.message}`);
                                    }
                                } else {
                                    const responseText = await migrateResponse.text();
                                    console.warn('[Auth] ⚠️ 响应不是 JSON 格式:', {
                                        status: migrateResponse.status,
                                        contentType: contentType,
                                        responseText: responseText.substring(0, 200)
                                    });
                                    throw new Error(`响应格式错误: ${contentType}`);
                                }
                            } else {
                                console.log('[Auth] ℹ️ 响应状态为 204 No Content，跳过 JSON 解析');
                                migrateResult = { status: 'success', data: null };
                            }
                            
                            // 【修复 404 错误处理】检查响应状态
                            if (!migrateResponse.ok) {
                                const errorMsg = migrateResult?.error || `HTTP ${migrateResponse.status}: ${migrateResponse.statusText}`;
                                console.warn('[Auth] ⚠️ 迁移接口返回错误:', {
                                    status: migrateResponse.status,
                                    statusText: migrateResponse.statusText,
                                    error: errorMsg
                                });
                                
                                // 如果是 404，说明路由不存在或未部署，继续正常流程
                                if (migrateResponse.status === 404) {
                                    console.log('[Auth] ℹ️ 迁移接口不存在（404），跳过迁移，继续正常流程');
                                    // 不抛出错误，继续执行后续逻辑
                                } else if (migrateResponse.status === 400 && (errorMsg.includes('claim_token') || errorMsg.includes('无效'))) {
                                    // 【核心修复】令牌确实无效或已过期,必须清除,否则用户每次登录都会报错
                                    console.warn('[Auth] ⚠️ 检测到失效的影子令牌,正在强制清除本地缓存...');
                                    localStorage.removeItem('vibe_claim_token');
                                    localStorage.removeItem('user_fingerprint'); // 同时清除指纹
                                } else {
                                    // 其他错误，记录但不中断流程
                                    console.warn('[Auth] ⚠️ 数据迁移失败，继续正常流程:', errorMsg);
                                }
                                
                                // 无论什么错误，都继续正常流程（不迁移）
                                migrateResult = { status: 'error', error: errorMsg };
                            }
                            
                            migrationCompleted = true;
                            
                            if (migrateResult && migrateResult.status === 'success') {
                                console.log('[Auth] ✅ Step A: 数据迁移成功:', migrateResult.data);
                                migrationSuccess = true;
                                
                                // 【场景 A：先分析后登录】清除 claim_token 和 fingerprint 缓存
                                localStorage.removeItem('vibe_claim_token');
                                localStorage.removeItem('user_fingerprint');
                                if (window.fpId) {
                                    delete window.fpId;
                                }
                                console.log('[Auth] ✅ 已清除本地 fingerprint 和 claim_token 缓存');
                                
                                // 迁移成功后，更新 window.allData
                                const allData = window.allData || [];
                                const migratedUser = migrateResult.data;
                                
                                // 移除旧的指纹记录（如果存在）
                                const oldIndex = allData.findIndex(item => 
                                    item.fingerprint === currentFp && item.id !== githubUserId
                                );
                                if (oldIndex !== -1) {
                                    allData.splice(oldIndex, 1);
                                }
                                
                                // 添加或更新迁移后的用户数据
                                const newIndex = allData.findIndex(item => item.id === githubUserId);
                                if (newIndex !== -1) {
                                    allData[newIndex] = { ...allData[newIndex], ...migratedUser };
                                } else {
                                    allData.push(migratedUser);
                                }
                                window.allData = allData;
                                
                                // 设置当前用户为迁移后的用户
                                window.currentUser = migratedUser;
                                window.currentUserMatchedByFingerprint = false; // 现在是通过 GitHub OAuth 匹配的
                                
                                console.log('[Auth] ✅ 身份合并完成，历史数据已迁移到 GitHub User ID');
                                
                                // 【顺序重组】Step B: 调用 autoReportSelf（上报当前地理位置，确保 GitHub 账号有了 lat/lng）
                                console.log('[Auth] 🔄 Step B: 开始上报地理位置...');
                                try {
                                    const reportResult = await autoReportSelf();
                                    if (reportResult.success) {
                                        console.log('[Auth] ✅ Step B: 地理位置上报成功');
                                    } else {
                                        console.warn('[Auth] ⚠️ Step B: 地理位置上报失败:', reportResult.error);
                                    }
                                } catch (reportError) {
                                    console.error('[Auth] ❌ Step B: 地理位置上报异常:', reportError);
                                }
                                
                                // 【迁移优先】只有在迁移请求结束后，才调用 refreshUserStats() 加载数据
                                console.log('[Auth] 🔄 Step C: 开始刷新用户统计数据...');
                                if (typeof window.refreshUserStats === 'function') {
                                    try {
                                        await window.refreshUserStats();
                                        console.log('[Auth] ✅ Step C: refreshUserStats 执行完成');
                                    } catch (refreshError) {
                                        // 【修复 AbortError】特殊处理 AbortError
                                        if (refreshError.name === 'AbortError' || refreshError.message?.includes('aborted')) {
                                            console.log('[Auth] ℹ️ refreshUserStats 被取消（可能是页面刷新导致）');
                                        } else {
                                            console.error('[Auth] ❌ Step C: refreshUserStats 执行失败:', refreshError);
                                        }
                                    }
                                } else {
                                    console.warn('[Auth] ⚠️ window.refreshUserStats 函数不存在');
                                }
                                
                                // 更新 UI
                                updateAuthUI({ username: githubUsername, avatarUrl });
                                
                                // 隐藏同步遮罩
                                hideSyncingOverlay();
                                
                                return; // 迁移成功，直接返回，不再执行后续的指纹绑定逻辑
                            } else if (migrateResult && migrateResult.status === 'not_found') {
                                console.log('[Auth] ℹ️ 未找到需要迁移的数据，继续正常流程');
                                hideSyncingOverlay();
                            } else {
                                console.warn('[Auth] ⚠️ 数据迁移失败，继续正常流程:', migrateResult?.error);
                                hideSyncingOverlay();
                            }
                        } catch (migrateError) {
                            migrationCompleted = true;
                            
                            // 【修复 AbortError】特殊处理 AbortError
                            if (migrateError.name === 'AbortError' || migrateError.message?.includes('aborted')) {
                                console.warn('[Auth] ⚠️ 迁移请求被取消（可能是页面刷新导致）:', migrateError);
                            } else {
                                console.error('[Auth] ❌ 数据迁移异常，继续正常流程:', migrateError);
                            }
                            
                            hideSyncingOverlay();
                        }
                    } else {
                        console.log('[Auth] ℹ️ 未检测到指纹或 GitHub 用户 ID，跳过迁移');
                    }
                    
                    // 【仅在迁移未成功时执行】关键绑定逻辑：登录后必须使用 user_id 更新，而不是 fingerprint
                    if (!migrationSuccess) {
                        console.log('[Auth] 🔗 迁移未成功，开始使用 GitHub User ID 进行数据同步...');
                        
                        // 【关键修复】登录后必须使用 user_id 进行所有操作，而不是 fingerprint
                        // 这是"认祖归宗"的关键：确保数据关联到正确的 GitHub 账号
                        const normalizedUsername = githubUsername.toLowerCase().trim();
                        
                        // 【变量修正】统一使用 currentFp 变量
                        const currentFp = window.fpId || localStorage.getItem('user_fingerprint') || await getCurrentFingerprint();
                        
                        console.log('[Auth] 🔗 使用 GitHub User ID 执行 upsert 操作，id =', githubUserId.substring(0, 8) + '...');
                        
                        // 首先尝试根据 user_id 查找现有用户
                        const { data: existingUserById, error: findByIdError } = await supabaseClient
                            .from('v_unified_analysis_v2')
                            .select('*')
                            .eq('id', githubUserId)
                            .maybeSingle();
                        
                        let updatedUser = null;
                        
                        if (existingUserById) {
                            // 用户已存在（通过 user_id），更新用户信息
                            console.log('[Auth] ✅ 找到现有用户（通过 user_id），更新用户信息');
                            
                            const updatePayload = {
                                user_name: normalizedUsername,
                                user_identity: 'github',
                                updated_at: new Date().toISOString()
                            };
                            
                            // 如果有 fingerprint，也更新（但不作为主要标识）
                            if (currentFp) {
                                updatePayload.fingerprint = currentFp;
                            }
                            
                            const { data: updateData, error: updateError } = await supabaseClient
                                .from('user_analysis')
                                .update(updatePayload)
                                .eq('id', githubUserId) // 【关键】使用 user_id 而不是 fingerprint
                                .select()
                                .single();
                            
                            if (updateError) {
                                console.error('[Auth] ❌ 更新用户失败:', updateError);
                                // 即使更新失败，也继续使用现有用户数据
                                updatedUser = { ...existingUserById, ...updatePayload };
                            } else {
                                updatedUser = updateData;
                                console.log('[Auth] ✅ 用户信息已成功更新（使用 user_id）');
                            }
                        } else {
                            // 用户不存在，创建新记录（使用 GitHub User ID）
                            console.log('[Auth] ✅ 用户不存在，创建新记录（使用 GitHub User ID）');
                            
                            const newUserData = {
                                id: githubUserId, // 【关键】使用 GitHub User ID
                                user_name: normalizedUsername,
                                user_identity: 'github', // 明确设置身份
                                fingerprint: currentFp || null, // 可选：如果有 fingerprint 也保存
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                            
                            const { data: insertData, error: insertError } = await supabaseClient
                                .from('user_analysis')
                                .insert([newUserData])
                                .select()
                                .single();
                            
                            if (insertError) {
                                console.error('[Auth] ❌ 创建用户失败:', insertError);
                                
                                // 【RLS 错误处理】如果是 RLS 策略错误，尝试使用 upsert
                                if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
                                    console.log('[Auth] 🔄 RLS 策略阻止插入，尝试使用 upsert...');
                                    
                                    const { data: upsertData, error: upsertError } = await supabaseClient
                                        .from('user_analysis')
                                        .upsert([newUserData], { onConflict: 'id' })
                                        .select()
                                        .single();
                                    
                                    if (upsertError) {
                                        console.error('[Auth] ❌ Upsert 也失败:', upsertError);
                                        // 即使失败，也继续使用新用户数据
                                        updatedUser = newUserData;
                                    } else {
                                        updatedUser = upsertData;
                                        console.log('[Auth] ✅ 通过 upsert 创建用户成功');
                                    }
                                } else {
                                    // 其他错误，继续使用新用户数据
                                    updatedUser = newUserData;
                                }
                            } else {
                                updatedUser = insertData;
                                console.log('[Auth] ✅ 新用户已创建（使用 GitHub User ID）');
                            }
                        }
                        
                        // 更新 window.allData（在 window.currentUser 赋值之后）
                        const allData = window.allData || [];
                        const index = allData.findIndex(item => 
                            item.id === updatedUser.id ||
                            (item.fingerprint && item.fingerprint === currentFp) ||
                            (item.user_name && item.user_name.toLowerCase() === normalizedUsername)
                        );
                        
                        if (index !== -1) {
                            allData[index] = { ...allData[index], ...updatedUser };
                        } else {
                            allData.push(updatedUser);
                        }
                        window.allData = allData;
                        
                        // 【关键修复】使用合并后的记录作为 currentUser，确保左侧抽屉能显示 allData 中已有的维度/人格/箴言等完整数据（而非仅 upsert 返回的简略字段）
                        window.currentUser = (index !== -1) ? allData[index] : updatedUser;
                        window.currentUserMatchedByFingerprint = true;
                        
                        // 【Task 1】清除本地的 user_fingerprint 缓存，统一使用 Supabase User ID
                        localStorage.removeItem('user_fingerprint');
                        console.log('[Auth] ✅ 已清除本地 fingerprint 缓存');
                        
                        // 【Task 1】如果当前用户是新注册的（dimensions 为 null），立即触发一次静默分析请求
                        const hasDimensions = updatedUser.dimensions || 
                                            updatedUser.l_score !== null || 
                                            updatedUser.p_score !== null ||
                                            updatedUser.d_score !== null ||
                                            updatedUser.e_score !== null ||
                                            updatedUser.f_score !== null;
                        
                        if (!hasDimensions || 
                            (updatedUser.l_score === 50 && updatedUser.p_score === 50 && 
                             updatedUser.d_score === 50 && updatedUser.e_score === 50 && updatedUser.f_score === 50)) {
                            console.log('[Auth] 🔍 检测到新用户（dimensions 为空或为默认值），触发静默分析...');
                            
                            // 尝试从 localStorage 获取最后一次分析数据
                            try {
                                const lastAnalysisData = localStorage.getItem('last_analysis_data');
                                if (lastAnalysisData) {
                                    const analysisData = JSON.parse(lastAnalysisData);
                                    console.log('[Auth] 📊 找到本地缓存的最后一次分析数据，准备同步...');
                                    
                                    // 调用后端分析接口同步数据
                                    if (analysisData.chatData && analysisData.chatData.length > 0) {
                                        try {
                                            // 【关键修复】对齐 index.html 提交链路：使用 /api/v2/analyze（会按 OAuth user_id 正确 upsert）
                                            const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || 
                                                              'https://cursor-clinical-analysis.psterman.workers.dev/';
                                            const analyzeUrl = `${apiEndpoint}api/v2/analyze`;
                                            
                                            // 兼容：若 last_analysis_data 里没有 lang/fingerprint，这里补齐
                                            const safeLang = (analysisData && analysisData.lang) ? analysisData.lang : (localStorage.getItem('appLanguage') || 'zh-CN');
                                            const safeFp = currentFp || (analysisData && analysisData.fingerprint) || null;
                                            
                                            // 如果没有 chatData（可能因 localStorage 容量限制被降级），则只做本地回填，不发请求
                                            if (!analysisData.chatData || !Array.isArray(analysisData.chatData) || analysisData.chatData.length === 0) {
                                                console.warn('[Auth] ⚠️ last_analysis_data.chatData 缺失，跳过静默同步，改为本地回填');
                                                
                                                // 用本地缓存的维度/统计回填，避免一直显示默认 50
                                                try {
                                                    const cachedDims = analysisData.dimensions || null;
                                                    const cachedStats = analysisData.stats || null;
                                                    const patched = { ...updatedUser };
                                                    if (cachedDims) patched.dimensions = cachedDims;
                                                    if (cachedStats) patched.stats = cachedStats;
                                                    window.currentUser = patched;
                                                    
                                                    const allData2 = window.allData || [];
                                                    const userIndex2 = allData2.findIndex(item => item.id === patched.id);
                                                    if (userIndex2 !== -1) allData2[userIndex2] = { ...allData2[userIndex2], ...patched };
                                                    else allData2.push(patched);
                                                    window.allData = allData2;
                                                    
                                                    if (typeof window.refreshUserStats === 'function') {
                                                        try { await window.refreshUserStats(); } catch { /* ignore */ }
                                                    }
                                                } catch { /* ignore */ }
                                                return;
                                            }
                                            
                                            const analyzeResponse = await fetch(analyzeUrl, {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${session.access_token}`
                                                },
                                                body: JSON.stringify({
                                                    ...analysisData,
                                                    // /api/v2/analyze 识别用户名字段为 userName（驼峰）
                                                    userName: normalizedUsername,
                                                    lang: safeLang,
                                                    fingerprint: safeFp
                                                })
                                            });
                                            
                                            if (analyzeResponse.ok) {
                                                const analyzeResult = await analyzeResponse.json();
                                                console.log('[Auth] ✅ 静默分析同步成功:', analyzeResult);
                                                
                                                // 【强制固化存储】保存 claim_token 到 localStorage
                                                if (analyzeResult.claim_token) {
                                                    localStorage.setItem('vibe_claim_token', analyzeResult.claim_token);
                                                    console.log('[Auth] 🔑 影子令牌已保存到本地:', analyzeResult.claim_token.substring(0, 8) + '...');
                                                }
                                                
                                                // 更新 updatedUser 数据
                                                if (analyzeResult.dimensions) {
                                                    updatedUser = { ...updatedUser, ...analyzeResult };
                                                    window.currentUser = updatedUser;
                                                    
                                                    // 更新 allData
                                                    const allData = window.allData || [];
                                                    const userIndex = allData.findIndex(item => item.id === updatedUser.id);
                                                    if (userIndex !== -1) {
                                                        allData[userIndex] = updatedUser;
                                                    } else {
                                                        allData.push(updatedUser);
                                                    }
                                                    window.allData = allData;
                                                    
                                                    // 【静默刷新】触发页面数值刷新
                                                    if (typeof window.refreshUserStats === 'function') {
                                                        try {
                                                            await window.refreshUserStats();
                                                            console.log('[Auth] ✅ 静默刷新完成');
                                                        } catch (refreshError) {
                                                            console.warn('[Auth] ⚠️ 静默刷新失败:', refreshError);
                                                        }
                                                    }
                                                }
                                            } else {
                                                console.warn('[Auth] ⚠️ 静默分析同步失败:', await analyzeResponse.text());
                                            }
                                        } catch (analyzeError) {
                                            console.warn('[Auth] ⚠️ 静默分析同步异常:', analyzeError);
                                        }
                                    }
                                } else {
                                    console.log('[Auth] ℹ️ 未找到本地缓存的最后一次分析数据');
                                }
                            } catch (e) {
                                console.warn('[Auth] ⚠️ 读取本地分析数据失败:', e);
                            }
                        }
                        
                        // 【顺序重组】Step B: 调用 autoReportSelf（上报当前地理位置，确保 GitHub 账号有了 lat/lng）
                        console.log('[Auth] 🔄 Step B: 开始上报地理位置...');
                        try {
                            const reportResult = await autoReportSelf();
                            if (reportResult.success) {
                                console.log('[Auth] ✅ Step B: 地理位置上报成功');
                            } else {
                                console.warn('[Auth] ⚠️ Step B: 地理位置上报失败:', reportResult.error);
                            }
                        } catch (reportError) {
                            console.error('[Auth] ❌ Step B: 地理位置上报异常:', reportError);
                        }
                        
                        // 【顺序重组】Step C: 最后调用 window.refreshUserStats() 刷新视图数据
                        console.log('[Auth] 🔄 Step C: 开始刷新用户统计数据...');
                        if (typeof window.refreshUserStats === 'function') {
                            try {
                                await window.refreshUserStats();
                                console.log('[Auth] ✅ Step C: refreshUserStats 执行完成');
                            } catch (refreshError) {
                                // 【修复 AbortError】特殊处理 AbortError
                                if (refreshError.name === 'AbortError' || refreshError.message?.includes('aborted')) {
                                    console.log('[Auth] ℹ️ refreshUserStats 被取消（可能是页面刷新导致）');
                                } else {
                                    console.error('[Auth] ❌ Step C: refreshUserStats 执行失败:', refreshError);
                                }
                            }
                            
                            // 【关键修复】确保 refreshUserStats 后，window.currentUser 已正确设置
                            // 如果 refreshUserStats 没有设置 currentUser，使用 updatedUser
                            if (!window.currentUser && updatedUser) {
                                console.log('[Auth] 🔄 refreshUserStats 未设置 currentUser，使用 updatedUser');
                                window.currentUser = updatedUser;
                                
                                // 更新 allData
                                const allData = window.allData || [];
                                const userIndex = allData.findIndex(item => item.id === updatedUser.id);
                                if (userIndex !== -1) {
                                    allData[userIndex] = updatedUser;
                                } else {
                                    allData.push(updatedUser);
                                }
                                window.allData = allData;
                            }
                            
                            // 【关键修复】如果用户数据已存在但显示"数据同步中"，强制刷新统计卡片
                            if (window.currentUser) {
                                const leftDrawer = document.getElementById('left-drawer');
                                const leftBody = document.getElementById('left-drawer-body');
                                
                                if (leftBody && typeof renderUserStatsCards === 'function') {
                                    // 检查是否有"数据同步中"占位符
                                    const syncingCards = leftBody.querySelectorAll('.drawer-item');
                                    let hasSyncingCard = false;
                                    syncingCards.forEach(card => {
                                        const label = card.querySelector('.drawer-item-label');
                                        if (label && (label.textContent === '数据同步中' || label.textContent.includes('SYNCING'))) {
                                            hasSyncingCard = true;
                                        }
                                    });
                                    
                                    if (hasSyncingCard) {
                                        console.log('[Auth] 🔄 检测到"数据同步中"占位符，强制刷新统计卡片...');
                                        // 移除所有统计卡片（保留身份配置卡片）
                                        syncingCards.forEach(card => {
                                            const label = card.querySelector('.drawer-item-label');
                                            if (label && (label.textContent === '数据同步中' || label.textContent.includes('SYNCING') || label.textContent === '我的数据统计')) {
                                                card.remove();
                                            }
                                        });
                                        // 重新渲染用户统计卡片（优先使用 allData 中的完整记录）
                                        renderUserStatsCards(leftBody, getBestUserRecordForStats(window.currentUser));
                                        console.log('[Auth] ✅ 已强制刷新统计卡片');
                                    }
                                }
                                
                                // 刷新排名卡片
                                if (typeof renderRankCards === 'function') {
                                    renderRankCards(window.currentUser);
                                }
                            }
                        } else {
                            console.warn('[Auth] ⚠️ window.refreshUserStats 函数不存在');
                        }
                        
                        // 更新 UI（确保在数据加载完成后触发）
                        try {
                            updateAuthUI({ username: githubUsername, avatarUrl });
                            console.log('[Auth] ✅ UI 已更新为已登录状态');
                        } catch (uiError) {
                            console.error('[Auth] ❌ UI 更新失败:', uiError);
                        }
                        
                        // 触发地图定位脉冲（等待 window.allData 加载完成）
                        try {
                            // 确保 window.allData 已加载
                            if (!window.allData || window.allData.length === 0) {
                                console.log('[Auth] ⚠️ allData 未加载，等待数据加载完成...');
                                // 延迟执行，等待 fetchData 完成
                                setTimeout(async () => {
                                    try {
                                        const location = await getUserLocation();
                                        if (location && location.lat && location.lng && typeof triggerMapPulse === 'function') {
                                            const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                                            const pulseColor = statusConfig.status_color || '#00ff41';
                                            triggerMapPulse(location.lng, location.lat, githubUsername, pulseColor, avatarUrl, githubUsername);
                                            console.log('[Auth] ✅ 已触发地图脉冲（延迟）');
                                        }
                                    } catch (pulseError) {
                                        console.warn('[Auth] ⚠️ 触发地图脉冲失败（延迟）:', pulseError);
                                    }
                                }, 1000);
                            } else {
                                const location = await getUserLocation();
                                if (location && location.lat && location.lng && typeof triggerMapPulse === 'function') {
                                    const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                                    const pulseColor = statusConfig.status_color || '#00ff41';
                                    triggerMapPulse(location.lng, location.lat, githubUsername, pulseColor, avatarUrl, githubUsername);
                                    console.log('[Auth] ✅ 已触发地图脉冲');
                                }
                            }
                        } catch (pulseError) {
                            console.warn('[Auth] ⚠️ 触发地图脉冲失败:', pulseError);
                        }
                        
                        // 自动打开抽屉并显示统计卡片（等待 window.allData 加载完成）
                        try {
                            // 确保 window.allData 已加载
                            if (!window.allData || window.allData.length === 0) {
                                console.log('[Auth] ⚠️ allData 未加载，等待数据加载完成后再打开抽屉...');
                                // 延迟执行，等待 fetchData 完成
                                setTimeout(async () => {
                                    try {
                                        const location = await getUserLocation();
                                        const countryCode = location?.countryCode || updatedUser?.ip_location || null;
                                        const countryName = countryCode && countryNameMap[countryCode]
                                            ? (currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en)
                                            : (countryCode || '全球');
                                        
                                        if (countryCode && countryCode !== '全球') {
                                            showDrawersWithCountryData(countryCode, countryName);
                                            console.log('[Auth] ✅ 已打开抽屉并显示用户数据（延迟）');
                                        } else {
                                            const leftDrawer = document.getElementById('left-drawer');
                                            const leftBody = document.getElementById('left-drawer-body');
                                            if (leftDrawer && leftBody) {
                                                if (!leftDrawer.classList.contains('active')) {
                                                    leftDrawer.classList.add('active');
                                                    const rightDrawer = document.getElementById('right-drawer');
                                                    if (rightDrawer) {
                                                        rightDrawer.classList.add('active');
                                                    }
                                                }
                                                renderUserStatsCards(leftBody, getBestUserRecordForStats(updatedUser));
                                                console.log('[Auth] ✅ 已刷新用户统计卡片（延迟）');
                                            }
                                        }
                                    } catch (drawerError) {
                                        console.warn('[Auth] ⚠️ 打开抽屉失败（延迟）:', drawerError);
                                    }
                                }, 1000);
                            } else {
                                const location = await getUserLocation();
                                const countryCode = location?.countryCode || updatedUser?.ip_location || null;
                                const countryName = countryCode && countryNameMap[countryCode]
                                    ? (currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en)
                                    : (countryCode || '全球');
                                
                                if (countryCode && countryCode !== '全球') {
                                    showDrawersWithCountryData(countryCode, countryName);
                                    console.log('[Auth] ✅ 已打开抽屉并显示用户数据');
                                } else {
                                    const leftDrawer = document.getElementById('left-drawer');
                                    const leftBody = document.getElementById('left-drawer-body');
                                    if (leftDrawer && leftBody) {
                                        if (!leftDrawer.classList.contains('active')) {
                                            leftDrawer.classList.add('active');
                                            const rightDrawer = document.getElementById('right-drawer');
                                            if (rightDrawer) {
                                                rightDrawer.classList.add('active');
                                            }
                                        }
                                        renderUserStatsCards(leftBody, getBestUserRecordForStats(updatedUser));
                                        console.log('[Auth] ✅ 已刷新用户统计卡片');
                                    }
                                }
                            }
                        } catch (drawerError) {
                            console.warn('[Auth] ⚠️ 打开抽屉失败:', drawerError);
                        }
                        
                        // 刷新排名卡片（确保在数据加载完成后）
                        try {
                            if (window.currentUser) {
                                renderRankCards(window.currentUser);
                                console.log('[Auth] ✅ 已刷新排名卡片');
                            }
                        } catch (rankError) {
                            console.warn('[Auth] ⚠️ 刷新排名卡片失败:', rankError);
                        }
                    }
                } else {
                    // 未登录状态
                    updateAuthUI(null);
                }
            } catch (error) {
                console.error('[Auth] ❌ 处理认证状态变化失败:', error);
                updateAuthUI(null);
            } finally {
                // 【异步流保护】在 finally 块中必须调用 hideSyncingOverlay()，确保无论成功失败，UI 遮罩都能消失
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                }
                hideSyncingOverlay();
                migrationCompleted = true;
            }
        }
        
        /**
         * 更新认证 UI（登录按钮/用户信息显示）
         * @param {Object|null} userInfo - 用户信息对象 { username, avatarUrl } 或 null
         */
        function updateAuthUI(userInfo) {
            // 查找认证 UI 容器（可能在多个位置）
            const authContainers = [
                document.getElementById('auth-container'),
                document.querySelector('.auth-container'),
                document.querySelector('[data-auth-container]')
            ].filter(Boolean);
            
            // 如果没有专门的容器，在左侧抽屉中更新
            const leftBody = document.getElementById('left-drawer-body');
            const identityCard = leftBody ? leftBody.querySelector('.drawer-item:first-child') : null;
            
            if (userInfo) {
                // 已登录状态：显示用户信息
                console.log('[Auth] ✅ 更新 UI 为已登录状态:', userInfo.username);
                
                    // 更新左侧抽屉中的身份卡片
                const leftBody = document.getElementById('left-drawer-body');
                if (leftBody) {
                    const identityCard = leftBody.querySelector('.drawer-item:first-child');
                    if (identityCard) {
                        const userInfoSection = identityCard.querySelector('.mb-3.pb-3.border-b');
                        const loginSection = identityCard.querySelector('#auth-login-section') || 
                                            identityCard.querySelector('.mt-3.pt-3.border-t');
                        
                        if (userInfoSection) {
                            // ✅ 简约：只更新现有区域里的 avatar / name / label，不再重建 DOM（避免重复头像/姓名）
                            try {
                                const img = userInfoSection.querySelector('img');
                                if (img) img.src = userInfo.avatarUrl || DEFAULT_AVATAR;
                                const nameEl = userInfoSection.querySelector('.drawer-item-value');
                                if (nameEl) nameEl.textContent = userInfo.username || '';
                                const labelEl = userInfoSection.querySelector('.drawer-item-desc');
                                if (labelEl) labelEl.textContent = 'GitHub ID';
                                const link = userInfoSection.querySelector('a[href*="github.com/"]');
                                if (link) link.href = `https://github.com/${userInfo.username}`;
                            } catch { /* ignore */ }
                        }
                        
                        // 更新登录区域
                        if (loginSection) {
                            // ✅ 已登录：登录区保持为空（身份区已含退出/链接）
                            loginSection.innerHTML = '';
                            try { loginSection.style.display = 'none'; } catch { /* ignore */ }
                        }
                    }
                }
            } else {
                // 未登录状态：显示登录按钮
                console.log('[Auth] ✅ 更新 UI 为未登录状态');
                
                // 更新左侧抽屉中的身份卡片
                const leftBody = document.getElementById('left-drawer-body');
                if (leftBody) {
                    const identityCard = leftBody.querySelector('.drawer-item:first-child');
                    if (identityCard) {
                        const userInfoSection = identityCard.querySelector('.mb-3.pb-3.border-b');
                        const loginSection = identityCard.querySelector('#auth-login-section') || 
                                            identityCard.querySelector('.mt-3.pt-3.border-t');
                        
                        if (userInfoSection) {
                            // ✅ 简约：不重建 DOM，避免重复块；仅将用户名置空并恢复默认头像
                            try {
                                const img = userInfoSection.querySelector('img');
                                if (img) img.src = DEFAULT_AVATAR;
                                const nameEl = userInfoSection.querySelector('.drawer-item-value');
                                if (nameEl) nameEl.textContent = '未登录';
                                const labelEl = userInfoSection.querySelector('.drawer-item-desc');
                                if (labelEl) labelEl.textContent = '请使用 GitHub 登录';
                                const link = userInfoSection.querySelector('a[href*="github.com/"]');
                                if (link) link.remove();
                            } catch { /* ignore */ }
                        }
                        
                        // 替换登录输入框为登录按钮
                        if (loginSection) {
                            try { loginSection.style.display = ''; } catch { /* ignore */ }
                            loginSection.innerHTML = `
                                <div class="drawer-item-label mb-2">GitHub 登录</div>
                                <button 
                                    onclick="loginWithGitHub()"
                                    class="w-full px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] border border-[#444d56] rounded-md text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
                                >
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path>
                                    </svg>
                                    <span>使用 GitHub 登录</span>
                                </button>
                                <div class="text-[8px] text-[#00ff41]/40 mt-2 text-center">
                                    安全、快速、一键登录
                                </div>
                            `;
                        }
                    }
                }
            }
        }
        
        /**
         * 获取当前浏览器指纹（与页面加载时生成逻辑一致）
         * @returns {Promise<string>} 指纹字符串
         */
        async function getCurrentFingerprint() {
            try {
                // 先尝试从 localStorage 读取
                let fingerprint = localStorage.getItem('user_fingerprint');
                
                if (!fingerprint) {
                    // 如果不存在，生成新的指纹（与 window.onload 中的逻辑一致）
                    const deviceInfo = {
                        userAgent: navigator.userAgent || '',
                        language: navigator.language || '',
                        platform: navigator.platform || '',
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
                    };
                    const deviceString = JSON.stringify(deviceInfo);
                    const msgUint8 = new TextEncoder().encode(deviceString);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
                    fingerprint = Array.from(new Uint8Array(hashBuffer))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                    
                    try {
                        localStorage.setItem('user_fingerprint', fingerprint);
                        console.log('[Fingerprint] 🔑 已生成设备 Fingerprint:', fingerprint.substring(0, 8) + '...');
                    } catch (e) {
                        console.warn('[Fingerprint] ⚠️ 保存 Fingerprint 到 localStorage 失败:', e);
                    }
                }
                
                return fingerprint;
            } catch (error) {
                console.error('[Fingerprint] ❌ 获取指纹失败:', error);
                return null;
            }
        }

        /**
         * 保存GitHub用户名到localStorage并绑定指纹
         * 使用 Supabase 客户端直接更新 fingerprint 字段
         * 【增强版】包含鲁棒的元素获取、强制指纹绑定、UI状态联动
         */
        async function saveGitHubUsername() {
            // ============================================
            // 1. 鲁棒的元素获取（多重选择器）
            // ============================================
            let input = null;
            let saveButton = null;
            
            // 尝试多种方式获取输入框（支持主输入框和抽屉输入框）
            input = document.getElementById('githubUsername') ||
                   document.getElementById('drawer-github-username') ||
                   document.querySelector('#githubUsername') ||
                   document.querySelector('#drawer-github-username') ||
                   document.querySelector('input[id="githubUsername"]') ||
                   document.querySelector('input[id="drawer-github-username"]') ||
                   document.querySelector('input[placeholder*="GitHub"]') ||
                   document.querySelector('input[placeholder*="github"]');
            
            // 如果找到抽屉输入框，同步到主输入框
            if (input && input.id === 'drawer-github-username') {
                const mainInput = document.getElementById('githubUsername');
                if (mainInput) {
                    mainInput.value = input.value;
                    console.log('[GitHub] ✅ 已同步抽屉输入框到主输入框');
                }
            }
            
            // 尝试获取保存按钮（用于显示 Loading 状态）
            saveButton = document.querySelector('button[onclick*="saveGitHubUsername"]') ||
                        document.querySelector('button:has-text("保存")') ||
                        document.querySelector('.drawer-item button');
            
            // 如果找不到输入框，打印详细的 DOM 结构警告
            if (!input) {
                console.error('[GitHub] ❌ 找不到 GitHub 输入框元素');
                console.warn('[GitHub] 🔍 DOM 结构诊断:', {
                    hasGetElementById: typeof document.getElementById === 'function',
                    allInputs: Array.from(document.querySelectorAll('input')).map(el => ({
                        id: el.id,
                        name: el.name,
                        placeholder: el.placeholder,
                        type: el.type
                    })),
                    bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'body 不存在'
                });
                alert('无法找到 GitHub 输入框，请刷新页面后重试');
                return;
            }
            
            // ============================================
            // 2. 获取用户名并验证
            // ============================================
            const username = input.value.trim();
            if (username === '') {
                // 如果输入为空，清除localStorage
                localStorage.removeItem('github_username');
                console.log('[GitHub] ✅ 已清除GitHub用户名');
                alert('已清除GitHub用户名');
                return;
            }
            
            // 验证 GitHub 用户名格式
            if (!isValidGitHubUsername(username)) {
                alert('GitHub 用户名格式不正确，请检查后重试');
                return;
            }
            
            // ============================================
            // 3. 显示 Loading 状态
            // ============================================
            const originalButtonText = saveButton ? saveButton.textContent : '';
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = '保存中...';
                saveButton.style.opacity = '0.6';
            }
            
            try {
                // ============================================
                // 4. 强制指纹绑定流（在 localStorage 更新之前完成）
                // ============================================
                
                // 4.1 获取当前指纹（使用统一的指纹生成函数）
                const currentFingerprint = await getCurrentFingerprint();
                
                if (!currentFingerprint) {
                    console.warn('[GitHub] ⚠️ 未找到指纹，无法绑定');
                    alert('未找到设备指纹，请刷新页面后重试');
                    return;
                }
                
                console.log('[GitHub] 🔑 当前指纹:', currentFingerprint.substring(0, 8) + '...');
                
                // 4.2 检查 Supabase 客户端
                if (!supabaseClient) {
                    console.error('[GitHub] ❌ Supabase 客户端未初始化');
                    alert('数据库连接未就绪，请稍候再试');
                    return;
                }
                
                // 4.3 规范化用户名（小写）
                const normalizedUsername = username.toLowerCase().trim();
                
                console.log('[GitHub] 🔗 开始绑定指纹到 user_name:', normalizedUsername);
                
                // 【关键修复】登录后必须使用 user_id 进行所有操作，而不是 fingerprint 或 user_name
                // 这是"认祖归宗"的关键：确保数据关联到正确的 GitHub 账号
                let authenticatedUserId = null;
                let authenticatedSession = null;
                
                try {
                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                    if (!sessionError && session && session.user) {
                        authenticatedUserId = session.user.id;
                        authenticatedSession = session;
                        console.log('[GitHub] ✅ 检测到已登录用户，user_id:', authenticatedUserId.substring(0, 8) + '...');
                    }
                } catch (authError) {
                    console.warn('[GitHub] ⚠️ 检查登录状态失败:', authError);
                }
                
                let updatedUser = null;
                
                // 【关键修复】如果已登录，必须使用 user_id 进行更新
                if (authenticatedUserId) {
                    console.log('[GitHub] 🔗 已登录，使用 user_id 进行更新（认祖归宗）:', authenticatedUserId.substring(0, 8) + '...');
                    
                    // 首先尝试根据 user_id 查找现有用户
                    const { data: existingUserById, error: findByIdError } = await supabaseClient
                        .from('v_unified_analysis_v2')
                        .select('*')
                        .eq('id', authenticatedUserId)
                        .maybeSingle();
                    
                    if (findByIdError && findByIdError.code !== 'PGRST116') {
                        console.error('[GitHub] ❌ 查询用户失败:', findByIdError);
                        throw new Error(`查询失败: ${findByIdError.message}`);
                    }
                    
                    // 执行更新（使用 user_id）
                    const updatePayload = {
                        user_name: normalizedUsername,
                        user_identity: 'github',
                        fingerprint: currentFingerprint, // 可选：保存 fingerprint 作为备用
                        updated_at: new Date().toISOString()
                    };
                    
                    const { data, error: updateError } = await supabaseClient
                        .from('user_analysis')
                        .update(updatePayload)
                        .eq('id', authenticatedUserId) // 【关键】使用 user_id 而不是 user_name
                        .select()
                        .single();
                    
                    if (updateError) {
                        console.error('[GitHub] ❌ 更新用户失败:', updateError);
                        
                        // 如果更新失败，尝试使用 upsert
                        if (updateError.code === '42501' || updateError.message?.includes('row-level security')) {
                            console.log('[GitHub] 🔄 RLS 策略阻止更新，尝试使用 upsert...');
                            
                            const upsertPayload = {
                                id: authenticatedUserId,
                                user_name: normalizedUsername,
                                user_identity: 'github',
                                fingerprint: currentFingerprint,
                                updated_at: new Date().toISOString()
                            };
                            
                            const { data: upsertData, error: upsertError } = await supabaseClient
                                .from('user_analysis')
                                .upsert([upsertPayload], { onConflict: 'id' })
                                .select()
                                .single();
                            
                            if (upsertError) {
                                console.error('[GitHub] ❌ Upsert 也失败:', upsertError);
                                throw new Error(`更新失败: ${upsertError.message}`);
                            } else {
                                updatedUser = upsertData;
                                console.log('[GitHub] ✅ 通过 upsert 更新用户成功（使用 user_id）');
                            }
                        } else {
                            throw new Error(`更新失败: ${updateError.message}`);
                        }
                    } else {
                        updatedUser = data;
                        console.log('[GitHub] ✅ 用户信息已成功更新（使用 user_id）');
                    }
                } else {
                    // 【降级方案】未登录时，使用 user_name 进行更新（兼容旧逻辑）
                    console.log('[GitHub] ⚠️ 未登录，使用 user_name 进行更新（降级方案）');
                    
                    // 4.4 首先尝试根据 user_name 查找现有用户
                    // 【Task 2】查询时使用统一视图
                    const { data: existingUser, error: findError } = await supabaseClient
                        .from('v_unified_analysis_v2')
                        .select('*')
                        // GitHub 用户名大小写不敏感：避免 user_name 大小写不一致导致查不到
                        .ilike('user_name', normalizedUsername)
                        .maybeSingle();
                    
                    if (findError && findError.code !== 'PGRST116') { // PGRST116 表示未找到记录，这是正常的
                        console.error('[GitHub] ❌ 查询用户失败:', findError);
                        throw new Error(`查询失败: ${findError.message}`);
                    }
                    
                    // 4.5 执行 UPSERT 操作（更新或创建）
                    if (existingUser) {
                        // 用户已存在，更新 fingerprint 字段
                        console.log('[GitHub] ✅ 找到现有用户，更新 fingerprint 字段');
                        
                        // 【修复】只使用 user_name 字段，不使用 github_username
                        const { data, error: updateError } = await supabaseClient
                                .from('user_analysis')
                                .update({
                                    fingerprint: currentFingerprint,
                                    user_name: normalizedUsername,
                                    updated_at: new Date().toISOString()
                                })
                                // GitHub 用户名大小写不敏感：避免 user_name 大小写不一致导致更新不到
                                .ilike('user_name', normalizedUsername)
                                .select()
                                .single();
                        
                        if (updateError) {
                            console.error('[GitHub] ❌ 更新用户失败:', updateError);
                            throw new Error(`更新失败: ${updateError.message}`);
                        }
                        
                        updatedUser = data;
                        console.log('[GitHub] ✅ 指纹已成功更新到数据库');
                    } else {
                        // 用户不存在，创建新记录
                        console.log('[GitHub] ✅ 用户不存在，创建新记录');
                        
                        // 【修复】只使用 user_name 字段，不使用 github_username
                        const newUserData = {
                            id: crypto.randomUUID(),
                            user_name: normalizedUsername,
                            fingerprint: currentFingerprint,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        
                        const { data, error: insertError } = await supabaseClient
                            .from('user_analysis')
                            .insert([newUserData])
                            .select()
                            .single();
                        
                        if (insertError) {
                            console.error('[GitHub] ❌ 创建用户失败:', insertError);
                            throw new Error(`创建失败: ${insertError.message}`);
                        }
                        
                        updatedUser = data;
                        console.log('[GitHub] ✅ 新用户已创建，指纹已绑定');
                    }
                }
                
                // ============================================
                // 5. 更新 localStorage（在数据库更新成功后）
                // ============================================
                localStorage.setItem('github_username', username);
                console.log('[GitHub] ✅ 已保存GitHub用户名到 localStorage:', username);
                
                // ============================================
                // 6. UI 状态联动（地图与卡片）
                // ============================================
                console.log('[GitHub] 🔄 开始刷新全局数据和 UI...');
                
                // 6.1 更新全局用户数据
                window.currentUser = updatedUser;
                window.currentUserMatchedByFingerprint = true;
                
                // 6.2 更新 window.allData 中的对应记录
                const allData = window.allData || [];
                const index = allData.findIndex(item => 
                    item.id === updatedUser.id ||
                    (item.fingerprint && item.fingerprint === currentFingerprint) ||
                    (item.user_name && item.user_name.toLowerCase() === normalizedUsername)
                );
                
                if (index !== -1) {
                    allData[index] = { ...allData[index], ...updatedUser };
                    console.log('[GitHub] ✅ 已更新 allData 中的记录，索引:', index);
                } else {
                    allData.push(updatedUser);
                    console.log('[GitHub] ✅ 已添加新记录到 allData');
                }
                window.allData = allData;
                
                // 6.3 刷新排名卡片
                if (window.currentUser) {
                    renderRankCards(window.currentUser);
                    console.log('[GitHub] ✅ 已刷新排名卡片');
                }
                
                // 6.4 触发地图脉冲（如果用户有地理位置信息）
                try {
                    // 获取用户地理位置（无论数据库中是否有，都尝试获取当前位置）
                    const location = await getUserLocation();
                    if (location && location.lat && location.lng && typeof triggerMapPulse === 'function') {
                        const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                        const pulseColor = statusConfig.status_color || '#00ff41';
                        const pulseLabel = normalizedUsername;
                        const avatarUrl = getGitHubAvatarUrl(normalizedUsername);
                        
                        triggerMapPulse(location.lng, location.lat, pulseLabel, pulseColor, avatarUrl, normalizedUsername);
                        console.log('[GitHub] ✅ 已触发地图脉冲:', {
                            lng: location.lng,
                            lat: location.lat,
                            label: pulseLabel,
                            color: pulseColor
                        });
                    } else if (!location || !location.lat || !location.lng) {
                        console.log('[GitHub] ℹ️ 无法获取地理位置，跳过地图脉冲');
                    }
                } catch (pulseError) {
                    console.warn('[GitHub] ⚠️ 触发地图脉冲失败:', pulseError);
                }
                
                // 6.5 自动打开抽屉并显示用户统计卡片
                try {
                    // 获取用户的国家代码（从 ip_location 或 location，或从地理位置获取）
                    let userCountryCode = updatedUser.ip_location || updatedUser.location || null;
                    
                    // 如果没有国家代码，尝试从地理位置获取
                    if (!userCountryCode) {
                        try {
                            const location = await getUserLocation();
                            if (location && location.countryCode) {
                                userCountryCode = location.countryCode;
                                console.log('[GitHub] ✅ 从地理位置获取国家代码:', userCountryCode);
                            }
                        } catch (geoError) {
                            console.warn('[GitHub] ⚠️ 获取地理位置失败:', geoError);
                        }
                    }
                    
                    const userCountryName = userCountryCode && countryNameMap[userCountryCode]
                        ? (currentLang === 'zh' ? countryNameMap[userCountryCode].zh : countryNameMap[userCountryCode].en)
                        : (userCountryCode || '全球');
                    
                    // 获取抽屉元素
                    const leftDrawer = document.getElementById('left-drawer');
                    const leftBody = document.getElementById('left-drawer-body');
                    const rightDrawer = document.getElementById('right-drawer');
                    
                    if (userCountryCode && userCountryCode !== '全球') {
                        // 如果有国家代码，打开抽屉并显示用户数据
                        showDrawersWithCountryData(userCountryCode, userCountryName);
                        console.log('[GitHub] ✅ 已打开抽屉并显示用户数据:', userCountryCode);
                    } else {
                        // 如果没有国家代码，直接刷新左侧抽屉的统计卡片
                        // 如果抽屉未打开，先打开它
                        if (leftDrawer && !leftDrawer.classList.contains('active')) {
                            leftDrawer.classList.add('active');
                            if (rightDrawer) {
                                rightDrawer.classList.add('active');
                            }
                            console.log('[GitHub] ✅ 已打开抽屉');
                        }
                        
                        // 刷新统计卡片
                        if (leftBody) {
                            // 移除等待卡片（如果存在）
                            const waitingCards = leftBody.querySelectorAll('.drawer-item');
                            waitingCards.forEach(card => {
                                const label = card.querySelector('.drawer-item-label');
                                if (label && (label.textContent === '数据加载中' || label.textContent.includes('WAIT'))) {
                                    card.remove();
                                    console.log('[GitHub] ✅ 已移除等待卡片');
                                }
                            });
                            
                            // 渲染用户统计卡片（优先使用 allData 中的完整记录）
                            renderUserStatsCards(leftBody, getBestUserRecordForStats(updatedUser));
                            console.log('[GitHub] ✅ 已刷新用户统计卡片');
                        }
                    }
                } catch (drawerError) {
                    console.warn('[GitHub] ⚠️ 打开抽屉失败:', drawerError);
                }
                
                // 6.6 修复"匿名专家"显示问题：更新所有显示用户名的 UI 元素
                try {
                    // 更新左侧抽屉中的显示名称
                    const leftTitle = document.getElementById('left-drawer-title');
                    if (leftTitle) {
                        const currentTitle = leftTitle.textContent || '';
                        if (!currentTitle.includes(normalizedUsername)) {
                            // 移除"当前设备/This Device"标识（如果存在），然后添加新的（按语言）
                            const cleanTitle = currentTitle
                                .replace(/\s*（当前设备）\s*$/g, '')
                                .replace(/\s*\(This Device\)\s*$/gi, '')
                                .trim();
                            const suffix = getI18nText('common.current_device') || (currentLang === 'en' ? ' (This Device)' : '（当前设备）');
                            leftTitle.textContent = (cleanTitle && cleanTitle.includes(normalizedUsername) ? cleanTitle : normalizedUsername) + suffix;
                            console.log('[GitHub] ✅ 已更新抽屉标题:', leftTitle.textContent);
                        }
                    }
                    
                    // 更新所有显示"匿名专家"的元素（更精确的匹配）
                    const fingerprintPrefix = currentFingerprint.substring(0, 6).toUpperCase();
                    const anonymousPattern = new RegExp(`匿名专家\\s+${fingerprintPrefix}`, 'i');
                    
                    // 查找所有可能包含"匿名专家"的元素
                    const allElements = document.querySelectorAll('*');
                    let updateCount = 0;
                    
                    allElements.forEach(el => {
                        // 跳过 script 和 style 标签
                        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
                            return;
                        }
                        
                        // 检查文本内容
                        if (el.textContent && anonymousPattern.test(el.textContent)) {
                            el.textContent = el.textContent.replace(anonymousPattern, normalizedUsername);
                            updateCount++;
                        }
                        
                        // 检查属性值（如 placeholder, title 等）
                        Array.from(el.attributes || []).forEach(attr => {
                            if (attr.value && anonymousPattern.test(attr.value)) {
                                el.setAttribute(attr.name, attr.value.replace(anonymousPattern, normalizedUsername));
                                updateCount++;
                            }
                        });
                    });
                    
                    if (updateCount > 0) {
                        console.log('[GitHub] ✅ 已更新', updateCount, '个"匿名专家"显示');
                    }
                    
                    // 强制刷新排名卡片中的用户名显示
                    setTimeout(() => {
                        if (window.currentUser) {
                            renderRankCards(window.currentUser);
                            console.log('[GitHub] ✅ 已强制刷新排名卡片（修复匿名专家显示）');
                        }
                    }, 100);
                    
                } catch (updateError) {
                    console.warn('[GitHub] ⚠️ 更新匿名专家显示失败:', updateError);
                }
                
                // 6.7 更新头像显示
                updateGitHubAvatar();
                
                // 6.8 如果Presence频道已连接，立即同步状态
                if (presenceChannel) {
                    syncPresenceState().then(() => {
                        console.log('[GitHub] ✅ 已更新在线状态（包含新头像）');
                    }).catch((err) => {
                        console.warn('[GitHub] ⚠️ 更新在线状态失败:', err);
                    });
                }
                
                // 6.9 显示成功提示（清理旧的指纹匹配报错）
                console.log('[GitHub] 🎉 绑定流程全部完成！');
                alert('✅ GitHub用户名已保存并绑定成功！\n\n' +
                      '• 指纹已更新到数据库\n' +
                      '• 地图脉冲已触发\n' +
                      '• 统计卡片已刷新\n' +
                      '• 用户名已更新');
                
            } catch (error) {
                const errorMessage = error && typeof error === 'object' && 'message' in error 
                    ? error.message 
                    : (typeof error === 'string' ? error : '未知错误');
                console.error('[GitHub] ❌ 绑定指纹失败:', error);
                alert(`绑定失败: ${errorMessage}\n\n请检查：\n1. Supabase RLS 策略是否允许更新\n2. 网络连接是否正常\n3. 浏览器控制台查看详细错误`);
            } finally {
                // 恢复按钮状态
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.textContent = originalButtonText || '保存';
                    saveButton.style.opacity = '1';
                }
            }
        }

        /**
         * 从localStorage加载GitHub用户名并填充到输入框
         */
        /**
         * 更新GitHub头像显示
         */
        function updateGitHubAvatar() {
            const input = document.getElementById('githubUsername');
            const avatarContainer = document.getElementById('githubAvatarContainer');
            const avatarImg = document.getElementById('githubAvatarImg');
            
            if (!input || !avatarContainer || !avatarImg) {
                return;
            }
            
            const username = input.value.trim();
            
            if (username && isValidGitHubUsername(username)) {
                // 显示头像容器
                avatarContainer.classList.remove('hidden');
                // 设置头像URL
                const avatarUrl = getGitHubAvatarUrl(username);
                avatarImg.src = avatarUrl;
                console.log('[GitHub] ✅ 已更新头像:', avatarUrl);
            } else {
                // 隐藏头像容器
                avatarContainer.classList.add('hidden');
            }
        }

        function loadGitHubUsername() {
            const input = document.getElementById('githubUsername');
            if (!input) {
                return;
            }
            
            const savedUsername = localStorage.getItem('github_username');
            if (savedUsername) {
                input.value = savedUsername;
                console.log('[GitHub] ✅ 已加载保存的GitHub用户名:', savedUsername);
                // 加载头像
                updateGitHubAvatar();
            }
        }

        /**
         * 获取用户系统特征（异步非阻塞）
         * 用于数据采集端，获取 timezone 和 browser_lang
         * @returns {Promise<Object>} 包含 timezone, browser_lang 的对象
         */
        async function getUserSystemFeatures() {
            try {
                // 使用 requestIdleCallback 确保非阻塞，不影响页面加载速度
                return new Promise((resolve) => {
                    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
                    
                    schedule(() => {
                        // 获取时区：使用 Intl.DateTimeFormat().resolvedOptions().timeZone
                        let timezone = 'Unknown';
                        try {
                            const formatter = new Intl.DateTimeFormat();
                            const resolvedOptions = formatter.resolvedOptions();
                            timezone = resolvedOptions.timeZone || 'Unknown';
                        } catch (err) {
                            console.warn('[SystemFeatures] ⚠️ 获取时区失败:', err);
                            timezone = 'Unknown';
                        }

                        // 获取浏览器语言：使用 navigator.language
                        const browser_lang = navigator.language || navigator.userLanguage || 'Unknown';

                        resolve({
                            timezone,
                            browser_lang
                        });
                    });
                });
            } catch (error) {
                console.error('[SystemFeatures] ❌ 获取系统特征失败:', error);
                // 返回默认值，确保函数不会阻塞
                return {
                    timezone: 'Unknown',
                    browser_lang: navigator.language || 'Unknown'
                };
            }
        }

        /**
         * 自动上报当前用户信息到 user_analysis 表
         * 在 fetchData 执行成功后自动调用
         * @returns {Promise<Object>} 上报结果
         */
        async function autoReportSelf() {
            // 核心拦截：如果后端已存手动坐标，或者本地存有锁定标记，禁止执行 IP 定位
            if (window.currentUserData?.manual_lat || localStorage.getItem('loc_fixed') === 'true') {
                console.log('[Lock] 🔒 位置已手动锁定，跳过自动上报');
                return;
            }
            // 健壮性检查：确保 Supabase 客户端已初始化
            if (!supabaseClient) {
                console.warn('[AutoReport] ⚠️ Supabase 客户端未初始化，跳过自动上报');
                return { success: false, error: 'Supabase 客户端未初始化' };
            }

            try {
                console.log('[AutoReport] 🚀 开始自动上报用户信息...');

                // 【AutoReport 增强】检测是否已登录，如果已登录则携带 id
                let authenticatedUserId = null;
                let authenticatedSession = null;
                
                try {
                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                    if (!sessionError && session && session.user) {
                        authenticatedUserId = session.user.id;
                        authenticatedSession = session;
                        console.log('[AutoReport] ✅ 检测到已登录用户，user_id:', authenticatedUserId.substring(0, 8) + '...');
                    }
                } catch (authError) {
                    console.warn('[AutoReport] ⚠️ 检查登录状态失败:', authError);
                }

                // 1. 获取系统特征（时区和语言）
                const systemFeatures = await getUserSystemFeatures();
                console.log('[AutoReport] 📊 系统特征已获取:', systemFeatures);

                // 2. 获取 IP 和归属地信息
                let ipInfo = null;
                let ipLocation = 'Unknown';
                let lat = null;
                let lng = null;
                let countryCode = 'Unknown';

                try {
                    // 使用 ip-api.com API 获取 IP 归属地信息（更稳定的免费 API）
                    // 返回字段：country, countryCode, city, lat, lon 等
                    const ipResponse = await fetch('http://ip-api.com/json/', {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });

                    if (ipResponse.ok) {
                        ipInfo = await ipResponse.json();
                        console.log('[AutoReport] 🌍 IP 信息已获取:', ipInfo);

                        // ip-api.com 返回格式：{ country, countryCode, city, lat, lon, ... }
                        // 提取关键信息
                        countryCode = ipInfo.countryCode || ipInfo.country_code || 'Unknown';
                        
                        // 构建 ip_location 字符串（使用国家代码）
                        if (countryCode && countryCode !== 'Unknown') {
                            ipLocation = countryCode;
                        } else {
                            ipLocation = 'Unknown';
                        }
                        
                        // 提取经纬度（注意：ip-api.com 使用 lon 而不是 longitude）
                        if (ipInfo.lat && ipInfo.lon) {
                            lat = Number(ipInfo.lat);
                            lng = Number(ipInfo.lon);
                        } else if (ipInfo.latitude && ipInfo.longitude) {
                            // 兼容其他可能的字段名
                            lat = Number(ipInfo.latitude);
                            lng = Number(ipInfo.longitude);
                        }
                    } else {
                        console.warn('[AutoReport] ⚠️ IP API 请求失败，尝试备用方案...');
                        // 备用方案：使用 ipify 获取 IP
                        try {
                            const ipifyResponse = await fetch('https://api.ipify.org?format=json');
                            if (ipifyResponse.ok) {
                                const ipifyData = await ipifyResponse.json();
                                console.log('[AutoReport] 📍 从 ipify 获取到 IP:', ipifyData.ip);
                                ipLocation = 'Unknown';
                            }
                        } catch (err) {
                            console.warn('[AutoReport] ⚠️ 备用 IP API 也失败:', err);
                        }
                    }
                } catch (error) {
                    console.warn('[AutoReport] ⚠️ 获取 IP 信息失败:', error);
                    // 继续执行，使用默认值
                }

                // 3. VPN 判定逻辑
                // 判定条件：如果 timezone 是 'Asia/Shanghai' 且 IP 位置不在中国，标记为 VPN
                const timezone = systemFeatures.timezone || 'Unknown';
                const isShanghaiTimezone = timezone === 'Asia/Shanghai';
                // 只有当 countryCode 明确不是 'CN' 且不是 'Unknown' 时，才判定为不在中国
                const isNotChina = countryCode !== 'CN' && countryCode !== 'Unknown' && countryCode !== null;

                let is_vpn = false;
                // 只有在时区是 Asia/Shanghai 且 IP 明确不在中国时，才判定为 VPN
                if (isShanghaiTimezone && isNotChina) {
                    is_vpn = true;
                    console.log('[AutoReport] 🔍 VPN 判定: 检测到 VPN 用户', {
                        timezone,
                        countryCode,
                        is_vpn: true,
                        reason: '时区为Asia/Shanghai但IP不在中国'
                    });
                } else {
                    // 如果信息不足（countryCode 为 Unknown），不判定为 VPN
                    const reason = countryCode === 'Unknown' || countryCode === null 
                        ? 'IP位置信息不足，无法判定' 
                        : (isShanghaiTimezone ? 'IP位置正常（在中国）' : '时区不匹配');
                    
                    console.log('[AutoReport] 🔍 VPN 判定: 正常用户或信息不足', {
                        timezone,
                        countryCode,
                        is_vpn: false,
                        reason
                    });
                }

                // 4. 生成随机访客用户名：Guest_XXXX（XXXX为4位随机数字）
                // 【AutoReport 增强】如果已登录，使用 GitHub 用户名
                let userName = null;
                if (authenticatedUserId && authenticatedSession) {
                    const githubUsername = authenticatedSession.user.user_metadata?.user_name || 
                                         authenticatedSession.user.user_metadata?.preferred_username ||
                                         authenticatedSession.user.user_metadata?.login ||
                                         authenticatedSession.user.email?.split('@')[0] || null;
                    if (githubUsername) {
                        userName = githubUsername.toLowerCase().trim();
                        console.log('[AutoReport] ✅ 使用 GitHub 用户名:', userName);
                    }
                }
                
                if (!userName) {
                    const randomGuestId = Math.floor(1000 + Math.random() * 9000);
                    userName = `Guest_${randomGuestId}`;
                    console.log('[AutoReport] ℹ️ 使用访客用户名:', userName);
                }

                // 5. 构建提交数据
                // 【AutoReport 增强】如果已登录，携带 id（auth.uid），确保数据存入 GitHub 账号对应的行
                const payload = {
                    user_name: userName,
                    personality_type: 'AUTO_REPORT',
                    lat: lat,
                    lng: lng,
                    timezone: systemFeatures.timezone,
                    browser_lang: systemFeatures.browser_lang,
                    ip_location: ipLocation,
                    is_vpn: is_vpn
                };
                
                // 【AutoReport 增强】如果已登录，携带 id
                if (authenticatedUserId) {
                    payload.id = authenticatedUserId;
                    payload.user_identity = 'github';
                    console.log('[AutoReport] ✅ 已登录，携带 user_id:', authenticatedUserId.substring(0, 8) + '...');
                }

                console.log('[AutoReport] 📤 准备提交数据到 user_analysis 表:', payload);

                // 5. 【重要】禁用 AUTO_REPORT 写入 user_analysis
                // 说明：AUTO_REPORT 是占位/在线状态用途，但会导致 user_analysis 出现“额外一条类似数据”，
                // 与 index.html 上传分析生成的真实人格记录混在一起（你贴的第一条 AUTO_REPORT 就来自这里）。
                // 这里只保留本地光标展示与状态逻辑，不再向 Supabase 写入占位行。
                console.warn('[AutoReport] 🚫 已禁用 AUTO_REPORT 写入 user_analysis（仅本地显示，不写库）');
                const data = null;

                // 6. 立即反馈:上报成功后立即在地图上显示自己的位置(不等待 Realtime 监听)
                if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
                    // 性能保护:检查 setOrUpdateCurrentLocationCursor 函数是否已定义
                    if (typeof setOrUpdateCurrentLocationCursor === 'function') {
                        // 获取用户状态颜色(优先使用当前状态颜色)
                        const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                        const statusColor = statusConfig.status_color;
                        // 使用状态颜色
                        const pulseColor = statusColor;

                        // 获取GitHub用户名和头像URL
                        // 判断逻辑:如果 github_username 为空、或者是默认值,则不要请求 GitHub 图片
                        const githubUsername = localStorage.getItem('github_username') || null;
                        let avatarUrl = null;
                        
                        if (isValidGitHubUsername(githubUsername)) {
                            // 只有有效的GitHub用户名才生成头像URL
                            avatarUrl = getGitHubAvatarUrl(githubUsername);
                        } else {
                            // 无效用户名时,使用默认头像
                            avatarUrl = DEFAULT_AVATAR;
                        }
                        
                        // 【修复】使用持久化光标函数 setOrUpdateCurrentLocationCursor 代替 triggerMapPulse
                        // 这样光标会一直显示,不会5秒后消失,并且支持手动定位和缩放拖动
                        try {
                            setOrUpdateCurrentLocationCursor(lng, lat, pulseColor, avatarUrl, githubUsername);
                            console.log('[AutoReport] 🗺️ 已在地图上显示持久化光标:', {
                                lng,
                                lat,
                                color: pulseColor,
                                status: currentUserStatus,
                                is_vpn,
                                avatarUrl,
                                githubUsername,
                                isValid: isValidGitHubUsername(githubUsername)
                            });
                            
                            // 保存光标位置到全局变量,供后续使用
                            window.currentUserLocation = { lng, lat, color: pulseColor };
                        } catch (pulseError) {
                            console.warn('[AutoReport] ⚠️ 调用 setOrUpdateCurrentLocationCursor 失败:', pulseError);
                        }
                    } else {
                        console.warn('[AutoReport] ⚠️ setOrUpdateCurrentLocationCursor 函数未定义,跳过地图显示');
                    }
                } else {
                    console.log('[AutoReport] ℹ️ 经纬度信息不完整,跳过地图显示');
                }

                return { success: true, data };

            } catch (error) {
                console.error('[AutoReport] ❌ 自动上报过程出错:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * 提交用户分析数据到 user_analysis 表（采集端增强）
         * 在 insert 时自动增加 timezone 和 browser_lang 字段
         * @param {string} user_name - 用户名
         * @param {string} personality_type - 人格类型
         * @param {number} lat - 纬度
         * @param {number} lng - 经度
         * @returns {Promise<Object>} 提交结果
         */
        async function submitUserAnalysis(user_name, personality_type, lat, lng) {
            // 健壮性检查：确保 Supabase 客户端已初始化
            if (!supabaseClient) {
                console.warn('[Submit] ⚠️ Supabase 客户端未初始化，无法提交数据');
                return { success: false, error: 'Supabase 客户端未初始化' };
            }

            try {
                // 异步获取系统特征（非阻塞，不影响页面加载速度）
                const systemFeatures = await getUserSystemFeatures();
                console.log('[Submit] 📊 系统特征已获取:', systemFeatures);

                // 构建提交数据（包含 timezone 和 browser_lang 字段）
                const payload = {
                    user_name: user_name || '匿名用户',
                    personality_type: personality_type || 'UNKNOWN',
                    lat: lat || null,
                    lng: lng || null,
                    timezone: systemFeatures.timezone, // 使用 Intl.DateTimeFormat().resolvedOptions().timeZone
                    browser_lang: systemFeatures.browser_lang // 使用 navigator.language
                };

                console.log('[Submit] 📤 准备提交数据到 user_analysis 表:', payload);

                // 使用 Supabase 客户端插入数据
                const { data, error } = await supabaseClient
                    .from('user_analysis')
                    .insert([payload])
                    .select();

                if (error) {
                    console.error('[Submit] ❌ 提交失败:', error);
                    return { success: false, error: error.message };
                }

                console.log('[Submit] ✅ 数据已成功提交（包含 timezone 和 browser_lang）:', data);
                return { success: true, data };

            } catch (error) {
                console.error('[Submit] ❌ 提交过程出错:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * 获取并渲染大盘数据
         * 基于 index.ts 的接口返回格式（数据直接返回，不包裹在 data 字段中）
         */
        async function fetchData() {
            // 【修复】防止 fetchData 并发/重复调用导致多次渲染、重复触发 autoReportSelf
            try {
                if (window.__fetchDataPromise) {
                    return await window.__fetchDataPromise;
                }
            } catch { /* ignore */ }

            window.__fetchDataPromise = (async () => {
            try {
                const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content;
                console.group('%c 🚀 Dashboard Data Sync Starting ', 'background: #222; color: #bada55; font-size: 12px;');
                // 加载过场：骨架屏 + 扫描线
                setLoadingState(true);

                console.log(`[1/5] 正在请求: ${apiEndpoint}api/global-average`);
                const response = await fetch(`${apiEndpoint}api/global-average`);
                
                if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
                
                const result = await response.json();
                console.log('[2/5] 收到原始响应:', result);

                // 【适配层重写】使用强制映射层标准化数据
                const data = normalizeData(result);
                console.log('[3/5] 数据适配完成:', data);

                // 保存到全局变量，供语言切换时使用
                window.lastData = data;

                // --- 渲染数字卡片 ---
                // 【ID 存在性检查】在执行 animateValue 前，必须检查 document.getElementById 是否非空
                // 【动画容错】防止 NaN 或 undefined 导致崩溃
                
                // 数据返回：移除骨架屏并开始数字滚动
                setLoadingState(false);

                // 1. 已诊断开发者（千分位）
                const totalUsers = data.totalUsers !== undefined && data.totalUsers !== null ? Number(data.totalUsers) : undefined;
                if (totalUsers !== undefined) {
                    animateValue('totalUsers', totalUsers, 1400, { decimals: 0, useThousands: true });
                }

                // 2. 扫描次数 (totalAnalysis)
                const totalAnalysis = data.totalAnalysis !== undefined && data.totalAnalysis !== null ? Number(data.totalAnalysis) : undefined;
                if (totalAnalysis !== undefined) {
                    animateValue('totalAnalysis', totalAnalysis, 1400, { decimals: 0, useThousands: true });
                }

                // 3. 累计吐槽字数：绑定到 json.totalChars (276355)
                const totalChars = data.totalChars !== undefined && data.totalChars !== null ? Number(data.totalChars) : (data.totalRoastWords !== undefined && data.totalRoastWords !== null ? Number(data.totalRoastWords) : undefined);
                if (totalChars !== undefined) {
                    animateValue('totalChars', totalChars, 1400, { decimals: 0, useThousands: true });
                }

                // 4. 人均平均篇幅 (avgPerUser)：totalChars / totalUsers
                let avgPerUser = data.avgPerUser !== undefined && data.avgPerUser !== null ? Number(data.avgPerUser) : undefined;
                if ((avgPerUser === undefined || avgPerUser === 0) && totalChars !== undefined && data.totalUsers !== undefined && data.totalUsers > 0) {
                    avgPerUser = totalChars / Number(data.totalUsers);
                }
                if (avgPerUser !== undefined && avgPerUser > 0) {
                    animateValue('avgPerUser', avgPerUser, 900, { decimals: 1, useThousands: true });
                }

                // 5. 单次平均篇幅 (avgPerScan)：totalChars / totalAnalysis
                let avgPerScan = data.avgPerScan !== undefined && data.avgPerScan !== null ? Number(data.avgPerScan) : undefined;
                if ((avgPerScan === undefined || avgPerScan === 0) && totalChars !== undefined && data.totalAnalysis !== undefined && data.totalAnalysis !== null && data.totalAnalysis > 0) {
                    avgPerScan = totalChars / Number(data.totalAnalysis);
                }
                if (avgPerScan !== undefined && avgPerScan > 0) {
                    animateValue('avgPerScan', avgPerScan, 900, { decimals: 1, useThousands: true });
                }

                // 6. 运行天数
                const systemDays = data.systemDays !== undefined && data.systemDays !== null ? Number(data.systemDays) : undefined;
                if (systemDays !== undefined) {
                    animateValue('systemDays', systemDays, 900, { decimals: 0, useThousands: true });
                }

                // 7. 覆盖城市
                const cityCount = data.cityCount !== undefined && data.cityCount !== null ? Number(data.cityCount) : undefined;
                if (cityCount !== undefined) {
                    animateValue('cityCount', cityCount, 900, { decimals: 0, useThousands: true });
                }

                // --- 渲染人格分布排行 ---
                // 【人格排行渲染函数】使用独立的 renderPersonalityRank 函数
                renderPersonalityRank(data.personalityRank, data.recentVictims);

                // --- 渲染图表组件 ---
                // 渲染地理位置热力排行和地图
                if (data.locationRank && Array.isArray(data.locationRank) && data.locationRank.length > 0) {
                    // 检查 ECharts 是否已加载
                    if (typeof echarts === 'undefined') {
                        console.warn('[fetchData] ⚠️ ECharts 未加载，延迟初始化地图...');
                        // 延迟重试地图初始化
                        setTimeout(async () => {
                            if (typeof echarts !== 'undefined') {
                                try {
                                    await initGlobalMap(data.locationRank);
                                } catch (mapError) {
                                    console.error('[fetchData] ❌ 延迟地图初始化失败:', mapError);
                                }
                            } else {
                                console.error('[fetchData] ❌ ECharts 仍未加载，无法初始化地图');
                            }
                        }, 1000);
                    } else {
                        try {
                            await initGlobalMap(data.locationRank);
                        } catch (mapError) {
                            console.error('[fetchData] ❌ 地图初始化失败:', mapError);
                            // 即使地图初始化失败，也继续渲染位置列表
                        }
                    }
                    try {
                        renderLocationList(data.locationRank);
                    } catch (listError) {
                        console.error('[fetchData] ❌ 位置列表渲染失败:', listError);
                    }
                } else {
                    const locationListEl = document.getElementById('locationList');
                    if (locationListEl) {
                        locationListEl.innerHTML = '<div class="text-center text-zinc-500 py-4 text-[10px]">暂无数据</div>';
                    }
                    // 即使没有数据，也尝试初始化空地图
                    if (typeof echarts !== 'undefined') {
                        try {
                            await initGlobalMap([]);
                        } catch (mapError) {
                            console.warn('[fetchData] ⚠️ 空地图初始化失败:', mapError);
                        }
                    }
                }
                
                // 渲染雷达图（优先使用 globalAverage，否则使用 averages）
                // 【环境对齐】确保所有的 Number() 转换逻辑在赋值前完成，彻底删除硬编码
                const radarData = data.globalAverage || data.averages;
                if (radarData && typeof radarData === 'object' && typeof Chart !== 'undefined') {
                    // 确保所有值都是数字类型，如果接口有值则必须显示接口的值
                    const normalizedRadarData = {
                        L: radarData.L !== undefined && radarData.L !== null ? Number(radarData.L) : undefined,
                        P: radarData.P !== undefined && radarData.P !== null ? Number(radarData.P) : undefined,
                        D: radarData.D !== undefined && radarData.D !== null ? Number(radarData.D) : undefined,
                        E: radarData.E !== undefined && radarData.E !== null ? Number(radarData.E) : undefined,
                        F: radarData.F !== undefined && radarData.F !== null ? Number(radarData.F) : undefined,
                    };
                    console.log(`[雷达图] 数据: L=${normalizedRadarData.L}, P=${normalizedRadarData.P}, D=${normalizedRadarData.D}, E=${normalizedRadarData.E}, F=${normalizedRadarData.F}`);
                    renderRadarChart(normalizedRadarData);
                } else {
                    console.warn('[雷达图] ❌ 数据格式错误或 Chart.js 未加载');
                }
                
                // 渲染实时诊断活动（优先使用 latestRecords）
                const activityData = data.latestRecords && data.latestRecords.length > 0 
                    ? data.latestRecords 
                    : (data.recentVictims || []);
                
                // 初始化全局 latestRecords 数组（用于 Realtime 更新）
                latestRecords = Array.isArray(activityData) ? [...activityData] : [];
                // 确保长度不超过 10
                if (latestRecords.length > 10) {
                    latestRecords = latestRecords.slice(0, 10);
                }
                
                renderRecentActivity(latestRecords);

                // 初始化 window.allData（用于 LPDEF 专家筛选 - 选拔各维度最强王者）
                // 优先使用 latestRecords（包含所有用户数据），如果没有则使用 recentVictims
                const allDataArray = Array.isArray(data.latestRecords) && data.latestRecords.length > 0
                    ? [...data.latestRecords]
                    : (Array.isArray(data.recentVictims) && data.recentVictims.length > 0
                        ? [...data.recentVictims]
                        : []);
                
                // 【全球最强数据提取】遍历 latestRecords 找到第一个 jiafang_count > 0 的记录作为'全球最强'的展示数据
                let globalChampionRecord = null;
                if (allDataArray.length > 0) {
                    globalChampionRecord = allDataArray.find(record => {
                        const jiafangCount = record.jiafang_count !== undefined && record.jiafang_count !== null ? Number(record.jiafang_count) : 0;
                        return jiafangCount > 0;
                    });
                    if (globalChampionRecord) {
                        console.log('[Global] ✅ 找到全球最强记录（jiafang_count > 0）:', globalChampionRecord);
                        // 将全球最强记录存储到全局变量
                        window.globalChampionRecord = globalChampionRecord;
                    }
                }
                
                window.allData = allDataArray;
                console.log(`[LPDEF] 📦 已初始化 window.allData，共 ${allDataArray.length} 条数据（用于选拔最强王者）`);

                // 注意：LPDEF 专家卡片将在 window.onload 的身份检查后渲染
                // 这里不调用 renderLPDEFExperts，避免覆盖身份检查的结果

                console.log('%c [5/5] ✅ 渲染逻辑同步完毕 ', 'color: #00ff41');

                // 执行自动上报（异步，不阻塞主流程）——只执行一次，避免重复日志/重复流程
                try {
                    if (!window.__autoReportSelfOnce) {
                        window.__autoReportSelfOnce = true;
                        autoReportSelf().catch(err => {
                            console.warn('[AutoReport] ⚠️ 自动上报失败（不影响主流程）:', err);
                        });
                    }
                } catch { /* ignore */ }

            } catch (err) {
                console.error('[ERROR] Dashboard 渲染崩溃:', err);
                
                // 显示错误提示
                const container = document.querySelector('.max-w-\\[1600px\\]');
                if (container) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'fixed top-4 right-4 bg-red-900/80 text-white px-4 py-2 rounded border border-red-500 z-50';
                    errorDiv.textContent = `错误: ${err.message || '数据加载失败'}`;
                    container.appendChild(errorDiv);
                    
                    setTimeout(() => {
                        errorDiv.remove();
                    }, 5000);
                }
            } finally {
                // 确保异常情况下也关闭加载过场
                setLoadingState(false);
                console.groupEnd();
            }
            })();

            try {
                return await window.__fetchDataPromise;
            } finally {
                try { window.__fetchDataPromise = null; } catch { /* ignore */ }
            }
        }

        /**
         * 加载 rank-content.ts 数据
         */
        async function loadRankResources() {
            try {
                // 优化：优先尝试读取 TS 文件（因为环境目前解析 TS 文件更稳定）
                const tsPaths = [
                    './src/rank-content.ts',
                    '../src/rank-content.ts',
                    '/src/rank-content.ts',
                    'src/rank-content.ts'
                ];
                
                let text = null;
                let lastError = null;
                
                // 优先尝试每个 TS 路径
                for (const path of tsPaths) {
                    try {
                        const response = await fetch(path);
                        if (response.ok) {
                            const contentType = response.headers.get('content-type') || '';
                            // 检查是否是文本文件（TS/JS 文件）
                            if (contentType.includes('text/') || contentType.includes('application/javascript') || contentType.includes('application/typescript')) {
                                text = await response.text();
                                console.log(`[Rank] ✅ 成功从 ${path} 加载 TS 文件`);
                                break;
                            } else {
                                console.debug(`[Rank] ${path} 返回的不是文本格式 (Content-Type: ${contentType})，跳过`);
                            }
                        } else {
                            console.debug(`[Rank] ${path} 返回状态码 ${response.status}，跳过`);
                        }
                    } catch (err) {
                        lastError = err;
                        console.debug(`[Rank] TS 路径 ${path} 加载失败:`, err.message);
                    }
                }
                
                // 如果 TS 文件加载成功，解析并返回
                if (text) {
                    // 使用更健壮的正则提取 JSON 对象
                    // 从第一个 { 到最后一个 } 之间的内容
                    const firstBrace = text.indexOf('{');
                    const lastBrace = text.lastIndexOf('}');
                    
                    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
                        console.warn('[Rank] ⚠️ 无法从 rank-content.ts 中找到有效的 JSON 对象');
                        return false;
                    }
                    
                    const jsonText = text.substring(firstBrace, lastBrace + 1);
                    
                    // 清理文本：移除注释和类型注解
                    let cleaned = jsonText
                        .replace(/\/\*[\s\S]*?\*\//g, '') // 移除块注释
                        .replace(/\/\/.*$/gm, '') // 移除行注释
                        .replace(/:\s*Record<string,\s*any>/g, '') // 移除类型注解
                        .replace(/:\s*any/g, ''); // 移除其他 any 类型注解
                    
                    // 尝试解析为 JSON
                    try {
                        RANK_RESOURCES = JSON.parse(cleaned);
                        console.log('[Rank] ✅ 维度排名数据加载成功（从 TS 文件 JSON 解析）');
                        return true;
                    } catch (e) {
                        console.warn(`[Rank] ⚠️ 从 TS 文件解析 JSON 失败: ${e.message}`);
                        return false;
                    }
                }
                
                // 如果 TS 文件加载失败，静默尝试 JSON 文件（作为备选）
                const jsonPaths = [
                    './rank-data.json',
                    '../rank-data.json',
                    '/rank-data.json',
                    'rank-data.json'
                ];
                
                // 静默尝试 JSON 文件（使用 console.debug 避免干扰控制台）
                for (const path of jsonPaths) {
                    try {
                        const response = await fetch(path);
                        // 检查响应状态和 Content-Type，避免 404 返回 HTML 导致的解析错误
                        if (response.ok) {
                            const contentType = response.headers.get('content-type') || '';
                            // 确保响应是 JSON 格式，而不是 HTML 错误页面
                            if (contentType.includes('application/json') || contentType.includes('text/json')) {
                                const jsonData = await response.json();
                                RANK_RESOURCES = jsonData;
                                console.log(`[Rank] ✅ 成功从 ${path} 加载 JSON 数据`);
                                return true;
                            } else {
                                // 如果 Content-Type 不是 JSON，可能是 404 返回的 HTML，静默跳过
                                console.debug(`[Rank] ${path} 返回的不是 JSON 格式 (Content-Type: ${contentType})，跳过`);
                            }
                        } else {
                            // 响应状态不是 200-299，静默跳过
                            console.debug(`[Rank] ${path} 返回状态码 ${response.status}，跳过`);
                        }
                    } catch (err) {
                        // 网络错误或其他异常，静默记录
                        console.debug(`[Rank] JSON 路径 ${path} 加载失败:`, err.message);
                    }
                }
                
                // 如果所有路径都失败，记录错误但不抛出异常，允许页面继续加载
                console.warn(`[Rank] ⚠️ 所有路径都加载失败。最后错误: ${lastError?.message || '未知错误'}`);
                return false;
            } catch (error) {
                console.error('[Rank] ❌ 加载排名数据失败:', error);
                // 返回 false，但不阻止页面继续加载
                // 渲染时会显示加载中的提示
                return false;
            }
        }

        /**
         * 根据维度ID和数值获取等级反馈
         * @param {string} dimId - 维度ID (ai, word, day, no, say, please)
         * @param {number} value - 数值
         * @returns {Object|null} 包含 label, title, content 的对象，如果未找到则返回 null
         */
        function getRankFeedback(dimId, value) {
            if (!RANK_RESOURCES || !RANK_RESOURCES[dimId]) {
                console.log(`[Rank] 维度 ${dimId} 不存在于 RANK_RESOURCES，返回默认反馈`);
                return null;
            }

            const dim = RANK_RESOURCES[dimId];
            if (!dim.levels || !Array.isArray(dim.levels) || dim.levels.length === 0) {
                console.log(`[Rank] 维度 ${dimId} 的 levels 数据无效，返回默认反馈`);
                return null;
            }

            let matchedLevel = null;

            // 0 值保护：如果 value <= 0，直接强制匹配第一个等级
            if (value <= 0) {
                matchedLevel = dim.levels[0];
                console.log(`[Rank] 维度 ${dimId} 的值 ${value} <= 0，自动匹配第一个等级: ${matchedLevel.label}`);
            } else {
                // 查找满足 value >= min && value <= max 的等级
                matchedLevel = dim.levels.find(level => {
                    const min = Number(level.min) || 0;
                    const max = Number(level.max) || Infinity;
                    return value >= min && value <= max;
                });

                // 溢出保护：如果数值超过了配置的最大值，自动匹配最后一个等级
                if (!matchedLevel) {
                    matchedLevel = dim.levels[dim.levels.length - 1];
                    console.log(`[Rank] 维度 ${dimId} 的值 ${value} 超出范围，自动匹配最后一个等级: ${matchedLevel.label}`);
                }
            }

            // 随机抽取一条评价
            const comments = matchedLevel.commentsZh || [];
            if (comments.length === 0) {
                console.log(`[Rank] 维度 ${dimId} 的等级 ${matchedLevel.label} 没有评价数据，返回默认内容`);
                return {
                    label: matchedLevel.label || '未知等级',
                    title: '暂无评价',
                    content: '暂无评价内容'
                };
            }

            const randomComment = comments[Math.floor(Math.random() * comments.length)];
            return {
                label: matchedLevel.label || '未知等级',
                title: randomComment.title || '暂无标题',
                content: randomComment.content || '暂无内容'
            };
        }

        /**
         * 从 lpdef 提取 vibe_index（5 位数字），与 worker 的 generateLPDEF 一致：L0P1D2E1F0 -> 01210
         * 与 index.html 的 lpdefToVibeIndex 保持同步，用于答案之书按 lpdef 查 answerBookByVibeIndex.json
         */
        function lpdefToVibeIndex(lpdef) {
            if (!lpdef || typeof lpdef !== 'string') return null;
            const digits = String(lpdef).replace(/\D/g, '');
            return digits.length === 5 ? digits : null;
        }

        /**
         * 从 personality.detailedStats 或 l_score/p_score/... 计算 5 位 vibe_index 字符串（与 worker content.ts getVibeIndex 一致）
         * 当视图未返回 vibe_index_str/lpdef 时，用此结果加载人格称号与答案之书
         */
        function scoresToVibeIndexStr(userData) {
            if (!userData) return null;
            let L = userData.l_score ?? userData.l ?? null;
            let P = userData.p_score ?? userData.p ?? null;
            let D = userData.d_score ?? userData.d ?? null;
            let E = userData.e_score ?? userData.e ?? null;
            let F = userData.f_score ?? userData.f ?? null;
            const stats = userData.personality?.detailedStats || userData.personality_data || userData.personalityData;
            if (Array.isArray(stats) && stats.length > 0) {
                stats.forEach(s => {
                    const dim = (s.dimension || '').toUpperCase();
                    const score = Number(s.score);
                    if (dim === 'L') L = score;
                    else if (dim === 'P') P = score;
                    else if (dim === 'D') D = score;
                    else if (dim === 'E') E = score;
                    else if (dim === 'F') F = score;
                });
            }
            if (L == null && P == null && D == null && E == null && F == null) return null;
            const indexMap = (v) => {
                if (v == null || isNaN(v)) return '1';
                if (Number(v) < 40) return '0';
                if (Number(v) < 70) return '1';
                return '2';
            };
            const eIndex = (v) => {
                if (v == null || isNaN(v)) return '1';
                const n = Number(v);
                if (n < 5) return '0';
                if (n < 10) return '1';
                return '2';
            };
            return [
                indexMap(L),
                indexMap(P),
                indexMap(D),
                eIndex(E),
                indexMap(F)
            ].join('');
        }

        /**
         * 从 allData 中解析出同一用户的最完整记录，用于左侧抽屉统计展示
         * 确保显示的是「提交聊天记录对应的数据和数值」（来自 latestRecords/接口），而非仅 upsert 返回的简略字段
         * @param {Object} user - 当前用户对象（可能来自 window.currentUser 或 upsert 响应）
         * @returns {Object} 同一用户在 allData 中的记录（更完整）或原 user
         */
        function getBestUserRecordForStats(user) {
            if (!user) return null;
            const allData = window.allData || [];
            const normalize = (v) => (v == null ? '' : String(v).trim().toLowerCase());
            const isSameUser = (item) => {
                if (!item) return false;
                if (item.id != null && user.id != null && item.id === user.id) return true;
                const itemFp = normalize(item.fingerprint || item.user_fingerprint);
                const userFp = normalize(user.fingerprint || user.user_fingerprint);
                if (itemFp && userFp && itemFp === userFp) return true;
                const itemIdentity = normalize(item.user_identity);
                const userIdentity = normalize(user.user_identity);
                if (itemIdentity && userIdentity && itemIdentity === userIdentity) return true;
                const itemName = normalize(item.user_name || item.name || item.github_username);
                const userName = normalize(user.user_name || user.name || user.github_username);
                return itemName && userName && itemName === userName;
            };

            // 关键修复：不要用 allData 里“第一条命中”覆盖更完整的记录（例如 Supabase 刚拉到的 dbUser）
            // 改为：在 [user + allData 的同人记录] 里按“字段完整度”打分择优
            const candidates = [user, ...allData.filter(isSameUser)];
            const score = (u) => {
                if (!u) return -1;
                let s = 0;

                // 身份/主键字段
                if (u.id != null) s += 3;
                if (u.user_id != null) s += 2;
                if (u.github_id != null) s += 2;
                if (u.fingerprint || u.user_fingerprint) s += 2;
                if (u.user_identity) s += 1;

                // 维度/统计字段（覆盖 renderUserStatsCards 与 extractDimensionValues 的实际用法）
                const statKeys = [
                    'dimensions',
                    'l_score','p_score','d_score','e_score','f_score',
                    'l','p','d','e','f',
                    'L','P','D','E','F',
                    'question_message_count','total_messages',
                    'total_user_chars','total_chars','totalUserChars',
                    'avg_user_message_length','avgMessageLength','avgUserMessageLength',
                    'work_days','usage_days','days',
                    'jiafang_count','ketao_count',
                    'vibe_rank','vibe_percentile','avg_rank'
                ];
                statKeys.forEach((k) => {
                    const v = u[k];
                    if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) s += 1;
                });

                // JSON/结构化字段
                if (u.personality || u.personality_data || u.personalityData) s += 2;
                if (u.answer_book || u.answerBook) s += 1;
                if (u.personality_name || u.personalityName) s += 1;

                return s;
            };

            let best = candidates[0] || null;
            let bestScore = score(best);
            for (let i = 1; i < candidates.length; i++) {
                const c = candidates[i];
                const cs = score(c);
                if (cs > bestScore) {
                    best = c;
                    bestScore = cs;
                }
            }
            return best || user;
        }

        /**
         * 渲染用户统计卡片到左侧抽屉（与 index 同步：无 answer_book 时按 vibe_index/lpdef 从 answerBookByVibeIndex.json 取今日箴言）
         * @param {HTMLElement} leftBody - 左侧抽屉容器
         * @param {Object} userData - 当前用户数据对象
         */
        async function renderUserStatsCards(leftBody, userData) {
            console.log('[UserStats] 🚀 开始渲染用户统计卡片，userData:', {
                hasUserData: !!userData,
                userName: userData?.user_name || userData?.name,
                fingerprint: userData?.fingerprint ? userData.fingerprint.substring(0, 8) : null,
                hasLeftBody: !!leftBody,
                hasVibeRank: !!(userData?.vibe_rank || userData?.vibeRank),
                hasPersonalityName: !!(userData?.personality_name || userData?.personalityName),
                hasAnswerBook: !!(userData?.answer_book || userData?.answerBook),
                hasPersonality: !!userData?.personality,
                hasPersonalityData: !!userData?.personality_data
            });
            
            if (!leftBody) {
                console.error('[UserStats] ❌ leftBody 不存在');
                return;
            }
            
            if (!userData) {
                console.warn('[UserStats] ⚠️ userData 不存在，跳过渲染');
                return;
            }

            // ----------------------------------------------------------
            // 修复：避免“拿不到真实用户 -> 用默认 50/UNKNOWN 伪数据渲染”
            // - 如果本机有 user_fingerprint，则优先用它从 v_unified_analysis_v2 拉一条真实记录再渲染
            // - 避免重复请求：用全局锁防止递归/并发
            // ----------------------------------------------------------
            const getLocalFp = () => {
                try {
                    const KEY = 'user_fingerprint';
                    let fp = (localStorage.getItem(KEY) || '').trim();
                    if (!fp) {
                        fp = (localStorage.getItem('cursor_clinical_fingerprint') || localStorage.getItem('vibe_fp') || localStorage.getItem('fingerprint') || '').trim();
                        if (fp) {
                            try { localStorage.setItem(KEY, fp); } catch { /* ignore */ }
                        }
                    }
                    if (!fp) {
                        // 生成一个稳定指纹（仅用于之后能认领/查询；不会覆盖已有云端数据）
                        try {
                            const bytes = new Uint8Array(16);
                            (crypto || window.crypto).getRandomValues(bytes);
                            fp = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                            fp = fp.slice(0, 32);
                            try { localStorage.setItem(KEY, fp); } catch { /* ignore */ }
                        } catch { /* ignore */ }
                    }
                    return fp || '';
                } catch {
                    return '';
                }
            };

            const localFp = getLocalFp();
            const canQuerySupabase = (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function');
            const looksPlaceholder = (() => {
                try {
                    // 没有任何核心统计字段 + 维度分接近默认值时，视为占位/伪数据
                    const hasCore =
                        (userData.total_messages != null && Number(userData.total_messages) > 0) ||
                        (userData.total_user_chars != null && Number(userData.total_user_chars) > 0) ||
                        (userData.avg_user_message_length != null && Number(userData.avg_user_message_length) > 0) ||
                        (userData.stats && typeof userData.stats === 'object' && (Number(userData.stats.totalMessages) > 0 || Number(userData.stats.totalChars) > 0));
                    if (hasCore) return false;
                    const l = Number(userData.l_score ?? userData.l ?? 0);
                    const p = Number(userData.p_score ?? userData.p ?? 0);
                    const d = Number(userData.d_score ?? userData.d ?? 0);
                    const e = Number(userData.e_score ?? userData.e ?? 0);
                    const f = Number(userData.f_score ?? userData.f ?? 0);
                    const nearDefault = [l, p, d, e, f].every((x) => !Number.isFinite(x) || x === 0 || x === 50);
                    return nearDefault;
                } catch {
                    return false;
                }
            })();

            if (looksPlaceholder && localFp && canQuerySupabase && !window.__userStatsCardDbFixing) {
                window.__userStatsCardDbFixing = true;
                try {
                    supabaseClient
                        .from('v_unified_analysis_v2')
                        .select('*')
                        .eq('fingerprint', localFp)
                        .maybeSingle()
                        .then(({ data: dbUser }) => {
                            if (!dbUser) return;
                            console.log('[UserStats] ✅ 使用本机 fingerprint 拉取到真实用户记录，刷新左抽屉:', dbUser.user_name || dbUser.name);
                            window.currentUser = dbUser;
                            const lb = document.getElementById('left-drawer-body');
                            if (lb) renderUserStatsCards(lb, getBestUserRecordForStats(dbUser));
                        })
                        .catch(() => {})
                        .finally(() => {
                            try { window.__userStatsCardDbFixing = false; } catch { /* ignore */ }
                        });
                    return;
                } catch { /* ignore */ }
                try { window.__userStatsCardDbFixing = false; } catch { /* ignore */ }
            }
            
            try {
                const esc = (s) =>
                    String(s ?? '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');

                // 【Task 4】检查是否为新用户（维度/统计为空或为默认值）
                // 修复：统一视图/隐私裁剪可能不返回 l_score..f_score，但仍可能返回其它统计字段（total_messages 等）
                const quickScoreKeys = ['l_score','p_score','d_score','e_score','f_score','l','p','d','e','f','L','P','D','E','F'];
                const hasAnyScore = quickScoreKeys.some(k => userData[k] !== null && userData[k] !== undefined);

                const extracted = extractDimensionValues(userData);
                const hasAnyMetric =
                    (extracted.ai !== undefined && extracted.ai !== null && extracted.ai > 0) ||
                    (extracted.say !== undefined && extracted.say !== null && extracted.say > 0) ||
                    (extracted.word !== undefined && extracted.word !== null && extracted.word > 0) ||
                    (extracted.no !== undefined && extracted.no !== null && extracted.no > 0) ||
                    (extracted.please !== undefined && extracted.please !== null && extracted.please > 0) ||
                    (extracted.day !== undefined && extracted.day !== null && extracted.day > 0);

                const hasDimensions = !!userData.dimensions || hasAnyScore || hasAnyMetric;

                // 默认分只在“五维分都存在且都等于 50”时成立
                const isDefaultScores =
                    userData.l_score === 50 &&
                    userData.p_score === 50 &&
                    userData.d_score === 50 &&
                    userData.e_score === 50 &&
                    userData.f_score === 50;
                
                // 【修复】GitHub 用户：即使 latestRecords 里字段不全，也不应一直卡在“同步中”
                // 典型场景：/api/global-average 返回的 latestRecords 会做隐私裁剪，可能缺少 id/fingerprint/维度字段
                const candidateUserName = String(
                    userData?.user_name ||
                    userData?.name ||
                    (() => {
                        try { return localStorage.getItem('github_username') || ''; } catch { return ''; }
                    })()
                ).trim();
                const candidateIdentity = userData?.user_identity || null;
                const isGitHubUser = !!(candidateUserName && typeof isValidGitHubUsername === 'function' && isValidGitHubUsername(candidateUserName, candidateIdentity));
                const canQuerySupabase = (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function');

                // 若是 GitHub 用户但数据不全：自动从统一视图拉完整记录后再渲染，避免无限 loading
                // 兼容：userData 可能已有 id 但字段仍不全（例如登录后刚 upsert 的简略记录）
                if ((!hasDimensions || isDefaultScores) && isGitHubUser && canQuerySupabase && !userData.__unifiedFetchAttempted) {
                    try {
                        userData.__unifiedFetchAttempted = true; // 标记：避免递归死循环
                        console.log('[UserStats] 🔄 GitHub 用户数据不全，尝试从 v_unified_analysis_v2 拉取完整记录:', {
                            candidateUserName,
                            hasId: !!userData.id
                        });
                        let q = supabaseClient
                            .from('v_unified_analysis_v2')
                            .select('*');
                        // 优先用 id 精确匹配（最稳定），否则用 user_name（不区分大小写）
                        if (userData.id) {
                            q = q.eq('id', userData.id);
                        } else {
                            q = q.ilike('user_name', candidateUserName);
                        }
                        q.maybeSingle()
                            .then(({ data: dbUser }) => {
                                if (!dbUser) {
                                    console.warn('[UserStats] ⚠️ v_unified_analysis_v2 未找到用户记录:', candidateUserName);
                                    // 继续走后续渲染（会显示“暂无云端数据”卡片）
                                    renderUserStatsCards(leftBody, { ...userData, __unifiedFetchAttempted: true });
                                    return;
                                }
                                console.log('[UserStats] ✅ 已获取完整用户记录，刷新统计卡片:', dbUser.user_name || dbUser.name);
                                try { window.currentUser = dbUser; } catch { /* ignore */ }
                                renderUserStatsCards(leftBody, getBestUserRecordForStats(dbUser));
                            })
                            .catch((e) => {
                                console.warn('[UserStats] ⚠️ v_unified_analysis_v2 查询失败:', e);
                                renderUserStatsCards(leftBody, { ...userData, __unifiedFetchAttempted: true });
                            });
                        return; // 异步拉取后会重渲染，这里先退出
                    } catch (e) {
                        console.warn('[UserStats] ⚠️ 触发 GitHub 用户补全流程失败:', e);
                    }
                }

                // 只有在确定是“完全没有数据的匿名用户/占位记录”时才显示同步中
                const isNewUser = (!hasDimensions || isDefaultScores) && !userData.id && !isGitHubUser;
                
                if (isNewUser) {
                    console.log('[UserStats] ⏳ 检测到新用户（数据同步中），显示加载占位符');
                    
                    // 创建"数据同步中"占位符卡片
                    const loadingCard = document.createElement('div');
                    loadingCard.className = 'drawer-item';
                    loadingCard.innerHTML = `
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">⏳</span>
                            <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                                SYNCING
                            </span>
                        </div>
                        <div class="drawer-item-label mb-2">${escapeHtml(getI18nText('common.syncing') || (currentLang === 'en' ? 'Syncing' : '数据同步中'))}</div>
                        <div class="text-[10px] text-[#00ff41]/60 mb-3">
                            ${escapeHtml(currentLang === 'en' ? 'Your data is being processed. Please wait…' : '您的数据正在处理中，请稍候...')}
                        </div>
                        <div class="flex items-center space-x-2 mb-2">
                            <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse"></div>
                            <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                            <div class="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                        </div>
                        <div class="text-[8px] text-[#00ff41]/40 mt-2">
                            ${escapeHtml(currentLang === 'en' ? 'User' : '用户')}: ${escapeHtml(userData.user_name || userData.name || (currentLang === 'en' ? 'Unknown' : '未知'))}
                        </div>
                    `;
                    
                    // 先移除旧的统计卡片（如果存在）
                    const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
                    existingStatsCards.forEach(card => {
                        const label = card.querySelector('.drawer-item-label');
                        if (label && (label.textContent === '我的数据统计' || label.textContent === '数据同步中')) {
                            card.remove();
                        }
                    });
                    
                    // 将加载卡片插入到身份配置卡片之后
                    const identityCard = leftBody.querySelector('.drawer-item');
                    if (identityCard && identityCard.nextSibling) {
                        leftBody.insertBefore(loadingCard, identityCard.nextSibling);
                    } else {
                        leftBody.appendChild(loadingCard);
                    }
                    
                    console.log('[UserStats] ✅ 已显示数据同步中占位符');
                    return; // 提前返回，不渲染完整统计卡片
                }

                // GitHub 用户但 Supabase 客户端尚未就绪：先显示“连接中”，并稍后自动重试
                if ((!hasDimensions || isDefaultScores) && isGitHubUser && !userData.id && !canQuerySupabase && !userData.__unifiedFetchAttempted) {
                    try {
                        const attempts = Number(userData.__supabaseWaitAttempts || 0);
                        if (attempts < 6) {
                            userData.__supabaseWaitAttempts = attempts + 1;
                            const delayMs = 800 + attempts * 400;
                            setTimeout(() => {
                                const lb = document.getElementById('left-drawer-body');
                                if (lb) renderUserStatsCards(lb, userData);
                            }, delayMs);
                        }
                    } catch (e) { /* ignore */ }

                    const connectingCard = document.createElement('div');
                    connectingCard.className = 'drawer-item';
                    connectingCard.innerHTML = `
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">🔌</span>
                            <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                                CONNECT
                            </span>
                        </div>
                        <div class="drawer-item-label mb-2">${escapeHtml(getI18nText('drawer.my_stats') || 'My Stats')}</div>
                        <div class="text-[10px] text-[#00ff41]/60 mb-2">
                            ${escapeHtml(getI18nText('common.connecting_cloud') || 'Connecting...')}
                        </div>
                        <div class="text-[8px] text-[#00ff41]/40">
                            ${escapeHtml(currentLang === 'en' ? 'GitHub' : 'GitHub 用户')}：${escapeHtml(candidateUserName || (currentLang === 'en' ? 'Unknown' : '未知'))}
                        </div>
                    `;

                    const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
                    existingStatsCards.forEach(card => {
                        const label = card.querySelector('.drawer-item-label');
                        if (label && (label.textContent === '我的数据统计' || label.textContent === '数据同步中')) {
                            card.remove();
                        }
                    });

                    const identityCard = leftBody.querySelector('.drawer-item');
                    if (identityCard && identityCard.nextSibling) {
                        leftBody.insertBefore(connectingCard, identityCard.nextSibling);
                    } else {
                        leftBody.appendChild(connectingCard);
                    }
                    return;
                }

                // GitHub 用户仍无维度且已尝试补全：不要显示“同步中”，改为“暂无云端汇总数据”（提示用户先跑一次分析）
                if ((!hasDimensions || isDefaultScores) && isGitHubUser && !userData.id && userData.__unifiedFetchAttempted) {
                    console.warn('[UserStats] ⚠️ GitHub 用户暂无云端汇总数据（可能尚未跑过分析或数据仍未入库）:', candidateUserName);

                    const emptyCard = document.createElement('div');
                    emptyCard.className = 'drawer-item';
                    emptyCard.innerHTML = `
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">🧾</span>
                            <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                                NO DATA
                            </span>
                        </div>
                        <div class="drawer-item-label mb-2">${escapeHtml(getI18nText('drawer.my_stats') || 'My Stats')}</div>
                        <div class="text-[10px] text-[#00ff41]/60 mb-2">
                            ${escapeHtml(getI18nText('common.no_cloud_summary') || 'No cloud summary')}（GitHub：${candidateUserName || (currentLang === 'en' ? 'Unknown' : '未知')}）。
                        </div>
                        <div class="text-[8px] text-[#00ff41]/40">
                            ${escapeHtml(getI18nText('common.suggestion_run_once') || '')}
                        </div>
                    `;

                    // 清理旧卡片并插入
                    const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
                    existingStatsCards.forEach(card => {
                        const label = card.querySelector('.drawer-item-label');
                        if (label && (label.textContent === '我的数据统计' || label.textContent === '数据同步中')) {
                            card.remove();
                        }
                    });

                    const identityCard = leftBody.querySelector('.drawer-item');
                    if (identityCard && identityCard.nextSibling) {
                        leftBody.insertBefore(emptyCard, identityCard.nextSibling);
                    } else {
                        leftBody.appendChild(emptyCard);
                    }
                    return;
                }
                
                // 提取维度值
                const dimensionValues = extractDimensionValues(userData);
                console.log('[UserStats] 📊 提取的维度值:', dimensionValues);
                
                // 1. 技术排名（使用平均排名或综合排名）
                // 【Task 2】优先使用视图返回的 vibe_rank 和 vibe_percentile
                const vibeRank = userData.vibe_rank || userData.vibeRank || null;
                const vibePercentile = userData.vibe_percentile || userData.vibePercentile || null;
                // 尝试从多个来源获取排名：ranks 对象、avg_rank、或从 personality_data 中计算
                let avgRank = userData.avg_rank || userData.avgRank || userData.ranks?.avgRank || vibePercentile || null;
                
                // 如果还没有排名，尝试从 personality_data 或 personality JSONB 字段中获取
                if (avgRank === null || avgRank === undefined) {
                    try {
                        const personalityData = userData.personality_data || userData.personalityData;
                        const personality = userData.personality;
                        if (personalityData && Array.isArray(personalityData)) {
                            // 计算平均排名：从五个维度的排名中取平均值
                            const ranks = personalityData.map(d => d.rank || d.rankPercent || 50).filter(r => r !== null && r !== undefined);
                            if (ranks.length > 0) {
                                avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
                            }
                        } else if (personality && typeof personality === 'object') {
                            // 尝试从 personality.detailedStats 中获取
                            const detailedStats = personality.detailedStats || personality.detailed_stats;
                            if (detailedStats && Array.isArray(detailedStats)) {
                                const ranks = detailedStats.map(d => d.rank || d.rankPercent || 50).filter(r => r !== null && r !== undefined);
                                if (ranks.length > 0) {
                                    avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[UserStats] ⚠️ 从 personality 数据提取排名失败:', e);
                    }
                }
                
                const totalUsers = window.lastData?.totalUsers || 1;
                let techRankText = 'N/A';
                
                // 优先使用 vibe_rank（如果存在）
                if (vibeRank !== null && vibeRank !== undefined && totalUsers > 0) {
                    techRankText = currentLang === 'en'
                        ? `#${vibeRank} / ${totalUsers}`
                        : `第 ${vibeRank} 名 / ${totalUsers} 人`;
                } else if (avgRank !== null && avgRank !== undefined && totalUsers > 0) {
                    // avgRank 是百分比（0-100），需要转换为排名
                    const rankPercent = Math.round((1 - avgRank / 100) * totalUsers);
                    techRankText = currentLang === 'en'
                        ? `#${rankPercent} / ${totalUsers}`
                        : `第 ${rankPercent} 名 / ${totalUsers} 人`;
                }
                console.log('[UserStats] 🏆 技术排名:', { vibeRank, vibePercentile, avgRank, totalUsers, techRankText });
                
                const nf = new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN');

                // 2. 调戏AI次数（ai维度）
                const aiCount = dimensionValues.ai !== undefined && dimensionValues.ai !== null 
                    ? nf.format(dimensionValues.ai) 
                    : 'N/A';
                
                // 3. 甲方爸爸上身次数（no维度）
                const noCount = dimensionValues.no !== undefined && dimensionValues.no !== null 
                    ? nf.format(dimensionValues.no) 
                    : 'N/A';
                
                // 4. 赛博磕头次数（please维度）
                const pleaseCount = dimensionValues.please !== undefined && dimensionValues.please !== null 
                    ? nf.format(dimensionValues.please) 
                    : 'N/A';
                
                // 5. 废话输出总数（say维度）
                const sayTotal = dimensionValues.say !== undefined && dimensionValues.say !== null 
                    ? nf.format(dimensionValues.say) 
                    : 'N/A';
                
                // 6. 平均吹水长度（word维度）
                const avgLength = dimensionValues.word !== undefined && dimensionValues.word !== null 
                    ? nf.format(Math.round(dimensionValues.word)) 
                    : 'N/A';

                // 7. Cursor 上岗天数 + 最早对话时间（最精准：stats.first_chat_at / stats.usageDays）
                let firstChatAtText = 'N/A';
                let cursorDaysText = 'N/A';
                try {
                    const su = userData.stats && typeof userData.stats === 'object' ? userData.stats : null;
                    const firstChatAt =
                        userData.first_chat_at ||
                        (su ? (su.first_chat_at || su.firstChatAt) : null) ||
                        null;
                    if (firstChatAt) {
                        const t = Date.parse(String(firstChatAt));
                        if (!Number.isNaN(t)) {
                            const d = new Date(t);
                            // 展示日期：YYYY-MM-DD
                            firstChatAtText = d.toISOString().slice(0, 10);
                            const diff = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
                            const calcDays = Math.max(1, diff);
                            cursorDaysText = nf.format(calcDays);
                        }
                    }
                    // 若有 usageDays（更精准），优先覆盖天数
                    const usageDays = su && (su.usageDays ?? su.usage_days ?? su.workDays ?? su.days);
                    if (usageDays != null && Number(usageDays) > 0) {
                        cursorDaysText = nf.format(Number(usageDays));
                    }
                } catch { /* ignore */ }
                
                // 7. 人格称号（参考 index.html 的获取方式：根据 5 位 vibe_index 从 personalityNames.json 获取）
                const personalityType = userData.personality_type || userData.personalityType || userData.type || 'UNKNOWN';
                let personalityName = userData.personality_name || userData.personalityName || null;
                // 视图返回的 vibe_index 为数值（综合分），人格/答案之书需 5 位字符串：优先 vibe_index_str / vibeIndex / lpdef，否则从 detailedStats 或 l_score 等计算
                const vibeIndexStr = (typeof userData.vibe_index_str === 'string' && userData.vibe_index_str.length === 5)
                    ? userData.vibe_index_str
                    : (typeof userData.vibe_index === 'string' && userData.vibe_index.length === 5 ? userData.vibe_index : null)
                    || (typeof userData.vibeIndex === 'string' && userData.vibeIndex.length === 5 ? userData.vibeIndex : null)
                    || lpdefToVibeIndex(userData.lpdef)
                    || scoresToVibeIndexStr(userData);
                
                // 如果还没有人格称号，尝试根据 5 位 vibe_index 从 personalityNames.json 获取（参考 index.html）
                const loadPersonalityName = (vibeIndex) => {
                    return new Promise((resolve) => {
                        const idx = (vibeIndex != null && typeof vibeIndex === 'string') ? vibeIndex : String(vibeIndex || '');
                        if (!idx || idx.length !== 5) {
                            resolve(null);
                            return;
                        }
                        // 英文优先：若有外部配置/文件，则加载英文称号表
                        const tryLocal = () => {
                            try {
                                const cfg = window.__LANG_CONFIG;
                                if (currentLang === 'en' && cfg && cfg.personalityNamesEn && cfg.personalityNamesEn[idx]) {
                                    resolve(String(cfg.personalityNamesEn[idx]));
                                    return true;
                                }
                            } catch { /* ignore */ }
                            return false;
                        };
                        if (tryLocal()) return;

                        const url = (currentLang === 'en') ? 'src/personalityNames_en.json' : 'src/personalityNames.json';
                        fetch(url)
                            .then(response => {
                                if (response.ok) {
                                    return response.json();
                                }
                                throw new Error('Failed to load personalityNames.json');
                            })
                            .then(namesData => {
                                if (namesData && namesData[idx]) {
                                    console.log('[UserStats] ✅ 从 personalityNames.json 获取人格称号:', namesData[idx]);
                                    resolve(String(namesData[idx]));
                                } else {
                                    resolve(null);
                                }
                            })
                            .catch(error => {
                                console.warn('[UserStats] ⚠️ 加载 personalityNames.json 失败:', error);
                                resolve(null);
                            });
                    });
                };
                
                // 如果还没有人格称号，尝试从多个来源获取
                if (!personalityName || personalityName === '未知人格' || personalityName === '未知') {
                    try {
                        // 方法1: 从 personality JSONB 字段中获取（同步方式，立即显示）
                        const personality = userData.personality;
                        if (personality && typeof personality === 'object') {
                            personalityName = personality.name || personality.personalityName || personality.personality_name || null;
                            
                            // 如果还没有，尝试从 personality_data 或 detailedStats 中获取
                            if (!personalityName) {
                                const personalityData = userData.personality_data || userData.personalityData || personality.detailedStats || personality.detailed_stats;
                                if (personalityData && Array.isArray(personalityData) && personalityData.length > 0) {
                                    const firstDim = personalityData[0];
                                    personalityName = firstDim.personalityName || firstDim.personality_name || null;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[UserStats] ⚠️ 获取人格称号失败:', e);
                    }
                }
                
                // 调试日志：输出所有可能包含人格称号的字段
                console.log('[UserStats] 🎭 人格称号获取调试:', {
                    personality_name: userData.personality_name,
                    personalityName: userData.personalityName,
                    personality: userData.personality,
                    personality_data: userData.personality_data,
                    personalityType: personalityType,
                    vibe_index_str: userData.vibe_index_str,
                    vibe_index: userData.vibe_index,
                    vibeIndex: userData.vibeIndex,
                    lpdef: userData.lpdef,
                    vibeIndexStr: vibeIndexStr,
                    finalPersonalityName: personalityName
                });
                
                // 最终回退：若仍无人格称号，则给出可控的本地化兜底
                if (!personalityName || personalityName === '未知人格' || personalityName === '未知') {
                    const typeUpper = (personalityType && String(personalityType).toUpperCase()) || '';
                    if (personalityType && personalityType !== 'UNKNOWN' && typeUpper !== 'AUTO_REPORT') {
                        personalityName = currentLang === 'en' ? `Type ${personalityType}` : `人格 ${personalityType}`;
                    } else {
                        personalityName = getI18nText('personality.unknown') || (currentLang === 'en' ? 'Unknown Title' : '未知人格');
                    }
                }

                // 人格称号英文映射（示例：码农 -> Code Monkey/Architect）
                personalityName = translatePersonalityName(personalityName, userData);
                
                // 8. 答案之书说明（answer_book 对象）
                let answerBookTitle = currentLang === 'en' ? 'N/A' : '暂无';
                let answerBookContent = currentLang === 'en' ? 'N/A' : '暂无说明';
                let answerBookVibeLevel = '';
                
                try {
                    // 尝试解析 answer_book 字段（可能是 JSON 字符串或对象）
                    let answerBook = userData.answer_book || userData.answerBook;
                    
                    // 如果 answer_book 不存在，尝试从 personality JSONB 字段中获取
                    if (!answerBook) {
                        try {
                            const personality = userData.personality;
                            if (personality && typeof personality === 'object') {
                                answerBook = personality.answer_book || personality.answerBook;
                            }
                        } catch (e) {
                            console.warn('[UserStats] ⚠️ 从 personality 提取 answer_book 失败:', e);
                        }
                    }
                    
                    // 如果 answer_book 是字符串，尝试解析为 JSON
                    if (typeof answerBook === 'string') {
                        try {
                            answerBook = JSON.parse(answerBook);
                        } catch (e) {
                            console.warn('[UserStats] ⚠️ 解析 answer_book JSON 失败:', e);
                        }
                    }
                    
                    // 处理 answer_book 对象：今日箴言仅使用答案之书的 title 与 content，与 index 中答案之书一致
                    if (answerBook && typeof answerBook === 'object') {
                        answerBookTitle = answerBook.title || answerBookTitle;
                        answerBookContent = answerBook.content || answerBookContent || answerBook.desc || answerBook.description || answerBookContent;
                        answerBookVibeLevel = answerBook.vibe_level || answerBook.vibeLevel || answerBook.level || '';
                    }
                    
                    // 与 index 同步：若无 answer_book，优先使用 index 分析完成后写入的「答案之书」（供左侧抽屉用户）
                    if ((!answerBookTitle || answerBookTitle === '暂无') && (!answerBookContent || answerBookContent === '暂无说明')) {
                        try {
                            const saved = localStorage.getItem('user_answer_book');
                            if (saved) {
                                const ab = JSON.parse(saved);
                                if (ab && typeof ab === 'object' && (ab.title || ab.content)) {
                                    answerBookTitle = ab.title || answerBookTitle;
                                    answerBookContent = ab.content || answerBookContent || ab.desc || ab.description || answerBookContent;
                                    answerBookVibeLevel = ab.vibe_level || ab.vibeLevel || ab.level || '';
                                    console.log('[UserStats] ✅ 已从 index 传入的答案之书（localStorage）加载今日箴言:', answerBookTitle);
                                }
                            }
                        } catch (e) {
                            console.warn('[UserStats] 读取 user_answer_book 失败:', e);
                        }
                    }

                    // 中文模式：若 localStorage 注入的是英文文案，则回退用本地 JSON 的中文版本（避免中文页出现英文）
                    if (currentLang !== 'en') {
                        const hasCjk = (s) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(s || ''));
                        const looksEnglishOnly = (s) => {
                            const x = String(s || '').trim();
                            if (!x) return false;
                            if (hasCjk(x)) return false;
                            return /^[\x00-\x7F\s\S]+$/.test(x);
                        };
                        if (looksEnglishOnly(answerBookTitle) || looksEnglishOnly(answerBookContent)) {
                            answerBookTitle = '暂无';
                            answerBookContent = '暂无说明';
                        }
                    }
                    
                    // 与 index 同步：若无 answer_book 且无 localStorage，用 5 位 vibe_index（vibe_index_str/lpdef）查 JSON
                    if ((!answerBookTitle || answerBookTitle === '暂无') && (!answerBookContent || answerBookContent === '暂无说明')) {
                        const vibeIndexForBook = vibeIndexStr;
                        if (vibeIndexForBook && typeof vibeIndexForBook === 'string' && vibeIndexForBook.length === 5) {
                            try {
                                const resp = await fetch('src/answerBookByVibeIndex.json');
                                if (resp.ok) {
                                    const data = await resp.json();
                                    const entry = data[vibeIndexForBook]; // 仅用该用户 5 位 vibe_index 的条目，不用 data['default']
                                    if (entry) {
                                        answerBookTitle = (currentLang === 'zh' || currentLang === 'zh-CN') ? entry.title_zh : entry.title_en;
                                        answerBookContent = (currentLang === 'zh' || currentLang === 'zh-CN') ? entry.content_zh : entry.content_en;
                                        console.log('[UserStats] ✅ 已按 vibe_index 从 answerBookByVibeIndex.json 加载今日箴言:', answerBookTitle);
                                    }
                                    // 无对应条目时保持「暂无」/「暂无说明」，不显示硬编码 default
                                }
                            } catch (e) {
                                console.warn('[UserStats] ⚠️ 加载 answerBookByVibeIndex.json 失败:', e);
                            }
                        }
                    }
                    
                    // 不再用 roast_text 作为今日箴言：roast_text 是各维度吐槽拼接（如「【L维度】…【P维度】…」），并非答案之书对应文本
                } catch (e) {
                    console.warn('[UserStats] ⚠️ 处理 answer_book 失败:', e);
                }

                // 9. 真实评价（引用 index.html 的最终分析结果：cursor_clinical_history.analysisData.vibeResult）
                let realEvalTitle = '';
                let realEvalText = '';
                let realEvalTraits = [];
                let realEvalUsedAnswerBookFallback = false;
                try {
                    const histStr = localStorage.getItem('cursor_clinical_history') || '';
                    const hist = histStr ? JSON.parse(histStr) : null;
                    const vr = hist?.analysisData?.vibeResult || null;
                    if (vr) {
                        const containsCjk = (s) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(s || ''));
                        const pickFirstNonEmpty = (arr) => {
                            for (const x of arr) {
                                const t = String(x || '').trim();
                                if (t) return t;
                            }
                            return '';
                        };
                        const buildTraitsZhFromVibeIndex = (idx) => {
                            const s = String(idx || '').trim();
                            if (!/^\d{5}$/.test(s)) return [];
                            const toLevel = (d) => (d === '2' ? '高' : (d === '1' ? '中' : '低'));
                            const pairs = [
                                ['逻辑', toLevel(s[0])],
                                ['耐心', toLevel(s[1])],
                                ['细节', toLevel(s[2])],
                                ['探索', toLevel(s[3])],
                                ['反馈', toLevel(s[4])]
                            ];
                            return pairs.map(([k, v]) => `${k}${v}`);
                        };
                        const looksEnglishOnly = (s) => {
                            const x = String(s || '').trim();
                            if (!x) return false;
                            if (containsCjk(x)) return false;
                            // 只包含 ASCII / 拉丁字符，视为英文
                            return /^[\x00-\x7F\s\S]+$/.test(x);
                        };
                        // 过滤“交互风格指数/Standard Developer”等 answer_book 模板（该模板来自后端 answer_book 兜底，不属于真实评价）
                        const isStyleIndexTemplate = (title, text) => {
                            const t = String(title || '');
                            const x = String(text || '');
                            const joined = `${t}\n${x}`;
                            // 中文模板关键字
                            if (/交互风格指数/.test(joined) && /(标准型开发者|雄辩家|冷酷极客)/.test(joined)) return true;
                            if (/保持了平衡的沟通方式|既不过于详细|也不过于简洁/.test(joined)) return true;
                            // 英文模板关键字
                            if (/\bstyle index\b/i.test(joined) && /(standard developer|eloquent speaker|cold geek)/i.test(joined)) return true;
                            if (/neither too detailed nor too concise/i.test(joined)) return true;
                            if (/average message length/i.test(joined) && /\bstyle index\b/i.test(joined)) return true;
                            return false;
                        };
                        const loadRoastLibraryForLang = async (lang) => {
                            const safeLang = (lang === 'en') ? 'en' : 'zh';
                            try {
                                const cfg = window.__LANG_CONFIG || {};
                                const cached = (safeLang === 'en') ? cfg.roastEn : cfg.roastZh;
                                if (cached && typeof cached === 'object') return cached;
                            } catch { /* ignore */ }
                            const url = (safeLang === 'en') ? 'src/roastLibrary2.json' : 'src/roastLibrary.json';
                            try {
                                const resp = await fetch(url, { cache: 'no-cache' });
                                if (!resp.ok) return null;
                                const data = await resp.json();
                                try {
                                    const cfg = window.__LANG_CONFIG || {};
                                    window.__LANG_CONFIG = {
                                        ...cfg,
                                        ...(safeLang === 'en' ? { roastEn: data } : { roastZh: data })
                                    };
                                } catch { /* ignore */ }
                                return data;
                            } catch {
                                return null;
                            }
                        };
                        const fillRealEvalFromDossier = async () => {
                            const idx = (vibeIndexStr && typeof vibeIndexStr === 'string' && vibeIndexStr.length === 5) ? vibeIndexStr : '';
                            if (!idx) return false;
                            const lang = (currentLang === 'en') ? 'en' : 'zh';
                            const lib = await loadRoastLibraryForLang(lang);
                            const raw = lib && typeof lib === 'object' ? (lib[idx] || '') : '';
                            const s = String(raw || '').trim();
                            if (!s) return false;
                            // roastLibrary 的格式一般为 "称号: 说明..."（中英文分别使用 ： / : 都可能）
                            let titleFromLib = '';
                            let textFromLib = s;
                            const m = s.match(/^(.+?)[：:]\s*(.+)$/);
                            if (m) {
                                titleFromLib = String(m[1] || '').trim();
                                textFromLib = String(m[2] || '').trim();
                            }
                            // 标题优先用已解析的人格称号（和 index.html 同源），否则用 roast 库自带称号
                            if (!realEvalTitle) realEvalTitle = personalityName || titleFromLib || '';
                            // 正文使用人格档案说明（roast library）
                            realEvalText = textFromLib || realEvalText || '';
                            // traits：中文用五维推导，英文保持原有/或留空
                            if (lang !== 'en' && (!Array.isArray(realEvalTraits) || realEvalTraits.length === 0)) {
                                realEvalTraits = buildTraitsZhFromVibeIndex(idx).slice(0, 5);
                            }
                            return true;
                        };

                        if (currentLang === 'en') {
                            // 英文：优先使用 *_en / *En 字段（对齐 index.html reanalyzeWithLanguage 产物）
                            realEvalTitle = pickFirstNonEmpty([
                                vr.personalityNameEn,
                                vr.personality_name_en,
                                vr.personality_nameEn,
                                vr.analysis?.name_en,
                                vr.analysis?.nameEn,
                                vr.analysis_en?.name,
                                vr.analysis?.name
                            ]);
                            realEvalText = pickFirstNonEmpty([
                                vr.roastTextEn,
                                vr.roast_text_en,
                                vr.roast_textEn,
                                vr.analysis?.description_en,
                                vr.analysis?.descriptionEn,
                                vr.analysis_en?.description,
                                vr.roastText,
                                vr.roast_text,
                                vr.analysis?.description
                            ]);

                            const traitsEn =
                                vr.analysis?.traits_en ||
                                vr.analysis?.traitsEn ||
                                vr.analysis_en?.traits ||
                                vr.analysis?.traits;
                            if (Array.isArray(traitsEn)) {
                                realEvalTraits = traitsEn.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5);
                                // 英文模式下剔除含中文的 trait（避免混排）
                                realEvalTraits = realEvalTraits.filter((t) => !containsCjk(t));
                            }

                            // 过滤 answer_book 模板（交互风格指数等），并优先使用人格档案库（roastLibrary2）
                            if (isStyleIndexTemplate(realEvalTitle, realEvalText)) {
                                realEvalTitle = '';
                                realEvalText = '';
                                realEvalTraits = [];
                            }

                            // 如果仍然是中文内容：英文模式下不展示中文，用人格档案库兜底；再不行才提示
                            if (containsCjk(realEvalTitle) || containsCjk(realEvalText) || (!realEvalTitle && !realEvalText)) {
                                const ok = await fillRealEvalFromDossier().catch(() => false);
                                if (!ok) {
                                    realEvalTitle = '';
                                    realEvalTraits = [];
                                    realEvalText = 'Real evaluation is not available in English for this run.';
                                }
                            }
                        } else {
                            // 中文：标题优先用人格称号（用户可读），其次用 analysis.name
                            realEvalTitle = pickFirstNonEmpty([
                                vr.personalityNameZh,
                                vr.personality_name_zh,
                                vr.personality_nameZh,
                                vr.analysis?.name_zh,
                                vr.analysis?.nameZh,
                                vr.analysis_zh?.name,
                                vr.personalityName,
                                vr.personality_name,
                                vr.analysis?.name
                            ]);
                            // 正文优先用 roastTextZh/description_zh；否则才退回通用字段
                            realEvalText = pickFirstNonEmpty([
                                vr.roastTextZh,
                                vr.roast_text_zh,
                                vr.roast_textZh,
                                vr.analysis?.description_zh,
                                vr.analysis?.descriptionZh,
                                vr.analysis_zh?.description,
                                vr.roastText,
                                vr.roast_text,
                                vr.analysis?.description
                            ]);

                            const traitsZh =
                                vr.analysis?.traits_zh ||
                                vr.analysis?.traitsZh ||
                                vr.analysis_zh?.traits ||
                                vr.analysis?.traits;
                            if (Array.isArray(traitsZh)) {
                                realEvalTraits = traitsZh.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5);
                                // 中文模式下剔除“明显是英文句子”的 trait，避免中文页混英文标签
                                realEvalTraits = realEvalTraits.filter((t) => containsCjk(t));
                            }

                            // 过滤 answer_book 模板（交互风格指数/标准型开发者等），并优先使用人格档案库（roastLibrary）
                            if (isStyleIndexTemplate(realEvalTitle, realEvalText)) {
                                realEvalTitle = '';
                                realEvalText = '';
                                realEvalTraits = [];
                            }

                            // 中文模式：如果拿到的是英文/或空/或被过滤，则强制用“用户对应的中文人格档案说明”（roastLibrary.json）
                            if (looksEnglishOnly(realEvalTitle) || looksEnglishOnly(realEvalText) || (!realEvalTitle && !realEvalText)) {
                                const ok = await fillRealEvalFromDossier().catch(() => false);
                                if (!ok) {
                                    // 次级兜底：答案之书（避免空白，但不再使用“交互风格指数”模板）
                                    realEvalUsedAnswerBookFallback = true;
                                    try {
                                        if (answerBookTitle && answerBookTitle !== '暂无') realEvalTitle = answerBookTitle;
                                        if (answerBookContent && answerBookContent !== '暂无说明') realEvalText = answerBookContent;
                                    } catch { /* ignore */ }

                                    if ((!realEvalTitle || !realEvalText) && vibeIndexStr && typeof vibeIndexStr === 'string' && vibeIndexStr.length === 5) {
                                        try {
                                            const cfg = window.__LANG_CONFIG;
                                            const book = cfg && cfg.answerBookByVibeIndex;
                                            const entry = book ? (book[vibeIndexStr] || null) : null;
                                            if (entry) {
                                                if (!realEvalTitle) realEvalTitle = entry.title_zh || '';
                                                if (!realEvalText) realEvalText = entry.content_zh || '';
                                            }
                                        } catch { /* ignore */ }
                                    }

                                    // 标签兜底：用 vibe_index 的 5 维（L/P/D/E/F）推导中文标签
                                    if ((!Array.isArray(realEvalTraits) || realEvalTraits.length === 0) && vibeIndexStr && typeof vibeIndexStr === 'string' && vibeIndexStr.length === 5) {
                                        realEvalTraits = buildTraitsZhFromVibeIndex(vibeIndexStr).slice(0, 5);
                                    }

                                    // 最后兜底
                                    if (!realEvalTitle) realEvalTitle = '';
                                    if (!realEvalText) realEvalText = '暂无真实评价（中文文案缺失）';
                                }
                            }
                        }
                    }
                } catch { /* ignore */ }

                // 若没有 index 历史结果，也尽量给中文真实评价填入“人格档案说明”
                if (currentLang !== 'en' && (!realEvalTitle && !realEvalText)) {
                    try {
                        if (vibeIndexStr && typeof vibeIndexStr === 'string' && vibeIndexStr.length === 5) {
                            // 直接走 roastLibrary.json（避免空白）
                            const resp = await fetch('src/roastLibrary.json', { cache: 'no-cache' });
                            if (resp.ok) {
                                const lib = await resp.json();
                                const raw = lib && lib[vibeIndexStr] ? String(lib[vibeIndexStr]) : '';
                                const s = String(raw || '').trim();
                                if (s) {
                                    const m = s.match(/^(.+?)[：:]\s*(.+)$/);
                                    if (m) {
                                        realEvalTitle = personalityName || String(m[1] || '').trim();
                                        realEvalText = String(m[2] || '').trim();
                                    } else {
                                        realEvalTitle = personalityName || '';
                                        realEvalText = s;
                                    }
                                    realEvalTraits = realEvalTraits && realEvalTraits.length ? realEvalTraits : [
                                        `逻辑${vibeIndexStr[0] === '2' ? '高' : (vibeIndexStr[0] === '1' ? '中' : '低')}`,
                                        `耐心${vibeIndexStr[1] === '2' ? '高' : (vibeIndexStr[1] === '1' ? '中' : '低')}`,
                                        `细节${vibeIndexStr[2] === '2' ? '高' : (vibeIndexStr[2] === '1' ? '中' : '低')}`,
                                        `探索${vibeIndexStr[3] === '2' ? '高' : (vibeIndexStr[3] === '1' ? '中' : '低')}`,
                                        `反馈${vibeIndexStr[4] === '2' ? '高' : (vibeIndexStr[4] === '1' ? '中' : '低')}`,
                                    ].slice(0, 5);
                                }
                            }
                        }
                    } catch { /* ignore */ }
                }
                
                // 创建用户统计卡片容器
                const statsCard = document.createElement('div');
                statsCard.className = 'drawer-item';
                statsCard.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">📊</span>
                        <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">
                            ${escapeHtml(getI18nText('badge.stats') || 'STATS')}
                        </span>
                    </div>
                    
                    <div class="drawer-item-label mb-3">${getI18nText('drawer.my_stats') || 'My Stats'}</div>
                    
                    <!-- 技术排名 -->
                    <div class="mb-3 pb-3 border-b border-[#00ff41]/10">
                        <div class="drawer-item-label mb-1">${getI18nText('drawer.tech_rank') || (currentLang === 'en' ? 'Tech Rank' : '技术排名')}</div>
                        <div class="drawer-item-value text-lg">${techRankText}</div>
                        <div class="drawer-item-desc text-[8px]">TECH_RANK</div>
                    </div>

                    <!-- Cursor 上岗天数 -->
                    <div class="mb-3 pb-3 border-b border-[#00ff41]/10">
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">🕒 ${currentLang === 'en' ? 'Cursor Days' : 'Cursor 上岗天数'}</span>
                            <span class="text-[12px] text-white font-bold">${cursorDaysText} ${currentLang === 'en' ? 'days' : '天'}</span>
                        </div>
                    </div>
                    
                    <!-- 维度统计 -->
                    <div class="space-y-2 mb-3">
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">💬 ${getI18nText('metric.ai_interrogations') || (currentLang === 'en' ? 'AI Interrogations' : '调戏AI次数')}</span>
                            <span class="text-[12px] text-white font-bold">${aiCount}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">🚫 ${getI18nText('metric.jiafang') || (currentLang === 'en' ? 'Boss Mode Triggers' : '甲方上身次数')}</span>
                            <span class="text-[12px] text-white font-bold">${noCount}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">🙏 ${getI18nText('metric.ketao') || (currentLang === 'en' ? 'Cyber Kowtows' : '赛博磕头次数')}</span>
                            <span class="text-[12px] text-white font-bold">${pleaseCount}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">💭 ${getI18nText('metric.banter_total') || (currentLang === 'en' ? 'Banter Output' : '废话输出总数')}</span>
                            <span class="text-[12px] text-white font-bold">${sayTotal}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[12px] text-[#00ff41]/70">📏 ${getI18nText('metric.avg_len') || (currentLang === 'en' ? 'Avg Prompt Length' : '平均吹水长度')}</span>
                            <span class="text-[12px] text-white font-bold">${avgLength} ${getI18nText('metric.avg_len_unit') || (currentLang === 'en' ? 'chars/msg' : '字/条')}</span>
                        </div>
                    </div>
                    
                    <!-- 人格称号（与 index 一致：优先由 vibe_index 从 personalityNames.json 解析） -->
                    <div class="mb-3 pb-3 border-b border-[#00ff41]/10">
                        <div class="drawer-item-label mb-1">${getI18nText('drawer.personality_title') || (currentLang === 'en' ? 'Title' : '人格称号')}</div>
                        <div class="drawer-item-value text-sm" data-stat="personality-name">${personalityName}</div>
                        <div class="drawer-item-desc text-[8px]">${personalityType === 'AUTO_REPORT' ? '' : (personalityType || '')}</div>
                    </div>

                    ${(realEvalText || realEvalTitle) ? `
                    <div class="mb-3 pb-3 border-b border-[#00ff41]/10">
                        <div class="drawer-item-label mb-1">${currentLang === 'en' ? 'Real Evaluation' : '真实评价'}</div>
                        ${realEvalTitle ? `<div class="text-[12px] text-white font-bold mb-1">${esc(realEvalTitle)}</div>` : ''}
                        ${realEvalText ? `<div class="text-[12px] text-zinc-300 leading-relaxed">${esc(realEvalText)}</div>` : ''}
                        ${Array.isArray(realEvalTraits) && realEvalTraits.length ? `
                            <div class="mt-2 space-y-1">
                                ${realEvalTraits.map((t) => `<div class="text-[11px] text-[#00ff41]/70">- ${esc(t)}</div>`).join('')}
                            </div>
                        ` : ''}
                        <div class="drawer-item-desc text-[8px] mt-2">${currentLang === 'en' ? 'From index.html final report' : '来自 index.html 最终报告'}</div>
                    </div>
                    ` : ''}
                    
                    <!-- 答案之书（参考 index.html：去掉"答案之书"标题，只显示 title 和 content，增大正文字体） -->
                    ${(!realEvalUsedAnswerBookFallback && ((answerBookTitle && answerBookTitle !== '暂无') || (answerBookContent && answerBookContent !== '暂无说明'))) ? `
                    <div class="mb-2">
                        ${answerBookTitle && answerBookTitle !== '暂无' ? `<div class="text-[13px] text-white font-bold mb-2">${answerBookTitle}</div>` : ''}
                        <div class="text-[13px] text-[#00ff41]/80 leading-relaxed">${answerBookContent && answerBookContent !== '暂无说明' ? esc(answerBookContent) : ''}</div>
                    </div>
                    ` : ''}
                `;
                
                // 先移除旧的统计卡片（如果存在）
                const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
                existingStatsCards.forEach(card => {
                    const label = card.querySelector('.drawer-item-label');
                    if (label && label.textContent === '我的数据统计') {
                        card.remove();
                    }
                });
                
                // 将统计卡片插入到身份配置卡片之后
                const identityCard = leftBody.querySelector('.drawer-item');
                if (identityCard && identityCard.nextSibling) {
                    leftBody.insertBefore(statsCard, identityCard.nextSibling);
                } else {
                    leftBody.appendChild(statsCard);
                }
                
                // 人格称号与 index 一致：有 5 位 vibe_index（vibe_index_str/lpdef）时从 personalityNames.json 解析并更新
                if (vibeIndexStr && typeof vibeIndexStr === 'string' && vibeIndexStr.length === 5) {
                    loadPersonalityName(vibeIndexStr).then(name => {
                        if (name) {
                            const personalityNameElement = statsCard.querySelector('[data-stat="personality-name"]');
                            if (personalityNameElement) {
                                personalityNameElement.textContent = translatePersonalityName(name, userData);
                                console.log('[UserStats] ✅ 已从 personalityNames.json 更新人格称号:', name);
                            }
                        }
                    });
                }
                
                console.log('[UserStats] ✅ 用户统计卡片已渲染');
            } catch (error) {
                console.error('[UserStats] ❌ 渲染用户统计卡片失败:', error);
            }
        }

        /**
         * 从用户数据中提取维度值
         * @param {Object} userData - 用户数据对象
         * @returns {Object} 包含 6 个维度值的对象
         */
        function extractDimensionValues(userData) {
            if (!userData) {
                return {
                    ai: undefined,
                    word: undefined,
                    day: undefined,
                    no: undefined,
                    say: undefined,
                    please: undefined
                };
            }

            // ai (对话次数/赛博霸总)：优先取 question_message_count（v_top_records 视图使用），其次 total_messages
            // 字段回退：question_message_count -> total_messages -> l_score -> l -> L
            let messages = undefined;
            if (userData.question_message_count !== undefined && userData.question_message_count !== null) {
                messages = Number(userData.question_message_count);
            } else if (userData.total_messages !== undefined && userData.total_messages !== null) {
                messages = Number(userData.total_messages);
            } else if (userData.l_score !== undefined && userData.l_score !== null) {
                messages = Number(userData.l_score);
            } else if (userData.l !== undefined && userData.l !== null) {
                messages = Number(userData.l);
            } else if (userData.L !== undefined && userData.L !== null) {
                messages = Number(userData.L);
            }
            
            // say（废话输出/用户输出字符数，不含 AI）：
            // 以最精准口径统一：total_user_chars（优先）-> stats.totalChars（后端统一口径写入）-> total_chars（兼容旧数据）
            let chars = undefined;
            if (userData.total_user_chars !== undefined && userData.total_user_chars !== null && Number(userData.total_user_chars) > 0) {
                chars = Number(userData.total_user_chars);
            } else if (userData.stats && typeof userData.stats === 'object' && userData.stats.totalChars !== undefined && userData.stats.totalChars !== null && Number(userData.stats.totalChars) > 0) {
                chars = Number(userData.stats.totalChars);
            } else if (userData.totalUserChars !== undefined && userData.totalUserChars !== null && Number(userData.totalUserChars) > 0) {
                chars = Number(userData.totalUserChars);
            } else if (userData.total_chars !== undefined && userData.total_chars !== null && Number(userData.total_chars) > 0) {
                chars = Number(userData.total_chars);
            } else if (userData.p_score !== undefined && userData.p_score !== null && Number(userData.p_score) > 0) {
                chars = Number(userData.p_score);
            } else if (userData.p !== undefined && userData.p !== null && Number(userData.p) > 0) {
                chars = Number(userData.p);
            } else if (userData.P !== undefined && userData.P !== null && Number(userData.P) > 0) {
                chars = Number(userData.P);
            }
            
            // word（平均吹水长度，用户口径）：优先 avg_user_message_length，否则用 chars/messages 计算
            let word = undefined;
            if (userData.avg_user_message_length !== undefined && userData.avg_user_message_length !== null && Number(userData.avg_user_message_length) > 0) {
                word = Number(userData.avg_user_message_length);
            } else if (userData.avgMessageLength !== undefined && userData.avgMessageLength !== null && Number(userData.avgMessageLength) > 0) {
                word = Number(userData.avgMessageLength);
            } else if (userData.avgUserMessageLength !== undefined && userData.avgUserMessageLength !== null && Number(userData.avgUserMessageLength) > 0) {
                word = Number(userData.avgUserMessageLength);
            }
            // 如果 word 未定义或为 0，且 messages > 0 且 chars > 0，必须通过公式实时计算
            if ((word === undefined || word === 0) && messages !== undefined && messages > 0 && chars !== undefined && chars > 0) {
                word = Math.round(chars / messages);
            }
            
            // day（Cursor 上岗天数）：优先 stats.usageDays（最精准），否则按 first_chat_at 计算
            let day = undefined;
            try {
                const su = userData.stats && typeof userData.stats === 'object' ? userData.stats : null;
                const usageDays = su && (su.usageDays ?? su.usage_days ?? su.workDays ?? su.days);
                if (usageDays != null && Number(usageDays) > 0) {
                    day = Number(usageDays);
                } else {
                    const firstChatAt = userData.first_chat_at || (su ? (su.first_chat_at || su.firstChatAt) : null) || null;
                    const t = firstChatAt ? Date.parse(String(firstChatAt)) : NaN;
                    if (Number.isFinite(t)) {
                        const diff = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
                        day = Math.max(1, diff);
                    }
                }
            } catch { /* ignore */ }
            
            // no (甲方上身)：映射 jiafang_count
            // 字段回退：jiafang_count -> f_score -> f -> F
            let no = undefined;
            if (userData.jiafang_count !== undefined && userData.jiafang_count !== null) {
                no = Number(userData.jiafang_count);
            } else if (userData.f_score !== undefined && userData.f_score !== null) {
                no = Number(userData.f_score);
            } else if (userData.f !== undefined && userData.f !== null) {
                no = Number(userData.f);
            } else if (userData.F !== undefined && userData.F !== null) {
                no = Number(userData.F);
            }
            
            // please (赛博磕头)：映射 ketao_count
            // 字段回退：ketao_count -> e_score -> e -> E
            let please = undefined;
            if (userData.ketao_count !== undefined && userData.ketao_count !== null) {
                please = Number(userData.ketao_count);
            } else if (userData.e_score !== undefined && userData.e_score !== null) {
                please = Number(userData.e_score);
            } else if (userData.e !== undefined && userData.e !== null) {
                please = Number(userData.e);
            } else if (userData.E !== undefined && userData.E !== null) {
                please = Number(userData.E);
            }

            return { 
                ai: messages, 
                word, 
                day, 
                no, 
                say: chars, 
                please 
            };
        }

        /**
         * 计算每个维度相对于其最大值的比例，找出最高项
         * @param {Object} values - 维度值对象
         * @returns {string|null} 最高项的维度ID，如果所有值都为0则返回null
         */
        function findTopDimension(values) {
            // 定义每个维度的最大值（用于计算相对比例）
            const maxValues = {
                ai: 10000,      // 对话次数可能很大
                word: 1000,     // 平均字数
                day: 365,       // 天数
                no: 100,        // 否定次数
                say: 100000,    // 总字数
                please: 100     // 礼貌次数
            };

            let topDim = null;
            let maxRatio = -1;

            for (const [dimId, value] of Object.entries(values)) {
                const maxValue = maxValues[dimId] || 100;
                const ratio = value / maxValue;
                if (ratio > maxRatio && value > 0) {
                    maxRatio = ratio;
                    topDim = dimId;
                }
            }

            return topDim;
        }

        /**
         * 渲染 6 个维度排名卡片
         * @param {Object} userData - 用户数据对象（从 Supabase 返回），如果为 null 则显示默认值
         */
        function renderRankCards(userData) {
            const container = document.getElementById('rank-cards-container');
            if (!container) {
                console.warn('[Rank] ⚠️ rank-cards-container 容器不存在');
                return;
            }

            if (!RANK_RESOURCES) {
                console.warn('[Rank] ⚠️ RANK_RESOURCES 未加载，无法渲染卡片');
                container.innerHTML = '<div class="col-span-full text-center text-zinc-500 py-4 text-sm">维度排名数据加载中...</div>';
                return;
            }

            // 数据判别：定义变量 const isGlobalTopMode = !userData
            const isGlobalTopMode = !userData;
            
            // UI 反馈优化：如果识别到是本地指纹匹配的用户，在抽屉标题增加"当前设备/This Device"标识
            if (userData && window.currentUserMatchedByFingerprint) {
                try {
                    const leftTitle = document.getElementById('left-drawer-title');
                    if (leftTitle) {
                        // 检查标题是否已经包含"当前设备/This Device"，避免重复添加
                        const currentText = leftTitle.textContent || '';
                        if (!currentText.includes('（当前设备）') && !/\(This Device\)/i.test(currentText)) {
                            const suffix = getI18nText('common.current_device') || (currentLang === 'en' ? ' (This Device)' : '（当前设备）');
                            leftTitle.textContent = currentText + suffix;
                            console.log('[Rank] ✅ 已更新左侧抽屉标题，添加"（当前设备）"标识');
                        }
                    }
                } catch (e) {
                    console.warn('[Rank] ⚠️ 更新抽屉标题失败:', e);
                }
            }

            // 维度配置（名称/单位随语言切换）
            const dimensionConfig = {
                ai: { name: translateDimensionName('ai'), icon: DIMENSION_NAME_I18N.ai?.icon || '💬', suffix: translateDimensionSuffix('ai') },
                word: { name: translateDimensionName('word'), icon: DIMENSION_NAME_I18N.word?.icon || '📏', suffix: translateDimensionSuffix('word') },
                day: { name: translateDimensionName('day'), icon: DIMENSION_NAME_I18N.day?.icon || '📅', suffix: translateDimensionSuffix('day') },
                no: { name: translateDimensionName('no'), icon: DIMENSION_NAME_I18N.no?.icon || '🚫', suffix: translateDimensionSuffix('no') },
                say: { name: translateDimensionName('say'), icon: DIMENSION_NAME_I18N.say?.icon || '💭', suffix: translateDimensionSuffix('say') },
                please: { name: translateDimensionName('please'), icon: DIMENSION_NAME_I18N.please?.icon || '🙏', suffix: translateDimensionSuffix('please') }
            };

            // 确保包含所有 6 个维度
            const allDimensions = ['ai', 'word', 'day', 'no', 'say', 'please'];
            
            // 清空容器
            container.innerHTML = '';

            // 遍历 6 个维度，生成卡片
            allDimensions.forEach((dimId, index) => {
                const config = dimensionConfig[dimId];
                if (!config) {
                    console.warn(`[Rank] ⚠️ 维度 ${dimId} 配置不存在`);
                    return;
                }

                // 维度选拔逻辑
                let targetData = null;
                let maxValue = 0;
                let targetUserName = '';
                let targetIpLocation = null; // 记录冠军用户的 ip_location（国家代码）

                if (isGlobalTopMode) {
                    // 【全球选拔模式】优先使用后端返回的 topRecords（各维度最高记录）
                    const globalDataForTop = window.lastData || {};
                    const topRecords = globalDataForTop.topRecords || {};
                    
                    // 优先使用 topRecords 中的数据
                    if (topRecords[dimId]) {
                        targetData = topRecords[dimId];
                        const targetValues = extractDimensionValues(targetData);
                        maxValue = targetValues[dimId] !== undefined && targetValues[dimId] !== null ? targetValues[dimId] : undefined;
                        targetUserName = targetData.user_name || targetData.name || targetData.github_username || '全球最强';
                        targetIpLocation = targetData.ip_location || null;
                        console.log(`[Rank] ✅ 使用 topRecords 数据 (${dimId}):`, maxValue, targetUserName);
                    } else {
                        // 降级：使用 window.allData 找出各维度的最大值用户
                        const allData = window.allData || [];
                        if (allData.length > 0) {
                            targetData = allData.reduce((maxUser, currentUser) => {
                                const currentValues = extractDimensionValues(currentUser);
                                const maxValues = extractDimensionValues(maxUser);
                                const currentValue = currentValues[dimId] !== undefined && currentValues[dimId] !== null ? currentValues[dimId] : 0;
                                const maxValue = maxValues[dimId] !== undefined && maxValues[dimId] !== null ? maxValues[dimId] : 0;
                                return currentValue > maxValue ? currentUser : maxUser;
                            }, allData[0]);
                            
                            const targetValues = extractDimensionValues(targetData);
                            maxValue = targetValues[dimId] !== undefined && targetValues[dimId] !== null ? targetValues[dimId] : undefined;
                            targetUserName = targetData.user_name || targetData.name || targetData.github_username || '未知用户';
                            // 身份标记：记录该冠军用户的 ip_location（国家代码，如 "US", "CN"）
                            targetIpLocation = targetData.ip_location || null;
                        } else {
                            // 【全局数据兜底】如果没有 allData，使用全局 averages 数据
                            // 从 window.lastData 或全局变量中获取 averages
                            const globalDataForAvg = window.lastData || {};
                            const averages = globalDataForAvg.averages || globalDataForAvg.globalAverage || {};
                            const totalUsers = Number(globalDataForAvg.totalUsers) || 1;
                            
                            // 【修复维度映射】根据最新的 API 结构重新绑定
                            // 修正卡片 ID 映射：jiafang 对应 jiafang_count，ketao 对应 ketao_count
                            // 使用全球最强记录（jiafang_count > 0）或全局 averages 数据
                            let avgValue = undefined;
                            
                            // 优先使用全球最强记录
                            const championRecord = window.globalChampionRecord;
                            
                            if (dimId === 'ai') {
                                // 分析总量：绑定到 json.totalAnalysis
                                if (globalDataForAvg.totalAnalysis !== undefined && globalDataForAvg.totalAnalysis !== null) {
                                    avgValue = Number(globalDataForAvg.totalAnalysis);
                                }
                            } else if (dimId === 'word') {
                                // 平均长度需要计算：如果有 totalChars 和 totalMessages，计算平均值
                                const totalChars = globalDataForAvg.totalChars !== undefined && globalDataForAvg.totalChars !== null ? Number(globalDataForAvg.totalChars) : (globalDataForAvg.totalRoastWords !== undefined && globalDataForAvg.totalRoastWords !== null ? Number(globalDataForAvg.totalRoastWords) : undefined);
                                const totalMessages = globalDataForAvg.totalAnalysis !== undefined && globalDataForAvg.totalAnalysis !== null ? Number(globalDataForAvg.totalAnalysis) : undefined;
                                if (totalChars !== undefined && totalMessages !== undefined && totalMessages > 0) {
                                    avgValue = Math.round(totalChars / totalMessages);
                                } else if (averages.P !== undefined && averages.P !== null) {
                                    avgValue = Number(averages.P);
                                }
                            } else if (dimId === 'day') {
                                // 上岗天数：绑定到 json.systemDays
                                if (globalDataForAvg.systemDays !== undefined && globalDataForAvg.systemDays !== null) {
                                    avgValue = Number(globalDataForAvg.systemDays);
                                } else if (championRecord && championRecord.work_days !== undefined && championRecord.work_days !== null) {
                                    avgValue = Number(championRecord.work_days);
                                }
                            } else if (dimId === 'no') {
                                // 甲方上身：映射 jiafang_count
                                if (championRecord && championRecord.jiafang_count !== undefined && championRecord.jiafang_count !== null) {
                                    avgValue = Number(championRecord.jiafang_count);
                                } else if (averages.L !== undefined && averages.L !== null) {
                                    avgValue = Number(averages.L);
                                }
                            } else if (dimId === 'say') {
                                // 总字数：使用 totalChars 或 totalRoastWords
                                if (globalDataForAvg.totalChars !== undefined && globalDataForAvg.totalChars !== null) {
                                    avgValue = Number(globalDataForAvg.totalChars);
                                } else if (globalDataForAvg.totalRoastWords !== undefined && globalDataForAvg.totalRoastWords !== null) {
                                    avgValue = Number(globalDataForAvg.totalRoastWords);
                                }
                            } else if (dimId === 'please') {
                                // 赛博磕头：映射 ketao_count
                                if (championRecord && championRecord.ketao_count !== undefined && championRecord.ketao_count !== null) {
                                    avgValue = Number(championRecord.ketao_count);
                                } else if (averages.P !== undefined && averages.P !== null) {
                                    avgValue = Number(averages.P);
                                }
                            }
                            
                            maxValue = avgValue;
                            // 当 totalUsers 为 1 时，显示 SYSTEM BASE
                            targetUserName = totalUsers <= 1 ? 'SYSTEM BASE' : 'GLOBAL AVG';
                            targetIpLocation = null;
                        }
                    }
                } else {
                    // 如果 userData 存在，则 targetData 始终为当前用户
                    targetData = userData;
                    const values = extractDimensionValues(userData);
                    maxValue = values[dimId] !== undefined && values[dimId] !== null ? values[dimId] : undefined;
                    
                    // 确定显示的用户名：如果是纯指纹用户（无 GitHub ID），显示"匿名专家 [指纹前6位]"
                    const userFingerprint = userData.fingerprint || userData.user_fingerprint || userData.user_identity;
                    const userGithubId = userData.github_username || userData.github_id;
                    const userName = userData.user_name || userData.name;
                    
                    if (!userGithubId && !userName && userFingerprint) {
                        // 纯指纹用户：显示"匿名专家 [指纹前6位]"
                        const fingerprintPrefix = String(userFingerprint).substring(0, 6).toUpperCase();
                        targetUserName = `匿名专家 ${fingerprintPrefix}`;
                    } else {
                        // 有 GitHub ID 或用户名的用户
                        targetUserName = userName || userGithubId || '我的数据';
                    }
                    
                    targetIpLocation = userData.ip_location || null;
                }

                // 调用 getRankFeedback(dimId, maxValue) 获取对应的等级 label 和吐槽 content
                // 确保即使是全球最强，文案也是从该维度的最高等级区间中随机抽取的
                const feedback = getRankFeedback(dimId, maxValue);

                // 【状态兜底】当 totalUsers 为 1 时，硬编码显示 TOP 1 或 SYSTEM BASE
                const globalDataForStatus = window.lastData || {};
                const totalUsers = Number(globalDataForStatus.totalUsers) || 1;
                let statusLabel = isGlobalTopMode ? 'TOP' : 'MINE';
                let feedbackLabel = feedback ? translateRankFeedbackLabel(dimId, feedback.label, maxValue) : 'RANKED';
                
                // 如果 totalUsers 为 1，排名统一显示为 TOP 1
                if (totalUsers <= 1) {
                    statusLabel = 'TOP 1';
                    if (isGlobalTopMode) {
                        feedbackLabel = 'SYSTEM BASE';
                    }
                }

                // 找出最高项（用于个人模式下的 TOP 标识）
                let isTop = false;
                if (!isGlobalTopMode && targetData) {
                    const values = extractDimensionValues(targetData);
                    const topDim = findTopDimension(values);
                    isTop = topDim === dimId;
                }

                // 数值处理：say (总字数) 使用 Intl.NumberFormat('zh-CN').format() 进行千分位格式化
                // 单位补全：根据 RANK_RESOURCES 自动补全单位（次、字、天等）
                // 彻底删除硬编码，如果接口有值则必须显示接口的值
                let displayVal;
                let unit = config.suffix || '';
                if (maxValue !== undefined && maxValue !== null) {
                    const nfCard = new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'zh-CN');
                    if (dimId === 'say') {
                        displayVal = nfCard.format(maxValue);
                    } else {
                        displayVal = nfCard.format(maxValue);
                    }
                } else {
                    displayVal = 'N/A';
                }

                // 获取资源信息（用于显示维度名称）
                const resource = RANK_RESOURCES && RANK_RESOURCES[dimId] ? RANK_RESOURCES[dimId] : null;
                
                // 创建卡片元素
                // 赛博风格：背景 bg-[#050505]/60 配合 backdrop-blur-xl
                // 悬浮时上移 hover:-translate-y-2，边框由暗绿变为亮绿，并出现赛博转角扫描线
                const card = document.createElement('div');
                card.className = `cursor-pointer flex-1 min-w-0 bg-[#050505]/60 backdrop-blur-xl border border-[#00ff41]/20 p-3 rounded-sm transition-all duration-300 hover:-translate-y-2 hover:border-[#00ff41] hover:shadow-[0_0_20px_rgba(0,255,65,0.4)] relative group pointer-events-auto overflow-visible`;
                
                // 存储维度ID和国家代码，用于地图联动
                card.setAttribute('data-dim-id', dimId);
                if (targetIpLocation) {
                    card.setAttribute('data-ip-location', targetIpLocation);
                }
                // 存储冠军信息，用于地图弹窗展示
                card.setAttribute('data-champion-name', targetUserName);
                card.setAttribute('data-champion-value', maxValue);
                card.setAttribute('data-champion-feedback', feedback ? JSON.stringify(feedback) : '');
                
                // 卡片内容：赛博风格模板
                // 数字：所有卡片数值文字颜色统一改为纯白色 (text-white)，增加 drop-shadow
                card.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">${config.icon}</span>
                        <span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5 z-10 relative">
                            ${statusLabel}
                        </span>
                    </div>

                    <div class="text-[9px] text-[#00ff41]/50 uppercase tracking-widest mb-1 truncate">
                        ${config.name}
                    </div>

                    <div class="text-2xl font-bold text-white font-mono truncate leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                        ${displayVal}<span class="text-[10px] ml-1 font-normal opacity-70">${unit}</span>
                    </div>

                    <div class="mt-2 pt-2 border-t border-[#00ff41]/10 flex flex-col gap-0.5">
                        <div class="text-[10px] text-white font-bold truncate">
                            ${feedbackLabel}
                        </div>
                        <div class="text-[8px] text-[#00ff41]/60 truncate italic">
                            @${targetUserName || 'ANONYMOUS'}
                        </div>
                    </div>

                    <!-- 赛博转角扫描线 -->
                    <div class="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-[#00ff41] scale-0 group-hover:scale-100 transition-transform opacity-0 group-hover:opacity-100"></div>
                    <div class="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b border-r border-[#00ff41] scale-0 group-hover:scale-100 transition-transform opacity-0 group-hover:opacity-100"></div>
                    <div class="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-[#00ff41] scale-0 group-hover:scale-100 transition-transform opacity-0 group-hover:opacity-100"></div>
                    <div class="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b border-l border-[#00ff41] scale-0 group-hover:scale-100 transition-transform opacity-0 group-hover:opacity-100"></div>
                `;

                // 地图联动交互：为每个卡片绑定点击监听器
                card.addEventListener('click', () => {
                    const ipLocation = card.getAttribute('data-ip-location');
                    if (ipLocation && mapChart && !(typeof mapChart.isDisposed === 'function' && mapChart.isDisposed())) {
                        // 将国家代码转换为地图上的国家名称
                        let countryName = null;
                        if (countryNameMap && countryNameMap[ipLocation]) {
                            // 使用英文名称（地图使用英文名称）
                            countryName = countryNameMap[ipLocation].en;
                        } else {
                            // 如果没有映射，尝试直接使用 ip_location（可能是完整的国家名称）
                            countryName = ipLocation;
                        }
                        
                        if (countryName) {
                            // 获取冠军信息，存储到全局变量中，用于地图弹窗展示
                            const championName = card.getAttribute('data-champion-name');
                            const championValue = card.getAttribute('data-champion-value');
                            const championFeedback = card.getAttribute('data-champion-feedback');
                            const dimId = card.getAttribute('data-dim-id');
                            
                            // 存储当前选中的冠军信息
                            currentChampionInfo = {
                                countryName: countryName,
                                championName: championName,
                                championValue: championValue,
                                feedback: championFeedback,
                                dimId: dimId
                            };
                            
                            // 使用 ECharts 实例方法高亮显示地图上对应的国家
                            try {
                                // 方法1：使用 dispatchAction 触发 highlight 动作
                                mapChart.dispatchAction({
                                    type: 'highlight',
                                    name: countryName
                                });
                                
                                // 方法2：使用 showTip 显示 tooltip（会触发 formatter，显示冠军信息）
                                mapChart.dispatchAction({
                                    type: 'showTip',
                                    name: countryName
                                });
                                
                                console.log(`[Rank] ✅ 点击卡片，高亮国家: ${countryName} (${ipLocation})`);
                                console.log(`[Rank] 📊 冠军信息: ${championName}, 数值: ${championValue}, 维度: ${dimId}`);
                            } catch (error) {
                                console.error('[Rank] ❌ 高亮国家失败:', error);
                            }
                        } else {
                            console.warn(`[Rank] ⚠️ 无法找到国家名称，ip_location: ${ipLocation}`);
                        }
                    } else if (!ipLocation) {
                        console.warn(`[Rank] ⚠️ 该维度冠军没有 ip_location 信息`);
                    } else {
                        console.warn(`[Rank] ⚠️ 地图实例未初始化或已销毁`);
                    }
                });

                container.appendChild(card);
            });

            console.log(`[Rank] ✅ 维度排名卡片渲染完成 (模式: ${isGlobalTopMode ? '全球最强' : '个人数据'})`);
            
            // 如果检测到用户数据且左侧抽屉已打开，自动刷新用户统计卡片
            if (userData && !isGlobalTopMode) {
                try {
                    const leftDrawer = document.getElementById('left-drawer');
                    const leftBody = document.getElementById('left-drawer-body');
                    
                    // 检查左侧抽屉是否打开（通过检查 active class）
                    if (leftDrawer && leftBody) {
                        const isDrawerOpen = leftDrawer.classList.contains('active');
                        
                        if (isDrawerOpen) {
                            // 重新渲染用户统计卡片（优先使用 allData 中的完整记录）
                            renderUserStatsCards(leftBody, getBestUserRecordForStats(userData));
                            console.log('[Rank] ✅ 已自动刷新左侧抽屉的用户统计卡片');
                        }
                    }
                } catch (e) {
                    console.warn('[Rank] ⚠️ 刷新左侧抽屉统计卡片失败:', e);
                }
            }
        }


        window.onload = async () => {
            // 加载保存的GitHub用户名（兼容旧代码）
            loadGitHubUsername();

            // 初始化语言配置（可选外部 JSON）并刷新语言上下文
            try { await loadLanguageConfig(); } catch { /* ignore */ }
            try { updateLanguageContext(); } catch { /* ignore */ }

            // 初始化地图光标工具（校准入口 + 提示）
            initMapCursorTools();
            
            // 初始化状态按钮
            initStatusButtons();
            
            // 初始化抽屉状态
            initDrawerState();
            
            // 加载维度排名数据资源
            await loadRankResources();
            
            // 先执行初始数据加载（增强错误处理）
            try {
                await fetchData();
            } catch (fetchError) {
                console.error('[Window.onload] ❌ fetchData 失败:', fetchError);
                // 即使数据加载失败，也继续执行后续初始化
            }
            
            // ============================================
            // 【新增】初始化 GitHub OAuth 认证监听
            // ============================================
            if (supabaseClient) {
                // 检查当前会话
                try {
                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                    
                    if (sessionError) {
                        console.warn('[Auth] ⚠️ 获取会话失败:', sessionError);
                    } else if (session) {
                        console.log('[Auth] ✅ 检测到现有会话，自动处理认证状态');
                        await handleAuthStateChange(session);
                    } else {
                        console.log('[Auth] ℹ️ 未检测到会话，显示登录按钮');
                        updateAuthUI(null);
                    }
                } catch (error) {
                    console.error('[Auth] ❌ 初始化认证监听失败:', error);
                }
                
                // 监听认证状态变化
                supabaseClient.auth.onAuthStateChange(async (event, session) => {
                    console.log('[Auth] 🔔 认证状态变化事件:', event, session ? '有会话' : '无会话');
                    
                    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        await handleAuthStateChange(session);
                        
                        // 【Task 3】当 event === 'SIGNED_IN' 时，显式调用一次 window.refreshUserStats() 和 fetchAllData()
                        if (event === 'SIGNED_IN') {
                            console.log('[Auth] 🔄 用户登录成功，触发数据刷新...');
                            try {
                                // 先刷新全局数据
                                if (typeof fetchData === 'function') {
                                    await fetchData();
                                    console.log('[Auth] ✅ fetchData 执行完成');
                                }
                                
                                // 再刷新用户统计数据
                                if (typeof window.refreshUserStats === 'function') {
                                    try {
                                        await window.refreshUserStats();
                                        console.log('[Auth] ✅ refreshUserStats 执行完成');
                                    } catch (refreshError) {
                                        // 【修复 AbortError】特殊处理 AbortError
                                        if (refreshError.name === 'AbortError' || refreshError.message?.includes('aborted')) {
                                            console.log('[Auth] ℹ️ refreshUserStats 被取消（可能是页面刷新导致）');
                                        } else {
                                            console.error('[Auth] ❌ refreshUserStats 执行失败:', refreshError);
                                        }
                                    }
                                }
                            } catch (refreshError) {
                                // 【修复 AbortError】特殊处理 AbortError
                                if (refreshError.name === 'AbortError' || refreshError.message?.includes('aborted')) {
                                    console.log('[Auth] ℹ️ 数据刷新被取消（可能是页面刷新导致）');
                                } else {
                                    console.error('[Auth] ❌ 数据刷新失败:', refreshError);
                                }
                            }
                        }
                    } else if (event === 'SIGNED_OUT') {
                        await handleAuthStateChange(null);
                    }
                });
                
                console.log('[Auth] ✅ 认证状态监听已启动');
            } else {
                console.warn('[Auth] ⚠️ Supabase 客户端未初始化，无法启动认证监听');
                // 延迟重试
                setTimeout(async () => {
                    if (supabaseClient) {
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        if (session) {
                            await handleAuthStateChange(session);
                        } else {
                            updateAuthUI(null);
                        }
                    }
                }, 1000);
            }
            
            // 页面加载后立即显示 LPDEF 分值：执行身份检查（增强身份识别逻辑）
            try {
                // 辅助函数：规范化指纹字符串（忽略大小写并剔除首尾空格）
                const normalizeFingerprint = (fp) => {
                    if (!fp) return '';
                    return String(fp).trim().toLowerCase();
                };
                
                // 1. 生成或获取当前设备的 Fingerprint（增加异常处理）
                // 【优化】使用统一的指纹获取函数，确保一致性
                let currentFingerprint = await getCurrentFingerprint();
                
                if (!currentFingerprint) {
                    console.warn('[LPDEF] ⚠️ 无法获取或生成指纹');
                } else {
                    console.log('[LPDEF] 🔑 当前设备 Fingerprint:', currentFingerprint.substring(0, 8) + '...');
                }
                
                // 规范化当前指纹
                const normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                
                // 2. 从 localStorage 获取 github_username（增加异常处理）
                let localGitHubName = null;
                try {
                    localGitHubName = localStorage.getItem('github_username');
                } catch (e) {
                    console.warn('[LPDEF] ⚠️ 读取 localStorage github_username 失败:', e);
                }
                
                // 3. 【优化】优先从已加载的 allData 数组中查找匹配项（避免额外的 API 调用）
                const allData = window.allData || [];
                console.log('[LPDEF] 📊 allData 数据量:', allData.length);
                
                let currentUser = null;
                let matchedByFingerprint = false;
                
                // 【优先级1】首先从 allData 中查找 fingerprint 匹配的记录
                if (normalizedCurrentFingerprint && allData.length > 0) {
                    console.log('[LPDEF] 🔍 开始从 allData 中查找指纹匹配...');
                    
                    currentUser = allData.find(user => {
                        const userFingerprint = normalizeFingerprint(user.fingerprint || user.user_fingerprint);
                        const userIdentity = normalizeFingerprint(user.user_identity);
                        
                        const matchFingerprint = userFingerprint && userFingerprint === normalizedCurrentFingerprint;
                        const matchIdentity = userIdentity && userIdentity === normalizedCurrentFingerprint;
                        
                        if (matchFingerprint || matchIdentity) {
                            console.log('[LPDEF] ✅ 在 allData 中找到指纹匹配:', {
                                id: user.id,
                                user_name: user.user_name || user.name,
                                fingerprint: user.fingerprint ? user.fingerprint.substring(0, 8) + '...' : null
                            });
                            matchedByFingerprint = true;
                            return true;
                        }
                        return false;
                    });
                    
                    if (currentUser) {
                        console.log('[LPDEF] ✅ 通过本地 allData 匹配到用户:', currentUser.user_name || currentUser.name);
                    } else {
                        console.log('[LPDEF] ℹ️ 在 allData 中未找到指纹匹配');
                    }
                }
                
                // 【优先级2】如果 allData 中未找到，且 Supabase 客户端已初始化，尝试直接查询数据库
                if (!currentUser && normalizedCurrentFingerprint && supabaseClient) {
                    try {
                        console.log('[LPDEF] 🔍 allData 中未找到，尝试从 Supabase 直接查询（使用统一视图）...');
                        
                        // 【Task 2】使用统一视图 v_unified_analysis_v2
                        const { data: dbUser, error: queryError } = await supabaseClient
                            .from('v_unified_analysis_v2')
                            .select('*')
                            .eq('fingerprint', currentFingerprint)
                            .maybeSingle();
                        
                        if (queryError && queryError.code !== 'PGRST116') {
                            console.warn('[LPDEF] ⚠️ Supabase 查询失败:', queryError);
                        } else if (dbUser) {
                            console.log('[LPDEF] ✅ 从 Supabase 查询到用户:', dbUser.user_name || dbUser.name);
                            
                            // 将查询到的用户添加到 allData
                            const existingIndex = allData.findIndex(item => item.id === dbUser.id);
                            if (existingIndex !== -1) {
                                allData[existingIndex] = { ...allData[existingIndex], ...dbUser };
                            } else {
                                allData.push(dbUser);
                            }
                            window.allData = allData;
                            
                            currentUser = dbUser;
                            matchedByFingerprint = true;
                        } else {
                            console.log('[LPDEF] ℹ️ Supabase 中未找到匹配的用户');
                        }
                    } catch (error) {
                        console.warn('[LPDEF] ⚠️ Supabase 查询出错:', error);
                    }
                }
                
                // 4. URL 参数支持：如果 URL 中带了 id 参数，强制使用该 ID 进行匹配（用于测试）
                const urlParams = new URLSearchParams(window.location.search);
                const urlId = urlParams.get('id');
                if (urlId) {
                    console.log('[Rank] 🔍 检测到 URL 参数 id:', urlId, '，将强制使用该 ID 进行匹配');
                    const urlMatchedUser = allData.find(user => {
                        const userId = (user.id || '').toString();
                        const userFingerprint = (user.fingerprint || user.user_identity || '').toString();
                        return userId === urlId || userFingerprint === urlId;
                    });
                    if (urlMatchedUser) {
                        currentUser = urlMatchedUser;
                        console.log('[Rank] ✅ 通过 URL 参数 id 找到用户:', currentUser.user_name || currentUser.name);
                    }
                }
                
                // 5. 如果指纹未匹配，再退而求其次寻找 github_username
                if (!currentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                    const normalizedLocalGitHub = normalizeFingerprint(localGitHubName);
                    currentUser = allData.find(user => {
                        const userGithubId = normalizeFingerprint(user.github_username || user.github_id || '');
                        return userGithubId && userGithubId === normalizedLocalGitHub;
                    });
                    
                    if (currentUser) {
                        console.log('[Rank] ✅ 通过 GitHub ID 找到用户:', currentUser.user_name || currentUser.name);
                    }
                }
                
                // 6. 兜底匹配 - 如果 fingerprint 为空，尝试通过 id 或 user_name 匹配
                if (!currentUser && !normalizedCurrentFingerprint) {
                    try {
                        const savedUserId = localStorage.getItem('user_id');
                        if (savedUserId) {
                            currentUser = allData.find(user => {
                                return user.id && user.id.toString() === savedUserId.toString();
                            });
                        }
                        
                        if (!currentUser) {
                            const savedUserName = localStorage.getItem('user_name');
                            if (savedUserName) {
                                currentUser = allData.find(user => {
                                    return user.user_name && user.user_name.toString() === savedUserName.toString();
                                });
                            }
                        }
                    } catch (e) {
                        console.warn('[Rank] ⚠️ 兜底匹配时读取 localStorage 失败:', e);
                    }
                }
                
                // 保存匹配方式到全局变量，供 renderRankCards 使用
                if (currentUser) {
                    window.currentUser = currentUser;
                    window.currentUserMatchedByFingerprint = matchedByFingerprint;
                }
                
                // 4. 自动补齐逻辑：如果在库里找到了当前设备的 Fingerprint，但该记录的 user_name 是 "Guest" 且 github_id 为空
                if (currentUser && currentFingerprint) {
                    const userGithubId = currentUser.github_username || currentUser.github_id || null;
                    const userName = currentUser.user_name || currentUser.name || '';
                    const isGuestUser = userName.includes('Guest') || userName === '匿名受害者' || !userGithubId;
                    
                    // 如果用户已经在 stats2.html 设置了 GitHub 用户名，立即发起 PATCH 请求绑定
                    if (isGuestUser && localGitHubName && isValidGitHubUsername(localGitHubName) && !userGithubId) {
                        console.log('[LPDEF] 🔗 检测到 Guest 用户，尝试绑定 GitHub ID:', localGitHubName);
                        
                        // 发起 PATCH 请求，更新数据库记录
                        if (supabaseClient) {
                            try {
                                // 【关键修复】登录后必须使用 user_id 进行更新，而不是 fingerprint
                                let updateField = 'id';
                                let updateValue = currentUser.id;
                                
                                // 检查是否已登录
                                try {
                                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                                    if (!sessionError && session && session.user) {
                                        const authenticatedUserId = session.user.id;
                                        // 如果已登录，优先使用登录的 user_id
                                        if (authenticatedUserId && currentUser.id === authenticatedUserId) {
                                            updateField = 'id';
                                            updateValue = authenticatedUserId;
                                            console.log('[LPDEF] ✅ 已登录，使用 user_id 进行更新（认祖归宗）');
                                        }
                                    }
                                } catch (authError) {
                                    console.warn('[LPDEF] ⚠️ 检查登录状态失败:', authError);
                                }
                                
                                // 如果未登录或 user_id 不匹配，使用降级方案
                                if (!updateValue || updateField !== 'id') {
                                    updateField = currentUser.fingerprint ? 'fingerprint' : (currentUser.user_identity ? 'user_identity' : 'id');
                                    updateValue = currentUser.fingerprint || currentUser.user_identity || currentUser.id;
                                    console.log('[LPDEF] ⚠️ 未登录，使用降级方案:', updateField);
                                }
                                
                                if (updateField && updateValue) {
                                    // 【修复 400 错误】移除不存在的 github_username 字段，只更新 user_name
                                    const { data, error } = await supabaseClient
                                        .from('user_analysis')
                                        .update({
                                            user_name: localGitHubName, // 更新用户名（GitHub 用户名存储在 user_name 字段中）
                                            user_identity: updateField === 'id' ? 'github' : currentUser.user_identity, // 如果使用 id，设置为 github
                                            updated_at: new Date().toISOString()
                                        })
                                        .eq(updateField, updateValue)
                                        .select();
                                    
                                    if (error) {
                                        console.error('[LPDEF] ❌ 绑定 GitHub ID 失败:', error);
                                    } else if (data && data.length > 0) {
                                        console.log('[LPDEF] ✅ GitHub ID 绑定成功:', data[0]);
                                        // 更新 currentUser 对象
                                        currentUser.github_username = localGitHubName;
                                        currentUser.user_name = localGitHubName;
                                        // 更新 window.allData 中的对应记录
                                        const index = allData.findIndex(u => 
                                            (u.fingerprint || u.user_identity || u.id) === updateValue
                                        );
                                        if (index !== -1) {
                                            allData[index] = { ...allData[index], ...currentUser };
                                            window.allData = allData;
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error('[LPDEF] ❌ 绑定 GitHub ID 过程出错:', error);
                            }
                        }
                    }
                }
                
                // 7. 保存匹配结果到全局变量
                if (currentUser) {
                    window.currentUser = currentUser;
                    window.currentUserMatchedByFingerprint = matchedByFingerprint;
                    console.log('[Rank] ✅ 用户匹配成功，已设置全局变量');
                }
                
                // 8. 统一调用 renderRankCards 渲染 6 维度排名卡片
                // 身份识别兜底：如果最终 currentUser 依然为 null，显式调用 renderRankCards(null)
                // 这将触发"全球选拔"逻辑，显示每个维度的全球最强用户
                if (currentUser) {
                    console.log('[Rank] ✅ 找到当前用户数据，渲染排名卡片:', currentUser.user_name || currentUser.name);
                    renderRankCards(currentUser);
                    
                    // 【优化】如果找到匹配用户，立即检查并加载抽屉（取消 WAIT 状态）
                    setTimeout(() => {
                        const leftDrawer = document.getElementById('left-drawer');
                        const leftBody = document.getElementById('left-drawer-body');
                        
                        if (leftDrawer && leftBody) {
                            // 检查是否有等待卡片
                            const waitingCards = leftBody.querySelectorAll('.drawer-item');
                            waitingCards.forEach(card => {
                                const label = card.querySelector('.drawer-item-label');
                                if (label && label.textContent === '数据加载中') {
                                    console.log('[Rank] ✅ 找到匹配用户，移除等待卡片并加载统计卡片');
                                    card.remove();
                                    
                                    // 立即渲染用户统计卡片（优先使用 allData 中的完整记录）
                                    renderUserStatsCards(leftBody, getBestUserRecordForStats(currentUser));
                                }
                            });
                        }
                    }, 100); // 延迟一小段时间，确保 DOM 已更新
                } else {
                    console.log('[Rank] ⚠️ 未找到当前用户数据，触发全球最强模式（全球选拔）');
                    // 显式调用 renderRankCards(null) 触发全球选拔逻辑
                    renderRankCards(null);
                }
            } catch (error) {
                console.error('[Rank] ❌ 身份检查失败:', error);
                // 出错时也显式调用 renderRankCards(null)，触发全球最强模式（全球选拔）
                renderRankCards(null);
            }
            
             // 初始加载完成后，启动 Realtime 监听
             // 延迟一小段时间，确保所有渲染已完成
             setTimeout(() => {
                 startRealtimeListener();
             }, 500);

             // 【增强】强制恢复手动校准的光标位置（解决页面刷新后光标漂移问题）
             // 使用 setTimeout 确保在所有异步操作之后执行
             setTimeout(() => {
                 forceRestoreLockedCursor();
             }, 800);

             // 【增强】再次强制恢复，确保不会被后续操作覆盖
             setTimeout(() => {
                 forceRestoreLockedCursor();
             }, 1500);
         };

        // ==========================================
        // Semantic Burst Sentence Board (Personal + National)
        // ==========================================
        let nationalSentenceChart = null;
        let nationalSentenceAbort = null;

        function _getApiEndpoint() {
            const apiEndpoint = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim();
            return apiEndpoint.endsWith('/') ? apiEndpoint : `${apiEndpoint}/`;
        }

        function _isSemanticBurstDebugEnabled() {
            try {
                const qs = new URLSearchParams(window.location.search || '');
                const q = (qs.get('debugSemanticBurst') || qs.get('sb_debug') || '').trim();
                if (q === '1' || q.toLowerCase() === 'true') return true;
            } catch { /* ignore */ }
            try {
                return localStorage.getItem('debug_semantic_burst') === '1';
            } catch { /* ignore */ }
            return false;
        }

        function _setSemanticBurstDebugEnabled(enabled) {
            try { localStorage.setItem('debug_semantic_burst', enabled ? '1' : '0'); } catch { /* ignore */ }
            try {
                const panel = document.getElementById('sb-debug-panel');
                if (panel) panel.classList.toggle('hidden', !enabled);
            } catch { /* ignore */ }
        }

        function _formatMonthlyVibesDebug(mv, region, url) {
            const slang = Array.isArray(mv?.slang) ? mv.slang : [];
            const merit = Array.isArray(mv?.merit) ? mv.merit : [];
            const sv = Array.isArray(mv?.sv_slang) ? mv.sv_slang : [];
            const top = (arr) => (arr || []).slice(0, 5).map((x) => `${String(x?.phrase || '').trim()} (${Number(x?.hit_count) || 0})`).filter(Boolean);
            return [
                `region=${region || '??'}`,
                `url=${url || ''}`,
                `slang=${slang.length}, merit=${merit.length}, sv_slang=${sv.length}`,
                `top_slang=${top(slang).join(', ') || '-'}`,
                `top_merit=${top(merit).join(', ') || '-'}`,
                `top_sv=${top(sv).join(', ') || '-'}`,
                `ts=${new Date().toISOString()}`,
            ].join('\n');
        }

        function _renderLoader(container, label = 'LOADING') {
            if (!container) return;
            container.innerHTML = `
                <div class="vibe-cloud-loader">
                    <div class="dot" aria-hidden="true"></div>
                    <div class="dot" aria-hidden="true"></div>
                    <div class="dot" aria-hidden="true"></div>
                    <div class="label">${label}</div>
                </div>
            `;
        }

        function _showEmpty(containerEl, emptyEl, show) {
            try {
                if (containerEl) containerEl.style.display = show ? 'none' : '';
                if (emptyEl) emptyEl.classList.toggle('hidden', !show);
            } catch (e) { /* ignore */ }
        }

        function _escapeHtml(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function _disposeChart(chartRef) {
            try { chartRef && typeof chartRef.dispose === 'function' && chartRef.dispose(); } catch (e) { /* ignore */ }
        }

        function _fingerprintMaskNoise(input) {
            let t = String(input || '');
            if (!t) return '';
            // remove fenced code / inline code
            t = t.replace(/```[\s\S]*?```/g, ' ');
            t = t.replace(/`[^`]*`/g, ' ');
            // remove HTML
            t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
            t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
            t = t.replace(/<[^>]+>/g, ' ');
            // remove URLs
            t = t.replace(/\bhttps?:\/\/[^\s]+/gi, ' ');
            return t.replace(/\s+/g, ' ').trim();
        }

        function _splitSentencesForBoard(text) {
            const cleaned = _fingerprintMaskNoise(text);
            if (!cleaned) return [];
            return cleaned
                .split(/[。\.！!？\?\n\r；;，,]+/g)
                .map(s => String(s || '').trim())
                .filter(s => s.length >= 3);
        }

        function _hasZh(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }

        function _extractChineseNgrams(sentence, minN = 3, maxN = 10) {
            const out = [];
            const runs = String(sentence || '').match(/[\u4e00-\u9fff]{3,}/g) || [];
            for (const run of runs) {
                const s = String(run);
                const len = s.length;
                for (let n = minN; n <= maxN; n++) {
                    if (len < n) continue;
                    for (let i = 0; i <= len - n; i++) out.push(s.slice(i, i + n));
                }
            }
            return out;
        }

        function _extractEnglishWordNgrams(sentence, minN = 3, maxN = 7) {
            const out = [];
            const words = (String(sentence || '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [])
                .map(w => w.toLowerCase())
                .filter(Boolean);
            if (words.length < minN) return out;
            for (let n = minN; n <= maxN; n++) {
                if (words.length < n) continue;
                for (let i = 0; i <= words.length - n; i++) out.push(words.slice(i, i + n).join(' '));
            }
            return out;
        }

        function _normForCompare(s) { return String(s || '').trim().replace(/\s+/g, '').toLowerCase(); }

        function _levenshteinWithin(a, b, maxDistance = 1) {
            const s = String(a || '');
            const t = String(b || '');
            if (s === t) return true;
            const n = s.length, m = t.length;
            if (Math.abs(n - m) > maxDistance) return false;
            if (n === 0) return m <= maxDistance;
            if (m === 0) return n <= maxDistance;
            let prev = new Array(m + 1);
            let curr = new Array(m + 1);
            for (let j = 0; j <= m; j++) prev[j] = j;
            for (let i = 1; i <= n; i++) {
                curr[0] = i;
                let rowMin = curr[0];
                const si = s.charCodeAt(i - 1);
                for (let j = 1; j <= m; j++) {
                    const cost = si === t.charCodeAt(j - 1) ? 0 : 1;
                    const del = prev[j] + 1;
                    const ins = curr[j - 1] + 1;
                    const sub = prev[j - 1] + cost;
                    const v = Math.min(del, ins, sub);
                    curr[j] = v;
                    if (v < rowMin) rowMin = v;
                }
                if (rowMin > maxDistance) return false;
                const tmp = prev; prev = curr; curr = tmp;
            }
            return prev[m] <= maxDistance;
        }

        function _extractPersonalSentences(text, topK = 20) {
            const sentences = _splitSentencesForBoard(text);
            if (sentences.length === 0) return [];

            const freq = new Map();
            const bump = (k) => {
                const s = String(k || '').trim();
                if (!s) return;
                freq.set(s, (freq.get(s) || 0) + 1);
            };

            for (const s of sentences) {
                bump(s);
                _extractChineseNgrams(s, 3, 10).forEach(bump);
                _extractEnglishWordNgrams(s, 3, 7).forEach(bump);
            }

            const entries = Array.from(freq.entries())
                .sort((a, b) => (b[1] - a[1]) || (a[0] > b[0] ? 1 : -1))
                .slice(0, 200);

            const clusters = []; // { canonical, norm, count }
            const buckets = new Map();
            const addBucket = (idx) => {
                const c = clusters[idx];
                const prefix = _hasZh(c.canonical) ? c.norm.slice(0, 2) : c.norm.slice(0, 6);
                const key = `${c.norm.length}:${prefix}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(idx);
            };

            for (const [cand, cnt] of entries) {
                const norm = _normForCompare(cand);
                if (!norm) continue;
                const prefix = _hasZh(cand) ? norm.slice(0, 2) : norm.slice(0, 6);
                const key = `${norm.length}:${prefix}`;
                const nearKeys = [key, `${norm.length - 1}:${prefix}`, `${norm.length + 1}:${prefix}`];
                let merged = -1;
                for (const k of nearKeys) {
                    const list = buckets.get(k);
                    if (!list) continue;
                    for (const idx of list) {
                        if (_levenshteinWithin(norm, clusters[idx].norm, 1)) { merged = idx; break; }
                    }
                    if (merged !== -1) break;
                }
                if (merged === -1) {
                    clusters.push({ canonical: cand, norm, count: cnt });
                    addBucket(clusters.length - 1);
                } else {
                    clusters[merged].count += cnt;
                    if (String(cand).length < String(clusters[merged].canonical).length) {
                        clusters[merged].canonical = cand;
                        clusters[merged].norm = norm;
                    }
                }
            }

            return clusters
                .sort((a, b) => (b.count - a.count) || (a.canonical > b.canonical ? 1 : -1))
                .slice(0, Math.max(10, Math.min(30, Number(topK) || 20)))
                .map((c) => ({ name: c.canonical, value: c.count, category: 'personal' }));
        }

        function _buildWordCloudOption({ words, maxFont, tooltipFormatter, textStyle, emphasisTextStyle, onClick }) {
            return {
                backgroundColor: 'transparent',
                tooltip: {
                    show: true,
                    backgroundColor: 'rgba(9,10,15,0.92)',
                    borderColor: 'rgba(148,163,184,0.22)',
                    borderWidth: 1,
                    padding: [8, 10],
                    textStyle: { color: '#e5e7eb', fontFamily: 'JetBrains Mono, monospace' },
                    formatter: tooltipFormatter,
                },
                series: [{
                    type: 'wordCloud',
                    shape: 'circle',
                    left: 'center',
                    top: 'center',
                    width: '100%',
                    height: '100%',
                    // 句式较长：提高 gridSize，降低重叠
                    gridSize: 9,
                    sizeRange: [12, maxFont],
                    // 长句保持水平，提升可读性
                    rotationRange: [0, 0],
                    rotationStep: 0,
                    drawOutOfBound: false,
                    textStyle: {
                        fontFamily: 'JetBrains Mono, monospace',
                        ...(textStyle || {}),
                    },
                    emphasis: {
                        focus: 'self',
                        textStyle: { ...(emphasisTextStyle || {}) },
                    },
                    onclick: onClick,
                    data: words,
                }],
            };
        }

        // 视觉权重（对数缩放）：fontSize = 12 + (log(hit+1)/log(maxHit+1)) * 16
        function applyLogFontSize(words, getHit) {
            const list = Array.isArray(words) ? words : [];
            return list.map((w) => {
                const hit = Math.max(0, Number(getHit(w)) || 0);
                // 对数缩放（按需求）：fontSize = 12 + log10(hit_count + 1) * 8
                const fontSize = 12 + (Math.log10(hit + 1) * 8);
                return {
                    ...w,
                    // per-item 强制字号（长句更可控；同时保留 series.sizeRange 作为兜底）
                    textStyle: {
                        ...(w.textStyle || {}),
                        fontSize: Number.isFinite(fontSize) ? Math.max(12, Math.min(36, Math.round(fontSize))) : 12,
                    },
                };
            });
        }

        // ==========================================
        // Vibe Hotlist Card (Top10 + Cloud50)
        // ==========================================
        let vibeCloudChart = null;
        let vibeCloudAbort = null;

        function _setVibeRefreshing(on) {
            try {
                const root = document.getElementById('vibe-burst-root') || document.getElementById('vibe-explosion-card');
                if (root) root.classList.toggle('vibe-refreshing', !!on);
            } catch { /* ignore */ }
        }

        function _renderTop10List(list) {
            const ol = document.getElementById('vibe-top10-list');
            const empty = document.getElementById('vibe-top10-empty');
            const meta = document.getElementById('vibe-country-top10-meta');
            if (!ol) return;

            const items = (Array.isArray(list) ? list : [])
                .map((x) => ({ phrase: String(x?.phrase || '').trim(), hit: Number(x?.hit_count ?? x?.hitCount ?? 0) || 0 }))
                .filter((x) => x.phrase && x.hit > 0)
                .slice(0, 10);

            if (items.length === 0) {
                ol.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                if (meta) meta.textContent = '--';
                return;
            }
            if (empty) empty.classList.add('hidden');
            if (meta) meta.textContent = `N=${items.length}`;

            ol.innerHTML = items.map((it, idx) => {
                const rank = idx + 1;
                const name = _escapeHtml(it.phrase);
                const count = it.hit;
                const countColor = count >= 30 ? '#00ff41' : count >= 10 ? '#a855f7' : '#9ca3af';
                return `
                    <li class="flex items-center gap-3 p-2 border-b border-white/5 hover:bg-white/5 transition-colors">
                        <div class="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#00ff41]/10 to-purple-500/20 flex items-center justify-center text-[10px] font-bold text-white/70">
                            ${rank}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-[12px] text-zinc-200 font-mono truncate">${name}</div>
                        </div>
                        <div class="flex-shrink-0 flex items-center gap-1">
                            <span class="text-[10px] text-zinc-500">×</span>
                            <span class="text-[12px] font-bold tabular-nums" style="color: ${countColor}">${count}</span>
                        </div>
                    </li>
                `;
            }).join('');
        }

        function _renderCloud50(region, list) {
            const container = document.getElementById('vibe-cloud50-container');
            const empty = document.getElementById('vibe-cloud50-empty');
            const meta = document.getElementById('vibe-cloud50-meta');
            if (!container) return;
            if (typeof echarts === 'undefined') {
                if (meta) meta.textContent = 'ECharts missing';
                if (empty) {
                    empty.textContent = 'ECharts 未加载，无法渲染词云。';
                    empty.classList.remove('hidden');
                }
                return;
            }

            const raw = (Array.isArray(list) ? list : [])
                .map((x) => ({ name: String(x?.phrase || '').trim(), value: Number(x?.hit_count ?? x?.hitCount ?? 0) || 0 }))
                .filter((x) => x.name && x.value > 0)
                .slice(0, 50);

            if (raw.length === 0) {
                try { container.innerHTML = ''; } catch { /* ignore */ }
                try { _disposeChart(vibeCloudChart); } catch { /* ignore */ }
                vibeCloudChart = null;
                if (meta) meta.textContent = '--';
                if (empty) empty.classList.remove('hidden');
                return;
            }

            if (empty) empty.classList.add('hidden');
            if (meta) meta.textContent = `N=${raw.length}`;

            let words = applyLogFontSize(raw, (w) => w?.value ?? 0);
            try { container.innerHTML = ''; } catch { /* ignore */ }
            _disposeChart(vibeCloudChart);
            // 不指定主题：避免 theme 未注册导致渲染失败
            vibeCloudChart = echarts.init(container, null, { renderer: 'canvas' });

            const maxVal = Math.max(...words.map((w) => Number(w.value) || 0), 1);
            const getColor = (value) => {
                const intensity = Math.min(1, (Number(value) || 0) / (maxVal || 1));
                const a = 0.65 + intensity * 0.35;
                return {
                    // 提高对比度：避免黑底“糊成一坨”
                    color: `rgba(192, 132, 252, ${a})`,           // #C084FC
                    glow: `rgba(192, 132, 252, ${0.35 + intensity * 0.35})`,
                };
            };

            // 关键修复：给每个词条写死颜色/阴影（不要依赖 callback）
            words = (Array.isArray(words) ? words : []).map((w) => {
                const v = Number(w?.value) || 0;
                const { color, glow } = getColor(v);
                return {
                    ...w,
                    textStyle: {
                        ...(w.textStyle || {}),
                        color,
                        shadowBlur: 14,
                        shadowColor: glow,
                    },
                };
            });

            try {
                vibeCloudChart.setOption(_buildWordCloudOption({
                    words,
                    maxFont: 34,
                    tooltipFormatter: (p) => `${p.name}<br/>热度: <b>${p.value}</b><br/>国家: ${_escapeHtml(region || '--')}`,
                    // per-item 已写死颜色/阴影，这里只保留字体
                    textStyle: {
                        fontFamily: 'JetBrains Mono, monospace',
                    },
                    emphasisTextStyle: { shadowBlur: 22 },
                    onClick: (p) => { try { handleWordCloudClick && handleWordCloudClick(p?.data?.name, 'slang'); } catch {} },
                }), true);
            } catch (e) {
                try { _disposeChart(vibeCloudChart); } catch { /* ignore */ }
                vibeCloudChart = null;
                // 回退：用“文字云列表”保证至少可见
                try {
                    const top = (Array.isArray(words) ? words : []).slice(0, 50);
                    container.innerHTML = `
                        <div class="max-h-[260px] overflow-y-auto">
                            ${top.map((w, i) => {
                                const name = _escapeHtml(String(w?.name || ''));
                                const value = Number(w?.value) || 0;
                                return `<div class="flex justify-between gap-3 border-b border-white/10 py-1">
                                    <span class="text-zinc-200 font-mono truncate">${i + 1}. ${name}</span>
                                    <span class="text-zinc-400 tabular-nums">×${value}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    `;
                    if (meta) meta.textContent = `N=${raw.length} (fallback)`;
                } catch { /* ignore */ }
            }
        }

        function _formatVibeHotlistDebug(data, region, url) {
            try {
                const top10 = Array.isArray(data?.top10) ? data.top10 : [];
                const cloud50 = Array.isArray(data?.cloud50) ? data.cloud50 : [];
                return [
                    `url: ${url}`,
                    `region: ${region}`,
                    `top10: ${top10.length}`,
                    `cloud50: ${cloud50.length}`,
                    '',
                    `top10(sample): ${top10.slice(0, 3).map((x) => `${x.phrase}:${x.hit_count}`).join(', ')}`,
                ].join('\n');
            } catch {
                return '--';
            }
        }

        window.renderVibeCardFromData = function renderVibeCardFromData(countryCodeRaw, data) {
            try {
                const region = String(countryCodeRaw || currentDrawerCountry?.code || '').trim().toUpperCase();
                const hint = document.getElementById('vibe-country-hint');
                if (hint) {
                    let label = region || '--';
                    if (/^[A-Z]{2}$/.test(label)) {
                        try {
                            const loc = (typeof currentLang === 'string' && currentLang === 'en') ? 'en' : 'zh-CN';
                            const dn = new Intl.DisplayNames([loc], { type: 'region' });
                            label = dn.of(label) || label;
                        } catch { /* ignore */ }
                    }
                    hint.textContent = `NATION: ${label}`;
                }

                const top10 = Array.isArray(data?.top10) ? data.top10 : (Array.isArray(window.__latestTop10) ? window.__latestTop10 : []);
                const cloud50 = Array.isArray(data?.cloud50) ? data.cloud50 : (Array.isArray(window.__latestCloud50) ? window.__latestCloud50 : []);

                _renderTop10List(top10);
                _renderCloud50(region, cloud50);

                try {
                    const enabled = _isSemanticBurstDebugEnabled();
                    const panel = document.getElementById('sb-debug-panel');
                    const textEl = document.getElementById('sb-debug-text');
                    if (panel) panel.classList.toggle('hidden', !enabled);
                    if (enabled && textEl) {
                        const API_ENDPOINT = _getApiEndpoint();
                        const url = `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(region)}`;
                        textEl.textContent = _formatVibeHotlistDebug(data, region, url);
                    }
                } catch { /* ignore */ }
            } catch { /* ignore */ }
        };

        window.refreshVibeCard = async function refreshVibeCard(countryCode) {
            const region = String(countryCode || currentDrawerCountry?.code || '').trim().toUpperCase();
            const empty = document.getElementById('vibe-cloud50-empty');

            if (!region || region.length !== 2) {
                _renderTop10List([]);
                try { if (empty) empty.classList.remove('hidden'); } catch { /* ignore */ }
                return;
            }

            _setVibeRefreshing(true);
            try { setTimeout(() => _setVibeRefreshing(false), 700); } catch { /* ignore */ }

            try { vibeCloudAbort && vibeCloudAbort.abort && vibeCloudAbort.abort(); } catch { /* ignore */ }
            vibeCloudAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

            try {
                const API_ENDPOINT = _getApiEndpoint();
                // cache-busting：避免浏览器/中间层对 GET 做意外缓存
                const url = `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(region)}&_t=${Date.now()}`;
                const resp = await fetch(url, { cache: 'no-store', signal: vibeCloudAbort ? vibeCloudAbort.signal : undefined });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const payload = await resp.json().catch(() => null);
                const data = payload?.data ?? payload ?? {};

                window.__latestTop10 = Array.isArray(data.top10) ? data.top10 : null;
                window.__latestCloud50 = Array.isArray(data.cloud50) ? data.cloud50 : null;
                window.renderVibeCardFromData(region, data);
            } catch (e) {
                try { _renderTop10List([]); } catch { /* ignore */ }
                try { _renderCloud50(region, []); } catch { /* ignore */ }
            }

            if (!window.__vibeCloudResizeBound) {
                window.__vibeCloudResizeBound = true;
                window.addEventListener('resize', () => {
                    try { vibeCloudChart && vibeCloudChart.resize(); } catch {}
                });
            }
        };

        async function loadWordCloud() {
            // 新版：语义爆发卡片（Top10 + Cloud50）
            try {
                const cc = String(currentDrawerCountry?.code || '').trim().toUpperCase();
                if (typeof window.refreshVibeCard === 'function') {
                    await window.refreshVibeCard(cc);
                    return;
                }
            } catch { /* ignore */ }

            const nationalContainer = document.getElementById('national-wordcloud-container');
            const nationalEmpty = document.getElementById('national-sentence-empty');

            if (!nationalContainer) return;
            if (typeof echarts === 'undefined') return;

            // 国家池：只展示“该国所有用户累计”的句式（slang_trends_pool -> /api/global-average monthly_vibes）
            try {
                let region = null;
                try {
                    const cc = String(currentDrawerCountry?.code || '').trim().toUpperCase();
                    if (cc.length === 2) region = cc;
                } catch { /* ignore */ }

                if (!region) {
                    _showEmpty(nationalContainer, nationalEmpty, true);
                    return;
                }

                // 若 updateCountryDashboard 尚未注入 monthly_vibes，则就地回源一次（不引入硬编码）
                if (!window.__latestMonthlyVibes) {
                    try {
                        const API_ENDPOINT = _getApiEndpoint();
                        const url = `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(region)}`;
                        const resp = await fetch(url, { cache: 'no-store' });
                        if (resp.ok) {
                            const payload = await resp.json().catch(() => null);
                            const data = payload?.data ?? payload ?? {};
                            window.__latestMonthlyVibes = data.monthly_vibes || data.monthlyVibes || null;
                            window.__latestTopSentences = data.top_sentences || null;
                        }
                    } catch { /* ignore */ }
                }

                const mv = window.__latestMonthlyVibes || null;
                const slang = Array.isArray(mv?.slang) ? mv.slang : [];
                const merit = Array.isArray(mv?.merit) ? mv.merit : [];
                const sv = Array.isArray(mv?.sv_slang) ? mv.sv_slang : [];
                const natPhrases = Array.isArray(mv?.phrase) ? mv.phrase : [];

                // 展示优先级（按你的新需求）：
                // 1) 国民级词组（monthly_vibes.phrase）→ 列表
                // 2) 真实雷同句子（top_sentences）→ 列表
                // 3) 其他关键词（slang/merit/sv_slang）→ 词云
                const topSentences = window.__latestTopSentences || null;
                let combined0 = [];

                if (Array.isArray(natPhrases) && natPhrases.length > 0) {
                    combined0 = natPhrases
                        .map((x) => ({ name: String(x?.phrase || '').trim(), value: Number(x?.hit_count) || 0, category: 'phrase' }))
                        .filter((x) => x.name && x.value > 0)
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 10);
                } else if (Array.isArray(topSentences) && topSentences.length > 0) {
                    combined0 = topSentences
                        .map((x) => ({
                            name: String(x?.sentence || '').trim(),
                            value: Number(x?.hit_count) || 0,
                            category: 'sentence',
                        }))
                        .filter((x) => x.name && x.value > 0)
                        .slice(0, 10);
                } else {
                    combined0 = []
                        .concat(slang.map((x) => ({ name: String(x?.phrase || '').trim(), value: Number(x?.hit_count) || 0, category: 'slang' })))
                        .concat(merit.map((x) => ({ name: String(x?.phrase || '').trim(), value: Number(x?.hit_count) || 0, category: 'merit' })))
                        .concat(sv.map((x) => ({ name: String(x?.phrase || '').trim(), value: Number(x?.hit_count) || 0, category: 'sv_slang' })))
                        .filter((x) => x.name && x.value > 0)
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 10);
                }

                if (combined0.length === 0) {
                    // 空态：分类为空时提示“正在收录…”
                    try {
                        if (nationalEmpty) nationalEmpty.textContent = '正在建立该地区开发者语义指纹...';
                    } catch { /* ignore */ }
                    _showEmpty(nationalContainer, nationalEmpty, true);

                    // debug panel update
                    try {
                        const enabled = _isSemanticBurstDebugEnabled();
                        const panel = document.getElementById('sb-debug-panel');
                        const textEl = document.getElementById('sb-debug-text');
                        if (panel) panel.classList.toggle('hidden', !enabled);
                        if (enabled && textEl) {
                            const API_ENDPOINT = _getApiEndpoint();
                            const url = `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(region)}`;
                            textEl.textContent = _formatMonthlyVibesDebug(mv, region, url);
                        }
                    } catch { /* ignore */ }

                    return;
                }

                _showEmpty(nationalContainer, nationalEmpty, false);
                
                // 展示策略：
                // - sentence：真实句子（>=2 次雷同）→ 列表
                // - phrase：国民级词组（3-5字/词）→ 列表
                // - 其他关键词 → 词云
                const category0 = combined0.length > 0 ? String(combined0[0].category || '') : '';
                const useSentenceList = category0 === 'sentence' || category0 === 'phrase';
                
                if (useSentenceList) {
                    // 稳定方案：句子列表渲染到 fallback 容器（避免被词云/ECharts/empty-state 影响）
                    const fallbackEl = document.getElementById('national-sentence-fallback');
                    const hintEl = document.getElementById('national-sentence-hint');

                    const ranked = (Array.isArray(combined0) ? combined0 : [])
                        .map((x) => ({ name: String(x?.name || '').trim(), value: Number(x?.value) || 0 }))
                        .filter((x) => x.name && x.value > 0)
                        .sort((a, b) => b.value - a.value);
                    const list = (category0 === 'sentence')
                        ? ranked.filter((x) => x.value >= 2).slice(0, 10)     // 真实句子：必须 >=2
                        : ranked.slice(0, 10);                                // 国民词组：只要 >0 就展示排行

                    // 清空词云容器（避免叠层/占位影响）
                    try { nationalContainer.innerHTML = ''; } catch { /* ignore */ }
                    try { _disposeChart(nationalSentenceChart); } catch { /* ignore */ }

                    // 同步提示
                    try {
                        if (hintEl) {
                            hintEl.textContent = category0 === 'phrase'
                                ? `TOP ${list.length} 国民词组`
                                : `TOP ${list.length} 雷同句子`;
                        }
                    } catch { /* ignore */ }

                    // 空态：sentence 必须 >=2；phrase 若为空则提示收录中
                    if (list.length === 0) {
                        if (fallbackEl) {
                            fallbackEl.innerHTML = category0 === 'phrase'
                                ? '<div class="text-zinc-500 text-sm p-3 italic">暂无国民级词组（正在收录中...）</div>'
                                : '<div class="text-zinc-500 text-sm p-3 italic">暂无 ≥2 次雷同的真实句式（正在收录中...）</div>';
                            fallbackEl.classList.remove('hidden');
                        }
                        try { if (nationalEmpty) nationalEmpty.classList.remove('hidden'); } catch { /* ignore */ }
                        return;
                    }

                    const listHtml = list.map((item, index) => {
                        const escName = _escapeHtml(item.name || '');
                        const count = item.value || 0;
                        const countColor = count >= 10 ? '#00ff41' : count >= 5 ? '#3b82f6' : '#9ca3af';
                        return `
                            <div class="flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                                <div class="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-[10px] font-bold text-white/60">
                                    ${index + 1}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm text-zinc-200 leading-relaxed break-words">${escName}</div>
                                </div>
                                <div class="flex-shrink-0 flex items-center gap-1">
                                    <span class="text-[10px] text-zinc-500">×</span>
                                    <span class="text-sm font-bold tabular-nums" style="color: ${countColor}">${count}</span>
                                </div>
                            </div>
                        `;
                    }).join('');

                    if (fallbackEl) {
                        fallbackEl.innerHTML = `<div class="w-full max-h-[380px] overflow-y-auto">${listHtml}</div>`;
                        fallbackEl.classList.remove('hidden');
                    }
                    try { if (nationalEmpty) nationalEmpty.classList.add('hidden'); } catch { /* ignore */ }
                } else {
                    // 回退：使用词云展示关键词
                    const words = applyLogFontSize(combined0, (w) => w?.value ?? 0);
                    nationalContainer.innerHTML = '';
                    _disposeChart(nationalSentenceChart);
                    nationalSentenceChart = echarts.init(nationalContainer, 'dark', { renderer: 'canvas' });

                const maxVal = Math.max(...words.map((w) => w.value));
                const getColor = (category, value) => {
                    const intensity = Math.min(1, (value || 0) / (maxVal || 1));
                    switch (category) {
                        case 'merit': return { color: `rgba(16, 185, 129, ${0.7 + intensity * 0.3})`, glow: `rgba(16,185,129,${0.35 + intensity * 0.35})` };
                        case 'sv_slang': return { color: `rgba(249, 115, 22, ${0.7 + intensity * 0.3})`, glow: `rgba(249,115,22,${0.35 + intensity * 0.35})` };
                        default: return { color: `rgba(168, 85, 247, ${0.7 + intensity * 0.3})`, glow: `rgba(168,85,247,${0.35 + intensity * 0.35})` };
                    }
                };
                const categoryLabels = { merit: '功德', slang: '黑话', sv_slang: '硅谷黑话' };

                const maxFont = 28;
                // 插件/渲染失败时：回退为 Top 列表，避免“有数据但看不到”
                const fallbackEl = document.getElementById('national-sentence-fallback');
                try {
                    if (fallbackEl) fallbackEl.classList.add('hidden');
                    nationalSentenceChart.setOption(_buildWordCloudOption({
                        words,
                        maxFont,
                        tooltipFormatter: (p) => {
                            const d = p.data || {};
                            const catLabel = categoryLabels[d.category] || '未知';
                            return `${p.name}<br/>共同触发: <b>${p.value}</b><br/>分类: ${catLabel}`;
                        },
                        textStyle: {
                            color: (p) => getColor(p.data.category, p.data.value).color,
                            shadowBlur: 10,
                            shadowColor: (p) => getColor(p.data.category, p.data.value).glow,
                        },
                        emphasisTextStyle: { shadowBlur: 18 },
                        onClick: (p) => { try { handleWordCloudClick && handleWordCloudClick(p?.data?.name, p?.data?.category || 'slang'); } catch {} },
                    }), true);
                } catch (e) {
                    try { _disposeChart(nationalSentenceChart); } catch { /* ignore */ }
                    nationalSentenceChart = null;
                    if (fallbackEl) {
                        const top = (Array.isArray(words) ? words : []).slice(0, 20);
                        fallbackEl.innerHTML = top.map((w) => {
                            const name = _escapeHtml(w?.name || '');
                            const value = Number(w?.value) || 0;
                            const cat = _escapeHtml(w?.category || '');
                            return `<div class="flex justify-between gap-3 border-b border-white/10 py-1"><span class="truncate">${name}</span><span class="tabular-nums text-zinc-500">${value}</span><span class="text-zinc-600">${cat}</span></div>`;
                        }).join('') || '<div class="text-zinc-500">无可用数据</div>';
                        fallbackEl.classList.remove('hidden');
                    }
                }
                
                    // debug panel update (success)
                    try {
                        const enabled = _isSemanticBurstDebugEnabled();
                        const panel = document.getElementById('sb-debug-panel');
                        const textEl = document.getElementById('sb-debug-text');
                        if (panel) panel.classList.toggle('hidden', !enabled);
                        if (enabled && textEl) {
                            const API_ENDPOINT = _getApiEndpoint();
                            const url = `${API_ENDPOINT}api/global-average?country_code=${encodeURIComponent(region)}`;
                            textEl.textContent = _formatMonthlyVibesDebug(mv, region, url);
                        }
                    } catch { /* ignore */ }
                } // 结束 else (词云渲染分支)
            } catch (e) {
                try {
                    if (nationalEmpty) nationalEmpty.textContent = '正在建立该地区开发者语义指纹...';
                } catch { /* ignore */ }
                _showEmpty(nationalContainer, nationalEmpty, true);
            }

            // resize
            if (!window.__sentenceCloudResizeBound) {
                window.__sentenceCloudResizeBound = true;
                window.addEventListener('resize', () => {
                    try { nationalSentenceChart && nationalSentenceChart.resize(); } catch {}
                });
            }
        }
        
        // initWordCloud 别名（兼容旧代码）
        const initWordCloud = loadWordCloud;
        window.initWordCloud = initWordCloud;
        window.loadWordCloud = loadWordCloud;

        // Debug switch init (Semantic Burst)
        try {
            const toggle = document.getElementById('sb-debug-toggle');
            const panel = document.getElementById('sb-debug-panel');
            const refreshBtn = document.getElementById('sb-debug-refresh');
            const enabled = _isSemanticBurstDebugEnabled();
            if (toggle) toggle.checked = enabled;
            if (panel) panel.classList.toggle('hidden', !enabled);
            if (toggle) {
                toggle.addEventListener('change', () => {
                    const on = Boolean(toggle.checked);
                    _setSemanticBurstDebugEnabled(on);
                    try { window.loadWordCloud && window.loadWordCloud(); } catch { /* ignore */ }
                });
            }
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    try { window.__latestTop10 = null; } catch { /* ignore */ }
                    try { window.__latestCloud50 = null; } catch { /* ignore */ }
                    try { window.refreshVibeCard && window.refreshVibeCard(currentDrawerCountry?.code); } catch { /* ignore */ }
                });
            }
        } catch { /* ignore */ }

        // UserText Debug Popup
        try {
            const openUserTextDebug = () => {
                try {
                    const existing = document.getElementById('usertext-debug-overlay');
                    if (existing) existing.remove();
                } catch { /* ignore */ }

                const overlay = document.createElement('div');
                overlay.id = 'usertext-debug-overlay';
                overlay.className = 'usertext-debug-overlay';
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) overlay.remove();
                });

                // 优先读 window（同页面），否则从 localStorage 读取（跨页面）
                let userText = String(window.__vibe_debug_userText || '').trim();
                let extracted = Array.isArray(window.__vibe_debug_extracted_keywords) ? window.__vibe_debug_extracted_keywords : [];
                let finalList = Array.isArray(window.__vibe_debug_final_report_list) ? window.__vibe_debug_final_report_list : [];
                let regionHint = String(window.__vibe_debug_region_hint || '').trim();
                let updatedAt = String(window.__vibe_debug_updated_at || '').trim();
                let sourceHint = userText || extracted.length || finalList.length || regionHint || updatedAt ? 'window' : '';
                try {
                    if (!sourceHint) {
                        const t = String(localStorage.getItem('vibe_debug_userText') || '').trim();
                        const ek = String(localStorage.getItem('vibe_debug_extracted_keywords') || '[]');
                        const fl = String(localStorage.getItem('vibe_debug_final_report_list') || '[]');
                        const rh = String(localStorage.getItem('vibe_debug_region_hint') || '').trim();
                        const ua = String(localStorage.getItem('vibe_debug_updated_at') || '').trim();
                        userText = t;
                        try { extracted = JSON.parse(ek); } catch { extracted = []; }
                        try { finalList = JSON.parse(fl); } catch { finalList = []; }
                        regionHint = rh;
                        updatedAt = ua;
                        sourceHint = (t || rh || ua || (Array.isArray(extracted) && extracted.length) || (Array.isArray(finalList) && finalList.length)) ? 'localStorage' : '';
                    }
                } catch { /* ignore */ }
                let anchored = '';
                try {
                    anchored =
                        String(localStorage.getItem('anchored_country') || '').trim().toUpperCase() ||
                        String(localStorage.getItem('selected_country') || '').trim().toUpperCase();
                } catch { anchored = ''; }

                const esc = (s) => { try { return _escapeHtml(String(s ?? '')); } catch { return String(s ?? ''); } };
                const asList = (arr) => (Array.isArray(arr) ? arr : [])
                    .map((x) => ({
                        phrase: String(x?.phrase || '').trim(),
                        category: String(x?.category || '').trim(),
                        weight: Number(x?.weight ?? x?.hit_count ?? x?.hitCount ?? 0) || 0,
                    }))
                    .filter((x) => x.phrase);

                const extractedList = asList(extracted);
                const finalReportList = asList(finalList);

                const extractedHtml = extractedList.length
                    ? extractedList.slice(0, 100).map((it, idx) => `
                        <div class="flex justify-between gap-3 border-b border-white/10 py-1">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-zinc-500 tabular-nums w-6">${idx + 1}</span>
                                <span class="truncate font-mono text-zinc-200">${esc(it.phrase)}</span>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="text-[10px] text-zinc-500">${esc(it.category || 'slang')}</span>
                                <span class="text-zinc-400 tabular-nums">${it.weight}</span>
                            </div>
                        </div>
                    `).join('')
                    : '<div class="text-zinc-500 text-sm italic">暂无（可能尚未触发分析 / userText 为空 / 提词失败）</div>';

                const finalHtml = finalReportList.length
                    ? finalReportList.slice(0, 100).map((it, idx) => `
                        <div class="flex justify-between gap-3 border-b border-white/10 py-1">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-zinc-500 tabular-nums w-6">${idx + 1}</span>
                                <span class="truncate font-mono text-zinc-200">${esc(it.phrase)}</span>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="text-[10px] text-zinc-500">${esc(it.category || 'slang')}</span>
                                <span class="text-zinc-400 tabular-nums">${it.weight}</span>
                            </div>
                        </div>
                    `).join('')
                    : '<div class="text-zinc-500 text-sm italic">暂无（finalList 为空则不会上报 /api/v2/report-vibe）</div>';

                const header = `
                    <div class="flex items-center justify-between mb-3">
                        <div class="text-xs uppercase tracking-widest text-zinc-400">UserText Debug</div>
                        <div class="flex items-center gap-2">
                            <button id="usertext-debug-copy" class="px-2 py-1 text-[10px] border border-white/10 text-zinc-200 hover:bg-white/5 transition-colors font-mono">COPY</button>
                            <button id="usertext-debug-reportvibe" class="px-2 py-1 text-[10px] border border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 transition-colors font-mono">REPORT_VIBE_DEBUG</button>
                            <button id="usertext-debug-close" class="px-2 py-1 text-[10px] border border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 transition-colors font-mono">CLOSE</button>
                        </div>
                    </div>
                    <div class="text-[11px] text-zinc-500 font-mono">
                        anchored(anchored_country): <span class="text-zinc-200">${esc(anchored || '--')}</span>
                        &nbsp;|&nbsp; regionHint: <span class="text-zinc-200">${esc(regionHint || '--')}</span>
                        &nbsp;|&nbsp; updated_at: <span class="text-zinc-200">${esc(updatedAt || '--')}</span>
                        &nbsp;|&nbsp; source: <span class="text-zinc-200">${esc(sourceHint || 'none')}</span>
                    </div>
                `;

                const body = `
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                        <div class="border border-white/10 bg-zinc-950/30 p-3">
                            <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">USER_TEXT (raw)</div>
                            <textarea id="usertext-debug-textarea" class="w-full h-[240px] bg-black/40 border border-white/10 text-zinc-200 text-[11px] font-mono p-2 outline-none" readonly>${esc(userText)}</textarea>
                            <div class="text-[10px] text-zinc-600 mt-2">len=${userText.length}</div>
                        </div>
                        <div class="border border-white/10 bg-zinc-950/30 p-3">
                            <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">EXTRACTED (extractVibeKeywords)</div>
                            <div class="max-h-[240px] overflow-y-auto">${extractedHtml}</div>
                        </div>
                    </div>
                    <div class="border border-white/10 bg-zinc-950/30 p-3 mt-3">
                        <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">FINAL_REPORT_LIST (will report)</div>
                        <div class="max-h-[240px] overflow-y-auto">${finalHtml}</div>
                    </div>
                    <div class="border border-white/10 bg-zinc-950/30 p-3 mt-3">
                        <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">WORKER DEBUG RESULT (/api/v2/report-vibe?debug=1)</div>
                        <textarea id="usertext-debug-worker-result" class="w-full h-[180px] bg-black/40 border border-white/10 text-zinc-200 text-[11px] font-mono p-2 outline-none" readonly>点击 REPORT_VIBE_DEBUG 发送 finalList 到 Worker（debug=1）并显示逐条 RPC 结果</textarea>
                    </div>
                `;

                overlay.innerHTML = `
                    <div class="w-full max-w-5xl bg-zinc-950/95 border border-[#00ff41]/25 p-4">
                        ${header}
                        ${body}
                    </div>
                `;
                document.body.appendChild(overlay);

                const closeBtn = document.getElementById('usertext-debug-close');
                if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
                const copyBtn = document.getElementById('usertext-debug-copy');
                if (copyBtn) copyBtn.addEventListener('click', async () => {
                    try {
                        const ta = document.getElementById('usertext-debug-textarea');
                        const text = (ta && ta.value != null) ? ta.value : userText;
                        await navigator.clipboard.writeText(String(text || ''));
                    } catch { /* ignore */ }
                });

                const reportBtn = document.getElementById('usertext-debug-reportvibe');
                if (reportBtn) reportBtn.addEventListener('click', async () => {
                    const out = document.getElementById('usertext-debug-worker-result');
                    try {
                        if (out) out.value = '发送中...';
                        const listFinal = Array.isArray(finalList) ? finalList : [];
                        const listExtracted = Array.isArray(extracted) ? extracted : [];
                        // 并不强依赖 finalList：为空时回退用 extracted（帮助定位“为什么 finalList 为空”）
                        const list = listFinal.length > 0 ? listFinal : listExtracted;
                        const listSource = listFinal.length > 0 ? 'finalList' : (listExtracted.length > 0 ? 'extracted' : 'empty');
                        if (list.length === 0) {
                            if (out) out.value = 'finalList 与 extracted 均为空：当前无法触发 /api/v2/report-vibe 写库。请先触发一次分析生成提词结果。';
                            return;
                        }

                        const API_ENDPOINT = _getApiEndpoint();
                        const url = `${API_ENDPOINT}api/v2/report-vibe?debug=1`;
                        let fingerprint = null;
                        try { fingerprint = localStorage.getItem('user_fingerprint') || window.fpId || null; } catch { fingerprint = null; }

                        // 将 finalList 转为 Worker 接口要求：[{phrase, category, weight}]
                        const keywords = list.map((x) => ({
                            phrase: String(x?.phrase || '').trim(),
                            category: String(x?.category || 'slang').trim() || 'slang',
                            weight: Number(x?.weight ?? 1) || 1,
                        })).filter((x) => x.phrase);

                        const payload = {
                            debug: 1,
                            keywords,
                            fingerprint: fingerprint || null,
                            // 强制携带锚定国家（Worker 会优先 manual_region）
                            manual_region: anchored && /^[A-Z]{2}$/.test(anchored) ? anchored : null,
                            region: anchored && /^[A-Z]{2}$/.test(anchored) ? anchored : null,
                            timestamp: new Date().toISOString(),
                        };

                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        });

                        const text = await resp.text().catch(() => '');
                        if (out) {
                            let note = '';
                            try {
                                const parsed = JSON.parse(text || '{}');
                                if (parsed && typeof parsed === 'object' && parsed.status !== 'debug') {
                                    note = '\n\n[NOTE] Worker 未返回 debug 结构（status!=debug）。这通常表示：线上 Worker 尚未部署到包含 debug=1 的版本。';
                                }
                            } catch { /* ignore */ }
                            const header =
                                `HTTP ${resp.status}\n` +
                                `sent_source=${listSource}, sent_keywords=${keywords.length}, anchored=${anchored || '--'}\n\n`;
                            out.value = header + (text || '(empty)') + note;
                        }

                // debug 成功后：立即刷新右侧黑话榜（让最新入库数据“马上可见”）
                try {
                    const parsed = JSON.parse(text || '{}');
                    if (parsed && typeof parsed === 'object' && parsed.status === 'debug') {
                        try { window.refreshVibeCard && window.refreshVibeCard(anchored); } catch { /* ignore */ }
                    }
                } catch { /* ignore */ }
                    } catch (e) {
                        if (out) out.value = `发送失败: ${String(e?.message || e)}`;
                    }
                });
            };

            window.openUserTextDebug = openUserTextDebug;

            // 事件委托兜底：避免 DOM 被重绘后监听失效
            document.addEventListener('click', (e) => {
                try {
                    const t = e && e.target;
                    if (t && t.id === 'sb-usertext-btn') {
                        openUserTextDebug();
                    }
                } catch { /* ignore */ }
            }, true);
        } catch { /* ignore */ }

        // ==========================================
        // 【V6.0 新增】词云点击事件处理
        // ==========================================

        /**
         * 处理词云点击，触发地图联动
         * @param {string} keyword - 点击的关键词
         * @param {string} category - 关键词分类
         */
        window.handleWordCloudClick = async function(keyword, category) {
            console.log('[WordCloud] 点击词云:', { keyword, category });

            const apiEndpoint = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim();
            const API_ENDPOINT = apiEndpoint.endsWith('/') ? apiEndpoint : `${apiEndpoint}/`;

            try {
                // 查询该关键词的地理分布
                const resp = await fetch(`${API_ENDPOINT}api/v2/keyword-location?keyword=${encodeURIComponent(keyword)}`, {
                    cache: 'no-cache'
                });
                const json = await resp.json().catch(() => null);

                if (json && json.status === 'success' && json.data) {
                    // 显示关键词地理分布详情
                    showKeywordDetails(keyword, category, json.data);
                } else {
                    // 没有地理数据时显示简单提示
                    showKeywordSimple(keyword, category);
                }
            } catch (error) {
                console.warn('[Frontend] ⚠️ 词云点击事件处理失败:', error);
                showKeywordSimple(keyword, category);
            }
        };

        /**
         * 显示关键词详细信息（无地理数据时的简化版本）
         */
        function showKeywordSimple(keyword, category) {
            const categoryLabels = {
                'merit': '功德',
                'slang': '黑话',
                'sv_slang': '硅谷黑话',
            };

            const catLabel = categoryLabels[category] || '未知';

            // 使用 existingAlert 或创建临时提示
            if (typeof existingAlert === 'function') {
                existingAlert(`关键词 "${keyword}" (${catLabel})\n地理分布数据暂不可用`, 'info');
            } else {
                alert(`关键词: ${keyword}\n分类: ${catLabel}\n\n地理分布功能开发中...`);
            }
        }

        /**
         * 显示关键词详细信息面板
         */
        function showKeywordDetails(keyword, category, locationData) {
            const countryPanel = document.getElementById('countryPanel');
            if (!countryPanel) return;

            // 按出现频率排序
            const sortedLocations = (locationData || [])
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 10);

            const categoryLabels = {
                'merit': '功德',
                'slang': '黑话',
                'sv_slang': '硅谷黑话',
            };

            const catLabel = categoryLabels[category] || '未知';

            const html = `
                <div class="clinic-card">
                    <div class="card-header">
                        <i data-lucide="map-pin"></i>
                        <span class="card-title">关键词地理分布</span>
                    </div>
                    <div class="mb-4">
                        <div class="text-sm text-zinc-400 mb-2">关键词</div>
                        <div class="text-2xl font-bold ${category === 'merit' ? 'text-green-500' : 'text-purple-500'}">
                            ${keyword}
                        </div>
                        <div class="text-xs text-zinc-500 mt-1">
                            分类：${catLabel}
                        </div>
                    </div>
                    <div>
                        <div class="text-sm text-zinc-400 mb-2">Top 10 地区</div>
                        ${sortedLocations.length > 0 ? `
                            <div class="space-y-2">
                                ${sortedLocations.map(item => `
                                    <div class="flex justify-between items-center bg-zinc-900 p-2 border border-zinc-800">
                                        <span class="text-sm">${item.location || '未知'}</span>
                                        <span class="text-sm font-bold text-emerald-400">${item.count || 0} 次</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div class="text-zinc-500 text-sm">暂无地理分布数据</div>'}
                    </div>
                </div>
            `;

            countryPanel.innerHTML = html;
            countryPanel.style.display = 'block';

            // 刷新 Lucide 图标
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        // ==========================================
        // 语义爆发：静默上报（Dashboard/父页面可触发）
        // ==========================================
        
        // 关键词词典（用于分类）
        const MERIT_KEYWORDS = new Set(['重构', '优化', '修复', '改进', '完善', '提升', '增强', '调整', '更新', '升级', '功德', '福报', '积德', '善业']);
        const SLANG_KEYWORDS = new Set(['闭环', '颗粒度', '对齐', '抓手', '落地', '复盘', '链路', '兜底', '赋能', '降维', '护城河', '赛道', '方法论', '底层逻辑', '架构解耦']);
        
        /**
         * 自动分类关键词/句式（对齐美区/国区）
         * @param {string} phrase - 短语/句式
         * @returns {'merit' | 'slang' | 'sv_slang'}
         */
        function categorizeKeyword(phrase) {
            const normalized = String(phrase || '').trim();
            if (!normalized) return 'slang';
            const lower = normalized.toLowerCase();

            // 1) 指令/修复类：优先 merit
            if (normalized.includes('//') || /\btodo\b/i.test(lower) || /\bfix(?:me|ing|ed)?\b/i.test(lower)) return 'merit';
            if (/修复|优化|重构|改进|完善|提升|增强|调整|更新|升级/.test(normalized)) return 'merit';

            // 2) 美区适配：>=3 个英文单词（含空格），且不含中文 => sv_slang
            if (!/[\u4e00-\u9fff]/.test(normalized)) {
                const words = lower.split(/\s+/g).filter(Boolean);
                const englishWords = words.filter(w => /^[a-z]+(?:'[a-z]+)?$/.test(w));
                if (englishWords.length >= 3) return 'sv_slang';
            }

            // 3) 种子词典命中
            if (MERIT_KEYWORDS.has(normalized)) return 'merit';
            if (SLANG_KEYWORDS.has(normalized)) return 'slang';

            // 4) 含英文术语：sv_slang
            if (/[A-Za-z]/.test(normalized)) return 'sv_slang';

            return 'slang';
        }
        
        /**
         * 提取 Vibe 关键词（带分类和权重）
         * @param {string} text - 文本内容
         * @param {Object} options - 选项 { max: number }
         * @returns {Array} - [{ phrase, category, weight }]
         */
        function extractVibeKeywords(text, { max = 15 } = {}) {
            const raw = String(text || '');
            if (!raw.trim()) return [];

            // 轻量降噪：去 code fence / inline code / URL / 多余空白
            let cleaned = raw
                .replace(/```[\s\S]*?```/g, ' ')
                .replace(/`[^`]*`/g, ' ')
                .replace(/\bhttps?:\/\/[^\s]+/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!cleaned) return [];

            const stopWords = new Set([
                '这个', '可以', '实现', '逻辑', '分析', '代码', '接口', '报错', '异常', '错误', '返回', '请求', '数据',
                '函数', '变量', '对象', '数组', '字符串', '数字', '类型', '组件', '页面', '前端', '后端',
                'the', 'a', 'an', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
                'and', 'that', 'this', 'with', 'from', 'into', 'just', 'like', 'very',
            ]);

            const freq = new Map();
            const bump = (p) => {
                const s = String(p || '').trim();
                if (!s) return;
                if (/^[0-9]+$/.test(s)) return;
                if (/^[\p{P}\p{S}]+$/u.test(s)) return;
                if (!/[\u4e00-\u9fff]/.test(s) && /[A-Za-z]/.test(s)) {
                    const parts = s.toLowerCase().split(/\s+/g).filter(Boolean);
                    if (parts.length > 0 && parts.every((w) => stopWords.has(w))) return;
                }
                freq.set(s, (freq.get(s) || 0) + 1);
            };

            const sentences = cleaned
                .split(/[。\.！!？\?\n\r；;，,]+/g)
                .map(s => String(s || '').trim())
                .filter(s => s.length >= 3);

            for (const s of sentences) {
                // 中文：4-10 连续汉字
                const zhRuns = s.match(/[\u4e00-\u9fff]{4,}/g) || [];
                for (const run of zhRuns) {
                    const r = String(run);
                    for (let n = 4; n <= 10; n++) {
                        if (r.length < n) continue;
                        for (let i = 0; i <= r.length - n; i++) bump(r.slice(i, i + n));
                    }
                }

                // 英文：3-6 个单词短语
                const enWords = (s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [])
                    .map(w => w.toLowerCase())
                    .filter(Boolean);
                for (let n = 3; n <= 6; n++) {
                    if (enWords.length < n) continue;
                    for (let i = 0; i <= enWords.length - n; i++) bump(enWords.slice(i, i + n).join(' '));
                }
            }

            return Array.from(freq.entries())
                .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length) || (a[0] > b[0] ? 1 : -1))
                .slice(0, Math.max(1, Math.min(25, Number(max) || 15)))
                .map(([phrase, count]) => ({
                    phrase,
                    category: categorizeKeyword(phrase),
                    weight: Number(count) || 1,
                }));
        }

        // ==========================================
        // 国民级词组（3-5字/词）：本地统计后上报到 Supabase 汇总
        // - 中文：连续汉字 run 内 3-5 字窗口
        // - 英文：3-5 个单词 n-gram
        // - 只取本次文本内 topN，避免给后端造成压力
        // ==========================================
        function extractNationalPhrases(text, opts = {}) {
            const max = Math.max(1, Math.min(25, Number(opts.max) || 12));
            const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
            if (!cleaned) return [];

            const freq = new Map();
            const bump = (p) => {
                const s = String(p || '').trim();
                if (!s) return;
                if (s.length < 3) return;
                if (s.length > 64) return;
                if (/^[0-9]+$/.test(s)) return;
                if (/^[\p{P}\p{S}]+$/u.test(s)) return;
                // 过滤 url/代码味
                const low = s.toLowerCase();
                if (low.includes('http://') || low.includes('https://') || low.includes('```')) return;
                freq.set(s, (freq.get(s) || 0) + 1);
            };

            const segments = cleaned.split(/[。\.！!？\?\n\r；;，,]+/g).map(s => String(s || '').trim()).filter(Boolean);

            for (const seg of segments) {
                // 中文：3-5 字
                const zhRuns = seg.match(/[\u4e00-\u9fff]{3,}/g) || [];
                for (const run of zhRuns) {
                    const r = String(run);
                    for (let n = 3; n <= 5; n++) {
                        if (r.length < n) continue;
                        for (let i = 0; i <= r.length - n; i++) bump(r.slice(i, i + n));
                    }
                }

                // 英文：3-5 词
                const enWords = (seg.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [])
                    .map(w => w.toLowerCase())
                    .filter(Boolean);
                for (let n = 3; n <= 5; n++) {
                    if (enWords.length < n) continue;
                    for (let i = 0; i <= enWords.length - n; i++) bump(enWords.slice(i, i + n).join(' '));
                }
            }

            return Array.from(freq.entries())
                .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))
                .slice(0, max)
                .map(([phrase, count]) => ({
                    phrase,
                    category: 'phrase',
                    weight: Math.max(1, Math.min(5, Number(count) || 1)),
                }));
        }

        async function reportSlangFromText(text, location) {
            try {
                const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
                const API_ENDPOINT = apiEndpoint.trim().endsWith('/') ? apiEndpoint.trim() : `${apiEndpoint.trim()}/`;
                
                // 获取用户指纹
                const fingerprint = (() => {
                    try {
                        return localStorage.getItem('user_fingerprint') || null;
                    } catch (e) {
                        return null;
                    }
                })();
                
                const keywords = extractVibeKeywords(text, { max: 15 }) || [];
                const phrases = extractNationalPhrases(text, { max: 12 }) || [];

                // 合并去重（同 phrase 取更大 weight；category 优先保留 phrase）
                const merged = new Map();
                const put = (it) => {
                    const k = String(it?.phrase || '').trim();
                    if (!k) return;
                    const prev = merged.get(k);
                    if (!prev) {
                        merged.set(k, it);
                        return;
                    }
                    const w0 = Number(prev?.weight) || 1;
                    const w1 = Number(it?.weight) || 1;
                    const cat = (prev?.category === 'phrase' || it?.category === 'phrase') ? 'phrase' : (prev?.category || it?.category);
                    merged.set(k, { phrase: k, category: cat, weight: Math.max(w0, w1) });
                };
                keywords.forEach(put);
                phrases.forEach(put);

                const finalKeywords = Array.from(merged.values()).slice(0, 25);
                if (finalKeywords.length === 0) return;
                
                // 使用新版接口 /api/v2/report-vibe
                const payload = {
                    keywords: finalKeywords,
                    fingerprint: fingerprint || null,
                    timestamp: new Date().toISOString(),
                    region: location || 'Global',
                };
                
                // sendBeacon 最不打扰主线程/页面卸载
                if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
                    try {
                        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                        navigator.sendBeacon(`${API_ENDPOINT}api/v2/report-vibe`, blob);
                        return;
                    } catch {
                        // fallthrough
                    }
                }
                
                // fetch keepalive 兜底
                await fetch(`${API_ENDPOINT}api/v2/report-vibe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: JSON.stringify(payload),
                });
            } catch (e) {
                // 静默失败
            }
        }

        // ==========================================
        // 句式上报：只收集“真实用户输入”里的短句
        // - 不要太长：6-120 字符（后端再次过滤到 140）
        // - 不凑 10：只上报实际出现过的句子（按本次文本内频次 top）
        // ==========================================
        function extractRealSentences(text, opts = {}) {
            const maxItems = Math.max(1, Math.min(25, Number(opts.maxItems) || 12));
            const minLen = Math.max(4, Math.min(20, Number(opts.minLen) || 6));
            const maxLen = Math.max(40, Math.min(160, Number(opts.maxLen) || 120));

            const normalize = (s) => {
                const raw = String(s ?? '').replace(/\s+/g, ' ').trim();
                return raw
                    .replace(/^[\s"'“”‘’`~!！?？。.,，;；:：()\[\]{}<>-]+/g, '')
                    .replace(/[\s"'“”‘’`~!！?？。.,，;；:：()\[\]{}<>-]+$/g, '')
                    .trim();
            };

            const isBad = (s) => {
                if (!s) return true;
                if (s.length < minLen) return true;
                if (s.length > maxLen) return true;
                const low = s.toLowerCase();
                if (low.includes('http://') || low.includes('https://')) return true;
                if (low.includes('```')) return true;
                const sym = (s.match(/[{}[\]<>$=_*\\|]/g) || []).length;
                if (sym >= 6) return true;
                return false;
            };

            const parts = String(text || '')
                .split(/[\n\r]+|[。！？!?；;]+/g)
                .map((x) => normalize(x))
                .filter((x) => !isBad(x));

            const freq = new Map();
            for (const p of parts) freq.set(p, (freq.get(p) || 0) + 1);

            // 只取本次文本内最常出现的短句；若完全无重复，也允许 count=1 的 top1-3（不强行凑 10）
            const ranked = Array.from(freq.entries())
                .map(([sentence, count]) => ({ sentence, count: Number(count) || 1 }))
                .sort((a, b) => (b.count - a.count) || (a.sentence.length - b.sentence.length));

            const repeated = ranked.filter((x) => x.count >= 2);
            const list = (repeated.length > 0 ? repeated : ranked.slice(0, 3)).slice(0, maxItems);
            return list;
        }

        async function reportSentencesFromText(text, location) {
            try {
                const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
                const API_ENDPOINT = apiEndpoint.trim().endsWith('/') ? apiEndpoint.trim() : `${apiEndpoint.trim()}/`;

                const items = extractRealSentences(text, { maxItems: 12, minLen: 6, maxLen: 120 });
                if (!items || items.length === 0) return;

                const payload = {
                    region: location || 'Global',
                    items: items, // [{sentence,count}]
                    timestamp: new Date().toISOString(),
                };

                // sendBeacon 优先（不打扰主线程/页面卸载）
                if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
                    try {
                        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                        navigator.sendBeacon(`${API_ENDPOINT}api/report-sentences`, blob);
                        return;
                    } catch {
                        // fallthrough
                    }
                }

                await fetch(`${API_ENDPOINT}api/report-sentences`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: JSON.stringify(payload),
                });
            } catch {
                // 静默失败
            }
        }

        // 触发入口1：父页面 postMessage 传入分析结果
        // 约定消息格式：{ type: 'VIBE_ANALYSIS_RESULT', text: string, location?: string }
        window.addEventListener('message', (event) => {
            try {
                const data = event?.data;
                if (!data || data.type !== 'VIBE_ANALYSIS_RESULT') return;
                const text = data.text || '';
                const location = data.location || 'GLOBAL';
                // 注入“本次分析”的个人句式文本源（用于个人区看板）
                try {
                    window.lastAnalysisText = String(text || '');
                    window.lastAnalysisLocation = String(location || 'GLOBAL');
                    // 优先刷新句式看板（不阻塞上报）
                    try { window.loadWordCloud && window.loadWordCloud(); } catch (e2) { /* ignore */ }
                } catch (e1) { /* ignore */ }
                void reportSlangFromText(text, location);
                void reportSentencesFromText(text, location);
            } catch (e) {
                // ignore
            }
        });

        // 触发入口2：当前页面若存在 window.lastAnalysisText / window.lastAnalysisLocation，可直接调用
        window.reportSlangFromLastAnalysis = function () {
            try {
                const text = window.lastAnalysisText || '';
                const location = window.lastAnalysisLocation || 'GLOBAL';
                return reportSlangFromText(text, location);
            } catch (e) {
                return Promise.resolve();
            }
        };

        // 句式上报入口（可选）：供外部直接触发
        window.reportSentencesFromLastAnalysis = function () {
            try {
                const text = window.lastAnalysisText || '';
                const location = window.lastAnalysisLocation || 'GLOBAL';
                return reportSentencesFromText(text, location);
            } catch (e) {
                return Promise.resolve();
            }
        };
        
        /**
         * 全局函数：刷新用户数据（供 index.html 调用）
         * 当 index.html 提交聊天记录后，可以调用此函数刷新 stats2.html 的数据
         * 【GitHub OAuth 优先】优先从 supabase.auth.getSession() 中获取当前登录用户的 ID
         * 【修复 AbortError】添加防重复调用机制，避免页面刷新时多次调用导致冲突
         */
        // 防重复调用标志
        let isRefreshingUserStats = false;
        let refreshUserStatsAbortController = null;
        
        window.refreshUserStats = async function() {
            // 【修复 AbortError】如果正在刷新，取消之前的请求
            if (isRefreshingUserStats) {
                console.log('[Refresh] ⚠️ 检测到重复调用，取消之前的刷新请求...');
                if (refreshUserStatsAbortController) {
                    refreshUserStatsAbortController.abort();
                }
                // 取消后直接返回，避免重复执行
                return;
            }
            
            // 创建新的 AbortController
            refreshUserStatsAbortController = new AbortController();
            isRefreshingUserStats = true;
            
            console.log('[Refresh] 🔄 收到刷新请求，重新加载数据...');
            try {
                // 重新获取数据（添加 signal 支持取消）
                // 注意：fetchData 可能不支持 signal，这里先尝试调用
                try {
                    await fetchData();
                } catch (fetchDataError) {
                    // 如果是取消错误，直接返回
                    if (fetchDataError.name === 'AbortError' || fetchDataError.message?.includes('aborted')) {
                        console.log('[Refresh] ℹ️ 数据获取被取消');
                        return;
                    }
                    throw fetchDataError;
                }
                
                // 检查是否已被取消
                if (refreshUserStatsAbortController?.signal.aborted) {
                    console.log('[Refresh] ℹ️ 刷新请求已被取消');
                    return;
                }
                
                // 【GitHub OAuth 优先】优先检查是否有登录会话
                let currentUser = null;
                let matchedByGitHub = false;
                
                if (supabaseClient) {
                    try {
                        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                        
                        if (!sessionError && session && session.user) {
                            const githubUserId = session.user.id;
                            console.log('[Refresh] ✅ 检测到 GitHub OAuth 会话，user_id:', githubUserId.substring(0, 8) + '...');
                            
                            // 优先从 allData 中查找 user_id 匹配的记录
                            const allData = window.allData || [];
                            currentUser = allData.find(user => user.id === githubUserId);
                            
                            if (currentUser) {
                                matchedByGitHub = true;
                                console.log('[Refresh] ✅ 通过 GitHub User ID 找到用户:', currentUser.user_name || currentUser.name);
                            } else {
                            // 如果 allData 中没有，尝试从 Supabase 直接查询
                            // 【Task 2】使用统一视图 v_unified_analysis_v2
                            console.log('[Refresh] 🔍 allData 中未找到，尝试从 Supabase 查询（使用统一视图）...');
                            const { data: dbUser, error: queryError } = await supabaseClient
                                .from('v_unified_analysis_v2')
                                .select('*')
                                .eq('id', githubUserId)
                                .maybeSingle();
                                
                                if (!queryError && dbUser) {
                                    currentUser = dbUser;
                                    matchedByGitHub = true;
                                    
                                    // 添加到 allData
                                    const existingIndex = allData.findIndex(item => item.id === githubUserId);
                                    if (existingIndex !== -1) {
                                        allData[existingIndex] = { ...allData[existingIndex], ...dbUser };
                                    } else {
                                        allData.push(dbUser);
                                    }
                                    window.allData = allData;
                                    
                                    console.log('[Refresh] ✅ 从 Supabase 查询到用户:', dbUser.user_name || dbUser.name);
                                }
                            }
                        }
                    } catch (authError) {
                        console.warn('[Refresh] ⚠️ 检查 GitHub OAuth 会话失败:', authError);
                    }
                }
                
                // 【降级方案】如果没有 GitHub OAuth 会话，使用 fingerprint 匹配
                if (!currentUser) {
                    console.log('[Refresh] 🔄 未找到 GitHub OAuth 用户，尝试使用 fingerprint 匹配...');
                    
                    const normalizeFingerprint = (fp) => {
                        if (!fp) return '';
                        return String(fp).trim().toLowerCase();
                    };
                    
                    let currentFingerprint = null;
                    try {
                        currentFingerprint = localStorage.getItem('user_fingerprint');
                    } catch (e) {
                        console.warn('[Refresh] ⚠️ 读取 localStorage 失败:', e);
                    }
                    
                    const normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                    const allData = window.allData || [];
                    
                    if (normalizedCurrentFingerprint && allData.length > 0) {
                        currentUser = allData.find(user => {
                            const userFingerprint = normalizeFingerprint(user.fingerprint || user.user_fingerprint);
                            const userIdentity = normalizeFingerprint(user.user_identity);
                            return (userFingerprint && userFingerprint === normalizedCurrentFingerprint) ||
                                   (userIdentity && userIdentity === normalizedCurrentFingerprint);
                        });
                        
                        if (currentUser) {
                            console.log('[Refresh] ✅ 通过 fingerprint 找到用户:', currentUser.user_name || currentUser.name);
                            
                            // 【Master Key】一旦通过指纹找到有数据的用户，将其指纹永久存入本地
                            const totalMsgs = currentUser.total_messages || currentUser.stats?.total_messages || 0;
                            if (totalMsgs > 0 && currentUser.fingerprint) {
                                localStorage.setItem('last_successful_fingerprint', currentUser.fingerprint);
                                console.log('[Refresh] 🔑 已录入 Master Key:', currentUser.fingerprint.substring(0, 8) + '...');
                            }
                        }
                    }
                }
                
                if (currentUser) {
                    // 【竟态修复】若本地已锁定校准，优先用本地 manual_* 覆盖 API 返回，避免抽屉被 IP 定位覆盖（localStorage 兜底，防止 currentUserData 被并发刷新覆盖）
                    if (localStorage.getItem('loc_fixed') === 'true') {
                        const data = window.currentUserData;
                        const mlat = data?.manual_lat ?? (localStorage.getItem('manual_lat') ? Number(localStorage.getItem('manual_lat')) : undefined);
                        const mlng = data?.manual_lng ?? (localStorage.getItem('manual_lng') ? Number(localStorage.getItem('manual_lng')) : undefined);
                        const mloc = (data?.manual_location ?? currentUser.manual_location ?? (localStorage.getItem('manual_location') || '').trim()) || '';
                        if (mlat != null && !isNaN(mlat)) currentUser.manual_lat = mlat;
                        if (mlng != null && !isNaN(mlng)) currentUser.manual_lng = mlng;
                        if (mloc && String(mloc).trim() !== '') currentUser.manual_location = String(mloc).trim();
                        currentUser.country_code = currentUser.manual_location || currentUser.ip_location;
                    }
                    window.currentUser = currentUser;
                    window.currentUserData = currentUser;
                    window.currentUserMatchedByFingerprint = !matchedByGitHub; // 如果通过 GitHub 匹配，则设为 false
                    
                    // 【Master Key】如果当前用户有数据且已识别，确保持久化存储其指纹（作为万能钥匙）
                    const totalMsgs = currentUser.total_messages || currentUser.stats?.total_messages || 0;
                    if (totalMsgs > 0 && currentUser.fingerprint) {
                        localStorage.setItem('last_successful_fingerprint', currentUser.fingerprint);
                    }
                    
                    // 刷新排名卡片
                    renderRankCards(currentUser);
                    
                    // 如果左侧抽屉已打开，用当前用户（已合并校准）刷新；若已锁定校准则强制显示校准国家，避免竟态导致切回 IP 定位
                    const leftDrawer = document.getElementById('left-drawer');
                    const leftBody = document.getElementById('left-drawer-body');
                    if (leftDrawer && leftBody) {
                        const isDrawerOpen = leftDrawer.classList.contains('active');
                        if (isDrawerOpen) {
                            // ✅ 关键：母国（manual_location）≠ 当前国家视角（currentDrawerCountry/anchored_country）
                            // 在国家透视（COUNTRY）模式下，必须保持用户正在查看的国家，不要被 manual_location 覆盖回去，
                            // 否则会出现“点 CN 但抽屉仍显示 US 数据（看似复制）”的问题。
                            const inCountryView = (typeof currentViewState === 'string' && currentViewState === 'COUNTRY');
                            const drawerCode = inCountryView
                                ? currentDrawerCountry.code
                                : ((localStorage.getItem('loc_fixed') === 'true' && (currentUser.manual_location || currentUser.country_code))
                                    ? (currentUser.manual_location || currentUser.country_code)
                                    : currentDrawerCountry.code);
                            const drawerName = drawerCode && (typeof countryNameMap !== 'undefined' && countryNameMap[drawerCode])
                                ? (currentLang === 'zh' ? countryNameMap[drawerCode].zh : countryNameMap[drawerCode].en)
                                : (currentDrawerCountry.name || drawerCode);
                            if (drawerCode) {
                                // 如果用户正在看国家透视（US/CN），刷新用户数据时只更新左抽屉内容，保留右侧国家面板
                                const preserve = inCountryView;
                                showDrawersWithCountryData(drawerCode, drawerName || drawerCode, undefined, { preserveCountryPanel: preserve });
                            }
                        }
                    }

                    // 【地图联动】优先使用 manual 坐标，否则用 lat/lng；有坐标则更新地图与持久光标
                    const lat = (currentUser.manual_lat != null && !isNaN(currentUser.manual_lat))
                        ? Number(currentUser.manual_lat)
                        : (currentUser.lat != null && !isNaN(currentUser.lat) ? Number(currentUser.lat) : null);
                    const lng = (currentUser.manual_lng != null && !isNaN(currentUser.manual_lng))
                        ? Number(currentUser.manual_lng)
                        : (currentUser.lng != null && !isNaN(currentUser.lng) ? Number(currentUser.lng) : null);
                    if (lat !== null && lng !== null) {
                        // 【修复】检查锁定状态，防止覆盖用户手动校准的位置
                        const isLocked = localStorage.getItem('loc_locked') === 'true';
                        if (isLocked) {
                            console.log('[Refresh] 🔒 检测到坐标已锁定，跳过自动更新');
                        } else {
                            console.log('[Refresh] 🗺️ 检测到用户坐标（优先 manual），触发地图联动:', { lat, lng });
                        try {
                            if (mapChart && typeof mapChart.setOption === 'function') {
                                const currentOption = mapChart.getOption();
                                if (currentOption && currentOption.geo && Array.isArray(currentOption.geo) && currentOption.geo.length > 0) {
                                    const updatedGeo = currentOption.geo.map(geo => ({
                                        ...geo,
                                        center: [lng, lat],
                                        zoom: 3
                                    }));
                                    mapChart.setOption({ geo: updatedGeo }, { notMerge: false, lazyUpdate: false });
                                    console.log('[Refresh] ✅ 地图中心已更新到用户位置');
                                }
                            }
                            if (typeof triggerMapPulse === 'function') {
                                const githubUsername = currentUser.user_name || currentUser.name || 'YOU';
                                const avatarUrl = currentUser.user_metadata?.avatar_url ||
                                    (githubUsername ? getGitHubAvatarUrl(githubUsername) : null) || DEFAULT_AVATAR;
                                const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
                                const pulseColor = statusConfig.status_color || '#00ff41';
                                triggerMapPulse(lng, lat, 'YOU', pulseColor, avatarUrl, githubUsername);
                            console.log('[Refresh] ✅ 地图脉冲效果已触发');
                        }
                    } catch (mapError) {
                        console.warn('[Refresh] ⚠️ 地图联动失败:', mapError);
                    }
                        } // isLocked 块结束
                    } else {
                        console.log('[Refresh] ℹ️ 用户坐标不完整，跳过地图联动');
                    }
                    console.log('[Refresh] ✅ 用户数据已刷新', matchedByGitHub ? '(GitHub OAuth)' : '(Fingerprint)');
                } else {
                    console.log('[Refresh] ⚠️ 未找到当前用户数据');
                }
            } catch (error) {
                // 【修复 AbortError】特殊处理 AbortError
                if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                    console.log('[Refresh] ℹ️ 刷新请求被取消（可能是页面刷新导致）');
                } else {
                    console.error('[Refresh] ❌ 刷新失败:', error);
                }
            } finally {
                // 重置标志
                isRefreshingUserStats = false;
                refreshUserStatsAbortController = null;
            }
        };
        
        // 监听 storage 事件，当其他页面更新 localStorage 时自动刷新
        window.addEventListener('storage', (e) => {
            if (e.key === 'user_fingerprint' || e.key === 'github_username') {
                console.log('[Storage] 🔔 检测到 localStorage 变化，触发数据刷新');
                setTimeout(() => {
                    window.refreshUserStats();
                }, 500);
            }
        });

        // 页面卸载时清理 Realtime 监听
        window.addEventListener('beforeunload', () => {
            stopRealtimeListener();
        });
    