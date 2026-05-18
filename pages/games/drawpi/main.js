/**
 * 画圆测π游戏 - 基于GameBase架构
 */
import '@styles/index.css';
import '../game-animations.css';
import '../responsive.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';
import { GameBase } from '../_base/index.js';

class DrawPiGame extends GameBase {
    constructor() {
        super('drawpi', { enableAutoCleanup: true, enableNotifications: true });

        this.ranks = [
            { minAccuracy: 0, name: '初学者', icon: '🔰', class: 'novice', description: '开始你的画圆之旅' },
            { minAccuracy: 70, name: '学徒', icon: '🌱', class: 'apprentice', description: '有了一些基础' },
            { minAccuracy: 80, name: '能手', icon: '🌟', class: 'skilled', description: '熟能生巧' },
            { minAccuracy: 85, name: '专家', icon: '✨', class: 'expert', description: '技巧精湛' },
            { minAccuracy: 90, name: '大师', icon: '🏆', class: 'master', description: '炉火纯青' },
            { minAccuracy: 95, name: '宗师', icon: '👑', class: 'grandmaster', description: '登峰造极' },
            { minAccuracy: 98, name: '传奇', icon: '💎', class: 'legend', description: '圆神' }
        ];

        this.points = [];
        this.isDrawing = false;
        this.pathClosed = false;
        this.hasCalculated = false;
        this.userBestRankIndex = this.getUserBestRank();

        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.piValueDisplay = document.getElementById('pi-value');
        this.accuracyDisplay = document.getElementById('accuracy');
        this.messageDisplay = document.getElementById('message');
        this.qualityMeterFill = document.getElementById('quality-meter-fill');
        this.qualityLabel = document.getElementById('quality-label');
        this.rankBadge = document.getElementById('rank-badge');
        this.rankIcon = this.rankBadge ? this.rankBadge.querySelector('.rank-icon') : null;
        this.rankTitle = this.rankBadge ? this.rankBadge.querySelector('.rank-title') : null;
        this.currentRank = document.getElementById('current-rank');
        this.bestRank = document.getElementById('best-rank');
        this.drawHint = document.querySelector('.draw-hint');

        this.drawColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#4caf50';

        this.init();
    }

    init() {
        if (!this.canvas || !this.ctx) { console.error('Canvas元素未找到'); return; }
        if (this.drawHint) this.setTimeout(() => { this.drawHint.classList.add('fade-out'); }, 5000);
        this.updateBestRankDisplay(this.userBestRankIndex);
        this.resizeCanvas(); this.initCanvas(); this.setupEventListeners();
        this.on(window, 'resize', () => this.resizeCanvas());
        this.updateMessage('开始画圆，尽量画得圆一些');
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const width = container.clientWidth; const height = container.clientHeight;
        this.canvas.width = width; this.canvas.height = height;
        this.clearCanvas();
    }

    initCanvas() { this.clearCanvas(); this.ctx.lineJoin = 'round'; this.ctx.lineCap = 'round'; this.ctx.lineWidth = 3; this.ctx.strokeStyle = this.drawColor; }

    clearCanvas() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.points = []; this.pathClosed = false; this.hasCalculated = false; this.updateStatus(); this.resetQualityMeter(); this.resetRankDisplay(); }

    resetQualityMeter() { if (this.qualityMeterFill) this.qualityMeterFill.style.width = "0%"; if (this.qualityLabel) { this.qualityLabel.textContent = "画一个圆看看你的水平"; this.qualityLabel.className = "quality-label"; } }

    resetRankDisplay() { if (this.rankBadge) this.rankBadge.className = "rank-badge"; if (this.rankIcon) this.rankIcon.textContent = "?"; if (this.rankTitle) this.rankTitle.textContent = "未评级"; if (this.currentRank) this.currentRank.textContent = "未评级"; }

    setupEventListeners() {
        if (!this.deviceInfo.hasTouch) {
            this.on(this.canvas, 'mousedown', (e) => this.startDrawing(e));
            this.on(this.canvas, 'mousemove', (e) => this.draw(e));
            this.on(this.canvas, 'mouseup', (e) => this.stopDrawing(e));
            this.on(this.canvas, 'mouseout', (e) => this.stopDrawing(e));
        } else {
            this.on(this.canvas, 'touchstart', (e) => { const rect = this.canvas.getBoundingClientRect(); const tx = e.touches[0].clientX - rect.left; const ty = e.touches[0].clientY - rect.top; if (tx >= 0 && tx <= this.canvas.width && ty >= 0 && ty <= this.canvas.height) this.startDrawing(e); }, { passive: false });
            this.on(this.canvas, 'touchmove', (e) => { const rect = this.canvas.getBoundingClientRect(); const tx = e.touches[0].clientX - rect.left; const ty = e.touches[0].clientY - rect.top; if (tx >= 0 && tx <= this.canvas.width && ty >= 0 && ty <= this.canvas.height) this.draw(e); }, { passive: false });
            this.on(this.canvas, 'touchend', (e) => { const rect = this.canvas.getBoundingClientRect(); const tx = e.changedTouches[0].clientX - rect.left; const ty = e.changedTouches[0].clientY - rect.top; if (tx >= 0 && tx <= this.canvas.width && ty >= 0 && ty <= this.canvas.height) this.stopDrawing(e); }, { passive: true });
        }
    }

    startDrawing(e) {
        if (e.type !== 'mousedown') e.preventDefault();
        if (this.points.length > 0 || this.pathClosed || this.hasCalculated) this.clearCanvas();
        this.isDrawing = true; this.points = [];
        const point = this.getEventPoint(e); this.points.push(point);
        this.ctx.beginPath(); this.ctx.arc(point.x, point.y, 2, 0, Math.PI * 2); this.ctx.fillStyle = this.drawColor; this.ctx.fill();
        this.ctx.beginPath(); this.ctx.moveTo(point.x, point.y);
        this.updateMessage('正在画圆...');
    }

    draw(e) { if (e.type !== 'mousemove') e.preventDefault(); if (!this.isDrawing) return; const point = this.getEventPoint(e); this.points.push(point); this.ctx.lineTo(point.x, point.y); this.ctx.stroke(); }

    stopDrawing(e) {
        if (e.type !== 'mouseup' && e.type !== 'mouseout') e.preventDefault();
        if (!this.isDrawing) return; this.isDrawing = false;
        if (this.points.length < 10) { this.updateMessage('路径太短，无法形成有效的圆形'); return; }
        if (this.hasIntersections(this.points)) { this.pathClosed = true; this.updateMessage('正在计算...'); this.setTimeout(() => this.calculatePi(), 300); }
        else { this.updateMessage('图形未闭合'); }
    }

    getEventPoint(e) { if (this.deviceInfo.hasTouch) { const touch = e.touches[0] || e.changedTouches[0]; const rect = this.canvas.getBoundingClientRect(); return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; } return { x: e.offsetX, y: e.offsetY }; }

    hasIntersections(points) {
        if (points.length < 4) return false;
        for (let i = 0; i < points.length - 2; i++) { const l1s = points[i]; const l1e = points[i + 1]; for (let j = i + 2; j < points.length - 1; j++) { if (i === 0 && j === points.length - 2) continue; if (this.doLinesIntersect(l1s, l1e, points[j], points[j + 1])) return true; } }
        return false;
    }

    doLinesIntersect(p1, p2, p3, p4) {
        const d = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
        const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
        const d1 = d(p3, p4, p1); const d2 = d(p3, p4, p2); const d3 = d(p1, p2, p3); const d4 = d(p1, p2, p4);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
        if (d1 === 0 && onSeg(p3, p1, p4)) return true; if (d2 === 0 && onSeg(p3, p2, p4)) return true;
        if (d3 === 0 && onSeg(p1, p3, p2)) return true; if (d4 === 0 && onSeg(p1, p4, p2)) return true;
        return false;
    }

    calculateDistance(p1, p2) { return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)); }

    calculatePerimeter() { if (this.points.length < 3) return 0; let p = 0; for (let i = 0; i < this.points.length - 1; i++) p += this.calculateDistance(this.points[i], this.points[i + 1]); if (this.pathClosed) p += this.calculateDistance(this.points[this.points.length - 1], this.points[0]); return p; }

    calculateArea() {
        if (this.points.length < 3) return 0; let a = 0; const n = this.pathClosed ? this.points.length : this.points.length - 1;
        for (let i = 0; i < n; i++) { const j = (i + 1) % this.points.length; a += this.points[i].x * this.points[j].y; a -= this.points[j].x * this.points[i].y; }
        return Math.abs(a / 2);
    }

    calculatePi() {
        if (!this.pathClosed) { this.updateMessage('请先画一个闭合图形', 'error'); return; }
        if (this.points.length < 10) { this.updateMessage('请先画一个近似圆形', 'error'); return; }
        this.hasCalculated = true;
        const perimeter = this.calculatePerimeter(); const area = this.calculateArea();
        const calculatedPi = Math.pow(perimeter, 2) / (4 * area);
        const actualPi = Math.PI;
        const difference = Math.abs((calculatedPi - actualPi) / actualPi) * 100;
        const accuracy = Math.max(0, 100 - difference).toFixed(2);
        if (this.piValueDisplay) this.piValueDisplay.textContent = calculatedPi.toFixed(6);
        if (this.accuracyDisplay) this.accuracyDisplay.textContent = `${accuracy}%`;
        this.updateQualityMeter(parseFloat(accuracy));
        const rankIndex = this.determineRank(parseFloat(accuracy));
        this.updateRankDisplay(rankIndex, parseFloat(accuracy));
        let message, type;
        if (accuracy > 98) { message = '太完美了！您画的圆几乎是完美的！'; type = 'success'; this.playSuccessSound(); }
        else if (accuracy > 95) { message = '非常好！您画的圆非常接近完美！'; type = 'success'; this.playSuccessSound(); }
        else if (accuracy > 90) { message = '很好！您的圆形相当圆！'; type = 'success'; this.playSuccessSound(); }
        else if (accuracy > 80) { message = '不错！可以再接再厉！'; type = ''; }
        else { message = '继续练习，尝试画得更圆些！点击重新开始'; type = ''; }
        this.updateMessage(message, type);
    }

    determineRank(accuracy) { let i = 0; for (let r = this.ranks.length - 1; r >= 0; r--) { if (accuracy >= this.ranks[r].minAccuracy) { i = r; break; } } return i; }

    updateRankDisplay(rankIndex, _accuracy) {
        const rank = this.ranks[rankIndex];
        if (this.rankBadge) { this.rankBadge.className = "rank-badge"; this.rankBadge.classList.add(rank.class); }
        if (this.rankIcon) this.rankIcon.textContent = rank.icon; if (this.rankTitle) this.rankTitle.textContent = rank.name; if (this.currentRank) this.currentRank.textContent = rank.name;
        const previousBest = this.userBestRankIndex;
        if (rankIndex > previousBest) {
            this.userBestRankIndex = rankIndex; this.saveUserBestRank(rankIndex); this.updateBestRankDisplay(rankIndex);
            if (this.rankBadge) { this.rankBadge.classList.add('level-up'); this.setTimeout(() => this.rankBadge.classList.remove('level-up'), 1000); }
            this.notify.success(`等级提升：${rank.name}！`, 2500);
            this.playRankUpSound();
        }
    }

    updateBestRankDisplay(rankIndex) { if (this.bestRank) { if (rankIndex >= 0 && rankIndex < this.ranks.length) this.bestRank.textContent = this.ranks[rankIndex].name; else this.bestRank.textContent = "未评级"; } }

    updateQualityMeter(accuracy) {
        if (this.qualityMeterFill) this.qualityMeterFill.style.width = (100 - accuracy) + "%";
        let labelText, labelClass;
        if (accuracy > 98) { labelText = "完美！你是画圆大师！"; labelClass = "perfect"; }
        else if (accuracy > 95) { labelText = "非常棒！接近完美的圆！"; labelClass = "excellent"; }
        else if (accuracy > 90) { labelText = "很好！这是个不错的圆！"; labelClass = "good"; }
        else if (accuracy > 80) { labelText = "还行，继续练习！"; labelClass = "average"; }
        else { labelText = "需要更多练习，再来一次！"; labelClass = "poor"; }
        if (this.qualityLabel) { this.qualityLabel.textContent = labelText; this.qualityLabel.className = "quality-label " + labelClass; }
    }

    saveUserBestRank(rankIndex) { this.saveGameData('bestRank', rankIndex); }
    getUserBestRank() { return this.loadGameData('bestRank', -1); }

    playRankUpSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = audioCtx.createOscillator(); const osc2 = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
            osc1.type = 'sine'; osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(440, audioCtx.currentTime); osc1.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.3);
            osc2.frequency.setValueAtTime(587.33, audioCtx.currentTime + 0.1); osc2.frequency.linearRampToValueAtTime(1174.66, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
            osc1.start(); osc2.start(audioCtx.currentTime + 0.05);
            osc1.stop(audioCtx.currentTime + 0.6); osc2.stop(audioCtx.currentTime + 0.6);
        } catch (e) { console.log('音频API不支持:', e); }
    }

    playSuccessSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
            gain.gain.setValueAtTime(0, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1);
            osc.start(); osc.stop(audioCtx.currentTime + 1);
        } catch (e) { console.log('音频API不支持:', e); }
    }

    updateStatus() { if (this.piValueDisplay) this.piValueDisplay.textContent = '-'; if (this.accuracyDisplay) this.accuracyDisplay.textContent = '-'; }

    updateMessage(msg, type = '') { if (this.messageDisplay) { this.messageDisplay.textContent = msg; this.messageDisplay.className = 'message'; if (type) this.messageDisplay.classList.add(type); } }
}

bootstrapCore();

document.addEventListener('DOMContentLoaded', () => {
    new DrawPiGame();
    console.log('画圆测π游戏已初始化');
});
