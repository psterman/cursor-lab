/**
 * github-card-renderer.js - GitHub Combat 卡片渲染
 * 将后端 22 项 github_stats 全量注入左侧抽屉（置于「选择国家」下方）：
 * Header(login/avatar/globalRanking/organizations)、16 格数值(mergedPRs/totalRepoStars/commitVelocity/prReviews/activeDays/totalRepos/followers/following/totalStars/totalCommits/sponsorships/restrictedContributions/totalForks/totalWatchers/totalCodeSize/closedIssues)、主语言/新语言、Language DNA、accountAge/syncedAt、刷新按钮
 * 样式：bg-zinc-900/90、hacker-border(#00ff41)、JetBrains Mono、数值滚动动画
 * 支持中英文：通过 options.lang 或全局 currentLang 切换
 */
(function () {
    'use strict';

    var TERMINAL_GREEN = '#00ff41';
    var TERMINAL_GREEN_RGBA = 'rgba(0, 255, 65, 0.3)';
    var TERMINAL_GREEN_GLOW = 'rgba(0, 255, 65, 0.15)';
    var CARD_BG = 'rgba(24, 24, 27, 0.9)';

    var I18N = {
        zh: {
            analyzing: '分析中...',
            refresh: '刷新',
            dnaScanning: 'DNA 扫描中...',
            analyzingDesc: '正在分析 GitHub 战力数据...',
            syncToUnlock: '同步以解锁 GitHub 战力',
            justNow: '刚刚',
            minutesAgo: ' 分钟前',
            hoursAgo: ' 小时前',
            langWaiting: '等待初始化...',
            langUnavailable: '语言数据不可用',
            strike: '出击',
            influence: '影响力',
            velocity30d: '30 日活跃度',
            codeReviews: '代码审查',
            annualVitality: '年度活跃',
            nodesCount: '仓库数',
            followers: '粉丝',
            following: '关注',
            totalStars: '获星',
            totalCommits: '提交数',
            sponsorships: '赞助',
            restrictedContributions: '内源贡献',
            totalForks: 'Fork 数',
            totalWatchers: 'Watchers',
            totalCodeSize: '代码量',
            closedIssues: '关闭 Issue',
            primaryLanguage: '主语言',
            newestLanguage: '新语言',
            languageDna: '语言 DNA',
            activeForDays: '已活跃 {n} 天',
            synced: '同步于',
            repoUpdatedAt: '仓库更新日期',
            configBadge: 'CONFIG',
            identityConfig: '用户身份配置',
            inbox: '收件箱',
            logout: '退出',
            deleteAccount: '删除',
            status: '状态',
            online: '在线',
            busy: '忙碌',
            offline: '离线',
            githubLogin: 'GitHub 登录',
            useGitHubLogin: 'GitHub 登录',
            loginSecurityNote: '安全、快速、一键登录',
            notSet: '未设置',
            pleaseLogin: '请使用 GitHub 登录',
            githubCombat: 'GitHub 战力',
            updateCursorData: '更新 Cursor 数据',
            connectedOpenclawPort: '已连接 {port}',
            slotCursorLedOn: '本地已有 Cursor 对话数据',
            slotCursorLedOff: '暂无本地对话计数',
            smartSyncCenter: '智能同步中心',
            newArchive: '新建档案',
            updateArchive: '更新档案',
            lastSyncPrefix: '最后同步',
            archiveLocalWithoutTime: '本地已有档案数据',
            pathGuideTitle: '本地数据路径',
            pathGuideContinue: '已了解，选择文件夹',
            pathGuideCursorMac: 'Cursor（macOS）：~/Library/Application Support/Cursor/User/workspaceStorage/ 下各子目录中的 state.vscdb',
            pathGuideCursorWin: 'Cursor（Windows）：%APPDATA%\\Cursor\\User\\workspaceStorage\\ 下各子目录中的 state.vscdb',
            pathGuideOcMac: 'OpenClaw（macOS）：~/.openclaw/agents/main/sessions/ 下的 .jsonl 会话日志',
            pathGuideOcWin: 'OpenClaw（Windows）：%USERPROFILE%\\.openclaw\\agents\\main\\sessions\\ 下的 .jsonl',
            pathGuideGlobalMac: 'Cursor 锚点（macOS）：~/Library/Application Support/Cursor/User/globalStorage/storage.json',
            pathGuideGlobalWin: 'Cursor 锚点（Windows）：%APPDATA%\\Cursor\\User\\globalStorage\\storage.json',
            pathGuideGlobalLinux: 'Cursor 锚点（Linux）：~/.config/Cursor/User/globalStorage/storage.json',
            pathGuideWsLinux: 'Cursor（Linux）：~/.config/Cursor/User/workspaceStorage/ → state.vscdb',
            pathGuideOcLinux: 'OpenClaw（Linux）：~/.openclaw/agents/main/sessions/*.jsonl',
            smartInjectTitle: '智能数据注入',
            smartInjectSubtitle: '全自动扫描或精准选择本地档案',
            smartInjectAutoScan: '全自动扫描',
            smartInjectGeekMode: '极客模式',
            smartInjectBackFool: '返回傻瓜模式',
            smartInjectSlotCursor: 'Slot · Cursor',
            smartInjectSlotOpenclaw: 'Slot · OpenClaw',
            smartInjectPickCursorDir: '选择 Cursor 目录',
            smartInjectPickOpenclawDir: '选择 OpenClaw 会话目录',
            smartInjectGeekSync: '开始同步',
            smartInjectScanning: '正在扫描…',
            smartInjectPickerUnavailable: '当前环境不支持文件夹选择，请使用极客模式或 HTTPS/localhost。',
            smartInjectNoFiles: '未找到 state.vscdb 或 OpenClaw 会话 .jsonl，请扩大目录或检查路径。',
            smartInjectAnchorNoVscdb: '已识别 globalStorage 锚点，但未找到 workspaceStorage 下的 state.vscdb，请选择上级的 Cursor/User 目录。',
            cursorSlotHint: '打开向导：全自动扫描或精准选择文件夹。'
        },
        en: {
            analyzing: 'ANALYZING...',
            refresh: 'REFRESH',
            dnaScanning: 'DNA SCANNING...',
            analyzingDesc: 'Analyzing GitHub combat stats...',
            syncToUnlock: 'Sync to unlock GitHub stats',
            justNow: 'Just now',
            minutesAgo: 'm ago',
            hoursAgo: 'h ago',
            langWaiting: 'Waiting for initialization...',
            langUnavailable: 'Language data unavailable',
            strike: 'STRIKE',
            influence: 'INFLUENCE',
            velocity30d: '30D VELOCITY',
            codeReviews: 'CODE REVIEWS',
            annualVitality: 'ANNUAL VITALITY',
            nodesCount: 'NODES COUNT',
            followers: 'FOLLOWERS',
            following: 'FOLLOWING',
            totalStars: 'STARS',
            totalCommits: 'COMMITS',
            sponsorships: 'SPONSORSHIPS',
            restrictedContributions: 'RESTRICTED',
            totalForks: 'FORKS',
            totalWatchers: 'WATCHERS',
            totalCodeSize: 'CODE SIZE',
            closedIssues: 'CLOSED ISSUES',
            primaryLanguage: 'Primary',
            newestLanguage: 'Newest',
            languageDna: 'Language DNA',
            activeForDays: 'Active for {n} days',
            synced: 'Synced',
            repoUpdatedAt: 'Repo updated',
            configBadge: 'CONFIG',
            identityConfig: 'Identity',
            inbox: 'Inbox',
            logout: 'Logout',
            deleteAccount: 'Delete',
            status: 'Status',
            online: 'Online',
            busy: 'Busy',
            offline: 'Offline',
            githubLogin: 'GitHub Login',
            useGitHubLogin: 'Sign in with GitHub',
            loginSecurityNote: 'Secure, fast, one-click',
            notSet: 'Not set',
            pleaseLogin: 'Sign in with GitHub',
            githubCombat: 'GitHub Combat',
            updateCursorData: 'Update Cursor data',
            connectedOpenclawPort: 'Connected · port {port}',
            slotCursorLedOn: 'Local Cursor message data present',
            slotCursorLedOff: 'No local message count yet',
            smartSyncCenter: 'Smart sync hub',
            newArchive: 'New profile',
            updateArchive: 'Update profile',
            lastSyncPrefix: 'Last sync',
            archiveLocalWithoutTime: 'Local archive present',
            pathGuideTitle: 'Local data paths',
            pathGuideContinue: 'Continue — pick folder',
            pathGuideCursorMac: 'Cursor (macOS): state.vscdb under ~/Library/Application Support/Cursor/User/workspaceStorage/',
            pathGuideCursorWin: 'Cursor (Windows): state.vscdb under %APPDATA%\\Cursor\\User\\workspaceStorage\\',
            pathGuideOcMac: 'OpenClaw (macOS): ~/.openclaw/agents/main/sessions/*.jsonl',
            pathGuideOcWin: 'OpenClaw (Windows): %USERPROFILE%\\.openclaw\\agents\\main\\sessions\\*.jsonl',
            pathGuideGlobalMac: 'Cursor anchor (macOS): ~/Library/Application Support/Cursor/User/globalStorage/storage.json',
            pathGuideGlobalWin: 'Cursor anchor (Windows): %APPDATA%\\Cursor\\User\\globalStorage\\storage.json',
            pathGuideGlobalLinux: 'Cursor anchor (Linux): ~/.config/Cursor/User/globalStorage/storage.json',
            pathGuideWsLinux: 'Cursor (Linux): ~/.config/Cursor/User/workspaceStorage/ → state.vscdb',
            pathGuideOcLinux: 'OpenClaw (Linux): ~/.openclaw/agents/main/sessions/*.jsonl',
            smartInjectTitle: 'Smart data inject',
            smartInjectSubtitle: 'Auto-scan or pick files precisely',
            smartInjectAutoScan: 'Full auto scan',
            smartInjectGeekMode: 'Geek mode',
            smartInjectBackFool: 'Back to simple mode',
            smartInjectSlotCursor: 'Slot · Cursor',
            smartInjectSlotOpenclaw: 'Slot · OpenClaw',
            smartInjectPickCursorDir: 'Pick Cursor folder',
            smartInjectPickOpenclawDir: 'Pick OpenClaw sessions folder',
            smartInjectGeekSync: 'Sync now',
            smartInjectScanning: 'Scanning…',
            smartInjectPickerUnavailable: 'Folder picker unavailable. Use geek mode or HTTPS/localhost.',
            smartInjectNoFiles: 'No state.vscdb or OpenClaw .jsonl found. Widen the folder or check paths.',
            smartInjectAnchorNoVscdb: 'Found globalStorage anchor but no state.vscdb under workspaceStorage. Select Cursor/User or higher.',
            cursorSlotHint: 'Open wizard: auto-scan or pick folders.'
        }
    };

    var GITHUB_ICON_SVG = '<svg class="w-8 h-8 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg>';

    /** 从本地缓存读取 Cursor total_messages（用于 Config Slot1 状态灯与按钮文案） */
    function readCursorTotalMessagesFromLocalStorage() {
        var best = 0;
        var keys = ['last_analysis_data', 'vibe_cursor_analysis_cache'];
        for (var i = 0; i < keys.length; i++) {
            try {
                var raw = typeof localStorage !== 'undefined' && localStorage.getItem(keys[i]);
                if (!raw) continue;
                var o = JSON.parse(raw);
                if (!o || typeof o !== 'object') continue;
                var st = o.stats && typeof o.stats === 'object' ? o.stats : {};
                var tm = st.total_messages != null ? st.total_messages : (st.totalMessages != null ? st.totalMessages : null);
                if (tm == null) tm = o.total_messages != null ? o.total_messages : o.totalMessages;
                var n = Number(tm);
                if (Number.isFinite(n) && n > best) best = n;
            } catch (e) { /* ignore */ }
        }
        return best;
    }

    /** 读取已探测的 OpenClaw 网关端口（openclaw2_gateway_port） */
    function readStoredOpenClawGatewayPort() {
        try {
            var p = typeof localStorage !== 'undefined' && localStorage.getItem('openclaw2_gateway_port');
            var n = parseInt(String(p || '').trim(), 10);
            if (Number.isFinite(n) && n > 0) return String(n);
        } catch (e) { /* ignore */ }
        return '';
    }

    /** 从 last_analysis_data / 缓存对象上取可能的时间戳（毫秒） */
    function inferArchiveTimestampFromStorage() {
        var best = 0;
        function bump(val) {
            if (val == null || val === '') return;
            var d = Date.parse(String(val));
            if (!Number.isNaN(d) && d > best) best = d;
        }
        var keys = ['last_analysis_data', 'vibe_cursor_analysis_cache', 'vibe_openclaw_analysis_cache'];
        for (var i = 0; i < keys.length; i++) {
            try {
                var raw = typeof localStorage !== 'undefined' && localStorage.getItem(keys[i]);
                if (!raw) continue;
                var o = JSON.parse(raw);
                if (!o || typeof o !== 'object') continue;
                bump(o.syncedAt);
                bump(o.synced_at);
                bump(o.last_sync_at);
                bump(o.analyzed_at);
                bump(o.updated_at);
                bump(o.timestamp);
                if (o.stats && typeof o.stats === 'object') {
                    bump(o.stats.syncedAt);
                    bump(o.stats.analyzed_at);
                }
            } catch (e) { /* ignore */ }
        }
        return best;
    }

    /** 是否已有 OpenClaw 本地缓存（与监视器一致） */
    function hasOpenClawLocalArchive() {
        try {
            var raw = typeof localStorage !== 'undefined' && localStorage.getItem('vibe_openclaw_analysis_cache');
            if (!raw || !String(raw).trim()) return false;
            var o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return false;
            if (o.openclawPortrait || o.stats || o.timestamp) return true;
            return Object.keys(o).length > 0;
        } catch (e) {
            return false;
        }
    }

    /**
     * last_cursor_sync / last_openclaw_sync，并兜底：last_analysis_data、OpenClaw 缓存
     * 用户若仅在 index 等页面上传过、未经过 stats2 写入 last_*_sync，仍应显示「更新档案」
     */
    function readSmartArchiveSyncState() {
        var c = '';
        var o = '';
        try {
            if (typeof localStorage !== 'undefined') {
                c = String(localStorage.getItem('last_cursor_sync') || '').trim();
                o = String(localStorage.getItem('last_openclaw_sync') || '').trim();
            }
        } catch (e) { /* ignore */ }
        var times = [];
        if (c) {
            var dc = Date.parse(c);
            if (!Number.isNaN(dc)) times.push(dc);
        }
        if (o) {
            var dco = Date.parse(o);
            if (!Number.isNaN(dco)) times.push(dco);
        }
        var fromKeys = times.length ? Math.max.apply(null, times) : 0;
        var inferredTs = inferArchiveTimestampFromStorage();
        var lastTs = Math.max(fromKeys, inferredTs);
        var cursorMsgs = readCursorTotalMessagesFromLocalStorage();
        var hasCursorLocal = cursorMsgs > 0;
        var hasOcLocal = hasOpenClawLocalArchive();
        var hasAnySync = times.length > 0 || hasCursorLocal || hasOcLocal || inferredTs > 0;
        return {
            hasCursor: !!c || hasCursorLocal,
            hasOpenclaw: !!o || hasOcLocal,
            hasAnySync: hasAnySync,
            lastTs: lastTs
        };
    }

    function formatSmartSyncTime(ts, lang) {
        if (!ts) return '';
        try {
            var d = new Date(ts);
            if (Number.isNaN(d.getTime())) return '';
            return lang === 'en' ? d.toLocaleString('en-US') : d.toLocaleString('zh-CN');
        } catch (e) {
            return '';
        }
    }

    /**
     * 生成身份区块 HTML（私信、GitHub 登录、退出、链接、国家、状态、徽章、图标）
     * options.identity: { avatarUrl, displayName, displayLabel, badgeHtml, githubUsername, isLoggedIn, currentStatus, defaultAvatar }
     */
    function buildIdentityBlock(identity, lang) {
        if (!identity || typeof identity !== 'object') return '';
        var avatarUrl = identity.avatarUrl || '';
        var displayName = identity.displayName || t(lang, 'notSet');
        var displayLabel = identity.displayLabel || '';
        var badgeHtml = identity.badgeHtml || '';
        var githubUsername = identity.githubUsername || '';
        var isLoggedIn = !!identity.isLoggedIn;
        var currentStatus = identity.currentStatus || 'idle';
        var defaultAvatar = identity.defaultAvatar || '';
        if (!defaultAvatar && typeof window.STATS_CONSTANTS !== 'undefined' && window.STATS_CONSTANTS.DEFAULT_AVATAR) defaultAvatar = window.STATS_CONSTANTS.DEFAULT_AVATAR;
        var exitDeleteBtns = isLoggedIn ? '<button type="button" id="left-drawer-exit-btn" class="left-drawer-exit-btn identity-row-btn px-2 py-1 text-[10px] rounded border border-[#00ff41]/40 text-[#00ff41]/90 hover:bg-[#00ff41]/10 transition-colors font-mono" title="' + esc(t(lang, 'logout')) + '">' + esc(t(lang, 'logout')) + '</button><button type="button" id="left-drawer-delete-account-btn" class="left-drawer-delete-account-btn identity-row-btn px-2 py-1 text-[10px] rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors font-mono" title="' + esc(t(lang, 'deleteAccount')) + '">' + esc(t(lang, 'deleteAccount')) + '</button>' : '';
        var linkHtml = isLoggedIn && githubUsername ? '<a href="https://github.com/' + esc(githubUsername) + '" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-[9px] text-[#00ff41]/70 hover:text-[#00ff41] transition-colors font-mono">github.com/' + esc(githubUsername) + '</a>' : '';
        var dataSourceTitle = lang === 'en' ? 'Data Source Management' : '数据源管理';
        var slot1Title = t(lang, 'smartSyncCenter');
        var slot2Title = lang === 'en' ? 'Slot 2: OpenClaw' : 'Slot 2（OpenClaw）：探测端口';
        var cursorTotalMsgs = readCursorTotalMessagesFromLocalStorage();
        var slot1HasData = cursorTotalMsgs > 0;
        var arch = readSmartArchiveSyncState();
        var uploadBtnText = arch.hasAnySync ? t(lang, 'updateArchive') : t(lang, 'newArchive');
        var syncTimeLine = '';
        if (arch.hasAnySync) {
            if (arch.lastTs) {
                syncTimeLine = t(lang, 'lastSyncPrefix') + ' ' + formatSmartSyncTime(arch.lastTs, lang);
            } else {
                syncTimeLine = t(lang, 'archiveLocalWithoutTime');
            }
        }
        var detectBtnText = lang === 'en' ? 'Detect OpenClaw Port' : '探测 OpenClaw 端口';
        var cursorSlotHint = t(lang, 'cursorSlotHint');
        var storedOcPort = readStoredOpenClawGatewayPort();
        var openclawSlotHint = storedOcPort
            ? t(lang, 'connectedOpenclawPort').replace(/\{port\}/g, storedOcPort)
            : (lang === 'en' ? 'Write port to localStorage for the monitor.' : '探测成功后写入 localStorage，供监控使用。');
        var slot1LedClass = slot1HasData
            ? 'bg-[#00ff41] shadow-[0_0_6px_rgba(0,255,65,0.85)]'
            : 'bg-zinc-600 opacity-50';
        var slot1LedTitle = esc(slot1HasData ? t(lang, 'slotCursorLedOn') : t(lang, 'slotCursorLedOff'));
        var statusIdle = currentStatus === 'idle';
        var statusBusy = currentStatus === 'busy';
        var statusSprint = currentStatus === 'sprint';
        var loginSection = !isLoggedIn ? '<div class="drawer-item-label mb-2">' + esc(t(lang, 'githubLogin')) + '</div><button type="button" data-action="github-login" class="w-full px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] border border-[#444d56] rounded-md text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg><span>' + esc(t(lang, 'useGitHubLogin')) + '</span></button><div class="text-[8px] text-[#00ff41]/40 mt-2 text-center">' + esc(t(lang, 'loginSecurityNote')) + '</div>' : '';
        return [
            '<div class="github-combat-identity border-b border-[#00ff41]/20 pb-3 mb-3">',
            '<div class="flex items-center justify-between mb-2">',
            '<span class="text-xl filter drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">🕶️</span>',
            '<span class="text-[8px] leading-none text-[#00ff41] border border-[#00ff41]/40 px-1 py-0.5 tracking-widest uppercase bg-[#00ff41]/5">' + esc(t(lang, 'configBadge')) + '</span>',
            '</div>',
            '<div class="drawer-item-label mb-2">' + esc(dataSourceTitle) + '</div>',
            '<div class="mb-3 pb-3 border-b border-[#00ff41]/10">',
            '<div class="flex items-center gap-3">',
            '<div class="w-9 h-9 rounded-full overflow-hidden border border-[#00ff41]/30 flex-shrink-0"><img src="' + esc(avatarUrl) + '" alt="Avatar" class="w-full h-full object-cover" onerror="this.onerror=null;this.src=\'' + esc(defaultAvatar) + '\';" /></div>',
            '<div class="flex-1 min-w-0"><div class="drawer-item-value text-sm truncate flex items-center">' + esc(displayName) + (badgeHtml || '') + '</div><div class="drawer-item-desc text-[8px]">' + esc(displayLabel) + '</div></div>',
            '<button onclick="typeof openInboxDrawer === \'function\' && openInboxDrawer()" class="inbox-indicator w-9 h-9 flex items-center justify-center bg-transparent border-none text-[#00ff41] hover:text-[#00ff41]/80 transition-colors flex-shrink-0 cursor-pointer p-0 relative" title="' + esc(t(lang, 'inbox')) + '">✉</button>',
            exitDeleteBtns,
            '</div>',
            '<div id="user-country-flag" class="flex items-center gap-2 mt-2 text-[10px]"></div>',
            linkHtml,
            '</div>',
            '<div class="mt-2 pt-2 border-t border-[#00ff41]/10">',
            '<div class="flex items-center gap-2 mb-1">',
            '<div class="text-[10px] text-zinc-500 uppercase tracking-widest flex-1 min-w-0">' + esc(slot1Title) + '</div>',
            '<span id="cursor-slot1-status-led" class="w-2 h-2 rounded-full flex-shrink-0 ' + slot1LedClass + '" title="' + slot1LedTitle + '" aria-hidden="true"></span>',
            '</div>',
            '<div class="flex items-center gap-2">',
            '<button type="button" id="cursor-slot1-folder-btn" class="w-full px-3 py-2 bg-zinc-900/50 hover:bg-zinc-800 border border-[#00ff41]/30 rounded-md text-white text-[11px] font-bold uppercase tracking-wider transition-colors" style="color:#00ff41;border-color:rgba(0,255,65,0.35);font-family:inherit;">' + esc(uploadBtnText) + '</button>',
            '</div>',
            '<input type="file" id="cursor-slot1-folder-input" webkitdirectory directory multiple style="display:none;" />',
            '<div class="text-[9px] text-zinc-500 mt-1 font-mono" id="smart-sync-last-time">' + esc(syncTimeLine) + '</div>',
            '<div class="text-[10px] text-zinc-500 mt-1" id="cursor-slot1-status">' + esc(cursorSlotHint) + '</div>',
            '</div>',
            '<div class="mt-3 pt-3 border-t border-[#00ff41]/10">',
            '<div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">' + esc(slot2Title) + '</div>',
            '<div class="flex items-center gap-2">',
            '<button type="button" id="openclaw-slot2-detect-btn" class="flex-1 px-3 py-2 bg-zinc-900/50 hover:bg-zinc-800 border border-[#00ff41]/30 rounded-md text-white text-[11px] font-bold uppercase tracking-wider transition-colors" style="color:#00ff41;border-color:rgba(0,255,65,0.35);font-family:inherit;">' + esc(detectBtnText) + '</button>',
            '</div>',
            '<div class="text-[10px] text-zinc-500 mt-1" id="openclaw-slot2-port-text">' + esc(openclawSlotHint) + '</div>',
            '</div>',
            '<div class="mt-3 pt-3 border-t border-[#00ff41]/10" id="auth-login-section">' + loginSection + '</div>',
            '</div>'
        ].join('');
    }

    function removeExistingCard(container, selector) {
        if (!container || !selector) return;
        var existing = container.querySelector(selector);
        if (existing) existing.remove();
    }

    function insertDrawerCard(container, card, options) {
        if (!container || !card) return;
        options = options || {};
        var afterSelector = options.afterSelector || '';
        if (afterSelector) {
            var afterNode = container.querySelector(afterSelector);
            if (afterNode && afterNode.parentNode === container) {
                if (afterNode.nextSibling) container.insertBefore(card, afterNode.nextSibling);
                else container.appendChild(card);
                try {
                    if (typeof window.normalizeLeftDrawerCardOrder === 'function') window.normalizeLeftDrawerCardOrder();
                } catch (_) {}
                return;
            }
        }
        if (options.insertFirst) {
            var openclawMount = container.querySelector('#openclaw-monitor-mount');
            if (openclawMount && openclawMount.parentNode === container) {
                if (openclawMount.nextSibling) container.insertBefore(card, openclawMount.nextSibling);
                else container.appendChild(card);
                try {
                    if (typeof window.normalizeLeftDrawerCardOrder === 'function') window.normalizeLeftDrawerCardOrder();
                } catch (_) {}
                return;
            }
            if (container.firstChild) container.insertBefore(card, container.firstChild);
            else container.appendChild(card);
            try {
                if (typeof window.normalizeLeftDrawerCardOrder === 'function') window.normalizeLeftDrawerCardOrder();
            } catch (_) {}
            return;
        }
        container.appendChild(card);
        try {
            if (typeof window.normalizeLeftDrawerCardOrder === 'function') window.normalizeLeftDrawerCardOrder();
        } catch (_) {}
    }

    function renderIdentityConfigCard(identity, options) {
        options = options || {};
        var container = options.container || (options.containerId ? document.getElementById(options.containerId) : null);
        if (!container || !identity || typeof identity !== 'object') return null;
        var lang = getLang(options);
        var card = document.createElement('div');
        card.className = 'drawer-item github-identity-card hacker-border';
        card.setAttribute('data-card', 'identity-config');
        card.style.cssText = 'background:' + CARD_BG + ';border-radius:8px;padding:14px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;';
        card.innerHTML = buildIdentityBlock(identity, lang);
        removeExistingCard(container, '.drawer-item[data-card="identity-config"]');
        insertDrawerCard(container, card, options);
        return card;
    }

    function getLang(options) {
        var lang = (options && options.lang) || (typeof window.currentLang === 'string' ? window.currentLang : '');
        if (lang === 'zh' || lang === 'zh-CN') return 'zh';
        if (lang === 'en') return 'en';
        var docLang = typeof document !== 'undefined' && document.documentElement && document.documentElement.lang;
        if (docLang && (docLang.indexOf('zh') === 0)) return 'zh';
        return 'en';
    }

    function t(lang, key) {
        var dict = I18N[lang] || I18N.en;
        return dict[key] != null ? dict[key] : (I18N.en[key] || key);
    }

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
     * 字节数格式化为 KB/MB
     */
    function formatBytes(n) {
        n = Number(n) || 0;
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
        return n + ' B';
    }

    /**
     * 数值从 0 滚动到目标值（easeOutCubic）；若元素带 data-format="bytes" 则直接显示为 KB/MB 不滚动
     */
    function animateNumber(element, targetValue, duration) {
        var isBytes = element && element.getAttribute('data-format') === 'bytes';
        if (isBytes) {
            if (element) element.textContent = formatBytes(targetValue);
            return;
        }
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
     * 刷新按钮状态：loading 时显示 ANALYZING... / 分析中...
     */
    function setRefreshButtonState(btn, isLoading, label, lang) {
        if (!btn) return;
        lang = lang || getLang({});
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-pulse">' + esc(t(lang, 'analyzing')) + '</span>';
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            btn.disabled = false;
            btn.innerHTML = label != null ? label : t(lang, 'refresh');
            btn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    /**
     * 骨架屏/加载态：数据同步时在左侧抽屉显示「DNA Scanning...」赛博朋克风格占位符
     * @param {HTMLElement} container - 挂载容器（如 #left-drawer-body）
     * @param {Object} [options] - { lang?: 'zh'|'en' }
     * @returns {HTMLElement|null} 卡片根元素
     */
    function renderLoadingState(container, options) {
        if (!container) return null;
        var lang = getLang(options || {});
        var dnaScan = t(lang, 'dnaScanning');
        var desc = t(lang, 'analyzingDesc');
        var card = document.createElement('div');
        card.className = 'drawer-item github-combat-card hacker-border';
        card.setAttribute('data-card', 'github-combat');
        card.setAttribute('data-github-combat', '1');
        card.style.cssText = 'background:' + CARD_BG + ';border-radius:8px;padding:14px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;';
        card.innerHTML = [
            '<style>.github-combat-scan{animation:github-combat-scan 1.5s ease-in-out infinite;}@keyframes github-combat-scan{0%{transform:translateX(-100%);}100%{transform:translateX(400%);}}</style>',
            '<div class="flex flex-col items-center justify-center py-8">',
            '  <div class="animate-pulse text-[#00ff41] text-sm mb-2">&#9889; ' + esc(dnaScan) + '</div>',
            '  <div class="w-32 h-1 bg-[#00ff41]/20 rounded-full overflow-hidden">',
            '    <div class="github-combat-scan h-full bg-[#00ff41]" style="width:25%;"></div>',
            '  </div>',
            '  <div class="text-[10px] text-zinc-500 mt-3">' + esc(desc) + '</div>',
            '</div>'
        ].join('');
        removeExistingCard(container, '.github-combat-card');
        insertDrawerCard(container, card, options);
        return card;
    }

    /**
     * 格式化同步时间（中/英）
     */
    function formatSyncedAt(isoStr, lang) {
        lang = lang || getLang({});
        if (!isoStr) return '--';
        try {
            var d = new Date(isoStr);
            if (isNaN(d.getTime())) return '--';
            var now = new Date();
            var diffMs = now.getTime() - d.getTime();
            if (diffMs < 60000) return t(lang, 'justNow');
            if (diffMs < 3600000) return Math.floor(diffMs / 60000) + t(lang, 'minutesAgo');
            if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + t(lang, 'hoursAgo');
            return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US');
        } catch (e) {
            return '--';
        }
    }

    /**
     * 格式化仓库更新日期（ISO → 本地化日期或相对时间）
     */
    function formatRepoUpdatedAt(isoStr, lang) {
        lang = lang || getLang({});
        if (!isoStr) return '--';
        try {
            var d = new Date(isoStr);
            if (isNaN(d.getTime())) return '--';
            var opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
            return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', opts);
        } catch (e) {
            return '--';
        }
    }

    /**
     * 渲染 Language DNA 渐变条：5px 高，按 Top 5 百分比切分，hover 显示语言名；空数据或异常时显示占位文案
     */
    function renderLangDna(languageDistribution, lang) {
        lang = lang || getLang({});
        try {
            if (!languageDistribution || !Array.isArray(languageDistribution) || languageDistribution.length === 0) {
                return '<div class="lang-dna-empty text-[10px] text-zinc-500">' + esc(t(lang, 'langWaiting')) + '</div>';
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
            return '<div class="lang-dna-empty text-[10px] text-zinc-500">' + esc(t(lang, 'langUnavailable')) + '</div>';
        }
    }

    /**
     * 将后端/数据库的 github_stats 归一化为卡片所需形状，避免 undefined
     * @param {Object|string|null|undefined} raw - 原始 github_stats（可能为 JSON 字符串、或嵌套在 stats 下、或缺失字段）
     * @returns {Object} 含 22 项安全默认值的对象
     */
    function normalizeGithubStats(raw) {
        if (typeof raw === 'string') {
            try { raw = raw ? JSON.parse(raw) : {}; } catch (e) { raw = {}; }
        }
        // 兼容从 user_analysis 整行传入：取 github_stats 或 stats.github_stats
        var o = raw && typeof raw === 'object' ? raw : {};
        if (o && (o.github_stats != null || (o.stats && o.stats.github_stats != null))) {
            o = o.github_stats != null ? (typeof o.github_stats === 'string' ? (function() { try { return JSON.parse(o.github_stats); } catch (e) { return {}; } })() : o.github_stats) : (o.stats && (typeof o.stats.github_stats === 'string' ? (function() { try { return JSON.parse(o.stats.github_stats); } catch (e) { return {}; } })() : o.stats.github_stats));
        }
        o = o && typeof o === 'object' ? o : {};
        var num = function() {
            for (var i = 0; i < arguments.length; i++) {
                var v = arguments[i];
                var n = Number(v);
                if (!Number.isNaN(n) && n > 0) return n;
            }
            return 0;
        };
        var str = function() {
            for (var i = 0; i < arguments.length; i++) {
                var v = arguments[i];
                if (v != null && String(v).trim() !== '') return String(v);
            }
            return '';
        };
        return {
            login: str(o.login, o.github_login, raw && raw.github_login, raw && raw.github_username, raw && raw.user_name) || '--',
            avatarUrl: str(o.avatarUrl, o.avatar_url, raw && raw.avatar_url, raw && raw.avatarUrl),
            globalRanking: str(o.globalRanking, o.global_ranking, raw && raw.github_score, raw && raw.global_rank) || '--',
            accountAge: num(o.accountAge, o.account_age),
            syncedAt: str(o.syncedAt, o.synced_at, raw && raw.github_synced_at, raw && raw.last_sync_at),
            organizations: Array.isArray(o.organizations) ? o.organizations : [],
            mergedPRs: num(o.mergedPRs, o.merged_prs),
            totalRepoStars: num(o.totalRepoStars, o.total_repo_stars, o.totalStars, o.total_stars, raw && raw.github_stars),
            commitVelocity: num(o.commitVelocity, o.commit_velocity),
            prReviews: num(o.prReviews, o.pr_reviews),
            activeDays: num(o.activeDays, o.active_days),
            publicRepos: num(o.publicRepos, o.public_repos),
            privateRepos: num(o.privateRepos, o.private_repos),
            languageDistribution: Array.isArray(o.languageDistribution) ? o.languageDistribution : [],
            followers: num(o.followers, raw && raw.github_followers),
            following: num(o.following),
            totalStars: num(o.totalStars, o.total_stars, o.totalRepoStars, raw && raw.github_stars),
            totalCommits: num(o.totalCommits, o.total_commits),
            sponsorships: num(o.sponsorships),
            restrictedContributions: num(o.restrictedContributions, o.restricted_contributions),
            totalForks: num(o.totalForks, o.total_forks, raw && raw.github_forks),
            totalWatchers: num(o.totalWatchers, o.total_watchers, raw && raw.github_watchers),
            totalCodeSize: num(o.totalCodeSize, o.total_code_size),
            primaryLanguage: str(o.primaryLanguage, o.primary_language, o.mainLanguage, o.main_language) || null,
            newestLanguage: str(o.newestLanguage, o.newest_language) || null,
            closedIssues: num(o.closedIssues, o.closed_issues),
            latest_repo_updated_at: str(o.latest_repo_updated_at, o.latestRepoUpdatedAt)
        };
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
        var lang = getLang(options);

        if (!stats || typeof stats !== 'object') {
            removeExistingCard(container, '.github-combat-card');
            return null;
        }

        stats = normalizeGithubStats(stats);
        var login = stats.login || '--';
        var avatarUrl = stats.avatarUrl || '';
        var globalRanking = stats.globalRanking || '--';
        var accountAge = Number(stats.accountAge) || 0;
        var syncedAt = stats.syncedAt || '';
        var latestRepoUpdatedAt = stats.latest_repo_updated_at || '';
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
        var followers = Number(stats.followers) || 0;
        var following = Number(stats.following) || 0;
        var totalStars = Number(stats.totalStars) || 0;
        var totalCommits = Number(stats.totalCommits) || 0;
        var sponsorships = Number(stats.sponsorships) || 0;
        var restrictedContributions = Number(stats.restrictedContributions) || 0;
        var totalForks = Number(stats.totalForks) || 0;
        var totalWatchers = Number(stats.totalWatchers) || 0;
        var totalCodeSize = Number(stats.totalCodeSize) || 0;
        var closedIssues = Number(stats.closedIssues) || 0;
        var primaryLanguage = stats.primaryLanguage != null ? String(stats.primaryLanguage) : '';
        var newestLanguage = stats.newestLanguage != null ? String(stats.newestLanguage) : '';

        var card = document.createElement('div');
        card.className = 'drawer-item github-combat-card hacker-border';
        card.setAttribute('data-card', 'github-combat');
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

        var combatValue = globalRanking;
        card.innerHTML = [
            '<div class="card-header github-combat-header mb-3 flex items-center gap-3">',
            '  <div class="flex-shrink-0" style="color:#00ff41;">' + GITHUB_ICON_SVG + '</div>',
            '  <div class="flex-1 min-w-0">',
            '    <div class="text-[10px] text-zinc-500 uppercase tracking-wider">' + esc(t(lang, 'githubCombat')) + '</div>',
            '    <div class="text-[#00ff41] font-bold text-lg tabular-nums">' + esc(combatValue) + '</div>',
            '  </div>',
            '</div>',
            orgsHtml ? '<div class="mb-2">' + orgsHtml + '</div>' : '',
            '<div class="stats-grid grid grid-cols-2 gap-2 mb-3">',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + mergedPRs + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'strike')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalRepoStars + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'influence')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + commitVelocity + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'velocity30d')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + prReviews + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'codeReviews')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + activeDays + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'annualVitality')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalRepos + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'nodesCount')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + followers + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'followers')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + following + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'following')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalStars + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'totalStars')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalCommits + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'totalCommits')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + sponsorships + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'sponsorships')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + restrictedContributions + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'restrictedContributions')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalForks + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'totalForks')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + totalWatchers + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'totalWatchers')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-sm tabular-nums" data-target="' + totalCodeSize + '" data-format="bytes">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'totalCodeSize')) + '</div>',
            '  </div>',
            '  <div class="stat-cell rounded border border-[#00ff41]/20 bg-[#00ff41]/5 p-2">',
            '    <div class="stat-value text-[#00ff41] font-bold text-lg tabular-nums" data-target="' + closedIssues + '">0</div>',
            '    <div class="stat-label text-[10px] text-zinc-500 uppercase">' + esc(t(lang, 'closedIssues')) + '</div>',
            '  </div>',
            '</div>',
            '<div class="card-footer border-t border-[#00ff41]/20 pt-3 mt-2">',
            (primaryLanguage || newestLanguage ? '<div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400 mb-2">' + (primaryLanguage ? '<span><span class="uppercase text-zinc-500">' + esc(t(lang, 'primaryLanguage')) + '</span>: ' + esc(primaryLanguage) + '</span>' : '') + (newestLanguage ? '<span><span class="uppercase text-zinc-500">' + esc(t(lang, 'newestLanguage')) + '</span>: ' + esc(newestLanguage) + '</span>' : '') + '</div>' : ''),
            '  <div class="mb-2">',
            '    <div class="text-[10px] text-zinc-500 uppercase mb-1">' + esc(t(lang, 'languageDna')) + '</div>',
            '    ' + renderLangDna(langDist, lang),
            '  </div>',
            '  <div class="status-bar flex flex-col gap-1 text-[10px] text-zinc-500">',
            '    <div class="flex justify-between"><span>' + esc(t(lang, 'activeForDays').replace('{n}', accountAge > 0 ? accountAge.toLocaleString() : '0')) + '</span><span>' + esc(t(lang, 'synced')) + ': ' + formatSyncedAt(syncedAt, lang) + '</span></div>',
            '    <div class="repo-updated-at"><span class="uppercase text-zinc-500">' + esc(t(lang, 'repoUpdatedAt')) + '</span>: ' + formatRepoUpdatedAt(latestRepoUpdatedAt, lang) + '</div>',
            '  </div>',
            '</div>',
            '<div class="flex justify-end mt-3">',
            '<button type="button" class="github-combat-refresh-btn px-3 py-1.5 rounded text-xs font-bold border border-[#00ff41] text-[#00ff41] bg-transparent cursor-pointer hover:bg-[#00ff41]/10 transition-colors" style="font-family:inherit;">' + esc(t(lang, 'refresh')) + '</button>',
            '</div>'
        ].join('');

        removeExistingCard(container, '.github-combat-card');
        insertDrawerCard(container, card, options);

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
                setRefreshButtonState(refreshBtn, true, null, lang);
                var p = onRefresh();
                if (p && typeof p.then === 'function') {
                    p.then(function (result) {
                        setRefreshButtonState(refreshBtn, false, null, lang);
                        if (result && result.success && result.data) {
                            var parent = card.parentNode;
                            if (parent) {
                                renderGithubCard(result.data, {
                                    container: parent,
                                    onRefresh: onRefresh,
                                    lang: lang,
                                    insertFirst: !!options.insertFirst,
                                    afterSelector: options.afterSelector || ''
                                });
                            }
                            setTimeout(function () {
                                if (typeof window.refreshUserStats === 'function') window.refreshUserStats().catch(function () {});
                                if (typeof window.loadGitHubLeaderboard === 'function') window.loadGitHubLeaderboard(); else if (typeof loadGitHubLeaderboard === 'function') loadGitHubLeaderboard();
                            }, 1500);
                        }
                    }).catch(function () {
                        setRefreshButtonState(refreshBtn, false, null, lang);
                    });
                } else {
                    setRefreshButtonState(refreshBtn, false, null, lang);
                }
            });
        }

        return card;
    }

    window.renderGithubIdentityCard = renderIdentityConfigCard;
    window.renderGithubCard = renderGithubCard;
    window.renderGithubCardLoading = renderLoadingState;
})();
