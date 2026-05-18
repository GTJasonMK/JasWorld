/**
 * LLM API 统一客户端
 *
 * 兼容 OpenAI、DeepSeek、New API 等所有 OpenAI 兼容服务。
 * - 流式响应处理(SSE)
 * - 浏览器直连要求 API 服务明确允许 CORS
 * - AbortController 超时控制
 * - 自动重试(网络/超时/5xx)
 * - 支持 DeepSeek R1 reasoning_content 字段
 */

export class LLMClient {
  constructor({ apiKey, baseUrl = null, model = 'gpt-3.5-turbo' } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  static createFromConfig(config) {
    return new LLMClient(config);
  }

  async streamAndCollect(messages, options = {}) {
    return this._withRetry((opts) => this._doRequest(messages, opts, null), options);
  }

  async stream(messages, options = {}, onChunk = null) {
    return this._withRetry((opts) => this._doRequest(messages, opts, onChunk), options);
  }

  async _withRetry(fn, options) {
    const {
      timeout = 120,
      temperature = 0.7,
      maxTokens = null,
      responseFormat = null,
      maxRetries = 2,
    } = options;
    const reqOpts = { timeout, temperature, maxTokens, responseFormat };
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(2 ** attempt * 1000);
        }
        const result = await fn(reqOpts);
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && shouldRetry(err)) {
          console.warn(`[LLMClient] 请求失败,准备重试: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async _doRequest(messages, options, onChunk) {
    const { timeout, temperature, maxTokens, responseFormat } = options;
    const body = { model: this.model, messages, temperature, stream: true };
    if (maxTokens) body.max_tokens = maxTokens;
    if (responseFormat) body.response_format = { type: responseFormat };

    const url = buildApiUrl(this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout * 1000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || errorData.message || response.statusText;
        throw new Error(`API错误 (${response.status}): ${msg}`);
      }
      return await parseStream(response, onChunk);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('请求超时');
      if (/Failed to fetch|NetworkError/.test(err.message)) {
        throw new Error('网络连接失败,请检查API地址和网络连接');
      }
      throw err;
    }
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}

function buildApiUrl(baseUrl) {
  if (!baseUrl) return 'https://api.openai.com/v1/chat/completions';
  if (baseUrl.includes('/chat/completions')) return baseUrl;
  const clean = baseUrl.replace(/\/$/, '');
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

function shouldRetry(err) {
  const msg = err.message || '';
  return (
    /网络连接失败|Failed to fetch|NetworkError|超时|timeout|50[023]/.test(msg)
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let content = '';
  let reasoning = '';
  let finishReason = null;
  let chunkCount = 0;
  let buffer = '';

  try {
    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      doneReading = done;
      if (doneReading) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          const choice = data.choices?.[0];
          if (!choice) continue;
          chunkCount++;
          const delta = choice.delta || {};
          if (delta.content) {
            content += delta.content;
            onChunk?.({ type: 'content', text: delta.content });
          }
          if (delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            onChunk?.({ type: 'reasoning', text: delta.reasoning_content });
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        } catch (parseErr) {
          console.warn('[LLMClient] 解析chunk失败:', parseErr.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (chunkCount === 0 || (!content && !reasoning)) {
    throw new Error('未收到有效响应');
  }
  return { content, reasoning, finishReason, chunkCount };
}
