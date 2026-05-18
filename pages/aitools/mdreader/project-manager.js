/**
 * 项目管理器
 * 负责管理文档项目（本地项目和内置加密项目）
 */

import { renderMarkdown } from '@shared/markdown/renderer.js';

export class ProjectManager {
    constructor(reader) {
        this.reader = reader;
        this.currentProject = null;
        this.currentProjectConfig = null;
        this.projectSource = null; // 'local' 或 'builtin'
        this.localProjectFiles = new Map(); // 本地项目的文件映射

        // 内置项目信息
        this.builtInProject = {
            id: 'myctue',
            name: 'Myctue游戏设计文档',
            path: 'project/myctue'
        };

        // DOM元素
        this.openProjectBtn = this.reader.openProjectBtn;
        this.directoryInput = this.reader.directoryInput;
        this.secretBtn = document.getElementById('secret-project-btn');
        this.passwordModal = document.getElementById('password-modal');
        this.passwordInput = document.getElementById('project-password-input');
        this.passwordSubmitBtn = document.getElementById('password-submit-btn');
        this.passwordCancelBtn = document.getElementById('password-cancel-btn');
        this.passwordError = document.getElementById('password-error');

        // 检查必要的DOM元素
        if (!this.openProjectBtn) {
            console.error('未找到打开项目按钮元素');
        }
        if (!this.directoryInput) {
            console.error('未找到目录选择输入元素');
        }
        if (!this.secretBtn) {
            console.error('未找到隐秘按钮元素');
        }
        if (!this.passwordModal) {
            console.error('未找到密码模态框元素');
        }

        this.init();
    }

    /**
     * 初始化
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        console.log('设置项目管理器事件监听器...');
        console.log('openProjectBtn:', this.openProjectBtn ? '存在' : '不存在');
        console.log('directoryInput:', this.directoryInput ? '存在' : '不存在');
        console.log('secretBtn:', this.secretBtn ? '存在' : '不存在');
        console.log('passwordModal:', this.passwordModal ? '存在' : '不存在');

        // 打开项目按钮 - 触发本地目录选择
        if (this.openProjectBtn && this.directoryInput) {
            this.openProjectBtn.addEventListener('click', () => this.directoryInput.click());
            console.log('打开项目按钮事件已绑定');
        } else {
            console.warn('打开项目按钮或目录输入框不存在，跳过绑定');
        }

        // 目录选择
        if (this.directoryInput) {
            this.directoryInput.addEventListener('change', (e) => this.handleDirectorySelect(e));
            console.log('目录选择事件已绑定');
        }

        // 隐秘按钮 - 打开内置项目
        if (this.secretBtn) {
            this.secretBtn.addEventListener('click', () => this.openBuiltInProject());
            console.log('隐秘按钮事件已绑定');
        } else {
            console.warn('隐秘按钮不存在，跳过绑定');
        }

        // 密码提交
        if (this.passwordSubmitBtn) {
            this.passwordSubmitBtn.addEventListener('click', () => this.verifyPassword());
        }
        if (this.passwordCancelBtn) {
            this.passwordCancelBtn.addEventListener('click', () => this.cancelPasswordInput());
        }

        // 回车提交密码
        if (this.passwordInput) {
            this.passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.verifyPassword();
                }
            });
        }

        // 点击模态框外部关闭
        if (this.passwordModal) {
            this.passwordModal.addEventListener('click', (e) => {
                if (e.target === this.passwordModal) {
                    this.cancelPasswordInput();
                }
            });
        }

        console.log('项目管理器事件监听器设置完成');
    }

    /**
     * 处理目录选择（本地项目）
     */
    async handleDirectorySelect(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        console.log('选择了目录，包含文件数:', files.length);

        // 构建文件映射
        this.localProjectFiles.clear();
        files.forEach(file => {
            // 获取相对路径（从选中目录开始）
            const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
            this.localProjectFiles.set(relativePath, file);
            console.log('文件映射:', relativePath);
        });

        // 查找config.json
        const configFile = this.localProjectFiles.get('config.json');
        if (!configFile) {
            alert('未找到config.json配置文件，请确保选择了正确的项目目录');
            return;
        }

        // 读取配置文件
        try {
            const configText = await this.readFileAsText(configFile);
            this.currentProjectConfig = JSON.parse(configText);

            // 设置当前项目
            this.currentProject = {
                id: 'local_' + Date.now(),
                name: this.currentProjectConfig.name,
                path: '' // 本地项目没有path，使用File对象
            };
            this.projectSource = 'local';

            console.log('本地项目配置加载成功:', this.currentProjectConfig);

            // 检查是否需要密码
            if (this.currentProjectConfig.password) {
                this.showPasswordModal();
            } else {
                this.showProjectDocuments();
            }
        } catch (error) {
            console.error('加载配置文件失败:', error);
            alert('配置文件格式错误: ' + error.message);
        }
    }

    /**
     * 读取文件为文本
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * 打开内置项目
     */
    openBuiltInProject() {
        this.currentProject = this.builtInProject;
        this.projectSource = 'builtin';
        this.showPasswordModal();
    }

    /**
     * 显示密码输入模态框
     */
    showPasswordModal() {
        this.passwordInput.value = '';
        this.passwordError.style.display = 'none';
        this.passwordModal.style.display = 'block';
        this.passwordInput.focus();
    }

    /**
     * 隐藏密码模态框
     */
    hidePasswordModal() {
        this.passwordModal.style.display = 'none';
        this.passwordInput.value = '';
        this.passwordError.style.display = 'none';
    }

    /**
     * 取消密码输入
     */
    cancelPasswordInput() {
        this.hidePasswordModal();
        this.currentProject = null;
        this.currentProjectConfig = null;
        this.projectSource = null;
        this.localProjectFiles.clear();
    }

    /**
     * 验证密码
     */
    async verifyPassword() {
        const password = this.passwordInput.value.trim();
        if (!password) {
            this.showPasswordError('请输入密码');
            return;
        }

        try {
            // 如果是内置项目，需要先加载配置
            if (this.projectSource === 'builtin') {
                await this.loadBuiltInProjectConfig();
            }

            // 验证密码
            if (password === this.currentProjectConfig.password) {
                // 密码正确
                this.hidePasswordModal();
                this.showProjectDocuments();
            } else {
                // 密码错误
                this.showPasswordError('密码错误，请重试');
                this.passwordInput.value = '';
                this.passwordInput.focus();
            }
        } catch (error) {
            console.error('验证密码失败:', error);
            let errorMsg = '加载项目配置失败';
            if (error.message.includes('404')) {
                errorMsg = '配置文件不存在，请检查项目路径';
            } else if (error.message.includes('Failed to fetch')) {
                errorMsg = '无法连接到服务器，请确保HTTP服务器正在运行';
            } else if (error.name === 'SyntaxError') {
                errorMsg = '配置文件格式错误';
            }
            this.showPasswordError(errorMsg + '，详情请查看控制台');
        }
    }

    /**
     * 显示密码错误
     */
    showPasswordError(message) {
        this.passwordError.textContent = message;
        this.passwordError.style.display = 'block';
    }

    /**
     * 加载内置项目配置
     */
    async loadBuiltInProjectConfig() {
        try {
            const configUrl = `${this.currentProject.path}/config.json`;
            console.log('尝试加载内置项目配置:', configUrl);

            const response = await fetch(configUrl);
            console.log('响应状态:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            }

            const configText = await response.text();
            this.currentProjectConfig = JSON.parse(configText);
            console.log('内置项目配置加载成功:', this.currentProjectConfig);
        } catch (error) {
            console.error('加载内置项目配置失败:', error);
            throw error;
        }
    }

    /**
     * 显示项目文档列表
     */
    showProjectDocuments() {
        // 隐藏上传区
        this.reader.uploadArea.style.display = 'none';

        // 更新TOC为项目文档列表
        const tocNav = this.reader.tocNav;
        tocNav.innerHTML = '';

        // 添加项目头部
        const header = document.createElement('div');
        header.className = 'project-docs-header';
        header.innerHTML = `
            <h3>${this.currentProjectConfig.name}</h3>
            <button class="close-project-btn" id="close-project-btn">关闭项目</button>
        `;
        tocNav.appendChild(header);

        // 按类别组织文档
        const categories = {};
        this.currentProjectConfig.documents.forEach(doc => {
            const category = doc.category || '其他';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(doc);
        });

        // 渲染文档列表
        Object.keys(categories).forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'doc-list-category';

            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'doc-list-category-title';
            categoryTitle.textContent = category;
            categoryDiv.appendChild(categoryTitle);

            categories[category].forEach(doc => {
                const docLink = document.createElement('a');
                docLink.href = '#';
                docLink.className = 'doc-list-item';
                docLink.textContent = doc.title;
                docLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.loadDocument(doc, docLink);
                });
                categoryDiv.appendChild(docLink);
            });

            tocNav.appendChild(categoryDiv);
        });

        // 关闭项目按钮事件
        document.getElementById('close-project-btn').addEventListener('click', () => {
            this.closeProject();
        });

        // 显示内容区
        this.reader.markdownContent.style.display = 'block';
        this.reader.markdownContent.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">请从左侧目录选择要查看的文档</div>';

        // 显示阅读进度条
        if (this.reader.progressBar) {
            this.reader.progressBar.style.display = 'block';
        }

        // 自动打开第一个文档
        if (this.currentProjectConfig.documents && this.currentProjectConfig.documents.length > 0) {
            const firstDoc = this.currentProjectConfig.documents[0];
            const firstDocLink = tocNav.querySelector('.doc-list-item');
            if (firstDocLink) {
                // 延迟加载，确保DOM已完全渲染
                setTimeout(() => {
                    this.loadDocument(firstDoc, firstDocLink);
                }, 100);
            }
        }
    }

    /**
     * 加载文档
     */
    async loadDocument(doc, clickedLink) {
        try {
            let markdown;

            // 根据项目来源使用不同的加载方式
            if (this.projectSource === 'local') {
                // 从本地File对象读取
                const file = this.localProjectFiles.get(doc.path);
                if (!file) {
                    throw new Error(`文件不存在: ${doc.path}`);
                }
                markdown = await this.readFileAsText(file);
                console.log('从本地文件读取:', doc.path);
            } else {
                // 从服务器fetch
                // 对路径的各个部分分别进行URL编码，避免中文路径问题
                const pathParts = doc.path.split('/');
                const encodedPath = pathParts.map(part => encodeURIComponent(part)).join('/');
                const docPath = `${this.currentProject.path}/${encodedPath}`;
                console.log('请求路径:', docPath);

                const response = await fetch(docPath);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                markdown = await response.text();
                console.log('从服务器读取成功:', doc.title);
            }

            // 使用reader的渲染方法
            this.reader.currentMarkdown = markdown;
            this.reader.currentFile = { name: doc.title };

            // 使用共享渲染器
            const html = renderMarkdown(markdown);
            this.reader.markdownContent.innerHTML = html;
            this.reader.addCopyButtons();

            // 高亮当前文档
            const allDocLinks = this.reader.tocNav.querySelectorAll('.doc-list-item');
            allDocLinks.forEach(link => link.classList.remove('active'));
            if (clickedLink) {
                clickedLink.classList.add('active');
            }

            // 显示文件信息
            this.reader.fileInfo.style.display = 'flex';
            this.reader.fileName.textContent = doc.title;

            // 滚动到顶部
            this.reader.markdownContent.scrollTop = 0;

            console.log('文档加载成功:', doc.title);
        } catch (error) {
            console.error('加载文档失败:', error);
            alert(`加载文档失败: ${doc.title}\n${error.message}`);
        }
    }

    /**
     * 关闭项目
     */
    closeProject() {
        this.currentProject = null;
        this.currentProjectConfig = null;
        this.projectSource = null;
        this.localProjectFiles.clear();

        // 恢复上传区
        this.reader.uploadArea.style.display = 'flex';
        this.reader.markdownContent.style.display = 'none';
        this.reader.fileInfo.style.display = 'none';
        this.reader.markdownContent.innerHTML = '';

        // 恢复TOC
        this.reader.tocNav.innerHTML = '<p class="toc-empty">暂无目录</p>';

        // 隐藏阅读进度条
        if (this.reader.progressBar) {
            this.reader.progressBar.style.display = 'none';
        }

        console.log('项目已关闭');
    }
}
