#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open(r'C:\Users\pster\Desktop\backup\stats2.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 旧函数 - 从文件中提取
old_func_start = '        async function fetchCountrySummaryV3(countryCode) {'
old_func_end = '''            } catch (e) {
                console.warn('[CountrySummary] 拉取失败:', e);
                return null;
            }
        }'''

# 新函数
new_func = '''        async function fetchCountrySummaryV3(countryCode) {
            if (!countryCode || String(countryCode).trim().length !== 2) return null;
            const apiEndpoint = document.querySelector('meta[name="api-endpoint"]')?.content || '';
            const base = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
            const url = base ? `${base}/api/country-summary?country=${encodeURIComponent(String(countryCode).toUpperCase())}` : `/api/country-summary?country=${encodeURIComponent(String(countryCode).toUpperCase())}`;
            
            // 添加超时控制，防止长时间挂起
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                const res = await fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                });
                clearTimeout(timeoutId);
                
                if (!res.ok) {
                    console.warn(`[CountrySummary] HTTP ${res.status}: ${countryCode}`);
                    return null;
                }
                
                const payload = await res.json();
                // 保持旧语义：明确失败时不刷新抽屉（避免把有效的全局数据覆盖成 N/A）
                if (payload && typeof payload === 'object' && 'success' in payload && payload.success !== true) {
                    return null;
                }
                // 兼容后端多种包装格式：{success, data/result/summary/...}
                const raw = payload?.data ?? payload?.result ?? payload?.summary ?? payload?.payload ?? payload;

                const normalized = typeof normalizeData === 'function' ? normalizeData(raw) : raw;
                if (normalized && typeof normalized === 'object') {
                    normalized.countryCode = String(countryCode).toUpperCase();
                }
                console.log(`[CountrySummary] ✅ ${countryCode} 加载成功`);
                return normalized && typeof normalized === 'object' ? normalized : null;
                
            } catch (e) {
                clearTimeout(timeoutId);
                // 更友好的错误分类
                if (e.name === 'AbortError') {
                    console.warn(`[CountrySummary] ⏱️ 请求超时: ${countryCode}`);
                } else if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
                    console.warn(`[CountrySummary] 🌐 网络/CORS错误: ${countryCode} (检查API端点配置)`);
                } else {
                    console.warn('[CountrySummary] ❌ 拉取失败:', e.message || e);
                }
                return null;
            }
        }'''

# 找到函数的位置
start_idx = content.find(old_func_start)
if start_idx == -1:
    print("ERROR: Could not find function start")
    exit(1)

# 从 start_idx 开始找到对应的结束位置
# 找函数结尾，需要找到与开头的 { 匹配的 }
brace_count = 0
found_first_brace = False
end_idx = start_idx

for i in range(start_idx, len(content)):
    if content[i] == '{':
        brace_count += 1
        found_first_brace = True
    elif content[i] == '}':
        brace_count -= 1
    
    if found_first_brace and brace_count == 0:
        end_idx = i + 1
        break

# 提取原始函数
original_func = content[start_idx:end_idx]
print(f"Found function from position {start_idx} to {end_idx}")
print(f"Original function preview:\n{original_func[:200]}...")
print(f"Original function ends with:\n...{original_func[-200:]}")

# 进行替换
new_content = content[:start_idx] + new_func + content[end_idx:]

# 写入文件
with open(r'C:\Users\pster\Desktop\backup\stats2.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("\n✅ Function successfully replaced!")
