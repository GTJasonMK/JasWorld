/**
 * 等级系统管理器
 * 提供智能的等级计算和管理
 */
export class LevelSystem {
    constructor(levelConfig) {
        this.levelConfig = levelConfig || {};
        this.maxLevel = Object.keys(this.levelConfig).length;
    }

    calculateLevel(score) {
        let level = 1;
        for (let l = this.maxLevel; l >= 1; l--) {
            const config = this.levelConfig[l];
            if (!config) continue;

            const threshold = config.scoreThreshold || config.requiredScore || 0;
            if (score >= threshold) {
                level = l;
                break;
            }
        }
        return level;
    }

    getLevelConfig(level) {
        return this.levelConfig[level] || {};
    }

    getNextLevelThreshold(currentLevel) {
        if (currentLevel >= this.maxLevel) return null;

        const nextConfig = this.levelConfig[currentLevel + 1];
        if (!nextConfig) return null;

        return nextConfig.scoreThreshold || nextConfig.requiredScore || 0;
    }
}
