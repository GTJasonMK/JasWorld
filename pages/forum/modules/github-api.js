/**
 * GitHub API封装模块
 * 统一管理所有GitHub API调用、错误处理和速率限制
 */

import { GITHUB_API_URL } from './config.js';

// 速率限制状态
let rateLimitRemaining = null;
let rateLimitReset = null;

/**
 * 检查速率限制
 */
export function checkRateLimit(response) {
    // 从响应头获取速率限制信息
    rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
    rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset'));

    // 如果速率限制信息存在，返回
    if (!isNaN(rateLimitRemaining) && !isNaN(rateLimitReset)) {
        return {
            remaining: rateLimitRemaining,
            reset: rateLimitReset,
            resetDate: new Date(rateLimitReset * 1000)
        };
    }

    return null;
}

/**
 * 获取速率限制状态
 */
export function getRateLimitStatus() {
    return {
        remaining: rateLimitRemaining,
        reset: rateLimitReset,
        resetDate: rateLimitReset ? new Date(rateLimitReset * 1000) : null
    };
}

/**
 * 获取请求头
 */
export function getRequestHeaders(token) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };

    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    return headers;
}

/**
 * GitHub API基础请求方法
 */
async function apiRequest(endpoint, options = {}) {
    const { token, ...fetchOptions } = options;

    const response = await fetch(`${GITHUB_API_URL}${endpoint}`, {
        ...fetchOptions,
        headers: {
            ...getRequestHeaders(token),
            ...fetchOptions.headers
        }
    });

    // 检查速率限制
    checkRateLimit(response);

    if (!response.ok) {
        const error = new Error(`API请求失败: ${response.status} ${response.statusText}`);
        error.response = response;
        error.status = response.status;
        throw error;
    }

    // 解析Link header用于分页
    const linkHeader = response.headers.get('Link');
    const data = await response.json();

    return {
        data,
        linkHeader,
        response
    };
}

/**
 * 用户认证相关API
 */
export const authAPI = {
    // 获取当前用户信息
    async getUser(token) {
        const { data } = await apiRequest('/user', { token });
        return data;
    },

    // 检查gist权限
    async checkGistPermission(token) {
        try {
            const { data: gistData } = await apiRequest('/gists', {
                token,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: "权限测试Gist - 将被立即删除",
                    public: false,
                    files: {
                        "permission_test.txt": {
                            content: "这是一个临时文件，用于测试Token是否有gist权限。"
                        }
                    }
                })
            });

            // 删除测试gist
            if (gistData && gistData.id) {
                try {
                    await apiRequest(`/gists/${gistData.id}`, {
                        token,
                        method: 'DELETE'
                    });
                } catch (deleteError) {
                    console.error("删除测试Gist失败:", deleteError);
                }
            }

            return true;
        } catch (error) {
            return false;
        }
    }
};

/**
 * Issues相关API
 */
export const issuesAPI = {
    // 获取Issues列表
    async list(owner, repo, params = {}, token) {
        const queryParams = new URLSearchParams(params);
        const { data, linkHeader } = await apiRequest(
            `/repos/${owner}/${repo}/issues?${queryParams}`,
            { token }
        );
        return { issues: data, linkHeader };
    },

    // 获取单个Issue详情
    async get(owner, repo, issueNumber, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}`,
            { token }
        );
        return data;
    },

    // 创建Issue
    async create(owner, repo, issueData, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues`,
            {
                token,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(issueData)
            }
        );
        return data;
    },

    // 删除Issue (关闭)
    async delete(owner, repo, issueNumber, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}`,
            {
                token,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: 'closed' })
            }
        );
        return data;
    },

    // 搜索Issues
    async search(query, token) {
        const { data } = await apiRequest(
            `/search/issues?q=${encodeURIComponent(query)}`,
            { token }
        );
        return data.items || [];
    }
};

/**
 * Comments相关API
 */
export const commentsAPI = {
    // 获取评论列表
    async list(owner, repo, issueNumber, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
            { token }
        );
        return data;
    },

    // 创建评论
    async create(owner, repo, issueNumber, body, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
            {
                token,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body })
            }
        );
        return data;
    },

    // 删除评论
    async delete(owner, repo, commentId, token) {
        await apiRequest(
            `/repos/${owner}/${repo}/issues/comments/${commentId}`,
            {
                token,
                method: 'DELETE'
            }
        );
        return true;
    }
};

/**
 * Reactions相关API
 */
export const reactionsAPI = {
    // 获取Issue的reactions
    async getForIssue(owner, repo, issueNumber, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}/reactions`,
            { token }
        );
        return data;
    },

    // 给Issue添加reaction
    async createForIssue(owner, repo, issueNumber, content, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/${issueNumber}/reactions`,
            {
                token,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.squirrel-girl-preview+json'
                },
                body: JSON.stringify({ content })
            }
        );
        return data;
    },

    // 删除reaction
    async delete(owner, repo, reactionId, token) {
        await apiRequest(
            `/repos/${owner}/${repo}/issues/reactions/${reactionId}`,
            {
                token,
                method: 'DELETE',
                headers: {
                    'Accept': 'application/vnd.github.squirrel-girl-preview+json'
                }
            }
        );
        return true;
    },

    // 获取评论的reactions
    async getForComment(owner, repo, commentId, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
            { token }
        );
        return data;
    },

    // 给评论添加reaction
    async createForComment(owner, repo, commentId, content, token) {
        const { data } = await apiRequest(
            `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
            {
                token,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.squirrel-girl-preview+json'
                },
                body: JSON.stringify({ content })
            }
        );
        return data;
    }
};

/**
 * Gists相关API（用于用户资料存储）
 */
export const gistsAPI = {
    // 获取用户的gists
    async list(username, token) {
        const { data } = await apiRequest(`/users/${username}/gists`, { token });
        return data;
    },

    // 获取单个gist
    async get(gistId, token) {
        const { data } = await apiRequest(`/gists/${gistId}`, { token });
        return data;
    },

    // 创建gist
    async create(gistData, token) {
        const { data } = await apiRequest('/gists', {
            token,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gistData)
        });
        return data;
    },

    // 更新gist
    async update(gistId, gistData, token) {
        const { data } = await apiRequest(`/gists/${gistId}`, {
            token,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gistData)
        });
        return data;
    }
};

// 导出所有API
export default {
    authAPI,
    issuesAPI,
    commentsAPI,
    reactionsAPI,
    gistsAPI,
    checkRateLimit,
    getRateLimitStatus,
    getRequestHeaders
};
