/**
 * GitHub 同步调试脚本
 * 在浏览器控制台执行此脚本以手动触发 GitHub 数据同步
 */

(async function debugGithubSync() {
  console.log('=== GitHub 同步调试工具 ===');
  
  // 1. 检查 access token
  const token = window.__githubAccessToken || localStorage.getItem('vibe_github_access_token') || localStorage.getItem('github_token');
  console.log('1. Access Token:', token ? `存在 (${token.slice(0, 20)}...)` : '❌ 缺失');
  
  if (!token) {
    console.error('❌ 未找到 GitHub Access Token，请先登录 GitHub');
    console.log('提示：访问 https://github.com/settings/tokens 创建 Personal Access Token');
    console.log('需要权限: public_repo, read:user, read:org');
    return;
  }
  
  // 2. 检查用户信息
  const user = window.currentUser || window.currentUserData;
  console.log('2. 当前用户:', user ? {
    id: user.id,
    user_name: user.user_name,
    github_login: user.github_login,
    fingerprint: user.fingerprint ? user.fingerprint.slice(0, 8) + '...' : null
  } : '❌ 未登录');
  
  if (!user) {
    console.error('❌ 未找到用户信息，请先登录');
    return;
  }
  
  // 3. 检查现有 github_stats
  console.log('3. 现有 github_stats:', user.github_stats);
  console.log('4. github_login:', user.github_login);
  console.log('5. last_sync_at:', user.last_sync_at);
  
  // 4. 触发同步
  const apiBase = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim().replace(/\/$/, '');
  const syncUrl = apiBase ? apiBase + '/api/github/sync' : '/api/github/sync';
  
  console.log('6. 开始同步...');
  console.log('   URL:', syncUrl);
  console.log('   Payload:', {
    accessToken: token.slice(0, 20) + '...',
    userId: user.user_name || user.login,
    fingerprint: user.fingerprint?.slice(0, 8) + '...' || '',
    id: user.id
  });
  
  try {
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: token,
        userId: user.user_name || user.login || '',
        fingerprint: user.fingerprint || '',
        id: user.id || ''
      })
    });
    
    const result = await response.json();
    
    console.log('=== 同步结果 ===');
    console.log('Status:', response.status);
    console.log('Success:', result.success);
    console.log('Cached:', result.cached);
    console.log('Error:', result.error);
    
    if (result.success && result.data) {
      console.log('✅ 同步成功！');
      console.log('数据预览:', {
        login: result.data.login,
        totalRepoStars: result.data.totalRepoStars,
        followers: result.data.followers,
        mergedPRs: result.data.mergedPRs,
        activeDays: result.data.activeDays,
        globalRanking: result.data.globalRanking
      });
      
      // 刷新页面以显示新数据
      console.log('💡 建议刷新页面以显示最新数据');
    } else {
      console.error('❌ 同步失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('❌ 同步请求失败:', error);
    throw error;
  }
})();
