import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const PORT = 8081;
const HOST = '127.0.0.1';
const CONTRACT_SIZE = 100;

async function introspect() {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const contracts: any[] = [];

        client.connect(PORT, HOST, () => {
            console.log('Connected to server for introspection...');
            client.write('?'); // Discovery command
        });

        client.on('data', (data) => {
            for (let i = 0; i < data.length; i += CONTRACT_SIZE) {
                const chunk = data.slice(i, i + CONTRACT_SIZE);
                if (chunk.length < CONTRACT_SIZE) break;

                const id = String.fromCharCode(chunk[0]);
                const name = chunk.slice(1, 32).toString('utf8').replace(/\0/g, '').trim();
                const responseSize = chunk.readUInt32LE(32);
                const schema = chunk.slice(36, 100).toString('utf8').replace(/\0/g, '').trim();

                contracts.push({ id, name, responseSize, schema });
            }
            client.destroy();
        });

        client.on('close', () => {
            resolve(contracts);
        });

        client.on('error', (err) => {
            reject(err);
        });
    });
}

function generateProxyTemplate(contracts: any[]) {
    return `
/**
 * AUTO-GENERATED BINARY PROXY
 * Generated: ${new Date().toISOString()}
 */

export class BinaryClient {
    constructor(private host: string = 'localhost', private port: number = 8081) {}

    private async call(commandId: string, responseSize: number): Promise<ArrayBuffer> {
        // TCP call logic
        return new Promise((resolve, reject) => {
            const net = require('net');
            const client = new net.Socket();
            
            client.connect(this.port, this.host, () => {
                client.write(commandId);
            });

            client.on('data', (data) => {
                resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
                client.destroy();
            });

            client.on('error', (err) => reject(err));
        });
    }

    ${contracts.map(c => `
    /**
     * ${c.name}
     * Expected Response: ${c.responseSize} bytes
     */
    async ${c.name}(): Promise<ArrayBuffer> {
        return this.call('${c.id}', ${c.responseSize});
    }
    `).join('\n')}
}
`;
}

function generateProxy(contracts: any[]) {
    const template = generateProxyTemplate(contracts);
    const outputPath = path.join(__dirname, 'BinaryClient.ts');
    fs.writeFileSync(outputPath, template);
    console.log('Proxy generated at ' + outputPath);

    // Also copy to webview if possible
    const webviewPath = path.join(__dirname, '../webview/src/BinaryClient.ts');
    if (fs.existsSync(path.dirname(webviewPath))) {
        fs.writeFileSync(webviewPath, template);
        console.log('Proxy also generated for webview at ' + webviewPath);
    }
}

async function run() {
    try {
        const contracts = await introspect() as any[];
        console.log('Discovered Endpoints:', contracts);
        generateProxy(contracts);
    } catch (err) {
        console.error('Failed to introspect server. Is it running?', err);
    }
}

run();
