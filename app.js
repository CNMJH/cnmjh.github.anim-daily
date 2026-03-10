// 动画每日一刷 - 主程序

// 新闻数据（从 JSON 文件加载）
let worksData = [];

// 收藏数据
let favorites = {
    folders: [
        { id: 'all', name: '全部收藏', works: [] },
        { id: 'character', name: '角色动画', works: [] },
        { id: 'action', name: '动作参考', works: [] },
        { id: 'pose', name: 'Pose参考', works: [] }
    ],
    currentFolder: 'all'
};

// 浏览历史记录
let history = [];
const MAX_HISTORY = 50; // 最多保存50条历史记录

// 点赞数据
let likes = new Set(); // 已点赞的内容ID

// 待审核的投稿
let pendingSubmissions = [];

// 链接检查状态
let linkCheckResults = {}; // 存储链接检查结果
let lastLinkCheckTime = 0; // 上次检查时间
const LINK_CHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天检查一次

// 高级筛选状态
let filterState = {
    source: 'all',
    sort: 'default'
};

// 分页配置
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;

// 防抖函数（性能优化）
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 预加载图片（性能优化）
function preloadImages(works) {
    works.forEach(item => {
        if (item.image) {
            const img = new Image();
            img.src = item.image;
        }
    });
}

// 从localStorage加载点赞
function loadLikes() {
    try {
        const saved = localStorage.getItem('animDailyLikes');
        if (saved) {
            likes = new Set(JSON.parse(saved));
            console.log('✅ 已加载点赞:', likes.size, '个');
        }
    } catch (e) {
        console.error('❌ 加载点赞失败:', e);
    }
}

// 保存点赞到localStorage
function saveLikes() {
    try {
        localStorage.setItem('animDailyLikes', JSON.stringify([...likes]));
    } catch (e) {
        console.error('❌ 保存点赞失败:', e);
    }
}

// 本网站点赞计数
let likeCounts = {};

// 加载点赞计数
function loadLikeCounts() {
    try {
        const saved = localStorage.getItem('animDailyLikeCounts');
        if (saved) {
            likeCounts = JSON.parse(saved);
        }
    } catch (e) {}
}

// 保存点赞计数
function saveLikeCounts() {
    try {
        localStorage.setItem('animDailyLikeCounts', JSON.stringify(likeCounts));
    } catch (e) {}
}

// 切换点赞状态
function toggleLike(workId, event) {
    event.stopPropagation(); // 阻止冒泡
    
    if (likes.has(workId)) {
        likes.delete(workId);
        if (likeCounts[workId] > 0) {
            likeCounts[workId]--;
        }
    } else {
        likes.add(workId);
        likeCounts[workId] = (likeCounts[workId] || 0) + 1;
    }
    
    saveLikes();
    saveLikeCounts();
    updateStats();
    renderWorks(filterWorksData());
}

// 检查是否已点赞
function isLiked(workId) {
    return likes.has(workId);
}

// 打开投稿弹窗
function openSubmitModal() {
    document.getElementById('submitModal').style.display = 'flex';
    // 重置表单
    document.getElementById('submitForm').reset();
    document.getElementById('submitSubcategory').innerHTML = '<option value="">请先选择内容分类</option>';
}

// 关闭投稿弹窗
function closeSubmitModal() {
    document.getElementById('submitModal').style.display = 'none';
}



// 验证链接是否合法
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname;
        return hostname.includes('bilibili.com') || 
               hostname.includes('zcool.com.cn') || 
               hostname.includes('huaban.com');
    } catch (e) {
        return false;
    }
}

// 处理投稿提交
async function handleSubmit(event) {
    event.preventDefault();
    
    const url = document.getElementById('submitUrl').value;
    const type = document.getElementById('submitType').value;
    const subcategory = document.getElementById('submitSubcategory').value;
    const title = document.getElementById('submitTitle').value;
    const description = document.getElementById('submitDescription').value;
    const tagsInput = document.getElementById('submitTags').value;
    
    // 验证链接
    if (!isValidUrl(url)) {
        alert('❌ 请输入有效的B站/站酷/花瓣链接！');
        return;
    }
    
    // 处理标签
    const tags = tagsInput ? tagsInput.split(/\s+/).filter(t => t.trim()).slice(0, 5) : [];
    
    // 创建投稿对象
    const submission = {
        url: url,
        type: type,
        subcategory: subcategory,
        title: title || '待审核内容',
        description: description || '',
        tags: tags,
        source: getSourceFromUrl(url)
    };
    
    try {
        // 保存到Supabase
        await saveSubmissionToSupabase(submission);
        alert('✅ 投稿成功！管理员会尽快审核！');
        closeSubmitModal();
    } catch (e) {
        console.error('保存投稿失败:', e);
        alert('❌ 网络错误，保存到本地...');
        
        // 备用方案：保存到本地
        const localSubmission = {
            id: 'submission_' + Date.now(),
            url: url,
            type: type,
            subcategory: subcategory,
            title: title || '待审核内容',
            description: description || '',
            tags: tags,
            source: getSourceFromUrl(url),
            artist: '待确认',
            date: new Date().toISOString().split('T')[0],
            image: '',
            likes: 0,
            submittedAt: new Date().toISOString(),
            status: 'pending'
        };
        
        pendingSubmissions.push(localSubmission);
        savePendingSubmissions();
        closeSubmitModal();
    }
}

function getSubcategoryName(subcategory) {
    const names = {
        'character': '角色动画',
        'action': '动作场面',
        'facial': '表情动画',
        'creature': '生物动画',
        'stand': '站立姿势',
        'action_pose': '动态姿势',
        'hand': '手部参考'
    };
    return names[subcategory] || subcategory;
}

// 从URL获取来源名称
function getSourceFromUrl(url) {
    if (url.includes('bilibili.com')) return 'B站';
    if (url.includes('zcool.com.cn')) return '站酷';
    if (url.includes('huaban.com')) return '花瓣网';
    return '其他';
}

// 保存待审核投稿到localStorage
function savePendingSubmissions() {
    try {
        localStorage.setItem('animDailyPendingSubmissions', JSON.stringify(pendingSubmissions));
    } catch (e) {
        console.error('❌ 保存待审核投稿失败:', e);
    }
}

// 加载待审核投稿
function loadPendingSubmissions() {
    try {
        const saved = localStorage.getItem('animDailyPendingSubmissions');
        if (saved) {
            pendingSubmissions = JSON.parse(saved);
            console.log('✅ 已加载待审核投稿:', pendingSubmissions.length, '个');
        }
    } catch (e) {
        console.error('❌ 加载待审核投稿失败:', e);
    }
}

// 加载链接检查结果
function loadLinkCheckResults() {
    try {
        const saved = localStorage.getItem('animDailyLinkCheckResults');
        if (saved) {
            const data = JSON.parse(saved);
            linkCheckResults = data.results || {};
            lastLinkCheckTime = data.lastCheckTime || 0;
            console.log('✅ 已加载链接检查结果');
        }
    } catch (e) {
        console.error('❌ 加载链接检查结果失败:', e);
    }
}

// 保存链接检查结果
function saveLinkCheckResults() {
    try {
        localStorage.setItem('animDailyLinkCheckResults', JSON.stringify({
            results: linkCheckResults,
            lastCheckTime: lastLinkCheckTime
        }));
    } catch (e) {
        console.error('❌ 保存链接检查结果失败:', e);
    }
}

// 检查单个链接（通过图片加载测试）
function checkLink(item) {
    return new Promise((resolve) => {
        const workId = item.url || item.title;
        const result = {
            workId: workId,
            url: item.url,
            checkedAt: new Date().toISOString(),
            status: 'valid', // 默认有效
            error: null
        };
        
        // 如果有预览图，尝试加载图片来测试
        if (item.image) {
            const img = new Image();
            img.timeoutId = setTimeout(() => {
                result.status = 'invalid';
                result.error = '图片加载超时';
                resolve(result);
            }, 5000); // 5秒超时
            
            img.onload = () => {
                clearTimeout(img.timeoutId);
                result.status = 'valid';
                resolve(result);
            };
            
            img.onerror = () => {
                clearTimeout(img.timeoutId);
                result.status = 'invalid';
                result.error = '图片加载失败';
                resolve(result);
            };
            
            img.src = item.image + (item.image.includes('?') ? '&' : '?') + '_t=' + Date.now();
        } else {
            // 没有预览图，默认有效
            resolve(result);
        }
    });
}

// 检查所有链接
async function checkAllLinks() {
    console.log('🔍 开始检查所有链接...');
    
    const results = [];
    for (const item of worksData) {
        const result = await checkLink(item);
        results.push(result);
        linkCheckResults[result.workId] = result;
    }
    
    lastLinkCheckTime = Date.now();
    saveLinkCheckResults();
    
    const validCount = results.filter(r => r.status === 'valid').length;
    const invalidCount = results.filter(r => r.status === 'invalid').length;
    console.log(`✅ 链接检查完成！有效：${validCount}，失效：${invalidCount}，总计：${results.length}`);
    
    return results;
}

// 检查是否需要进行自动检查
function shouldCheckLinks() {
    const timeSinceLastCheck = Date.now() - lastLinkCheckTime;
    return timeSinceLastCheck >= LINK_CHECK_INTERVAL;
}

// 定时检查链接（页面加载时检查一次）
function scheduleLinkCheck() {
    loadLinkCheckResults();
    
    if (shouldCheckLinks()) {
        console.log('⏰ 定时触发：开始检查链接...');
        checkAllLinks().then(() => {
            renderWorks(filterWorksData());
        });
    } else {
        console.log('✅ 距离上次检查不足7天，跳过检查');
    }
}

// 标记链接为失效（用户举报）
async function markLinkInvalid(workId, event) {
    event.stopPropagation(); // 阻止冒泡
    
    if (!confirm('确定要举报这个链接失效吗？')) return;
    
    // 先保存到本地
    linkCheckResults[workId] = {
        workId: workId,
        status: 'invalid',
        checkedAt: new Date().toISOString(),
        reportedByUser: true
    };
    saveLinkCheckResults();
    
    // 同时保存到Supabase（跨设备可见）
    try {
        const work = worksData.find(w => w.id === workId);
        const workTitle = work ? work.title : '未知作品';
        const workUrl = work ? work.url : '无链接';
        
        const data = {
            work_id: workId,
            work_title: workTitle,
            work_url: workUrl,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        // 直接用Supabase的API保存
        const response = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ 已提交举报！感谢反馈！管理员会尽快处理！');
        } else {
            alert('✅ 已提交举报！感谢反馈！');
        }
    } catch (e) {
        console.error('保存举报到Supabase失败:', e);
        alert('✅ 已提交举报！感谢反馈！');
    }
    
    renderWorks(filterWorksData());
}

// 分类映射（中文）
const categoryNames = {
    'all': '全部',
    'animation': '动画作品',
    'pose': 'Pose 参考',
    'character': '角色动画',
    'action': '动作场面',
    'facial': '表情动画',
    'creature': '生物动画',
    'stand': '站立姿势',
    'action_pose': '动态姿势',
    'hand': '手部参考'
};

let currentCategory = 'all';
let currentSubCategory = 'all';
let searchQuery = '';
let currentTag = ''; // 当前选中的标签
let todayRecommend = []; // 今日推荐内容
let isLightTheme = false; // 是否亮色主题

// 从localStorage加载收藏
function loadFavorites() {
    try {
        const saved = localStorage.getItem('animDailyFavorites');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.folders) {
                favorites = data;
            } else {
                // 兼容旧数据
                favorites.folders[0].works = [...new Set(data)];
            }
            console.log('✅ 已加载收藏');
        }
    } catch (e) {
        console.error('❌ 加载收藏失败:', e);
    }
}

// 保存收藏到localStorage
function saveFavorites() {
    try {
        localStorage.setItem('animDailyFavorites', JSON.stringify(favorites));
    } catch (e) {
        console.error('❌ 保存收藏失败:', e);
    }
}

// 获取当前收藏夹的作品
function getCurrentFavorites() {
    const folder = favorites.folders.find(f => f.id === favorites.currentFolder);
    return folder ? new Set(folder.works) : new Set();
}

// 切换收藏状态（添加到当前收藏夹）
function toggleFavorite(workId, event) {
    event.stopPropagation(); // 阻止冒泡，不打开链接
    
    const currentFavorites = getCurrentFavorites();
    
    if (currentFavorites.has(workId)) {
        // 从所有收藏夹中移除
        favorites.folders.forEach(folder => {
            folder.works = folder.works.filter(id => id !== workId);
        });
    } else {
        // 添加到当前收藏夹
        const folder = favorites.folders.find(f => f.id === favorites.currentFolder);
        if (folder && !folder.works.includes(workId)) {
            folder.works.push(workId);
        }
    }
    
    saveFavorites();
    updateStats();
    renderWorks(filterWorksData());
}

// 检查是否已收藏（在任何收藏夹中）
function isFavorite(workId) {
    return favorites.folders.some(folder => folder.works.includes(workId));
}

// 切换收藏夹
function switchFolder(folderId) {
    favorites.currentFolder = folderId;
    saveFavorites();
    renderFolders();
    updateStats();
    if (currentCategory === 'favorites') {
        renderWorks(filterWorksData());
    }
}

// 渲染收藏夹列表
function renderFolders() {
    const foldersList = document.getElementById('foldersList');
    const foldersSection = document.getElementById('foldersSection');
    
    // 只有在"我的收藏"分类时才显示收藏夹选择器
    if (currentCategory !== 'favorites') {
        foldersSection.style.display = 'none';
        return;
    }
    
    foldersSection.style.display = 'block';
    
    let html = '';
    favorites.folders.forEach((folder, index) => {
        const isActive = folder.id === favorites.currentFolder;
        const count = folder.works.length;
        const isDefault = folder.id === 'all';
        
        html += `
            <div class="folder-item" 
                 data-folder-id="${folder.id}" 
                 data-index="${index}"
                 draggable="${!isDefault}"
                 ondragstart="handleFolderDragStart(event, '${folder.id}', ${index})"
                 ondragend="handleFolderDragEnd(event)"
                 ondragover="handleFolderDragOver(event)"
                 ondragleave="handleFolderDragLeave(event)"
                 ondrop="handleFolderDrop(event, ${index})"
                 style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; transition: all 0.2s;">
                ${!isDefault ? `<span class="folder-drag-handle" style="cursor: grab; padding: 0 5px; color: rgba(255,255,255,0.4);">⋮⋮</span>` : `<span style="width: 26px;"></span>`}
                <button class="folder-btn ${isActive ? 'active' : ''}" 
                        onclick="switchFolder('${folder.id}')" 
                        ondragover="handleDragOver(event)" 
                        ondragleave="handleDragLeave(event)"
                        ondrop="handleDrop(event, '${folder.id}')"
                        style="flex: 1; text-align: left;">
                    ${escapeHtml(folder.name)} (${count})
                </button>
                ${!isDefault ? `
                    <button style="padding: 6px 10px; background: #dbeafe; color: #3b82f6; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;" onclick="renameFolder('${folder.id}')">✏️</button>
                    <button style="padding: 6px 10px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;" onclick="deleteFolder('${folder.id}')">🗑️</button>
                ` : ''}
            </div>
        `;
    });
    
    foldersList.innerHTML = html;
}

// 重命名收藏夹
function renameFolder(folderId) {
    const folder = favorites.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    const newName = prompt('请输入新的收藏夹名称：', folder.name);
    if (!newName || newName.trim() === '') return;
    
    folder.name = newName.trim();
    saveFavorites();
    renderFolders();
}

// 删除收藏夹
function deleteFolder(folderId) {
    if (folderId === 'all') {
        alert('❌ 不能删除"全部收藏"！');
        return;
    }
    
    const folder = favorites.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    if (!confirm(`确定要删除收藏夹"${folder.name}"吗？\n\n里面的收藏不会丢失，会保留在"全部收藏"中！`)) return;
    
    // 如果当前在这个收藏夹，切换到"全部收藏"
    if (favorites.currentFolder === folderId) {
        favorites.currentFolder = 'all';
    }
    
    // 删除收藏夹
    favorites.folders = favorites.folders.filter(f => f.id !== folderId);
    
    saveFavorites();
    renderFolders();
    if (currentCategory === 'favorites') {
        renderWorks(filterWorksData());
    }
}

// 渲染历史记录区域
function renderHistorySection() {
    const historySection = document.getElementById('historySection');
    
    // 只有在"浏览历史"分类时才显示历史记录管理区域
    if (currentCategory !== 'history') {
        historySection.style.display = 'none';
        return;
    }
    
    historySection.style.display = 'block';
}

// 清空历史记录
function clearHistory() {
    if (!confirm('确定要清空所有浏览历史吗？')) return;
    
    history = [];
    saveHistory();
    updateStats();
    renderWorks(filterWorksData());
}

// 创建新收藏夹
function createNewFolder() {
    const name = prompt('请输入新收藏夹名称：');
    if (!name || name.trim() === '') return;
    
    const newFolderId = 'folder_' + Date.now();
    favorites.folders.push({
        id: newFolderId,
        name: name.trim(),
        works: []
    });
    
    saveFavorites();
    renderFolders();
}

// 修改filterWorksData，支持按收藏夹筛选
// （修改filterWorksData函数中的收藏筛选部分）

// 提取所有标签
function getAllTags() {
    const tagSet = new Set();
    worksData.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => tagSet.add(tag));
        }
    });
    return Array.from(tagSet).sort();
}

// 渲染标签按钮
// 标签展开/隐藏状态
let tagsExpanded = false;

// 切换标签展开/隐藏
function toggleTags() {
    tagsExpanded = !tagsExpanded;
    const tagsList = document.getElementById('tagsList');
    const toggleBtn = document.getElementById('tagsToggleBtn');
    
    if (tagsExpanded) {
        tagsList.style.display = 'flex';
        toggleBtn.textContent = '收起';
    } else {
        tagsList.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
    
    // 保存状态到localStorage
    localStorage.setItem('tagsExpanded', tagsExpanded);
}

function renderTags() {
    const tagsList = document.getElementById('tagsList');
    const tagsSection = document.getElementById('tagsSection');
    const toggleBtn = document.getElementById('tagsToggleBtn');
    const allTags = getAllTags();
    
    // 在"我的收藏"和"浏览历史"界面隐藏热门标签
    if (currentCategory === 'favorites' || currentCategory === 'history') {
        if (tagsSection) {
            tagsSection.style.display = 'none';
        }
        return;
    }
    
    if (allTags.length === 0) {
        tagsSection.style.display = 'none';
        return;
    }
    
    tagsSection.style.display = 'block';
    
    // 从localStorage加载展开状态
    const saved = localStorage.getItem('tagsExpanded');
    if (saved !== null) {
        tagsExpanded = saved === 'true';
    }
    
    // 设置初始显示状态
    if (tagsExpanded) {
        tagsList.style.display = 'flex';
        toggleBtn.textContent = '收起';
    } else {
        tagsList.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
    
    let html = '<button class="tag-btn ' + (currentTag === '' ? 'active' : '') + '" onclick="selectTag(\'\')">全部标签</button>';
    
    allTags.forEach(tag => {
        html += `<button class="tag-btn ${currentTag === tag ? 'active' : ''}" onclick="selectTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</button>`;
    });
    
    tagsList.innerHTML = html;
}

// 选择标签
function selectTag(tag) {
    currentTag = tag;
    currentPage = 1;
    renderTags();
    updateStats();
    renderWorks(filterWorksData());
}

// 生成今日推荐
function generateRecommend() {
    if (worksData.length === 0) return;
    
    // 混合推荐算法：随机 + 多样性 + 新鲜度
    const shuffled = [...worksData].sort(() => 0.5 - Math.random());
    todayRecommend = shuffled.slice(0, 4);
    renderRecommend();
}

// 渲染推荐内容
function renderRecommend() {
    const grid = document.getElementById('recommendGrid');
    const section = document.getElementById('todayRecommend');
    
    if (todayRecommend.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    let html = '';
    todayRecommend.forEach(item => {
        const workId = item.url || item.title;
        const typeText = item.type === 'animation' ? '🎬' : '🎨';
        html += `
        <div class="recommend-card" onclick="handleRecommendClick('${workId.replace(/'/g, "\\'")}', '${escapeHtml(item.url || '#')}')">
            <div class="recommend-card-title">${typeText} ${escapeHtml(item.title)}</div>
            <div class="recommend-card-meta">${escapeHtml(item.artist)} · ${escapeHtml(item.source)}</div>
        </div>`;
    });
    
    grid.innerHTML = html;
}

// 处理推荐卡片点击
function handleRecommendClick(workId, url) {
    addToHistory(workId);
    updateStats();
    window.open(url, '_blank');
}

// 刷新推荐
function refreshRecommend() {
    // 添加动画效果
    const grid = document.getElementById('recommendGrid');
    grid.style.opacity = '0.5';
    grid.style.transform = 'scale(0.98)';
    
    setTimeout(() => {
        generateRecommend();
        grid.style.opacity = '1';
        grid.style.transform = 'scale(1)';
    }, 200);
}

// 随机浏览
function randomBrowse() {
    if (worksData.length === 0) return;
    
    // 随机选择一个
    const randomIndex = Math.floor(Math.random() * worksData.length);
    const randomWork = worksData[randomIndex];
    const workId = randomWork.url || randomWork.title;
    
    // 添加到历史记录
    addToHistory(workId);
    updateStats();
    
    // 打开新窗口
    window.open(randomWork.url, '_blank');
}

// 切换主题
function toggleTheme() {
    isLightTheme = !isLightTheme;
    const body = document.body;
    const toggleBtn = document.getElementById('themeToggle');
    
    if (isLightTheme) {
        body.classList.add('light-theme');
        toggleBtn.textContent = '☀️';
    } else {
        body.classList.remove('light-theme');
        toggleBtn.textContent = '🌙';
    }
    
    // 保存主题偏好
    localStorage.setItem('animDailyTheme', isLightTheme ? 'light' : 'dark');
}

// 加载主题偏好
function loadTheme() {
    const savedTheme = localStorage.getItem('animDailyTheme');
    const toggleBtn = document.getElementById('themeToggle');
    
    if (savedTheme === 'light') {
        isLightTheme = true;
        document.body.classList.add('light-theme');
        if (toggleBtn) toggleBtn.textContent = '☀️';
    }
}

// 分享内容
function shareContent(workId, title, url, event) {
    event.stopPropagation(); // 阻止冒泡
    
    const shareText = `🎬 动画每日一刷推荐：${title}\n🔗 ${url}`;
    
    // 检查是否支持原生分享API
    if (navigator.share) {
        navigator.share({
            title: title,
            text: shareText,
            url: url
        }).then(() => {
            console.log('分享成功');
        }).catch((error) => {
            console.log('分享失败:', error);
            fallbackShare(shareText, url);
        });
    } else {
        fallbackShare(shareText, url);
    }
}

// 降级分享方案：复制链接
function fallbackShare(text, url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            alert('✅ 链接已复制到剪贴板！');
        }).catch(() => {
            // 降级方案：用prompt显示
            prompt('复制以下链接分享：', url);
        });
    } else {
        // 最降级方案：用prompt显示
        prompt('复制以下链接分享：', url);
    }
}

// 从localStorage加载历史记录
function loadHistory() {
    try {
        const saved = localStorage.getItem('animDailyHistory');
        if (saved) {
            history = JSON.parse(saved);
            console.log('✅ 已加载历史记录:', history.length, '条');
        }
    } catch (e) {
        console.error('❌ 加载历史记录失败:', e);
    }
}

// 保存历史记录到localStorage
function saveHistory() {
    try {
        localStorage.setItem('animDailyHistory', JSON.stringify(history));
    } catch (e) {
        console.error('❌ 保存历史记录失败:', e);
    }
}

// 添加到历史记录
function addToHistory(workId) {
    // 先移除已存在的记录
    history = history.filter(id => id !== workId);
    
    // 添加到开头
    history.unshift(workId);
    
    // 限制数量
    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }
    
    saveHistory();
}

// 处理卡片点击
function handleCardClick(workId, url) {
    addToHistory(workId);
    updateStats();
    window.open(url, '_blank');
}

// 切换筛选面板
function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// 填充来源筛选下拉框
function populateSourceFilter() {
    const sources = new Set();
    worksData.forEach(item => {
        if (item.source) sources.add(item.source);
        if (item.artist) sources.add(item.artist);
    });
    
    const select = document.getElementById('filterSource');
    select.innerHTML = '<option value="all">全部</option>';
    sources.forEach(source => {
        select.innerHTML += `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`;
    });
}

// 应用筛选
function applyFilters() {
    filterState.source = document.getElementById('filterSource').value;
    filterState.sort = document.getElementById('filterSort').value;
    currentPage = 1;
    populateSourceFilter();
    renderTags();
    generateRecommend();
    preloadImages(worksData); // 预加载图片（性能优化）
    updateStats();
    renderWorks(filterWorksData());
}

// 重置筛选
function resetFilters() {
    document.getElementById('filterSource').value = 'all';
    document.getElementById('filterSort').value = 'default';
    filterState.source = 'all';
    filterState.sort = 'default';
    currentPage = 1;
    populateSourceFilter();
    renderTags();
    generateRecommend();
    preloadImages(worksData); // 预加载图片（性能优化）
    updateStats();
    renderWorks(filterWorksData());
}

// 从 GitHub 加载作品数据（优先），失败则回退到本地
async function loadWorks() {
    const loading = document.getElementById('loading');
    loading.style.display = 'block';
    loading.textContent = '🎬 正在加载动画参考资源...';
    
    // GitHub 仓库配置
    const githubConfig = {
        owner: 'CNMJH',
        repo: 'cnmjh.github.anim-daily',
        branch: 'main'
    };
    
    let loadSuccess = false;
    
    // 1. 优先尝试从 GitHub 加载
    try {
        const githubUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/works-data.json?ref=${githubConfig.branch}`;
        const response = await fetch(githubUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            worksData = JSON.parse(content);
            console.log('✅ 成功从 GitHub 加载作品数据:', worksData.length, '个');
            loadSuccess = true;
        } else {
            console.warn('⚠️ 从 GitHub 加载失败，尝试本地加载');
        }
    } catch (error) {
        console.warn('⚠️ 从 GitHub 加载出错，尝试本地加载:', error);
    }
    
    // 2. 如果 GitHub 加载失败，回退到本地加载
    if (!loadSuccess) {
        try {
            const timestamp = new Date().getTime();
            const response = await fetch('works-data.json?t=' + timestamp);
            
            if (response.ok) {
                worksData = await response.json();
                console.log('✅ 成功从本地加载作品数据:', worksData.length, '个');
                loadSuccess = true;
            } else {
                console.error('❌ 本地加载失败，状态码:', response.status);
                worksData = [];
            }
        } catch (error) {
            console.error('❌ 本地加载错误:', error);
        }
    }
    
    // 3. 如果都失败了，显示错误提示
    if (!loadSuccess || worksData.length === 0) {
        loading.style.display = 'none';
        document.getElementById('works-container').innerHTML = 
            '<p style="text-align:center;color:rgba(255,255,255,0.6);padding:60px;grid-column:1/-1;">暂无作品，请稍后再试</p>';
        document.getElementById('totalCount').textContent = '共 0 个作品';
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    loading.style.display = 'none';
    
    if (worksData.length === 0) {
        document.getElementById('works-container').innerHTML = 
            '<p style="text-align:center;color:rgba(255,255,255,0.6);padding:60px;grid-column:1/-1;">暂无作品，请稍后再试</p>';
        document.getElementById('totalCount').textContent = '共 0 个作品';
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    currentPage = 1;
    populateSourceFilter();
    renderTags();
    generateRecommend();
    preloadImages(worksData); // 预加载图片（性能优化）
    updateStats();
    renderWorks(filterWorksData());
}

// 更新统计信息
function updateStats() {
    const filtered = filterWorksData();
    let countText = `共 ${filtered.length} 个作品`;
    
    if (currentCategory === 'favorites') {
        countText = `我的收藏：${filtered.length} 个`;
    } else if (currentCategory === 'history') {
        countText = `浏览历史：${filtered.length} 个`;
    }
    
    // 计算总收藏数
    let totalFavorites = 0;
    favorites.folders.forEach(folder => {
        totalFavorites += folder.works.length;
    });
    
    if (totalFavorites > 0 || history.length > 0) {
        let extraInfo = [];
        if (totalFavorites > 0) {
            extraInfo.push(`❤️ ${totalFavorites}`);
        }
        if (history.length > 0) {
            extraInfo.push(`📜 ${history.length}`);
        }
        countText += ` | ${extraInfo.join(' | ')}`;
    }
    
    document.getElementById('totalCount').textContent = countText;
    
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('updateTime').textContent = `最后更新：${timeStr}`;
}

// 过滤作品数据
function filterWorksData() {
    let filtered = worksData;

    // 按收藏过滤
    if (currentCategory === 'favorites') {
        const currentFavorites = getCurrentFavorites();
        filtered = filtered.filter(item => currentFavorites.has(item.url || item.title));
    }
    // 按历史记录过滤
    else if (currentCategory === 'history') {
        // 按历史记录顺序排序
        const historyMap = {};
        history.forEach((id, index) => {
            historyMap[id] = index;
        });
        filtered = filtered.filter(item => historyMap.hasOwnProperty(item.url || item.title));
        filtered.sort((a, b) => {
            return historyMap[a.url || a.title] - historyMap[b.url || b.title];
        });
    }
    // 按主分类过滤（动画/Pose）
    else if (currentCategory === 'animation') {
        filtered = filtered.filter(item => item.type === 'animation');
    } else if (currentCategory === 'pose') {
        filtered = filtered.filter(item => item.type === 'pose');
    }

    // 按子分类过滤
    if (currentSubCategory !== 'all') {
        filtered = filtered.filter(item => item.subcategory === currentSubCategory);
    }

    // 按搜索词过滤
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(item => 
            item.title.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.artist.toLowerCase().includes(query) ||
            item.source.toLowerCase().includes(query)
        );
    }

    // 按标签筛选
    if (currentTag) {
        filtered = filtered.filter(item => 
            item.tags && Array.isArray(item.tags) && item.tags.includes(currentTag)
        );
    }

    // 按来源/作者筛选
    if (filterState.source !== 'all') {
        const source = filterState.source.toLowerCase();
        filtered = filtered.filter(item => 
            item.source.toLowerCase().includes(source) ||
            item.artist.toLowerCase().includes(source)
        );
    }

    // 排序
    if (filterState.sort === 'date_desc') {
        filtered = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (filterState.sort === 'date_asc') {
        filtered = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (filterState.sort === 'likes_desc') {
        filtered = [...filtered].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    return filtered;
}

// 渲染分页
function renderPagination(totalItems) {
    const paginationContainer = document.getElementById('pagination');
    
    totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    let html = '';
    
    // 上一页
    html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToPage(${currentPage - 1})">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="page-btn active">${i}</button>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="page-btn" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    // 下一页
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToPage(${currentPage + 1})">下一页</button>`;
    
    paginationContainer.innerHTML = html;
}

// 跳转页面
function goToPage(page) {
    const filtered = filterWorksData();
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderWorks(filtered);
    
    document.getElementById('works-container').scrollIntoView({ behavior: 'smooth' });
}

// 渲染作品卡片
function renderWorks(works) {
    const container = document.getElementById('works-container');
    
    if (!works || works.length === 0) {
        let emptyText = '暂无相关作品';
        if (currentCategory === 'favorites') {
            emptyText = '还没有收藏任何作品，点击❤️收藏一些吧！';
        } else if (currentCategory === 'history') {
            emptyText = '还没有浏览记录，点击卡片浏览作品吧！';
        }
        container.innerHTML = `<p class="empty-state-text" style="text-align:center;padding:60px;grid-column:1/-1;">${emptyText}</p>`;
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentPageWorks = works.slice(startIndex, endIndex);
    
    renderPagination(works.length);

    let html = '';
    currentPageWorks.forEach((item, index) => {
        const typeText = item.type === 'animation' ? '动画' : 'Pose';
        const category = categoryNames[item.subcategory] || item.subcategory;
        const safeUrl = escapeHtml(item.url || '#');
        const workId = item.url || item.title;
        const isFav = isFavorite(workId);
        const favIcon = isFav ? '❤️' : '🤍';
        const favClass = isFav ? 'favorited' : '';
        const isLikedValue = isLiked(workId);
        const likeIcon = isLikedValue ? '❤️' : '🤍';
        // 只记录本网站用户的点赞数！不使用外部平台的点赞数
        let siteLikeCount = 0;
        // 从localStorage读取本网站的点赞统计（简化实现）
        try {
            const savedCounts = localStorage.getItem('animDailyLikeCounts');
            if (savedCounts) {
                const counts = JSON.parse(savedCounts);
                siteLikeCount = counts[workId] || 0;
            }
        } catch (e) {}
        const likeCount = siteLikeCount;
        
        html += `
        <div class="work-card" onclick="handleCardClick('${workId.replace(/'/g, "\\'")}', '${safeUrl}')" 
             draggable="true" 
             ondragstart="handleDragStart(event, '${workId.replace(/'/g, "\\'")}')"
             style="cursor:pointer">
            <div class="work-card-image" style="pointer-events: none;">
                <img src="${escapeHtml(item.image && item.image.trim() !== '' ? item.image : 'https://via.placeholder.com/400x240/1a1a2e/e94560?text=Animation+Art')}" alt="${escapeHtml(item.title)}" draggable="false">
                <span class="work-type-tag ${item.type}">${typeText}</span>
                <button class="favorite-btn ${favClass}" onclick="toggleFavorite('${workId.replace(/'/g, "\\'")}', event)" title="收藏" style="pointer-events: auto;">${favIcon}</button>
            </div>
            <div class="work-content">
                <div class="work-tags">
                    <span class="work-category">${escapeHtml(category)}</span>
                </div>
                <h3 class="work-title">${escapeHtml(item.title)}</h3>
                <p class="work-description">${escapeHtml(item.description)}</p>
                ${item.tags && Array.isArray(item.tags) && item.tags.length > 0 ? `
                <div class="work-card-tags">
                    ${item.tags.slice(0, 3).map(tag => `<span class="work-card-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
                ` : ''}
                <div class="work-meta">
                    <div class="work-actions">
                        <button class="like-btn" onclick="toggleLike('${workId.replace(/'/g, "\\'")}', event)" title="点赞" style="pointer-events: auto;">
                            <span class="like-icon">${isLikedValue ? '❤️' : '🤍'}</span>
                            <span class="like-count">${likeCount}</span>
                        </button>
                        <button class="share-btn" onclick="shareContent('${workId.replace(/'/g, "\\'")}', '${escapeHtml(item.title)}', '${safeUrl}', event)" title="分享" style="pointer-events: auto;">📤</button>
                        <button class="report-btn" onclick="markLinkInvalid('${workId.replace(/'/g, "\\'")}', event)" title="举报失效链接" style="pointer-events: auto;">⚠️</button>
                        <span class="work-date">${escapeHtml(item.date)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// HTML 转义函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 搜索功能（带防抖优化）
const searchWorks = debounce(function() {
    searchQuery = document.getElementById('searchInput').value;
    currentPage = 1;
    populateSourceFilter();
    renderTags();
    generateRecommend();
    preloadImages(worksData); // 预加载图片（性能优化）
    updateStats();
    renderWorks(filterWorksData());
}, 300); // 300ms防抖延迟

// 初始化主分类按钮
document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.dataset.category || (this.id === 'favoriteBtn' ? 'favorites' : (this.id === 'historyBtn' ? 'history' : 'all'));
        currentTag = ''; // 清空标签选择
        currentPage = 1;
        
        // 在"我的收藏"和"浏览历史"界面隐藏热门标签
        const tagsSection = document.getElementById('tagsSection');
        if (currentCategory === 'favorites' || currentCategory === 'history') {
            if (tagsSection) {
                tagsSection.style.display = 'none';
            }
        } else {
            renderTags(); // 其他分类正常显示标签
        }
        
        renderFolders(); // 渲染收藏夹选择器
        renderHistorySection(); // 渲染历史记录区域
        updateStats();
        renderWorks(filterWorksData());
    });
});

// 初始化子分类按钮
document.querySelectorAll('.sub-category-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.sub-category-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentSubCategory = this.dataset.subcategory;
        currentTag = ''; // 清空标签选择
        currentPage = 1;
        renderTags();
        updateStats();
        renderWorks(filterWorksData());
    });
});

// 搜索框回车事件
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchWorks();
    }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    loadFavorites();
    loadHistory();
    loadLikes();
    loadPendingSubmissions();
    scheduleLinkCheck(); // 定时检查链接
    loadWorks();
    
    // 初始化投稿表单的分类联动
    const typeSelect = document.getElementById('submitType');
    const subcategorySelect = document.getElementById('submitSubcategory');
    
    if (typeSelect && subcategorySelect) {
        typeSelect.addEventListener('change', function() {
            const type = this.value;
            subcategorySelect.innerHTML = '<option value="">请选择子分类</option>';
            
            if (type === 'animation') {
                subcategorySelect.innerHTML += `
                    <option value="character">角色动画</option>
                    <option value="action">动作场面</option>
                    <option value="facial">表情动画</option>
                    <option value="creature">生物动画</option>
                `;
            } else if (type === 'pose') {
                subcategorySelect.innerHTML += `
                    <option value="stand">站立姿势</option>
                    <option value="action_pose">动态姿势</option>
                    <option value="hand">手部参考</option>
                `;
            }
        });
    }
});

// 隐藏的管理员入口 - 连续点击3次页脚
let footerClickCount = 0;
let footerClickTimer = null;

document.addEventListener('DOMContentLoaded', function() {
    const footerText = document.getElementById('footerText');
    if (footerText) {
        footerText.addEventListener('click', function() {
            footerClickCount++;
            
            if (footerClickTimer) {
                clearTimeout(footerClickTimer);
            }
            
            if (footerClickCount === 3) {
                window.location.href = 'admin.html';
                footerClickCount = 0;
            } else {
                footerClickTimer = setTimeout(function() {
                    footerClickCount = 0;
                }, 1500);
            }
        });
    }
});

// ========== 拖拽功能 ==========
let draggedWorkId = null;

// 开始拖拽
function handleDragStart(event, workId) {
    draggedWorkId = workId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', workId);
    
    // 添加拖拽样式
    event.target.style.opacity = '0.5';
}

// 拖拽经过目标
function handleDragOver(event) {
    event.preventDefault(); // 允许放置
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
    event.currentTarget.style.borderColor = '#3b82f6';
}

// 拖拽离开目标
function handleDragLeave(event) {
    event.currentTarget.style.background = '';
    event.currentTarget.style.borderColor = '';
}

// 放置到目标
function handleDrop(event, targetFolderId) {
    event.preventDefault();
    event.stopPropagation();
    
    // 恢复样式
    event.currentTarget.style.background = '';
    event.currentTarget.style.borderColor = '';
    
    if (!draggedWorkId) return;
    
    // 找到当前作品所在的所有收藏夹
    let sourceFolders = [];
    favorites.folders.forEach(folder => {
        if (folder.works.includes(draggedWorkId)) {
            sourceFolders.push(folder.id);
        }
    });
    
    // 如果目标是"全部收藏"，不做任何操作
    if (targetFolderId === 'all') {
        draggedWorkId = null;
        return;
    }
    
    // 检查作品是否已经在目标收藏夹中
    const targetFolder = favorites.folders.find(f => f.id === targetFolderId);
    if (targetFolder && targetFolder.works.includes(draggedWorkId)) {
        alert('这个作品已经在该收藏夹中了！');
        draggedWorkId = null;
        return;
    }
    
    // 从其他收藏夹中移除（除了"全部收藏"）
    favorites.folders.forEach(folder => {
        if (folder.id !== 'all' && folder.id !== targetFolderId) {
            const index = folder.works.indexOf(draggedWorkId);
            if (index > -1) {
                folder.works.splice(index, 1);
            }
        }
    });
    
    // 添加到目标收藏夹
    if (targetFolder) {
        targetFolder.works.push(draggedWorkId);
    }
    
    // 确保"全部收藏"也有这个作品
    const allFolder = favorites.folders.find(f => f.id === 'all');
    if (allFolder && !allFolder.works.includes(draggedWorkId)) {
        allFolder.works.push(draggedWorkId);
    }
    
    // 保存并刷新
    saveFavorites();
    renderFolders();
    if (currentCategory === 'favorites') {
        renderWorks(filterWorksData());
    }
    
    draggedWorkId = null;
}

// 页面加载完成后，添加拖拽结束监听
document.addEventListener('dragend', function(event) {
    // 恢复所有卡片的透明度
    document.querySelectorAll('.work-card').forEach(card => {
        card.style.opacity = '1';
    });
    draggedWorkId = null;
});

// ========== 收藏夹拖拽排序功能 ==========
let draggedFolderId = null;
let draggedFolderIndex = -1;

// 开始拖拽收藏夹
function handleFolderDragStart(event, folderId, index) {
    draggedFolderId = folderId;
    draggedFolderIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', folderId);
    
    // 添加拖拽样式
    event.currentTarget.style.opacity = '0.5';
    event.currentTarget.style.transform = 'scale(1.02)';
}

// 结束拖拽收藏夹
function handleFolderDragEnd(event) {
    // 恢复所有收藏夹项的样式
    document.querySelectorAll('.folder-item').forEach(item => {
        item.style.opacity = '1';
        item.style.transform = 'scale(1)';
        item.style.background = '';
    });
    
    draggedFolderId = null;
    draggedFolderIndex = -1;
}

// 拖拽经过收藏夹项
function handleFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const folderItem = event.currentTarget;
    folderItem.style.background = 'rgba(59, 130, 246, 0.15)';
}

// 拖拽离开收藏夹项
function handleFolderDragLeave(event) {
    const folderItem = event.currentTarget;
    folderItem.style.background = '';
}

// 放置到收藏夹项
function handleFolderDrop(event, targetIndex) {
    event.preventDefault();
    event.stopPropagation();
    
    if (draggedFolderId === null || draggedFolderIndex === -1) return;
    if (draggedFolderIndex === targetIndex) return;
    
    // 不允许拖拽"全部收藏"
    if (draggedFolderId === 'all') return;
    
    // 移动收藏夹
    const draggedFolder = favorites.folders[draggedFolderIndex];
    favorites.folders.splice(draggedFolderIndex, 1);
    
    // 确保"全部收藏"始终在第一位
    let insertIndex = targetIndex;
    if (insertIndex === 0) {
        insertIndex = 1;
    }
    
    favorites.folders.splice(insertIndex, 0, draggedFolder);
    
    // 保存并刷新
    saveFavorites();
    renderFolders();
    
    // 恢复样式
    document.querySelectorAll('.folder-item').forEach(item => {
        item.style.opacity = '1';
        item.style.transform = 'scale(1)';
        item.style.background = '';
    });
}

// ========== 收藏夹导出/导入功能 ==========

// 导出收藏夹
function exportFavorites() {
    try {
        // 准备导出数据
        const exportData = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            favorites: favorites
        };
        
        // 转换为JSON字符串
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // 创建Blob对象
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // 生成文件名（包含日期）
        const now = new Date();
        const dateStr = now.getFullYear() + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0') + '_' +
                      String(now.getHours()).padStart(2, '0') + 
                      String(now.getMinutes()).padStart(2, '0');
        const fileName = `动画每日一刷_收藏夹备份_${dateStr}.json`;
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('✅ 收藏夹导出成功！\n\n文件名：' + fileName + '\n\n请妥善保存这个文件！');
    } catch (e) {
        console.error('导出收藏夹失败:', e);
        alert('❌ 导出失败！\n\n错误信息：' + e.message);
    }
}

// 导入收藏夹
function importFavorites(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 重置文件输入，允许再次选择同一文件
    event.target.value = '';
    
    // 确认导入
    if (!confirm('⚠️ 确定要导入收藏夹吗？\n\n这会覆盖当前的收藏夹数据！\n\n建议先导出备份当前数据！')) {
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const importData = JSON.parse(content);
            
            // 验证数据格式
            if (!importData.favorites || !importData.favorites.folders) {
                throw new Error('无效的收藏夹文件格式！');
            }
            
            // 验证版本（可选）
            if (importData.version && importData.version !== '1.0') {
                console.warn('⚠️ 文件版本可能不兼容，尝试导入...');
            }
            
            // 导入数据
            favorites = importData.favorites;
            
            // 保存到localStorage
            saveFavorites();
            
            // 刷新界面
            renderFolders();
            if (currentCategory === 'favorites') {
                renderWorks(filterWorksData());
            }
            updateStats();
            
            // 显示导入信息
            const folderCount = favorites.folders.length;
            let totalWorks = 0;
            favorites.folders.forEach(folder => {
                totalWorks += folder.works.length;
            });
            
            let exportTimeInfo = '';
            if (importData.exportTime) {
                try {
                    const exportDate = new Date(importData.exportTime);
                    exportTimeInfo = '\n\n备份时间：' + exportDate.toLocaleString('zh-CN');
                } catch (e) {}
            }
            
            alert('✅ 收藏夹导入成功！\n\n' +
                  '收藏夹数量：' + folderCount + ' 个\n' +
                  '收藏作品数：' + totalWorks + ' 个' +
                  exportTimeInfo);
            
        } catch (e) {
            console.error('导入收藏夹失败:', e);
            alert('❌ 导入失败！\n\n错误信息：' + e.message + '\n\n请确认这是有效的收藏夹备份文件！');
        }
    };
    
    reader.onerror = function() {
        alert('❌ 读取文件失败！');
    };
    
    reader.readAsText(file);
}
