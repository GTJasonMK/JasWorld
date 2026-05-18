/**
 * 练习管理器
 * 负责统计和进度管理
 */
import { storage, StorageKeys } from '@core/storage.js';

export class PracticeManager {
    /**
     * @param {string} bookId - 词汇书ID
     * @param {string} language - 语言标识（如 'english', 'japanese'）
     */
    constructor(bookId, language) {
        this.bookId = bookId;
        this.language = language;
        this.stats = {
            seen: 0,
            known: 0
        };
        this.loadProgress();
    }

    markKnown() {
        this.stats.known++;
        this.stats.seen++;
        this.saveProgress();
    }

    markUnknown() {
        this.stats.seen++;
        this.saveProgress();
    }

    getStats() {
        const percent = this.stats.seen > 0
            ? Math.round((this.stats.known / this.stats.seen) * 100)
            : 0;

        return {
            known: this.stats.known,
            seen: this.stats.seen,
            percent: percent
        };
    }

    saveProgress() {
        storage.setJSON(StorageKeys.langProgress(this.language, this.bookId), {
            ...this.stats,
            lastDate: new Date().toISOString()
        });
    }

    loadProgress() {
        const data = storage.getJSON(StorageKeys.langProgress(this.language, this.bookId), null);

        if (data) {
            this.stats.seen = data.seen || 0;
            this.stats.known = data.known || 0;
            console.log(`加载进度: ${this.stats.known}/${this.stats.seen}`);
        }
    }

    reset() {
        this.stats = { seen: 0, known: 0 };
        this.saveProgress();
    }
}
