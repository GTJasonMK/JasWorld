/**
 * ChatTavern 角色列表页入口
 *
 * 负责角色卡的导入(拖拽/选择)、列表渲染、删除、编辑。
 */

import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { ChatTavern } from './ChatTavern.js';

bootstrapCore();

let chatTavern;
let currentEditingCharacterId = null;

document.addEventListener('DOMContentLoaded', async () => {
    chatTavern = new ChatTavern();
    await chatTavern.init();
    renderCharacterList();

    document.getElementById('selectFileBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await importCharacter(file);
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.body.classList.add('dragging');
    });
    document.body.addEventListener('dragleave', () => {
        document.body.classList.remove('dragging');
    });
    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        document.body.classList.remove('dragging');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'image/png') await importCharacter(file);
    });

    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditCharacter').addEventListener('click', closeEditModal);
    document.getElementById('saveEditCharacter').addEventListener('click', saveCharacterEdits);
    document.getElementById('editCharacterModal').addEventListener('click', (e) => {
        if (e.target.id === 'editCharacterModal') closeEditModal();
    });
});

async function importCharacter(file) {
    try {
        await chatTavern.importPNGCard(file);
        alert('角色卡导入成功');
        renderCharacterList();
    } catch (error) {
        console.error('导入错误:', error);
        let msg = '导入失败\n\n';
        if (/未找到角色卡数据|chara/.test(error.message)) {
            msg +=
                '该 PNG 文件不包含角色卡数据。请从 chub.ai / characterhub.org 下载,或用 SillyTavern 导出。';
        } else {
            msg += '错误详情: ' + error.message;
        }
        alert(msg);
    }
}

function renderCharacterList() {
    const characters = chatTavern.getCharacterList();
    const listEl = document.getElementById('characterList');
    const emptyEl = document.getElementById('emptyState');
    const countEl = document.getElementById('characterCount');

    countEl.textContent = characters.length;

    if (characters.length === 0) {
        emptyEl.style.display = 'block';
        listEl.style.display = 'none';
        return;
    }
    emptyEl.style.display = 'none';
    listEl.style.display = 'grid';
    listEl.innerHTML = '';
    characters.forEach((char) => listEl.appendChild(createCharacterCard(char)));
}

function createCharacterCard(charData) {
    const character = chatTavern.characters.get(charData.id);
    const template = document.getElementById('characterCardTemplate');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.character-card');

    card.dataset.id = charData.id;

    const avatar = clone.querySelector('.character-avatar img');
    avatar.src =
        character.getSpriteUrl() ||
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%236C63FF"/></svg>';
    avatar.alt = character.name;

    clone.querySelector('.character-name').textContent = character.name;
    clone.querySelector('.character-desc').textContent =
        character.description.substring(0, 80) +
        (character.description.length > 80 ? '...' : '');

    const tagsEl = clone.querySelector('.character-tags');
    character.tags.slice(0, 3).forEach((tag) => {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = tag;
        tagsEl.appendChild(t);
    });

    clone.querySelector('.btn-chat').addEventListener('click', () => {
        location.href = `chat.html?id=${charData.id}`;
    });
    clone.querySelector('.btn-edit').addEventListener('click', () => {
        showEditCharacter(charData.id);
    });
    clone.querySelector('.btn-delete').addEventListener('click', () => {
        if (confirm(`确定要删除角色 "${character.name}" 吗?`)) {
            chatTavern.deleteCharacter(charData.id);
            renderCharacterList();
        }
    });

    return clone;
}

function showEditCharacter(characterId) {
    const character = chatTavern.characters.get(characterId);
    if (!character) {
        alert('角色不存在');
        return;
    }
    currentEditingCharacterId = characterId;
    document.getElementById('editName').value = character.name || '';
    document.getElementById('editDescription').value = character.description || '';
    document.getElementById('editPersonality').value = character.personality || '';
    document.getElementById('editScenario').value = character.scenario || '';
    document.getElementById('editFirstMessage').value = character.first_mes || '';
    document.getElementById('editTags').value = character.tags.join(', ');
    document.getElementById('editSystemPrompt').value = character.system_prompt || '';
    document.getElementById('editTemperature').value = character.temperature || 0.9;
    document.getElementById('editMaxTokens').value = character.max_tokens || 2000;
    document.getElementById('editCharacterModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editCharacterModal').style.display = 'none';
    currentEditingCharacterId = null;
}

function saveCharacterEdits() {
    if (!currentEditingCharacterId) {
        alert('无法保存:未选择角色');
        return;
    }
    const updates = {
        name: document.getElementById('editName').value.trim(),
        description: document.getElementById('editDescription').value.trim(),
        personality: document.getElementById('editPersonality').value.trim(),
        scenario: document.getElementById('editScenario').value.trim(),
        first_mes: document.getElementById('editFirstMessage').value.trim(),
        tags: document
            .getElementById('editTags')
            .value.split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        system_prompt: document.getElementById('editSystemPrompt').value.trim(),
        temperature: parseFloat(document.getElementById('editTemperature').value),
        max_tokens: parseInt(document.getElementById('editMaxTokens').value, 10),
    };

    if (!updates.name) {
        alert('角色名称不能为空');
        return;
    }
    try {
        chatTavern.updateCharacter(currentEditingCharacterId, updates);
        closeEditModal();
        renderCharacterList();
        alert('角色信息已更新');
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}
