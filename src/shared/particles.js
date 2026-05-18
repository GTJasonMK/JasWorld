/**
 * 交互式背景粒子系统
 *
 * 在 .bg-effects 容器内创建 Canvas 网点，
 * 鼠标靠近时网点被推开形成涟漪效果，鼠标离开后弹簧回弹。
 */

const DARK = { color: '255, 255, 255', opacity: 0.36 };
const LIGHT = { color: '44, 62, 80', opacity: 0.32 };

export class ParticleSystem {
    constructor(options = {}) {
        this.spacing = options.spacing || 28;
        this.radius = options.radius || 2;
        this.influence = options.influence || 80;
        this.repel = options.repel || 35;
        this.spring = options.spring || 0.06;

        this.particles = [];
        this.mouse = { x: -9999, y: -9999 };
        this.raf = null;
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 0;
        this.reduced = false;
        this.motionQuery = null;
        this._startTime = 0;

        this._onMouse = this._onMouse.bind(this);
        this._onResize = this._onResize.bind(this);
        this._loop = this._loop.bind(this);
        this._onMotionPref = this._onMotionPref.bind(this);
    }

    mount(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this._readTheme();
        this._onResize();
        this._createGrid();

        window.addEventListener('mousemove', this._onMouse, { passive: true });
        window.addEventListener('resize', this._onResize, { passive: true });

        this._checkMotion();
        this._loop();
    }

    destroy() {
        cancelAnimationFrame(this.raf);
        window.removeEventListener('mousemove', this._onMouse);
        window.removeEventListener('resize', this._onResize);
        this.motionQuery?.removeEventListener('change', this._onMotionPref);
        if (this.canvas) this.canvas.remove();
    }

    /** 从 html 类名读取当前主题颜色 */
    _readTheme() {
        const light = document.documentElement.classList.contains('light-theme');
        const c = light ? LIGHT : DARK;
        this.color = c.color;
        this.opacity = c.opacity;
        if (this.ctx && this.reduced) this._drawStatic();
    }

    _checkMotion() {
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.reduced = this.motionQuery.matches;
        this.motionQuery.addEventListener('change', this._onMotionPref);
    }

    _onMotionPref(e) {
        this.reduced = e.matches;
        if (this.reduced) {
            cancelAnimationFrame(this.raf);
            this.raf = null;
            this._drawStatic();
        } else if (!this.raf) {
            this._startTime = 0;
            this._loop();
        }
    }

    _onResize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 屏幕尺寸变化后重建网点
        if (this.particles.length > 0) this._createGrid();
        if (this.reduced) this._drawStatic();
    }

    _createGrid() {
        this.particles = [];
        const spacing = this.width <= 768 ? this.spacing + 6 : this.spacing;
        const cols = Math.ceil(this.width / spacing);
        const rows = Math.ceil(this.height / spacing);
        // 居中偏移，让网点不贴边
        const ox = (this.width - (cols - 1) * spacing) / 2;
        const oy = (this.height - (rows - 1) * spacing) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const bx = ox + c * spacing;
                const by = oy + r * spacing;
                const phase = (r * 0.73 + c * 0.41) % (Math.PI * 2);
                const amp = 1.5 + ((r + c) % 4) * 0.45;
                this.particles.push({ bx, by, x: bx, y: by, phase, amp });
            }
        }
    }

    _onMouse(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    _loop(ts) {
        if (this.reduced) {
            this._drawStatic();
            this.raf = null;
            return;
        }

        ts = ts || performance.now();
        if (!this._startTime) this._startTime = ts;
        // 已经过时间（秒）
        const elapsed = (ts - this._startTime) * 0.001;

        const { mouse, particles, influence, repel, spring, ctx, radius, color, opacity, reduced } = this;

        // 全局漂移叠加局部相位，让点阵呈现缓慢浮动而不是整体平移。
        const driftX = Math.sin(elapsed * 0.52 + 0.5) * 16;
        const driftY = Math.cos(elapsed * 0.63) * 14;

        ctx.clearRect(0, 0, this.width, this.height);

        for (const p of particles) {
            if (!reduced) {
                // 有效基底 = 原始网格位置 + 集体漂移
                const ebx = p.bx + driftX + Math.sin(elapsed * 0.78 + p.phase) * p.amp;
                const eby = p.by + driftY + Math.cos(elapsed * 0.66 + p.phase) * p.amp;

                // 计算与鼠标距离
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 排斥力：鼠标范围内的粒子被推开
                if (dist < influence && dist > 1) {
                    const force = (1 - dist / influence) * repel;
                    p.x += (dx / dist) * force;
                    p.y += (dy / dist) * force;
                }

                // 弹簧回弹到有效基底（原始位置 + 漂移）
                p.x += (ebx - p.x) * spring;
                p.y += (eby - p.y) * spring;
            }

            // 绘制
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color}, ${opacity})`;
            ctx.fill();
        }

        this.raf = requestAnimationFrame(this._loop);
    }

    _drawStatic() {
        const { particles, ctx, radius, color, opacity } = this;
        if (!ctx) return;
        ctx.clearRect(0, 0, this.width, this.height);
        for (const p of particles) {
            p.x = p.bx;
            p.y = p.by;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color}, ${opacity})`;
            ctx.fill();
        }
    }
}
