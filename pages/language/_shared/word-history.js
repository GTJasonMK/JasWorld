/**
 * 单词历史管理器
 * 维护最近N个单词的历史记录及其AI对话
 */
export class WordHistoryManager {
    constructor(maxSize = 50) {
        this.history = [];
        this.currentIndex = -1;
        this.maxSize = maxSize;
    }

    addWord(wordData, aiResponses = []) {
        const historyItem = {
            word: { ...wordData },
            aiResponses: aiResponses.map(r => ({ ...r })),
            timestamp: Date.now()
        };

        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        this.history.push(historyItem);
        this.currentIndex = this.history.length - 1;

        if (this.history.length > this.maxSize) {
            this.history.shift();
            this.currentIndex--;
        }
    }

    navigate(direction) {
        const newIndex = this.currentIndex + direction;

        if (newIndex < 0 || newIndex >= this.history.length) {
            return {
                success: false,
                position: this.currentIndex + 1,
                total: this.history.length
            };
        }

        this.currentIndex = newIndex;
        const item = this.history[this.currentIndex];

        return {
            success: true,
            wordData: item.word,
            aiResponses: item.aiResponses,
            position: this.currentIndex + 1,
            total: this.history.length
        };
    }

    getCurrentWord() {
        if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
            return null;
        }
        const item = this.history[this.currentIndex];
        return {
            wordData: item.word,
            aiResponses: item.aiResponses,
            position: this.currentIndex + 1,
            total: this.history.length
        };
    }

    updateCurrentAIResponses(aiResponses) {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            this.history[this.currentIndex].aiResponses = aiResponses.map(r => ({ ...r }));
        }
    }

    isAtEnd() {
        return this.currentIndex === this.history.length - 1;
    }

    isAtStart() {
        return this.currentIndex === 0;
    }

    getInfo() {
        return {
            position: this.currentIndex + 1,
            total: this.history.length,
            isAtStart: this.isAtStart(),
            isAtEnd: this.isAtEnd()
        };
    }

    reset() {
        this.history = [];
        this.currentIndex = -1;
    }
}
