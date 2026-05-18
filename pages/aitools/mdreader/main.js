/**
 * Markdown阅读器入口
 *
 * 负责初始化MarkdownReader和ProjectManager。
 */

import '@styles/index.css';
import './style.css';
import 'highlight.js/styles/github-dark.css';
import { bootstrapCore } from '@core/index.js';
import { MarkdownReader } from './reader.js';
import { ProjectManager } from './project-manager.js';

bootstrapCore();

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('开始初始化Markdown阅读器...');
        const reader = new MarkdownReader();
        console.log('MarkdownReader初始化成功');

        new ProjectManager(reader);
        console.log('ProjectManager初始化成功');

        console.log('Markdown阅读器已初始化');
    } catch (error) {
        console.error('初始化失败:', error);
        console.error('错误堆栈:', error.stack);
    }
});
