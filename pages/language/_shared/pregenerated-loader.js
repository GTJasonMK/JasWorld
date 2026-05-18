/**
 * 预生成数据加载器
 * 负责从JSON文件加载预生成的AI内容
 * 支持网络检测和自适应加载策略
 */
export class PregeneratedDataLoader {
    /**
     * @param {string} bookId - 词汇书ID（如'cet4'）
     * @param {string} language - 语言代码（如'english'）
     * @param {Object} options - 加载选项
     * @param {string} options.loadStrategy - 加载策略: 'auto'(自动检测), 'eager'(立即全量), 'lazy'(按需)
     * @param {number} options.maxConcurrency - 最大并发数（auto模式下会根据网络调整）
     */
    constructor(bookId, language = 'english', options = {}) {
        this.bookId = bookId;
        this.language = language;
        this.data = null;
        this.loading = false;
        this.loadPromise = null;
        this.partialData = new Map(); // 分片数据缓存
        this.index = null; // 索引信息

        // 配置选项
        this.options = {
            loadStrategy: options.loadStrategy || 'auto', // 'auto', 'eager', 'lazy'
            maxConcurrency: options.maxConcurrency || null // null表示根据网络自动决定
        };

        // 网络状态
        this.networkInfo = this.detectNetworkSpeed();
    }

    /**
     * 检测网络速度
     * @returns {Object} 网络信息
     */
    detectNetworkSpeed() {
        // 尝试使用Network Information API
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (connection) {
            const effectiveType = connection.effectiveType || '4g';
            const downlink = connection.downlink || null; // Mbps
            const rtt = connection.rtt || null; // ms

            console.log(`[PregeneratedDataLoader] 网络检测: ${effectiveType}, 下载速度: ${downlink}Mbps, RTT: ${rtt}ms`);

            // 根据网络类型确定建议的并发数
            let recommendedConcurrency;
            let strategy;

            switch (effectiveType) {
                case 'slow-2g':
                    recommendedConcurrency = 1;
                    strategy = 'lazy'; // 极慢网络，按需加载
                    break;
                case '2g':
                    recommendedConcurrency = 2;
                    strategy = 'lazy'; // 慢网络，按需加载
                    break;
                case '3g':
                    recommendedConcurrency = 3;
                    strategy = 'eager'; // 中速网络，预加载但限制并发
                    break;
                case '4g':
                default:
                    recommendedConcurrency = 10; // 快速网络，高并发
                    strategy = 'eager';
                    break;
            }

            return {
                type: effectiveType,
                downlink,
                rtt,
                recommendedConcurrency,
                recommendedStrategy: strategy
            };
        }

        // 无法检测，假设4g
        console.log('[PregeneratedDataLoader] 无法检测网络，假设4g');
        return {
            type: '4g',
            downlink: null,
            rtt: null,
            recommendedConcurrency: 10,
            recommendedStrategy: 'eager'
        };
    }

    /**
     * 初始化加载器（懒加载）
     */
    async init() {
        if (this.loading) {
            return this.loadPromise;
        }
        if (this.data) {
            return;
        }

        this.loading = true;
        this.loadPromise = this.loadData();

        try {
            await this.loadPromise;
        } finally {
            this.loading = false;
        }
    }

    /**
     * 从服务器加载预生成数据（支持多文件分片）
     */
    async loadData() {
        try {
            // 优先尝试从子目录加载索引文件（新结构）
            let indexUrl = `data/${this.bookId}/${this.bookId}_index.json`;
            let indexResponse = await fetch(indexUrl);

            // 如果子目录不存在，尝试旧路径（向后兼容）
            if (!indexResponse.ok) {
                indexUrl = `data/${this.bookId}_index.json`;
                indexResponse = await fetch(indexUrl);
            }

            if (indexResponse.ok) {
                // 索引文件存在，使用多文件模式
                console.log(`[PregeneratedDataLoader] 使用索引文件: ${indexUrl}`);
                await this.loadMultipleFiles(indexResponse);
            } else {
                // 索引文件不存在，回退到单文件模式（向后兼容）
                console.log('[PregeneratedDataLoader] 索引文件不存在，使用单文件模式');
                await this.loadSingleFile();
            }
        } catch (error) {
            console.error('[PregeneratedDataLoader] 加载失败:', error);
            // 降级：设置为空对象，不阻塞功能
            this.data = {};
        }
    }

    /**
     * 加载单个文件（向后兼容）
     */
    async loadSingleFile() {
        const url = `data/${this.bookId}_pregenerated.json`;
        console.log(`[PregeneratedDataLoader] 开始加载单文件: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.data = await response.json();
        const wordCount = Object.keys(this.data).length;
        console.log(`[PregeneratedDataLoader] 成功加载 ${wordCount} 个单词的预生成数据`);
    }

    /**
     * 加载多个分片文件（自适应并发控制）
     */
    async loadMultipleFiles(indexResponse) {
        this.index = await indexResponse.json();
        console.log(`[PregeneratedDataLoader] 发现索引文件: ${this.index.totalParts}个分片, 共${this.index.totalWords}个单词`);

        // 决定加载策略
        const strategy = this.options.loadStrategy === 'auto'
            ? this.networkInfo.recommendedStrategy
            : this.options.loadStrategy;

        console.log(`[PregeneratedDataLoader] 使用加载策略: ${strategy}`);

        if (strategy === 'lazy') {
            // 延迟加载模式：只记录索引，不立即加载数据
            console.log('[PregeneratedDataLoader] 延迟加载模式：数据将按需加载');
            this.data = {}; // 初始化为空对象，表示已就绪但数据未加载
            return;
        }

        // Eager模式：立即加载所有数据（但控制并发）
        const concurrency = this.options.maxConcurrency || this.networkInfo.recommendedConcurrency;

        if (concurrency >= this.index.totalParts) {
            // 并发数足够，一次性并发加载所有分片
            console.log(`[PregeneratedDataLoader] 并发加载所有${this.index.totalParts}个分片`);
            const loadPromises = this.index.parts.map((part, idx) =>
                this.loadPart(part, idx + 1, this.index.totalParts)
            );
            const parts = await Promise.all(loadPromises);
            this.data = Object.assign({}, ...parts);
        } else {
            // 限制并发数，分批加载
            console.log(`[PregeneratedDataLoader] 限制并发数为${concurrency}，分批加载${this.index.totalParts}个分片`);
            this.data = await this.loadPartsWithConcurrencyLimit(this.index.parts, concurrency);
        }

        const wordCount = Object.keys(this.data).length;
        console.log(`[PregeneratedDataLoader] 成功加载 ${wordCount} 个单词的预生成数据（来自${this.index.totalParts}个分片）`);
    }

    /**
     * 限制并发数加载分片
     * @param {Array} parts - 分片信息数组
     * @param {number} concurrency - 最大并发数
     * @returns {Promise<Object>} 合并后的数据
     */
    async loadPartsWithConcurrencyLimit(parts, concurrency) {
        const results = new Array(parts.length);
        let cursor = 0;
        const workerCount = Math.max(1, Math.min(concurrency || 1, parts.length));

        const workers = Array.from({ length: workerCount }, async () => {
            while (cursor < parts.length) {
                const index = cursor++;
                results[index] = await this.loadPart(parts[index], index + 1, parts.length);
            }
        });

        await Promise.all(workers);
        return Object.assign({}, ...results);
    }

    /**
     * 按需加载指定分片的数据
     * @param {string} word - 单词
     * @returns {Promise<void>}
     */
    async loadPartForWord(word) {
        if (!this.index) {
            console.warn('[PregeneratedDataLoader] 索引未加载，无法按需加载');
            return;
        }

        // 遍历所有分片，查找包含该单词的分片
        for (let i = 0; i < this.index.parts.length; i++) {
            const partInfo = this.index.parts[i];

            // 如果该分片已加载，跳过
            if (this.partialData.has(partInfo.outputFile)) {
                continue;
            }

            // 加载该分片
            console.log(`[PregeneratedDataLoader] 按需加载分片: ${partInfo.outputFile}`);
            const partData = await this.loadPart(partInfo, i + 1, this.index.totalParts);

            // 缓存该分片
            this.partialData.set(partInfo.outputFile, partData);

            // 合并到主数据
            Object.assign(this.data, partData);

            // 如果找到了该单词，停止加载
            if (partData[word]) {
                console.log(`[PregeneratedDataLoader] 在分片${i + 1}中找到单词"${word}"`);
                return;
            }
        }

        console.log(`[PregeneratedDataLoader] 所有分片已搜索，未找到单词"${word}"`);
    }

    /**
     * 加载单个分片
     */
    async loadPart(partInfo, currentPart, totalParts) {
        const url = partInfo.outputFile;
        console.log(`[PregeneratedDataLoader] 加载分片 ${currentPart}/${totalParts}: ${partInfo.outputFile}`);

        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[PregeneratedDataLoader] 分片${currentPart}加载失败: ${response.status}`);
            return {};
        }

        return await response.json();
    }

    /**
     * 获取单词的预生成数据（支持按需加载）
     * @param {string} word - 单词
     * @returns {Promise<Object|null>} 单词数据或null
     */
    async getWord(word) {
        await this.init();

        // 如果已经有该单词的数据，直接返回
        if (this.data[word]) {
            return this.data[word];
        }

        // 如果是lazy模式且还有未加载的分片，尝试按需加载
        const strategy = this.options.loadStrategy === 'auto'
            ? this.networkInfo.recommendedStrategy
            : this.options.loadStrategy;

        if (strategy === 'lazy' && this.index) {
            await this.loadPartForWord(word);
            return this.data[word] || null;
        }

        return null;
    }

    /**
     * 检查是否有指定单词的数据
     * @param {string} word - 单词
     * @returns {boolean}
     */
    hasWord(word) {
        return this.data && this.data[word] !== undefined;
    }

    /**
     * 获取已加载的单词数量
     * @returns {number}
     */
    getWordCount() {
        return this.data ? Object.keys(this.data).length : 0;
    }

    /**
     * 检查是否已初始化
     * @returns {boolean}
     */
    isReady() {
        return this.data !== null;
    }
}
