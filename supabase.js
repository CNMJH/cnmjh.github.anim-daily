// Supabase配置
const SUPABASE_URL = 'https://thiqabvysopzmftgrtmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoaXFhYnZ5c29wem1mdGdydG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzUzMjIsImV4cCI6MjA4ODcxMTMyMn0.cDvjlNjU8KiKF96r4SRtBMLgUSfbMJFPQ5pLlcPt_GM';

// 简单的Supabase客户端
async function supabaseRequest(table, method = 'GET', data = null) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };
    
    const options = {
        method: method,
        headers: headers
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    // 如果是GET请求，添加参数
    let requestUrl = url;
    if (method === 'GET') {
        requestUrl += '?status=eq.pending&order=created_at.desc';
    }
    
    const response = await fetch(requestUrl, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || '请求失败');
    }
    
    if (method === 'GET') {
        return await response.json();
    }
    
    return response;
}

// 保存投稿到Supabase
async function saveSubmissionToSupabase(submission) {
    // 把tags数组转成逗号分隔的字符串
    const tagsStr = submission.tags && submission.tags.length > 0 
        ? submission.tags.join(',') 
        : '';
    
    const data = {
        url: submission.url,
        type: submission.type,
        subcategory: submission.subcategory,
        title: submission.title || '待审核内容',
        description: submission.description || '',
        tags: tagsStr,
        source: submission.source,
        status: 'pending'
    };
    
    return await supabaseRequest('submissions', 'POST', data);
}

// 从Supabase获取待审核投稿
async function getPendingSubmissionsFromSupabase() {
    const data = await supabaseRequest('submissions', 'GET');
    
    // 转换tags字段
    return data.map(item => ({
        id: 'supabase_' + item.id,
        supabaseId: item.id,
        url: item.url,
        type: item.type,
        subcategory: item.subcategory,
        title: item.title,
        description: item.description,
        tags: item.tags ? item.tags.split(',').filter(t => t.trim()) : [],
        source: item.source,
        artist: '待确认',
        date: new Date().toISOString().split('T')[0],
        image: '',
        likes: 0,
        submittedAt: item.created_at,
        status: item.status,
        fromSupabase: true
    }));
}

// 更新Supabase投稿状态
async function updateSubmissionStatus(id, newStatus) {
    const url = `${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify({ status: newStatus })
    });
    
    return response.ok;
}
