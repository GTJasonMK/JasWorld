/**
 * 触摸手势处理器
 * 统一处理所有触摸交互：滑动、点击、长按等
 */
export class TouchGestureHandler {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            minSwipeDistance: 30,
            maxTapDuration: 300,
            longPressDuration: 500,
            ...options
        };

        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.lastTouchTime = 0;
        this.isSwiping = false;

        this.onSwipe = null;
        this.onTap = null;
        this.onLongPress = null;
        this.onDoubleTap = null;
    }

    enableSwipe(callback) {
        this.onSwipe = callback;
        return this;
    }

    enableTap(callback) {
        this.onTap = callback;
        return this;
    }

    enableLongPress(callback) {
        this.onLongPress = callback;
        return this;
    }

    enableDoubleTap(callback) {
        this.onDoubleTap = callback;
        return this;
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
        this.isSwiping = false;
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const diffX = Math.abs(touch.clientX - this.touchStartX);
        const diffY = Math.abs(touch.clientY - this.touchStartY);

        if (diffX > 10 || diffY > 10) {
            this.isSwiping = true;
        }
    }

    handleTouchEnd(e) {
        const touch = e.changedTouches[0];
        const touchEndX = touch.clientX;
        const touchEndY = touch.clientY;
        const touchEndTime = Date.now();
        const duration = touchEndTime - this.touchStartTime;

        const diffX = touchEndX - this.touchStartX;
        const diffY = touchEndY - this.touchStartY;

        if (this.onSwipe && this.isSwiping) {
            const absX = Math.abs(diffX);
            const absY = Math.abs(diffY);

            if (absX > this.options.minSwipeDistance || absY > this.options.minSwipeDistance) {
                let direction;
                if (absX > absY) {
                    direction = diffX > 0 ? 'right' : 'left';
                } else {
                    direction = diffY > 0 ? 'down' : 'up';
                }

                this.onSwipe({
                    direction,
                    distance: Math.max(absX, absY),
                    deltaX: diffX,
                    deltaY: diffY
                });
            }
        }

        if (this.onTap && !this.isSwiping && duration < this.options.maxTapDuration) {
            const timeSinceLastTap = touchEndTime - this.lastTouchTime;
            if (this.onDoubleTap && timeSinceLastTap < 300) {
                this.onDoubleTap(e);
            } else {
                this.onTap(e);
            }
            this.lastTouchTime = touchEndTime;
        }

        if (this.onLongPress && !this.isSwiping && duration >= this.options.longPressDuration) {
            this.onLongPress(e);
        }
    }
}
