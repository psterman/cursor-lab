// worker.js (前端专用)
self.onmessage = function(e) {
    const { type, data } = e.data;
    if (type === 'ANALYZE_DATA') {
        // 简单的分析逻辑
        const stats = {
            userMessages: (data.match(/User:/g) || []).length,
            totalUserChars: data.length,
            submittedAt: Date.now()
        };
        // 返回结果给 main.js
        self.postMessage({ type: 'FINISHED', status: 'success', data: stats });
    }
};