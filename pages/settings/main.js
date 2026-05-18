/**
 * 设置页面 - ES模块版本
 */
import '@styles/index.css';
import './style.css';
import { bootstrapCore, settingsManager, DEFAULT_SETTINGS } from '@core/index.js';
import { LLMClient } from '@shared/llm/client.js';
import { aiConfigManager, DEFAULT_AI_CONFIG } from '@shared/llm/config.js';

bootstrapCore();

function showNotification(message, duration = 3000) {
    let notification = document.querySelector('.settings-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'settings-notification';
        document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), duration);
}

function generateBonusMultipliers(stepValue) {
    const multipliers = [1];
    for (let i = 1; i < 10; i++) {
        multipliers.push(parseFloat((1 + i * stepValue).toFixed(1)));
    }
    return multipliers;
}

function resolveThemeChoice(theme) {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme || DEFAULT_SETTINGS.ui.theme;
}

const AI_PROVIDER_DEFAULTS = {
    custom: { apiUrl: '', model: DEFAULT_AI_CONFIG.model },
    openai: { apiUrl: 'https://api.openai.com/v1', model: DEFAULT_AI_CONFIG.model },
    deepseek: { apiUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    claude: { apiUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-3-sonnet-20240229' },
};

document.addEventListener('DOMContentLoaded', () => {
    // DOM元素引用
    const $ = (id) => document.getElementById(id);

    function readAIConfigFromForm() {
        return {
            enabled: $('ai-enabled')?.checked ?? DEFAULT_AI_CONFIG.enabled,
            provider: $('ai-provider')?.value || DEFAULT_AI_CONFIG.provider,
            apiUrl: $('ai-api-url')?.value.trim() || '',
            apiKey: $('ai-api-key')?.value.trim() || '',
            persistApiKey: $('ai-persist-api-key')?.checked ?? DEFAULT_AI_CONFIG.persistApiKey,
            model: $('ai-model')?.value.trim() || DEFAULT_AI_CONFIG.model,
            systemPrompt: $('ai-system-prompt')?.value.trim() || '',
            temperature: parseFloat($('ai-temperature')?.value || DEFAULT_AI_CONFIG.temperature),
            maxTokens: parseInt($('ai-max-tokens')?.value || DEFAULT_AI_CONFIG.maxTokens),
        };
    }

    function validateAIConfig(config) {
        if (!config.enabled) return { valid: false, message: 'AI功能当前已关闭' };
        if (!config.apiKey) return { valid: false, message: '请填写 API Key' };
        if (!config.model) return { valid: false, message: '请填写模型名称' };
        if (!config.apiUrl && config.provider !== 'openai') {
            return { valid: false, message: '请填写 API 地址' };
        }
        return { valid: true, message: '配置有效' };
    }

    function applyAIProviderPreset(provider) {
        const preset = AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.custom;
        const providerSelect = $('ai-provider');
        const previousProvider = providerSelect?.dataset.currentProvider || DEFAULT_AI_CONFIG.provider;
        const previousPreset = AI_PROVIDER_DEFAULTS[previousProvider] || AI_PROVIDER_DEFAULTS.custom;
        const apiUrlInput = $('ai-api-url');
        const modelInput = $('ai-model');

        if (apiUrlInput && (!apiUrlInput.value.trim() || apiUrlInput.value.trim() === previousPreset.apiUrl)) {
            apiUrlInput.value = preset.apiUrl;
        }
        if (modelInput && (!modelInput.value.trim() || modelInput.value.trim() === previousPreset.model)) {
            modelInput.value = preset.model;
        }
        if (providerSelect) providerSelect.dataset.currentProvider = provider;
    }

    function loadAISettings(config = aiConfigManager.getWithDefaults()) {
        setChecked($('ai-enabled'), config.enabled, DEFAULT_AI_CONFIG.enabled);
        setIf($('ai-provider'), config.provider, DEFAULT_AI_CONFIG.provider);
        if ($('ai-provider')) $('ai-provider').dataset.currentProvider = config.provider || DEFAULT_AI_CONFIG.provider;
        setIf($('ai-api-url'), config.apiUrl, DEFAULT_AI_CONFIG.apiUrl);
        setIf($('ai-api-key'), config.apiKey, DEFAULT_AI_CONFIG.apiKey);
        setChecked($('ai-persist-api-key'), config.persistApiKey, DEFAULT_AI_CONFIG.persistApiKey);
        setIf($('ai-model'), config.model, DEFAULT_AI_CONFIG.model);
        setIf($('ai-system-prompt'), config.systemPrompt, DEFAULT_AI_CONFIG.systemPrompt);
        setIf($('ai-temperature'), config.temperature, DEFAULT_AI_CONFIG.temperature);
        setText($('ai-temperature-value'), config.temperature, DEFAULT_AI_CONFIG.temperature);
        setIf($('ai-max-tokens'), config.maxTokens, DEFAULT_AI_CONFIG.maxTokens);
        setText($('ai-max-tokens-value'), config.maxTokens, DEFAULT_AI_CONFIG.maxTokens);
    }

    function resetAIToDefaults() {
        loadAISettings({ ...DEFAULT_AI_CONFIG });
    }

    // 加载设置
    function loadSettings() {
        const settings = settingsManager.settings;

        try {
            setIf($('theme-select'), settings.ui?.theme, DEFAULT_SETTINGS.ui.theme);
            document.body.classList.toggle('light-theme', resolveThemeChoice(settings.ui?.theme) === 'light');

            setIf($('font-size-slider'), settings.ui?.fontSize, DEFAULT_SETTINGS.ui.fontSize);
            setText($('font-size-slider-value'), settings.ui?.fontSize, DEFAULT_SETTINGS.ui.fontSize);

            setChecked($('animation-toggle'), settings.ui?.animations, DEFAULT_SETTINGS.ui.animations);
            setChecked($('high-contrast-toggle'), settings.ui?.highContrast, DEFAULT_SETTINGS.ui.highContrast);
            if (settings.ui?.highContrast) document.body.classList.add('high-contrast');

            loadAISettings();

            setIf($('volume-slider'), settings.audio?.volume, DEFAULT_SETTINGS.audio.volume);
            setText($('volume-slider-value'), settings.audio?.volume, DEFAULT_SETTINGS.audio.volume);
            setIf($('note-delay-slider'), settings.audio?.noteDelay, DEFAULT_SETTINGS.audio.noteDelay);
            setText($('note-delay-slider-value'), settings.audio?.noteDelay, DEFAULT_SETTINGS.audio.noteDelay);
            setIf($('answer-delay-slider'), settings.audio?.answerDelay, DEFAULT_SETTINGS.audio.answerDelay);
            setText($('answer-delay-slider-value'), settings.audio?.answerDelay, DEFAULT_SETTINGS.audio.answerDelay);
            setChecked($('auto-play-next'), settings.audio?.autoPlayNext, DEFAULT_SETTINGS.audio.autoPlayNext);
            setChecked($('sound-effects-toggle'), settings.audio?.soundEffects, DEFAULT_SETTINGS.audio.soundEffects);
            setChecked($('use-synth-audio-toggle'), settings.audio?.useSynthAudio, DEFAULT_SETTINGS.audio.useSynthAudio);

            setIf($('starting-difficulty'), settings.music?.startingDifficulty, DEFAULT_SETTINGS.music.startingDifficulty);
            setIf($('melody-length'), settings.music?.melodyLength, DEFAULT_SETTINGS.music.melodyLength);
            setIf($('points-per-correct'), settings.music?.pointsPerCorrect, DEFAULT_SETTINGS.music.pointsPerCorrect);
            setText($('points-per-correct-value'), settings.music?.pointsPerCorrect, DEFAULT_SETTINGS.music.pointsPerCorrect);
            setChecked($('show-hints'), settings.music?.showHints, DEFAULT_SETTINGS.music.showHints);

            setIf($('game-speed-slider'), settings.games?.gameSpeed, DEFAULT_SETTINGS.games.gameSpeed);
            setText($('game-speed-slider-value'), settings.games?.gameSpeed, DEFAULT_SETTINGS.games.gameSpeed);
            setChecked($('vibration-feedback-toggle'), settings.games?.vibrationFeedback, DEFAULT_SETTINGS.games.vibrationFeedback);
            setIf($('snake-color-select'), settings.games?.snakeColor, DEFAULT_SETTINGS.games.snakeColor);
            setChecked($('tetris-rotation-toggle'), (settings.games?.tetrisRotationSystem) === 'modern');

            setChecked($('show-avatars-toggle'), settings.forum?.showAvatars, DEFAULT_SETTINGS.forum.showAvatars);
            setIf($('comments-per-page'), settings.forum?.commentsPerPage, DEFAULT_SETTINGS.forum.commentsPerPage);
            setIf($('default-sort'), settings.forum?.defaultSort, DEFAULT_SETTINGS.forum.defaultSort);

            // 游戏特定设置
            setIf($('tetris-base-speed'), settings.tetris?.baseLevelSpeed, DEFAULT_SETTINGS.tetris.baseLevelSpeed);
            setText($('tetris-base-speed-value'), settings.tetris?.baseLevelSpeed, DEFAULT_SETTINGS.tetris.baseLevelSpeed);
            setIf($('tetris-speed-decrease'), settings.tetris?.speedDecreasePerLevel, DEFAULT_SETTINGS.tetris.speedDecreasePerLevel);
            setText($('tetris-speed-decrease-value'), settings.tetris?.speedDecreasePerLevel, DEFAULT_SETTINGS.tetris.speedDecreasePerLevel);
            setIf($('tetris-score-multiplier'), settings.tetris?.scoreMultiplierIncrement, DEFAULT_SETTINGS.tetris.scoreMultiplierIncrement);
            setText($('tetris-score-multiplier-value'), settings.tetris?.scoreMultiplierIncrement, DEFAULT_SETTINGS.tetris.scoreMultiplierIncrement);
            setIf($('tetris-combo-multiplier'), settings.tetris?.comboMaxMultiplier, DEFAULT_SETTINGS.tetris.comboMaxMultiplier);
            setText($('tetris-combo-multiplier-value'), settings.tetris?.comboMaxMultiplier, DEFAULT_SETTINGS.tetris.comboMaxMultiplier);
            setIf($('tetris-ability-threshold'), settings.tetris?.abilityThresholdAdjustment, DEFAULT_SETTINGS.tetris.abilityThresholdAdjustment);
            setText($('tetris-ability-threshold-value'), settings.tetris?.abilityThresholdAdjustment, DEFAULT_SETTINGS.tetris.abilityThresholdAdjustment);
            setIf($('tetris-special-piece'), settings.tetris?.maxSpecialPieceChance, DEFAULT_SETTINGS.tetris.maxSpecialPieceChance);
            setText($('tetris-special-piece-value'), settings.tetris?.maxSpecialPieceChance, DEFAULT_SETTINGS.tetris.maxSpecialPieceChance);

            setIf($('snake-initial-speed'), settings.snake?.initialSpeed, DEFAULT_SETTINGS.snake.initialSpeed);
            setText($('snake-initial-speed-value'), settings.snake?.initialSpeed, DEFAULT_SETTINGS.snake.initialSpeed);
            setIf($('snake-speed-decrease'), settings.snake?.speedDecreasePerPoint, DEFAULT_SETTINGS.snake.speedDecreasePerPoint);
            setText($('snake-speed-decrease-value'), settings.snake?.speedDecreasePerPoint, DEFAULT_SETTINGS.snake.speedDecreasePerPoint);
            setIf($('snake-special-food'), settings.snake?.specialFoodChance, DEFAULT_SETTINGS.snake.specialFoodChance);
            setText($('snake-special-food-value'), settings.snake?.specialFoodChance, DEFAULT_SETTINGS.snake.specialFoodChance);
            setIf($('snake-food-multiplier'), settings.snake?.specialFoodScoreMultiplier, DEFAULT_SETTINGS.snake.specialFoodScoreMultiplier);
            setText($('snake-food-multiplier-value'), settings.snake?.specialFoodScoreMultiplier, DEFAULT_SETTINGS.snake.specialFoodScoreMultiplier);
            setChecked($('snake-wall-collision'), settings.snake?.wallCollision, DEFAULT_SETTINGS.snake.wallCollision);

            setIf($('2048-animation-speed'), settings.game2048?.animationSpeed, DEFAULT_SETTINGS.game2048.animationSpeed);
            setText($('2048-animation-speed-value'), settings.game2048?.animationSpeed, DEFAULT_SETTINGS.game2048.animationSpeed);
            const bonusStep = settings.game2048?.levelBonusStep ?? DEFAULT_SETTINGS.game2048.levelBonusStep;
            setIf($('2048-level-bonus'), bonusStep, DEFAULT_SETTINGS.game2048.levelBonusStep);
            setText($('2048-level-bonus-value'), bonusStep, DEFAULT_SETTINGS.game2048.levelBonusStep);
            setIf($('2048-tile4-probability'), settings.game2048?.initialTile4Probability, DEFAULT_SETTINGS.game2048.initialTile4Probability);
            setText($('2048-tile4-probability-value'), settings.game2048?.initialTile4Probability, DEFAULT_SETTINGS.game2048.initialTile4Probability);
            setChecked($('2048-animations-toggle'), settings.game2048?.showAnimations, DEFAULT_SETTINGS.game2048.showAnimations);

            setIf($('memory-default-difficulty'), settings.memory?.defaultDifficulty, DEFAULT_SETTINGS.memory.defaultDifficulty);
            setIf($('memory-card-duration'), settings.memory?.cardShowDuration, DEFAULT_SETTINGS.memory.cardShowDuration);
            setText($('memory-card-duration-value'), settings.memory?.cardShowDuration, DEFAULT_SETTINGS.memory.cardShowDuration);
            setIf($('memory-match-bonus'), settings.memory?.consecutiveMatchBonus, DEFAULT_SETTINGS.memory.consecutiveMatchBonus);
            setText($('memory-match-bonus-value'), settings.memory?.consecutiveMatchBonus, DEFAULT_SETTINGS.memory.consecutiveMatchBonus);
            setIf($('memory-wrong-penalty'), settings.memory?.wrongMatchPenalty, DEFAULT_SETTINGS.memory.wrongMatchPenalty);
            setText($('memory-wrong-penalty-value'), settings.memory?.wrongMatchPenalty, DEFAULT_SETTINGS.memory.wrongMatchPenalty);
            setIf($('memory-timer-penalty'), settings.memory?.timerPenaltyPerSecond, DEFAULT_SETTINGS.memory.timerPenaltyPerSecond);
            setText($('memory-timer-penalty-value'), settings.memory?.timerPenaltyPerSecond, DEFAULT_SETTINGS.memory.timerPenaltyPerSecond);

        } catch (e) {
            console.error('加载设置出错:', e);
            resetToDefaults();
        }
    }

    function resetToDefaults() {
        const d = DEFAULT_SETTINGS;
        setIf($('theme-select'), d.ui.theme);
        document.body.classList.toggle('light-theme', resolveThemeChoice(d.ui.theme) === 'light');
        setIf($('font-size-slider'), d.ui.fontSize); setText($('font-size-slider-value'), d.ui.fontSize);
        setChecked($('animation-toggle'), d.ui.animations);
        setChecked($('high-contrast-toggle'), d.ui.highContrast);
        document.body.classList.toggle('high-contrast', d.ui.highContrast);
        resetAIToDefaults();
        setIf($('volume-slider'), d.audio.volume); setText($('volume-slider-value'), d.audio.volume);
        setIf($('note-delay-slider'), d.audio.noteDelay); setText($('note-delay-slider-value'), d.audio.noteDelay);
        setIf($('answer-delay-slider'), d.audio.answerDelay); setText($('answer-delay-slider-value'), d.audio.answerDelay);
        setChecked($('auto-play-next'), d.audio.autoPlayNext);
        setChecked($('sound-effects-toggle'), d.audio.soundEffects);
        setChecked($('use-synth-audio-toggle'), d.audio.useSynthAudio);
        setIf($('starting-difficulty'), d.music.startingDifficulty);
        setIf($('melody-length'), d.music.melodyLength);
        setIf($('points-per-correct'), d.music.pointsPerCorrect); setText($('points-per-correct-value'), d.music.pointsPerCorrect);
        setChecked($('show-hints'), d.music.showHints);
        setIf($('game-speed-slider'), d.games.gameSpeed); setText($('game-speed-slider-value'), d.games.gameSpeed);
        setChecked($('vibration-feedback-toggle'), d.games.vibrationFeedback);
        setIf($('snake-color-select'), d.games.snakeColor);
        setChecked($('tetris-rotation-toggle'), d.games.tetrisRotationSystem === 'modern');
        setChecked($('show-avatars-toggle'), d.forum.showAvatars);
        setIf($('comments-per-page'), d.forum.commentsPerPage);
        setIf($('default-sort'), d.forum.defaultSort);
        // 游戏特定
        setIf($('tetris-base-speed'), d.tetris.baseLevelSpeed); setText($('tetris-base-speed-value'), d.tetris.baseLevelSpeed);
        setIf($('tetris-speed-decrease'), d.tetris.speedDecreasePerLevel); setText($('tetris-speed-decrease-value'), d.tetris.speedDecreasePerLevel);
        setIf($('tetris-score-multiplier'), d.tetris.scoreMultiplierIncrement); setText($('tetris-score-multiplier-value'), d.tetris.scoreMultiplierIncrement);
        setIf($('tetris-combo-multiplier'), d.tetris.comboMaxMultiplier); setText($('tetris-combo-multiplier-value'), d.tetris.comboMaxMultiplier);
        setIf($('tetris-ability-threshold'), d.tetris.abilityThresholdAdjustment); setText($('tetris-ability-threshold-value'), d.tetris.abilityThresholdAdjustment);
        setIf($('tetris-special-piece'), d.tetris.maxSpecialPieceChance); setText($('tetris-special-piece-value'), d.tetris.maxSpecialPieceChance);
        setIf($('snake-initial-speed'), d.snake.initialSpeed); setText($('snake-initial-speed-value'), d.snake.initialSpeed);
        setIf($('snake-speed-decrease'), d.snake.speedDecreasePerPoint); setText($('snake-speed-decrease-value'), d.snake.speedDecreasePerPoint);
        setIf($('snake-special-food'), d.snake.specialFoodChance); setText($('snake-special-food-value'), d.snake.specialFoodChance);
        setIf($('snake-food-multiplier'), d.snake.specialFoodScoreMultiplier); setText($('snake-food-multiplier-value'), d.snake.specialFoodScoreMultiplier);
        setChecked($('snake-wall-collision'), d.snake.wallCollision);
        setIf($('2048-animation-speed'), d.game2048.animationSpeed); setText($('2048-animation-speed-value'), d.game2048.animationSpeed);
        setIf($('2048-level-bonus'), d.game2048.levelBonusStep); setText($('2048-level-bonus-value'), d.game2048.levelBonusStep);
        setIf($('2048-tile4-probability'), d.game2048.initialTile4Probability); setText($('2048-tile4-probability-value'), d.game2048.initialTile4Probability);
        setChecked($('2048-animations-toggle'), d.game2048.showAnimations);
        setIf($('memory-default-difficulty'), d.memory.defaultDifficulty);
        setIf($('memory-card-duration'), d.memory.cardShowDuration); setText($('memory-card-duration-value'), d.memory.cardShowDuration);
        setIf($('memory-match-bonus'), d.memory.consecutiveMatchBonus); setText($('memory-match-bonus-value'), d.memory.consecutiveMatchBonus);
        setIf($('memory-wrong-penalty'), d.memory.wrongMatchPenalty); setText($('memory-wrong-penalty-value'), d.memory.wrongMatchPenalty);
        setIf($('memory-timer-penalty'), d.memory.timerPenaltyPerSecond); setText($('memory-timer-penalty-value'), d.memory.timerPenaltyPerSecond);
    }

    function saveSettings() {
        const settings = {
            ui: {
                theme: $('theme-select').value,
                fontSize: parseInt($('font-size-slider').value),
                animations: $('animation-toggle').checked,
                highContrast: $('high-contrast-toggle').checked
            },
            audio: {
                volume: parseFloat($('volume-slider').value),
                noteDelay: parseInt($('note-delay-slider').value),
                answerDelay: parseInt($('answer-delay-slider').value),
                autoPlayNext: $('auto-play-next').checked,
                soundEffects: $('sound-effects-toggle')?.checked ?? DEFAULT_SETTINGS.audio.soundEffects,
                useSynthAudio: $('use-synth-audio-toggle').checked
            },
            music: {
                startingDifficulty: parseInt($('starting-difficulty').value),
                melodyLength: parseInt($('melody-length').value),
                pointsPerCorrect: parseInt($('points-per-correct').value),
                showHints: $('show-hints').checked
            },
            games: {
                gameSpeed: parseInt($('game-speed-slider')?.value || DEFAULT_SETTINGS.games.gameSpeed),
                vibrationFeedback: $('vibration-feedback-toggle')?.checked ?? DEFAULT_SETTINGS.games.vibrationFeedback,
                snakeColor: $('snake-color-select')?.value || DEFAULT_SETTINGS.games.snakeColor,
                tetrisRotationSystem: $('tetris-rotation-toggle')?.checked ? 'modern' : 'classic'
            },
            forum: {
                showAvatars: $('show-avatars-toggle')?.checked ?? DEFAULT_SETTINGS.forum.showAvatars,
                commentsPerPage: parseInt($('comments-per-page')?.value || DEFAULT_SETTINGS.forum.commentsPerPage),
                defaultSort: $('default-sort')?.value || DEFAULT_SETTINGS.forum.defaultSort
            },
            tetris: {
                baseLevelSpeed: parseInt($('tetris-base-speed')?.value || DEFAULT_SETTINGS.tetris.baseLevelSpeed),
                speedDecreasePerLevel: parseInt($('tetris-speed-decrease')?.value || DEFAULT_SETTINGS.tetris.speedDecreasePerLevel),
                minSpeed: DEFAULT_SETTINGS.tetris.minSpeed,
                scoreMultiplierBase: DEFAULT_SETTINGS.tetris.scoreMultiplierBase,
                scoreMultiplierIncrement: parseFloat($('tetris-score-multiplier')?.value || DEFAULT_SETTINGS.tetris.scoreMultiplierIncrement),
                maxScoreMultiplier: DEFAULT_SETTINGS.tetris.maxScoreMultiplier,
                comboMaxMultiplier: parseFloat($('tetris-combo-multiplier')?.value || DEFAULT_SETTINGS.tetris.comboMaxMultiplier),
                comboMultiplierStep: DEFAULT_SETTINGS.tetris.comboMultiplierStep,
                comboRewards: DEFAULT_SETTINGS.tetris.comboRewards,
                abilityThresholdAdjustment: parseInt($('tetris-ability-threshold')?.value || 0),
                abilityUnlockThresholds: DEFAULT_SETTINGS.tetris.abilityUnlockThresholds,
                slowTimeEffectDuration: DEFAULT_SETTINGS.tetris.slowTimeEffectDuration,
                specialPieceChanceBase: DEFAULT_SETTINGS.tetris.specialPieceChanceBase,
                specialPieceChanceIncrement: DEFAULT_SETTINGS.tetris.specialPieceChanceIncrement,
                maxSpecialPieceChance: parseFloat($('tetris-special-piece')?.value || DEFAULT_SETTINGS.tetris.maxSpecialPieceChance)
            },
            snake: {
                initialSpeed: parseInt($('snake-initial-speed')?.value || DEFAULT_SETTINGS.snake.initialSpeed),
                minSpeed: DEFAULT_SETTINGS.snake.minSpeed,
                speedDecreasePerPoint: parseFloat($('snake-speed-decrease')?.value || DEFAULT_SETTINGS.snake.speedDecreasePerPoint),
                gridSize: DEFAULT_SETTINGS.snake.gridSize,
                boardWidth: DEFAULT_SETTINGS.snake.boardWidth,
                boardHeight: DEFAULT_SETTINGS.snake.boardHeight,
                specialFoodChance: parseFloat($('snake-special-food')?.value || DEFAULT_SETTINGS.snake.specialFoodChance),
                specialFoodScoreMultiplier: parseFloat($('snake-food-multiplier')?.value || DEFAULT_SETTINGS.snake.specialFoodScoreMultiplier),
                specialFoodDuration: DEFAULT_SETTINGS.snake.specialFoodDuration,
                wallCollision: $('snake-wall-collision')?.checked ?? DEFAULT_SETTINGS.snake.wallCollision,
                growthPerFood: DEFAULT_SETTINGS.snake.growthPerFood
            },
            game2048: {
                levelThresholds: DEFAULT_SETTINGS.game2048.levelThresholds,
                levelBonusMultipliers: generateBonusMultipliers(parseFloat($('2048-level-bonus')?.value || DEFAULT_SETTINGS.game2048.levelBonusStep)),
                levelBonusStep: parseFloat($('2048-level-bonus')?.value || DEFAULT_SETTINGS.game2048.levelBonusStep),
                initialTile4Probability: parseFloat($('2048-tile4-probability')?.value || DEFAULT_SETTINGS.game2048.initialTile4Probability),
                tile4ProbabilityIncrement: DEFAULT_SETTINGS.game2048.tile4ProbabilityIncrement,
                maxTile4Probability: DEFAULT_SETTINGS.game2048.maxTile4Probability,
                animationSpeed: parseInt($('2048-animation-speed')?.value || DEFAULT_SETTINGS.game2048.animationSpeed),
                showAnimations: $('2048-animations-toggle')?.checked ?? DEFAULT_SETTINGS.game2048.showAnimations
            },
            memory: {
                difficulties: DEFAULT_SETTINGS.memory.difficulties,
                cardShowDuration: parseInt($('memory-card-duration')?.value || DEFAULT_SETTINGS.memory.cardShowDuration),
                timerPenaltyPerSecond: parseInt($('memory-timer-penalty')?.value || DEFAULT_SETTINGS.memory.timerPenaltyPerSecond),
                consecutiveMatchBonus: parseInt($('memory-match-bonus')?.value || DEFAULT_SETTINGS.memory.consecutiveMatchBonus),
                wrongMatchPenalty: parseInt($('memory-wrong-penalty')?.value || DEFAULT_SETTINGS.memory.wrongMatchPenalty),
                defaultDifficulty: $('memory-default-difficulty')?.value || DEFAULT_SETTINGS.memory.defaultDifficulty
            }
        };

        settingsManager.save(settings);
        aiConfigManager.save(readAIConfigFromForm());

        document.body.classList.toggle('light-theme', resolveThemeChoice(settings.ui.theme) === 'light');
        document.body.classList.toggle('high-contrast', settings.ui.highContrast);
        document.documentElement.style.fontSize = settings.ui.fontSize + 'px';

        showNotification('设置已保存。部分页面需要刷新或重新进入后生效。', 5000);
    }

    // 绑定滑块显示更新
    function bindSlider(id, displayId) {
        const slider = $(id);
        const display = $(displayId);
        if (slider && display) {
            slider.addEventListener('input', () => { display.textContent = slider.value; });
        }
    }

    bindSlider('volume-slider', 'volume-slider-value');
    bindSlider('ai-temperature', 'ai-temperature-value');
    bindSlider('ai-max-tokens', 'ai-max-tokens-value');
    bindSlider('note-delay-slider', 'note-delay-slider-value');
    bindSlider('answer-delay-slider', 'answer-delay-slider-value');
    bindSlider('points-per-correct', 'points-per-correct-value');
    bindSlider('font-size-slider', 'font-size-slider-value');
    bindSlider('game-speed-slider', 'game-speed-slider-value');
    bindSlider('tetris-base-speed', 'tetris-base-speed-value');
    bindSlider('tetris-speed-decrease', 'tetris-speed-decrease-value');
    bindSlider('tetris-score-multiplier', 'tetris-score-multiplier-value');
    bindSlider('tetris-combo-multiplier', 'tetris-combo-multiplier-value');
    bindSlider('tetris-ability-threshold', 'tetris-ability-threshold-value');
    bindSlider('tetris-special-piece', 'tetris-special-piece-value');
    bindSlider('snake-initial-speed', 'snake-initial-speed-value');
    bindSlider('snake-speed-decrease', 'snake-speed-decrease-value');
    bindSlider('snake-special-food', 'snake-special-food-value');
    bindSlider('snake-food-multiplier', 'snake-food-multiplier-value');
    bindSlider('2048-animation-speed', '2048-animation-speed-value');
    bindSlider('2048-level-bonus', '2048-level-bonus-value');
    bindSlider('2048-tile4-probability', '2048-tile4-probability-value');
    bindSlider('memory-card-duration', 'memory-card-duration-value');
    bindSlider('memory-match-bonus', 'memory-match-bonus-value');
    bindSlider('memory-wrong-penalty', 'memory-wrong-penalty-value');
    bindSlider('memory-timer-penalty', 'memory-timer-penalty-value');

    // 字体大小实时预览
    const fontSizeSlider = $('font-size-slider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', () => {
            document.documentElement.style.fontSize = fontSizeSlider.value + 'px';
        });
    }

    $('ai-provider')?.addEventListener('change', function() {
        applyAIProviderPreset(this.value);
    });

    async function testAIConnection() {
        const button = $('test-ai-connection');
        const status = $('ai-test-status');
        const config = readAIConfigFromForm();
        const validation = validateAIConfig(config);

        if (status) {
            status.textContent = validation.valid ? '正在测试...' : validation.message;
            status.className = `settings-status ${validation.valid ? 'pending' : 'error'}`;
        }
        if (!validation.valid) return;

        if (button) button.disabled = true;
        try {
            const reply = config.provider === 'claude'
                ? await testClaudeConnection(config)
                : await testOpenAICompatibleConnection(config);
            if (status) {
                status.textContent = `连接成功：${reply.slice(0, 40)}`;
                status.className = 'settings-status success';
            }
        } catch (error) {
            if (status) {
                status.textContent = `连接失败：${error.message}`;
                status.className = 'settings-status error';
            }
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function testOpenAICompatibleConnection(config) {
        const client = LLMClient.createFromConfig({
            apiKey: config.apiKey,
            baseUrl: config.apiUrl || null,
            model: config.model,
        });
        const result = await client.stream([
            { role: 'user', content: '请只回复 OK' },
        ], {
            timeout: 30,
            temperature: Math.min(config.temperature, 1),
            maxTokens: Math.min(config.maxTokens || 100, 100),
            maxRetries: 0,
        });
        return result.content || 'OK';
    }

    async function testClaudeConnection(config) {
        const response = await fetch(config.apiUrl || AI_PROVIDER_DEFAULTS.claude.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: Math.min(config.maxTokens || 100, 100),
                temperature: Math.min(config.temperature, 1),
                messages: [{ role: 'user', content: '请只回复 OK' }],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || response.statusText);
        }

        const data = await response.json();
        return data.content?.[0]?.text || 'OK';
    }

    $('test-ai-connection')?.addEventListener('click', testAIConnection);

    // 保存/重置按钮
    $('save-settings')?.addEventListener('click', saveSettings);
    $('reset-settings')?.addEventListener('click', () => {
        if (confirm('确定要恢复所有设置到默认值吗？')) {
            resetToDefaults();
            saveSettings();
        }
    });

    // 主题即时切换
    $('theme-select')?.addEventListener('change', function() {
        document.body.classList.toggle('light-theme', resolveThemeChoice(this.value) === 'light');
    });

    $('high-contrast-toggle')?.addEventListener('change', function() {
        document.body.classList.toggle('high-contrast', this.checked);
    });

    function activateSettingsTab(targetId, updateHash = false) {
        const tab = document.querySelector(`.settings-tabs .tab-button[data-target="${targetId}"]`);
        const target = document.getElementById(targetId);
        if (!tab || !target) return false;

        document.querySelectorAll('.settings-tabs .tab-button').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        target.classList.add('active');
        if (updateHash && location.hash !== `#${targetId}`) {
            history.replaceState(null, '', `#${targetId}`);
        }
        return true;
    }

    // 选项卡切换
    document.querySelectorAll('.settings-tabs .tab-button').forEach(tab => {
        tab.addEventListener('click', function() {
            activateSettingsTab(this.dataset.target, true);
        });
    });
    const initialTarget = location.hash ? location.hash.slice(1) : '';
    if (!activateSettingsTab(initialTarget)) {
        const firstTab = document.querySelector('.settings-tabs .tab-button');
        if (firstTab) activateSettingsTab(firstTab.dataset.target);
    }
    window.addEventListener('hashchange', () => {
        if (location.hash) activateSettingsTab(location.hash.slice(1));
    });

    // 游戏子选项卡
    document.querySelectorAll('.games-subtabs .subtab-button').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.games-subtabs .subtab-button').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.games-subsection').forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            const target = document.getElementById(this.dataset.target);
            if (target) target.classList.add('active');
        });
    });

    loadSettings();
    console.log('设置页面已初始化');
});

// 辅助函数
function setIf(el, value, defaultVal) {
    if (el && value !== undefined) el.value = value;
    else if (el && defaultVal !== undefined) el.value = defaultVal;
}

function setText(el, value, defaultVal) {
    if (el) el.textContent = value !== undefined ? value : (defaultVal !== undefined ? defaultVal : '');
}

function setChecked(el, value, defaultVal) {
    if (el) el.checked = value !== undefined ? value : (defaultVal !== undefined ? defaultVal : false);
}
