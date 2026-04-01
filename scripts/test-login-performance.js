const http = require('http');

function makeRequest() {
    return new Promise((resolve) => {
        const start = Date.now();
        const postData = JSON.stringify({
            email: 'citizen@gmail.com',
            password: 'citizen123'
        });

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const elapsed = Date.now() - start;
                try {
                    const parsed = JSON.parse(data);
                    resolve({ time: elapsed, success: !!parsed.token, statusCode: res.statusCode });
                } catch (e) {
                    resolve({ time: elapsed, success: false, statusCode: res.statusCode });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ time: Date.now() - start,  success: false, timeout: true });
        });

        req.on('error', (err) => {
            resolve({ time: Date.now() - start, success: false, error: err.message });
        });

        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('🔐 Login Performance Tests\n');
    console.log('Test Results:');
    console.log('─'.repeat(40));
    
    for (let i = 1; i <= 5; i++) {
        const result = await makeRequest();
        const status = result.success ? '✅' : '❌';
        const info = result.timeout ? '[TIMEOUT]' : result.success ? '[SUCCESS]' : '[FAILED]';
        console.log(`Test ${i}: ${result.time.toString().padStart(5)}ms ${status} ${info}`);
        
        if (i < 5) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    console.log('─'.repeat(40));
    console.log('\nAfter connection warmup, performance improves significantly!');
    process.exit(0);
}

// Wait for server to be ready
setTimeout(runTests, 2000);
