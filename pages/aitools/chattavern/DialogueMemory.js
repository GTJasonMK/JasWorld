import { storage, StorageKeys } from '@core/storage.js';

/**
 * 对话记忆系统
 * 管理对话历史（短期记忆）和关键信息提取（长期记忆）
 *
 * 功能：
 * - 短期记忆：存储最近的对话记录，用于LLM上下文
 * - 长期记忆：提取并保存关键信息（玩家偏好、重要事件等）
 * - 记忆持久化：通过 @core/storage 写入 chattavern:memory:<characterId>
 */
export class DialogueMemory {
    constructor(characterId) {
        this.characterId = characterId;

        // 短期记忆（对话历史）
        this.shortTerm = [];
        this.maxShortTerm = 50; // 最多保留50条

        // 长期记忆（关键信息）
        this.longTerm = {
            playerPreferences: [],    // 玩家偏好
            importantEvents: [],       // 重要事件
            relationships: {},         // 关系信息
            topics: new Set()          // 讨论过的话题
        };

        this.loadMemory();
    }

    /**
     * 添加消息到历史
     * @param {string} role 'user' 或 'assistant'
     * @param {string} content 消息内容
     * @param {Object} metadata 额外元数据
     */
    addMessage(role, content, metadata = {}) {
        const message = {
            role,
            content,
            timestamp: Date.now(),
            ...metadata
        };

        this.shortTerm.push(message);

        // 限制历史长度
        if (this.shortTerm.length > this.maxShortTerm) {
            this.shortTerm.shift();
        }

        // 尝试提取长期记忆
        if (role === 'user') {
            this.extractLongTermMemory(message);
        }

        this.saveMemory();
        return message;
    }

    /**
     * 提取长期记忆
     * 从对话中识别并保存重要信息
     */
    extractLongTermMemory(message) {
        const content = message.content.toLowerCase();

        // 关键词检测
        const patterns = {
            like: ['喜欢', '爱', '最爱', '偏好', '喜好'],
            dislike: ['讨厌', '不喜欢', '反感', '厌恶'],
            important: ['重要', '关键', '记住', '永远', '一定']
        };

        // 检测喜好
        for (const keyword of patterns.like) {
            if (content.includes(keyword)) {
                this.longTerm.playerPreferences.push({
                    type: 'like',
                    content: message.content,
                    timestamp: message.timestamp
                });
                break;
            }
        }

        for (const keyword of patterns.dislike) {
            if (content.includes(keyword)) {
                this.longTerm.playerPreferences.push({
                    type: 'dislike',
                    content: message.content,
                    timestamp: message.timestamp
                });
                break;
            }
        }

        // 检测重要事件
        for (const keyword of patterns.important) {
            if (content.includes(keyword)) {
                this.longTerm.importantEvents.push({
                    content: message.content,
                    timestamp: message.timestamp
                });
                break;
            }
        }

        // 限制长期记忆数量
        if (this.longTerm.playerPreferences.length > 20) {
            this.longTerm.playerPreferences.shift();
        }
        if (this.longTerm.importantEvents.length > 10) {
            this.longTerm.importantEvents.shift();
        }
    }

    /**
     * 获取对话上下文（用于LLM）
     * @param {number} limit 最大消息数
     * @returns {Array} 消息数组
     */
    getContext(limit = 10) {
        const recentMessages = this.shortTerm.slice(-limit);

        return recentMessages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * 获取格式化的对话历史（用于显示）
     */
    getFormattedHistory() {
        return this.shortTerm.map(msg => ({
            ...msg,
            time: new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            })
        }));
    }

    /**
     * 获取长期记忆摘要
     * 用于注入到System Prompt
     */
    getLongTermSummary() {
        const summary = [];

        // 玩家偏好
        if (this.longTerm.playerPreferences.length > 0) {
            const likes = this.longTerm.playerPreferences
                .filter(p => p.type === 'like')
                .slice(-5) // 最近5个
                .map(p => p.content);

            const dislikes = this.longTerm.playerPreferences
                .filter(p => p.type === 'dislike')
                .slice(-5)
                .map(p => p.content);

            if (likes.length > 0) {
                summary.push(`【玩家偏好】玩家喜欢：${likes.join('；')}`);
            }
            if (dislikes.length > 0) {
                summary.push(`【玩家偏好】玩家不喜欢：${dislikes.join('；')}`);
            }
        }

        // 重要事件
        if (this.longTerm.importantEvents.length > 0) {
            const events = this.longTerm.importantEvents
                .slice(-3) // 最近3个
                .map(e => e.content);

            summary.push(`【重要记忆】${events.join('；')}`);
        }

        return summary.length > 0 ? summary.join('\n') : '';
    }

    /**
     * 清空短期记忆（开始新对话）
     */
    clearShortTerm() {
        this.shortTerm = [];
        this.saveMemory();
    }

    /**
     * 清空所有记忆
     */
    clearAll() {
        this.shortTerm = [];
        this.longTerm = {
            playerPreferences: [],
            importantEvents: [],
            relationships: {},
            topics: new Set()
        };
        this.saveMemory();
    }

    /**
     * 保存记忆到存储
     */
    saveMemory() {
        const data = {
            shortTerm: this.shortTerm,
            longTerm: {
                ...this.longTerm,
                topics: Array.from(this.longTerm.topics) // Set转Array
            }
        };
        storage.setJSON(StorageKeys.chattavernMemory(this.characterId), data);
    }

    /**
     * 从存储加载记忆
     */
    loadMemory() {
        const parsed = storage.getJSON(StorageKeys.chattavernMemory(this.characterId), null);
        if (!parsed) return;
        this.shortTerm = parsed.shortTerm || [];
        this.longTerm = {
            playerPreferences: parsed.longTerm?.playerPreferences || [],
            importantEvents: parsed.longTerm?.importantEvents || [],
            relationships: parsed.longTerm?.relationships || {},
            topics: new Set(parsed.longTerm?.topics || [])
        };
    }

    /**
     * 导出记忆数据
     */
    export() {
        return {
            characterId: this.characterId,
            shortTerm: this.shortTerm,
            longTerm: {
                ...this.longTerm,
                topics: Array.from(this.longTerm.topics)
            },
            exportedAt: Date.now()
        };
    }

    /**
     * 导入记忆数据
     */
    import(data) {
        if (data.characterId !== this.characterId) {
            console.warn('角色ID不匹配，导入可能不正确');
        }

        this.shortTerm = data.shortTerm || [];
        this.longTerm = {
            playerPreferences: data.longTerm?.playerPreferences || [],
            importantEvents: data.longTerm?.importantEvents || [],
            relationships: data.longTerm?.relationships || {},
            topics: new Set(data.longTerm?.topics || [])
        };

        this.saveMemory();
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            totalMessages: this.shortTerm.length,
            userMessages: this.shortTerm.filter(m => m.role === 'user').length,
            assistantMessages: this.shortTerm.filter(m => m.role === 'assistant').length,
            playerPreferences: this.longTerm.playerPreferences.length,
            importantEvents: this.longTerm.importantEvents.length,
            topics: this.longTerm.topics.size
        };
    }
}

