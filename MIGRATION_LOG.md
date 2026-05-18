# 迁移日志

## 阶段 0:脚手架 — 完成

- [x] 创建 `next/` 目录
- [x] 初始化 `package.json`(`"type": "module"`)
- [x] 安装依赖:vite@5 / marked@11 / dompurify@3 / highlight.js@11 / eslint@8 / prettier@3
- [x] `vite.config.js` 多入口骨架(自动收集 `**/*.html`,排除 `node_modules/dist/.`)
- [x] `.eslintrc.cjs`、`.prettierrc`、`.gitignore`
- [x] 临时 `index.html` 占位
- [x] `npm run build` 验证通过(118ms,4 modules,产物 1.17kB)
- [x] `npm run dev` 验证通过(http://localhost:5173 返回 HTTP 200)

注:本机 shell 设置了 `http_proxy=http://127.0.0.1:7897`,curl 测试本地 dev 服务器时需用 `curl --noproxy '*'` 绕过。

## 阶段 1:核心基础设施 — 完成

- [x] `src/core/storage.js`(新增):统一 13 个 key 常量、JSON/string 读写、首次启动一次性迁移 14 个旧键
- [x] `src/core/settings.js`:ES Module 版,`SettingsManager extends EventTarget`,`change` 事件 + storage event 跨标签页同步
- [x] `src/core/theme.js`:ES Module 版,与 settings 双向绑定,iframe 同步保留
- [x] `src/core/events.js`、`src/core/resources.js`:从 window 全局改为 ES Module 命名导出
- [x] `src/core/version.js`:通过 Vite `define` 注入 `__APP_VERSION__/__APP_COMMIT__/__APP_BUILD_TIME__`
- [x] `src/core/index.js`:聚合导出 + `bootstrapCore()` 一键初始化
- [x] `src/styles/{base,theme,breakpoints}.css` 从旧版直接拷贝,新增 `index.css` 聚合 `@import`
- [x] `src/main.js`:主页烟雾测试入口,接入 core 后输出版本、主题、设置、迁移状态
- [x] `vite.config.js` 加入版本 define、git commit 短哈希注入
- [x] `npm run build` 通过(11 modules,12.88KB CSS,12.08KB JS)
- [x] `npm run dev` 验证 `import '@styles/...'`、`import '@core/...'` 别名解析正常,HTTP 200

### key 迁移映射(已落地)

| 新键 | 旧键 |
|---|---|
| `app:settings` | `userSettings`, `appSettings` |
| `app:theme` | `theme` |
| `ai:config` | `aichat_config`, `chattavern_ai_config`, `ai_config` |
| `chattavern:characters` | `chattavern_characters` |
| `mdreader:current` | `mdreader_current` |
| `mdreader:fontSize` | `mdreader_font_size` |
| `forum:auth` | `forumAuthData` |
| `forum:repo` | `forum_repo_owner` + `forum_repo_name`(合并对象) |
| `forum:mode` | `forum_mode` |
| `music:highScore` | `melodyHighScore` |
| `music:synthIgnoreWarning` | `ignoreSynthWarning` |
| 已删除 | `musicAppConfig`, `useSynthAudio` |

## 阶段 2:共享层 — 完成

- [x] `src/shared/llm/client.js`:复用旧版 `LLMClient` 类,改造为纯 ES Module,删除 CommonJS 兼容代码,合并 `streamAndCollect` 与 `stream` 的重试/请求逻辑(从 559 行精简到 ~190 行,行为等价)
- [x] `src/shared/llm/config.js`:`aiConfigManager` 改用 `@core/storage` 读写 `ai:config`,不再双写旧键(迁移由 `runMigrations()` 一次性处理)
- [x] `src/shared/markdown/renderer.js`:`marked@11` + `dompurify@3` + `highlight.js@11` 的统一 `renderMarkdown(source, { sanitize })` 入口,**npm 依赖取代 CDN**
- [x] `src/shared/index.js`:聚合导出
- [x] `pages/_smoke/shared/`:烟雾测试入口,验证 LLM client 实例化、aiConfigManager.summary()、renderMarkdown 三件套都能正确 import 执行
- [x] `npm run build` 通过(216 modules);主页 bundle 仍只有 11.85KB,markdown 链路隔离到独立 chunk(1004KB,gzip 332KB),**仅 mdreader/aichat/blog 等实际使用页加载**

### 延后决策

- `shared/ui/notification`、`shared/ui/modal`:延后到阶段 6 拆 GameBase 时再决定是否提取到 shared;若仅游戏内复用,留在 `pages/games/_base/`
- `shared/utils`:按需建立,目前没有 ≥3 处复用点
- highlight.js 1MB 体积:阶段 4(mdreader)再决定用 `highlight.js/lib/common` 子集或动态 import 缩减

## 阶段 3:论坛模块 — 完成

- [x] 9 个 modules 文件复制到 `pages/forum/modules/`,4 个改造(config / auth / profile / blog)
- [x] `forum.css` 复制为 `pages/forum/style.css`(1944 行,保持视觉等价)
- [x] `forum.js` 复制改造为 `pages/forum/main.js`:顶部 `bootstrapCore()` + `@styles/index.css` + 本地 style.css
- [x] `pages/forum/index.html` 重写:移除旧版 `../config.js`/`../js/*.js` 三个旧脚本,改 ES Module `./main.js`
- [x] localStorage 迁移完成:`forum_mode` → `StorageKeys.forumMode`、`forum_repo_owner+name` → `StorageKeys.forumRepo`(对象)、`forumAuthData` → `StorageKeys.forumAuth`、`forum_profile_<user>` → `StorageKeys.forumProfile(user)`
- [x] **blog.js 密码改造**:删除明文 `DIARY_PASSWORD = '999gml'`,改为 sha256 哈希常量 `1715b700055d61088c46bc151f2ba08c7f569c808afc526bd85eb71c8d227259`,`verifyPassword` 改为 async + Web Crypto API
- [x] **blog.js Markdown 改造**:删除 `loadScript` CDN 加载,改用 `@shared/markdown/renderer` 的 `renderMarkdown`;`initMarkdown` 保留为 no-op 占位避免改动调用链
- [x] `blog/posts.json` 路径改为 `${import.meta.env.BASE_URL}blog/posts.json`,如未来需要博客模式只需把 `posts.json` 放到 `public/blog/`
- [x] `storage.js` 补丁:`StorageKeys.forumProfile(username)` 动态键 + `migrateForumProfiles()` 扫描 `forum_profile_*` 前缀键迁移
- [x] `npm run build` 通过(229 modules);forum bundle 38.68KB(gzip 11.56KB),CSS 26.47KB;markdown renderer 隔离到独立 chunk(1000KB,仅 forum/blog 加载)
- [x] `npm run dev` 验证 `/pages/forum/` 返回 HTTP 200,Vite 别名 import 解析正常

### 与旧版的差异(行为等价性)

- 旧版 blog 密码 `999gml` 仍可登录(sha256 比对通过)
- 旧版 `forum_profile_<user>` 键的数据在首次访问新版时自动迁移到 `forum:profile:<user>`,再清理旧键
- 旧版 `forum_repo_owner` + `forum_repo_name` 双键合并为 `forum:repo` JSON 对象
- 博客模式的 `posts.json` 必须放在 `public/blog/`,否则模式打开时显示加载失败(用户已确认 blog 目录本次不迁移,blog 模式属于待补)
- 不再依赖 jsdelivr CDN 加载 marked,改 npm 依赖(离线友好、版本锁定)

## 阶段 4:AI 工具集 — 完成

- [x] **aichat**:`chat.js`(709 行)拆分为 `main.js` / `chat-room.js` / `message-list.js` / `composer.js`,改用 `@shared/llm/client`
- [x] **chattavern**:`AIManager.js` 改用 `@shared/llm/client`,删除 ~150 行重复 LLM 请求代码
- [x] **mdreader**:`mdreader.js`(1504 行)拆分为 `main.js` / `reader.js` / `file-handler.js` / `toc.js` / `toolbar.js` / `project-manager.js`,引入 `@shared/markdown/renderer`
- [x] 三个 AI 工具的核心场景验证通过
- [x] `npm run build` 通过

## 阶段 5:语言学习模块 — 完成

- [x] `pages/language/_shared/` 创建共享层:`word-history.js` / `vocabulary-loader.js` / `word-selector.js` / `practice-manager.js` / `ai-assistant.js` / `ui-controller.js` / `pregenerated-loader.js`
- [x] `pages/language/english/main.js`:仅配置注入 + 入口装配(~150 行)
- [x] `pages/language/japanese/main.js`:同上结构
- [x] `pages/language/index.html` 语言选择页
- [x] `pages/language/english/index.html` 英语练习页
- [x] `pages/language/japanese/index.html` 日语练习页
- [x] 137MB 预生成数据已复制到 `public/data/`
- [x] 消除 `english.js`(1606 行)与 `japanese.js`(1561 行) ~90% 的重复代码
- [x] `npm run build` 通过

## 阶段 6:游戏模块 — 完成

- [x] `pages/games/_base/` 拆分 GameBase(883 行→4 文件):
  - `gesture.js`:TouchGestureHandler 类
  - `level.js`:LevelSystem 类
  - `notification.js`:NotificationSystem 类
  - `index.js`:GameBase 类 + 统一导出
- [x] **StorageHelper 消除**:所有游戏改用 `storage` API + `StorageKeys.gameHighScore(name)`
- [x] 5 个游戏主逻辑文件创建:`main.js`(2048/snake/tetris/memory/drawpi),全部继承新 GameBase
- [x] 5 个游戏 index.html 创建,全部使用 `<script type="module" src="./main.js">`
- [x] 6 个 CSS 文件复制到新目录
- [x] `npm run build` 通过(265→287 modules)

## 阶段 7:音乐 + 设置 + 主页 — 完成

- [x] `pages/settings/index.html`:移除内联 CSS 和旧脚本,全部 220+ 设置项完整保留
- [x] `pages/settings/style.css`:原 `settings.css` 内容移到独立文件,高对比度、选项卡、通知样式完整
- [x] `pages/settings/main.js`(~310 行):从 `window.settingsManager` + `localStorage` 改为 `@core/storage` + `StorageKeys.appSettings`,ES 模块版本
- [x] `pages/music/index.html`:独立音乐练习页面,四种训练模式(音阶/单音/多音/节奏)
- [x] `pages/music/style.css`:原 `music.css`(~19500 行)完整复制
- [x] `pages/music/music-core.js`(~1460 行):从 IIFE `window.musicFunctions` 改为 ES 模块,`loadUserSettings` 改用 `@core/storage`,音频路径改为 `/audio/piano/`
- [x] `public/audio/piano/`:17 个 MP3 钢琴音频文件复制
- [x] `public/images/`:5 个游戏 SVG 图标复制
- [x] `index.html` 主页重写:替换临时占位为完整导航主页,各模块卡片链接到新版路径
- [x] `src/main.js` 主页入口更新:输出简洁版本信息到控制台
- [x] `npm run build` 通过(294 modules,17 HTML 入口)

## 当前状态

全部 8 个阶段已完成。新版 `next/` 包含 17 个功能入口,所有旧版依赖问题已解决:

- **模块化**:全部 ES Module,路径别名 `@core/@shared/@styles` 消除 `../../` 相对路径
- **依赖治理**:marked/dompurify/highlight.js 通过 npm 管理,版本锁定
- **存储统一**:`@core/storage.js` 统一 13 个键名,旧键自动迁移
- **代码消重**:`english.js`/`japanese.js` 重复度从 ~90% 降至 ~0
- **构建产物**:`dist/` 纯静态文件,无服务器依赖

## 待后续决策

- 新版部署(GitHub Pages 切换)
- `blog/` 目录迁移(如有需求)
- `mdreader/project/` 子目录迁移(如有需求)
