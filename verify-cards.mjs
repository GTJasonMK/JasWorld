import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';

async function verify() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  
  try {
    // 暗色主题 - 首页
    console.log('=== 暗色主题 - 首页 ===');
    const page1 = await browser.newPage();
    await page1.setViewport({ width: 1280, height: 900 });
    await page1.goto(BASE, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    // 检查关键 CSS 变量
    const vars1 = await page1.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        cardBg: styles.getPropertyValue('--card-bg').trim(),
        containerBg: styles.getPropertyValue('--container-bg').trim(),
        bgColor: styles.getPropertyValue('--bg-color').trim(),
        surfaceSolid: styles.getPropertyValue('--surface-solid').trim(),
      };
    });
    console.log('CSS 变量:', JSON.stringify(vars1));
    
    // 检查游戏卡片背景
    const cardInfo = await page1.evaluate(() => {
      const cards = document.querySelectorAll('.game-card');
      const results = [];
      cards.forEach((card, i) => {
        const style = getComputedStyle(card);
        results.push({
          index: i,
          bg: style.backgroundColor,
          bgImage: style.backgroundImage.substring(0, 60),
          textColor: style.color,
        });
      });
      return results;
    });
    console.log('游戏卡片:', JSON.stringify(cardInfo, null, 2));
    
    // 检查 container 背景
    const containerInfo = await page1.evaluate(() => {
      const container = document.querySelector('.container');
      if (!container) return { found: false };
      const style = getComputedStyle(container);
      return {
        bg: style.backgroundColor,
        bgImage: style.backgroundImage.substring(0, 60),
        textColor: style.color,
      };
    });
    console.log('主容器:', JSON.stringify(containerInfo));
    
    // 检查 section 背景
    const sectionInfo = await page1.evaluate(() => {
      const sections = document.querySelectorAll('.section');
      const results = [];
      sections.forEach((s, i) => {
        const style = getComputedStyle(s);
        results.push({
          id: s.id,
          bg: style.backgroundColor,
        });
      });
      return results;
    });
    console.log('Sections:', JSON.stringify(sectionInfo, null, 2));
    
    await page1.screenshot({ path: '/tmp/cards-dark.png', fullPage: true });
    console.log('截图: /tmp/cards-dark.png');
    await page1.close();
    
    // 浅色主题
    console.log('\n=== 浅色主题 - 首页 ===');
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1280, height: 900 });
    await page2.goto(BASE, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    await page2.evaluate(() => {
      document.documentElement.classList.add('light-theme');
      document.body.classList.add('light-theme');
    });
    await new Promise(r => setTimeout(r, 1000));
    
    const vars2 = await page2.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        cardBg: styles.getPropertyValue('--card-bg').trim(),
        containerBg: styles.getPropertyValue('--container-bg').trim(),
        bgColor: styles.getPropertyValue('--bg-color').trim(),
        surfaceSolid: styles.getPropertyValue('--surface-solid').trim(),
      };
    });
    console.log('CSS 变量:', JSON.stringify(vars2));
    
    const cardInfo2 = await page2.evaluate(() => {
      const cards = document.querySelectorAll('.game-card');
      const results = [];
      cards.forEach((card, i) => {
        const style = getComputedStyle(card);
        results.push({
          index: i,
          bg: style.backgroundColor,
          bgImage: style.backgroundImage.substring(0, 60),
          textColor: style.color,
        });
      });
      return results;
    });
    console.log('游戏卡片:', JSON.stringify(cardInfo2, null, 2));
    
    await page2.screenshot({ path: '/tmp/cards-light.png', fullPage: true });
    console.log('截图: /tmp/cards-light.png');
    await page2.close();
    
  } finally {
    await browser.close();
  }
}

verify().catch(e => { console.error(e); process.exit(1); });
