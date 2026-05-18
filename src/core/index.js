/**
 * core 层统一入口
 *
 * 业务模块可单独 import 子模块,也可从这里聚合导入。
 */

export { storage, StorageKeys, runMigrations } from './storage.js';
export { settingsManager, DEFAULT_SETTINGS } from './settings.js';
export { themeManager } from './theme.js';
export { EventManager, pageEventManager } from './events.js';
export { ResourceManager, pageResourceManager } from './resources.js';
export { VERSION, COMMIT, BUILD_TIME, printVersionBanner } from './version.js';

import { runMigrations } from './storage.js';
import { settingsManager } from './settings.js';
import { themeManager } from './theme.js';
import { printVersionBanner } from './version.js';
import { ParticleSystem } from '../shared/particles.js';

let bootstrapped = false;
let particles = null;

function syncRangeProgress(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const span = max - min || 1;
  const progress = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  input.style.setProperty('--range-progress', `${progress}%`);
}

function installThemedRangeControls() {
  const syncAll = () => {
    document.querySelectorAll('input[type="range"]').forEach(syncRangeProgress);
  };

  document.addEventListener('input', (event) => {
    if (event.target?.matches?.('input[type="range"]')) {
      syncRangeProgress(event.target);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('input[type="range"]')) {
      syncRangeProgress(event.target);
    }
  });

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      syncAll();
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  syncAll();
  requestAnimationFrame(syncAll);
  window.setTimeout(syncAll, 250);
}

export function bootstrapCore({ createThemeToggle = true } = {}) {
  if (bootstrapped) return;
  bootstrapped = true;
  // 移除首屏隐藏类，触发淡入动画
  document.documentElement.classList.remove('page-loading');
  runMigrations();
  settingsManager.load();
  themeManager.install({ createToggleButton: createThemeToggle });
  installThemedRangeControls();
  printVersionBanner();

  // 启动交互式背景粒子
  const container = document.querySelector('.bg-effects');
  if (container) {
    particles = new ParticleSystem();
    particles.mount(container);

    // 主题切换时更新粒子颜色（监听 themeManager 而非 settingsManager，
    // 因为系统主题偏好变更时只有 themeManager 会触发事件）
    themeManager.addEventListener('change', () => {
      if (particles) particles._readTheme();
    });
  }
}
