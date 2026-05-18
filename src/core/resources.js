/**
 * 资源管理器
 *
 * 集中管理 AudioContext、定时器、动画帧与音频缓存(LRU),
 * 页面卸载时统一释放,避免内存泄漏。
 */

export class ResourceManager {
  constructor(options = {}) {
    this.options = {
      maxCacheSize: options.maxCacheSize ?? 20,
      maxCacheMemory: options.maxCacheMemory ?? 50 * 1024 * 1024,
      ...options,
    };
    this.audioContext = null;
    this.audioCache = new Map();
    this.cacheAccessOrder = [];
    this.timers = new Set();
    this.intervals = new Set();
    this.animationFrames = new Set();
    this.currentCacheMemory = 0;
    this.isCleanedUp = false;
  }

  createAudioContext() {
    if (this.isCleanedUp) return null;
    if (this.audioContext) return this.audioContext;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        this.audioContext = new Ctx();
        return this.audioContext;
      }
    } catch (err) {
      console.error('创建 AudioContext 失败:', err);
    }
    return null;
  }

  cacheAudioBuffer(key, buffer) {
    if (this.isCleanedUp) return;
    if (!buffer || !buffer.length) {
      console.warn('[resources] 无效音频缓冲区:', key);
      return;
    }
    const size = buffer.length * buffer.numberOfChannels * 4;
    if (size > this.options.maxCacheMemory) {
      console.warn(`音频 ${key} 超出单文件缓存上限,跳过`);
      return;
    }
    while (
      (this.audioCache.size >= this.options.maxCacheSize ||
        this.currentCacheMemory + size > this.options.maxCacheMemory) &&
      this.audioCache.size > 0
    ) {
      const oldest = this.cacheAccessOrder.shift();
      const buf = this.audioCache.get(oldest);
      if (buf) {
        this.currentCacheMemory -= buf.length * buf.numberOfChannels * 4;
        this.audioCache.delete(oldest);
      }
    }
    this.audioCache.set(key, buffer);
    this.cacheAccessOrder.push(key);
    this.currentCacheMemory += size;
  }

  getAudioBuffer(key) {
    const buf = this.audioCache.get(key);
    if (buf) {
      const idx = this.cacheAccessOrder.indexOf(key);
      if (idx > -1) {
        this.cacheAccessOrder.splice(idx, 1);
        this.cacheAccessOrder.push(key);
      }
    }
    return buf || null;
  }

  clearAudioCache() {
    this.audioCache.clear();
    this.cacheAccessOrder = [];
    this.currentCacheMemory = 0;
  }

  setTimeout(callback, delay) {
    if (this.isCleanedUp) return 0;
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, delay);
    this.timers.add(id);
    return id;
  }

  setInterval(callback, interval) {
    if (this.isCleanedUp) return 0;
    const id = window.setInterval(callback, interval);
    this.intervals.add(id);
    return id;
  }

  requestAnimationFrame(callback) {
    if (this.isCleanedUp) return 0;
    const id = window.requestAnimationFrame((ts) => {
      this.animationFrames.delete(id);
      callback(ts);
    });
    this.animationFrames.add(id);
    return id;
  }

  clearTimeout(id) {
    window.clearTimeout(id);
    this.timers.delete(id);
  }

  clearInterval(id) {
    window.clearInterval(id);
    this.intervals.delete(id);
  }

  cancelAnimationFrame(id) {
    window.cancelAnimationFrame(id);
    this.animationFrames.delete(id);
  }

  getStats() {
    return {
      audioContext: this.audioContext ? 'active' : 'none',
      audioCacheSize: this.audioCache.size,
      audioCacheMemory: `${(this.currentCacheMemory / 1024 / 1024).toFixed(2)}MB`,
      activeTimers: this.timers.size,
      activeIntervals: this.intervals.size,
      activeAnimationFrames: this.animationFrames.size,
    };
  }

  cleanup() {
    if (this.isCleanedUp) return;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
    this.intervals.forEach((id) => window.clearInterval(id));
    this.intervals.clear();
    this.animationFrames.forEach((id) => window.cancelAnimationFrame(id));
    this.animationFrames.clear();
    this.clearAudioCache();
    this.isCleanedUp = true;
  }
}

export const pageResourceManager = new ResourceManager();

window.addEventListener('beforeunload', () => pageResourceManager.cleanup());

document.addEventListener('visibilitychange', () => {
  const ctx = pageResourceManager.audioContext;
  if (!ctx) return;
  if (document.hidden && ctx.state === 'running') ctx.suspend().catch(() => {});
  else if (!document.hidden && ctx.state === 'suspended') ctx.resume().catch(() => {});
});
