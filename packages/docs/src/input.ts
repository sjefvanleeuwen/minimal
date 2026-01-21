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
        });
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
