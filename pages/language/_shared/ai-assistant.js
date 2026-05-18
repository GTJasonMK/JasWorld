/**
 * AI助手基类
 * 负责AI查询、历史管理和UI更新
 *
 * 子类（各语言入口）在构造时注入 prompts 模板对象。
 */
import { renderMarkdown } from '@shared/markdown/renderer.js';
import { LLMClient } from '@shared/llm/client.js';
import { aiConfigManager } from '@shared/llm/config.js';
import { QueryState } from './query-state.js';
import { PregeneratedDataLoader } from './pregenerated-loader.js';

export class AIAssistant {
    /**
     * @param {Object} opts
     * @param {string} opts.bookId - 词汇书ID
     * @param {string} opts.language - 语言标识（如 'english', 'japanese'）
     * @param {Object} opts.prompts - 提示词模板对象 { synonyms, phrases, synonyms_latest, phrases_latest, custom }
     */
    constructor({ bookId = null, language = 'english', prompts = {} } = {}) {
        this.responseHistory = [];
        this.currentIndex = -1;
        this.currentWord = null;
        this.cache = new Map();
        this.llmClient = null;
        this.language = language;

        this.queryStates = new Map();
        this.latestCache = new Map();
        this.pregeneratedLoader = null;

        if (bookId) {
            this.pregeneratedLoader = new PregeneratedDataLoader(bookId, language);
            console.log(`[AIAssistant] 预生成加载器已初始化: ${bookId}`);
        }

        this.templates = {
            synonyms: prompts.synonyms || ((_word, _definition) => ''),
            phrases: prompts.phrases || ((_word, _definition) => ''),
            synonyms_latest: prompts.synonyms_latest || ((_word, _definition) => ''),
            phrases_latest: prompts.phrases_latest || ((_word, _definition) => ''),
            custom: prompts.custom || ((word, question) => `关于单词"${word}"：${question}。请简洁回答。`),
        };

        this.buttonTexts = {
            synonyms: {
                default: '相近释义及区别',
                hasPregenerated: '查询最新释义变化',
                hasLatest: '查看预生成内容'
            },
            phrases: {
                default: '短语及用法',
                hasPregenerated: '查询最新短语搭配',
                hasLatest: '查看预生成内容'
            }
        };

        // DOM元素
        this.container = document.getElementById('ai-output-container');
        this.outputBox = document.getElementById('ai-output-box');
        this.outputLabel = document.getElementById('ai-output-label');
        this.responseIndex = document.getElementById('ai-response-index');
        this.prevBtn = document.getElementById('ai-nav-prev');
        this.nextBtn = document.getElementById('ai-nav-next');
        this.aiButtons = document.querySelectorAll('.ai-btn[data-type]');
    }

    setCurrentWord(word) {
        this.currentWord = word;
        this.updateButtonStates();
    }

    getStateKey(type) {
        if (!this.currentWord) return null;
        return `${this.currentWord.word}_${type}`;
    }

    getQueryState(type) {
        const key = this.getStateKey(type);
        return this.queryStates.get(key) || QueryState.UNQUERIED;
    }

    setQueryState(type, state) {
        const key = this.getStateKey(type);
        if (key) {
            this.queryStates.set(key, state);
            this.updateButtonStates();
        }
    }

    updateButtonStates() {
        this.aiButtons.forEach(btn => {
            const type = btn.dataset.type;
            if (!type || !this.buttonTexts[type]) return;

            const state = this.getQueryState(type);
            const textSpan = btn.querySelector('.ai-btn-text');
            if (!textSpan) return;

            const config = this.buttonTexts[type];
            let newText = config.default;

            switch (state) {
                case QueryState.UNQUERIED:
                    newText = config.default;
                    break;
                case QueryState.PREGENERATED:
                    newText = config.hasPregenerated;
                    break;
                case QueryState.LATEST:
                    newText = config.hasLatest;
                    break;
                case QueryState.LOADING_LATEST:
                    newText = '生成中...';
                    break;
                case QueryState.ERROR:
                    newText = '重试';
                    break;
            }

            textSpan.textContent = newText;
        });
    }

    async loadPregenerated(type) {
        if (!this.pregeneratedLoader) {
            console.log('[AIAssistant] 预生成加载器未初始化，降级到实时查询');
            return false;
        }

        try {
            const wordData = await this.pregeneratedLoader.getWord(this.currentWord.word);

            if (!wordData || !wordData[type]) {
                console.log(`[AIAssistant] 未找到单词"${this.currentWord.word}"的预生成${type}数据`);
                return false;
            }

            const content = wordData[type].content;
            this.addToHistory(type, '', content, 'pregenerated');
            this.setQueryState(type, QueryState.PREGENERATED);
            this.displayCurrent();
            console.log(`[AIAssistant] 成功加载预生成内容: ${type}`);
            return true;
        } catch (error) {
            console.error('[AIAssistant] 加载预生成内容失败:', error);
            return false;
        }
    }

    async loadLatest(type, customQuestion = '') {
        const cacheKey = this.getCacheKey(type + '_latest', customQuestion);
        if (this.latestCache.has(cacheKey)) {
            console.log('[AIAssistant] 使用缓存的最新内容');
            const cached = this.latestCache.get(cacheKey);
            this.addToHistory(type, customQuestion, cached, 'latest');
            this.setQueryState(type, QueryState.LATEST);
            this.displayCurrent();
            return;
        }

        this.setQueryState(type, QueryState.LOADING_LATEST);
        this.showStreamingLoading(type, '查询最新内容中...');

        try {
            const prompt = this.buildPrompt(type + '_latest', customQuestion);
            const response = await this.queryFromAPI(prompt);

            this.latestCache.set(cacheKey, response);

            if (this.latestCache.size > 50) {
                const firstKey = this.latestCache.keys().next().value;
                this.latestCache.delete(firstKey);
            }

            this.addToHistory(type, customQuestion, response, 'latest');
            this.setQueryState(type, QueryState.LATEST);
            this.displayCurrent();
            console.log(`[AIAssistant] 成功获取最新内容: ${type}`);
        } catch (error) {
            console.error('[AIAssistant] 加载最新内容失败:', error);
            this.setQueryState(type, QueryState.ERROR);
            this.showError(`查询失败: ${error.message}`);
        }
    }

    async queryFromAPI(prompt) {
        if (!await this.ensureAIClient()) {
            throw new Error('AI客户端未初始化');
        }

        const messages = [
            {
                role: 'system',
                content: '你是一个专业的语言学习助手。请用简洁、清晰的方式回答，避免冗余。使用markdown格式组织内容，保持精练。'
            },
            { role: 'user', content: prompt }
        ];

        let accumulatedContent = '';
        let lastUpdateTime = 0;

        const onChunk = ({ type: chunkType, text }) => {
            if (chunkType === 'content') {
                accumulatedContent += text;
                const now = Date.now();
                if (now - lastUpdateTime >= 30) {
                    lastUpdateTime = now;
                    this.updateStreamingContentFast(accumulatedContent);
                }
            }
        };

        const result = await this.llmClient.stream(messages, {
            timeout: 120,
            temperature: this.temperature,
            maxTokens: this.maxTokens,
            maxRetries: 2
        }, onChunk);

        const response = result.content;

        if (result.finishReason === 'length') {
            const warningHtml = '<div class="ai-truncation-warning"><strong>提示：</strong>回复因长度限制被截断，以下是部分内容。</div>';
            this.outputBox.innerHTML = warningHtml + this.formatResponse(response);
            this.outputBox.scrollTop = this.outputBox.scrollHeight;
        } else {
            this.updateStreamingContent(response);
        }

        return response;
    }

    loadHistory(aiResponses) {
        this.responseHistory = aiResponses.map(r => ({
            word: { ...r.word },
            type: r.type,
            question: r.question,
            response: r.response,
            timestamp: r.timestamp
        }));
        this.currentIndex = this.responseHistory.length > 0 ? this.responseHistory.length - 1 : -1;
    }

    async query(type, customQuestion = '') {
        if (!this.currentWord) {
            this.showError('请先选择一个单词');
            return;
        }

        if (type === 'custom') {
            await this.handleCustomQuery(customQuestion);
            return;
        }

        const currentState = this.getQueryState(type);
        console.log(`[AIAssistant] 当前状态: ${currentState}, 类型: ${type}`);

        switch (currentState) {
            case QueryState.UNQUERIED: {
                const loaded = await this.loadPregenerated(type);
                if (!loaded) {
                    console.log('[AIAssistant] 预生成内容不可用，降级到实时查询');
                    await this.loadLatest(type);
                }
                break;
            }
            case QueryState.PREGENERATED:
                await this.loadLatest(type);
                break;
            case QueryState.LATEST:
                if (this.pregeneratedLoader) {
                    await this.loadPregenerated(type);
                }
                break;
            case QueryState.ERROR: {
                const retryLoaded = await this.loadPregenerated(type);
                if (!retryLoaded) await this.loadLatest(type);
                break;
            }
            case QueryState.LOADING_LATEST:
                console.log('[AIAssistant] 正在加载中，请稍候...');
                break;
        }
    }

    async handleCustomQuery(question) {
        if (!await this.ensureAIClient()) return;

        const prompt = this.templates.custom(this.currentWord.word, question);
        this.showStreamingLoading('custom', '查询中...');

        try {
            const response = await this.queryFromAPI(prompt);
            this.addToHistory('custom', question, response, 'custom');
            this.displayCurrent();
        } catch (error) {
            console.error('[AIAssistant] 自定义问题查询失败:', error);
            this.showError(`查询失败: ${error.message}`);
        }
    }

    async ensureAIClient() {
        if (this.llmClient) return true;

        const config = aiConfigManager.getWithDefaults();
        const validation = aiConfigManager.validate?.(config);
        if (validation && !validation.valid) {
            this.showConfigPrompt();
            return false;
        }

        try {
            this.llmClient = LLMClient.createFromConfig({
                apiKey: config.apiKey,
                baseUrl: config.apiUrl,
                model: config.model,
            });
            this.temperature = config.temperature || 0.7;
            this.maxTokens = config.maxTokens || 4000;
            console.log('[AIAssistant] AI客户端初始化成功');
            return true;
        } catch (error) {
            console.error('[AIAssistant] 初始化AI客户端失败:', error);
            this.showError(`初始化失败: ${error.message}`);
            return false;
        }
    }

    buildPrompt(type, customQuestion) {
        if (type === 'custom') {
            return this.templates.custom(this.currentWord.word, customQuestion);
        }
        const templateName = type.replace('_latest', '_latest');
        if (this.templates[templateName]) {
            return this.templates[templateName](this.currentWord.word, this.currentWord.definition);
        }
        return this.templates[type](this.currentWord.word, this.currentWord.definition);
    }

    getCacheKey(type, question) {
        return `${this.currentWord.word}_${type}_${question || ''}`;
    }

    addToHistory(type, question, response, source = 'unknown') {
        this.responseHistory.push({
            word: { ...this.currentWord },
            type, question, response, source,
            timestamp: Date.now()
        });
        this.currentIndex = this.responseHistory.length - 1;
    }

    displayCurrent() {
        if (this.currentIndex < 0 || this.currentIndex >= this.responseHistory.length) return;

        const current = this.responseHistory[this.currentIndex];
        this.container.style.display = 'flex';

        const typeLabels = {
            synonyms: '相近释义',
            phrases: '短语用法',
            custom: '自定义问题'
        };

        this.outputLabel.textContent = `${typeLabels[current.type] || current.type} | ${current.word.word}`;
        if (current.source) {
            this.outputLabel.setAttribute('data-source', current.source);
        } else {
            this.outputLabel.removeAttribute('data-source');
        }

        this.responseIndex.textContent = `${this.currentIndex + 1}/${this.responseHistory.length}`;
        this.outputBox.innerHTML = this.formatResponse(current.response);

        this.prevBtn.disabled = this.currentIndex === 0;
        this.nextBtn.disabled = this.currentIndex === this.responseHistory.length - 1;
    }

    formatResponse(content) {
        if (!content) return '';
        try {
            let text = content.trim();
            if (text.startsWith('```markdown\n') && text.endsWith('```')) {
                text = text.slice(12, -3).trim();
            } else if (text.startsWith('```\n') && text.endsWith('```')) {
                text = text.slice(4, -3).trim();
            }
            return renderMarkdown(text);
        } catch (error) {
            console.error('格式化响应失败:', error);
            return content.replace(/\n/g, '<br>');
        }
    }

    navigate(direction) {
        if (direction === 'prev' && this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrent();
        } else if (direction === 'next' && this.currentIndex < this.responseHistory.length - 1) {
            this.currentIndex++;
            this.displayCurrent();
        }
    }

    showLoading(type) {
        const typeLabels = {
            synonyms: '相近释义',
            phrases: '短语用法',
            custom: '自定义问题'
        };
        this.container.style.display = 'flex';
        this.outputLabel.textContent = `${typeLabels[type]} | ${this.currentWord.word}`;
        this.outputBox.innerHTML = '<div class="ai-loading">查询中，请稍候...</div>';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
    }

    showStreamingLoading(type, message = '生成中...') {
        const typeLabels = {
            synonyms: '相近释义',
            phrases: '短语用法',
            custom: '自定义问题'
        };
        this.container.style.display = 'flex';
        this.outputLabel.textContent = `${typeLabels[type] || type} | ${this.currentWord.word}`;
        this.outputBox.innerHTML = `<div class="ai-loading">${message}</div>`;
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
        this.responseIndex.textContent = '加载中';
    }

    updateStreamingContentFast(content) {
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');
        this.outputBox.innerHTML = escaped;
        this.outputBox.scrollTop = this.outputBox.scrollHeight;
    }

    updateStreamingContent(content) {
        this.outputBox.innerHTML = this.formatResponse(content);
        this.outputBox.scrollTop = this.outputBox.scrollHeight;
    }

    showError(message) {
        this.container.style.display = 'flex';
        this.outputBox.innerHTML = `<div class="ai-error"><div>${message}</div></div>`;
    }

    showConfigPrompt() {
        this.container.style.display = 'flex';
        this.outputLabel.textContent = '未配置AI服务';
        this.outputBox.innerHTML = `
            <div class="ai-error">
                <div>未配置AI服务</div>
                <div class="ai-error-actions">
                    <button class="ai-error-btn" onclick="window.location.href='../../aitools/aichat/index.html'">
                        前往配置
                    </button>
                </div>
            </div>
        `;
    }
}
