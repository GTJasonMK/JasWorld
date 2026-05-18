/**
 * 主页入口 - 初始化核心基础设施
 */
import '@styles/index.css';
import { bootstrapCore, themeManager, settingsManager, VERSION, COMMIT } from '@core/index.js';

bootstrapCore();

// 输出版本信息到控制台
console.log(`%c光阴的游乐场 %cv${VERSION}@${COMMIT}`,
    'font-size: 16px; font-weight: bold; color: #4caf50;',
    'font-size: 12px; color: #888;');
console.log(`主题: ${themeManager.current()} | 字体: ${settingsManager.get('ui', 'fontSize', 16)}px`);

// ---------- 导航标签切换 ----------
const navLinks = document.querySelectorAll('nav a[href^="#"]');
const sections = document.querySelectorAll('.section');

function activateSection(hash) {
    const id = hash.replace('#', '');
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
    sections.forEach(s => s.classList.toggle('active', s.id === id));
}

navLinks.forEach(a => a.addEventListener('click', () => activateSection(a.getAttribute('href'))));
if (location.hash) activateSection(location.hash);
window.addEventListener('hashchange', () => activateSection(location.hash));
