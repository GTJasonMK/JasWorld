/**
 * 角色卡数据模型
 * 兼容SillyTavern v2格式，并扩展ChatTavern特有功能
 *
 * SillyTavern标准字段：
 * - spec: 格式版本（"chara_card_v2"）
 * - name: 角色名称
 * - description: 角色描述
 * - personality: 性格特征
 * - scenario: 初始场景
 * - first_mes: 第一条消息
 * - mes_example: 示例对话
 *
 * ChatTavern扩展字段：
 * - emotions: 不同情绪的立绘图片
 * - favoriteTopics: 喜欢的话题
 * - dislikeTopics: 讨厌的话题
 * - system_prompt: 自定义系统提示词
 */
export class CharacterCard {
    constructor(data = {}) {
        // ========== SillyTavern标准字段 ==========
        this.spec = data.spec || 'chara_card_v2';
        this.spec_version = data.spec_version || '2.0';

        // 基础信息
        this.name = data.name || '未命名角色';
        this.description = data.description || '';
        this.personality = data.personality || '';
        this.scenario = data.scenario || '';
        this.first_mes = data.first_mes || `你好，我是${this.name}。`;
        this.mes_example = data.mes_example || '';

        // 元数据
        this.creator = data.creator || '';
        this.character_version = data.character_version || '1.0';
        this.tags = Array.isArray(data.tags) ? data.tags : [];
        this.creator_notes = data.creator_notes || '';

        // 高级设置（SillyTavern v2）
        this.system_prompt = data.system_prompt || '';
        this.post_history_instructions = data.post_history_instructions || '';
        this.alternate_greetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
        this.character_book = data.character_book || null; // Lorebook/World Info

        // ========== ChatTavern扩展字段 ==========
        // 情绪立绘
        this.emotions = data.emotions || {
            neutral: '',
            happy: '',
            sad: '',
            angry: '',
            surprised: '',
            shy: ''
        };

        // 话题偏好
        this.favoriteTopics = Array.isArray(data.favoriteTopics) ? data.favoriteTopics : [];
        this.dislikeTopics = Array.isArray(data.dislikeTopics) ? data.dislikeTopics : [];

        // AI配置
        this.temperature = typeof data.temperature === 'number' ? data.temperature : 0.9;
        this.max_tokens = typeof data.max_tokens === 'number' ? data.max_tokens : 2000;

        // 内部标识
        this.id = data.id || this.generateId();
        this.createdAt = data.createdAt || Date.now();
        this.updatedAt = data.updatedAt || Date.now();
    }

    /**
     * 构建系统提示词
     * 如果没有自定义system_prompt，则自动生成
     */
    getSystemPrompt() {
        if (this.system_prompt) {
            return this.system_prompt;
        }

        return this.buildDefaultSystemPrompt();
    }

    /**
     * 构建默认的系统提示词
     */
    buildDefaultSystemPrompt() {
        const parts = [];

        parts.push(`你正在扮演"${this.name}"。`);

        if (this.description) {
            parts.push(`\n【角色设定】\n${this.description}`);
        }

        if (this.personality) {
            parts.push(`\n【性格特征】\n${this.personality}`);
        }

        if (this.scenario) {
            parts.push(`\n【当前场景】\n${this.scenario}`);
        }

        if (this.favoriteTopics.length > 0) {
            parts.push(`\n【喜欢的话题】\n${this.favoriteTopics.join('、')}`);
        }

        if (this.dislikeTopics.length > 0) {
            parts.push(`\n【不喜欢的话题】\n${this.dislikeTopics.join('、')}`);
        }

        parts.push(`\n【角色扮演要求】`);
        parts.push(`1. 严格保持${this.name}的性格和说话方式`);
        parts.push(`2. 回复要简洁自然，中文回复，80字以内`);
        parts.push(`3. 不要说"作为AI"或透露你是语言模型`);
        parts.push(`4. 用第一人称"我"来回复，就像你真的是${this.name}`);

        if (this.mes_example) {
            parts.push(`\n【对话示例参考】\n${this.mes_example}`);
        }

        parts.push(`\n请以${this.name}的身份，自然地回复玩家。`);

        return parts.join('\n');
    }

    /**
     * 获取第一条消息（带随机变体）
     */
    getFirstMessage() {
        if (this.alternate_greetings && this.alternate_greetings.length > 0) {
            // 随机选择一个问候语
            const allGreetings = [this.first_mes, ...this.alternate_greetings];
            const randomIndex = Math.floor(Math.random() * allGreetings.length);
            return allGreetings[randomIndex];
        }

        return this.first_mes;
    }

    /**
     * 获取角色立绘URL
     * @param {string} emotion 情绪类型
     * @returns {string} 图片URL
     */
    getSpriteUrl(emotion = 'neutral') {
        return this.emotions[emotion] || this.emotions.neutral || '';
    }

    /**
     * 转换为JSON（用于存储和导出）
     */
    toJSON() {
        return {
            // SillyTavern标准字段
            spec: this.spec,
            spec_version: this.spec_version,
            data: {
                name: this.name,
                description: this.description,
                personality: this.personality,
                scenario: this.scenario,
                first_mes: this.first_mes,
                mes_example: this.mes_example,
                creator: this.creator,
                character_version: this.character_version,
                tags: this.tags,
                creator_notes: this.creator_notes,
                system_prompt: this.system_prompt,
                post_history_instructions: this.post_history_instructions,
                alternate_greetings: this.alternate_greetings,
                character_book: this.character_book,

                // ChatTavern扩展字段
                extensions: {
                    chattavern: {
                        emotions: this.emotions,
                        favoriteTopics: this.favoriteTopics,
                        dislikeTopics: this.dislikeTopics,
                        temperature: this.temperature,
                        max_tokens: this.max_tokens,
                        id: this.id,
                        createdAt: this.createdAt,
                        updatedAt: this.updatedAt
                    }
                }
            }
        };
    }

    /**
     * 从JSON创建实例（支持多种格式）
     */
    static fromJSON(json) {
        console.log('[CharacterCard] fromJSON开始，输入数据:', json);

        // 处理SillyTavern v2/v3格式（支持所有版本）
        if (json.spec && json.spec.startsWith('chara_card_v') && json.data) {
            const data = json.data;
            const extensions = data.extensions?.chattavern || {};

            console.log('[CharacterCard] 检测到SillyTavern格式:', json.spec);
            console.log('[CharacterCard] extensions.chattavern:', extensions);
            console.log('[CharacterCard] extensions中的id:', extensions.id || '无');

            const result = new CharacterCard({
                // 标准字段
                spec: json.spec,
                spec_version: json.spec_version,
                name: data.name,
                description: data.description,
                personality: data.personality,
                scenario: data.scenario,
                first_mes: data.first_mes,
                mes_example: data.mes_example,
                creator: data.creator,
                character_version: data.character_version,
                tags: data.tags,
                creator_notes: data.creator_notes,
                system_prompt: data.system_prompt,
                post_history_instructions: data.post_history_instructions,
                alternate_greetings: data.alternate_greetings,
                character_book: data.character_book,

                // 扩展字段
                ...extensions
            });

            console.log('[CharacterCard] 创建完成，生成的id:', result.id);
            return result;
        }

        // 处理旧版本或简化格式（aicharactercards.com等）
        // 注意：简化格式也可能已经包含id（从localStorage加载时）
        console.log('[CharacterCard] 使用简化格式处理');
        console.log('[CharacterCard] 简化格式中的id:', json.id || '无');

        const result = new CharacterCard(json);
        console.log('[CharacterCard] 创建完成，最终id:', result.id);
        return result;
    }

    /**
     * 生成唯一ID
     */
    generateId() {
        return 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 验证角色卡数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate() {
        const errors = [];

        // 必填字段检查
        if (!this.name || this.name.trim() === '' || this.name === '未命名角色') {
            errors.push('角色名称不能为空');
        }

        // 放宽验证：只要有名字和第一条消息就可以，其他字段是可选的
        // description和personality不再强制要求

        if (!this.first_mes || this.first_mes.trim() === '') {
            errors.push('第一条消息不能为空');
        }

        // 数据类型检查
        if (this.temperature < 0 || this.temperature > 2) {
            errors.push('Temperature值应该在0-2之间');
        }

        if (this.max_tokens < 10 || this.max_tokens > 8000) {
            errors.push('max_tokens值应该在10-8000之间');
        }

        // 数组字段检查
        if (!Array.isArray(this.tags)) {
            errors.push('tags必须是数组');
        }

        if (!Array.isArray(this.favoriteTopics)) {
            errors.push('favoriteTopics必须是数组');
        }

        if (!Array.isArray(this.dislikeTopics)) {
            errors.push('dislikeTopics必须是数组');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 克隆角色卡
     */
    clone() {
        const cloned = CharacterCard.fromJSON(this.toJSON());
        cloned.id = this.generateId();
        cloned.name = `${this.name} (副本)`;
        cloned.createdAt = Date.now();
        cloned.updatedAt = Date.now();
        return cloned;
    }

    /**
     * 更新时间戳
     */
    touch() {
        this.updatedAt = Date.now();
    }

    /**
     * 获取简要信息
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            creator: this.creator,
            tags: this.tags,
            createdAt: this.createdAt,
            hasSprite: !!this.emotions.neutral
        };
    }

    /**
     * 导出为Markdown格式（用于分享或文档）
     */
    toMarkdown() {
        const lines = [];

        lines.push(`# ${this.name}`);
        lines.push('');

        if (this.creator) {
            lines.push(`**创作者:** ${this.creator}`);
        }

        if (this.tags.length > 0) {
            lines.push(`**标签:** ${this.tags.join(', ')}`);
        }

        lines.push('');
        lines.push('## 角色描述');
        lines.push(this.description || '无');

        lines.push('');
        lines.push('## 性格特征');
        lines.push(this.personality || '无');

        lines.push('');
        lines.push('## 初始场景');
        lines.push(this.scenario || '无');

        lines.push('');
        lines.push('## 第一条消息');
        lines.push(`> ${this.first_mes}`);

        if (this.mes_example) {
            lines.push('');
            lines.push('## 对话示例');
            lines.push(this.mes_example);
        }

        if (this.creator_notes) {
            lines.push('');
            lines.push('## 创作者注释');
            lines.push(this.creator_notes);
        }

        return lines.join('\n');
    }
}
