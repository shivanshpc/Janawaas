const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');
const Upvote = require(path.join(__dirname, '..', 'models', 'Upvote'));

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const conn = mongoose.connection;
    const db = conn.db;
    const coll = db.collection('upvotes');

    try {
        const count = await coll.countDocuments();
        console.log('Collection upvotes count:', count);

        const docs = await coll.find({}).limit(10).toArray();
        console.log('Sample docs (up to 10):', docs);

        const indexes = await coll.indexes();
        console.log('Indexes:', indexes);

        const nullMatches = await coll.find({ $or: [ { issueId: null }, { userId: null }, { issue_id: null }, { user_id: null } ] }).toArray();
        console.log('Null/missing-field matches count:', nullMatches.length);
        if (nullMatches.length > 0) console.log(nullMatches);
    } catch (err) {
        console.error('Error inspecting collection:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
