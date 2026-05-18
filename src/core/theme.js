/**
 * 主题管理器
 *
 * 与 settingsManager 双向绑定:从 settings.ui.theme 读取当前主题,
 * 切换时写回 settings 并同步到同源 iframe。
 */

import { settingsManager } from './settings.js';

function resolveSystemPreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

class ThemeManager extends EventTarget {
  constructor() {
    super();
    this._installed = false;
  }

  install({ createToggleButton = true } = {}) {
    if (this._installed) return;
    this._installed = true;

    settingsManager.load();
    const current = this.current();
    this._applyToDocument(current);

    if (createToggleButton) this._createToggleButton(current);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const t = settingsManager.get('ui', 'theme', 'dark');
      if (t === 'system') this._applyToDocument(e.matches ? 'dark' : 'light');
    });

    settingsManager.addEventListener('change', () => {
      this._applyToDocument(this.current());
    });

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'theme-change') {
        this._applyToDocument(event.data.theme);
      }
    });
  }

  current() {
    const stored = settingsManager.get('ui', 'theme', 'dark');
    return stored === 'system' ? resolveSystemPreference() : stored;
  }

  set(theme) {
    settingsManager.update('ui', 'theme', theme);
    this._applyToDocument(theme === 'system' ? resolveSystemPreference() : theme);
    this._broadcastToIframes(theme);
  }

  toggle() {
    this.set(this.current() === 'light' ? 'dark' : 'light');
  }

  _applyToDocument(theme) {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body?.classList.toggle('light-theme', isLight);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isLight ? '\u{1F319}' : '\u{2600}\u{FE0F}';
    this.dispatchEvent(new CustomEvent('change', { detail: { theme } }));
  }

  _createToggleButton(currentTheme) {
    if (document.querySelector('.theme-toggle')) return;
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', '切换明暗主题');
    btn.textContent = currentTheme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
    btn.addEventListener('click', () => this.toggle());
    document.body?.appendChild(btn);
  }

  _broadcastToIframes(theme) {
    document.querySelectorAll('iframe').forEach((frame) => {
      try {
        if (frame.src.startsWith(window.location.origin)) {
          frame.contentWindow.postMessage({ type: 'theme-change', theme }, window.location.origin);
        }
      } catch {
        /* iframe cross-origin or not ready */
      }
    });
  }
}

export const themeManager = new ThemeManager();
