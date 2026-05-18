/**
 * Markdown 渲染封装
 *
 * marked(解析) + DOMPurify(消毒) + highlight.js(代码高亮)的统一入口。
 * 各业务模块直接 import 此函数,不应再各自封装 marked/DOMPurify。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

let configured = false;

function configure() {
  if (configured) return;
  configured = true;

  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('plaintext', plaintext);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('xml', xml);
  hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' });
  hljs.registerAliases(['html', 'svg'], { languageName: 'xml' });
  hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' });
  hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
  hljs.registerAliases(['md'], { languageName: 'markdown' });

  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch {
          /* fallthrough */
        }
      }
      try {
        return hljs.highlightAuto(code).value;
      } catch {
        return code;
      }
    },
  });
}

export function renderMarkdown(source, { sanitize = true } = {}) {
  configure();
  const html = marked.parse(source || '');
  return sanitize ? DOMPurify.sanitize(html) : html;
}

export { marked, hljs, DOMPurify };
