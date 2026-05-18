/**
 * Profile模块
 * 负责用户资料管理和Gist同步
 */

import { gistsAPI } from './github-api.js';
import { getUsername, getToken, hasGistPermission } from './auth.js';
import { storage, StorageKeys } from '@core/storage.js';

// 用户资料数据
let userProfile = {
    nickname: '',
    signature: '',
    avatarUrl: ''
};

// Gist ID缓存
let profileGistId = null;

/**
 * 加载用户资料
 */
export async function loadUserProfile() {
    const username = getUsername();
    if (!username) return null;

    // 先从存储加载
    const localProfile = storage.getJSON(StorageKeys.forumProfile(username), null);
    if (localProfile) {
        userProfile = localProfile;
    }

    // 如果有Gist权限，尝试从Gist同步
    if (hasGistPermission()) {
        try {
            await syncProfileFromGist();
        } catch (error) {
            console.error('从Gist同步资料失败:', error);
        }
    }

    return userProfile;
}

/**
 * 保存用户资料
 */
export async function saveUserProfile(profile) {
    const username = getUsername();
    if (!username) {
        throw new Error('未登录');
    }

    // 更新内存中的资料
    userProfile = { ...userProfile, ...profile };

    // 保存到存储
    storage.setJSON(StorageKeys.forumProfile(username), userProfile);

    // 如果有Gist权限，同步到Gist
    if (hasGistPermission()) {
        try {
            await syncProfileToGist();
        } catch (error) {
            console.error('同步资料到Gist失败:', error);
            throw error;
        }
    }

    return userProfile;
}

/**
 * 从Gist同步资料
 */
async function syncProfileFromGist() {
    const username = getUsername();
    const token = getToken();

    try {
        // 获取用户的所有gists
        const gists = await gistsAPI.list(username, token);

        // 查找资料gist
        const profileGist = gists.find(g =>
            g.description === `Forum Profile - ${username}` ||
            g.files['forum_profile.json']
        );

        if (profileGist) {
            profileGistId = profileGist.id;

            // 获取gist内容
            const gist = await gistsAPI.get(profileGist.id, token);

            const profileFile = gist.files['forum_profile.json'];
            if (profileFile && profileFile.content) {
                const gistProfile = JSON.parse(profileFile.content);
                userProfile = { ...userProfile, ...gistProfile };

                // 同步到本地存储
                storage.setJSON(StorageKeys.forumProfile(username), userProfile);
            }
        }
    } catch (error) {
        console.error('从Gist同步失败:', error);
        throw error;
    }
}

/**
 * 同步资料到Gist
 */
async function syncProfileToGist() {
    const username = getUsername();
    const token = getToken();

    const gistData = {
        description: `Forum Profile - ${username}`,
        public: false,
        files: {
            'forum_profile.json': {
                content: JSON.stringify(userProfile, null, 2)
            }
        }
    };

    try {
        if (profileGistId) {
            // 更新现有gist
            await gistsAPI.update(profileGistId, gistData, token);
        } else {
            // 创建新gist
            const gist = await gistsAPI.create(gistData, token);
            profileGistId = gist.id;
        }
    } catch (error) {
        console.error('同步到Gist失败:', error);
        throw error;
    }
}

/**
 * 获取显示名称
 */
export async function getDisplayName(username) {
    // 如果是当前用户，返回昵称
    if (username === getUsername() && userProfile.nickname) {
        return userProfile.nickname;
    }

    // 否则返回用户名
    return username;
}

/**
 * 获取头像URL
 */
export async function getAvatarUrl(username, defaultUrl) {
    // 如果是当前用户且有自定义头像，返回自定义头像
    if (username === getUsername() && userProfile.avatarUrl) {
        return userProfile.avatarUrl;
    }

    // 否则返回默认头像
    return defaultUrl || `https://github.com/${username}.png`;
}

/**
 * 获取用户签名
 */
export async function getUserSignature(username) {
    // 如果是当前用户，返回签名
    if (username === getUsername()) {
        return userProfile.signature || '';
    }

    return '';
}

/**
 * 获取当前用户资料
 */
export function getCurrentProfile() {
    return { ...userProfile };
}

// 导出Profile模块
export default {
    loadUserProfile,
    saveUserProfile,
    getDisplayName,
    getAvatarUrl,
    getUserSignature,
    getCurrentProfile
};
