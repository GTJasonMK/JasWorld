/**
 * shared 层聚合入口
 *
 * 业务模块可直接 import 子路径,也可从这里取常用导出。
 */

export { LLMClient } from './llm/client.js';
export { aiConfigManager, DEFAULT_AI_CONFIG } from './llm/config.js';
export { renderMarkdown } from './markdown/renderer.js';
