# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + vanilla JavaScript multi-page app. The root `index.html` is the main navigation entry. Feature pages live in `pages/`, usually as lowercase directories containing `index.html`, `main.js`, and `style.css`. Shared app infrastructure belongs in `src/core/`; reusable helpers belong in `src/shared/`; global styles live in `src/styles/`. Static assets and public data are served from `public/`. Build output goes to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server on port `3000` with strict port behavior.
- `bash scripts/start.sh`: start the dev server with automatic port selection and cleanup.
- `bash scripts/start.sh --build`: build and preview production output.
- `npm run build`: build all HTML entries into `dist/`.
- `npm run preview`: preview an existing production build.
- `npm run lint`: run ESLint over JavaScript files.
- `npm run format`: format JS, CSS, HTML, Markdown, and JSON.

## Coding Style & Naming Conventions

Use ES modules and browser-first vanilla JavaScript. Prettier enforces 2-space indentation, semicolons, single quotes, ES5 trailing commas, LF endings, and a 100-character width. ESLint extends `eslint:recommended`; intentionally unused variables or arguments may be prefixed with `_`.

Prefer Vite aliases over deep relative imports: `@core/*`, `@shared/*`, `@styles/*`, and `@pages/*`. Add new pages under lowercase directories in `pages/` and keep standard entry filenames: `index.html`, `main.js`, and `style.css`.

## Testing Guidelines

There is no `npm test` script yet. Use `npm run lint` and `npm run build` as baseline checks. Puppeteer smoke checks are available at the repository root:

- `node verify-subpages.mjs`: checks key pages at `http://localhost:3000`.
- `node verify-cards.mjs`: checks home page theme/card rendering and writes screenshots to `/tmp`.
- `node debug-check.cjs`: runs a Chromium-specific background rendering debug check.

Start the dev server on port `3000` before running smoke scripts.

## Commit & Pull Request Guidelines

Recent commits use concise Chinese subjects, sometimes `类型：说明`, such as `修复：日志隐私保护增强`. Keep subjects short and focused on behavior or subsystem changes.

Pull requests should include a summary, changed pages/modules, verification commands run, and screenshots for visual UI changes. Link related issues when available and call out data, asset, or config changes.

## Agent-Specific Instructions

Keep edits scoped to the requested feature or fix. Do not modify generated `dist/` output unless the task explicitly concerns built artifacts. Preserve existing Chinese UI copy style when changing user-facing text.
