/**
 * 博客模块 - 支持分类和密码保护
 * 处理本地博客文章的加载和展示
 */

import { renderMarkdown } from '@shared/markdown/renderer.js';

/**
 * 私密日记类目的访问密钥(sha256 哈希常量)。
 * 旧版以明文形式存储,这里改为 sha256 比对,避免源码里直接出现密钥字面量。
 * 注:纯前端 hash 不提供真正的安全性,只是消除最显眼的暴露面。
 */
const DIARY_PASSWORD_HASH = '1715b700055d61088c46bc151f2ba08c7f569c808afc526bd85eb71c8d227259';

// 博客状态
const blogState = {
    posts: [],
    categories: {},
    currentPost: null,
    currentCategory: 'all', // 当前筛选的分类
    authenticated: false,    // 是否已通过密码验证
    clockTimer: null         // 时钟定时器
};

/**
 * 计算输入字符串的 sha256 十六进制摘要
 */
async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Markdown 渲染由 @shared/markdown/renderer 统一负责,无需在此动态加载脚本。
 */
async function initMarkdown() {
    /* no-op:保留函数签名以避免上游调用点改动过多 */
}

/**
 * 检查密码验证状态
 */
function isAuthenticated() {
    // 从sessionStorage检查（关闭浏览器后失效）
    return sessionStorage.getItem('blog_authenticated') === 'true';
}

/**
 * 验证密码:对输入做 sha256,与常量哈希比对。
 */
async function verifyPassword(password) {
    const hash = await sha256Hex(password);
    if (hash === DIARY_PASSWORD_HASH) {
        sessionStorage.setItem('blog_authenticated', 'true');
        return true;
    }
    return false;
}

/**
 * 加载博客文章列表
 */
async function loadBlogPosts() {
    console.log('Blog: loadBlogPosts 被调用');
    const issuesList = document.getElementById('issues-list');
    if (!issuesList) {
        console.error('Blog: issues-list 元素未找到');
        return;
    }

    issuesList.innerHTML = '<div class="loading">加载博客文章中...</div>';

    try {
        console.log('Blog: 开始加载 blog/posts.json');
        const response = await fetch(`${import.meta.env.BASE_URL}blog/posts.json`);

        if (!response.ok) {
            throw new Error(`加载失败: ${response.status}`);
        }

        const data = await response.json();
        console.log('Blog: 成功加载文章数据', data);

        blogState.posts = data.posts || [];
        blogState.categories = data.categories || {};

        if (blogState.posts.length === 0) {
            renderNoPosts();
        } else {
            renderCategoryFilter();
            renderBlogList();
        }
    } catch (error) {
        console.error('加载博客文章失败:', error);
        issuesList.innerHTML = `
            <div class="error-message">
                <p>加载失败: ${error.message}</p>
                <button onclick="location.reload()">重试</button>
            </div>
        `;
    }
}

/**
 * 渲染分类筛选器
 */
function renderCategoryFilter() {
    const issuesList = document.getElementById('issues-list');

    // 计算"全部"分类的文章数（排除日志）
    const allPostsCount = blogState.posts.filter(p => p.category !== 'diary').length;

    const filterHTML = `
        <div class="blog-category-filter">
            <button class="category-btn ${blogState.currentCategory === 'all' ? 'active' : ''}"
                    data-category="all">
                📚 览胜 (${allPostsCount})
            </button>
            ${Object.entries(blogState.categories).map(([key, config]) => {
                const count = blogState.posts.filter(p => p.category === key).length;
                return `
                    <button class="category-btn ${blogState.currentCategory === key ? 'active' : ''}"
                            data-category="${key}">
                        ${config.icon} ${config.name} (${count})
                    </button>
                `;
            }).join('')}
        </div>
        <div id="blog-posts-container"></div>
    `;

    issuesList.innerHTML = filterHTML;

    // 绑定筛选事件
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;

            // 日志分类需要密码验证
            // 每次点击都清除认证状态，要求重新输入密码
            if (category === 'diary') {
                // 清除认证状态
                sessionStorage.removeItem('blog_authenticated');
                blogState.authenticated = false;

                // 显示密码提示
                showCategoryPasswordPrompt();
                return;
            }

            blogState.currentCategory = category;
            renderBlogList();
        });
    });
}

/**
 * 加载单篇博客文章
 */
async function loadBlogPost(postId) {
    const issuesList = document.getElementById('issues-list');
    if (!issuesList) return;

    issuesList.innerHTML = '<div class="loading">加载文章中...</div>';

    try {
        // 查找文章信息
        const post = blogState.posts.find(p => p.id === postId);
        if (!post) {
            throw new Error('文章不存在');
        }

        // 检查是否需要密码
        if (post.protected && !isAuthenticated()) {
            showPasswordPrompt(postId);
            return;
        }

        // 加载Markdown文件
        const response = await fetch(`../${post.file}`);
        if (!response.ok) {
            throw new Error(`加载失败: ${response.status}`);
        }

        const markdown = await response.text();
        blogState.currentPost = { ...post, content: markdown };

        // 渲染文章详情
        await renderBlogPost();
    } catch (error) {
        console.error('加载文章失败:', error);
        issuesList.innerHTML = `
            <div class="error-message">
                <p>加载失败: ${error.message}</p>
                <button onclick="window.blogModule.backToList()">返回列表</button>
            </div>
        `;
    }
}

/**
 * 显示分类级别密码输入提示
 */
function showCategoryPasswordPrompt() {
    const issuesList = document.getElementById('issues-list');

    issuesList.innerHTML = `
        <div class="password-prompt">
            <div class="password-card">
                <div class="password-icon">🗝️</div>
                <h2>寻找心门的钥匙</h2>
                <p>这里藏着只属于时光的私语</p>
                <p class="post-title">您正在尝试进入：${blogState.categories.diary.icon} ${blogState.categories.diary.name}</p>
                <form id="password-form" class="password-form">
                    <input type="password"
                           id="password-input"
                           placeholder="请输入那串只有你知道的密语"
                           class="password-input"
                           autofocus>
                    <div class="password-actions">
                        <button type="submit" class="primary-button">开启</button>
                        <button type="button"
                                class="secondary-button"
                                onclick="window.blogModule.backToList()">离开</button>
                    </div>
                    <div id="password-error" class="password-error"></div>
                </form>
            </div>
        </div>
    `;

    // 绑定表单提交
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password-input').value;
        const errorEl = document.getElementById('password-error');

        if (await verifyPassword(password)) {
            blogState.authenticated = true;
            blogState.currentCategory = 'diary';
            renderCategoryFilter();
            renderBlogList();
        } else {
            errorEl.textContent = '钥匙似乎不对，再试试看？';
            document.getElementById('password-input').value = '';
            document.getElementById('password-input').focus();
        }
    });
}

/**
 * 显示密码输入提示（单篇文章）
 */
function showPasswordPrompt(postId) {
    const issuesList = document.getElementById('issues-list');
    const post = blogState.posts.find(p => p.id === postId);

    issuesList.innerHTML = `
        <div class="password-prompt">
            <div class="password-card">
                <div class="password-icon">🗝️</div>
                <h2>心门上了锁</h2>
                <p>这篇私语需要钥匙才能开启</p>
                <p class="post-title">${escapeHtml(post.title)}</p>
                <form id="password-form" class="password-form">
                    <input type="password"
                           id="password-input"
                           placeholder="请输入那串只有你知道的密语"
                           class="password-input"
                           autofocus>
                    <div class="password-actions">
                        <button type="submit" class="primary-button">开启</button>
                        <button type="button"
                                class="secondary-button"
                                onclick="window.blogModule.backToList()">离开</button>
                    </div>
                    <div id="password-error" class="password-error"></div>
                </form>
            </div>
        </div>
    `;

    // 绑定表单提交
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password-input').value;
        const errorEl = document.getElementById('password-error');

        if (await verifyPassword(password)) {
            loadBlogPost(postId);
        } else {
            errorEl.textContent = '钥匙似乎不对，再试试看？';
            document.getElementById('password-input').value = '';
            document.getElementById('password-input').focus();
        }
    });
}

/**
 * 渲染博客文章详情
 */
async function renderBlogPost() {
    const issuesList = document.getElementById('issues-list');
    if (!issuesList || !blogState.currentPost) return;

    await initMarkdown();

    const post = blogState.currentPost;
    const htmlContent = renderMarkdown(post.content);

    const formattedDate = new Date(post.date).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const categoryTags = post.tags
        .map(tag => `<span class="blog-tag">#${tag}</span>`)
        .join('');

    // 如果是日志，渲染任务列表
    let taskListHTML = '';
    if (post.tasks && Array.isArray(post.tasks) && post.tasks.length > 0) {
        const stats = post.taskStats;
        const progressColor = stats.progress === 100 ? '#4CAF50' :
                             stats.progress > 0 ? '#FFC107' : '#9E9E9E';

        taskListHTML = `
            <div class="diary-task-list">
                <h3 class="task-list-title">任务清单</h3>
                <div class="task-progress-detail">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill"
                             style="width: ${stats.progress}%; background-color: ${progressColor};">
                        </div>
                    </div>
                    <div class="progress-info">
                        <span>完成进度: ${stats.progress}%</span>
                        <span>(${stats.completed}/${stats.total})</span>
                    </div>
                </div>
                <ul class="task-items">
                    ${post.tasks.map(task => `
                        <li class="task-item ${task.completed ? 'completed' : ''}">
                            <span class="task-checkbox ${task.completed ? 'checked' : ''}">
                                ${task.completed ? '✓' : ''}
                            </span>
                            <span class="task-text">${escapeHtml(task.text)}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    issuesList.innerHTML = `
        <div class="blog-detail">
            <div class="blog-detail-header">
                <button class="back-button" onclick="window.blogModule.backToList()">
                    ← 返回列表
                </button>
                <div class="category-badge">
                    ${post.categoryIcon} ${post.categoryName}
                    ${post.protected ? ' 🔒' : ''}
                </div>
                <h1 class="blog-detail-title">${escapeHtml(post.title)}</h1>
                <div class="blog-detail-meta">
                    <span class="blog-author">✍️ ${escapeHtml(post.author)}</span>
                    <span class="blog-date">📅 ${formattedDate}</span>
                    <span class="blog-reading-time">⏱️ ${post.readingTime} 分钟</span>
                </div>
                ${categoryTags ? `<div class="blog-tags">${categoryTags}</div>` : ''}
            </div>

            ${taskListHTML}

            <div class="blog-detail-content markdown-body">
                ${htmlContent}
            </div>
        </div>
    `;

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 返回文章列表
 */
function backToList() {
    blogState.currentPost = null;
    renderCategoryFilter();
    renderBlogList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 启动实时时钟
 */
function startClock() {
    // 先停止可能存在的旧时钟
    stopClock();

    // 更新时间的函数
    function updateTime() {
        const now = new Date();
        const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const weekDay = weekDays[now.getDay()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const timeString = `${year}年${month}月${date}日 ${weekDay} ${hours}:${minutes}:${seconds}`;

        const timeEl = document.getElementById('current-time');
        if (timeEl) {
            timeEl.textContent = timeString;
        }
    }

    // 立即更新一次
    updateTime();

    // 每秒更新
    blogState.clockTimer = setInterval(updateTime, 1000);
}

/**
 * 停止实时时钟
 */
function stopClock() {
    if (blogState.clockTimer) {
        clearInterval(blogState.clockTimer);
        blogState.clockTimer = null;
    }
}

/**
 * 渲染无文章提示
 */
function renderNoPosts() {
    const container = document.getElementById('blog-posts-container') ||
                     document.getElementById('issues-list');

    container.innerHTML = `
        <div class="blog-empty">
            <div class="empty-icon">🌙</div>
            <h3>此处暂无文字</h3>
            <p>或许，有些故事还在路上，静候时光将它们写下</p>
        </div>
    `;
}

/**
 * 渲染博客列表
 */
function renderBlogList() {
    const container = document.getElementById('blog-posts-container') ||
                     document.getElementById('issues-list');

    // 筛选文章
    let filteredPosts = blogState.posts;
    if (blogState.currentCategory !== 'all') {
        filteredPosts = blogState.posts.filter(p => p.category === blogState.currentCategory);
    } else {
        // "全部"分类中排除日志（日志是私密的）
        filteredPosts = blogState.posts.filter(p => p.category !== 'diary');
    }

    if (filteredPosts.length === 0) {
        container.innerHTML = `
            <div class="blog-empty">
                <p>此处空空如也，等待文字的到来</p>
            </div>
        `;
        return;
    }

    // 更新筛选按钮状态
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === blogState.currentCategory);
    });

    // 如果是日志分类，显示实时时钟
    let clockHTML = '';
    if (blogState.currentCategory === 'diary') {
        clockHTML = `
            <div class="diary-clock">
                <div class="clock-icon">⏰</div>
                <div id="current-time" class="clock-time"></div>
            </div>
        `;
        // 启动时钟
        startClock();
    } else {
        // 停止时钟
        stopClock();
    }

    const blogCards = filteredPosts.map(post => createBlogCard(post)).join('');

    container.innerHTML = `
        ${clockHTML}
        <div class="blog-grid">
            ${blogCards}
        </div>
    `;

    // 绑定点击事件
    bindBlogCardEvents();
}

/**
 * 创建博客卡片HTML
 */
function createBlogCard(post) {
    const formattedDate = new Date(post.date).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const categoryLabel = `${post.categoryIcon} ${post.categoryName}`;
    const protectedIcon = post.protected ? ' 🔒' : '';

    // 日志分类特殊渲染：显示任务统计
    if (post.category === 'diary' && post.taskStats) {
        const stats = post.taskStats;
        const progressColor = stats.progress === 100 ? '#4CAF50' :
                             stats.progress > 0 ? '#FFC107' : '#9E9E9E';

        return `
            <article class="blog-card diary-card ${post.protected ? 'protected' : ''}"
                     data-post-id="${post.id}"
                     data-progress="${stats.progress}">
                <div class="blog-card-header">
                    <div class="blog-card-category">${categoryLabel}${protectedIcon}</div>
                    <h3 class="blog-title">${escapeHtml(post.title)}</h3>
                </div>

                <div class="diary-task-summary">
                    <div class="task-stats">
                        <span class="stat-item">
                            <span class="stat-icon">✅</span>
                            <span class="stat-text">已完成: ${stats.completed}</span>
                        </span>
                        <span class="stat-item">
                            <span class="stat-icon">⏳</span>
                            <span class="stat-text">进行中: ${stats.pending}</span>
                        </span>
                        <span class="stat-item">
                            <span class="stat-icon">📊</span>
                            <span class="stat-text">总计: ${stats.total}</span>
                        </span>
                    </div>
                    <div class="task-progress">
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill"
                                 style="width: ${stats.progress}%; background-color: ${progressColor};">
                            </div>
                        </div>
                        <span class="progress-text">${stats.progress}%</span>
                    </div>
                </div>

                <div class="blog-meta">
                    <span class="blog-date">📅 ${formattedDate}</span>
                </div>
            </article>
        `;
    }

    // 普通博客卡片渲染
    return `
        <article class="blog-card ${post.protected ? 'protected' : ''}" data-post-id="${post.id}">
            <div class="blog-card-header">
                <div class="blog-card-category">${categoryLabel}${protectedIcon}</div>
                <h3 class="blog-title">${escapeHtml(post.title)}</h3>
            </div>
            <div class="blog-excerpt">
                ${escapeHtml(post.excerpt)}
            </div>
            <div class="blog-meta">
                <span class="blog-date">📅 ${formattedDate}</span>
                <span class="blog-reading-time">⏱️ ${post.readingTime} 分钟</span>
            </div>
        </article>
    `;
}

/**
 * 绑定博客卡片点击事件
 */
function bindBlogCardEvents() {
    const blogCards = document.querySelectorAll('.blog-card');
    blogCards.forEach(card => {
        card.addEventListener('click', () => {
            const postId = card.dataset.postId;
            loadBlogPost(postId);
        });
    });
}

/**
 * HTML转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 导出模块
const blogModule = {
    loadBlogPosts,
    loadBlogPost,
    backToList
};

window.blogModule = blogModule;

export default blogModule;
