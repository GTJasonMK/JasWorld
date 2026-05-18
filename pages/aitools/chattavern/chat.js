/**
 * ChatTavern 对话页入口
 *
 * 负责对话界面的消息收发、AI配置管理。
 */

import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { ChatTavern } from './ChatTavern.js';

bootstrapCore();

let chatTavern;
let characterId;
let isSending = false;
let autoFollowStream = true;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    characterId = params.get('id');

    if (!characterId) {
        alert('未指定角色');
        location.href = 'chattavern.html';
        return;
    }

    chatTavern = new ChatTavern();
    await chatTavern.init();

    try {
        const { character } = await chatTavern.startChat(characterId);
        document.getElementById('characterName').textContent = character.name;

        // 加载历史消息（包含第一条消息）
        loadHistory();

    } catch (error) {
        alert('角色不存在');
        location.href = 'chattavern.html';
        return;
    }

    // 绑定事件
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const chatMain = document.querySelector('.chat-main');
    const updateAutoFollowFromUserScroll = () => {
        if (chatMain.classList.contains('streaming-active')) {
            requestAnimationFrame(() => {
                autoFollowStream = isNearBottom(chatMain);
            });
        }
    };
    chatMain.addEventListener('wheel', updateAutoFollowFromUserScroll, { passive: true });
    chatMain.addEventListener('touchmove', updateAutoFollowFromUserScroll, { passive: true });
    chatMain.addEventListener('pointerup', updateAutoFollowFromUserScroll, { passive: true });
    window.addEventListener('keydown', (e) => {
        const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
        if (scrollKeys.includes(e.key)) {
            updateAutoFollowFromUserScroll();
        }
    }, { passive: true });

    // 绑定AI配置相关事件
    document.querySelector('.btn-menu').addEventListener('click', () => {
        showAIConfig();
    });

    document.getElementById('closeAIConfig').addEventListener('click', () => {
        document.getElementById('aiConfigModal').style.display = 'none';
    });

    document.getElementById('aiProvider').addEventListener('change', (e) => {
        document.getElementById('customApiSection').style.display =
            e.target.value === 'custom' ? 'block' : 'none';
    });

    document.getElementById('saveAIConfig').addEventListener('click', saveAIConfig);
    document.getElementById('testAIConnection').addEventListener('click', testAIConnection);

    // 点击模态窗口外部关闭
    document.getElementById('aiConfigModal').addEventListener('click', (e) => {
        if (e.target.id === 'aiConfigModal') {
            document.getElementById('aiConfigModal').style.display = 'none';
        }
    });
});

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const message = input.value.trim();

    if (!message || isSending) return;

    isSending = true;
    sendBtn.disabled = true;

    // 清空输入
    input.value = '';

    // 显示用户消息
    addMessage('user', message);

    // 显示临时回复气泡，收到流式片段后实时替换内容。
    const typingId = addMessage('assistant', '正在输入...', true);
    setMessageStreaming(typingId, true);
    let streamedContent = '';

    try {
        const response = await chatTavern.sendMessage(message, (chunk) => {
            streamedContent += chunk;
            updateMessage(typingId, streamedContent);
        });

        updateMessage(typingId, response);
        setMessageStreaming(typingId, false);

    } catch (error) {
        const content = streamedContent.trim()
            ? `${streamedContent}\n\n[响应中断] ${error.message}`
            : '发送失败: ' + error.message;
        updateMessage(typingId, content);
        setMessageStreaming(typingId, false);
        if (!streamedContent.trim()) {
            const el = document.getElementById(typingId);
            if (el) {
                el.classList.remove('message-assistant');
                el.classList.add('message-system');
                const avatar = el.querySelector('.message-avatar');
                if (avatar) avatar.textContent = '!';
            }
        }
    } finally {
        isSending = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

function addMessage(role, content, isTemporary = false) {
    const messageList = document.getElementById('messageList');
    const chatMain = messageList.closest('.chat-main');
    const messageEl = document.createElement('div');

    messageEl.className = `message message-${role}`;
    if (isTemporary) {
        messageEl.id = `msg-temp-${Date.now()}`;
    }

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '你' : (role === 'assistant' ? chatTavern.currentCharacter.name[0] : '!');

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    messageEl.appendChild(avatar);
    messageEl.appendChild(bubble);
    messageList.appendChild(messageEl);

    // 新消息由当前操作产生时，直接显示到最新位置。
    scrollToBottom(chatMain);

    return messageEl.id;
}

function updateMessage(id, content) {
    const el = document.getElementById(id);
    const bubble = el?.querySelector('.message-bubble');
    if (!bubble) return;
    const chatMain = el.closest('.chat-main');
    bubble.textContent = content;
    if (autoFollowStream) {
        scrollToBottom(chatMain);
        requestAnimationFrame(() => scrollToBottom(chatMain));
    }
}

function setMessageStreaming(id, isStreaming) {
    const el = document.getElementById(id);
    const messageList = document.getElementById('messageList');
    const chatMain = messageList.closest('.chat-main');
    if (!el) return;
    el.classList.toggle('streaming', isStreaming);
    messageList.classList.toggle('streaming-active', isStreaming);
    chatMain?.classList.toggle('streaming-active', isStreaming);
    if (isStreaming) {
        autoFollowStream = true;
    }
}

function scrollToBottom(container) {
    if (!container) return;
    const previousScrollBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = container.scrollHeight;
    container.style.scrollBehavior = previousScrollBehavior;
}

function isNearBottom(container, threshold = 48) {
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

function loadHistory() {
    if (!chatTavern.currentMemory) return;

    const history = chatTavern.currentMemory.getFormattedHistory();
    history.forEach(msg => {
        if (msg.role !== 'system') {
            addMessage(msg.role, msg.content);
        }
    });
}

// AI配置相关函数
function showAIConfig() {
    if (!chatTavern || !chatTavern.aiManager) {
        alert('AIManager未初始化');
        return;
    }

    // 加载当前配置
    const config = chatTavern.aiManager.getConfig();

    document.getElementById('aiEnabled').checked = config.enabled;
    document.getElementById('aiProvider').value = config.provider;
    document.getElementById('aiApiKey').value = config.apiKey;
    document.getElementById('aiPersistApiKey').checked = !!config.persistApiKey;
    document.getElementById('aiModel').value = config.model;
    document.getElementById('aiApiUrl').value = config.apiUrl || '';
    document.getElementById('aiTemperature').value = config.temperature;
    document.getElementById('aiMaxTokens').value = config.maxTokens;

    // 显示/隐藏自定义API部分
    document.getElementById('customApiSection').style.display =
        config.provider === 'custom' ? 'block' : 'none';

    // 显示模态窗口
    document.getElementById('aiConfigModal').style.display = 'flex';
}

function saveAIConfig() {
    const config = {
        enabled: document.getElementById('aiEnabled').checked,
        provider: document.getElementById('aiProvider').value,
        apiKey: document.getElementById('aiApiKey').value,
        persistApiKey: document.getElementById('aiPersistApiKey')?.checked ?? false,
        model: document.getElementById('aiModel').value || 'gpt-3.5-turbo',
        apiUrl: document.getElementById('aiApiUrl').value,
        temperature: parseFloat(document.getElementById('aiTemperature').value),
        maxTokens: parseInt(document.getElementById('aiMaxTokens').value)
    };

    chatTavern.aiManager.saveConfig(config);
    alert('AI配置已保存！');
    document.getElementById('aiConfigModal').style.display = 'none';
}

async function testAIConnection() {
    const button = document.getElementById('testAIConnection');
    button.disabled = true;
    button.textContent = '测试中...';

    const originalConfig = chatTavern.aiManager.getConfig();

    try {
        // 创建测试用的临时配置
        const testConfig = {
            enabled: true,
            provider: document.getElementById('aiProvider').value,
            apiKey: document.getElementById('aiApiKey').value,
            persistApiKey: document.getElementById('aiPersistApiKey')?.checked ?? false,
            model: document.getElementById('aiModel').value || 'gpt-3.5-turbo',
            apiUrl: document.getElementById('aiApiUrl').value,
            temperature: parseFloat(document.getElementById('aiTemperature').value),
            maxTokens: parseInt(document.getElementById('aiMaxTokens').value) || 1000
        };

        // 临时保存用于测试
        chatTavern.aiManager.saveConfig(testConfig);

        // 执行测试
        const result = await chatTavern.aiManager.testConnection();

        if (result.success) {
            alert('连接成功: ' + result.message);
        } else {
            alert('连接失败: ' + result.message);
        }
    } catch (error) {
        alert('测试失败: ' + error.message);
    } finally {
        chatTavern.aiManager.saveConfig(originalConfig);
        button.disabled = false;
        button.textContent = '测试连接';
    }
}
