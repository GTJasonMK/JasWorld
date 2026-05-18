/**
 * Markdown阅读器核心逻辑
 * 功能：文件上传、markdown解析渲染、TOC生成、主题适配
 */

import { renderMarkdown } from '@shared/markdown/renderer.js';
import { storage, StorageKeys } from '@core/storage.js';

export class MarkdownReader {
    constructor() {
        // DOM元素引用
        this.uploadArea = document.getElementById('upload-area');
        this.fileInput = document.getElementById('file-input');
        this.directoryInput = document.getElementById('directory-input');
        this.selectFileBtn = document.getElementById('select-file-btn');
        this.markdownContent = document.getElementById('markdown-content');
        this.tocNav = document.getElementById('toc-nav');
        this.tocSidebar = document.getElementById('toc-sidebar');
        this.tocOverlay = document.getElementById('toc-overlay');
        this.fileInfo = document.getElementById('file-info');
        this.fileName = document.getElementById('file-name');

        // 工具栏按钮
        this.toggleTocBtn = document.getElementById('toggle-toc-btn');
        this.copyAllBtn = document.getElementById('copy-all-btn');
        this.exportHtmlBtn = document.getElementById('export-html-btn');
        this.closeFileBtn = document.getElementById('close-file-btn');
        this.tocCloseBtn = document.getElementById('toc-close-btn');
        this.openProjectBtn = document.getElementById('open-project-btn');
        this.fontSizeIncreaseBtn = document.getElementById('font-size-increase-btn');
        this.fontSizeDecreaseBtn = document.getElementById('font-size-decrease-btn');

        // 阅读进度条
        this.progressBar = document.getElementById('reading-progress-bar');
        this.progressThumb = document.getElementById('progress-thumb');
        this.progressPercentage = document.getElementById('progress-percentage');
        this.progressTrack = this.progressBar?.querySelector('.progress-track');

        // 状态
        this.currentFile = null;
        this.currentMarkdown = '';
        this.tocVisible = true;
        this.isDraggingProgress = false;
        this.fontSize = 16; // 默认字体大小

        // 设备类型检测（基于触摸能力而非窗口宽度）
        this.isTouchDevice = this.detectTouchDevice();

        // 初始化
        this.init();
    }

    /**
     * 检测是否为触摸设备
     */
    detectTouchDevice() {
        // 综合判断：触摸点数量 + 触摸事件支持 + 窗口宽度
        const hasTouchPoints = navigator.maxTouchPoints > 0;
        const hasTouchEvent = 'ontouchstart' in window;
        const isNarrowScreen = window.innerWidth <= 768;

        // 有触摸点或触摸事件支持，且屏幕较窄，判定为触摸设备
        const isTouchDevice = (hasTouchPoints || hasTouchEvent) && isNarrowScreen;

        console.log('[设备检测]', {
            maxTouchPoints: navigator.maxTouchPoints,
            hasTouchEvent,
            windowWidth: window.innerWidth,
            判定结果: isTouchDevice ? '触摸设备（移动端）' : '鼠标设备（桌面端）'
        });

        return isTouchDevice;
    }

    /**
     * 动态检测实际滚动容器
     * 解决CSS @media和JS设备判断不一致的问题
     */
    getScrollContainer() {
        // 检查 markdownContent 是否可以滚动
        if (this.markdownContent) {
            const canScroll = this.markdownContent.scrollHeight > this.markdownContent.clientHeight;
            const hasOverflow = window.getComputedStyle(this.markdownContent).overflowY !== 'visible';

            if (canScroll && hasOverflow) {
                return 'element'; // 使用元素滚动
            }
        }
        return 'window'; // 使用window滚动
    }

    /**
     * 初始化
     */
    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.loadFontSizeFromStorage();
        this.loadFromStorage();

        // 窄屏默认隐藏TOC和overlay，避免目录抽屉挤占上传区。
        const startsWithDrawerToc = this.isTouchDevice || window.matchMedia('(max-width: 768px)').matches;
        if (startsWithDrawerToc) {
            this.tocVisible = false;
            this.tocSidebar.classList.add('hidden');
            if (this.tocOverlay) {
                this.tocOverlay.classList.remove('active');
            }
        }
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        console.log('开始设置事件监听器...');

        // 文件上传相关
        if (this.selectFileBtn && this.fileInput) {
            this.selectFileBtn.addEventListener('click', () => this.fileInput.click());
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
            console.log('文件上传事件已绑定');
        } else {
            console.warn('文件上传按钮或输入框不存在');
        }

        // 拖拽上传
        if (this.uploadArea) {
            this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
            console.log('拖拽上传事件已绑定');
        } else {
            console.warn('上传区域不存在');
        }

        // 工具栏按钮
        if (this.toggleTocBtn) {
            this.toggleTocBtn.addEventListener('click', () => this.toggleToc());
            console.log('TOC切换按钮已绑定');
        }

        if (this.tocCloseBtn) {
            this.tocCloseBtn.addEventListener('click', () => this.toggleToc());
            console.log('TOC关闭按钮已绑定');
        }

        // TOC遮罩层点击关闭（如果存在）
        if (this.tocOverlay) {
            this.tocOverlay.addEventListener('click', () => this.toggleToc());
            console.log('TOC遮罩层已绑定');
        }

        if (this.copyAllBtn) {
            this.copyAllBtn.addEventListener('click', () => this.copyAllContent());
            console.log('复制按钮已绑定');
        }

        if (this.exportHtmlBtn) {
            this.exportHtmlBtn.addEventListener('click', () => this.exportHtml());
            console.log('导出按钮已绑定');
        }

        if (this.closeFileBtn) {
            this.closeFileBtn.addEventListener('click', () => this.closeFile());
            console.log('关闭文件按钮已绑定');
        }

        // 字体大小调整按钮
        if (this.fontSizeIncreaseBtn) {
            this.fontSizeIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
            console.log('增大字体按钮已绑定');
        }

        if (this.fontSizeDecreaseBtn) {
            this.fontSizeDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
            console.log('减小字体按钮已绑定');
        }

        // 打开项目按钮触发目录选择，由ProjectManager处理

        // 滚动同步TOC高亮和进度条
        // 同时监听window和markdownContent的滚动，函数内部根据设备类型判断
        const scrollHandler = () => {
            this.updateTocHighlight();
            this.updateProgressBar();
        };

        window.addEventListener('scroll', scrollHandler);
        if (this.markdownContent) {
            this.markdownContent.addEventListener('scroll', scrollHandler);
        }
        console.log('滚动事件已绑定(window + markdownContent)');

        // 进度条拖动事件
        this.setupProgressBarDrag();

        console.log('事件监听器设置完成');
    }

    /**
     * 设置进度条拖动功能
     */
    setupProgressBarDrag() {
        if (!this.progressThumb || !this.progressTrack) {
            return;
        }

        // 点击轨道跳转
        this.progressTrack.addEventListener('click', (e) => {
            if (e.target === this.progressThumb) return;
            const rect = this.progressTrack.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const percentage = clickY / rect.height;
            this.scrollToPercentage(percentage);
        });

        // 触摸轨道跳转（移动端）
        this.progressTrack.addEventListener('touchend', (e) => {
            if (this.isDraggingProgress) return; // 如果是拖动则忽略
            if (e.target === this.progressThumb) return;
            const rect = this.progressTrack.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const touchY = touch.clientY - rect.top;
            const percentage = touchY / rect.height;
            this.scrollToPercentage(percentage);
        });

        // 拖动滑块
        this.progressThumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.isDraggingProgress = true;
            document.body.style.userSelect = 'none';

            const handleMouseMove = (e) => {
                if (!this.isDraggingProgress) return;
                const rect = this.progressTrack.getBoundingClientRect();
                const mouseY = e.clientY - rect.top;
                const percentage = Math.max(0, Math.min(1, mouseY / rect.height));

                // 直接更新滑块视觉位置
                const trackHeight = this.progressTrack.offsetHeight;
                const thumbY = percentage * (trackHeight - 24);
                this.progressThumb.style.top = `${thumbY}px`;
                this.progressPercentage.textContent = `${Math.round(percentage * 100)}%`;

                // 滚动内容
                this.scrollToPercentage(percentage);
            };

            const handleMouseUp = () => {
                this.isDraggingProgress = false;
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        // 触摸支持
        this.progressThumb.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isDraggingProgress = true;

            const handleTouchMove = (e) => {
                if (!this.isDraggingProgress) return;
                e.preventDefault(); // 阻止滚动
                const rect = this.progressTrack.getBoundingClientRect();
                const touch = e.touches[0];
                const touchY = touch.clientY - rect.top;
                const percentage = Math.max(0, Math.min(1, touchY / rect.height));

                // 直接更新滑块视觉位置
                const trackHeight = this.progressTrack.offsetHeight;
                const thumbY = percentage * (trackHeight - 40);
                this.progressThumb.style.top = `${thumbY}px`;
                if (this.progressPercentage) {
                    this.progressPercentage.textContent = `${Math.round(percentage * 100)}%`;
                }

                // 滚动内容
                this.scrollToPercentage(percentage);
            };

            const handleTouchEnd = () => {
                this.isDraggingProgress = false;
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
            };

            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
        }, { passive: false });
    }

    /**
     * 更新进度条位置
     */
    updateProgressBar() {
        if (!this.progressBar || !this.progressThumb || !this.progressPercentage) return;
        if (this.isDraggingProgress) return;

        // 动态检测实际滚动容器
        const scrollContainer = this.getScrollContainer();
        let scrollTop, scrollHeight;

        if (scrollContainer === 'window') {
            scrollTop = window.scrollY || window.pageYOffset;
            scrollHeight = document.body.scrollHeight - window.innerHeight;
        } else {
            scrollTop = this.markdownContent.scrollTop;
            scrollHeight = this.markdownContent.scrollHeight - this.markdownContent.clientHeight;
        }

        const percentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

        const trackHeight = this.progressTrack.offsetHeight;
        const thumbY = percentage * (trackHeight - (this.isTouchDevice ? 40 : 24));

        this.progressThumb.style.top = `${thumbY}px`;
        this.progressPercentage.textContent = `${Math.round(percentage * 100)}%`;

        // 调试日志（仅当滚动位置>0时输出，避免刷屏）
        if (scrollTop > 10) {
            console.log(`[进度条] 滚动更新 (${scrollContainer}):`, {
                scrollTop: Math.round(scrollTop),
                scrollHeight,
                percentage: Math.round(percentage * 100) + '%',
                设备: this.isTouchDevice ? '触摸设备' : '桌面端'
            });
        }
    }

    /**
     * 滚动到指定百分比位置
     */
    scrollToPercentage(percentage) {
        const scrollContainer = this.getScrollContainer();
        console.log('[进度条] >>>>>> 开始跳转 <<<<<<');
        console.log('[进度条] 跳转到', Math.round(percentage * 100) + '%', `(${scrollContainer}容器)`);

        if (scrollContainer === 'window') {
            const scrollHeight = document.body.scrollHeight - window.innerHeight;
            const targetScroll = percentage * scrollHeight;
            const beforeScroll = window.scrollY || window.pageYOffset;

            console.log('[进度条] Window跳转详情:', {
                当前位置: beforeScroll,
                目标位置: Math.round(targetScroll),
                总滚动高度: scrollHeight,
                body高度: document.body.scrollHeight,
                窗口高度: window.innerHeight
            });

            window.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });

            // 检查跳转是否生效
            setTimeout(() => {
                const afterScroll = window.scrollY || window.pageYOffset;
                console.log('[进度条] 跳转结果:', {
                    跳转前: beforeScroll,
                    跳转后: afterScroll,
                    变化: afterScroll - beforeScroll,
                    成功: Math.abs(afterScroll - targetScroll) < 10
                });
            }, 100);
        } else {
            const scrollHeight = this.markdownContent.scrollHeight - this.markdownContent.clientHeight;
            const targetScroll = percentage * scrollHeight;
            const beforeScroll = this.markdownContent.scrollTop;

            console.log('[进度条] Element跳转详情:', {
                当前位置: beforeScroll,
                目标位置: Math.round(targetScroll),
                总滚动高度: scrollHeight
            });

            this.markdownContent.scrollTop = targetScroll;

            setTimeout(() => {
                const afterScroll = this.markdownContent.scrollTop;
                console.log('[进度条] 跳转结果:', {
                    跳转前: beforeScroll,
                    跳转后: afterScroll,
                    变化: afterScroll - beforeScroll,
                    成功: Math.abs(afterScroll - targetScroll) < 10
                });
            }, 100);
        }
    }

    /**
     * 设置主题
     */
    setupTheme() {
        // 监听主题变化
        const observer = new MutationObserver(() => {
            this.updateCodeTheme();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        this.updateCodeTheme();
    }

    /**
     * 更新代码高亮主题（通过npm导入的CSS管理，不再动态切换CDN）
     */
    updateCodeTheme() {
        // highlight.js 样式通过 npm 包导入，不再动态切换 CDN
    }

    /**
     * 处理拖拽悬停
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const uploadBox = this.uploadArea.querySelector('.upload-box');
        uploadBox.classList.add('dragover');
    }

    /**
     * 处理拖拽离开
     */
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const uploadBox = this.uploadArea.querySelector('.upload-box');
        uploadBox.classList.remove('dragover');
    }

    /**
     * 处理文件拖放
     */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const uploadBox = this.uploadArea.querySelector('.upload-box');
        uploadBox.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.loadFile(files[0]);
        }
    }

    /**
     * 处理文件选择
     */
    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.loadFile(files[0]);
        }
    }

    /**
     * 加载文件
     */
    loadFile(file) {
        // 验证文件类型
        if (!file.name.match(/\.(md|markdown)$/i)) {
            alert('请选择.md或.markdown文件');
            return;
        }

        // 验证文件大小（最大10MB）
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('文件太大，请选择小于10MB的文件');
            return;
        }

        this.currentFile = file;

        // 读取文件
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentMarkdown = e.target.result;
            this.renderMarkdown(this.currentMarkdown);
            this.saveToStorage();
        };
        reader.onerror = () => {
            alert('文件读取失败');
        };
        reader.readAsText(file);
    }

    /**
     * 渲染Markdown
     */
    renderMarkdown(markdown) {
        try {
            // 使用共享渲染器解析并消毒
            const html = renderMarkdown(markdown);
            this.markdownContent.innerHTML = html;

            // 为代码块添加复制按钮
            this.addCopyButtons();

            // 生成TOC
            this.generateToc();

            // 显示内容，隐藏上传区
            this.uploadArea.style.display = 'none';
            this.markdownContent.style.display = 'block';
            this.fileInfo.style.display = 'flex';
            this.fileName.textContent = this.currentFile ? this.currentFile.name : '未命名文档';

            // 显示阅读进度条
            if (this.progressBar) {
                this.progressBar.style.display = 'block';
                setTimeout(() => {
                    this.updateProgressBar();
                    // 输出滚动容器检测结果
                    const container = this.getScrollContainer();
                    console.log('[滚动容器检测]', {
                        使用容器: container,
                        设备类型: this.isTouchDevice ? '触摸设备' : '桌面端',
                        markdownContent滚动高度: this.markdownContent.scrollHeight,
                        markdownContent客户端高度: this.markdownContent.clientHeight,
                        overflowY: window.getComputedStyle(this.markdownContent).overflowY
                    });
                }, 100);
            }

            // 滚动到顶部
            this.markdownContent.scrollTop = 0;

        } catch (error) {
            console.error('Markdown渲染失败:', error);
            alert('Markdown渲染失败，请检查文件格式');
        }
    }

    /**
     * 为代码块添加复制按钮
     */
    addCopyButtons() {
        const codeBlocks = this.markdownContent.querySelectorAll('pre code');
        codeBlocks.forEach((codeBlock) => {
            const pre = codeBlock.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-code-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', () => {
                this.copyCodeBlock(codeBlock, copyBtn);
            });

            wrapper.appendChild(copyBtn);
        });
    }

    /**
     * 复制代码块
     */
    copyCodeBlock(codeBlock, button) {
        const code = codeBlock.textContent;
        navigator.clipboard.writeText(code).then(() => {
            const originalText = button.textContent;
            button.textContent = '已复制';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch(() => {
            alert('复制失败');
        });
    }

    /**
     * 生成目录
     */
    generateToc() {
        const headings = this.markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');

        if (headings.length === 0) {
            this.tocNav.innerHTML = '<p class="toc-empty">暂无目录</p>';
            return;
        }

        // 为标题添加ID
        headings.forEach((heading, index) => {
            if (!heading.id) {
                heading.id = `heading-${index}`;
            }
        });

        // 构建TOC树
        const tocTree = this.buildTocTree(headings);
        this.tocNav.innerHTML = tocTree;

        // 添加点击事件
        const tocLinks = this.tocNav.querySelectorAll('a');
        tocLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    this.markdownContent.scrollTo({
                        top: targetElement.offsetTop - 20,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    /**
     * 构建TOC树
     */
    buildTocTree(headings) {
        let html = '<ul>';
        let currentLevel = 0;

        headings.forEach((heading) => {
            const level = parseInt(heading.tagName.substring(1));
            const text = heading.textContent;
            const id = heading.id;

            if (level > currentLevel) {
                html += '<ul>'.repeat(level - currentLevel);
            } else if (level < currentLevel) {
                html += '</ul>'.repeat(currentLevel - level);
            }

            html += `<li><a href="#${id}">${text}</a></li>`;
            currentLevel = level;
        });

        html += '</ul>'.repeat(currentLevel);
        return html;
    }

    /**
     * 更新TOC高亮
     */
    updateTocHighlight() {
        const headings = this.markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');

        // 动态检测实际滚动容器
        const scrollContainer = this.getScrollContainer();
        let scrollTop;

        if (scrollContainer === 'window') {
            scrollTop = window.scrollY || window.pageYOffset;
        } else {
            scrollTop = this.markdownContent.scrollTop;
        }

        let activeHeading = null;
        headings.forEach((heading) => {
            const headingTop = scrollContainer === 'window'
                ? heading.getBoundingClientRect().top + scrollTop
                : heading.offsetTop;

            if (headingTop <= scrollTop + 100) {
                activeHeading = heading;
            }
        });

        // 移除所有active类
        const tocLinks = this.tocNav.querySelectorAll('a');
        tocLinks.forEach(link => link.classList.remove('active'));

        // 添加active类到当前标题
        if (activeHeading) {
            const activeLink = this.tocNav.querySelector(`a[href="#${activeHeading.id}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    }

    /**
     * 切换TOC显示
     */
    toggleToc() {
        this.tocVisible = !this.tocVisible;
        if (this.tocVisible) {
            this.tocSidebar.classList.remove('hidden');
            if (this.tocOverlay) {
                this.tocOverlay.classList.add('active');
            }
        } else {
            this.tocSidebar.classList.add('hidden');
            if (this.tocOverlay) {
                this.tocOverlay.classList.remove('active');
            }
        }
    }

    /**
     * 复制全部内容
     */
    copyAllContent() {
        if (!this.currentMarkdown) {
            alert('没有内容可复制');
            return;
        }

        navigator.clipboard.writeText(this.currentMarkdown).then(() => {
            alert('内容已复制到剪贴板');
        }).catch(() => {
            alert('复制失败');
        });
    }

    /**
     * 导出HTML
     */
    exportHtml() {
        if (!this.currentMarkdown) {
            alert('没有内容可导出');
            return;
        }

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.currentFile ? this.currentFile.name : '文档'}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css">
    <style>
        body { max-width: 900px; margin: 2rem auto; padding: 0 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
        pre { background: #f6f8fa; padding: 1rem; border-radius: 6px; overflow-x: auto; }
        code { font-family: Consolas, Monaco, monospace; }
    </style>
</head>
<body>
${this.markdownContent.innerHTML}
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (this.currentFile ? this.currentFile.name.replace(/\.(md|markdown)$/i, '') : 'document') + '.html';
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 关闭文件
     */
    closeFile() {
        this.currentFile = null;
        this.currentMarkdown = '';
        this.uploadArea.style.display = 'flex';
        this.markdownContent.style.display = 'none';
        this.fileInfo.style.display = 'none';
        this.markdownContent.innerHTML = '';
        this.tocNav.innerHTML = '<p class="toc-empty">暂无目录</p>';
        this.fileInput.value = '';

        // 隐藏阅读进度条
        if (this.progressBar) {
            this.progressBar.style.display = 'none';
        }

        this.clearStorage();
    }

    /**
     * 增大字体
     */
    increaseFontSize() {
        if (this.fontSize < 24) {
            this.fontSize += 2;
            this.applyFontSize();
            this.saveFontSizeToStorage();
        }
    }

    /**
     * 减小字体
     */
    decreaseFontSize() {
        if (this.fontSize > 12) {
            this.fontSize -= 2;
            this.applyFontSize();
            this.saveFontSizeToStorage();
        }
    }

    /**
     * 应用字体大小
     */
    applyFontSize() {
        if (this.markdownContent) {
            this.markdownContent.style.fontSize = `${this.fontSize}px`;
        }
    }

    /**
     * 保存字体大小到LocalStorage
     */
    saveFontSizeToStorage() {
        try {
            storage.setString(StorageKeys.mdreaderFontSize, this.fontSize.toString());
        } catch (error) {
            console.error('保存字体大小失败:', error);
        }
    }

    /**
     * 从LocalStorage加载字体大小
     */
    loadFontSizeFromStorage() {
        try {
            const saved = storage.getString(StorageKeys.mdreaderFontSize);
            if (saved) {
                this.fontSize = parseInt(saved, 10);
                if (isNaN(this.fontSize) || this.fontSize < 12 || this.fontSize > 24) {
                    this.fontSize = 16;
                }
                this.applyFontSize();
            }
        } catch (error) {
            console.error('加载字体大小失败:', error);
        }
    }

    /**
     * 保存到LocalStorage
     */
    saveToStorage() {
        try {
            storage.setJSON(StorageKeys.mdreaderCurrent, {
                fileName: this.currentFile ? this.currentFile.name : '',
                markdown: this.currentMarkdown,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('保存到LocalStorage失败:', error);
        }
    }

    /**
     * 从LocalStorage加载
     */
    loadFromStorage() {
        try {
            const data = storage.getJSON(StorageKeys.mdreaderCurrent, null);
            if (data) {
                // 只在1小时内有效
                if (Date.now() - data.timestamp < 3600000) {
                    this.currentMarkdown = data.markdown;
                    this.currentFile = { name: data.fileName };
                    this.renderMarkdown(this.currentMarkdown);
                }
            }
        } catch (error) {
            console.error('从LocalStorage加载失败:', error);
        }
    }

    /**
     * 清除LocalStorage
     */
    clearStorage() {
        try {
            storage.remove(StorageKeys.mdreaderCurrent);
        } catch (error) {
            console.error('清除LocalStorage失败:', error);
        }
    }
}
