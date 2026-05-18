import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';

const pages = [
  { name: '首页', path: '/' },
  { name: '设置', path: '/pages/settings/' },
  { name: 'AI聊天', path: '/pages/aitools/aichat/' },
  { name: '论坛', path: '/pages/forum/' },
  { name: '音乐', path: '/pages/music/' },
  { name: '听音识阶', path: '/pages/music/sound-to-scale/' },
];

async function verify() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  
  try {
    for (const { name, path } of pages) {
      console.log(`\n=== ${name}: ${path} ===`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(BASE + path, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 2000));
      
      const info = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        const cardBg = styles.getPropertyValue('--card-bg').trim();
        const containerBg = styles.getPropertyValue('--container-bg').trim();
        
        // 检查常用元素
        const check = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const s = getComputedStyle(el);
          return { sel, bg: s.backgroundColor, color: s.color };
        };
        
        return {
          cardBg,
          containerBg,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          bodyBgImage: getComputedStyle(document.body).backgroundImage.substring(0, 60),
          hasLightTheme: document.documentElement.classList.contains('light-theme'),
          elements: [
            check('.game-card'),
            check('.module-section'),
            check('.container'),
            check('.settings-section'),
            check('.chat-container'),
            check('.forum-container'),
          ].filter(Boolean),
        };
      });
      
      console.log('  card-bg:', info.cardBg, '| body-bg:', info.bodyBg, '| hasLight:', info.hasLightTheme);
      console.log('  元素:', JSON.stringify(info.elements));
      
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

verify().catch(e => { console.error(e); process.exit(1); });
