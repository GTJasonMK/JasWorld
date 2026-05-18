/**
 * 事件管理器
 *
 * 通过 AbortController 统一管理事件监听器的生命周期,页面卸载时一次性清理。
 */

export class EventManager {
  constructor() {
    this.abortController = new AbortController();
    this.listeners = [];
    this.isCleanedUp = false;
  }

  addEventListener(target, event, handler, options = {}) {
    if (this.isCleanedUp) {
      console.warn('EventManager 已清理,无法添加事件监听器');
      return this;
    }
    if (!target || typeof target.addEventListener !== 'function') {
      console.warn('EventManager: 无效的事件目标', target);
      return this;
    }
    target.addEventListener(event, handler, { ...options, signal: this.abortController.signal });
    this.listeners.push({ target, event, handler, timestamp: Date.now() });
    return this;
  }

  on(target, event, handler, options) {
    return this.addEventListener(target, event, handler, options);
  }

  removeEventListener(target, event, handler) {
    target.removeEventListener(event, handler);
    this.listeners = this.listeners.filter(
      (l) => !(l.target === target && l.event === event && l.handler === handler)
    );
  }

  off(target, event, handler) {
    return this.removeEventListener(target, event, handler);
  }

  cleanup() {
    if (this.isCleanedUp) return;
    this.abortController.abort();
    const count = this.listeners.length;
    this.listeners = [];
    this.isCleanedUp = true;
    console.log(`EventManager 已清理 ${count} 个事件监听器`);
  }

  getListenerCount() {
    return this.listeners.length;
  }

  getListeners() {
    return [...this.listeners];
  }
}

export const pageEventManager = new EventManager();

window.addEventListener('beforeunload', () => pageEventManager.cleanup());
