import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function git(cmd, fallback) {
  try {
    return execSync(`git ${cmd}`, { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const APP_VERSION = process.env.npm_package_version || '0.1.0';
const APP_COMMIT = git('rev-parse --short HEAD', 'unknown');
const APP_BUILD_TIME = new Date().toISOString();
const ENABLE_SOURCEMAP = process.env.BUILD_SOURCEMAP === '1';
const BASE_PATH = process.env.BASE_PATH || './';
const PUBLIC_BASE_PATH = BASE_PATH === './' ? './' : (BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`);

function publicPath(path, htmlFilename = null) {
  const cleanPath = path.replace(/^\//, '');
  if (PUBLIC_BASE_PATH !== './') return `${PUBLIC_BASE_PATH}${cleanPath}`;

  if (!htmlFilename) return `./${cleanPath}`;
  const htmlDir = dirname(relative(rootDir, htmlFilename).replace(/\\/g, '/'));
  const relativePrefix = htmlDir === '.'
    ? '.'
    : relative(htmlDir, '.').replace(/\\/g, '/') || '.';
  return `${relativePrefix}/${cleanPath}`;
}

function collectHtmlEntries(baseDir) {
  const entries = {};
  if (!existsSync(baseDir)) return entries;

  const stack = [baseDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === '_smoke') {
        continue;
      }
      const full = resolve(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (name.endsWith('.html')) {
        const rel = relative(rootDir, full).replace(/\\/g, '/');
        const key = rel === 'index.html'
          ? 'index'
          : rel.replace(/\.html$/, '').replace(/\//g, '_');
        entries[key] = full;
      }
    }
  }
  return entries;
}

export default defineConfig({
  root: rootDir,
  base: PUBLIC_BASE_PATH,
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
    __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME),
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
      '@pages': fileURLToPath(new URL('./pages', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: ENABLE_SOURCEMAP,
    rollupOptions: {
      input: {
        ...collectHtmlEntries(resolve(rootDir, '.')),
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    strictPort: true,
    host: '0.0.0.0',
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  },
  plugins: [
    {
      name: 'inject-noflash',
      transformIndexHtml(html, ctx) {
        // 移除 @vite/client,Vanilla MPA 无需 HMR
        html = html.replace(/<script[^>]*@vite\/client[^>]*><\/script>/g, '');
        // 在 CSS/JS 加载前同步读取主题,阻止页面闪白
        const noflash = `<link rel="icon" href="${publicPath('favicon.svg', ctx?.filename)}" type="image/svg+xml">
<style>html{background:#2c3e50}.page-loading body{opacity:0}body{background:#2c3e50;color:#ecf0f1;margin:0;min-height:100vh}.light-theme,html.light-theme{background:#f5f7fa}.light-theme body{background:#f5f7fa;color:#333}</style>
<script>(function(){var d=document.documentElement;d.classList.add("page-loading");try{var s=JSON.parse(localStorage.getItem("app:settings"));var t=s&&s.ui&&s.ui.theme||"dark";if(t=="system")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t=="light")d.classList.add("light-theme")}catch(e){}setTimeout(function(){d.classList.remove("page-loading")},3000)})()</script>`;
        html = html.replace(/<head>/, '<head>\n' + noflash);
        html = html.replace(/<body>/, '<body>\n<div class="bg-effects"></div>');
        return html;
      },
    },
  ],
});
