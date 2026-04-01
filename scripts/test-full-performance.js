const http = require('http');

let authToken = null;

function makeRequest(method, path, body = null) {
    return new Promise((resolve) => {
        const start = Date.now();
        const postData = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        };

        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const elapsed = Date.now() - start;
                try {
                    const parsed = JSON.parse(data);
                    resolve({ time: elapsed, success: res.statusCode < 400, statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ time: elapsed, success: res.statusCode < 400, statusCode: res.statusCode });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ time: Date.now() - start, success: false, timeout: true });
        });

        req.on('error', (err) => {
            resolve({ time: Date.now() - start, success: false, error: err.message });
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function runTests() {
    console.log('🚀 Full Application Performance Test\n');
    console.log('═'.repeat(50));
    
    // Test 1: Login
    console.log('\n✅ TEST 1: LOGIN');
    console.log('─'.repeat(50));
    const loginResult = await makeRequest('POST', '/api/auth/login', {
        email: 'citizen@gmail.com',
        password: 'citizen123'
    });
    console.log(`Login Request: ${loginResult.time}ms ${loginResult.success ? '✅' : '❌'}`);
    
    if (loginResult.success && loginResult.data.token) {
        authToken = loginResult.data.token;
        console.log(`User: ${loginResult.data.user.displayName}`);
    }
    
    // Test 2: Load issues - first page (10 items)
    console.log('\n✅ TEST 2: LOAD DASHBOARD ISSUES (First Page - 10 items)');
    console.log('─'.repeat(50));
    const issuesPage1 = await makeRequest('GET', '/api/issues?page=1&limit=10');
    console.log(`Issues List Response: ${issuesPage1.time}ms ${issuesPage1.success ? '✅' : '❌'}`);
    if (issuesPage1.success && issuesPage1.data.issues) {
        console.log(`Issues Loaded: ${issuesPage1.data.issues.length}`);
        console.log(`Total Issues: ${issuesPage1.data.pagination?.total}`);
    }
    
    // Test 3: Load second page (15 items)
    console.log('\n✅ TEST 3: LOAD MORE ISSUES (Second Page - 15 items)');
    console.log('─'.repeat(50));
    const issuesPage2 = await makeRequest('GET', '/api/issues?page=2&limit=15');
    console.log(`Issues List Response: ${issuesPage2.time}ms ${issuesPage2.success ? '✅' : '❌'}`);
    if (issuesPage2.success && issuesPage2.data.issues) {
        console.log(`Issues Loaded: ${issuesPage2.data.issues.length}`);
    }
    
    // Test 4: Get India feed (hot issues)
    console.log('\n✅ TEST 4: LOAD INDIA FEED (Hot Issues)');
    console.log('─'.repeat(50));
    const indiaFeed = await makeRequest('GET', '/api/issues/feed/india?filter=hot&limit=20');
    console.log(`India Feed Response: ${indiaFeed.time}ms ${indiaFeed.success ? '✅' : '❌'}`);
    if (indiaFeed.success && indiaFeed.data.issues) {
        console.log(`Issues Loaded: ${indiaFeed.data.issues.length}`);
    }
    
    // Test 5: Get single issue details (if we have issues)
    if (issuesPage1.success && issuesPage1.data.issues && issuesPage1.data.issues.length > 0) {
        const issueId = issuesPage1.data.issues[0]._id;
        console.log('\n✅ TEST 5: LOAD ISSUE DETAILS');
        console.log('─'.repeat(50));
        const issueDetail = await makeRequest('GET', `/api/issues/${issueId}`);
        console.log(`Issue Detail Response: ${issueDetail.time}ms ${issueDetail.success ? '✅' : '❌'}`);
        if (issueDetail.success && issueDetail.data.issue) {
            console.log(`Issue: ${issueDetail.data.issue.title}`);
        }
    }
    
    // Test 6: Get district stats
    console.log('\n✅ TEST 6: LOAD DISTRICT STATS');
    console.log('─'.repeat(50));
    const districtStats = await makeRequest('GET', '/api/district/stats?district=Mumbai');
    console.log(`District Stats Response: ${districtStats.time}ms ${districtStats.success ? '✅' : '❌'}`);
    
    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Login: ${loginResult.time}ms`);
    console.log(`Dashboard (10 issues): ${issuesPage1.time}ms`);
    console.log(`Load More (15 issues): ${issuesPage2.time}ms`);
    console.log(`India Feed (20 issues): ${indiaFeed.time}ms`);
    if (issuesPage1.success && issuesPage1.data.issues && issuesPage1.data.issues.length > 0) {
        const issueId = issuesPage1.data.issues[0]._id;
        const issueDetail = await makeRequest('GET', `/api/issues/${issueId}`);
        console.log(`Issue Details: ${issueDetail.time}ms`);
    }
    
    console.log('\n✨ All tests completed!');
    process.exit(0);
}

// Wait for server to be ready
setTimeout(runTests, 2000);
