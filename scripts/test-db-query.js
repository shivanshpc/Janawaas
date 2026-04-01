const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('✓ Connected to MongoDB');
    const User = require('./server/models/User');
    
    // Test 1: Simple findOne with email
    console.log('\nTest 1: Find user by email');
    const start1 = Date.now();
    try {
        const user = await User.findOne({ email: 'citizen@gmail.com' });
        console.log(`✓ Query completed in ${Date.now() - start1}ms`);
        console.log('User found:', user ? 'Yes (' + user.displayName + ')' : 'No');
    } catch (err) {
        console.error('❌ Query error:', err.message);
    }
    
    // Test 2: findOne with lean
    console.log('\nTest 2: Find user with lean()');
    const start2 = Date.now();
    try {
        const user = await User.findOne({ email: 'citizen@gmail.com' }).lean();
        console.log(`✓ Query completed in ${Date.now() - start2}ms`);
        console.log('User found:', user ? 'Yes' : 'No');
    } catch (err) {
        console.error('❌ Query error:', err.message);
    }
    
    // Test 3: Check indexes
    console.log('\nTest 3: Check User collection indexes');
    try {
        const indexes = await User.collection.getIndexes();
        console.log('Indexes found:');
        Object.keys(indexes).forEach(idx => {
            console.log('  -', idx, ':', JSON.stringify(indexes[idx]));
        });
    } catch (err) {
        console.error('❌ Index error:', err.message);
    }
    
    process.exit(0);
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
