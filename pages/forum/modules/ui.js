/**
 * UI控制模块
 * 负责所有DOM操作和视图切换
 */

// DOM元素引用（初始化时设置）
let elements = {};

/**
 * 初始化UI模块，缓存DOM元素
 */
export function initUI() {
    elements = {
        authContainer: document.getElementById('auth-container'),
        forumContainer: document.getElementById('forum-container'),
        issueDetail: document.getElementById('issue-detail'),
        loginForm: document.getElementById('login-form'),
        loginMessage: document.getElementById('login-message'),
        userInfo: document.getElementById('user-info'),
        userName: document.getElementById('user-name'),
        userAvatar: document.getElementById('user-avatar'),

        issuesList: document.getElementById('issues-list'),
        pagination: document.getElementById('pagination'),

        detailTitle: document.getElementById('detail-title'),
        detailAuthor: document.getElementById('detail-author'),
        detailDate: document.getElementById('detail-date'),
        detailLabel: document.getElementById('detail-label'),
        detailBody: document.getElementById('detail-body'),
        commentsList: document.getElementById('comments-list'),
        commentsCount: document.getElementById('comments-count'),

        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content')
    };
}

/**
 * 显示登录表单
 */
export function showLoginForm() {
    if (!elements.authContainer) return;

    elements.authContainer.style.display = 'block';
    elements.forumContainer.style.display = 'none';
    elements.issueDetail.style.display = 'none';
    elements.userInfo.style.display = 'none';

    // 清除登录表单
    if (elements.loginForm) elements.loginForm.reset();
    if (elements.loginMessage) {
        elements.loginMessage.innerHTML = '';
        elements.loginMessage.className = 'auth-message';
    }
}

/**
 * 显示论坛内容
 */
export function showForumContent(userData = null) {
    if (!elements.authContainer) return;

    elements.authContainer.style.display = 'none';
    elements.forumContainer.style.display = 'block';
    elements.issueDetail.style.display = 'none';

    // 显示用户信息
    if (userData) {
        if (elements.userName) {
            elements.userName.textContent = userData.username;
        }
        if (elements.userAvatar && userData.avatar_url) {
            elements.userAvatar.style.backgroundImage = `url(${userData.avatar_url})`;
        }
    }

    // 显示用户信息区域
    if (elements.userInfo) {
        elements.userInfo.style.display = 'flex';
    }

    // 显示管理员标识（如果需要）
    const adminBadge = document.getElementById('admin-badge');
    if (adminBadge && userData && userData.isAdmin) {
        adminBadge.style.display = 'inline-block';
    } else if (adminBadge) {
        adminBadge.style.display = 'none';
    }
}

/**
 * 显示匿名博客内容（博客模式允许匿名访问）
 */
export function showAnonymousBlogContent() {
    console.log('UI: showAnonymousBlogContent 被调用');
    console.log('authContainer:', elements.authContainer);
    console.log('forumContainer:', elements.forumContainer);

    if (!elements.authContainer) return;

    // 隐藏登录表单
    elements.authContainer.style.display = 'none';
    // 显示论坛容器（用于显示博客）
    elements.forumContainer.style.display = 'block';
    elements.issueDetail.style.display = 'none';

    // 隐藏用户信息区域（匿名访问）
    if (elements.userInfo) {
        elements.userInfo.style.display = 'none';
    }

    // 隐藏管理员标识
    const adminBadge = document.getElementById('admin-badge');
    if (adminBadge) {
        adminBadge.style.display = 'none';
    }

    // 隐藏所有论坛UI元素（tab系统、搜索过滤器）
    const forumTabs = document.querySelector('.forum-tabs');
    const forumFilters = document.querySelector('.forum-filters');
    if (forumTabs) forumTabs.style.display = 'none';
    if (forumFilters) forumFilters.style.display = 'none';

    console.log('UI: 博客模式UI已设置完成');
}

/**
 * 显示Issue详情页
 */
export function showIssueDetail() {
    if (!elements.authContainer) return;

    elements.authContainer.style.display = 'none';
    elements.forumContainer.style.display = 'none';
    elements.issueDetail.style.display = 'block';
}

/**
 * 返回列表
 */
export function backToList() {
    showForumContent();
}

/**
 * 显示标签页内容
 */
export function showTab(tabId) {
    // 更新按钮状态
    elements.tabButtons.forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // 更新内容状态
    elements.tabContents.forEach(content => {
        if (content.id === `${tabId}-tab`) {
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    });
}

/**
 * 显示消息
 */
export function showMessage(element, message, type) {
    if (!element) return;

    element.textContent = message;
    element.className = 'auth-message';
    if (type) {
        element.classList.add(type);
    }
}

/**
 * 显示速率限制警告
 */
export function showRateLimitWarning(message, type = 'error') {
    const container = elements.forumContainer || document.body;

    // 移除现有警告
    const existingWarning = container.querySelector('.rate-limit-warning');
    if (existingWarning) {
        existingWarning.remove();
    }

    // 创建新警告
    const warning = document.createElement('div');
    warning.className = 'rate-limit-warning';

    if (type === 'success') {
        warning.style.backgroundColor = '#e8f5e9';
        warning.style.borderColor = '#a5d6a7';
        warning.style.color = '#2e7d32';
    } else {
        warning.style.backgroundColor = '#ffebee';
        warning.style.borderColor = '#ef9a9a';
        warning.style.color = '#c62828';
    }

    warning.style.padding = '10px';
    warning.style.margin = '10px 0';
    warning.style.border = '1px solid';
    warning.style.borderRadius = '4px';
    warning.textContent = message;

    container.insertBefore(warning, container.firstChild);

    // 自动移除
    setTimeout(() => warning.remove(), 5000);
}

/**
 * 显示权限警告
 */
export function showPermissionWarning() {
    const warningElement = document.createElement('div');
    warningElement.className = 'permission-warning';
    warningElement.innerHTML = `
        <span class="warning-icon">⚠️</span>
        <div class="warning-content">
            <h4>温馨提醒</h4>
            <p>当前令牌缺少gist权限，您的个人信息只能保存在本地设备，无法跨设备同步。</p>
            <p>建议：<a href="https://github.com/settings/tokens" target="_blank">创建新的访问令牌</a>，同时勾选 <code>public_repo</code> 和 <code>gist</code> 权限。</p>
            <button class="close-warning">明白了</button>
        </div>
    `;

    const forumContainer = elements.forumContainer;
    if (forumContainer) {
        forumContainer.insertBefore(warningElement, forumContainer.firstChild);

        // 添加关闭按钮事件
        const closeButton = warningElement.querySelector('.close-warning');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                warningElement.style.display = 'none';
            });
        }
    }
}

/**
 * 显示加载状态
 */
export function showLoading(container, message = '聆听中...') {
    if (!container) return;
    container.innerHTML = `<div class="loading">${message}</div>`;
}

/**
 * 清空容器
 */
export function clearContainer(container) {
    if (!container) return;
    container.innerHTML = '';
}

/**
 * 获取DOM元素
 */
export function getElement(name) {
    return elements[name];
}

// 导出UI模块
export default {
    initUI,
    showLoginForm,
    showForumContent,
    showAnonymousBlogContent,
    showIssueDetail,
    backToList,
    showTab,
    showMessage,
    showRateLimitWarning,
    showPermissionWarning,
    showLoading,
    clearContainer,
    getElement
};
