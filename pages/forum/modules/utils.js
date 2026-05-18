/**
 * 工具函数模块
 * 通用辅助函数
 */

/**
 * 从帖子内容中提取标签
 */
export function extractLabelFromContent(body) {
    if (!body) return null;

    // HTML注释风格标签
    const commentLabelMatch = body.match(/<!--\s*category:(.*?)\s*-->/);
    if (commentLabelMatch) {
        return commentLabelMatch[1].trim();
    }

    // 向后兼容：旧格式
    const oldLabelMatch = body.match(/\*\*分类\*\*\s*:\s*([^\n]+)/);
    if (oldLabelMatch) {
        return oldLabelMatch[1].trim();
    }

    return null;
}

/**
 * 解析Link header用于分页
 */
export function parseLinkHeader(linkHeader) {
    if (!linkHeader) return {};

    const links = {};
    const parts = linkHeader.split(',');

    parts.forEach(part => {
        const section = part.split(';');
        if (section.length !== 2) return;

        const url = section[0].replace(/<(.*)>/, '$1').trim();
        const name = section[1].replace(/rel="(.*)"/, '$1').trim();

        links[name] = url;
    });

    return links;
}

/**
 * 格式化时间为"xx前"的形式
 */
export function formatTimeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 30) return `${diffDays}天前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
}

/**
 * 检查用户是否为管理员
 */
export function isAdmin(username, adminList) {
    return adminList.includes(username);
}

/**
 * 转义HTML特殊字符
 */
export function escapeHtml(text) {
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
 * 截断文本
 */
export function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * 执行本地搜索
 */
export function performLocalSearch(items, query) {
    if (!query) return items;

    const lowercaseQuery = query.toLowerCase();
    return items.filter(item => {
        const title = (item.title || '').toLowerCase();
        const body = (item.body || '').toLowerCase();
        return title.includes(lowercaseQuery) || body.includes(lowercaseQuery);
    });
}

/**
 * 根据标签过滤
 */
export function filterByLabel(items, label) {
    if (!label) return items;

    return items.filter(item => {
        // 检查GitHub标签
        if (item.labels && item.labels.some(l => l.name === label)) {
            return true;
        }

        // 检查内容中的标签
        const contentLabel = extractLabelFromContent(item.body);
        return contentLabel === label;
    });
}

// 导出所有工具函数
export default {
    extractLabelFromContent,
    parseLinkHeader,
    formatTimeAgo,
    isAdmin,
    escapeHtml,
    truncateText,
    performLocalSearch,
    filterByLabel
};
