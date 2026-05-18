/**
 * 日语词汇练习入口
 *
 * 仅包含语言相关配置（词库列表、提示词模板）和初始化代码。
 * 所有共享逻辑位于 ../_shared/。
 */

import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { UIController } from '../_shared/ui-controller.js';
import { AIAssistant } from '../_shared/ai-assistant.js';

bootstrapCore();

// 词汇书配置（待添加词库文件后取消注释）
const VOCABULARY_BOOKS = [
    // {
    //     id: 'n5',
    //     name: 'JLPT N5',
    //     file: 'N5.txt',
    //     description: '约800词'
    // },
];

// AI提示词模板（日语专用）
const PROMPTS = {
    synonyms: (word, definition) =>
        `请详细分析日语词汇"${word}"（${definition}）的同义词及其区别。

要求：
1. 列出3-5个主要同义词，每个包含：
   - 假名读音
   - 与"${word}"的核心区别（使用场景、语气、正式程度）
   - 例句对比（用${word}和同义词分别造句）
2. 用表格形式对比关键差异
3. 总结使用建议

使用markdown格式，确保内容详尽。`,

    phrases: (word, definition) =>
        `请详细列出日语词汇"${word}"（${definition}）的常用短语搭配和用法。

要求：
1. 列出5-8个最常用的短语搭配
2. 每个短语包含：
   - 完整的短语表达（假名标注）
   - 详细的中文翻译
   - 至少一个地道的例句（附假名和中文翻译）
   - 使用场景说明（口语/书面语、正式/非正式）
3. 如有固定搭配的助词，需特别标注

使用markdown列表格式，确保内容详尽。`,

    synonyms_latest: (word, definition) =>
        `关于日语词汇"${word}"（${definition}），用户已有详细的同义词分析。

请只补充最新的用法变化（2023-2024年）：
1. 是否在网络流行语中有新含义？
2. 社交媒体上是否出现新的使用场景？
3. 是否因文化事件产生新的引申义？
4. 与同义词的使用偏好是否有变化趋势？

如果该词用法稳定，没有明显新变化，请直接说明。保持简洁。`,

    phrases_latest: (word, definition) =>
        `关于日语词汇"${word}"（${definition}），用户已有详细的短语搭配说明。

请只补充最新出现的搭配和用法（2023-2024年）：
1. 新的流行搭配
2. 最近媒体/社交平台上的热门用法
3. 新兴语境中的特殊用法

如果没有明显的新搭配出现，请直接说明。保持简洁。`,

    custom: (word, question) =>
        `关于日语词汇"${word}"：${question}。请简洁回答。`
};

document.addEventListener('DOMContentLoaded', () => {
    const ui = new UIController({
        vocabBooks: VOCABULARY_BOOKS,
        language: 'japanese',
        migrations: [],
        createAIAssistant: (bookId) => new AIAssistant({ bookId, language: 'japanese', prompts: PROMPTS }),
    });
    ui.init();
});
