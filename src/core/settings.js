/**
 * 全局设置管理器
 *
 * 持久化用户设置到 localStorage(app:settings),提供深合并的默认值兜底,
 * 通过 'change' 事件通知订阅者(包括跨标签页 storage event)。
 */

import { storage, StorageKeys } from './storage.js';

export const DEFAULT_SETTINGS = Object.freeze({
  ui: {
    theme: 'dark',
    fontSize: 16,
    animations: true,
    highContrast: false,
  },
  audio: {
    volume: 0.8,
    noteDelay: 400,
    answerDelay: 1000,
    autoPlayNext: true,
    soundEffects: true,
    useSynthAudio: false,
  },
  music: {
    startingDifficulty: 0,
    melodyLength: 3,
    pointsPerCorrect: 10,
    showHints: true,
  },
  games: {
    gameSpeed: 5,
    vibrationFeedback: true,
    snakeColor: 'green',
    tetrisRotationSystem: 'classic',
  },
  forum: {
    showAvatars: true,
    commentsPerPage: 10,
    defaultSort: 'newest',
  },
  tetris: {
    baseLevelSpeed: 1000,
    speedDecreasePerLevel: 100,
    minSpeed: 100,
    scoreMultiplierBase: 1,
    scoreMultiplierIncrement: 0.1,
    maxScoreMultiplier: 2,
    comboMaxMultiplier: 2,
    comboMultiplierStep: 0.1,
    comboRewards: { 5: 500, 10: 1000, 15: 2000, 20: 5000 },
    abilityThresholdAdjustment: 0,
    abilityUnlockThresholds: { lineClear: 8, slowTime: 12, shapeTransform: 16 },
    slowTimeEffectDuration: 10000,
    specialPieceChanceBase: 0,
    specialPieceChanceIncrement: 0.05,
    maxSpecialPieceChance: 0.2,
  },
  snake: {
    initialSpeed: 150,
    minSpeed: 50,
    speedDecreasePerPoint: 2,
    gridSize: 20,
    boardWidth: 20,
    boardHeight: 20,
    specialFoodChance: 0.1,
    specialFoodScoreMultiplier: 3,
    specialFoodDuration: 5000,
    wallCollision: true,
    growthPerFood: 1,
  },
  game2048: {
    levelThresholds: [0, 1000, 2000, 4000, 8000, 16000, 32000, 50000, 75000, 100000],
    levelBonusMultipliers: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2],
    levelBonusStep: 0.1,
    initialTile4Probability: 0.1,
    tile4ProbabilityIncrement: 0.05,
    maxTile4Probability: 0.4,
    animationSpeed: 150,
    showAnimations: true,
  },
  memory: {
    difficulties: { easy: 12, medium: 20, hard: 30 },
    cardShowDuration: 1000,
    timerPenaltyPerSecond: 5,
    consecutiveMatchBonus: 20,
    wrongMatchPenalty: 10,
    defaultDifficulty: 'easy',
  },
});

function mergeWithDefaults(stored) {
  const out = {};
  for (const category of Object.keys(DEFAULT_SETTINGS)) {
    out[category] = { ...DEFAULT_SETTINGS[category], ...(stored?.[category] || {}) };
  }
  return out;
}

class SettingsManager extends EventTarget {
  constructor() {
    super();
    this._settings = mergeWithDefaults(null);
    this._loaded = false;
  }

  load() {
    const stored = storage.getJSON(StorageKeys.appSettings, null);
    this._settings = mergeWithDefaults(stored);
    this._loaded = true;
    this._applyToDocument();
    this._installCrossTabSync();
    return this._settings;
  }

  save(next) {
    if (next) this._settings = next;
    storage.setJSON(StorageKeys.appSettings, this._settings);
    this._applyToDocument();
    this.dispatchEvent(new CustomEvent('change', { detail: this._settings }));
    return true;
  }

  get(category, key, fallback) {
    const cat = this._settings[category];
    if (!cat) return fallback;
    return cat[key] !== undefined ? cat[key] : fallback;
  }

  update(category, key, value) {
    if (!this._settings[category]) {
      console.warn('[settings] 更新失败,无效的配置分类:', category);
      return false;
    }
    this._settings[category] = { ...this._settings[category], [key]: value };
    return this.save();
  }

  reset() {
    this._settings = mergeWithDefaults(null);
    return this.save();
  }

  get settings() {
    if (!this._loaded) this.load();
    return this._settings;
  }

  _applyToDocument() {
    const ui = this._settings.ui;
    if (!ui || typeof document === 'undefined') return;
    document.body?.classList.toggle('light-theme', ui.theme === 'light');
    document.body?.classList.toggle('high-contrast', !!ui.highContrast);
    if (document.documentElement) {
      document.documentElement.style.fontSize = `${ui.fontSize}px`;
    }
  }

  _installCrossTabSync() {
    if (this._crossTabInstalled) return;
    this._crossTabInstalled = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== StorageKeys.appSettings) return;
      const stored = storage.getJSON(StorageKeys.appSettings, null);
      this._settings = mergeWithDefaults(stored);
      this._applyToDocument();
      this.dispatchEvent(new CustomEvent('change', { detail: this._settings }));
    });
  }
}

export const settingsManager = new SettingsManager();
