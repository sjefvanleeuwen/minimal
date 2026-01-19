import { useState, useEffect, useRef } from 'react';
import './App.css';

// Generic Binary Transport (No generated code)
class DynamicBinaryClient {
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

interface EndpointContract {
    id: string;
    name: string;
    responseSize: number;
    reqSchema: string;
    resSchema: string;
    type: number; // 0: Req/Res, 1: Stream
}

interface ExecutionResult {
    id: string;
    timestamp: string;
    raw: ArrayBuffer;
    decoded: any;
    isStreaming?: boolean;
}

function App() {
    const [contracts, setContracts] = useState<EndpointContract[]>([]);
    const [results, setResults] = useState<ExecutionResult[]>([]);
    const [status, setStatus] = useState<string>('Ready');
    const [loading, setLoading] = useState(false);
    const [activeStreams, setActiveStreams] = useState<Record<string, () => void>>({});
    const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
    
    // We use a ref for the client to prevent re-creation
    // Use window.location.hostname to ensure it matches the origin of the UI
    const clientRef = useRef(new DynamicBinaryClient(window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname, 8081));
    const client = clientRef.current;

    const encodeBinary = (schema: string, data: Record<string, string>): ArrayBuffer => {
        let size = 0;
        const fields = schema.split('|').filter(f => f);
        
        // Pass 1: calculate size
        fields.forEach(field => {
            const [type, name] = field.split(':');
            if (type === 'u32' || type === 'i32' || type === 'f32') size += 4;
            else if (type === 'u8') size += 1;
            else if (type.startsWith('c')) size += parseInt(type.substring(1));
            else if (type === 'str') {
                const val = data[name] || "";
                size += 4 + new TextEncoder().encode(val).length;
            }
        });

        const buf = new ArrayBuffer(size);
        const view = new DataView(buf);
        let offset = 0;

        // Pass 2: encode
        fields.forEach(field => {
            const [type, name] = field.split(':');
            const val = data[name] || "0";
            if (type === 'u32') { view.setUint32(offset, parseInt(val), true); offset += 4; }
            else if (type === 'i32') { view.setInt32(offset, parseInt(val), true); offset += 4; }
            else if (type === 'f32') { view.setFloat32(offset, parseFloat(val), true); offset += 4; }
            else if (type === 'u8') { view.setUint8(offset, parseInt(val)); offset += 1; }
            else if (type.startsWith('c')) {
                const len = parseInt(type.substring(1));
                const encoded = new TextEncoder().encode(val);
                new Uint8Array(buf, offset, len).set(encoded.slice(0, len));
                offset += len;
            } else if (type === 'str') {
                const encoded = new TextEncoder().encode(val);
                view.setUint32(offset, encoded.length, true);
                offset += 4;
                new Uint8Array(buf, offset, encoded.length).set(encoded);
                offset += encoded.length;
            }
        });
        return buf;
    };

    const parseBinary = (buf: ArrayBuffer, schema: string) => {
        const view = new DataView(buf);
        const result: any = {};
        let offset = 0;

        try {
            schema.split('|').forEach(field => {
                const [type, name] = field.split(':');
                if (!type || !name) return;
                
                if (type === 'u32') {
                    result[name] = view.getUint32(offset, true);
                    offset += 4;
                } else if (type === 'i32') {
                    result[name] = view.getInt32(offset, true);
                    offset += 4;
                } else if (type === 'f32') {
                    result[name] = view.getFloat32(offset, true).toFixed(2);
                    offset += 4;
                } else if (type === 'u8') {
                    result[name] = view.getUint8(offset);
                    offset += 1;
                } else if (type.startsWith('c')) {
                    const len = parseInt(type.substring(1));
                    result[name] = new TextDecoder().decode(buf.slice(offset, offset + len)).replace(/\0/g, '');
                    offset += len;
                } else if (type === 'str') {
                    const len = view.getUint32(offset, true);
                    offset += 4;
                    result[name] = new TextDecoder().decode(buf.slice(offset, offset + len));
                    offset += len;
                }
            });
        } catch (e) {
            return { error: "Schema mismatch or partial data" };
        }
        return result;
    };

    const discover = async () => {
        setLoading(true);
        setStatus('Introspecting Service...');
        try {
            const buf = await client.call('?', 0);
            const CONTRACT_SIZE = 128; // Standardized to 128 bytes
            const discovered: EndpointContract[] = [];
            for (let i = 0; i < buf.byteLength; i += CONTRACT_SIZE) {
                const chunk = buf.slice(i, i + CONTRACT_SIZE);
                if (chunk.byteLength < CONTRACT_SIZE) break;
                const view = new DataView(chunk);
                
                const id = String.fromCharCode(view.getUint8(0));
                const name = new TextDecoder().decode(chunk.slice(1, 32)).replace(/\0/g, '').trim();
                const responseSize = view.getUint32(32, true);
                const type = view.getUint32(36, true);
                const reqSchema = new TextDecoder().decode(chunk.slice(40, 84)).replace(/\0/g, '').trim();
                const resSchema = new TextDecoder().decode(chunk.slice(84, 128)).replace(/\0/g, '').trim();
                
                discovered.push({ id, name, responseSize, reqSchema, resSchema, type });
            }
            setContracts(discovered);
            setStatus('Discovery Successful');
        } catch (err) {
            setStatus('Connection Failed');
        } finally {
            setLoading(false);
        }
    };

    const execute = async (contract: EndpointContract) => {
        if (contract.type === 1) {
            if (activeStreams[contract.id]) {
                activeStreams[contract.id]();
                setActiveStreams(prev => {
                    const next = { ...prev };
                    delete next[contract.id];
                    return next;
                });
                return;
            }

            const unsubscribe = client.subscribe(contract.id, (buf) => {
                const decoded = parseBinary(buf, contract.resSchema);
                setResults(prev => {
                    // Update the existing streaming entry if found, otherwise prepend
                    const otherLogs = prev.filter(r => !(r.id === contract.id && r.isStreaming));
                    const newEntry = {
                        id: contract.id,
                        timestamp: new Date().toLocaleTimeString(),
                        raw: buf,
                        decoded,
                        isStreaming: true
                    };
                    return [newEntry, ...otherLogs].slice(0, 20);
                });
            });
            setActiveStreams(prev => ({ ...prev, [contract.id]: unsubscribe }));
            return;
        }

        setLoading(true);
        setStatus(`Executing ${contract.name}...`);
        try {
            const body = contract.reqSchema ? encodeBinary(contract.reqSchema, inputs[contract.id] || {}) : undefined;
            const buf = await client.call(contract.id, contract.responseSize, body);
            const decoded = parseBinary(buf, contract.resSchema);
            const newResult: ExecutionResult = {
                id: contract.id,
                timestamp: new Date().toLocaleTimeString(),
                raw: buf,
                decoded
            };
            setResults(prev => [newResult, ...prev].slice(0, 5));
            setStatus('Execution Success');
        } catch (err) {
            setStatus('Execution Failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        discover();
    }, []);

    return (
        <div className="binary-swagger">
            <header className="app-header">
                <div className="title-group">
                    <h1>Binary API Explorer</h1>
                    <span className="version-tag">VER 1.0.0 (ZERO-PARSER)</span>
                </div>
                <div className="global-status">
                    <span className="status-label">HUB STATUS:</span>
                    <span className={`status-val ${status.toLowerCase().includes('failed') ? 'err' : ''}`}>{status}</span>
                </div>
                <button onClick={discover} className="btn-icon">⟳ REDISCOVER</button>
            </header>

            <main className="swagger-main">
                <section className="registry-section">
                    <h2>Endpoint Registry</h2>
                    <div className="endpoint-grid">
                        {contracts.map(c => (
                            <div key={c.id} className="endpoint-cell">
                                <div className="cell-head">
                                    <span className="id-badge">ID: {c.id}</span>
                                    <span className="method-name">{c.name}</span>
                                </div>
                                <div className="cell-body">
                                    <div className="info-row">
                                        <span>RESPONSE SIZE:</span> <strong>{c.responseSize === 0 ? 'VARIABLE' : `${c.responseSize} BYTES`}</strong>
                                    </div>
                                    {c.reqSchema && (
                                        <div className="req-inputs">
                                            {c.reqSchema.split('|').map(field => {
                                                const [type, name] = field.split(':');
                                                return (
                                                    <div key={name} className="input-field">
                                                        <label>{name} ({type})</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder={type}
                                                            value={inputs[c.id]?.[name] || ''}
                                                            onChange={(e) => setInputs(prev => ({
                                                                ...prev,
                                                                [c.id]: { ...(prev[c.id] || {}), [name]: e.target.value }
                                                            }))}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="schema-tag">
                                        RES: {c.resSchema}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => execute(c)} 
                                    disabled={loading && c.type === 0} 
                                    className={`execute-btn ${activeStreams[c.id] ? 'active-stream' : ''}`}
                                >
                                    {c.type === 1 
                                        ? (activeStreams[c.id] ? '■ STOP STREAM' : '▶ LIVE STREAM') 
                                        : 'TRY IT OUT ➔'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="results-section">
                    <h2>Execution Logs</h2>
                    <div className="logs-container">
                        {results.length === 0 && <div className="empty-logs">NO DATA EXECUTED</div>}
                        {results.map((r, i) => (
                            <div key={i} className={`log-entry ${r.isStreaming ? 'streaming' : ''}`}>
                                <div className="log-meta">
                                    <span className="log-time">{r.timestamp} {r.isStreaming && <span className="streaming-label">● LIVE</span>}</span>
                                    <span className="log-id">CMD: {r.id}</span>
                                </div>
                                <div className="log-data">
                                    <div className="data-pane">
                                        <label>DECODED STRUCT</label>
                                        <pre>{JSON.stringify(r.decoded, null, 2)}</pre>
                                    </div>
                                    <div className="data-pane hex">
                                        <label>RAW BYTES / ASCII</label>
                                        <pre>
                                            {Array.from(new Uint8Array(r.raw)).map(b => b.toString(16).padStart(2, '0')).join(' ')}
                                            {"\n\n"}
                                            {new TextDecoder().decode(r.raw).replace(/[^\x20-\x7E]/g, '.')}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            <footer className="footer-bar">
                TCP /8081 • PROXY-LESS DISCOVERY • NO-JSON BACKEND
            </footer>
        </div>
    );
}

export default App;
