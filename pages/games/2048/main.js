/**
 * 2048游戏 - 基于GameBase架构
 */
import '@styles/index.css';
import '../game-animations.css';
import '../responsive.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { GameBase } from '../_base/index.js';

class Game2048 extends GameBase {
    constructor() {
        super('game2048', { enableAutoCleanup: true, enableNotifications: true });

        this.GRID_SIZE = 4;

        this.DEFAULT_LEVEL_CONFIG = {
            1: { scoreThreshold: 0, bonusMultiplier: 1.0 },
            2: { scoreThreshold: 500, bonusMultiplier: 1.2 },
            3: { scoreThreshold: 1500, bonusMultiplier: 1.4 },
            4: { scoreThreshold: 3000, bonusMultiplier: 1.6 },
            5: { scoreThreshold: 6000, bonusMultiplier: 1.8 },
            6: { scoreThreshold: 9000, bonusMultiplier: 2.0 },
            7: { scoreThreshold: 15000, bonusMultiplier: 2.5 },
            8: { scoreThreshold: 25000, bonusMultiplier: 3.0 },
            9: { scoreThreshold: 40000, bonusMultiplier: 3.5 },
            10: { scoreThreshold: 60000, bonusMultiplier: 4.0 }
        };

        this.levelConfig = JSON.parse(JSON.stringify(this.DEFAULT_LEVEL_CONFIG));
        this.animationSpeed = this.settings?.animationSpeed !== undefined ? this.settings.animationSpeed : 150;
        this.showAnimations = this.settings?.showAnimations !== undefined ? this.settings.showAnimations : true;
        this.tile4Probability = this.settings?.initialTile4Probability !== undefined ? this.settings.initialTile4Probability : 0.1;

        if (this.settings?.levelThresholds && Array.isArray(this.settings.levelThresholds)) {
            for (let i = 0; i < this.settings.levelThresholds.length && i < 10; i++) {
                this.levelConfig[i + 1].scoreThreshold = this.settings.levelThresholds[i];
            }
        }

        if (this.settings?.levelBonusMultipliers && Array.isArray(this.settings.levelBonusMultipliers)) {
            for (let i = 0; i < this.settings.levelBonusMultipliers.length && i < 10; i++) {
                this.levelConfig[i + 1].bonusMultiplier = this.settings.levelBonusMultipliers[i];
            }
        }

        this.setupLevelSystem(this.levelConfig);

        this.grid = [];
        this.gameOver = false;
        this.gameWon = false;
        this.canContinue = false;
        this.moveHistory = [];
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;

        this.gameBoard = document.getElementById('game2048-board');
        this.scoreElement = document.getElementById('score');
        this.bestScoreElement = document.getElementById('best-score');
        this.gameOverOverlay = document.getElementById('game-over');
        this.gameWinOverlay = document.getElementById('game-win');
        this.finalScoreElement = document.getElementById('final-score');
        this.winScoreElement = document.getElementById('win-score');
        this.startBtn = document.getElementById('start-btn');
        this.undoBtn = document.getElementById('undo-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.continueBtn = document.getElementById('continue-btn');
        this.newGameBtn = document.getElementById('new-game-btn');

        this.createLevelDisplay();
        document.documentElement.style.setProperty('--animation-speed', `${this.animationSpeed}ms`);

        if (!this.showAnimations) {
            this.gameBoard.classList.add('no-animation');
        }

        this.loadBestScore();
        this.init();
    }

    createLevelDisplay() {
        const statsContainer = document.querySelector('.stats');
        const levelContainer = document.createElement('div');
        levelContainer.className = 'stat-item';
        levelContainer.innerHTML = '<span>等级:</span><span id="level">1</span>';
        statsContainer.appendChild(levelContainer);
        this.levelElement = document.getElementById('level');
    }

    loadBestScore() {
        this.state.highScore = this.loadGameData('bestScore', 0);
        if (this.state.highScore > 0) {
            console.log(`已加载最高分: ${this.state.highScore}`);
        }
    }

    saveBestScore() {
        if (this.state.score > this.state.highScore) {
            this.state.highScore = this.state.score;
            this.saveGameData('bestScore', this.state.highScore);
            console.log(`新最高分已保存: ${this.state.highScore}`);
            return true;
        }
        return false;
    }

    init() {
        this.grid = Array(this.GRID_SIZE).fill().map(() => Array(this.GRID_SIZE).fill(0));
        this.gameBoard.innerHTML = '';

        for (let i = 0; i < this.GRID_SIZE; i++) {
            for (let j = 0; j < this.GRID_SIZE; j++) {
                const cell = document.createElement('div');
                cell.classList.add('game2048-cell');
                cell.dataset.row = i;
                cell.dataset.col = j;
                this.gameBoard.appendChild(cell);
            }
        }

        this.state.score = 0;
        this.state.level = 1;
        this.gameOver = false;
        this.gameWon = false;
        this.canContinue = false;
        this.moveHistory = [];
        this.updateScoreDisplay();
        this.updateLevelDisplay();
        this.addRandomNumber();
        this.addRandomNumber();
        this.updateGridDisplay();
        this.setupEventListeners();
        console.log('2048游戏初始化完成');
    }

    setupEventListeners() {
        this.on(document, 'keydown', (e) => this.handleKeyDown(e));

        this.on(this.gameBoard, 'touchstart', (e) => {
            e.preventDefault();
            this.touchStartX = e.changedTouches[0].clientX;
            this.touchStartY = e.changedTouches[0].clientY;
        }, { passive: false });

        this.on(this.gameBoard, 'touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        this.on(this.gameBoard, 'touchend', (e) => {
            e.preventDefault();
            this.touchEndX = e.changedTouches[0].clientX;
            this.touchEndY = e.changedTouches[0].clientY;
            this.handleSwipe();
            this.touchStartX = 0;
            this.touchStartY = 0;
        }, { passive: false });

        this.on(document, 'touchmove', (e) => {
            if (this.gameBoard.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });

        this.on(this.startBtn, 'click', () => this.init());
        this.on(this.undoBtn, 'click', () => this.undoMove());
        this.on(this.restartBtn, 'click', () => { this.gameOverOverlay.style.display = 'none'; this.init(); });
        this.on(this.continueBtn, 'click', () => { this.gameWinOverlay.style.display = 'none'; this.canContinue = true; });
        this.on(this.newGameBtn, 'click', () => { this.gameWinOverlay.style.display = 'none'; this.init(); });
    }

    handleKeyDown(e) {
        switch (e.key) {
            case 'ArrowUp': e.preventDefault(); this.move('up'); break;
            case 'ArrowDown': e.preventDefault(); this.move('down'); break;
            case 'ArrowLeft': e.preventDefault(); this.move('left'); break;
            case 'ArrowRight': e.preventDefault(); this.move('right'); break;
            case 'z': case 'Z': e.preventDefault(); this.undoMove(); break;
            case 'r': case 'R': e.preventDefault(); this.init(); break;
        }
    }

    handleSwipe() {
        const xDiff = this.touchEndX - this.touchStartX;
        const yDiff = this.touchEndY - this.touchStartY;
        const minSwipeDistance = 30;
        if (this.touchStartX === 0 && this.touchStartY === 0) return;
        if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > minSwipeDistance) {
            this.move(xDiff > 0 ? 'right' : 'left');
        } else if (Math.abs(yDiff) > minSwipeDistance) {
            this.move(yDiff > 0 ? 'down' : 'up');
        }
    }

    updateScoreDisplay() {
        this.scoreElement.textContent = this.state.score;
        this.bestScoreElement.textContent = this.state.highScore;
    }

    updateLevelDisplay() {
        this.levelElement.textContent = this.state.level;
    }

    addRandomNumber() {
        const emptyCells = [];
        for (let i = 0; i < this.GRID_SIZE; i++)
            for (let j = 0; j < this.GRID_SIZE; j++)
                if (this.grid[i][j] === 0) emptyCells.push({ i, j });

        if (emptyCells.length === 0) return;
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const increment = this.settings?.tile4ProbabilityIncrement || 0.05;
        const maxProb = this.settings?.maxTile4Probability || 0.4;
        const levelAdjustedProbability = Math.min(this.tile4Probability + (this.state.level - 1) * increment, maxProb);
        this.grid[randomCell.i][randomCell.j] = Math.random() < levelAdjustedProbability ? 4 : 2;

        const cellElement = document.querySelector(`.game2048-cell[data-row="${randomCell.i}"][data-col="${randomCell.j}"]`);
        if (cellElement && this.showAnimations) {
            cellElement.classList.add('new-tile');
            this.setTimeout(() => cellElement.classList.remove('new-tile'), this.animationSpeed);
        }
    }

    updateGridDisplay() {
        for (let i = 0; i < this.GRID_SIZE; i++) {
            for (let j = 0; j < this.GRID_SIZE; j++) {
                const value = this.grid[i][j];
                const cellElement = document.querySelector(`.game2048-cell[data-row="${i}"][data-col="${j}"]`);
                cellElement.className = 'game2048-cell';
                if (value > 0) {
                    cellElement.classList.add(`game2048-cell-${value}`);
                    cellElement.textContent = value;
                    if (value > 2048) cellElement.classList.add('game2048-cell-super');
                } else {
                    cellElement.textContent = '';
                }
            }
        }
    }

    saveState() {
        const gridCopy = this.grid.map(row => [...row]);
        this.moveHistory.push({ grid: gridCopy, score: this.state.score });
        if (this.moveHistory.length > 20) this.moveHistory.shift();
    }

    undoMove() {
        if (this.moveHistory.length === 0) return;
        const lastState = this.moveHistory.pop();
        this.grid = lastState.grid;
        this.state.score = lastState.score;
        this.updateScoreDisplay();
        this.updateGridDisplay();
        if (this.gameOver) { this.gameOver = false; this.gameOverOverlay.style.display = 'none'; }
    }

    checkGameOver() {
        for (let i = 0; i < this.GRID_SIZE; i++)
            for (let j = 0; j < this.GRID_SIZE; j++)
                if (this.grid[i][j] === 0) return false;
        for (let i = 0; i < this.GRID_SIZE; i++)
            for (let j = 0; j < this.GRID_SIZE - 1; j++)
                if (this.grid[i][j] === this.grid[i][j + 1]) return false;
        for (let i = 0; i < this.GRID_SIZE - 1; i++)
            for (let j = 0; j < this.GRID_SIZE; j++)
                if (this.grid[i][j] === this.grid[i + 1][j]) return false;
        return true;
    }

    checkWin() {
        if (this.gameWon && this.canContinue) return false;
        for (let i = 0; i < this.GRID_SIZE; i++)
            for (let j = 0; j < this.GRID_SIZE; j++)
                if (this.grid[i][j] === 2048) return true;
        return false;
    }

    move(direction) {
        if (this.gameOver || (this.gameWon && !this.canContinue)) return false;
        this.saveState();
        let moved = false;
        switch (direction) {
            case 'up': moved = this.moveUp(); break;
            case 'down': moved = this.moveDown(); break;
            case 'left': moved = this.moveLeft(); break;
            case 'right': moved = this.moveRight(); break;
        }
        if (moved) {
            this.addRandomNumber();
            if (this.autoUpdateLevel()) this.updateLevelDisplay();
            this.updateScoreDisplay();
            this.updateGridDisplay();
            if (this.checkWin()) { this.showGameWin(); return true; }
            if (this.checkGameOver()) this.showGameOver();
            if (this.saveBestScore()) this.bestScoreElement.textContent = this.state.highScore;
            return true;
        }
        this.moveHistory.pop();
        return false;
    }

    moveUp() {
        let moved = false;
        for (let j = 0; j < this.GRID_SIZE; j++) {
            for (let i = 0; i < this.GRID_SIZE; i++) {
                if (this.grid[i][j] !== 0) {
                    let k = i + 1;
                    while (k < this.GRID_SIZE) {
                        if (this.grid[k][j] !== 0) {
                            if (this.grid[i][j] === this.grid[k][j]) {
                                this.grid[i][j] *= 2; this.grid[k][j] = 0;
                                const bonusMultiplier = this.levelConfig[this.state.level].bonusMultiplier;
                                this.state.score += Math.floor(this.grid[i][j] * bonusMultiplier);
                                moved = true;
                                const cellElement = document.querySelector(`.game2048-cell[data-row="${i}"][data-col="${j}"]`);
                                if (cellElement) { cellElement.classList.add('merged'); this.setTimeout(() => cellElement.classList.remove('merged'), 300); }
                            }
                            break;
                        }
                        k++;
                    }
                }
            }
            for (let i = 0; i < this.GRID_SIZE; i++) {
                if (this.grid[i][j] === 0) {
                    for (let k = i + 1; k < this.GRID_SIZE; k++) {
                        if (this.grid[k][j] !== 0) { this.grid[i][j] = this.grid[k][j]; this.grid[k][j] = 0; moved = true; break; }
                    }
                }
            }
        }
        return moved;
    }

    moveDown() {
        let moved = false;
        for (let j = 0; j < this.GRID_SIZE; j++) {
            for (let i = this.GRID_SIZE - 1; i >= 0; i--) {
                if (this.grid[i][j] !== 0) {
                    let k = i - 1;
                    while (k >= 0) {
                        if (this.grid[k][j] !== 0) {
                            if (this.grid[i][j] === this.grid[k][j]) {
                                this.grid[i][j] *= 2; this.grid[k][j] = 0;
                                const bonusMultiplier = this.levelConfig[this.state.level].bonusMultiplier;
                                this.state.score += Math.floor(this.grid[i][j] * bonusMultiplier);
                                moved = true;
                                const cellElement = document.querySelector(`.game2048-cell[data-row="${i}"][data-col="${j}"]`);
                                if (cellElement) { cellElement.classList.add('merged'); this.setTimeout(() => cellElement.classList.remove('merged'), 300); }
                            }
                            break;
                        }
                        k--;
                    }
                }
            }
            for (let i = this.GRID_SIZE - 1; i >= 0; i--) {
                if (this.grid[i][j] === 0) {
                    for (let k = i - 1; k >= 0; k--) {
                        if (this.grid[k][j] !== 0) { this.grid[i][j] = this.grid[k][j]; this.grid[k][j] = 0; moved = true; break; }
                    }
                }
            }
        }
        return moved;
    }

    moveLeft() {
        let moved = false;
        for (let i = 0; i < this.GRID_SIZE; i++) {
            for (let j = 0; j < this.GRID_SIZE; j++) {
                if (this.grid[i][j] !== 0) {
                    let k = j + 1;
                    while (k < this.GRID_SIZE) {
                        if (this.grid[i][k] !== 0) {
                            if (this.grid[i][j] === this.grid[i][k]) {
                                this.grid[i][j] *= 2; this.grid[i][k] = 0;
                                const bonusMultiplier = this.levelConfig[this.state.level].bonusMultiplier;
                                this.state.score += Math.floor(this.grid[i][j] * bonusMultiplier);
                                moved = true;
                                const cellElement = document.querySelector(`.game2048-cell[data-row="${i}"][data-col="${j}"]`);
                                if (cellElement) { cellElement.classList.add('merged'); this.setTimeout(() => cellElement.classList.remove('merged'), 300); }
                            }
                            break;
                        }
                        k++;
                    }
                }
            }
            for (let j = 0; j < this.GRID_SIZE; j++) {
                if (this.grid[i][j] === 0) {
                    for (let k = j + 1; k < this.GRID_SIZE; k++) {
                        if (this.grid[i][k] !== 0) { this.grid[i][j] = this.grid[i][k]; this.grid[i][k] = 0; moved = true; break; }
                    }
                }
            }
        }
        return moved;
    }

    moveRight() {
        let moved = false;
        for (let i = 0; i < this.GRID_SIZE; i++) {
            for (let j = this.GRID_SIZE - 1; j >= 0; j--) {
                if (this.grid[i][j] !== 0) {
                    let k = j - 1;
                    while (k >= 0) {
                        if (this.grid[i][k] !== 0) {
                            if (this.grid[i][j] === this.grid[i][k]) {
                                this.grid[i][j] *= 2; this.grid[i][k] = 0;
                                const bonusMultiplier = this.levelConfig[this.state.level].bonusMultiplier;
                                this.state.score += Math.floor(this.grid[i][j] * bonusMultiplier);
                                moved = true;
                                const cellElement = document.querySelector(`.game2048-cell[data-row="${i}"][data-col="${j}"]`);
                                if (cellElement) { cellElement.classList.add('merged'); this.setTimeout(() => cellElement.classList.remove('merged'), 300); }
                            }
                            break;
                        }
                        k--;
                    }
                }
            }
            for (let j = this.GRID_SIZE - 1; j >= 0; j--) {
                if (this.grid[i][j] === 0) {
                    for (let k = j - 1; k >= 0; k--) {
                        if (this.grid[i][k] !== 0) { this.grid[i][j] = this.grid[i][k]; this.grid[i][k] = 0; moved = true; break; }
                    }
                }
            }
        }
        return moved;
    }

    showGameOver() {
        this.gameOver = true;
        this.finalScoreElement.textContent = this.state.score;
        this.gameOverOverlay.style.display = 'flex';
        const levelInfo = document.createElement('div');
        levelInfo.className = 'level-info';
        levelInfo.textContent = `达到等级: ${this.state.level}`;
        levelInfo.style.fontSize = '20px';
        levelInfo.style.marginTop = '10px';
        const existingLevelInfo = this.gameOverOverlay.querySelector('.level-info');
        if (existingLevelInfo) existingLevelInfo.textContent = `达到等级: ${this.state.level}`;
        else this.gameOverOverlay.appendChild(levelInfo);
    }

    showGameWin() {
        this.gameWon = true;
        this.winScoreElement.textContent = this.state.score;
        this.gameWinOverlay.style.display = 'flex';
        const levelInfo = document.createElement('div');
        levelInfo.className = 'level-info';
        levelInfo.textContent = `当前等级: ${this.state.level}`;
        levelInfo.style.fontSize = '20px';
        levelInfo.style.marginTop = '10px';
        const existingLevelInfo = this.gameWinOverlay.querySelector('.level-info');
        if (existingLevelInfo) existingLevelInfo.textContent = `当前等级: ${this.state.level}`;
        else this.gameWinOverlay.appendChild(levelInfo);
        this.notify.success('恭喜达到2048！', 3000);
    }
}

bootstrapCore();

document.addEventListener('DOMContentLoaded', () => {
    new Game2048();
    console.log('2048游戏已初始化');
});
