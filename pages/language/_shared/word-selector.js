/**
 * 单词选择器
 * 使用Fisher-Yates洗牌算法随机选择单词
 */
export class WordSelector {
    constructor(words) {
        this.words = words;
        this.indices = this.shuffle([...Array(words.length).keys()]);
        this.currentIndex = 0;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    getNext() {
        if (this.currentIndex >= this.indices.length) {
            console.log('所有单词已遍历完，重新洗牌');
            this.indices = this.shuffle(this.indices);
            this.currentIndex = 0;
        }

        const wordIndex = this.indices[this.currentIndex];
        this.currentIndex++;
        return this.words[wordIndex];
    }

    reset() {
        this.indices = this.shuffle([...Array(this.words.length).keys()]);
        this.currentIndex = 0;
    }
}
