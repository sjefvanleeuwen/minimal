import { BinaryClient } from './packages/generator/BinaryClient';

async function test() {
    const client = new BinaryClient('127.0.0.1', 8081);
    
    console.log('--- Testing Binary API Solution ---');
    
    try {
        console.log('Calling: GetSystemStatus...');
        const statusBuf = await client.GetSystemStatus();
        console.log('Result:', Buffer.from(statusBuf).toString());

        console.log('\nCalling: GetWeatherForecast...');
        const weatherBuf = await client.GetWeatherForecast();
        
        // Zero-parser parsing in JS/TS using DataView
        const view = new DataView(weatherBuf);
        const date = view.getUint32(0, true);
        const temp = view.getInt32(4, true);
        const summary = Buffer.from(weatherBuf.slice(8)).toString().replace(/\0/g, '');
        
        console.log('Result:');
        console.log(`  Date: ${date}`);
        console.log(`  Temp: ${temp}°C`);
        console.log(`  Summary: ${summary}`);
        
    } catch (err) {
        console.error('Error during test:', err);
    }
}

test();
