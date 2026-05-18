/**
 * UI控制器基类
 * 负责界面更新和用户交互
 *
 * 子类（各语言入口）在构造时注入 vocabBooks 和 language。
 */
import { storage, StorageKeys } from '@core/storage.js';
import { VocabularyLoader } from './vocabulary-loader.js';
import { WordSelector } from './word-selector.js';
import { PracticeManager } from './practice-manager.js';
import { WordHistoryManager } from './word-history.js';

export class UIController {
    /**
     * @param {Object} opts
     * @param {Array} opts.vocabBooks - 词汇书配置列表
     * @param {string} opts.language - 语言标识（如 'english', 'japanese'）
     * @param {Function} opts.createAIAssistant - 工厂函数 (bookId) => AIAssistant 实例
     * @param {Array} [opts.migrations] - 旧进度迁移配置 [{ oldId, newId }]
     */
    constructor({ vocabBooks = [], language = 'english', createAIAssistant = null, migrations = [] } = {}) {
        this.vocabBooks = vocabBooks;
        this.language = language;
        this.createAIAssistant = createAIAssistant;
        this.migrations = migrations;

        this.selectView = document.getElementById('select-view');
        this.practiceView = document.getElementById('practice-view');
        this.bookList = document.getElementById('book-list');
        this.loading = document.getElementById('loading');

        this.wordText = document.getElementById('word-text');
        this.phoneticText = document.getElementById('phonetic-text');
        this.definitionText = document.getElementById('definition-text');
        this.statsText = document.getElementById('stats-text');
        this.statsPercent = document.getElementById('stats-percent');

        this.exitBtn = document.getElementById('exit-btn');
        this.knowBtn = document.getElementById('know-btn');
        this.unknownBtn = document.getElementById('unknown-btn');
        this.nextBtn = document.getElementById('next-btn');

        this.aiButtons = document.querySelectorAll('.ai-btn');
        this.customQuestionInput = document.getElementById('custom-question-input');
        this.customQuestionBtn = document.getElementById('custom-question-btn');

        this.wordNavPrevBtn = document.getElementById('word-nav-prev');
        this.wordNavNextBtn = document.getElementById('word-nav-next');
        this.wordPosition = document.getElementById('word-position');

        this.currentWord = null;
        this.isInHistoryMode = false;
        this.vocabularyLoader = new VocabularyLoader();
        this.wordSelector = null;
        this.practiceManager = null;
        this.wordHistoryManager = new WordHistoryManager(50);
        this.aiAssistant = null;
    }

    init() {
        this.migrateOldProgressData();
        this.renderBookList();
        this.bindEvents();
    }

    migrateOldProgressData() {
        this.migrations.forEach(({ oldId, newId }) => {
            const oldKey = StorageKeys.langProgress(this.language, oldId);
            const newKey = StorageKeys.langProgress(this.language, newId);

            const oldData = storage.getJSON(oldKey, null);
            const newData = storage.getJSON(newKey, null);

            if (oldData && !newData) {
                console.log(`[迁移] 将进度数据从 ${oldId} 迁移到 ${newId}`);
                storage.setJSON(newKey, oldData);
                console.log('[迁移] 迁移完成');
            }
        });
    }

    renderBookList() {
        this.bookList.innerHTML = '';

        this.vocabBooks.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.dataset.bookId = book.id;

            const progress = this.getBookProgress(book.id);

            card.innerHTML = `
                <div class="book-name">${book.name}</div>
                <div class="book-count">${book.description}</div>
                ${progress ? `
                    <div class="book-progress">
                        已练习: ${progress.known}/${progress.seen} (${Math.round(progress.known/progress.seen*100)}%)
                    </div>
                ` : `
                    <div class="book-start-hint">点击开始练习</div>
                `}
            `;

            card.addEventListener('click', () => this.startPractice(book));
            this.bookList.appendChild(card);
        });
    }

    getBookProgress(bookId) {
        return storage.getJSON(StorageKeys.langProgress(this.language, bookId), null);
    }

    async startPractice(book) {
        this.showLoading();

        try {
            const words = await this.vocabularyLoader.loadBook(book.file);

            if (words.length === 0) {
                alert('词汇书为空或格式错误');
                this.hideLoading();
                return;
            }

            this.wordSelector = new WordSelector(words);
            this.practiceManager = new PracticeManager(book.id, this.language);
            this.aiAssistant = this.createAIAssistant ? this.createAIAssistant(book.id) : null;

            this.switchToPracticeView();
            this.hideLoading();
            this.showNextWord();
        } catch (error) {
            console.error('启动练习失败:', error);
            alert('加载词汇书失败，请检查文件是否存在');
            this.hideLoading();
        }
    }

    showLoading() {
        this.loading.style.display = 'block';
        this.bookList.style.display = 'none';
    }

    hideLoading() {
        this.loading.style.display = 'none';
        this.bookList.style.display = 'grid';
    }

    switchToPracticeView() {
        this.selectView.classList.remove('active');
        this.practiceView.classList.add('active');
        this.updateStats();
    }

    switchToSelectView() {
        this.practiceView.classList.remove('active');
        this.selectView.classList.add('active');
        this.renderBookList();
    }

    showNextWord() {
        if (this.currentWord && !this.isInHistoryMode) {
            this.wordHistoryManager.addWord(
                this.currentWord,
                this.aiAssistant ? this.aiAssistant.responseHistory : []
            );
        }

        this.isInHistoryMode = false;
        this.currentWord = this.wordSelector.getNext();

        if (this.aiAssistant) {
            this.aiAssistant.setCurrentWord(this.currentWord);
            this.aiAssistant.responseHistory = [];
            this.aiAssistant.currentIndex = -1;
        }

        this.wordText.textContent = this.currentWord.word;
        this.phoneticText.textContent = `[${this.currentWord.phonetic}]`;
        this.definitionText.textContent = this.currentWord.definition;
        this.definitionText.style.display = 'none';

        this.knowBtn.style.display = 'block';
        this.unknownBtn.style.display = 'block';
        this.nextBtn.style.display = 'none';

        this.updateWordNavigationState();
    }

    handleKnown() {
        this.practiceManager.markKnown();
        this.updateStats();
        this.showNextWord();
    }

    handleUnknown() {
        this.practiceManager.markUnknown();
        this.updateStats();
        this.definitionText.style.display = 'block';
        this.knowBtn.style.display = 'none';
        this.unknownBtn.style.display = 'none';
        this.nextBtn.style.display = 'block';
    }

    handleNext() {
        this.showNextWord();
    }

    updateStats() {
        const stats = this.practiceManager.getStats();
        this.statsText.textContent = `${stats.known}/${stats.seen}`;
        this.statsPercent.textContent = `(${stats.percent}%)`;
    }

    handleExit() {
        if (confirm('确定要退出练习吗？进度已自动保存。')) {
            this.switchToSelectView();
        }
    }

    navigateWord(direction) {
        if (!this.isInHistoryMode && direction === -1 && this.currentWord) {
            this.wordHistoryManager.addWord(
                this.currentWord,
                this.aiAssistant ? this.aiAssistant.responseHistory : []
            );
        }

        const result = this.wordHistoryManager.navigate(direction);
        if (!result.success) {
            console.log('已到达历史边界');
            return;
        }

        this.isInHistoryMode = true;
        this.currentWord = result.wordData;

        if (this.aiAssistant) {
            this.aiAssistant.setCurrentWord(this.currentWord);
            this.aiAssistant.loadHistory(result.aiResponses);
        }

        this.wordText.textContent = this.currentWord.word;
        this.phoneticText.textContent = `[${this.currentWord.phonetic}]`;
        this.definitionText.textContent = this.currentWord.definition;
        this.definitionText.style.display = 'block';

        this.knowBtn.style.display = 'none';
        this.unknownBtn.style.display = 'none';
        this.nextBtn.style.display = 'block';
        this.nextBtn.textContent = '继续学习新单词';

        this.updateWordNavigationState();

        if (result.aiResponses.length > 0 && this.aiAssistant) {
            this.aiAssistant.displayCurrent();
        }
    }

    updateWordNavigationState() {
        const info = this.wordHistoryManager.getInfo();
        this.wordPosition.textContent = info.total === 0 ? '--' : `${info.position}/${info.total}`;
        this.wordNavPrevBtn.disabled = info.total === 0 || info.isAtStart;
        this.wordNavNextBtn.disabled = info.total === 0 || info.isAtEnd;
    }

    handleWordNavigation(direction) {
        this.navigateWord(direction);
    }

    handleAIQuery(type) {
        if (!this.aiAssistant) return;
        this.setAIButtonsDisabled(true);
        this.aiAssistant.query(type).finally(() => {
            this.setAIButtonsDisabled(false);
        });
    }

    handleCustomQuestion() {
        if (!this.aiAssistant) return;
        const question = this.customQuestionInput.value.trim();
        if (!question) {
            alert('请输入问题');
            return;
        }

        this.customQuestionInput.disabled = true;
        this.customQuestionBtn.disabled = true;
        this.setAIButtonsDisabled(true);

        this.aiAssistant.query('custom', question).finally(() => {
            this.customQuestionInput.value = '';
            this.customQuestionInput.disabled = false;
            this.customQuestionBtn.disabled = false;
            this.setAIButtonsDisabled(false);
        });
    }

    setAIButtonsDisabled(disabled) {
        this.aiButtons.forEach(btn => btn.disabled = disabled);
        this.customQuestionBtn.disabled = disabled;
    }

    bindEvents() {
        this.exitBtn.addEventListener('click', () => this.handleExit());
        this.knowBtn.addEventListener('click', () => this.handleKnown());
        this.unknownBtn.addEventListener('click', () => this.handleUnknown());
        this.nextBtn.addEventListener('click', () => this.handleNext());

        this.aiButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.handleAIQuery(btn.dataset.type);
            });
        });

        this.customQuestionBtn.addEventListener('click', () => this.handleCustomQuestion());
        this.customQuestionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleCustomQuestion();
        });

        document.getElementById('ai-nav-prev').addEventListener('click', () => {
            if (this.aiAssistant) this.aiAssistant.navigate('prev');
        });
        document.getElementById('ai-nav-next').addEventListener('click', () => {
            if (this.aiAssistant) this.aiAssistant.navigate('next');
        });

        this.wordNavPrevBtn.addEventListener('click', () => this.handleWordNavigation(-1));
        this.wordNavNextBtn.addEventListener('click', () => this.handleWordNavigation(1));

        const configBtn = document.getElementById('ai-config-btn');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                window.location.href = '../../aitools/aichat/index.html';
            });
        }
    }
}
