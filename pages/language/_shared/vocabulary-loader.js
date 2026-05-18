/**
 * 词汇加载器
 * 负责从txt文件加载和解析词汇数据
 */
export class VocabularyLoader {
    async loadBook(fileName) {
        try {
            const response = await fetch(`wordlists/${fileName}`);
            if (!response.ok) {
                throw new Error(`加载失败: ${response.status}`);
            }

            const text = await response.text();
            return this.parseVocabulary(text);
        } catch (error) {
            console.error('加载词汇书失败:', error);
            throw error;
        }
    }

    parseVocabulary(text) {
        const lines = text.split('\n');
        const vocabulary = [];

        const pattern = /^(\S+)\s+\[([^\]]+)\]\s+(.+)$/;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length < 3) continue;

            if (trimmed.match(/^[A-Z\s]+$/) || trimmed.match(/^[（）\d]+$/)) {
                continue;
            }

            const match = trimmed.match(pattern);
            if (match) {
                const [, word, phonetic, definition] = match;
                vocabulary.push({
                    word: word.trim(),
                    phonetic: phonetic.trim(),
                    definition: definition.trim()
                });
            }
        }

        console.log(`成功加载 ${vocabulary.length} 个单词`);
        return vocabulary;
    }
}
