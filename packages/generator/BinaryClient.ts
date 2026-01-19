
/**
 * AUTO-GENERATED BINARY PROXY
 * Generated: 2026-01-19T14:29:58.554Z
 * 
 * This client supports both HTTP Request/Response and WebSocket Streaming.
 */

export class BinaryClient {
    private host: string;
    private port: number;

    constructor(host: string = '127.0.0.1', port: number = 8081) {
        this.host = host;
        this.port = port;
    }

    /**
     * Executes a standard Request/Response binary call via HTTP
     */
    private async call(commandId: string, _responseSize: number): Promise<ArrayBuffer> {
        const url = `http://${this.host}:${this.port}/${commandId}`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Binary call failed: ${resp.statusText}`);
            return await resp.arrayBuffer();
        } catch (err) {
            console.error(`Failed to call command ${commandId}:`, err);
            throw err;
        }
    }

    /**
     * Subscribes to a binary stream via WebSocket
     */
    public subscribe(commandId: string, onData: (data: ArrayBuffer) => void): () => void {
        const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${this.host}:${this.port}/${commandId}`;
        
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        
        ws.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
                onData(ev.data);
            }
        };

        ws.onopen = () => console.log(`WebSocket Stream ${commandId} connected`);
        ws.onerror = (err) => console.error(`WebSocket Stream ${commandId} error:`, err);
        ws.onclose = () => console.log(`WebSocket Stream ${commandId} closed`);

        return () => ws.close();
    }

    
    /**
     * GetWeatherForecast
     * Expected Response: 24 bytes
     * Schema: u32:date|i32:temp|c16:summary
     */
    public async GetWeatherForecast(): Promise<ArrayBuffer> {
        return this.call('1', 24);
    }


    /**
     * GetSystemStatus
     * Expected Response: 2 bytes
     * Schema: c2:status
     */
    public async GetSystemStatus(): Promise<ArrayBuffer> {
        return this.call('2', 2);
    }


    /**
     * LiveTelemetry (LIVE STREAM)
     * Schema: u32:counter|f32:uptime
     */
    public subscribeToLiveTelemetry(onData: (data: ArrayBuffer) => void): () => void {
        return this.subscribe('3', onData);
    }

}
