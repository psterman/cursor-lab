/**
 * stats-app-realtime.js - Realtime Module
 * Contains Supabase Realtime and Presence functionality
 * Wrapped in IIFE to avoid global namespace pollution
 */
(function() {
    'use strict';

    // Skip if already loaded
    if (window.__RealtimeModuleLoaded) {
        console.log('[Realtime Module] Already loaded, skipping...');
        return;
    }
    window.__RealtimeModuleLoaded = true;

    // ============================================================
    // Aliases for variables from main stats-app.js
    // These must be accessed via window since they're in a different scope
    // ============================================================
    var supabaseClient = null; // Will be resolved when functions are called
    var realtimeChannel = null;
    var presenceChannel = null;
    var USER_STATUSES = window.USER_STATUSES || {
        idle: { status: 'idle', status_color: '#00ff41', color: '#00ff41' },
        busy: { status: 'busy', status_color: '#ff6b6b', color: '#ff6b6b' },
        sprint: { status: 'sprint', status_color: '#ffd93d', color: '#ffd93d' }
    };
    var currentUserStatus = 'idle';
    var drawerExpanded = true;
    var currentBurnMsgInterval = null;
    var currentBurnMsgPopup = null;
    var latestRecords = [];
    var DEFAULT_AVATAR = 'https://raw.githubusercontent.com/PConverty/image/main/default-avatar.png';
    var countryNameMap = {};
    var currentLang = 'zh';

    // ============================================================
    // Sync local variables with window globals from stats-app.js
    // ============================================================
    function syncGlobals() {
        supabaseClient = window.supabaseClient;
        realtimeChannel = window.realtimeChannel;
        presenceChannel = window.presenceChannel;
        USER_STATUSES = window.USER_STATUSES || USER_STATUSES;
        currentUserStatus = window.currentUserStatus || 'idle';
        drawerExpanded = window.drawerExpanded !== undefined ? window.drawerExpanded : true;
        countryNameMap = window.countryNameMap || {};
        currentLang = window.currentLang || 'zh';
    }

    /**
     * Start Supabase Realtime Listener
     * Listens for INSERT and UPDATE events on user_analysis table
     * Also handles Presence for online user tracking
     */
    window.startRealtimeListener = async function() {
        // Sync globals from main app
        syncGlobals();
        
        // Cloudflare environment check - try to connect anyway
        const host = typeof window !== 'undefined' && window.location && window.location.hostname ? window.location.hostname : '';
        const isCloudflareHost = /\.pages\.dev$/.test(host) || /\.workers\.dev$/.test(host) || host === 'pages.dev' || host === 'workers.dev';

        if (isCloudflareHost) {
            console.log('[Realtime] ℹ️ Cloudflare 环境：不再强制跳过，尝试连接 Supabase Realtime...');
        }

        // Robustness check: ensure Supabase client is initialized (with retry up to 15 seconds)
        if (!supabaseClient) {
            console.log('[Realtime] ⏳ Supabase 客户端尚未就绪，等待中...');
            let attempts = 0;
            while (!supabaseClient && attempts < 30) {
                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }
            
            if (!supabaseClient) {
                console.warn('[Realtime] ⚠️ Supabase 客户端初始化超时，虽然跳过 Realtime 监听，但尝试后续懒加载...');
            }
        }
        
        // Record start time before each launch
        window.__realtimeStartedAt = Date.now();

        // If there's an existing listener channel, unsubscribe first
        if (realtimeChannel) {
            try {
                await supabaseClient.removeChannel(realtimeChannel);
                console.log('[Realtime] ✅ 已取消旧的监听通道 (重启)');
                realtimeChannel = null;
            } catch (error) {
                console.warn('[Realtime] ⚠️ 取消旧通道时出错:', error);
            }
        }

        try {
            // Create new listener channel
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
                        
                        // Robustness check: ensure payload and payload.new exist
                        if (!payload || !payload.new) {
                            console.warn('[Realtime] ⚠️ 数据格式不完整，跳过处理');
                            return;
                        }

                        const newRecord = payload.new;
                        
                        // Partial update: insert new data at the beginning of latestRecords
                        if (!Array.isArray(latestRecords)) {
                            latestRecords = [];
                        }
                        
                        latestRecords.unshift(newRecord);
                        
                        // Length control: keep array length under 10
                        if (latestRecords.length > 10) {
                            latestRecords = latestRecords.slice(0, 10);
                        }

                        // Sync update to window.allData (for LPDEF expert filtering)
                        if (!window.allData) {
                            window.allData = [];
                        }
                        // Check if already exists (avoid duplicates)
                        const exists = window.allData.some(item => 
                            (item.id && newRecord.id && item.id === newRecord.id) ||
                            (item.name === newRecord.name && item.created_at === newRecord.created_at)
                        );
                        if (!exists) {
                            window.allData.unshift(newRecord);
                            // Limit allData length (keep latest 1000 to avoid memory bloat)
                            if (window.allData.length > 1000) {
                                window.allData = window.allData.slice(0, 1000);
                            }
                        }
                        
                        console.log(`[Realtime] ✅ 已更新 latestRecords (当前长度: ${latestRecords.length})，window.allData (当前长度: ${window.allData.length})`);

                        // Re-render right-side card list
                        try {
                            renderRecentActivity(latestRecords);
                            console.log('[Realtime] ✅ 已刷新实时诊断活动列表');
                        } catch (error) {
                            console.error('[Realtime] ❌ 渲染活动列表失败:', error);
                        }
                        
                        // Realtime update no longer needs to re-render LPDEF cards (deprecated)

                        // Map联动特效：如果新数据包含地理位置信息，触发地图脉冲
                        try {
                            // Extract longitude/latitude from new data
                            // Adjust based on actual data fields (could be lng/lat, longitude/latitude, location, etc.)
                            let lng = null;
                            let lat = null;
                            let vibeName = '';

                            // Method 1: Direct fields (check longitude/latitude fields first)
                            if (newRecord.lng !== undefined && newRecord.lat !== undefined) {
                                lng = Number(newRecord.lng);
                                lat = Number(newRecord.lat);
                            } else if (newRecord.longitude !== undefined && newRecord.latitude !== undefined) {
                                lng = Number(newRecord.longitude);
                                lat = Number(newRecord.latitude);
                            }
                            // Method 2: Parse from location or ip_location field (if contains coordinates)
                            else {
                                const locationSource = newRecord.location || newRecord.ip_location;
                                if (locationSource) {
                                    // Try to parse "lng,lat" format coordinate string
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

                            // Extract name (could be name, vibe_name, personality_type, etc.)
                            const baseName = newRecord.name || newRecord.vibe_name || newRecord.personality_type || '';

                            // VPN detection logic (removed VPN keyword display)
                            // =========================
                            let pulseColor = '#ffffff'; // Default white (normal user)
                            let pulseLabel = baseName ? `${baseName}` : '用户';

                            // Get fields needed for judgment
                            const ipLocation = String(newRecord.ip_location || '').toUpperCase().trim();
                            const timezone = String(newRecord.timezone || '').trim();

                            // Judgment condition: if ip_location is not 'CN', but timezone is 'Asia/Shanghai', use special color
                            const isNotChina = ipLocation !== 'CN' && ipLocation !== '';
                            const isShanghaiTimezone = timezone === 'Asia/Shanghai';

                            if (isNotChina && isShanghaiTimezone) {
                                // Special user: overseas IP + Shanghai timezone
                                pulseColor = '#00ff41'; // Terminal green
                                pulseLabel = baseName ? `${baseName}` : '用户';
                                console.log('[Realtime] 🔍 用户判定: 检测到特殊用户', {
                                    ipLocation,
                                    timezone,
                                    reason: '海外IP但时区为Asia/Shanghai'
                                });
                            } else {
                                // Normal user: direct connection
                                pulseColor = '#ffffff'; // Normal user: pure white
                                pulseLabel = baseName ? `${baseName}` : '用户';
                                console.log('[Realtime] 🔍 用户判定: 正常用户', {
                                    ipLocation,
                                    timezone,
                                    reason: isNotChina ? '时区不匹配' : 'IP位置正常'
                                });
                            }

                            // If successfully extracted longitude/latitude, trigger map pulse (with judged color and label)
                            if (lng !== null && lat !== null && !isNaN(lng) && !isNaN(lat)) {
                                // Extract avatar info
                                let avatarUrl = newRecord.avatar_url || null;
                                const githubUsername = newRecord.github_username || newRecord.github_id || null;
                                const userName = newRecord.name || newRecord.vibe_name || newRecord.personality_type || '';
                                
                                // Judgment logic: if github_username is empty or default value, don't request GitHub image
                                // 【Task 3】Pass user_identity, skip strict validation for fingerprint users
                                const recordUserIdentity = newRecord.user_identity || null;
                                if (!avatarUrl && githubUsername) {
                                    if (isValidGitHubUsername(githubUsername, recordUserIdentity)) {
                                        // Only generate avatar URL for valid GitHub usernames
                                        avatarUrl = getGitHubAvatarUrl(githubUsername);
                                    } else {
                                        // For invalid usernames, use default avatar
                                        avatarUrl = DEFAULT_AVATAR;
                                    }
                                }
                                // If still no valid avatar URL, use default avatar
                                if (!avatarUrl) {
                                    avatarUrl = DEFAULT_AVATAR;
                                }
                                
                                // Get user status color (if exists), otherwise use default color
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
                        
                        // Robustness check: ensure payload and payload.new exist
                        if (!payload || !payload.new) {
                            console.warn('[Realtime] ⚠️ 更新数据格式不完整，跳过处理');
                            return;
                        }

                        const updatedRecord = payload.new;
                        
                        // Sync update to window.allData (for identity matching and ranking cards)
                        if (!window.allData) {
                            window.allData = [];
                        }

                        // 【Fix】Use "normalized matching + upsert" instead of simple push/unshift to avoid duplicate accumulation
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
                        
                        // Check if the updated record is the current user, if so refresh ranking cards
                        // Real-time update: ensure renderRankCards(currentUser) is triggered again so card numbers can change with database updates
                        try {
                            // Helper function: normalize fingerprint string (ignore case and trim whitespace)
                            const normalizeFingerprint = (fp) => {
                                if (!fp) return '';
                                return String(fp).trim().toLowerCase();
                            };
                            
                            // Get current user's identity info (add exception handling)
                            let localGitHubName = null;
                            let currentFingerprint = null;
                            try {
                                localGitHubName = localStorage.getItem('github_username');
                                currentFingerprint = localStorage.getItem('user_fingerprint');
                            } catch (e) {
                                console.warn('[Realtime] ⚠️ 读取 localStorage 失败:', e);
                            }
                            
                            const urlParams = new URLSearchParams(_loc.search);
                            const urlId = urlParams.get('id');
                            
                            // Normalize current fingerprint
                            const normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                            
                            // Determine if it's the current user's record (priority matching strategy: fingerprint > GitHub ID)
                            let isCurrentUser = false;
                            let matchedByFingerprint = false;
                            
                            // Method 1: Match via URL parameter (highest priority, for debugging)
                            if (urlId) {
                                const recordId = (updatedRecord.id || '').toString();
                                const recordFingerprint = (updatedRecord.fingerprint || updatedRecord.user_identity || '').toString();
                                if (recordId === urlId || recordFingerprint === urlId) {
                                    isCurrentUser = true;
                                }
                            }
                            
                            // Method 2: Match via Fingerprint (prioritize over GitHub ID, ignore case and whitespace)
                            if (!isCurrentUser && normalizedCurrentFingerprint) {
                                const recordFingerprint = normalizeFingerprint(updatedRecord.fingerprint || updatedRecord.user_fingerprint);
                                const recordIdentity = normalizeFingerprint(updatedRecord.user_identity);
                                
                                if ((recordFingerprint && recordFingerprint === normalizedCurrentFingerprint) ||
                                    (recordIdentity && recordIdentity === normalizedCurrentFingerprint)) {
                                    isCurrentUser = true;
                                    matchedByFingerprint = true;
                                }
                            }
                            
                            // Method 3: Match via GitHub ID (try after fingerprint match fails)
                            if (!isCurrentUser && localGitHubName && isValidGitHubUsername(localGitHubName)) {
                                // 【Fix】Unified use of user_name field, don't use github_username
                                const recordGithubId = normalizeFingerprint(updatedRecord.user_name || updatedRecord.github_id || '');
                                const normalizedLocalGitHub = normalizeFingerprint(localGitHubName);
                                if (recordGithubId && recordGithubId === normalizedLocalGitHub) {
                                    isCurrentUser = true;
                                }
                            }
                            
                            // If it's the current user's record, refresh ranking cards and global variables
                            if (isCurrentUser) {
                                console.log('[Realtime] ✅ 检测到当前用户数据更新，刷新排名卡片');
                                
                                // Update global variables
                                window.currentUser = updatedRecord;
                                window.currentUserMatchedByFingerprint = matchedByFingerprint;
                                
                                // Update corresponding record in window.allData
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
                                    // If not found, the above upsert has already been done (or matching conditions differ); don't push here to avoid duplicates
                                    window.allData = allData;
                                }
                                
                                // Use the updated record to render directly, ensuring card numbers can change in real-time
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
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        // Channel error/timeout common when: Realtime not enabled, network/firewall limits WebSocket, degrade to warning to avoid console spam
                        console.warn('[Realtime] ⚠️ 订阅未就绪（' + status + '），将使用静态数据更新');
                    } else {
                        console.log(`[Realtime] ℹ️ 订阅状态: ${status}`);
                    }
                });

            console.log('[Realtime] 🚀 Realtime 监听已启动');

            // =========================
            // Supabase Presence 功能：统计实时在线人数
            // =========================
            
            // If there's an existing Presence channel, unsubscribe first
            if (presenceChannel) {
                try {
                    supabaseClient.removeChannel(presenceChannel);
                    console.log('[Presence] ✅ 已取消旧的 Presence 频道');
                } catch (error) {
                    console.warn('[Presence] ⚠️ 取消旧 Presence 频道时出错:', error);
                }
            }

            try {
                // Create Presence channel named online_users
                presenceChannel = supabaseClient
                    .channel('online_users')
                    .on('presence', { event: 'sync' }, function() {
                        // sync callback: get all currently online status objects
                        // Use 'this' in regular function to get the channel reference
                        const channel = this;
                        if (!channel || typeof channel.presenceState !== 'function') {
                            console.warn('[Presence] ⚠️ Channel not ready yet');
                            return;
                        }
                        const newState = channel.presenceState();
                        
                        // Debug log: output all synced users
                        console.log('[Presence] 当前同步到的所有用户:', newState);
                        
                        // Calculate online count: iterate through all status objects and calculate total (deduplicate by user_name)
                        const userMap = new Map();
                        if (newState) {
                            Object.keys(newState).forEach((key) => {
                                const presenceEntries = newState[key];
                                const entries = Array.isArray(presenceEntries) ? presenceEntries : [presenceEntries];
                                
                                entries.forEach(entry => {
                                    if (!entry || !entry.online_at) return;
                                    // Use user_name as deduplication key
                                    const userName = entry.user_name || entry.github_id || entry.github_username || 'Guest';
                                    if (!userMap.has(userName) || new Date(entry.online_at) > new Date(userMap.get(userName).online_at)) {
                                        userMap.set(userName, entry);
                                    }
                                });
                            });
                        }
                        
                        // Note: Don't exclude current user themselves, as user requested to be visible in the list
                        const onlineCount = userMap.size;
                        console.log('[Presence] 👥 在线人数同步（去重后，包含自己）:', onlineCount);

                        // Update #online-count-value on page (the one on the map)
                        const onlineCountElement = document.getElementById('online-count-value');
                        if (onlineCountElement) {
                            // Add zoom animation class
                            onlineCountElement.classList.add('online-count-update');
                            
                            // Update number
                            onlineCountElement.textContent = onlineCount;
                            
                            // Remove class after animation ends (so next update can trigger animation again)
                            setTimeout(() => {
                                onlineCountElement.classList.remove('online-count-update');
                            }, 400); // Match CSS animation duration
                            
                            console.log('[Presence] ✅ 已更新在线人数显示（地图）:', onlineCount);
                        } else {
                            console.warn('[Presence] ⚠️ 找不到 #online-count-value 元素');
                        }
                        
                        // Update online count in drawer (even if collapsed, still update)
                        const onlineCountText = document.getElementById('online-count-text');
                        if (onlineCountText) {
                            onlineCountText.textContent = onlineCount;
                        }
                        
                        // Render user list (use updateOnlineList to ensure getting latest state)
                        updateOnlineList();
                    })
                    .on('broadcast', { event: 'burn_msg' }, ({ payload }) => {
                        // Receive private message (burn after reading)
                        console.log('[Message] 收到原始广播:', payload);
                        
                        const githubUsername = localStorage.getItem('github_username') || null;
                        const myId = githubUsername;
                        
                        // Check if message is for current user
                        // Unified use of target_id or to field for matching, supports GitHub ID and user_name
                        const targetId = payload.target_id || payload.to;
                        const isForMe = targetId === myId || 
                                      targetId === githubUsername || 
                                      (!myId && targetId === 'Guest');
                        
                        if (payload && isForMe) {
                            console.log('[Message] 📨 收到私信:', payload);
                            const content = payload.content || payload.message || '';
                            const fromId = payload.from || 'Unknown';
                            const statusColor = payload.status_color || '#00ff41';
                            const displayName = payload.username || (fromId && fromId.length > 8 ? fromId.substring(0, 8) : fromId) || '匿名';
                            const avatar = payload.avatar || '';
                            showBurnMsg(content, displayName, statusColor, avatar);
                        } else {
                            console.log('[Message] ⚠️ 消息不是发给我的:', { targetId, myId, githubUsername });
                        }
                    })
                    .on('broadcast', { event: 'private_message' }, ({ payload }) => {
                        // Compatible with old event name
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
                            const displayName = payload.username || (fromId && fromId.length > 8 ? fromId.substring(0, 8) : fromId) || '匿名';
                            const avatar = payload.avatar || '';
                            showBurnMsg(content, displayName, statusColor, avatar);
                        }
                    })
                    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                        console.log('[Presence] ➕ 用户加入:', key, newPresences);
                    })
                    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                        console.log('[Presence] ➖ 用户离开:', key, leftPresences);
                    })
                    .subscribe(async (status, err) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('[Presence] ✅ 已成功订阅 online_users 频道');
                            
                            // Force sync own status (must be explicitly called)
                            await trackSelf();
                            // Initialize status buttons after Presence subscription succeeds, avoid conflict with subscribe logic
                            try { initStatusButtons(); } catch (e) { console.log('[Presence] initStatusButtons:', e); }
                        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                            // Consistent with Realtime: degrade to warning, avoid console red spam
                            console.warn('[Presence] ⚠️ 订阅未就绪（' + status + '），详情:', err);
                            if (status === 'CHANNEL_ERROR') {
                                console.warn('[Presence] ℹ️ 提示: 请检查 Supabase 后台 -> App -> Realtime 是否开启了 Presence 和 Broadcast 功能');
                            }
                            renderOnlineUsersListUnavailable();
                        } else {
                            console.log(`[Presence] ℹ️ Presence 订阅状态: ${status}`);
                        }
                    });

                console.log('[Presence] 🚀 Presence 监听已启动');
            } catch (presenceError) {
                console.warn('[Presence] ⚠️ 启动 Presence 监听失败（将不显示实时在线）:', presenceError);
            }

        } catch (error) {
            console.warn('[Realtime] ⚠️ 启动 Realtime 监听失败（将使用静态数据）:', error);
        }
    };

    /**
     * Stop Supabase Realtime Listener
     */
    window.stopRealtimeListener = function() {
        syncGlobals();
        // Stop postgres_changes listener
        if (realtimeChannel && supabaseClient) {
            try {
                supabaseClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
                console.log('[Realtime] ✅ 已停止 Realtime 监听');
            } catch (error) {
                console.warn('[Realtime] ⚠️ 停止监听时出错:', error);
            }
        }

        // Stop Presence listener
        if (presenceChannel) {
            try {
                // First untrack, then remove channel
                const channelToRemove = presenceChannel;
                presenceChannel = null; // Immediately set to null to prevent race condition
                
                channelToRemove.untrack().then(() => {
                    if (supabaseClient) supabaseClient.removeChannel(channelToRemove);
                }).catch(e => {
                     if (supabaseClient) supabaseClient.removeChannel(channelToRemove);
                });
                
                console.log('[Presence] ✅ 已停止 Presence 监听');
            } catch (error) {
                console.warn('[Presence] ⚠️ 停止 Presence 监听时出错:', error);
            }
        }
    };

    /**
     * Set user status
     * @param {string} status - Status type ('idle', 'busy', 'sprint')
     */
    window.setUserStatus = function(status) {
        syncGlobals();
        if (!USER_STATUSES[status]) {
            console.warn('[Status] ⚠️ 无效的状态类型:', status);
            return;
        }
        
        currentUserStatus = status;
        localStorage.setItem('user_status', status);
        
        // Update button styles
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
        
        // Immediately sync state to Presence (async)
        syncPresenceState().then(() => {
            // After sync completes, immediately update user list
            if (presenceChannel) {
                const state = presenceChannel.presenceState();
                renderOnlineUsersList(state);
            }
        }).catch(() => {
            // Even if sync fails, try updating the list
            if (presenceChannel) {
                const state = presenceChannel.presenceState();
                renderOnlineUsersList(state);
            }
        });
        
        // If switching to offline status, immediately update list (don't wait for sync to complete)
        if (status === 'sprint') {
            setTimeout(() => {
                if (presenceChannel) {
                    const state = presenceChannel.presenceState();
                    renderOnlineUsersList(state);
                }
            }, 100);
        }
        
        console.log('[Status] ✅ 用户状态已更新:', status, USER_STATUSES[status]);
    };

    /**
     * Initialize status button styles
     */
    window.initStatusButtons = function() {
        syncGlobals();
        const savedStatus = localStorage.getItem('user_status') || 'idle';
        setUserStatus(savedStatus);
    };

    /**
     * Get user location (now handled by backend CF, frontend no longer requests ipapi.co/ip-api.com to avoid 429)
     * Returns default structure, actual country is written by backend /api/v2/analyze based on CF or manual_location
     */
    window.getUserLocation = function() {
        syncGlobals();
        var defaultResult = { lat: null, lng: null, countryCode: 'US' };
        return Promise.resolve(defaultResult);
    };

    /**
     * Force sync own status (trackSelf)
     * Explicitly called in SUBSCRIBED callback
     */
    window.trackSelf = async function() {
        syncGlobals();
        if (!presenceChannel) {
            if (window.__PRESENCE_SKIPPED) return; // Cloudflare has skipped Presence, return silently
            console.warn('[Presence] ⚠️ Presence频道未初始化');
            return;
        }
        
        try {
            // Get GitHub username
            const ghUsername = localStorage.getItem('github_username') || null;
            
            // Generate user_name
            const userName = ghUsername && isValidGitHubUsername(ghUsername) 
                ? ghUsername 
                : `Guest_${Math.floor(Math.random() * 1000)}`;
            
            // Generate avatar_url
            const avatarUrl = ghUsername && isValidGitHubUsername(ghUsername)
                ? `https://github.com/${ghUsername}.png`
                : DEFAULT_AVATAR;
            
            // Get status info
            const statusConfig = USER_STATUSES[currentUserStatus] || USER_STATUSES.idle;
            const status = statusConfig.status || 'idle';
            const statusColor = statusConfig.status_color || '#00ff41';
            
            // Get longitude/latitude
            const location = await getUserLocation();
            
            // If user status is offline (sprint), don't track to Presence (completely invisible)
            if (status === 'sprint') {
                console.log('[Presence] ⚠️ 用户状态为离线，不跟踪到 Presence（完全隐身）');
                // If previously tracked, untrack first
                try {
                    await presenceChannel.untrack();
                } catch (e) {
                    // Ignore error
                }
                return;
            }
            
            // Build Presence data (includes fingerprint for precise private message toId delivery)
            var myFp = '';
            try { myFp = localStorage.getItem('user_fingerprint') || window.fpId || ''; } catch (_) {}
            const myPresence = {
                user_name: userName,
                avatar_url: avatarUrl,
                github_id: ghUsername || null,
                github_username: ghUsername || null,
                fingerprint: myFp || null,
                user_fingerprint: myFp || null,
                status: status,
                status_color: statusColor,
                online_at: new Date().toISOString(),
                lat: location.lat,
                lng: location.lng,
                last_vibe: new Date().toISOString()
            };
            
            // Explicitly check instance again before calling track (prevent async race condition causing presenceChannel to be null)
            if (!presenceChannel) {
                if (window.__PRESENCE_SKIPPED) return;
                console.warn('[Presence] ⚠️ presenceChannel 实例已失效，跳过 track');
                return;
            }
            await presenceChannel.track(myPresence);
            
            console.log('[Presence] ✅ 自身状态已同步:', myPresence);
        } catch (error) {
            console.error('[Presence] ❌ 同步自身状态失败:', error);
        }
    };

    /**
     * Sync Presence state (contains all user info)
     * Compatible with legacy code, internally calls trackSelf
     */
    window.syncPresenceState = async function() {
        syncGlobals();
        await trackSelf();
    };

    /**
     * Toggle drawer expanded/collapsed state
     */
    window.toggleDrawer = function() {
        syncGlobals();
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
        
        // Save to localStorage
        localStorage.setItem('drawer_expanded', drawerExpanded.toString());
        // Sync back to window
        window.drawerExpanded = drawerExpanded;
        console.log('[Drawer] ✅ 抽屉状态已切换:', drawerExpanded ? '展开' : '折叠');
    };

    /**
     * Initialize drawer state
     */
    window.initDrawerState = function() {
        syncGlobals();
        const drawer = document.getElementById('live-nodes-drawer');
        if (!drawer) return;

        if (drawerExpanded) {
            drawer.classList.remove('collapsed');
            drawer.classList.add('expanded');
        } else {
            drawer.classList.remove('expanded');
            drawer.classList.add('collapsed');
        }

        // 【Fix】恢复左侧/右侧抽屉状态
        const leftDrawerOpen = localStorage.getItem('left_drawer_open') === 'true';
        const rightDrawerOpen = localStorage.getItem('right_drawer_open') === 'true';

        const leftDrawer = document.getElementById('left-drawer');
        const rightDrawer = document.getElementById('right-drawer');

        if (leftDrawer && leftDrawerOpen) {
            leftDrawer.classList.add('active');
            // 与下拉列表一致：优先使用 user_selected_country，再 manual_location / 锚定
            let countryCode = null;
            let countryName = '';

            // Priority 1: Country selected from dropdown (consistent with user calibration, Supabase sync)
            const selectedCountry = localStorage.getItem('user_selected_country');
            if (selectedCountry) {
                countryCode = selectedCountry.toUpperCase();
                if (countryNameMap[countryCode]) {
                    countryName = currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en;
                } else {
                    countryName = countryCode;
                }
            }

            // Priority 2: Old manual calibration (manual_location)
            if (!countryCode && localStorage.getItem('loc_fixed') === 'true') {
                countryCode = localStorage.getItem('manual_location') || null;
                if (countryCode && countryNameMap[countryCode]) {
                    countryName = currentLang === 'zh' ? countryNameMap[countryCode].zh : countryNameMap[countryCode].en;
                }
            }

            // Priority 3: Anchored country (anchored_country / selected_country)
            if (!countryCode) {
                // ... (rest of initDrawerState)
            }
        }

        if (rightDrawer && rightDrawerOpen) {
            rightDrawer.classList.add('active');
        }
    };

    console.log('[Realtime Module] ✅ Loaded successfully');

})();
