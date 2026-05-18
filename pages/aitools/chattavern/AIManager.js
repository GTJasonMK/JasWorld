/**
 * AI 管理器 - 负责调用各种 LLM API
 * - OpenAI / DeepSeek / 自定义 兼容服务通过 LLMClient 统一封装
 * - Claude 因消息格式不同,保留独立实现
 */

import { LLMClient } from '@shared/llm/client.js';
import { aiConfigManager } from '@shared/llm/config.js';

export class AIManager {
    constructor() {
        this.config = this.loadConfig();
        this.llmClient = null;
    }

    loadConfig() {
        const stored = aiConfigManager.getWithDefaults();
        return {
            provider: 'custom',
            apiKey: '',
            persistApiKey: false,
            model: 'gpt-3.5-turbo',
            apiUrl: '',
            temperature: 0.9,
            maxTokens: 4000,
            enabled: true,
            ...stored,
        };
    }

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        aiConfigManager.save(this.config);
        console.log('[AIManager] 配置已保存');
        this.llmClient = null;
    }

    async isAvailable() {
        return this.config.enabled && this.config.apiKey && this.config.apiKey.length > 0;
    }

    initializeLLMClient() {
        if (this.llmClient) return this.llmClient;
        this.llmClient = LLMClient.createFromConfig({
            apiKey: this.config.apiKey,
            baseUrl: this.config.apiUrl,
            model: this.config.model,
        });
        return this.llmClient;
    }

    async getResponse(characterId, userMessage, context, character, onContent = null) {
        if (!(await this.isAvailable())) throw new Error('AI未配置或未启用');

        try {
            switch (this.config.provider) {
                case 'openai':
                case 'deepseek':
                case 'custom':
                    return await this.callOpenAI(userMessage, context, character, onContent);
                case 'claude':
                    return await this.callClaude(userMessage, context, character, onContent);
                default:
                    throw new Error('不支持的AI提供商: ' + this.config.provider);
            }
        } catch (error) {
            console.error('[AIManager] AI调用失败:', error);
            throw error;
        }
    }

    async callOpenAI(userMessage, context, character, onContent = null) {
        this.initializeLLMClient();

        const messages = [];
        if (character) {
            messages.push({ role: 'system', content: character.getSystemPrompt() });
        }
        if (Array.isArray(context)) {
            for (const msg of context) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content,
                });
            }
        }
        messages.push({ role: 'user', content: userMessage });

        try {
            const result = await this.llmClient.stream(messages, {
                timeout: 120,
                temperature: character?.temperature ?? this.config.temperature,
                maxTokens: character?.max_tokens ?? this.config.maxTokens,
                maxRetries: onContent ? 0 : 2,
            }, ({ type, text }) => {
                if (type === 'content' && text) {
                    onContent?.(text);
                }
            });
            return result.content;
        } catch (error) {
            if (error.message.includes('网络连接失败')) {
                throw new Error(
                    `网络请求失败(可能是CORS跨域问题)。请确认 API 服务器允许跨域,或检查 API URL:${this.config.apiUrl || '(未设置)'}\n详细错误: ${error.message}`
                );
            }
            throw error;
        }
    }

    async callClaude(userMessage, context, character, onContent = null) {
        const apiUrl = this.config.apiUrl || 'https://api.anthropic.com/v1/messages';
        const messages = [];
        let systemPrompt = '';
        if (character) systemPrompt = character.getSystemPrompt();
        if (Array.isArray(context)) {
            for (const msg of context) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content,
                });
            }
        }
        messages.push({ role: 'user', content: userMessage });

        const requestBody = {
            model: this.config.model || 'claude-3-sonnet-20240229',
            max_tokens: character?.max_tokens ?? this.config.maxTokens,
            temperature: character?.temperature ?? this.config.temperature,
            messages,
        };
        if (systemPrompt) requestBody.system = systemPrompt;
        if (onContent) requestBody.stream = true;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `Claude API错误: ${response.status} - ${errorData.error?.message || response.statusText}`
            );
        }

        if (onContent) {
            return await parseClaudeStream(response, onContent);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    getConfig() {
        return { ...this.config };
    }

    async testConnection() {
        if (!this.config.apiKey) return { success: false, message: '请先输入API Key' };
        try {
            const testCharacter = {
                getSystemPrompt: () => '你是一个友好的助手',
                temperature: this.config.temperature,
                max_tokens: 100,
            };
            await this.getResponse('test', '你好', [], testCharacter);
            return { success: true, message: 'API连接成功!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

async function parseClaudeStream(response, onContent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';

    try {
        let doneReading = false;
        while (!doneReading) {
            const { done, value } = await reader.read();
            doneReading = done;
            if (doneReading) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;

                const payload = trimmed.slice(6);
                if (!payload || payload === '[DONE]') continue;

                const data = JSON.parse(payload);
                if (data.type === 'error') {
                    throw new Error(data.error?.message || 'Claude流式响应错误');
                }

                const text = data.delta?.text;
                if (text) {
                    content += text;
                    onContent(text);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!content) {
        throw new Error('未收到有效响应');
    }

    return content;
}
