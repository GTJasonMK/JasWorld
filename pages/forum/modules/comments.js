/**
 * 评论管理模块
 * 负责评论的CRUD操作和渲染
 */

import { commentsAPI } from './github-api.js';
import { getRepoConfig } from './config.js';
import { getToken, getUsername } from './auth.js';
import { formatTimeAgo } from './utils.js';
import { showLoading, getElement } from './ui.js';

/**
 * 加载评论列表
 */
export async function loadComments(issueNumber) {
    const commentsList = getElement('commentsList');
    const commentsCount = getElement('commentsCount');

    showLoading(commentsList, '加载评论中...');

    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const comments = await commentsAPI.list(owner, name, issueNumber, token);

        // 更新评论数
        if (commentsCount) {
            commentsCount.textContent = comments.length;
        }

        // 渲染评论列表
        renderCommentsList(comments, issueNumber);

        return comments;
    } catch (error) {
        console.error('加载评论失败:', error);
        if (commentsList) {
            commentsList.innerHTML = `<div class="error">加载评论失败: ${error.message}</div>`;
        }
        throw error;
    }
}

/**
 * 提交评论
 */
export async function submitComment(issueNumber, body) {
    if (!body || !body.trim()) {
        throw new Error('评论内容不能为空');
    }

    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const comment = await commentsAPI.create(owner, name, issueNumber, body, token);

        return comment;
    } catch (error) {
        console.error('提交评论失败:', error);
        throw error;
    }
}

/**
 * 删除评论
 */
export async function deleteComment(commentId) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        await commentsAPI.delete(owner, name, commentId, token);

        return true;
    } catch (error) {
        console.error('删除评论失败:', error);
        throw error;
    }
}

/**
 * 渲染评论列表
 */
function renderCommentsList(comments, issueNumber) {
    const commentsList = getElement('commentsList');
    if (!commentsList) return;

    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<div class="no-comments">暂无评论</div>';
        return;
    }

    commentsList.innerHTML = '';

    comments.forEach(comment => {
        const commentElement = createCommentElement(comment, issueNumber);
        commentsList.appendChild(commentElement);
    });
}

/**
 * 创建评论元素
 */
function createCommentElement(comment, issueNumber) {
    const div = document.createElement('div');
    div.className = 'comment';
    div.dataset.commentId = comment.id;

    const timeAgo = formatTimeAgo(comment.created_at);
    const currentUsername = getUsername();
    const isOwnComment = comment.user.login === currentUsername;

    div.innerHTML = `
        <div class="comment-header">
            <img src="${comment.user.avatar_url}" alt="${comment.user.login}" class="comment-avatar">
            <div class="comment-meta">
                <span class="comment-author">${escapeHtml(comment.user.login)}</span>
                <span class="comment-date">${timeAgo}</span>
            </div>
            ${isOwnComment ? `
                <button class="delete-comment-btn" data-comment-id="${comment.id}">删除</button>
            ` : ''}
        </div>
        <div class="comment-body">${simpleMarkdownToHtml(comment.body)}</div>
        <div class="comment-actions">
            <button class="like-comment-btn" data-comment-id="${comment.id}">
                <span class="like-icon">👍</span>
                <span class="like-count">0</span>
            </button>
        </div>
    `;

    // 添加删除按钮事件
    const deleteBtn = div.querySelector('.delete-comment-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这条评论吗？')) {
                try {
                    await deleteComment(comment.id);
                    // 重新加载评论
                    await loadComments(issueNumber);
                } catch (error) {
                    alert('删除失败: ' + error.message);
                }
            }
        });
    }

    // 点赞按钮事件（通过自定义事件触发）
    const likeBtn = div.querySelector('.like-comment-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('commentLikeClick', {
                detail: { commentId: comment.id, button: likeBtn }
            }));
        });
    }

    return div;
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

// 导出评论模块
export default {
    loadComments,
    submitComment,
    deleteComment
};
