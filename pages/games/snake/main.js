/**
 * 贪吃蛇游戏 - 基于GameBase架构
 */
import '@styles/index.css';
import '../game-animations.css';
import '../responsive.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { GameBase, TouchGestureHandler } from '../_base/index.js';

class SnakeGame extends GameBase {
    constructor() {
        super('snake', { enableAutoCleanup: true, enableNotifications: true });

        this.config = {
            gridSize: 20,
            initialSpeed: this.settings.initialSpeed || 150,
            minSpeed: this.settings.minSpeed || 50,
            speedDecreasePerPoint: this.settings.speedDecreasePerPoint || 2,
            wallCollision: this.settings.wallCollision !== undefined ? this.settings.wallCollision : true,
            specialFoodChance: this.settings.specialFoodChance || 0.1,
            specialFoodMultiplier: this.settings.specialFoodScoreMultiplier || 3
        };

        this.levelConfig = this.generateLevelConfig();
        this.setupLevelSystem(this.levelConfig, {
            onLevelUp: (oldLevel, newLevel) => {
                this.notify.levelUp(newLevel, 2000);
                if (this.state.isRunning && this.gameLoopInterval) {
                    this.resourceManager.clearInterval(this.gameLoopInterval);
                    const newSpeed = this.levelConfig[newLevel].speed;
                    this.gameLoopInterval = this.setInterval(() => {
                        if (!this.state.isPaused) this.gameLoop();
                    }, newSpeed);
                }
            }
        });

        this.snake = [];
        this.food = {};
        this.direction = 'right';
        this.nextDirection = 'right';
        this.gameLoopInterval = null;
        this.isGameStarted = false;
        this.colors = this.loadColorConfig();

        this.canvas = document.getElementById('game');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.scoreElement = document.getElementById('score');
        this.startBtn = document.getElementById('start-btn');
        this.resetBtn = document.getElementById('reset-btn');

        this.createLevelDisplay();
        this.init();
    }

    createLevelDisplay() {
        const levelDisplay = document.createElement('div');
        levelDisplay.className = 'level-display';
        levelDisplay.innerHTML = '<span>等级: </span><span id="level">1</span>';
        const scoreContainer = document.querySelector('.score-container');
        if (scoreContainer) scoreContainer.appendChild(levelDisplay);
        this.levelElement = document.getElementById('level');
    }

    generateLevelConfig() {
        const config = {};
        const baseSpeed = this.config.initialSpeed;
        const minSpeed = this.config.minSpeed;
        for (let level = 1; level <= 10; level++) {
            const scoreThreshold = [0, 50, 100, 200, 350, 500, 700, 1000, 1500, 2000][level - 1];
            const levelRatio = (11 - level) / 10;
            const speed = Math.max(Math.round(baseSpeed * levelRatio), minSpeed);
            config[level] = { scoreThreshold, speed };
        }
        return config;
    }

    loadColorConfig() {
        const defaultColors = { background: '#eee', snake: '#4CAF50', snakeHead: '#2E7D32', food: '#FF5722', border: '#ddd' };
        const colorSetting = this.settings.snakeColor;
        if (colorSetting) {
            switch (colorSetting) {
                case 'blue': defaultColors.snake = '#2196F3'; defaultColors.snakeHead = '#0D47A1'; break;
                case 'red': defaultColors.snake = '#F44336'; defaultColors.snakeHead = '#B71C1C'; break;
                case 'yellow': defaultColors.snake = '#FFC107'; defaultColors.snakeHead = '#FF8F00'; break;
                case 'rainbow': defaultColors.snake = 'rainbow'; defaultColors.snakeHead = '#FF5722'; break;
            }
        }
        return defaultColors;
    }

    init() {
        if (!this.canvas || !this.ctx) { console.error('Canvas元素未找到'); return; }
        this.setupControls();
        this.resizeCanvas();
        this.on(window, 'resize', () => this.resizeCanvas());
        this.resetGame();
    }

    setupControls() {
        this.on(document, 'keydown', (e) => this.handleKeyDown(e));

        if (this.deviceInfo.hasTouch) {
            const touchHandler = new TouchGestureHandler(this.canvas, { minSwipeDistance: 20 });
            touchHandler.enableSwipe((gesture) => { this.changeDirection(gesture.direction); });
        }

        if (this.startBtn) {
            this.on(this.startBtn, 'click', () => this.handleStartButton());
            if (this.deviceInfo.hasTouch) {
                this.on(this.startBtn, 'touchstart', () => this.startBtn.classList.add('touch-active'), { passive: true });
                this.on(this.startBtn, 'touchend', () => this.startBtn.classList.remove('touch-active'), { passive: true });
            }
        }
        if (this.resetBtn) {
            this.on(this.resetBtn, 'click', () => this.resetGame());
            if (this.deviceInfo.hasTouch) {
                this.on(this.resetBtn, 'touchstart', () => this.resetBtn.classList.add('touch-active'), { passive: true });
                this.on(this.resetBtn, 'touchend', () => this.resetBtn.classList.remove('touch-active'), { passive: true });
            }
        }
    }

    handleKeyDown(e) {
        const directionMap = { 'ArrowUp': 'up', 'w': 'up', 'W': 'up', 'ArrowDown': 'down', 's': 'down', 'S': 'down', 'ArrowLeft': 'left', 'a': 'left', 'A': 'left', 'ArrowRight': 'right', 'd': 'right', 'D': 'right' };
        const newDirection = directionMap[e.key];
        if (newDirection) { e.preventDefault(); this.changeDirection(newDirection); }
        if (e.key === ' ') { e.preventDefault(); if (this.isGameStarted) this.toggleGame(); }
    }

    changeDirection(newDirection) {
        const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
        if (opposites[newDirection] !== this.direction) this.nextDirection = newDirection;
    }

    handleStartButton() {
        if (this.startBtn.textContent === '开始新游戏') this.resetGame();
        this.toggleGame();
    }

    toggleGame() {
        if (this.state.isPaused) this.startGame();
        else if (this.state.isRunning) this.pauseGame();
        else this.startGame();
    }

    startGame() {
        if (this.state.isRunning && this.state.isPaused) {
            super.resume();
            if (this.startBtn) this.startBtn.textContent = '暂停游戏';
            const speed = this.levelConfig[this.state.level].speed;
            this.gameLoopInterval = this.setInterval(() => { if (!this.state.isPaused) this.gameLoop(); }, speed);
            return;
        }
        if (this.state.isRunning) return;
        super.start();
        this.isGameStarted = true;
        if (this.startBtn) this.startBtn.textContent = '暂停游戏';
        const speed = this.levelConfig[this.state.level].speed;
        this.gameLoopInterval = this.setInterval(() => { if (!this.state.isPaused) this.gameLoop(); }, speed);
    }

    pauseGame() {
        super.pause();
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        if (this.startBtn) this.startBtn.textContent = '继续游戏';
    }

    resetGame() {
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        super.reset();
        this.isGameStarted = false;
        this.direction = 'right';
        this.nextDirection = 'right';
        this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
        this.generateFood();
        this.updateUI();
        this.draw();
        if (this.startBtn) this.startBtn.textContent = '开始游戏';
    }

    gameLoop() {
        this.direction = this.nextDirection;
        this.moveSnake();
        this.checkCollisions();
        this.draw();
    }

    moveSnake() {
        const head = { ...this.snake[0] };
        switch (this.direction) {
            case 'up': head.y--; break;
            case 'down': head.y++; break;
            case 'left': head.x--; break;
            case 'right': head.x++; break;
        }
        const maxX = Math.floor(this.canvas.width / this.config.gridSize);
        const maxY = Math.floor(this.canvas.height / this.config.gridSize);
        if (this.config.wallCollision) {
            if (head.x < 0 || head.y < 0 || head.x >= maxX || head.y >= maxY) { this.endGame(); return; }
        } else {
            if (head.x < 0) head.x = maxX - 1;
            if (head.y < 0) head.y = maxY - 1;
            if (head.x >= maxX) head.x = 0;
            if (head.y >= maxY) head.y = 0;
        }
        this.snake.unshift(head);
        if (head.x === this.food.x && head.y === this.food.y) this.eatFood();
        else this.snake.pop();
    }

    checkCollisions() {
        const head = this.snake[0];
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) { this.endGame(); return; }
        }
    }

    eatFood() {
        const points = this.food.value || 10;
        this.updateScore(points);
        this.autoUpdateLevel();
        this.generateFood();
        this.updateUI();
    }

    generateFood() {
        const maxX = Math.floor(this.canvas.width / this.config.gridSize) - 1;
        const maxY = Math.floor(this.canvas.height / this.config.gridSize) - 1;
        let newFood, onSnake;
        do {
            onSnake = false;
            newFood = { x: Math.floor(Math.random() * maxX) + 1, y: Math.floor(Math.random() * maxY) + 1 };
            for (let segment of this.snake) { if (segment.x === newFood.x && segment.y === newFood.y) { onSnake = true; break; } }
        } while (onSnake);
        const baseValue = Math.min(this.state.level, 5) * 10;
        const isSpecial = Math.random() < this.config.specialFoodChance;
        if (isSpecial) {
            newFood.color = '#FFEB3B'; newFood.value = Math.floor(baseValue * this.config.specialFoodMultiplier); newFood.isSpecial = true;
        } else {
            const foodColors = ['#FF5722', '#FF9800', '#4CAF50', '#2196F3', '#9C27B0'];
            newFood.color = foodColors[Math.min(this.state.level - 1, 4)]; newFood.value = baseValue; newFood.isSpecial = false;
        }
        this.food = newFood;
    }

    draw() {
        if (!this.ctx) return;
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.snake.forEach((segment, index) => {
            if (this.colors.snake === 'rainbow' && index !== 0) {
                const hue = (index * 30) % 360;
                this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else {
                this.ctx.fillStyle = index === 0 ? this.colors.snakeHead : this.colors.snake;
            }
            this.ctx.fillRect(segment.x * this.config.gridSize, segment.y * this.config.gridSize, this.config.gridSize, this.config.gridSize);
            this.ctx.strokeStyle = this.colors.background;
            this.ctx.strokeRect(segment.x * this.config.gridSize, segment.y * this.config.gridSize, this.config.gridSize, this.config.gridSize);
        });
        this.ctx.fillStyle = this.food.color || this.colors.food;
        this.ctx.fillRect(this.food.x * this.config.gridSize, this.food.y * this.config.gridSize, this.config.gridSize, this.config.gridSize);
        this.ctx.strokeStyle = this.colors.background;
        this.ctx.strokeRect(this.food.x * this.config.gridSize, this.food.y * this.config.gridSize, this.config.gridSize, this.config.gridSize);
        if (this.food.isSpecial) {
            const time = Date.now() % 1000 / 1000;
            const glowSize = 2 + Math.sin(time * Math.PI * 2) * 2;
            this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)'; this.ctx.lineWidth = 2;
            this.ctx.strokeRect(this.food.x * this.config.gridSize - glowSize, this.food.y * this.config.gridSize - glowSize, this.config.gridSize + glowSize * 2, this.config.gridSize + glowSize * 2);
            this.ctx.lineWidth = 1;
        }
        if (this.food.value > 10) {
            this.ctx.font = '10px Arial'; this.ctx.fillStyle = 'white'; this.ctx.textAlign = 'center';
            this.ctx.fillText(this.food.value, this.food.x * this.config.gridSize + this.config.gridSize / 2, this.food.y * this.config.gridSize + this.config.gridSize / 2 + 3);
        }
    }

    updateUI() {
        if (this.scoreElement) this.scoreElement.textContent = this.state.score;
        if (this.levelElement) this.levelElement.textContent = this.state.level;
    }

    endGame() {
        if (this.gameLoopInterval) { this.resourceManager.clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        super.gameOver();
        if (this.startBtn) this.startBtn.textContent = '开始新游戏';
        this.drawGameOver();
    }

    drawGameOver() {
        if (!this.ctx) return;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.font = '30px Microsoft YaHei'; this.ctx.fillStyle = 'white'; this.ctx.textAlign = 'center';
        this.ctx.fillText('游戏结束!', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '20px Microsoft YaHei';
        this.ctx.fillText(`最终得分: ${this.state.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText(`达到等级: ${this.state.level}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
        if (this.state.score === this.state.highScore && this.state.score > 0) {
            this.ctx.fillText('新纪录!', this.canvas.width / 2, this.canvas.height / 2 + 60);
        }
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const size = Math.min(containerWidth, 400);
        this.canvas.width = size;
        this.canvas.height = size;
        this.draw();
    }
}

bootstrapCore();

document.addEventListener('DOMContentLoaded', () => {
    new SnakeGame();
    console.log('贪吃蛇游戏已初始化');
});
