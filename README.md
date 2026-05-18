# jasonaa-next

多功能娱乐平台重构版,基于 Vite + Vanilla MPA(无前端框架)。

> 旧版位于仓库根目录其他位置(`games/`、`aitools/`、`forum/` 等),作为存档保留,不再维护。

## 目录约定

```
next/
├── index.html                # 主页入口(完整导航,17 个功能入口)
├── public/                   # 静态资源(images / audio / 预生成数据),原样发布
├── src/
│   ├── core/                 # 跨模块基础设施:设置、主题、事件、存储、版本
│   ├── shared/               # 跨功能可复用层:LLM 客户端、Markdown 渲染、UI 组件、工具
│   └── styles/               # 全局样式:tokens、base、theme、breakpoints
└── pages/                    # 各功能入口,每个子目录一个独立 HTML
    ├── games/                # 2048 / snake / tetris / memory / drawpi
    ├── aitools/              # aichat / chattavern / mdreader
    ├── language/             # english / japanese(共享层在 _shared/)
    ├── music/
    ├── forum/
    └── settings/
```

## 开发命令

```bash
npm install      # 首次拉取依赖
npm run dev      # 启动 Vite 开发服务器(HMR)
npm run build    # 构建到 dist/
npm run preview  # 本地预览 dist/ 构建产物
npm run lint     # ESLint 检查
npm run format   # Prettier 格式化
```

## 路径别名

源码内 import 使用别名,不要写相对路径 `../../`:

| 别名 | 实际路径 |
|---|---|
| `@core/*` | `src/core/*` |
| `@shared/*` | `src/shared/*` |
| `@styles/*` | `src/styles/*` |
| `@pages/*` | `pages/*` |

## 当前迁移进度

全部 8 个阶段已完成。17 个功能入口全部就绪:
- 主页 + 设置页
- 5 个游戏(2048, snake, tetris, memory, drawpi)
- 3 个 AI 工具(aichat, chattavern, mdreader)
- 2 个语言学习模块(english, japanese) + 语言选择页
- 音乐练习页
- 论坛页
- 烟雾测试页

详见 `MIGRATION_LOG.md`。
