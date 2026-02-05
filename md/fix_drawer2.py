# -*- coding: utf-8 -*-
with open('stats2.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Use Chinese quotes 
left_quote = '"'
right_quote = '"'

old_pattern = f'''                }} else {{
                    console.log('[Drawer] ⚠️ 未找到用户数据，跳过统计卡片渲染');
                    // 即使没有匹配到用户，如果 localStorage 中有 fingerprint：
                    // - 先尝试直接从 v_unified_analysis_v2 按 fingerprint 拉取（避免一直 WAIT）
                    // - 失败则有限次数重试，最终给出明确提示（避免无限{left_quote}处理中{right_quote}）
                    try {{
                        const currentFingerprint = localStorage.getItem('user_fingerprint');'''

new_code = f'''                }} else {{
                    console.log('[Drawer] ⚠️ 未找到云端用户数据，尝试使用本地数据...');
                    
                    // 【修复】优先尝试使用本地数据渲染统计卡片
                    let hasLocalData = false;
                    let localUserData = null;
                    try {{
                        const raw = localStorage.getItem('last_analysis_data');
                        if (raw) {{
                            const obj = JSON.parse(raw);
                            // 检查本地数据是否有有效的统计信息（支持多种字段名）
                            const totalMessages = obj?.stats?.totalMessages || obj?.stats?.userMessages || 0;
                            const totalChars = obj?.stats?.totalUserChars || obj?.stats?.totalChars || 0;
                            if (totalMessages > 0 || totalChars > 0) {{
                                hasLocalData = true;
                                localUserData = obj;
                                console.log('[Drawer] 找到本地分析数据:', {{
                                    totalMessages,
                                    totalChars,
                                    stats: obj.stats,
                                    earliestFileTime: obj.stats?.earliestFileTime
                                }});
                            }} else {{
                                console.log('[Drawer] 本地数据无有效统计信息:', obj?.stats);
                            }}
                        }} else {{
                            console.log('[Drawer] localStorage 中未找到 last_analysis_data');
                        }}
                    }} catch (e) {{ 
                        console.warn('[Drawer] 读取本地数据失败:', e);
                    }}
                    
                    // 如果有本地数据，使用本地数据渲染统计卡片
                    if (hasLocalData && localUserData) {{
                        console.log('[Drawer] 使用本地数据渲染统计卡片');
                        renderUserStatsCards(leftBody, localUserData);
                    }} else {{
                        console.log('[Drawer] 未找到本地数据，尝试从云端获取...');
                        // 即使没有匹配到用户，如果 localStorage 中有 fingerprint：
                        // - 先尝试直接从 v_unified_analysis_v2 按 fingerprint 拉取（避免一直 WAIT）
                        // - 失败则有限次数重试，最终给出明确提示（避免无限{left_quote}处理中{right_quote}）
                        try {{
                            const currentFingerprint = localStorage.getItem('user_fingerprint');'''

if old_pattern in content:
    content = content.replace(old_pattern, new_code)
    with open('stats2.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Replacement done!')
else:
    print('ERROR: Pattern not found')
