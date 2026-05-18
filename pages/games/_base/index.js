/**
 * 游戏基类
 * 为所有游戏提供通用功能：资源管理、事件管理、设置加载等
 */
import { EventManager, ResourceManager } from '@core/index.js';
import { storage, StorageKeys } from '@core/storage.js';
import { settingsManager } from '@core/settings.js';
import { TouchGestureHandler } from './gesture.js';
import { LevelSystem } from './level.js';
import { NotificationSystem } from './notification.js';

export { TouchGestureHandler } from './gesture.js';
export { LevelSystem } from './level.js';
export { NotificationSystem } from './notification.js';

export class GameBase {
    constructor(gameType, options = {}) {
        this.gameType = gameType;
        this.options = {
            enableAutoCleanup: true,
            enableTouchGestures: true,
            enableNotifications: true,
            ...options
        };

        this.eventManager = new EventManager();
        this.resourceManager = new ResourceManager();
        this.gameStorageKey = StorageKeys.gameHighScore(gameType);

        // 游戏状态
        this.state = {
            isRunning: false,
            isPaused: false,
            isGameOver: false,
            score: 0,
            level: 1,
            highScore: 0
        };

        this.settings = this.loadSettings();
        this.deviceInfo = this.detectDevice();

        if (this.options.enableNotifications) {
            this.notify = new NotificationSystem(this.resourceManager);
        }

        this.loadHighScore();

        if (this.options.enableAutoCleanup) {
            window.addEventListener('beforeunload', () => {
                this.cleanup();
            });
        }

        console.log(`${this.gameType}游戏基础类已初始化`);
    }

    loadSettings() {
        const defaultSettings = {};

        try {
            const appSettings = settingsManager.settings;
            const genericSettings = appSettings.games || {};
            const gameSettings = appSettings[this.gameType] || {};
            if (Object.keys(genericSettings).length > 0 || Object.keys(gameSettings).length > 0) {
                console.log(`已加载${this.gameType}设置`);
                return { ...defaultSettings, ...genericSettings, ...gameSettings };
            }
        } catch (error) {
            console.error('加载设置时出错:', error);
        }

        console.warn(`未找到${this.gameType}的设置，使用默认值`);
        return defaultSettings;
    }

    detectDevice() {
        const userAgent = navigator.userAgent || '';

        const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

        const isSmallScreen = window.matchMedia && (
            window.matchMedia('(max-width: 768px)').matches ||
            window.matchMedia('(max-device-width: 768px)').matches
        );

        const hasTouch = 'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0;

        const isMobile = isMobileUserAgent || (isSmallScreen && hasTouch);
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

        return {
            isMobile,
            hasTouch,
            isSmallScreen,
            isIOS,
            userAgent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };
    }

    setupTouchGestures(element, options = {}) {
        const handler = new TouchGestureHandler(element, options);

        this.on(element, 'touchstart', (e) => handler.handleTouchStart(e), { passive: false });
        this.on(element, 'touchmove', (e) => handler.handleTouchMove(e), { passive: false });
        this.on(element, 'touchend', (e) => handler.handleTouchEnd(e), { passive: false });

        return handler;
    }

    setupLevelSystem(levelConfig) {
        this.levelSystem = new LevelSystem(levelConfig);
        return this.levelSystem;
    }

    autoUpdateLevel() {
        if (this.levelSystem) {
            const newLevel = this.levelSystem.calculateLevel(this.state.score);
            if (newLevel > this.state.level) {
                this.updateLevel(newLevel);
                return true;
            }
        }
        return false;
    }

    loadHighScore() {
        this.state.highScore = storage.getJSON(this.gameStorageKey, 0);
        if (this.state.highScore > 0) {
            console.log(`已加载最高分: ${this.state.highScore}`);
        }
    }

    saveHighScore() {
        if (this.state.score > this.state.highScore) {
            this.state.highScore = this.state.score;
            storage.setJSON(this.gameStorageKey, this.state.highScore);
            console.log(`新最高分已保存: ${this.state.highScore}`);
            return true;
        }
        return false;
    }

    saveGameData(key, value) {
        return storage.setJSON(StorageKeys.gameHighScore(`${this.gameType}_${key}`), value);
    }

    loadGameData(key, defaultValue = null) {
        return storage.getJSON(StorageKeys.gameHighScore(`${this.gameType}_${key}`), defaultValue);
    }

    updateScore(points) {
        this.state.score += points;
        this.saveHighScore();
        this.autoUpdateLevel();
        this.onScoreUpdate && this.onScoreUpdate(this.state.score);
    }

    setScore(score) {
        this.state.score = score;
        this.saveHighScore();
        this.autoUpdateLevel();
        this.onScoreUpdate && this.onScoreUpdate(this.state.score);
    }

    updateLevel(newLevel, showNotification = true) {
        if (newLevel > this.state.level) {
            const oldLevel = this.state.level;
            this.state.level = newLevel;

            if (showNotification && this.notify) {
                this.notify.levelUp(newLevel);
            }

            this.onLevelUp && this.onLevelUp(newLevel, oldLevel);

            console.log(`等级提升: ${oldLevel} -> ${newLevel}`);
        }
    }

    showLevelUpMessage(_message) {
        if (this.notify) {
            this.notify.levelUp(this.state.level);
        }
    }

    start() {
        if (this.state.isRunning) {
            console.warn('游戏已在运行中');
            return;
        }

        this.state.isRunning = true;
        this.state.isPaused = false;
        this.state.isGameOver = false;

        console.log(`${this.gameType}游戏已开始`);
        this.onStart && this.onStart();
    }

    pause() {
        if (!this.state.isRunning || this.state.isPaused) return;

        this.state.isPaused = true;
        console.log(`${this.gameType}游戏已暂停`);
        this.onPause && this.onPause();
    }

    resume() {
        if (!this.state.isRunning || !this.state.isPaused) return;

        this.state.isPaused = false;
        console.log(`${this.gameType}游戏已恢复`);
        this.onResume && this.onResume();
    }

    gameOver() {
        if (this.state.isGameOver) return;

        this.state.isRunning = false;
        this.state.isPaused = false;
        this.state.isGameOver = true;

        const isNewRecord = this.saveHighScore();

        console.log(`${this.gameType}游戏结束，最终分数: ${this.state.score}`);
        this.onGameOver && this.onGameOver(this.state.score, this.state.highScore, isNewRecord);
    }

    reset() {
        this.state.score = 0;
        this.state.level = 1;
        this.state.isRunning = false;
        this.state.isPaused = false;
        this.state.isGameOver = false;

        console.log(`${this.gameType}游戏已重置`);
        this.onReset && this.onReset();
    }

    on(target, event, handler, options) {
        return this.eventManager.addEventListener(target, event, handler, options);
    }

    setTimeout(callback, delay) {
        return this.resourceManager.setTimeout(callback, delay);
    }

    setInterval(callback, interval) {
        return this.resourceManager.setInterval(callback, interval);
    }

    getStats() {
        return {
            gameType: this.gameType,
            state: { ...this.state },
            device: this.deviceInfo,
            resources: this.resourceManager.getStats(),
            eventListeners: this.eventManager.getListenerCount(),
            hasLevelSystem: !!this.levelSystem,
            hasNotifications: !!this.notify
        };
    }

    cleanup() {
        console.log(`开始清理${this.gameType}游戏资源...`);
        this.eventManager.cleanup();
        this.resourceManager.cleanup();
        console.log(`${this.gameType}游戏资源已清理完成`);
        this.onCleanup && this.onCleanup();
    }
}
