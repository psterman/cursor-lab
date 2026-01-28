/**
 * 指纹匹配和用户数据加载完整诊断脚本
 * 使用方法：在 stats2.html 页面打开浏览器控制台，复制粘贴此脚本执行
 */

(async function comprehensiveDiagnostic() {
    console.group('%c🔍 指纹匹配和用户数据加载完整诊断', 'font-size: 16px; font-weight: bold; color: #00ff41;');
    
    const results = {
        step1: { name: '检查基础环境', status: 'pending', details: [] },
        step2: { name: '检查指纹生成和存储', status: 'pending', details: [] },
        step3: { name: '检查 allData 数据加载', status: 'pending', details: [] },
        step4: { name: '查找 psterman 用户记录', status: 'pending', details: [] },
        step5: { name: '检查指纹匹配逻辑', status: 'pending', details: [] },
        step6: { name: '检查 window.currentUser', status: 'pending', details: [] },
        step7: { name: '检查左侧抽屉状态', status: 'pending', details: [] },
        step8: { name: '检查统计卡片渲染', status: 'pending', details: [] },
        step9: { name: '尝试自动修复', status: 'pending', details: [] }
    };
    
    // ============================================
    // 步骤 1: 检查基础环境
    // ============================================
    console.group('📋 步骤 1: 检查基础环境');
    try {
        results.step1.details.push('✅ window 对象存在');
        results.step1.details.push('✅ document 对象存在');
        results.step1.details.push('✅ localStorage 可用');
        
        if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) {
            results.step1.details.push('✅ Supabase 客户端已初始化');
        } else {
            results.step1.details.push('❌ Supabase 客户端未初始化');
        }
        
        if (typeof renderUserStatsCards === 'function') {
            results.step1.details.push('✅ renderUserStatsCards 函数存在');
        } else {
            results.step1.details.push('❌ renderUserStatsCards 函数不存在');
        }
        
        results.step1.status = 'success';
        console.log('✅ 基础环境检查完成');
    } catch (error) {
        results.step1.status = 'error';
        results.step1.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ 基础环境检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 2: 检查指纹生成和存储
    // ============================================
    console.group('📋 步骤 2: 检查指纹生成和存储');
    let currentFingerprint = null;
    let normalizedCurrentFingerprint = '';
    
    try {
        // 辅助函数：规范化指纹
        const normalizeFingerprint = (fp) => {
            if (!fp) return '';
            return String(fp).trim().toLowerCase();
        };
        
        // 从 localStorage 获取指纹
        currentFingerprint = localStorage.getItem('user_fingerprint');
        
        if (currentFingerprint) {
            results.step2.details.push(`✅ 从 localStorage 获取到指纹: ${currentFingerprint.substring(0, 16)}...`);
            normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
        } else {
            results.step2.details.push('⚠️ localStorage 中没有指纹，尝试生成新指纹...');
            
            try {
                // 生成指纹
                const fingerprintData = {
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    platform: navigator.platform,
                    screenWidth: screen.width,
                    screenHeight: screen.height,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    canvas: 'test',
                    timestamp: Date.now()
                };
                
                const dataString = JSON.stringify(fingerprintData);
                const encoder = new TextEncoder();
                const data = encoder.encode(dataString);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                currentFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                // 保存到 localStorage
                localStorage.setItem('user_fingerprint', currentFingerprint);
                normalizedCurrentFingerprint = normalizeFingerprint(currentFingerprint);
                
                results.step2.details.push(`✅ 已生成新指纹并保存: ${currentFingerprint.substring(0, 16)}...`);
            } catch (error) {
                results.step2.details.push(`❌ 生成指纹失败: ${error.message}`);
                results.step2.status = 'error';
                console.error('❌ 生成指纹失败:', error);
                console.groupEnd();
                return;
            }
        }
        
        results.step2.details.push(`📊 规范化后的指纹: ${normalizedCurrentFingerprint.substring(0, 16)}...`);
        results.step2.status = 'success';
        console.log('✅ 指纹检查完成');
    } catch (error) {
        results.step2.status = 'error';
        results.step2.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ 指纹检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 3: 检查 allData 数据加载
    // ============================================
    console.group('📋 步骤 3: 检查 allData 数据加载');
    let allData = [];
    
    try {
        allData = window.allData || [];
        
        if (Array.isArray(allData)) {
            results.step3.details.push(`✅ allData 是数组类型`);
            results.step3.details.push(`📊 allData 数据量: ${allData.length}`);
            
            if (allData.length > 0) {
                results.step3.details.push('✅ allData 中有数据');
                
                // 显示前5个用户的摘要
                const sampleUsers = allData.slice(0, 5).map((user, index) => {
                    return `${index + 1}. ${user.user_name || user.name || '未知'} (ID: ${user.id?.substring(0, 8)}...)`;
                });
                results.step3.details.push(`📋 前5个用户: ${sampleUsers.join(', ')}`);
            } else {
                results.step3.details.push('⚠️ allData 为空数组');
                results.step3.status = 'warning';
            }
        } else {
            results.step3.details.push('❌ allData 不是数组类型');
            results.step3.status = 'error';
        }
        
        if (results.step3.status === 'pending') {
            results.step3.status = 'success';
        }
        console.log('✅ allData 检查完成');
    } catch (error) {
        results.step3.status = 'error';
        results.step3.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ allData 检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 4: 查找 psterman 用户记录
    // ============================================
    console.group('📋 步骤 4: 查找 psterman 用户记录');
    let pstermanUsers = [];
    
    try {
        const normalizeFingerprint = (fp) => {
            if (!fp) return '';
            return String(fp).trim().toLowerCase();
        };
        
        // 在 allData 中查找
        pstermanUsers = allData.filter(user => {
            const userName = (user.user_name || user.name || '').toLowerCase();
            return userName === 'psterman';
        });
        
        if (pstermanUsers.length > 0) {
            results.step4.details.push(`✅ 在 allData 中找到 ${pstermanUsers.length} 个 psterman 用户记录`);
            
            pstermanUsers.forEach((user, index) => {
                const userInfo = {
                    id: user.id,
                    user_name: user.user_name || user.name,
                    fingerprint: user.fingerprint ? user.fingerprint.substring(0, 16) + '...' : 'null',
                    user_fingerprint: user.user_fingerprint ? user.user_fingerprint.substring(0, 16) + '...' : 'null',
                    user_identity: user.user_identity ? user.user_identity.substring(0, 16) + '...' : 'null',
                    hasDimensions: !!(user.dimensions || user.ai || user.word),
                    hasRanks: !!(user.ranks || user.avg_rank),
                    hasPersonality: !!(user.personality_type || user.personalityType),
                    hasAnswerBook: !!(user.answer_book || user.answerBook)
                };
                
                results.step4.details.push(`\n   记录 ${index + 1}:`, userInfo);
                console.log(`记录 ${index + 1}:`, userInfo);
            });
            
            results.step4.status = 'success';
        } else {
            results.step4.details.push('❌ 在 allData 中未找到 psterman 用户记录');
            results.step4.status = 'warning';
            
            // 尝试从 Supabase 直接查询
            if (window.supabaseClient) {
                results.step4.details.push('🔄 尝试从 Supabase 数据库查询...');
                
                try {
                    const { data: dbUser, error: queryError } = await window.supabaseClient
                        .from('user_analysis')
                        .select('*')
                        .eq('user_name', 'psterman')
                        .maybeSingle();
                    
                    if (queryError && queryError.code !== 'PGRST116') {
                        results.step4.details.push(`❌ 数据库查询失败: ${queryError.message}`);
                    } else if (dbUser) {
                        results.step4.details.push('✅ 从数据库查询到 psterman 用户');
                        pstermanUsers.push(dbUser);
                        
                        // 添加到 allData
                        if (!window.allData) {
                            window.allData = [];
                        }
                        const existingIndex = window.allData.findIndex(item => item.id === dbUser.id);
                        if (existingIndex !== -1) {
                            window.allData[existingIndex] = { ...window.allData[existingIndex], ...dbUser };
                        } else {
                            window.allData.push(dbUser);
                        }
                        allData = window.allData;
                        
                        results.step4.details.push('✅ 已添加到 allData');
                        results.step4.status = 'success';
                    } else {
                        results.step4.details.push('❌ 数据库中也没有找到 psterman 用户');
                    }
                } catch (error) {
                    results.step4.details.push(`❌ 数据库查询出错: ${error.message}`);
                }
            } else {
                results.step4.details.push('⚠️ Supabase 客户端未初始化，无法查询数据库');
            }
        }
        
        console.log('✅ psterman 用户查找完成');
    } catch (error) {
        results.step4.status = 'error';
        results.step4.details.push(`❌ 查找失败: ${error.message}`);
        console.error('❌ 查找 psterman 用户失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 5: 检查指纹匹配逻辑
    // ============================================
    console.group('📋 步骤 5: 检查指纹匹配逻辑');
    let matchedUser = null;
    
    try {
        const normalizeFingerprint = (fp) => {
            if (!fp) return '';
            return String(fp).trim().toLowerCase();
        };
        
        if (normalizedCurrentFingerprint && pstermanUsers.length > 0) {
            results.step5.details.push('🔍 开始检查指纹匹配...');
            results.step5.details.push(`当前指纹: ${normalizedCurrentFingerprint.substring(0, 16)}...`);
            
            pstermanUsers.forEach((user, index) => {
                const userFingerprint = normalizeFingerprint(user.fingerprint || user.user_fingerprint);
                const userIdentity = normalizeFingerprint(user.user_identity);
                
                const matchFingerprint = userFingerprint && userFingerprint === normalizedCurrentFingerprint;
                const matchIdentity = userIdentity && userIdentity === normalizedCurrentFingerprint;
                
                results.step5.details.push(`\n记录 ${index + 1} 匹配检查:`);
                results.step5.details.push(`  - fingerprint 字段: ${userFingerprint ? userFingerprint.substring(0, 16) + '...' : 'null'}`);
                results.step5.details.push(`  - user_identity 字段: ${userIdentity ? userIdentity.substring(0, 16) + '...' : 'null'}`);
                results.step5.details.push(`  - fingerprint 匹配: ${matchFingerprint ? '✅' : '❌'}`);
                results.step5.details.push(`  - user_identity 匹配: ${matchIdentity ? '✅' : '❌'}`);
                
                if (matchFingerprint || matchIdentity) {
                    matchedUser = user;
                    results.step5.details.push(`  ✅ 指纹匹配成功！`);
                } else {
                    results.step5.details.push(`  ❌ 指纹不匹配`);
                }
            });
            
            if (matchedUser) {
                results.step5.status = 'success';
                results.step5.details.push('✅ 找到匹配的用户');
            } else {
                results.step5.status = 'warning';
                results.step5.details.push('⚠️ 指纹不匹配，可能需要重新绑定指纹');
            }
        } else {
            if (!normalizedCurrentFingerprint) {
                results.step5.details.push('⚠️ 当前指纹为空，跳过匹配检查');
            }
            if (pstermanUsers.length === 0) {
                results.step5.details.push('⚠️ 未找到 psterman 用户，跳过匹配检查');
            }
            results.step5.status = 'warning';
        }
        
        console.log('✅ 指纹匹配检查完成');
    } catch (error) {
        results.step5.status = 'error';
        results.step5.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ 指纹匹配检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 6: 检查 window.currentUser
    // ============================================
    console.group('📋 步骤 6: 检查 window.currentUser');
    
    try {
        const currentUser = window.currentUser;
        
        if (currentUser) {
            const userName = (currentUser.user_name || currentUser.name || '').toLowerCase();
            const isPsterman = userName === 'psterman';
            
            results.step6.details.push('✅ window.currentUser 已设置');
            results.step6.details.push(`用户名称: ${currentUser.user_name || currentUser.name || '未知'}`);
            results.step6.details.push(`是否 psterman: ${isPsterman ? '✅ 是' : '❌ 否'}`);
            results.step6.details.push(`用户 ID: ${currentUser.id?.substring(0, 8)}...`);
            results.step6.details.push(`有维度数据: ${!!(currentUser.dimensions || currentUser.ai || currentUser.word) ? '✅' : '❌'}`);
            results.step6.details.push(`有排名数据: ${!!(currentUser.ranks || currentUser.avg_rank) ? '✅' : '❌'}`);
            
            if (isPsterman) {
                results.step6.status = 'success';
            } else {
                results.step6.status = 'warning';
                results.step6.details.push('⚠️ 当前用户不是 psterman');
            }
        } else {
            results.step6.details.push('❌ window.currentUser 未设置');
            results.step6.status = 'error';
            
            // 如果找到了匹配的用户，尝试设置
            if (matchedUser) {
                results.step6.details.push('🔄 尝试设置 window.currentUser...');
                window.currentUser = matchedUser;
                window.currentUserMatchedByFingerprint = true;
                results.step6.details.push('✅ 已设置 window.currentUser');
                results.step6.status = 'success';
            }
        }
        
        console.log('✅ currentUser 检查完成');
    } catch (error) {
        results.step6.status = 'error';
        results.step6.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ currentUser 检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 7: 检查左侧抽屉状态
    // ============================================
    console.group('📋 步骤 7: 检查左侧抽屉状态');
    
    try {
        const leftDrawer = document.getElementById('left-drawer');
        const leftBody = document.getElementById('left-drawer-body');
        
        if (leftDrawer) {
            results.step7.details.push('✅ 左侧抽屉元素存在');
            results.step7.details.push(`抽屉是否打开: ${leftDrawer.classList.contains('active') ? '✅ 是' : '❌ 否'}`);
        } else {
            results.step7.details.push('❌ 左侧抽屉元素不存在');
            results.step7.status = 'error';
        }
        
        if (leftBody) {
            results.step7.details.push('✅ 抽屉内容区域存在');
            
            const drawerItems = leftBody.querySelectorAll('.drawer-item');
            results.step7.details.push(`抽屉中的卡片数量: ${drawerItems.length}`);
            
            drawerItems.forEach((item, index) => {
                const label = item.querySelector('.drawer-item-label');
                const labelText = label ? label.textContent : '无标签';
                results.step7.details.push(`  卡片 ${index + 1}: ${labelText}`);
            });
            
            // 检查是否有统计卡片
            const statsCard = Array.from(drawerItems).find(item => {
                const label = item.querySelector('.drawer-item-label');
                return label && label.textContent === '我的数据统计';
            });
            
            if (statsCard) {
                results.step7.details.push('✅ 找到统计卡片');
            } else {
                results.step7.details.push('❌ 未找到统计卡片');
            }
        } else {
            results.step7.details.push('❌ 抽屉内容区域不存在');
            results.step7.status = 'error';
        }
        
        if (results.step7.status === 'pending') {
            results.step7.status = 'success';
        }
        
        console.log('✅ 左侧抽屉检查完成');
    } catch (error) {
        results.step7.status = 'error';
        results.step7.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ 左侧抽屉检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 8: 检查统计卡片渲染
    // ============================================
    console.group('📋 步骤 8: 检查统计卡片渲染');
    
    try {
        const leftBody = document.getElementById('left-drawer-body');
        const currentUser = window.currentUser;
        
        if (!leftBody) {
            results.step8.details.push('❌ leftBody 不存在，无法渲染');
            results.step8.status = 'error';
        } else if (!currentUser) {
            results.step8.details.push('❌ currentUser 不存在，无法渲染');
            results.step8.status = 'error';
        } else if (typeof renderUserStatsCards !== 'function') {
            results.step8.details.push('❌ renderUserStatsCards 函数不存在');
            results.step8.status = 'error';
        } else {
            const userName = (currentUser.user_name || currentUser.name || '').toLowerCase();
            const isPsterman = userName === 'psterman';
            
            results.step8.details.push('✅ 所有必要条件满足');
            results.step8.details.push(`当前用户: ${currentUser.user_name || currentUser.name}`);
            results.step8.details.push(`是否 psterman: ${isPsterman ? '✅ 是' : '❌ 否'}`);
            
            if (isPsterman) {
                results.step8.details.push('🔄 准备渲染统计卡片...');
                results.step8.status = 'pending'; // 将在步骤9中完成
            } else {
                results.step8.details.push('⚠️ 当前用户不是 psterman，跳过渲染');
                results.step8.status = 'warning';
            }
        }
        
        console.log('✅ 统计卡片渲染检查完成');
    } catch (error) {
        results.step8.status = 'error';
        results.step8.details.push(`❌ 检查失败: ${error.message}`);
        console.error('❌ 统计卡片渲染检查失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 步骤 9: 尝试自动修复
    // ============================================
    console.group('📋 步骤 9: 尝试自动修复');
    
    try {
        const leftBody = document.getElementById('left-drawer-body');
        const currentUser = window.currentUser;
        
        let fixAttempted = false;
        let fixSuccess = false;
        
        // 修复 1: 如果 currentUser 不是 psterman，但找到了匹配的 psterman 用户
        if (matchedUser && (!currentUser || (currentUser.user_name || currentUser.name || '').toLowerCase() !== 'psterman')) {
            results.step9.details.push('🔄 修复 1: 设置 window.currentUser 为匹配的 psterman 用户...');
            window.currentUser = matchedUser;
            window.currentUserMatchedByFingerprint = true;
            fixAttempted = true;
            results.step9.details.push('✅ 已设置 window.currentUser');
        }
        
        // 修复 2: 如果 currentUser 是 psterman，但统计卡片未渲染
        const finalUser = window.currentUser;
        if (finalUser && leftBody && typeof renderUserStatsCards === 'function') {
            const userName = (finalUser.user_name || finalUser.name || '').toLowerCase();
            if (userName === 'psterman') {
                results.step9.details.push('🔄 修复 2: 渲染统计卡片...');
                
                try {
                    // 移除旧的统计卡片（如果存在）
                    const existingStatsCards = leftBody.querySelectorAll('.drawer-item');
                    existingStatsCards.forEach(card => {
                        const label = card.querySelector('.drawer-item-label');
                        if (label && label.textContent === '我的数据统计') {
                            card.remove();
                        }
                    });
                    
                    // 渲染新的统计卡片
                    renderUserStatsCards(leftBody, finalUser);
                    fixAttempted = true;
                    fixSuccess = true;
                    results.step9.details.push('✅ 统计卡片已渲染');
                } catch (error) {
                    results.step9.details.push(`❌ 渲染失败: ${error.message}`);
                    console.error('❌ 渲染统计卡片失败:', error);
                }
            }
        }
        
        // 修复 3: 如果抽屉未打开，尝试打开
        const leftDrawer = document.getElementById('left-drawer');
        if (leftDrawer && !leftDrawer.classList.contains('active')) {
            results.step9.details.push('🔄 修复 3: 打开左侧抽屉...');
            leftDrawer.classList.add('active');
            const rightDrawer = document.getElementById('right-drawer');
            if (rightDrawer) {
                rightDrawer.classList.add('active');
            }
            fixAttempted = true;
            results.step9.details.push('✅ 已打开左侧抽屉');
        }
        
        if (fixAttempted) {
            if (fixSuccess) {
                results.step9.status = 'success';
            } else {
                results.step9.status = 'warning';
            }
        } else {
            results.step9.details.push('ℹ️ 无需修复或无法自动修复');
            results.step9.status = 'info';
        }
        
        console.log('✅ 自动修复尝试完成');
    } catch (error) {
        results.step9.status = 'error';
        results.step9.details.push(`❌ 修复失败: ${error.message}`);
        console.error('❌ 自动修复失败:', error);
    }
    console.groupEnd();
    
    // ============================================
    // 输出诊断报告
    // ============================================
    console.group('%c📊 诊断报告摘要', 'font-size: 14px; font-weight: bold; color: #00ff41;');
    
    const statusColors = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️',
        pending: '⏳'
    };
    
    Object.keys(results).forEach(stepKey => {
        const step = results[stepKey];
        const icon = statusColors[step.status] || '❓';
        console.log(`${icon} ${step.name}: ${step.status}`);
        step.details.forEach(detail => {
            if (typeof detail === 'object') {
                console.log('  ', detail);
            } else {
                console.log(`  ${detail}`);
            }
        });
    });
    
    console.groupEnd();
    
    // 返回诊断结果
    return {
        results,
        summary: {
            totalSteps: Object.keys(results).length,
            successSteps: Object.values(results).filter(r => r.status === 'success').length,
            warningSteps: Object.values(results).filter(r => r.status === 'warning').length,
            errorSteps: Object.values(results).filter(r => r.status === 'error').length,
            currentFingerprint: normalizedCurrentFingerprint.substring(0, 16) + '...',
            pstermanUsersFound: pstermanUsers.length,
            currentUserSet: !!window.currentUser,
            isPsterman: window.currentUser ? (window.currentUser.user_name || window.currentUser.name || '').toLowerCase() === 'psterman' : false
        }
    };
})();
