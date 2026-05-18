/**
 * AI 配置管理器
 *
 * 统一管理 ai:config 键的读写、默认值合并和校验。
 * 旧键(aichat_config / chattavern_ai_config / ai_config)的迁移
 * 由 @core/storage 的 runMigrations() 处理,本模块不再双写。
 */

import { storage, StorageKeys } from '@core/storage.js';

export const DEFAULT_AI_CONFIG = Object.freeze({
  enabled: true,
  apiUrl: '',
  apiKey: '',
  persistApiKey: false,
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2000,
  systemPrompt: '',
});

const SESSION_API_KEY = 'ai:sessionApiKey';

function getSessionApiKey() {
  try {
    return sessionStorage.getItem(SESSION_API_KEY) || '';
  } catch {
    return '';
  }
}

function setSessionApiKey(apiKey) {
  try {
    if (apiKey) sessionStorage.setItem(SESSION_API_KEY, apiKey);
    else sessionStorage.removeItem(SESSION_API_KEY);
  } catch {
    /* sessionStorage can be unavailable in private or restricted contexts */
  }
}

export const aiConfigManager = {
  get() {
    return storage.getJSON(StorageKeys.aiConfig, null);
  },

  getWithDefaults() {
    let cfg = this.get() || {};
    let sessionApiKey = getSessionApiKey();
    if (!sessionApiKey && cfg.apiKey && cfg.persistApiKey === undefined) {
      setSessionApiKey(cfg.apiKey);
      sessionApiKey = cfg.apiKey;
      cfg = { ...cfg, apiKey: '', persistApiKey: false };
      storage.setJSON(StorageKeys.aiConfig, cfg);
    }
    const hasPersistedApiKey = !!cfg.apiKey?.trim();
    const persistApiKey = sessionApiKey ? false : (cfg.persistApiKey ?? hasPersistedApiKey);
    return {
      ...DEFAULT_AI_CONFIG,
      ...cfg,
      apiKey: sessionApiKey || cfg.apiKey || '',
      persistApiKey,
    };
  },

  save(config) {
    const persistApiKey = !!config.persistApiKey;
    const next = { ...config, persistApiKey };
    if (persistApiKey) {
      setSessionApiKey('');
    } else {
      setSessionApiKey(next.apiKey || '');
      next.apiKey = '';
    }
    storage.setJSON(StorageKeys.aiConfig, next);
  },

  clear() {
    storage.remove(StorageKeys.aiConfig);
    setSessionApiKey('');
  },

  validate(config) {
    if (!config) return { valid: false, message: '配置不存在' };
    if (!config.apiKey?.trim()) return { valid: false, message: '请配置 API Key' };
    if (!config.apiUrl?.trim()) return { valid: false, message: '请配置 API URL' };
    if (!config.model?.trim()) return { valid: false, message: '请选择模型' };
    return { valid: true, message: '配置有效' };
  },

  isConfigured() {
    return this.validate(this.getWithDefaults()).valid;
  },

  summary() {
    const cfg = this.getWithDefaults();
    if (!this.get() && !cfg.apiKey) return { configured: false };
    return {
      configured: this.validate(cfg).valid,
      hasApiKey: !!cfg.apiKey,
      hasApiUrl: !!cfg.apiUrl,
      persistApiKey: !!cfg.persistApiKey,
      model: cfg.model,
      validation: this.validate(cfg),
    };
  },
};
