/**
 * 俄罗斯方块游戏 - 基于GameBase架构
 */
import '@styles/index.css';
import '../game-animations.css';
import '../responsive.css';
import './style.css';
import './animations.css';
import { bootstrapCore } from '@core/index.js';
import { GameBase, TouchGestureHandler } from '../_base/index.js';

class TetrisGame extends GameBase {
    constructor() {
        super('tetris', { enableAutoCleanup: true });

        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;

        this.SHAPES = {
            'I': [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
            'O': [[1,1], [1,1]],
            'T': [[0,1,0], [1,1,1], [0,0,0]],
            'L': [[0,0,1], [1,1,1], [0,0,0]],
            'J': [[1,0,0], [1,1,1], [0,0,0]],
            'S': [[0,1,1], [1,1,0], [0,0,0]],
            'Z': [[1,1,0], [0,1,1], [0,0,0]]
        };

        this.levelConfig = this.generateLevelConfig();
        this.comboAbilities = this.loadComboAbilities();

        this.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
        this.currentPiece = null;
        this.currentPiecePosition = { x: 0, y: 0 };
        this.nextPiece = null;
        this.gameLoopInterval = null;
        this.lines = 0;
        this.combo = 0;
        this.isSpecialPiece = false;
        this.activeAbilities = [];
        this.slowTimeEffect = null;

        this.boardElement = document.querySelector('.tetris-board');
        this.nextPieceElement = document.querySelector('.next-piece');
        this.scoreElement = document.getElementById('score');
        this.levelElement = document.getElementById('level');
        this.linesElement = document.getElementById('lines');
        this.gameOverElement = document.querySelector('.game-over-overlay');
        this.comboElement = null;
        this.abilitiesElement = null;

        this.init();
    }

    generateLevelConfig() {
        const config = {};
        const baseSpeed = this.settings.baseLevelSpeed || 1000;
        const speedDecrease = this.settings.speedDecreasePerLevel || 100;
        const minSpeed = this.settings.minSpeed || 100;
        const scoreMultiplierBase = this.settings.scoreMultiplierBase || 1;
        const scoreMultiplierIncrement = this.settings.scoreMultiplierIncrement || 0.1;
        for (let i = 1; i <= 10; i++) {
            const levelSpeed = Math.max(baseSpeed - (i - 1) * speedDecrease, minSpeed);
            const multiplier = scoreMultiplierBase + (i - 1) * scoreMultiplierIncrement;
            const specialChance = Math.min((i - 1) * (this.settings.specialPieceChanceIncrement || 0.05), this.settings.maxSpecialPieceChance || 0.2);
            config[i] = { speed: levelSpeed, scoreMultiplier: parseFloat(multiplier.toFixed(1)), specialPieceChance: parseFloat(specialChance.toFixed(2)) };
        }
        return config;
    }

    loadComboAbilities() {
        const defaultAbilities = {
            8: { name: "行消除", description: "消除游戏板底部一行", action: () => this.clearBottomLine(), icon: "🧹" },
            12: { name: "时间减缓", description: "暂时减缓方块下落速度", action: () => this.slowDownTime(), icon: "⏱️" },
            16: { name: "方块变形", description: "将当前方块变为I形方块", action: () => this.transformToIShape(), icon: "🔄" }
        };
        if (this.settings.abilityUnlockThresholds) {
            const adjustment = this.settings.abilityThresholdAdjustment || 0;
            const newAbilities = {};
            newAbilities[Math.max(1, (this.settings.abilityUnlockThresholds.lineClear || 8) + adjustment)] = defaultAbilities[8];
            newAbilities[Math.max(1, (this.settings.abilityUnlockThresholds.slowTime || 12) + adjustment)] = defaultAbilities[12];
            newAbilities[Math.max(1, (this.settings.abilityUnlockThresholds.shapeTransform || 16) + adjustment)] = defaultAbilities[16];
            return newAbilities;
        }
        return defaultAbilities;
    }

    init() {
        if (!this.boardElement) { console.error('游戏板元素未找到'); return; }
        this.createComboDisplay();
        this.createAbilitiesDisplay();
        this.setupControls();
        this.createBoard();
        this.createNextPiecePreview();
        this.nextPiece = this.generateRandomPiece();
        this.spawnNewPiece();
        this.updateStats();
    }

    createComboDisplay() {
        const statsContainer = document.querySelector('.stats');
        if (statsContainer && !document.getElementById('combo')) {
            const comboContainer = document.createElement('div');
            comboContainer.className = 'stat-item';
            comboContainer.innerHTML = '<span>连击:</span><span id="combo">0</span>';
            statsContainer.appendChild(comboContainer);
        }
        this.comboElement = document.getElementById('combo');
    }

    createAbilitiesDisplay() {
        if (!document.getElementById('abilities')) {
            const abilitiesContainer = document.createElement('div');
            abilitiesContainer.id = 'abilities';
            abilitiesContainer.className = 'abilities-container';
            abilitiesContainer.innerHTML = '<h3>特殊能力</h3><div class="abilities-list"></div>';
            const sidePanel = document.querySelector('.tetris-info');
            const controls = sidePanel?.querySelector('.controls');
            if (sidePanel) sidePanel.insertBefore(abilitiesContainer, controls || null);
            else document.querySelector('.game-area')?.appendChild(abilitiesContainer);
        }
        this.abilitiesElement = document.querySelector('.abilities-list');
    }

    setupControls() {
        this.on(document, 'keydown', (e) => this.handleKeyDown(e));
        if (this.deviceInfo.hasTouch) this.setupMobileControls();

        const startBtn = document.getElementById('start-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const resetBtn = document.getElementById('reset-btn');
        const retryBtn = this.gameOverElement?.querySelector('button');

        if (startBtn) this.on(startBtn, 'click', () => this.handleStartButton());
        if (pauseBtn) this.on(pauseBtn, 'click', () => this.togglePause());
        if (resetBtn) this.on(resetBtn, 'click', () => this.resetGame());
        if (retryBtn) this.on(retryBtn, 'click', () => this.resetGame());
    }

    handleKeyDown(e) {
        if (e.keyCode === 80) { this.togglePause(); e.preventDefault(); return; }
        if (!this.state.isRunning || this.state.isGameOver) return;
        switch (e.keyCode) {
            case 37: this.movePiece(-1, 0); e.preventDefault(); break;
            case 39: this.movePiece(1, 0); e.preventDefault(); break;
            case 40: this.movePiece(0, 1); e.preventDefault(); break;
            case 38: this.rotatePiece(); e.preventDefault(); break;
            case 32: this.hardDrop(); e.preventDefault(); break;
        }
    }

    setupMobileControls() {
        const touchHandler = new TouchGestureHandler(this.boardElement, { minSwipeDistance: 20 });
        touchHandler.enableSwipe((gesture) => {
            if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;
            if (Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY)) this.movePiece(gesture.deltaX > 0 ? 1 : -1, 0);
            else if (gesture.deltaY > 0) this.movePiece(0, 1);
            else this.rotatePiece();
        });
        touchHandler.enableDoubleTap(() => {
            if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;
            this.hardDrop();
        });
    }

    createBoard() {
        this.boardElement.innerHTML = '';
        for (let y = 0; y < this.BOARD_HEIGHT; y++)
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                const cell = document.createElement('div');
                cell.className = 'tetris-cell';
                cell.setAttribute('data-x', x);
                cell.setAttribute('data-y', y);
                this.boardElement.appendChild(cell);
            }
    }

    createNextPiecePreview() {
        this.nextPieceElement.innerHTML = '';
        for (let y = 0; y < 4; y++)
            for (let x = 0; x < 4; x++) {
                const cell = document.createElement('div');
                cell.className = 'tetris-cell';
                this.nextPieceElement.appendChild(cell);
            }
    }

    generateRandomPiece() {
        const pieces = Object.keys(this.SHAPES);
        const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
        this.isSpecialPiece = Math.random() < this.levelConfig[this.state.level].specialPieceChance;
        return { shape: randomPiece, matrix: this.SHAPES[randomPiece], color: this.getPieceColor(randomPiece), isSpecial: this.isSpecialPiece };
    }

    getPieceColor(shape) {
        const colors = { 'I': 'i-block', 'O': 'o-block', 'T': 't-block', 'L': 'l-block', 'J': 'j-block', 'S': 's-block', 'Z': 'z-block' };
        return this.isSpecialPiece ? colors[shape] + ' special-block' : colors[shape] || '';
    }

    spawnNewPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.generateRandomPiece();
        const pieceWidth = this.currentPiece.matrix[0].length;
        this.currentPiecePosition = { x: Math.floor((this.BOARD_WIDTH - pieceWidth) / 2), y: 0 };
        if (this.checkCollision(this.currentPiecePosition.x, this.currentPiecePosition.y, this.currentPiece.matrix)) { this.endGame(); return; }
        this.drawBoard();
        this.updateNextPiecePreview();
    }

    updateNextPiecePreview() {
        const previewCells = this.nextPieceElement.querySelectorAll('.tetris-cell');
        previewCells.forEach(cell => { cell.className = 'tetris-cell'; cell.style.animation = ''; });
        const matrix = this.nextPiece.matrix;
        const color = this.nextPiece.color;
        for (let y = 0; y < matrix.length; y++)
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    const index = y * 4 + x;
                    if (previewCells[index]) {
                        previewCells[index].className = `tetris-cell ${color}`;
                        if (this.nextPiece.isSpecial) previewCells[index].style.animation = 'specialBlockGlow 1.5s infinite';
                    }
                }
            }
    }

    drawBoard() {
        const tempBoard = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
        for (let y = 0; y < this.BOARD_HEIGHT; y++)
            for (let x = 0; x < this.BOARD_WIDTH; x++)
                tempBoard[y][x] = this.board[y][x];
        if (this.currentPiece) {
            const matrix = this.currentPiece.matrix;
            const pos = this.currentPiecePosition;
            for (let y = 0; y < matrix.length; y++)
                for (let x = 0; x < matrix[y].length; x++)
                    if (matrix[y][x] && pos.y + y >= 0 && pos.y + y < this.BOARD_HEIGHT && pos.x + x < this.BOARD_WIDTH)
                        tempBoard[pos.y + y][pos.x + x] = this.currentPiece.color;
        }
        const cells = this.boardElement.querySelectorAll('.tetris-cell');
        for (let y = 0; y < this.BOARD_HEIGHT; y++)
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                const index = y * this.BOARD_WIDTH + x;
                cells[index].className = 'tetris-cell';
                if (tempBoard[y][x]) cells[index].className = `tetris-cell ${tempBoard[y][x]}`;
            }
    }

    movePiece(dx, dy) {
        if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;
        const newX = this.currentPiecePosition.x + dx;
        const newY = this.currentPiecePosition.y + dy;
        if (!this.checkCollision(newX, newY, this.currentPiece.matrix)) { this.currentPiecePosition.x = newX; this.currentPiecePosition.y = newY; this.drawBoard(); return true; }
        if (dy > 0) { this.fixPiece(); return false; }
        return false;
    }

    rotatePiece() {
        if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;
        const matrix = this.currentPiece.matrix;
        const n = matrix.length;
        const rotated = Array(n).fill().map(() => Array(n).fill(0));
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++)
                rotated[x][n - 1 - y] = matrix[y][x];
        if (!this.checkCollision(this.currentPiecePosition.x, this.currentPiecePosition.y, rotated)) { this.currentPiece.matrix = rotated; this.drawBoard(); return true; }
        const offsets = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: -1}, {x: 2, y: 0}, {x: -2, y: 0}];
        for (const offset of offsets) {
            if (!this.checkCollision(this.currentPiecePosition.x + offset.x, this.currentPiecePosition.y + offset.y, rotated)) {
                this.currentPiece.matrix = rotated; this.currentPiecePosition.x += offset.x; this.currentPiecePosition.y += offset.y; this.drawBoard(); return true;
            }
        }
        return false;
    }

    hardDrop() {
        if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;
        while (this.movePiece(0, 1)) this.updateScore(2);
        this.updateStats();
    }

    checkCollision(x, y, matrix) {
        for (let row = 0; row < matrix.length; row++)
            for (let col = 0; col < matrix[row].length; col++)
                if (matrix[row][col]) {
                    const newX = x + col; const newY = y + row;
                    if (newX < 0 || newX >= this.BOARD_WIDTH || newY >= this.BOARD_HEIGHT) return true;
                    if (newY >= 0 && this.board[newY][newX]) return true;
                }
        return false;
    }

    fixPiece() {
        const pos = this.currentPiecePosition;
        const matrix = this.currentPiece.matrix;
        for (let y = 0; y < matrix.length; y++)
            for (let x = 0; x < matrix[y].length; x++)
                if (matrix[y][x] && pos.y + y >= 0) this.board[pos.y + y][pos.x + x] = this.currentPiece.color;
        this.checkLines();
        this.spawnNewPiece();
    }

    checkLines() {
        let linesCleared = 0;
        for (let y = this.BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell)) {
                this.board.splice(y, 1); this.board.unshift(Array(this.BOARD_WIDTH).fill(0));
                linesCleared++; this.showLineClearEffect(y); y++;
            }
        }
        if (linesCleared > 0) {
            this.combo++;
            if (this.comboElement) { this.comboElement.textContent = this.combo; this.comboElement.setAttribute('data-value', Math.min(this.combo, 20).toString()); this.comboElement.style.animation = ''; this.setTimeout(() => { this.comboElement.style.animation = 'pulse 0.3s'; }, 10); }
            this.checkComboRewards();
            const linePoints = [0, 100, 300, 500, 800];
            let earnedScore = linePoints[linesCleared] * this.state.level;
            earnedScore = Math.floor(earnedScore * this.levelConfig[this.state.level].scoreMultiplier);
            const comboStep = this.settings.comboMultiplierStep || 0.1;
            const maxComboMultiplier = this.settings.comboMaxMultiplier || 2;
            const comboMultiplier = Math.min(1 + (this.combo * comboStep), maxComboMultiplier);
            earnedScore = Math.floor(earnedScore * comboMultiplier);
            if (this.currentPiece.isSpecial) { earnedScore *= 2; this.showSpecialScoreEffect(earnedScore); }
            this.updateScore(earnedScore);
            this.lines += linesCleared;
            this.showScoreEffect(earnedScore);
            const oldLevel = this.state.level;
            const newLevel = Math.min(Math.floor(this.lines / 10) + 1, 10);
            if (newLevel > oldLevel) {
                this.updateLevel(newLevel); this.showLevelUpEffect(oldLevel, newLevel);
                if (this.state.isRunning && this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); const newSpeed = this.levelConfig[newLevel].speed; this.gameLoopInterval = this.setInterval(() => this.gameLoop(), newSpeed); }
            }
            this.updateStats();
        } else { this.combo = 0; if (this.comboElement) { this.comboElement.textContent = '0'; this.comboElement.setAttribute('data-value', '0'); } }
    }

    checkComboRewards() {
        const configuredRewards = this.settings.comboRewards || {};
        const comboRewards = Object.fromEntries(
            Object.entries(configuredRewards).map(([combo, points]) => [
                combo,
                {
                    points,
                    message: `连击 x${combo}! +${points}分`,
                },
            ])
        );
        if (comboRewards[this.combo]) { const reward = comboRewards[this.combo]; this.updateScore(reward.points); this.showComboRewardEffect(reward.message, reward.points); }
        for (const comboThreshold in this.comboAbilities) {
            if (this.combo === parseInt(comboThreshold)) { this.addAbility(this.comboAbilities[comboThreshold]); break; }
        }
    }

    addAbility(ability) {
        this.activeAbilities.push(ability);
        const abilityButton = document.createElement('button');
        abilityButton.className = 'ability-button';
        abilityButton.innerHTML = `${ability.icon} ${ability.name}`;
        abilityButton.title = ability.description;
        abilityButton.dataset.abilityName = ability.name;
        this.on(abilityButton, 'click', () => { ability.action(); this.activeAbilities = this.activeAbilities.filter(a => a.name !== ability.name); abilityButton.remove(); this.showAbilityEffect(ability.name); });
        if (this.abilitiesElement) this.abilitiesElement.appendChild(abilityButton);
        this.showAbilityAcquiredEffect(ability);
    }

    clearBottomLine() { this.board.pop(); this.board.unshift(Array(this.BOARD_WIDTH).fill(0)); this.updateScore(100 * this.state.level); this.showLineClearEffect(this.BOARD_HEIGHT - 1); this.drawBoard(); this.updateStats(); }

    slowDownTime() {
        const originalSpeed = this.levelConfig[this.state.level].speed;
        const slowedSpeed = originalSpeed * 2;
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = this.setInterval(() => this.gameLoop(), slowedSpeed); }
        const slowTimeIndicator = document.createElement('div');
        slowTimeIndicator.className = 'slow-time-indicator';
        slowTimeIndicator.textContent = '时间减缓中...';
        slowTimeIndicator.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); color: #00FFFF; font-weight: bold; z-index: 104; padding: 5px 10px; background-color: rgba(0, 0, 0, 0.7); border-radius: 5px;';
        this.boardElement.appendChild(slowTimeIndicator);
        const duration = this.settings.slowTimeEffectDuration || 10000;
        this.slowTimeEffect = this.setTimeout(() => { if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = this.setInterval(() => this.gameLoop(), originalSpeed); } slowTimeIndicator.remove(); }, duration);
    }

    transformToIShape() {
        const originalPiece = { ...this.currentPiece };
        const currentX = this.currentPiecePosition.x; const currentY = this.currentPiecePosition.y;
        this.currentPiece = { shape: 'I', matrix: this.SHAPES['I'], color: this.getPieceColor('I'), isSpecial: true };
        const offsets = [-1, 1, -2, 2, 0, -3, 3];
        let validPosition = false;
        for (const offsetX of offsets) { if (!this.checkCollision(currentX + offsetX, currentY, this.currentPiece.matrix)) { this.currentPiecePosition.x = currentX + offsetX; validPosition = true; break; } }
        if (!validPosition) {
            for (const offsetY of [-1, -2, 1]) {
                if (!this.checkCollision(currentX, currentY + offsetY, this.currentPiece.matrix)) { this.currentPiecePosition.y = currentY + offsetY; validPosition = true; break; }
                for (const offsetX of [-1, 1, -2, 2]) { if (!this.checkCollision(currentX + offsetX, currentY + offsetY, this.currentPiece.matrix)) { this.currentPiecePosition.x = currentX + offsetX; this.currentPiecePosition.y = currentY + offsetY; validPosition = true; break; } }
                if (validPosition) break;
            }
        }
        if (!validPosition) { this.currentPiece = originalPiece; this.showTransformFailedEffect(); return false; }
        this.drawBoard(); return true;
    }

    gameLoop() { if (!this.state.isPaused && !this.state.isGameOver) this.movePiece(0, 1); }

    handleStartButton() { if (this.state.isGameOver) this.resetGame(); this.startGame(); }

    startGame() {
        if (this.state.isRunning) return;
        super.start();
        const startBtn = document.getElementById('start-btn'); const pauseBtn = document.getElementById('pause-btn');
        if (startBtn) startBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = false;
        const speed = this.levelConfig[this.state.level].speed;
        this.gameLoopInterval = this.setInterval(() => this.gameLoop(), speed);
    }

    togglePause() {
        if (this.state.isGameOver) return;
        const pauseBtn = document.getElementById('pause-btn');
        if (this.state.isPaused) { super.resume(); if (pauseBtn) pauseBtn.textContent = '暂停'; }
        else { super.pause(); if (pauseBtn) pauseBtn.textContent = '继续'; }
    }

    resetGame() {
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        if (this.slowTimeEffect) { this.resourceManager.clearTimeout(this.slowTimeEffect); this.slowTimeEffect = null; }
        super.reset();
        this.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
        this.currentPiece = null; this.nextPiece = this.generateRandomPiece(); this.lines = 0; this.combo = 0; this.activeAbilities = [];
        const startBtn = document.getElementById('start-btn'); const pauseBtn = document.getElementById('pause-btn');
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) { pauseBtn.disabled = true; pauseBtn.textContent = '暂停'; }
        if (this.abilitiesElement) this.abilitiesElement.innerHTML = '';
        if (this.gameOverElement) this.gameOverElement.style.display = 'none';
        document.querySelectorAll('.ability-effect, .slow-time-indicator, .score-popup, .combo-reward-popup, .ability-popup').forEach(e => e.remove());
        this.createBoard(); this.createNextPiecePreview(); this.spawnNewPiece(); this.updateStats();
    }

    endGame() {
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        super.gameOver();
        const startBtn = document.getElementById('start-btn'); const pauseBtn = document.getElementById('pause-btn');
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        if (this.gameOverElement) {
            this.gameOverElement.style.display = 'flex';
            const finalScoreElement = this.gameOverElement.querySelector('.final-score');
            if (finalScoreElement) finalScoreElement.textContent = this.state.score;
            let levelInfo = this.gameOverElement.querySelector('.level-info');
            if (!levelInfo) { levelInfo = document.createElement('p'); levelInfo.className = 'level-info'; this.gameOverElement.querySelector('p').after(levelInfo); }
            levelInfo.textContent = `达到等级: ${this.state.level}`;
            if (this.state.score === this.state.highScore && this.state.score > 0) {
                let newRecordElement = this.gameOverElement.querySelector('.new-record');
                if (!newRecordElement) { newRecordElement = document.createElement('p'); newRecordElement.className = 'new-record'; newRecordElement.style.cssText = 'color: #FFD700; font-size: 24px; font-weight: bold;'; levelInfo.after(newRecordElement); }
                newRecordElement.textContent = '新纪录!';
            }
        }
    }

    updateStats() {
        if (this.scoreElement) this.scoreElement.textContent = this.state.score;
        if (this.levelElement) this.levelElement.textContent = this.state.level;
        if (this.linesElement) this.linesElement.textContent = this.lines;
        if (this.comboElement) { this.comboElement.textContent = this.combo; this.comboElement.setAttribute('data-value', Math.min(this.combo, 20).toString()); }
    }

    showLineClearEffect(lineY) {
        const cells = this.boardElement.querySelectorAll(`.tetris-cell[data-y="${lineY}"]`);
        cells.forEach(cell => { cell.style.animation = 'lineClearEffect 0.3s'; });
    }

    showScoreEffect(points) { const popup = this.createPopup(`+${points}`, { color: '#FFD700', fontSize: '24px', top: '50%', animation: 'scorePopup 1s forwards' }); this.setTimeout(() => popup.remove(), 1000); }
    showSpecialScoreEffect(points) { const popup = this.createPopup(`特殊方块加成! +${points}`, { color: '#FF00FF', fontSize: '28px', top: '40%', animation: 'scorePopup 1.5s forwards' }); this.setTimeout(() => popup.remove(), 1500); }
    showComboRewardEffect(message, _points) { const popup = this.createPopup(message, { color: '#FFD700', fontSize: '28px', top: '30%', textShadow: '0 0 10px rgba(255, 215, 0, 0.8)', zIndex: '102', animation: 'comboRewardPopup 2s forwards' }); this.setTimeout(() => popup.remove(), 2000); }

    showLevelUpEffect(oldLevel, newLevel) {
        const message = document.createElement('div');
        message.className = 'level-up-message';
        message.textContent = `等级提升! ${oldLevel} → ${newLevel}`;
        message.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: rgba(76, 175, 80, 0.9); color: white; padding: 15px 30px; border-radius: 10px; font-size: 28px; font-weight: bold; z-index: 1000; box-shadow: 0 0 20px rgba(0, 0, 0, 0.3); animation: levelUpAnimation 2.5s ease-out forwards;';
        this.boardElement.parentElement.appendChild(message);
        this.setTimeout(() => message.remove(), 2500);
    }

    showAbilityAcquiredEffect(ability) { const popup = this.createPopup(`获得特殊能力: <strong>${ability.icon} ${ability.name}</strong>!`, { color: '#00FFFF', fontSize: '24px', top: '40%', textShadow: '0 0 10px rgba(0, 255, 255, 0.8)', zIndex: '103', animation: 'abilityPopup 2.5s forwards' }); this.setTimeout(() => popup.remove(), 2500); }

    showAbilityEffect(abilityName) {
        const effectElement = document.createElement('div');
        effectElement.className = 'ability-effect';
        switch (abilityName) {
            case "行消除": effectElement.style.cssText = 'background: linear-gradient(to top, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%); animation: fadeOut 1s forwards;'; break;
            case "时间减缓": effectElement.style.cssText = 'background: radial-gradient(circle, rgba(0,255,255,0.3) 0%, rgba(0,0,0,0) 70%); animation: pulseOut 2s forwards;'; break;
            case "方块变形": effectElement.style.cssText = 'background: radial-gradient(circle, rgba(255,255,0,0.3) 0%, rgba(0,0,0,0) 70%); animation: rotateOut 1s forwards;'; break;
        }
        this.boardElement.appendChild(effectElement);
        this.setTimeout(() => effectElement.remove(), 2000);
    }

    showTransformFailedEffect() { const message = this.createPopup("变形失败!", { color: 'red', fontSize: '24px', top: '20%', animation: 'fadeOut 1s forwards', zIndex: '1000' }); this.setTimeout(() => message.remove(), 1000); }

    createPopup(content, styles) {
        const popup = document.createElement('div');
        popup.innerHTML = content;
        const baseStyles = { position: 'absolute', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 'bold', zIndex: '100' };
        popup.style.cssText = Object.entries({ ...baseStyles, ...styles }).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ');
        this.boardElement.appendChild(popup);
        return popup;
    }
}

bootstrapCore();

document.addEventListener('DOMContentLoaded', () => {
    new TetrisGame();
    console.log('俄罗斯方块游戏已初始化');
});
