/**
 * stats-app-i18n.js - Internationalization Module
 * Contains all translation strings for zh/en
 * Exposed to window for use by main app
 */
(function() {
    'use strict';

    // Skip if already loaded
    if (window.__I18nModuleLoaded) {
        console.log('[I18n Module] Already loaded, skipping...');
        return;
    }
    window.__I18nModuleLoaded = true;

    // ============================================================
    // i18n Translations (zh/en)
    // ============================================================
    
    window.i18n = {
        zh: {
            // Tab 导航
            'tab.global': '全球',
            'tab.country': '国家',
            'tab.ranking': '排行榜',
            
            // Buttons / panel header / hotlist / PK
            'btn.back_global': '[返回全网]',
            'btn.switch_country': '[国家透视]',
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
            'sub-title': '',
            'total-victims': '已诊断开发者',
            'total-analysis': '全网扫描次数',
            'total-roast': '累计吐槽字数',
            'avg-chars': '人均吐槽量',
            'radar-title': '全网平均开发者画像',
            'personality-dist': '人格分布排行',
            'active-nodes': '活跃节点',
            'threat-level': '体检人数',
            'top-hotspot': '最密集热区',
            'sys-days': '运行天数',
            'city-coverage': '城市覆盖',
            'sync-rate': '同步速率',
            'hot-list': '地理位置热力排行',
            'recent-activity': '实时诊断活动',
            'victim': '受害者',
            'loading': '初始化中...',
            'rank': '排名',
            'select-country': '选择国家',
            'search-countries': '搜索国家...'
        },
        en: {
            'top-title': 'Cursor Behavior Report · Global Distribution Map',
            'sub-title': '',
            'total-victims': 'Total Developers',
            'total-analysis': 'Total Scans',
            'total-roast': 'Total Roast Words',
            'avg-chars': 'Avg Roast Per User',
            'radar-title': 'Global Developer Persona',
            'personality-dist': 'Personality Distribution',
            'active-nodes': 'Active Nodes',
            'threat-level': 'Physical Exam Count',
            'top-hotspot': 'Primary Hotspot',
            'sys-days': 'Days Online',
            'city-coverage': 'City Coverage',
            'sync-rate': 'Sync Rate',
            'hot-list': 'Geographic Hotspots',
            'recent-activity': 'Live Activity Feed',
            'victim': 'Victim',
            'loading': 'Initializing...',
            'rank': 'Rank',
            'select-country': 'Select Country',
            'search-countries': 'Search countries...'
        }
    };

    // ============================================================
    // I18N_MAP: Additional translations
    // ============================================================
    
    window.I18N_MAP = {
        zh: {
            // 右抽屉 Tab 与按钮（中文下必须显示中文）
            'tab.ranking': '排行榜',
            'tab.global': '全球',
            'tab.country': '国家',
            'btn.refresh': '刷新',

            // Drawer / Panels
            'drawer.details': '详细信息',
            'drawer.my_stats': '我的数据统计',
            'drawer.tech_rank': '技术排名',
            'rank.country': '该国',
            'rank.global': '全球',
            'rank.rank_n': '第 {n} 名',
            'rank.total_people': '共 {n} 人',
            'rank.global_rank_label': '全球排名',
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

            // Right drawer status / labels（中文版下右抽屉标题与状态）
            'panel.live_feed': '实时数据',
            'panel.coord_prefix': '坐标',
            'panel.coord_placeholder': '坐标：--',
            'panel.data_stable': '数据：稳定',
            'panel.data_cached': '数据：缓存',
            'panel.data_fetching': '数据：获取中',
            'panel.data_error': '数据：错误',
            'panel.data_ready': '数据：就绪',
            'panel.nation_prefix': '国家',
            'panel.pk_power': '权力值',
            'panel.pk_tsundere': '傲娇',
            'panel.pk_bootlick': '跪舔',
            'panel.national_cloud_50': '本国词云 50',
            'panel.country_top_10': '国家 Top10',
            'panel.semantic_label': '语义',
            'panel.most_used': '最常用',
            'panel.freq': '频次',
            'panel.elite_hint': '左滑查看高分图谱',
            'panel.ratio_label': '占比',
            'panel.global_ratio_label': '全球占比',
            'panel.core_trait_prefix': '核心特质',
            'panel.semantic_score_prefix': '语义分',
            'panel.meltdown_pending': '待计算',
            'panel.meltdown_words': '字数',
            'panel.others': '其他',

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
            'metric.cursor_days': '上岗天数',
            'metric.banter_total': '废话输出总数',
            'metric.avg_len': '平均吹水长度',
            'metric.avg_len_unit': '字/条',
            'metric.cursor_days_unit': '天',

            // Country totals table labels
            'countryTotals.messages': '调戏AI次数',
            'countryTotals.totalChars': '对话字符数',
            'countryTotals.userChars': '废话输出',
            'countryTotals.avgLen': '平均长度',
            'countryTotals.jiafang': '甲方上身',
            'countryTotals.ketao': '磕头',
            'countryTotals.workDays': '上岗天数',

            // Radar / states
            'radar.loading': '数据加载中...',
            'radar.insufficient': '该地区画像数据不足，正在汇总中...',
            'realtime.none': '暂无人格分布数据',
            'lpdef.none': '暂无高分图谱数据',

            // Tooltip labels（地图悬浮：该国已提交聊天记录的用户数，非在线人数）
            'tooltip.active_nodes': '已提交用户',
            'tooltip.record': '战绩',
            'tooltip.roast': '吐槽',
            'tooltip.answers': '答案之书',

            // Errors
            'error.data_load_failed': '数据加载失败，请检查网络连接'
        },
        en: {
            // Drawer / Panels
            'drawer.details': 'Details',
            'drawer.my_stats': 'My Stats',
            'drawer.tech_rank': 'Tech Rank',
            'rank.country': 'Country',
            'rank.global': 'Global',
            'rank.rank_n': 'No. {n}',
            'rank.total_people': 'Total {n}',
            'rank.global_rank_label': 'Global rank',
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

            // Right drawer status / labels
            'panel.live_feed': 'LIVE_FEED',
            'panel.coord_prefix': 'COORD',
            'panel.coord_placeholder': 'COORD: --',
            'panel.data_stable': 'DATA: STABLE',
            'panel.data_cached': 'DATA: CACHED',
            'panel.data_fetching': 'DATA: FETCHING',
            'panel.data_error': 'DATA: ERROR',
            'panel.data_ready': 'DATA: READY',
            'panel.nation_prefix': 'NATION',
            'panel.pk_power': 'POWER',
            'panel.pk_tsundere': 'Tsundere',
            'panel.pk_bootlick': 'Bootlick',
            'panel.national_cloud_50': 'NATIONAL CLOUD 50',
            'panel.country_top_10': 'COUNTRY TOP 10',
            'panel.semantic_label': 'SEMANTIC',
            'panel.most_used': 'MOST_USED',
            'panel.freq': 'FREQ',
            'panel.elite_hint': 'Swipe to view Top Agents',
            'panel.ratio_label': 'RATIO',
            'panel.global_ratio_label': 'GLOBAL_RATIO',
            'panel.core_trait_prefix': 'Core trait',
            'panel.semantic_score_prefix': 'Semantic',
            'panel.meltdown_pending': 'PENDING',
            'panel.meltdown_words': 'WORDS',
            'panel.others': 'OTHERS',

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

            // Tab navigation
            'tab.global': 'Global',
            'tab.country': 'Country',
            'tab.ranking': 'Ranking',
            
            // Buttons / panel header / hotlist / PK
            'btn.back_global': '[Back to Global]',
            'btn.switch_country': '[Country Panel]',
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
            'metric.cursor_days': 'Days On Duty',
            'metric.banter_total': 'Banter Output',
            'metric.avg_len': 'Avg Prompt Length',
            'metric.avg_len_unit': 'chars/msg',
            'metric.cursor_days_unit': 'days',

            // Country totals table labels
            'countryTotals.messages': 'AI Interactions',
            'countryTotals.totalChars': 'Total Chars',
            'countryTotals.userChars': 'User Chars',
            'countryTotals.avgLen': 'Avg Len',
            'countryTotals.jiafang': 'Client Mode',
            'countryTotals.ketao': 'Humble Mode',
            'countryTotals.workDays': 'Work Days',

            // Radar / states
            'radar.loading': 'Loading...',
            'radar.insufficient': 'Not enough data yet. Aggregating...',
            'realtime.none': 'No personality distribution yet',
            'lpdef.none': 'No LPDEF ranking yet',

            // Tooltip labels (map: submitted chat record users per country, not online count)
            'tooltip.active_nodes': 'Submitted Users',
            'tooltip.record': 'Record',
            'tooltip.roast': 'Roast',
            'tooltip.answers': 'Answers',

            // Errors
            'error.data_load_failed': 'Failed to load data. Check your connection.'
        }
    };

    // ============================================================
    // DIMENSION_NAME_I18N
    // ============================================================
    
    window.DIMENSION_NAME_I18N = {
        ai: { zh: '调戏AI次数', en: 'AI Interactions', icon: '💬', suffixZh: '次', suffixEn: 'times' },
        word: { zh: '平均长度', en: 'Avg Length', icon: '📏', suffixZh: '字/条', suffixEn: 'chars/msg' },
        day: { zh: '上岗天数', en: 'Days On Duty', icon: '📅', suffixZh: '天', suffixEn: 'days' },
        no: { zh: '甲方上身', en: 'Client Mode', icon: '🚫', suffixZh: '次', suffixEn: 'times' },
        say: { zh: '废话输出', en: 'Banter Output', icon: '💭', suffixZh: '字', suffixEn: 'chars' },
        please: { zh: '赛博磕头', en: 'Humble Mode', icon: '🙏', suffixZh: '次', suffixEn: 'times' }
    };

    console.log('[I18n Module] ✅ Loaded successfully');

})();
