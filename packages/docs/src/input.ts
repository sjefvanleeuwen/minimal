export class InputController {
    keys: Record<string, boolean> = {};
    mouse = {
        down: false,
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
        wheel: 0
    };

    private lastPinchDist = 0;

    constructor() {
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        window.addEventListener('mousedown', () => this.mouse.down = true);
        window.addEventListener('mouseup', () => this.mouse.down = false);
        window.addEventListener('mousemove', (e) => {
            this.mouse.dx = e.movementX;
            this.mouse.dy = e.movementY;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener('wheel', (e) => {
            this.mouse.wheel += e.deltaY;
            // Prevent browser pinch-to-zoom on many platforms (Ctrl + Wheel)
            if (e.ctrlKey && e.cancelable) e.preventDefault();
        }, { passive: false });

        // Touch Support
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.mouse.down = true;
                this.mouse.x = e.touches[0].clientX;
                this.mouse.y = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                this.mouse.down = false; // Disable rotation during pinch
                this.lastPinchDist = this.getPinchDist(e.touches);
            }
            if (e.touches.length > 1 && e.cancelable) e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchend', () => {
            this.mouse.down = false;
            this.lastPinchDist = 0;
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                const dist = this.getPinchDist(e.touches);
                if (this.lastPinchDist > 0) {
                    // Accumulate as if it was a mouse wheel event
                    this.mouse.wheel += (this.lastPinchDist - dist) * 3;
                }
                this.lastPinchDist = dist;
            } else if (e.touches.length === 1 && this.mouse.down) {
                const touch = e.touches[0];
                this.mouse.dx = touch.clientX - this.mouse.x;
                this.mouse.dy = touch.clientY - this.mouse.y;
                this.mouse.x = touch.clientX;
                this.mouse.y = touch.clientY;
            }
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
    }

    private getPinchDist(touches: TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    isKeyDown(code: string): boolean {
        return !!this.keys[code];
    }

    resetFrame() {
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        this.mouse.wheel = 0;
    }
}
