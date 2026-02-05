with open('stats2.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lines are 0-indexed in Python
# We want to replace lines 6353-6358 (1-indexed) which is indices 6352-6357 (0-indexed)
# Line 6353 (index 6352): } else {
# Line 6354 (index 6353): console.log(...
# Line 6355 (index 6354): // 即使没有匹配...
# Line 6356 (index 6355): // - 先尝试直接...
# Line 6357 (index 6356): // - 失败则有限...
# Line 6358 (index 6357): try {
# Line 6359 (index 6358): const currentFingerprint...

# We keep lines 0-6351, insert new code, then keep lines from 6358 onwards
new_lines = lines[:6352]  # Keep lines 1-6352 (indices 0-6351)

# Insert new code
new_code_lines = [
    '                } else {\n',
    "                    console.log('[Drawer] ⚠️ 未找到云端用户数据，尝试使用本地数据...');\n",
    '\n',
    '                    // 【修复】优先尝试使用本地数据渲染统计卡片\n',
    '                    let hasLocalData = false;\n',
    '                    let localUserData = null;\n',
    '                    try {\n',
    "                        const raw = localStorage.getItem('last_analysis_data');\n",
    '                        if (raw) {\n',
    '                            const obj = JSON.parse(raw);\n',
    '                            // 检查本地数据是否有有效的统计信息（支持多种字段名）\n',
    '                            const totalMessages = obj?.stats?.totalMessages || obj?.stats?.userMessages || 0;\n',
    '                            const totalChars = obj?.stats?.totalUserChars || obj?.stats?.totalChars || 0;\n',
    '                            if (totalMessages > 0 || totalChars > 0) {\n',
    '                                hasLocalData = true;\n',
    '                                localUserData = obj;\n',
    "                                console.log('[Drawer] 找到本地分析数据:', {\n",
    '                                    totalMessages,\n',
    '                                    totalChars,\n',
    '                                    stats: obj.stats,\n',
    '                                    earliestFileTime: obj.stats?.earliestFileTime\n',
    '                                });\n',
    '                            } else {\n',
    "                                console.log('[Drawer] 本地数据无有效统计信息:', obj?.stats);\n",
    '                            }\n',
    '                        } else {\n',
    "                            console.log('[Drawer] localStorage 中未找到 last_analysis_data');\n",
    '                        }\n',
    '                    } catch (e) { \n',
    "                        console.warn('[Drawer] 读取本地数据失败:', e);\n",
    '                    }\n',
    '\n',
    '                    // 如果有本地数据，使用本地数据渲染统计卡片\n',
    '                    if (hasLocalData && localUserData) {\n',
    "                        console.log('[Drawer] 使用本地数据渲染统计卡片');\n",
    '                        renderUserStatsCards(leftBody, localUserData);\n',
    '                    } else {\n',
    "                        console.log('[Drawer] 未找到本地数据，尝试从云端获取...');\n",
    '                        // 即使没有匹配到用户，如果 localStorage 中有 fingerprint：\n',
    '                        // - 先尝试直接从 v_unified_analysis_v2 按 fingerprint 拉取（避免一直 WAIT）\n',
    '                        // - 失败则有限次数重试，最终给出明确提示（避免无限"处理中"）\n',
    '                        try {\n',
    "                            const currentFingerprint = localStorage.getItem('user_fingerprint');\n",
]
new_lines.extend(new_code_lines)

# Append the rest of the file from line 6359 onwards (index 6358)
new_lines.extend(lines[6358:])

with open('stats2.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Replacement done!')
