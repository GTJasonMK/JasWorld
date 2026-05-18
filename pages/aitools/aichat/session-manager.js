/**
 * 会话管理器
 * 负责管理多个AI对话会话，每个会话包含独立的消息历史
 */

import { storage, StorageKeys } from '@core/storage.js';

/**
 * 单个会话类
 */
class Session {
    /**
     * @param {Object} data - 会话数据
     * @param {string} data.id - 会话ID
     * @param {string} data.title - 会话标题
     * @param {Array} data.messages - 消息数组
     * @param {number} data.timestamp - 创建时间戳
     * @param {number} data.lastUpdated - 最后更新时间戳
     */
    constructor(data = {}) {
        this.id = data.id || this.generateId();
        this.title = data.title || '新对话';
        this.messages = Array.isArray(data.messages) ? data.messages.map(normalizeStoredMessage) : [];
        this.timestamp = data.timestamp || Date.now();
        this.lastUpdated = data.lastUpdated || Date.now();
    }

    /**
     * 生成唯一ID
     * @returns {string}
     */
    generateId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 添加消息
     * @param {Object} message - 消息对象 {role, content}
     */
    addMessage(message) {
        this.messages.push(normalizeStoredMessage(message));
        this.lastUpdated = Date.now();

        // 自动更新标题（使用第一条用户消息）
        if (this.title === '新对话' && message.role === 'user' && message.content) {
            this.updateTitle(message.content);
        }
    }

    /**
     * 更新会话标题
     * @param {string} content - 消息内容
     */
    updateTitle(content) {
        // 提取前20个字符作为标题，移除换行符
        let title = content.replace(/\n/g, ' ').trim();
        if (title.length > 20) {
            title = title.substring(0, 20) + '...';
        }
        this.title = title || '新对话';
    }

    /**
     * 清空消息
     */
    clearMessages() {
        this.messages = [];
        this.title = '新对话';
        this.lastUpdated = Date.now();
    }

    /**
     * 导出为JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            messages: this.messages,
            timestamp: this.timestamp,
            lastUpdated: this.lastUpdated
        };
    }
}

function normalizeStoredMessage(message = {}) {
    return {
        ...message,
        role: normalizeMessageRole(message.role),
    };
}

function normalizeMessageRole(role) {
    if (role === 'ai' || role === 'bot' || role === 'model') return 'assistant';
    if (role === 'human') return 'user';
    if (role === 'system' || role === 'user' || role === 'assistant') return role;
    return 'assistant';
}

/**
 * 会话管理器类
 */
class SessionManager {
    constructor() {
        this.sessions = [];
        this.currentSessionId = null;
        this.storageKey = StorageKeys.aichatSessions;
        this.currentSessionKey = StorageKeys.aichatCurrentSession;
        this.maxSessions = 50; // 最多保存50个会话

        this.loadSessions();
    }

    /**
     * 从存储加载所有会话
     */
    loadSessions() {
        try {
            const data = storage.getJSON(this.storageKey, null);
            if (Array.isArray(data)) {
                this.sessions = data.map((sessionData) => new Session(sessionData));
                this.sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
                console.log(`[SessionManager] 加载了 ${this.sessions.length} 个会话`);
            }

            const currentId = storage.getString(this.currentSessionKey, null);
            if (currentId && this.getSession(currentId)) {
                this.currentSessionId = currentId;
            } else if (this.sessions.length > 0) {
                this.currentSessionId = this.sessions[0].id;
            } else {
                this.createSession();
            }
        } catch (error) {
            console.error('[SessionManager] 加载会话失败:', error);
            this.createSession();
        }
    }

    /**
     * 保存所有会话到存储
     */
    saveSessions() {
        try {
            if (this.sessions.length > this.maxSessions) {
                this.sessions = this.sessions.slice(0, this.maxSessions);
            }

            const data = this.sessions.map((session) => session.toJSON());
            storage.setJSON(this.storageKey, data);

            if (this.currentSessionId) {
                storage.setString(this.currentSessionKey, this.currentSessionId);
            }
        } catch (error) {
            console.error('[SessionManager] 保存会话失败:', error);
        }
    }

    /**
     * 创建新会话
     * @param {string} title - 可选的会话标题
     * @returns {Session}
     */
    createSession(title = '新对话') {
        const session = new Session({ title });
        this.sessions.unshift(session); // 添加到开头
        this.currentSessionId = session.id;
        this.saveSessions();

        console.log(`[SessionManager] 创建新会话: ${session.id}`);
        return session;
    }

    /**
     * 获取指定会话
     * @param {string} sessionId - 会话ID
     * @returns {Session|null}
     */
    getSession(sessionId) {
        return this.sessions.find(s => s.id === sessionId) || null;
    }

    /**
     * 获取当前会话
     * @returns {Session|null}
     */
    getCurrentSession() {
        return this.getSession(this.currentSessionId);
    }

    /**
     * 切换到指定会话
     * @param {string} sessionId - 会话ID
     * @returns {Session|null}
     */
    switchSession(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            this.currentSessionId = sessionId;
            this.saveSessions();
            console.log(`[SessionManager] 切换到会话: ${sessionId}`);
            return session;
        }
        console.warn(`[SessionManager] 会话不存在: ${sessionId}`);
        return null;
    }

    /**
     * 删除指定会话
     * @param {string} sessionId - 会话ID
     * @returns {boolean}
     */
    deleteSession(sessionId) {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index === -1) {
            console.warn(`[SessionManager] 会话不存在: ${sessionId}`);
            return false;
        }

        this.sessions.splice(index, 1);

        // 如果删除的是当前会话，切换到下一个
        if (this.currentSessionId === sessionId) {
            if (this.sessions.length > 0) {
                this.currentSessionId = this.sessions[0].id;
            } else {
                // 如果没有会话了，创建一个新的
                this.createSession();
            }
        }

        this.saveSessions();
        console.log(`[SessionManager] 删除会话: ${sessionId}`);
        return true;
    }

    /**
     * 清空当前会话的消息
     */
    clearCurrentSession() {
        const session = this.getCurrentSession();
        if (session) {
            session.clearMessages();
            this.saveSessions();
            console.log(`[SessionManager] 清空会话: ${session.id}`);
        }
    }

    /**
     * 添加消息到当前会话
     * @param {Object} message - 消息对象 {role, content}
     */
    addMessageToCurrentSession(message) {
        const session = this.getCurrentSession();
        if (session) {
            session.addMessage(message);

            // 更新会话在列表中的位置（移到最前面）
            const index = this.sessions.findIndex(s => s.id === session.id);
            if (index > 0) {
                this.sessions.splice(index, 1);
                this.sessions.unshift(session);
            }

            this.saveSessions();
        }
    }

    /**
     * 获取当前会话的消息列表
     * @returns {Array}
     */
    getCurrentMessages() {
        const session = this.getCurrentSession();
        return session ? session.messages : [];
    }

    /**
     * 获取所有会话的摘要信息（用于侧边栏显示）
     * @returns {Array}
     */
    getSessionsSummary() {
        return this.sessions.map(session => ({
            id: session.id,
            title: session.title,
            lastUpdated: session.lastUpdated,
            messageCount: session.messages.length,
            isCurrent: session.id === this.currentSessionId
        }));
    }

    /**
     * 导出所有会话（用于备份）
     * @returns {string}
     */
    exportAllSessions() {
        const data = this.sessions.map(session => session.toJSON());
        return JSON.stringify(data, null, 2);
    }

    /**
     * 导入会话（从备份恢复）
     * @param {string} jsonString - JSON字符串
     * @returns {boolean}
     */
    importSessions(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this.sessions = data.map(sessionData => new Session(sessionData));
            this.sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);

            if (this.sessions.length > 0) {
                this.currentSessionId = this.sessions[0].id;
            }

            this.saveSessions();
            console.log(`[SessionManager] 导入了 ${this.sessions.length} 个会话`);
            return true;
        } catch (error) {
            console.error('[SessionManager] 导入会话失败:', error);
            return false;
        }
    }
}

// 导出供其他模块使用
if (typeof window !== 'undefined') {
    window.Session = Session;
    window.SessionManager = SessionManager;
}

export { Session, SessionManager };
