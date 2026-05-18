const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));

  // 暂时禁用 pointer-events 来验证 bg-effects 是否渲染
  const vis1 = await page.evaluate(() => {
    const bg = document.querySelector('.bg-effects');
    bg.style.pointerEvents = 'auto';
    bg.style.backgroundColor = 'rgb(255, 0, 0)';
    bg.style.zIndex = '999';
    const el = document.elementFromPoint(400, 400);
    return {
      found: el ? el.tagName + '.' + (el.className || '') : 'NONE',
      isBgEffects: el === bg,
    };
  });
  console.log('VIS1 (red bg, z-index:999):', JSON.stringify(vis1));

  // 恢复
  await page.evaluate(() => {
    const bg = document.querySelector('.bg-effects');
    bg.style.pointerEvents = 'none';
    bg.style.backgroundColor = '';
    bg.style.zIndex = '';
  });

  // 核心测试：用 !important 强制覆盖 ::before 为纯绿色
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'test-override';
    style.textContent = '.bg-effects::before { background: rgb(0,255,0) !important; opacity: 1 !important; animation: none !important; }';
    document.head.appendChild(style);
  });
  await new Promise(r => setTimeout(r, 500));

  const vis2 = await page.evaluate(() => {
    const bg = document.querySelector('.bg-effects');
    const before = window.getComputedStyle(bg, '::before');
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    
    // 重点：采样页面中间区域的背景色
    // 如果 body 是透明的，body 区域的背景应该会受 ::before 影响
    const samples = {};
    const positions = [[100,100],[400,100],[640,400],[1000,400],[200,600]];
    positions.forEach(function(p) {
      const x = p[0], y = p[1];
      const el = document.elementFromPoint(x, y);
      samples[x+','+y] = {
        el: el ? el.tagName : 'NONE',
        bg: el ? window.getComputedStyle(el).backgroundColor : 'N/A',
      };
    });
    
    return {
      beforeBg: before.backgroundColor,
      beforeBgImage: before.backgroundImage ? 'present' : 'none',
      beforeOpacity: before.opacity,
      bodyBg: bodyBg,
      htmlBg: window.getComputedStyle(document.documentElement).backgroundColor,
      samples: samples,
    };
  });
  console.log('VIS2 (green ::before override):', JSON.stringify(vis2, null, 2));

  // 截图
  await page.screenshot({ path: '/tmp/green-before.png' });
  console.log('Green screenshot saved');

  // 清理
  await page.evaluate(() => {
    const s = document.getElementById('test-override');
    if (s) s.remove();
  });

  await browser.close();
  console.log('DONE');
})();
