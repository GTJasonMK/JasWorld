/**
 * Issue管理模块
 * 负责Issue的CRUD操作和渲染
 */

import { issuesAPI } from './github-api.js';
import { getRepoConfig, PER_PAGE } from './config.js';
import { getToken } from './auth.js';
import { extractLabelFromContent, formatTimeAgo, parseLinkHeader } from './utils.js';
import { showLoading, getElement } from './ui.js';

// 当前状态
let currentPage = 1;
let currentLabel = '';
let currentSearchQuery = '';
let totalPages = 1;

/**
 * 加载Issues列表
 */
export async function loadIssuesList(options = {}) {
    const {
        page = 1,
        label = '',
        searchQuery = ''
    } = options;

    currentPage = page;
    currentLabel = label;
    currentSearchQuery = searchQuery;

    const issuesList = getElement('issuesList');
    showLoading(issuesList, '倾听广场的声音...');

    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const params = {
            state: 'open',
            per_page: PER_PAGE,
            page: currentPage
        };

        if (label) {
            params.labels = label;
        }

        // 如果有搜索查询，使用搜索API
        let issues, linkHeader;
        if (searchQuery) {
            const query = `repo:${owner}/${name} is:issue is:open ${searchQuery}`;
            issues = await issuesAPI.search(query, token);
            linkHeader = null; // 搜索API不返回Link header
        } else {
            const result = await issuesAPI.list(owner, name, params, token);
            issues = result.issues;
            linkHeader = result.linkHeader;
        }

        // 解析分页信息
        if (linkHeader) {
            const links = parseLinkHeader(linkHeader);
            // 从last链接提取总页数
            if (links.last) {
                const match = links.last.match(/page=(\d+)/);
                if (match) {
                    totalPages = parseInt(match[1]);
                }
            } else {
                totalPages = currentPage;
            }
        }

        // 渲染Issues列表
        await renderIssuesList(issues);

        // 渲染分页
        renderPagination();

        return issues;
    } catch (error) {
        console.error('加载Issues失败:', error);
        if (issuesList) {
            issuesList.innerHTML = `<div class="error">加载遇到了问题: ${error.message}</div>`;
        }
        throw error;
    }
}

/**
 * 加载Issue详情
 */
export async function loadIssueDetail(issueNumber) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const issue = await issuesAPI.get(owner, name, issueNumber, token);

        // 渲染Issue详情
        renderIssueDetail(issue);

        return issue;
    } catch (error) {
        console.error('加载Issue详情失败:', error);
        throw error;
    }
}

/**
 * 创建新Issue
 */
export async function createIssue(issueData) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const issue = await issuesAPI.create(owner, name, issueData, token);

        return issue;
    } catch (error) {
        console.error('创建Issue失败:', error);
        throw error;
    }
}

/**
 * 删除Issue（实际是关闭）
 */
export async function deleteIssue(issueNumber) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        await issuesAPI.delete(owner, name, issueNumber, token);

        return true;
    } catch (error) {
        console.error('删除Issue失败:', error);
        throw error;
    }
}

/**
 * 渲染Issues列表
 */
async function renderIssuesList(issues) {
    const issuesList = getElement('issuesList');
    if (!issuesList) return;

    if (!issues || issues.length === 0) {
        issuesList.innerHTML = '<div class="no-issues">此处空空如也，等待第一个声音的出现</div>';
        return;
    }

    issuesList.innerHTML = '';

    for (const issue of issues) {
        const issueCard = await createIssueCard(issue);
        issuesList.appendChild(issueCard);
    }
}

/**
 * 创建Issue卡片
 */
async function createIssueCard(issue) {
    const card = document.createElement('div');
    card.className = 'issue-card';
    card.dataset.issueNumber = issue.number;

    // 提取标签
    const contentLabel = extractLabelFromContent(issue.body);
    const label = contentLabel || (issue.labels && issue.labels[0] ? issue.labels[0].name : '未分类');

    // 时间格式化
    const timeAgo = formatTimeAgo(issue.created_at);

    card.innerHTML = `
        <div class="issue-header">
            <h3 class="issue-title">${escapeHtml(issue.title)}</h3>
            <span class="issue-label">${escapeHtml(label)}</span>
        </div>
        <div class="issue-meta">
            <span class="issue-author">作者: ${escapeHtml(issue.user.login)}</span>
            <span class="issue-date">${timeAgo}</span>
            <span class="issue-comments">💬 ${issue.comments}</span>
        </div>
    `;

    // 点击事件
    card.addEventListener('click', () => {
        // 触发Issue详情加载
        window.dispatchEvent(new CustomEvent('issueClick', {
            detail: { issueNumber: issue.number }
        }));
    });

    return card;
}

/**
 * 渲染Issue详情
 */
function renderIssueDetail(issue) {
    const detailTitle = getElement('detailTitle');
    const detailAuthor = getElement('detailAuthor');
    const detailDate = getElement('detailDate');
    const detailLabel = getElement('detailLabel');
    const detailBody = getElement('detailBody');

    if (detailTitle) detailTitle.textContent = issue.title;
    if (detailAuthor) detailAuthor.textContent = issue.user.login;
    if (detailDate) detailDate.textContent = formatTimeAgo(issue.created_at);

    // 标签
    const contentLabel = extractLabelFromContent(issue.body);
    if (detailLabel) {
        detailLabel.textContent = contentLabel || '未分类';
    }

    // 内容（使用Markdown渲染或纯文本）
    if (detailBody) {
        // 简单的Markdown转换（实际项目应使用marked.js等库）
        const htmlContent = simpleMarkdownToHtml(issue.body);
        detailBody.innerHTML = htmlContent;
    }
}

/**
 * 渲染分页
 */
function renderPagination() {
    const pagination = getElement('pagination');
    if (!pagination) return;

    pagination.innerHTML = '';

    if (totalPages <= 1) return;

    // 上一页按钮
    if (currentPage > 1) {
        const prevBtn = createPageButton(currentPage - 1, '上一页');
        pagination.appendChild(prevBtn);
    }

    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = createPageButton(i, i.toString());
        if (i === currentPage) {
            pageBtn.classList.add('active');
        }
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    if (currentPage < totalPages) {
        const nextBtn = createPageButton(currentPage + 1, '下一页');
        pagination.appendChild(nextBtn);
    }
}

/**
 * 创建分页按钮
 */
function createPageButton(pageNum, text) {
    const button = document.createElement('button');
    button.className = 'pagination-button';
    button.textContent = text;
    button.addEventListener('click', () => {
        loadIssuesList({ page: pageNum, label: currentLabel, searchQuery: currentSearchQuery });
    });
    return button;
}

/**
 * 简单的Markdown转HTML
 */
function simpleMarkdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // 代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // 粗体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 斜体
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 换行
    html = html.replace(/\n/g, '<br>');

    return html;
}

/**
 * 转义HTML
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 获取当前状态
 */
export function getCurrentState() {
    return {
        page: currentPage,
        label: currentLabel,
        searchQuery: currentSearchQuery,
        totalPages
    };
}

// 导出Issues模块
export default {
    loadIssuesList,
    loadIssueDetail,
    createIssue,
    deleteIssue,
    getCurrentState
};
