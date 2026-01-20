// Generic Binary Transport (No generated code)
export class DynamicBinaryClient {
    constructor(private host: string, private port: number) {}

    async call(commandId: string, _size: number, body?: ArrayBuffer): Promise<ArrayBuffer> {
        const opts: RequestInit = body ? {
            method: 'POST',
            body: body,
            headers: { 'Content-Type': 'application/octet-stream' }
        } : { method: 'GET' };
        
        const resp = await fetch(`http://${this.host}:${this.port}/${commandId}`, opts);
        if (!resp.ok) throw new Error('Transport Error');
        return await resp.arrayBuffer();
    }

    subscribe(commandId: string, onData: (data: ArrayBuffer) => void): () => void {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${protocol}://${this.host}:${this.port}/${commandId}`);
        ws.binaryType = 'arraybuffer';
        
        ws.onopen = () => console.log(`[BinaryTransport] Stream ${commandId} opened`);
        ws.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
                onData(ev.data);
            } else {
                console.warn(`[BinaryTransport] Received non-binary data on stream ${commandId}`);
            }
        };
        ws.onerror = (e) => console.error(`[BinaryTransport] Stream ${commandId} error:`, e);
        ws.onclose = () => console.log(`[BinaryTransport] Stream ${commandId} closed`);
        
        return () => {
            console.log(`[BinaryTransport] Closing stream ${commandId}`);
            ws.close();
        };
    }
}
