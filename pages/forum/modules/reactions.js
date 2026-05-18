/**
 * Reactions模块
 * 负责Issue和评论的点赞功能
 */

import { reactionsAPI } from './github-api.js';
import { getRepoConfig } from './config.js';
import { getToken, getUsername } from './auth.js';

// 缓存reaction数据
const reactionCache = new Map();

/**
 * 加载Issue的点赞数据
 */
export async function loadIssueLikes(issueNumber, buttonElement) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const reactions = await reactionsAPI.getForIssue(owner, name, issueNumber, token);

        // 更新UI
        const likeCount = reactions.filter(r => r.content === '+1').length;
        updateLikeButton(buttonElement, likeCount, reactions);

        // 缓存
        reactionCache.set(`issue-${issueNumber}`, reactions);

        return reactions;
    } catch (error) {
        console.error('加载Issue点赞失败:', error);
        return [];
    }
}

/**
 * 切换Issue点赞
 */
export async function toggleIssueLike(issueNumber, buttonElement) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();
        const username = getUsername();

        // 获取当前reactions
        let reactions = reactionCache.get(`issue-${issueNumber}`);
        if (!reactions) {
            reactions = await reactionsAPI.getForIssue(owner, name, issueNumber, token);
        }

        // 查找当前用户的reaction
        const myReaction = reactions.find(r => r.user.login === username && r.content === '+1');

        if (myReaction) {
            // 取消点赞
            await reactionsAPI.delete(owner, name, myReaction.id, token);
        } else {
            // 添加点赞
            await reactionsAPI.createForIssue(owner, name, issueNumber, '+1', token);
        }

        // 重新加载
        await loadIssueLikes(issueNumber, buttonElement);

        return !myReaction; // 返回是否点赞
    } catch (error) {
        console.error('切换Issue点赞失败:', error);
        throw error;
    }
}

/**
 * 加载评论的点赞数据
 */
export async function loadCommentLikes(commentId, buttonElement) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();

        const reactions = await reactionsAPI.getForComment(owner, name, commentId, token);

        // 更新UI
        const likeCount = reactions.filter(r => r.content === '+1').length;
        updateLikeButton(buttonElement, likeCount, reactions);

        // 缓存
        reactionCache.set(`comment-${commentId}`, reactions);

        return reactions;
    } catch (error) {
        console.error('加载评论点赞失败:', error);
        return [];
    }
}

/**
 * 切换评论点赞
 */
export async function toggleCommentLike(commentId, buttonElement) {
    try {
        const { owner, name } = getRepoConfig();
        const token = getToken();
        const username = getUsername();

        // 获取当前reactions
        let reactions = reactionCache.get(`comment-${commentId}`);
        if (!reactions) {
            reactions = await reactionsAPI.getForComment(owner, name, commentId, token);
        }

        // 查找当前用户的reaction
        const myReaction = reactions.find(r => r.user.login === username && r.content === '+1');

        if (myReaction) {
            // 取消点赞
            await reactionsAPI.delete(owner, name, myReaction.id, token);
        } else {
            // 添加点赞
            await reactionsAPI.createForComment(owner, name, commentId, '+1', token);
        }

        // 重新加载
        await loadCommentLikes(commentId, buttonElement);

        return !myReaction; // 返回是否点赞
    } catch (error) {
        console.error('切换评论点赞失败:', error);
        throw error;
    }
}

/**
 * 更新点赞按钮UI
 */
function updateLikeButton(buttonElement, count, reactions) {
    if (!buttonElement) return;

    const countSpan = buttonElement.querySelector('.like-count');
    if (countSpan) {
        countSpan.textContent = count;
    }

    // 检查当前用户是否已点赞
    const username = getUsername();
    const hasLiked = reactions.some(r => r.user.login === username && r.content === '+1');

    if (hasLiked) {
        buttonElement.classList.add('liked');
    } else {
        buttonElement.classList.remove('liked');
    }
}

/**
 * 清除缓存
 */
export function clearReactionCache() {
    reactionCache.clear();
}

// 导出Reactions模块
export default {
    loadIssueLikes,
    toggleIssueLike,
    loadCommentLikes,
    toggleCommentLike,
    clearReactionCache
};
