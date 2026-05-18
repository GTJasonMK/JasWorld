/**
 * 通知系统
 * 统一管理所有通知消息
 */
export class NotificationSystem {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.container = null;
        this.init();
    }

    init() {
        if (!document.getElementById('notification-system-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-system-styles';
            style.textContent = `
                @keyframes slideInDown {
                    from { opacity: 0; transform: translate(-50%, -100%); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes fadeOutUp {
                    from { opacity: 1; transform: translate(-50%, 0); }
                    to { opacity: 0; transform: translate(-50%, -100%); }
                }
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.05); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    show(message, options = {}) {
        const config = {
            type: 'info',
            duration: 2000,
            position: 'top',
            animation: 'slideIn',
            ...options
        };

        const notification = document.createElement('div');
        notification.className = `game-notification notification-${config.type}`;

        const colors = {
            success: 'rgba(76, 175, 80, 0.95)',
            warning: 'rgba(255, 152, 0, 0.95)',
            error: 'rgba(244, 67, 54, 0.95)',
            info: 'rgba(33, 150, 243, 0.95)',
            levelup: 'rgba(156, 39, 176, 0.95)'
        };

        const positions = {
            top: 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%);',
            center: 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);',
            bottom: 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);'
        };

        const animations = {
            slideIn: 'slideInDown 0.3s ease-out',
            fade: 'fadeIn 0.3s ease-out',
            pulse: 'pulse 0.5s ease-out'
        };

        notification.style.cssText = `
            ${positions[config.position]}
            background: ${colors[config.type] || colors.info};
            color: white;
            padding: 16px 32px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: ${animations[config.animation] || animations.slideIn};
            max-width: 80%;
            text-align: center;
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        this.resourceManager.setTimeout(() => {
            notification.style.animation = 'fadeOutUp 0.3s ease-out';
            this.resourceManager.setTimeout(() => {
                notification.remove();
            }, 300);
        }, config.duration);

        return notification;
    }

    success(message, duration) {
        return this.show(message, { type: 'success', duration });
    }

    warning(message, duration) {
        return this.show(message, { type: 'warning', duration });
    }

    error(message, duration) {
        return this.show(message, { type: 'error', duration });
    }

    info(message, duration) {
        return this.show(message, { type: 'info', duration });
    }

    levelUp(level, duration) {
        return this.show(`升级到 ${level} 级!`, {
            type: 'levelup',
            position: 'center',
            animation: 'pulse',
            duration: duration || 2000
        });
    }
}
