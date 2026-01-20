import { Renderer } from './Renderer';
import { SceneManager } from './SceneManager';

async function main() {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    const errorOverlay = document.getElementById('error-overlay') as HTMLDivElement;
    
    if (!navigator.gpu) {
        errorOverlay.style.display = 'flex';
        return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const renderer = new Renderer(canvas);
    try {
        await renderer.init();
        errorOverlay.style.display = 'none';
    } catch (e) {
        console.error(e);
        errorOverlay.style.display = 'flex';
        return;
    }

    const scene = new SceneManager();

    let lastTime = performance.now();

    function frame() {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        scene.update(delta);
        
        const aspect = canvas.width / canvas.height;
        const vpMatrix = scene.getViewProjectionMatrix(aspect);
        
        renderer.render(scene.nodes, vpMatrix);
        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        renderer.resize();
    });

    requestAnimationFrame(frame);
}

main().catch(console.error);
