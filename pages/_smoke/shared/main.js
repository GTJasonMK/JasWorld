/**
 * shared 层烟雾测试入口
 *
 * 验证 @shared/llm/client、@shared/llm/config、@shared/markdown/renderer
 * 能够通过 Vite 别名正常加载并执行(不发起真实 API 请求)。
 */

import { bootstrapCore } from '@core/index.js';
import { LLMClient, aiConfigManager, renderMarkdown } from '@shared/index.js';

bootstrapCore();

const llmEl = document.getElementById('llm-result');
const mdEl = document.getElementById('md-output');

const client = new LLMClient({
  apiKey: 'sk-fake-for-smoke-only',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-3.5-turbo',
});

const summary = aiConfigManager.summary();

llmEl.textContent = JSON.stringify(
  {
    llmClientReady: client instanceof LLMClient,
    llmClientModel: client.model,
    aiConfigSummary: summary,
  },
  null,
  2
);

mdEl.innerHTML = renderMarkdown(
  '# 测试标题\n\n这是一段 *斜体* 和 **粗体** 与 `inline code`。\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\n- 列表项一\n- 列表项二'
);
