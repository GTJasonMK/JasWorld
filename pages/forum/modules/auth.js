/**
 * 认证模块
 * 管理用户认证状态和登录/登出逻辑
 */

import { authAPI } from './github-api.js';
import { storage, StorageKeys } from '@core/storage.js';

// 认证数据
let authData = {
    username: '',
    token: '',
    avatar_url: '',
    hasGistPermission: false
};

// 认证状态变更回调
let onAuthChangeCallback = null;

function readSessionAuthData() {
    try {
        const raw = sessionStorage.getItem(StorageKeys.forumAuth);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('读取会话认证数据失败:', error);
        return null;
    }
}

function writeSessionAuthData(data) {
    try {
        sessionStorage.setItem(StorageKeys.forumAuth, JSON.stringify(data));
    } catch (error) {
        console.warn('保存会话认证数据失败:', error);
    }
}

function clearSessionAuthData() {
    try {
        sessionStorage.removeItem(StorageKeys.forumAuth);
    } catch {
        /* ignored */
    }
}

/**
 * 设置认证状态变更监听器
 */
export function onAuthChange(callback) {
    onAuthChangeCallback = callback;
}

/**
 * 触发认证状态变更
 */
function triggerAuthChange(isAuthenticated) {
    if (onAuthChangeCallback) {
        onAuthChangeCallback(isAuthenticated, authData);
    }
}

/**
 * 检查是否已认证
 */
export function isAuthenticated() {
    return !!(authData.username && authData.token);
}

/**
 * 获取当前认证数据
 */
export function getAuthData() {
    return { ...authData };
}

/**
 * 保存认证数据到sessionStorage,避免长期保存 GitHub token
 */
export function saveAuthData() {
    const dataToSave = {
        username: authData.username,
        token: authData.token,
        avatar_url: authData.avatar_url,
        hasGistPermission: authData.hasGistPermission
    };
    writeSessionAuthData(dataToSave);
    storage.remove(StorageKeys.forumAuth);
}

/**
 * 从存储加载认证数据
 */
export function loadAuthData() {
    let parsed = readSessionAuthData();
    if (!parsed) {
        parsed = storage.getJSON(StorageKeys.forumAuth, null);
        if (parsed) {
            writeSessionAuthData(parsed);
            storage.remove(StorageKeys.forumAuth);
        }
    }
    if (!parsed) return false;
    authData = {
        username: parsed.username || '',
        token: parsed.token || '',
        avatar_url: parsed.avatar_url || '',
        hasGistPermission: parsed.hasGistPermission || false
    };
    return true;
}

/**
 * 用户登录
 */
export async function login(username, token) {
    try {
        // 步骤1: 验证token
        const userData = await authAPI.getUser(token);

        if (userData.login.toLowerCase() !== username.toLowerCase()) {
            throw new Error('令牌与用户名似乎不相配');
        }

        // 步骤2: 检查gist权限
        const hasGistPermission = await authAPI.checkGistPermission(token);

        // 步骤3: 保存认证数据
        authData = {
            username: userData.login,
            token: token,
            avatar_url: userData.avatar_url,
            hasGistPermission
        };

        saveAuthData();
        triggerAuthChange(true);

        return {
            success: true,
            hasGistPermission,
            user: userData
        };
    } catch (error) {
        console.error('认证错误:', error);
        throw error;
    }
}

/**
 * 用户登出
 */
export function logout() {
    authData = {
        username: '',
        token: '',
        avatar_url: '',
        hasGistPermission: false
    };

    clearSessionAuthData();
    storage.remove(StorageKeys.forumAuth);
    triggerAuthChange(false);
}

/**
 * 获取用户头像URL
 */
export function getAvatarUrl() {
    return authData.avatar_url || '';
}

/**
 * 获取用户名
 */
export function getUsername() {
    return authData.username || '';
}

/**
 * 获取Token
 */
export function getToken() {
    return authData.token || '';
}

/**
 * 检查是否有Gist权限
 */
export function hasGistPermission() {
    return authData.hasGistPermission;
}

// 导出认证模块
export default {
    isAuthenticated,
    getAuthData,
    login,
    logout,
    loadAuthData,
    saveAuthData,
    onAuthChange,
    getAvatarUrl,
    getUsername,
    getToken,
    hasGistPermission
};
