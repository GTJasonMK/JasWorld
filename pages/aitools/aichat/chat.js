// AI 聊天室 — 多会话核心逻辑
import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { LLMClient } from '@shared/llm/client.js';
import { aiConfigManager } from '@shared/llm/config.js';
import { SessionManager } from './session-manager.js';

bootstrapCore();

class AIChatRoom {
    constructor() {
        this.sessionManager = new SessionManager();
        this.config = this.loadConfig();
        this.isProcessing = false;
        this.autoFollowStream = true;

        // 触摸手势相关
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchMoveX = 0;
        this.touchMoveY = 0;

        this.initUI();
        this.bindEvents();
        this.loadCurrentSession();
    }

    // 加载配置(通过统一的 aiConfigManager,自动应用默认值)
    loadConfig() {
        return aiConfigManager.getWithDefaults();
    }

    refreshConfig() {
        this.config = this.loadConfig();
        return this.config;
    }

    // 保存配置
    saveConfig(config) {
        this.config = { ...this.config, ...config };
        aiConfigManager.save(this.config);
        console.log('[AIChatRoom] 配置已保存');
    }

    // 加载当前会话
    loadCurrentSession() {
        const session = this.sessionManager.getCurrentSession();
        if (session) {
            this.renderMessages(session.messages);
        }
        this.renderSessionsList();
    }

    // 初始化UI
    initUI() {
        this.refreshConfig();
    }

    // 绑定事件
    bindEvents() {
        // 菜单按钮（移动端）- 打开侧边栏显示对话历史
        document.getElementById('menuButton').addEventListener('click', () => {
            this.openSidebar('history');
        });

        // 新对话按钮
        document.getElementById('newChatButton').addEventListener('click', () => {
            this.createNewChat();
        });

        // 清空当前会话
        document.getElementById('clearChat').addEventListener('click', () => {
            if (confirm('确定要清空当前对话记录吗？')) {
                this.clearCurrentChat();
            }
        });

        // 关闭侧边栏按钮（移动端）
        document.getElementById('closeSidebar').addEventListener('click', () => {
            this.closeSidebar();
        });

        // 遮罩层点击关闭侧边栏
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            this.closeSidebar();
        });

        // Tab切换按钮
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 触摸手势 - 左滑显示侧边栏（仅移动端）
        const chatArea = document.querySelector('.chat-area');
        chatArea.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.touchMoveX = this.touchStartX;
            this.touchMoveY = this.touchStartY;
        }, { passive: true });

        chatArea.addEventListener('touchmove', (e) => {
            this.touchMoveX = e.touches[0].clientX;
            this.touchMoveY = e.touches[0].clientY;
        }, { passive: true });

        chatArea.addEventListener('touchend', () => {
            const deltaX = this.touchMoveX - this.touchStartX;
            const deltaY = Math.abs(this.touchMoveY - this.touchStartY);

            // 如果是向右滑动且滑动距离>50px，且垂直滑动距离<30px（排除滚动）
            if (deltaX > 50 && deltaY < 30 && this.touchStartX < 50) {
                this.openSidebar();
            }
        });

        // 发送消息
        document.getElementById('sendButton').addEventListener('click', () => {
            this.sendMessage();
        });

        // 输入框回车发送
        const input = document.getElementById('messageInput');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 输入框自动调整高度
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        });

        const messagesContainer = document.getElementById('messagesContainer');
        const updateAutoFollowFromUserScroll = () => {
            if (messagesContainer.classList.contains('streaming-active')) {
                requestAnimationFrame(() => {
                    this.autoFollowStream = this.isNearBottom(messagesContainer);
                });
            }
        };
        messagesContainer.addEventListener('wheel', updateAutoFollowFromUserScroll, { passive: true });
        messagesContainer.addEventListener('touchmove', updateAutoFollowFromUserScroll, { passive: true });
        messagesContainer.addEventListener('pointerup', updateAutoFollowFromUserScroll, { passive: true });
        window.addEventListener('keydown', (e) => {
            const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
            if (scrollKeys.includes(e.key)) {
                updateAutoFollowFromUserScroll();
            }
        }, { passive: true });

        window.addEventListener('pageshow', () => {
            this.refreshConfig();
        });
    }

    // 侧边栏控制
    openSidebar(tab = 'history') {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        // 切换到指定tab
        this.switchTab(tab);

        // 显示侧边栏
        sidebar.classList.add('active');
        overlay.classList.add('active');
    }

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    // Tab切换
    switchTab(tabName) {
        // 切换tab按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 切换面板显示
        document.querySelectorAll('.tab-panel').forEach(panel => {
            if (panel.id === `${tabName}Panel`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
    }

    // 创建新对话
    createNewChat() {
        this.sessionManager.createSession();
        this.renderSessionsList();
        this.loadCurrentSession();
        this.closeSidebar();
    }

    // 切换会话
    switchSession(sessionId) {
        const session = this.sessionManager.switchSession(sessionId);
        if (session) {
            this.renderMessages(session.messages);
            this.renderSessionsList();
            this.closeSidebar();
        }
    }

    // 删除会话
    deleteSession(sessionId) {
        if (confirm('确定要删除这个对话吗？')) {
            this.sessionManager.deleteSession(sessionId);
            this.renderSessionsList();
            this.loadCurrentSession();
        }
    }

    // 清空当前会话
    clearCurrentChat() {
        this.sessionManager.clearCurrentSession();
        this.loadCurrentSession();
    }

    // 渲染会话列表
    renderSessionsList() {
        const container = document.getElementById('sessionsList');
        const sessions = this.sessionManager.getSessionsSummary();

        if (sessions.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.5;">暂无对话历史</div>';
            return;
        }

        container.innerHTML = sessions.map(session => {
            const date = new Date(session.lastUpdated);
            const timeStr = this.formatTime(date);
            const activeClass = session.isCurrent ? 'active' : '';

            return `
                <div class="session-item ${activeClass}" data-session-id="${session.id}">
                    <div class="session-content">
                        <div class="session-title">${this.escapeHtml(session.title)}</div>
                        <div class="session-time">${timeStr} · ${session.messageCount}条消息</div>
                    </div>
                    <div class="session-actions">
                        <button class="session-btn btn-delete" data-session-id="${session.id}" title="删除">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定会话项点击事件
        container.querySelectorAll('.session-item').forEach(item => {
            const sessionId = item.dataset.sessionId;

            item.addEventListener('click', (e) => {
                // 如果点击的是删除按钮，不触发切换
                if (!e.target.classList.contains('btn-delete') && !e.target.closest('.btn-delete')) {
                    this.switchSession(sessionId);
                }
            });
        });

        // 绑定删除按钮事件
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.sessionId;
                this.deleteSession(sessionId);
            });
        });
    }

    // 格式化时间
    formatTime(date) {
        const now = new Date();
        const diff = now - date;

        // 1分钟内
        if (diff < 60000) {
            return '刚刚';
        }

        // 1小时内
        if (diff < 3600000) {
            return Math.floor(diff / 60000) + '分钟前';
        }

        // 今天
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }

        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return '昨天';
        }

        // 一周内
        if (diff < 7 * 24 * 3600000) {
            const days = ['日', '一', '二', '三', '四', '五', '六'];
            return '周' + days[date.getDay()];
        }

        // 更早
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }

    // HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 发送消息
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();

        if (!message || this.isProcessing) {
            return;
        }

        this.refreshConfig();

        if (!this.config.enabled || !this.config.apiKey) {
            alert('请先到个人偏好中的“AI服务”配置API信息');
            return;
        }

        // 添加用户消息到当前会话
        this.sessionManager.addMessageToCurrentSession({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });

        input.value = '';
        input.style.height = 'auto';

        // 重新渲染消息和会话列表
        const currentSession = this.sessionManager.getCurrentSession();
        this.renderMessages(currentSession.messages);
        this.renderSessionsList();

        // 显示输入状态
        this.setStatus('AI正在聆听并思索...');
        this.isProcessing = true;
        document.getElementById('sendButton').disabled = true;

        // 显示打字动画
        this.showTypingIndicator();

        let streamingMessage = null;
        let streamedContent = '';

        try {
            // 获取上下文（最近10条历史消息，不包含刚输入的当前消息）
            const context = currentSession.messages.slice(0, -1).slice(-10);

            const appendStreamChunk = (chunk) => {
                streamedContent += chunk;
                if (!streamingMessage) {
                    streamingMessage = this.createStreamingMessage();
                }
                this.updateStreamingMessage(streamingMessage, streamedContent);
            };

            // 调用API并实时渲染流式片段
            const response = await this.callAPI(message, context, appendStreamChunk);

            // 添加AI回复到当前会话
            this.sessionManager.addMessageToCurrentSession({
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            });

            if (streamingMessage) {
                this.updateStreamingMessage(streamingMessage, response);
                streamingMessage.classList.remove('streaming');
                this.finishStreamingMessage();
            } else {
                this.removeTypingIndicator();

                const updatedSession = this.sessionManager.getCurrentSession();
                this.renderMessages(updatedSession.messages);
            }
            this.renderSessionsList();

            this.setStatus('');
        } catch (error) {
            this.setStatus('');

            const errorMsg = `抱歉，遇到了一些问题：\n${error.message}`;
            const interruptedContent = typeof streamedContent === 'string' && streamedContent.trim()
                ? `${streamedContent}\n\n[响应中断] ${error.message}`
                : errorMsg;

            if (streamingMessage) {
                this.updateStreamingMessage(streamingMessage, interruptedContent);
                streamingMessage.classList.remove('streaming');
                this.finishStreamingMessage();
            } else {
                this.removeTypingIndicator();
            }

            this.sessionManager.addMessageToCurrentSession({
                role: 'assistant',
                content: interruptedContent,
                timestamp: Date.now()
            });

            if (!streamingMessage) {
                const updatedSession = this.sessionManager.getCurrentSession();
                this.renderMessages(updatedSession.messages);
            }

            console.error('[AIChatRoom] 发送消息失败:', error);
        } finally {
            this.finishStreamingMessage();
            this.isProcessing = false;
            document.getElementById('sendButton').disabled = false;
            input.focus();
        }
    }

    // 调用API（使用新的LLMClient）
    async callAPI(userMessage, context, onContent = null) {
        if (!this.config.apiKey) {
            throw new Error('请先配置API密钥');
        }

        // 构建消息数组
        const messages = [];

        // 添加system prompt
        if (this.config.systemPrompt) {
            messages.push({
                role: 'system',
                content: this.config.systemPrompt
            });
        }

        // 添加历史对话
        context.forEach(msg => {
            const role = this.toApiRole(msg.role);
            if (!role || !msg.content) return;
            messages.push({
                role,
                content: msg.content
            });
        });

        // 添加当前消息
        messages.push({
            role: 'user',
            content: userMessage
        });

        // 创建LLM客户端
        const client = LLMClient.createFromConfig({
            apiKey: this.config.apiKey,
            baseUrl: this.config.apiUrl,
            model: this.config.model,
        });

        console.log('[AIChatRoom] ========== API请求详情 ==========');
        console.log('[AIChatRoom] 使用LLMClient统一封装');
        console.log('[AIChatRoom] 模型:', this.config.model);
        console.log('[AIChatRoom] 消息数量:', messages.length);
        console.log('[AIChatRoom] Temperature:', this.config.temperature);
        console.log('[AIChatRoom] Max Tokens:', this.config.maxTokens);

        try {
            // 使用流式方法，onContent 会在每个内容片段到达时更新界面。
            const result = await client.stream(messages, {
                timeout: 120,  // 超时120秒
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                maxRetries: onContent ? 0 : 2
            }, ({ type, text }) => {
                if (type === 'content' && text) {
                    onContent?.(text);
                }
            });

            console.log('[AIChatRoom] 请求成功');
            console.log('[AIChatRoom] 返回内容长度:', result.content.length);
            console.log('[AIChatRoom] Chunks数量:', result.chunkCount);

            // 如果有reasoning内容（DeepSeek R1等），可以选择性显示
            if (result.reasoning) {
                console.log('[AIChatRoom] Reasoning长度:', result.reasoning.length);
                // 可以在这里决定是否将reasoning也返回给用户
            }

            return result.content;

        } catch (error) {
            console.error('[AIChatRoom] ========== 请求失败详情 ==========');
            console.error('[AIChatRoom] 错误信息:', error.message);

            // LLMClient已经处理了大部分错误，这里只需要添加用户友好的提示
            if (error.message.includes('网络连接失败')) {
                throw new Error(`网络连接失败

可能的原因：
1. API服务器未配置CORS允许跨域访问
2. API地址不正确: ${this.config.apiUrl || '(未设置)'}
3. 网络连接问题

解决方案：
- New API：添加环境变量 ALLOWED_ORIGIN="*"
- 检查API地址是否正确
- 检查网络连接是否正常
- 查看浏览器Console了解详细错误

详细错误: ${error.message}`);
            }

            throw error;
        }
    }

    toApiRole(role) {
        if (role === 'ai' || role === 'bot' || role === 'model') return 'assistant';
        if (role === 'human') return 'user';
        if (role === 'system' || role === 'user' || role === 'assistant') return role;
        return null;
    }

    // 渲染消息
    renderMessage(message) {
        const container = document.getElementById('messagesContainer');

        // 移除欢迎消息
        const welcome = container.querySelector('.welcome-message');
        if (welcome) {
            welcome.remove();
        }

        const messageDiv = document.createElement('div');
        const displayRole = this.toDisplayRole(message.role);
        messageDiv.className = `message ${displayRole}`;

        // 创建头像
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = displayRole === 'user' ? '👤' : '🤖';

        // 创建气泡（只包含内容）
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = this.formatContent(message.content);

        // 创建时间戳
        const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        timeEl.textContent = time;

        // 组装
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
        messageDiv.appendChild(timeEl);

        container.appendChild(messageDiv);
    }

    toDisplayRole(role) {
        return role === 'user' ? 'user' : 'assistant';
    }

    // 渲染所有消息
    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="welcome-message">
                    <h2>👋 欢迎进入思绪的空间</h2>
                    <p>在这里，每个问题都值得被倾听，每份困惑都能得到解答</p>
                    <div class="quick-tips">
                        <h4>💡 开始对话：</h4>
                        <ul>
                            <li>点击右上角设置按钮，在个人偏好中配置AI服务</li>
                            <li>支持New API、OpenAI、DeepSeek等服务</li>
                            <li>只需填写base URL，系统会自动补全</li>
                            <li>对话会被妥善保存在本地</li>
                            <li>支持连贯的多轮对话</li>
                            <li>支持多会话管理，左侧查看历史对话</li>
                        </ul>
                    </div>
                </div>
            `;
            container.scrollTop = 0;
        } else {
            messages.forEach(msg => this.renderMessage(msg));
            this.scrollToBottom();
        }
    }

    // 格式化内容（支持换行）
    formatContent(content) {
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }

    // 显示打字动画
    showTypingIndicator() {
        const container = document.getElementById('messagesContainer');
        const indicator = document.createElement('div');
        indicator.className = 'message ai';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        container.appendChild(indicator);
        this.scrollToBottom();
    }

    // 移除打字动画
    removeTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    createStreamingMessage() {
        this.removeTypingIndicator();

        const container = document.getElementById('messagesContainer');
        container.classList.add('streaming-active');
        this.autoFollowStream = true;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant streaming';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        timeEl.textContent = new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
        messageDiv.appendChild(timeEl);
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
        return messageDiv;
    }

    updateStreamingMessage(messageDiv, content) {
        const bubble = messageDiv.querySelector('.message-bubble');
        if (!bubble) return;
        const container = document.getElementById('messagesContainer');
        bubble.innerHTML = this.formatContent(content || '');
        if (this.autoFollowStream) {
            this.scrollToBottomNow(container);
            requestAnimationFrame(() => this.scrollToBottomNow(container));
        }
    }

    finishStreamingMessage() {
        const container = document.getElementById('messagesContainer');
        container.classList.remove('streaming-active');
    }

    // 设置状态文本
    setStatus(text) {
        document.getElementById('inputStatus').textContent = text;
    }

    // 滚动到底部
    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        setTimeout(() => {
            if (container.classList.contains('streaming-active')) return;
            this.scrollToBottomNow(container);
        }, 100);
    }

    scrollToBottomNow(container) {
        const previousScrollBehavior = container.style.scrollBehavior;
        container.style.scrollBehavior = 'auto';
        container.scrollTop = container.scrollHeight;
        container.style.scrollBehavior = previousScrollBehavior;
    }

    isNearBottom(container, threshold = 48) {
        return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AIChatRoom();
    console.log('[AIChatRoom] 初始化完成 - 支持多会话管理');
});
