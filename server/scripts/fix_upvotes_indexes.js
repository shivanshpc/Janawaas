// Script to drop legacy snake_case indexes on upvotes collection
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const db = mongoose.connection.db;
    const coll = db.collection('upvotes');

    try {
        const indexes = await coll.indexes();
        console.log('Existing indexes:');
        indexes.forEach(i => console.log('-', i.name));

        const toDrop = indexes
            .map(i => i.name)
            .filter(name => name.includes('issue_id') || name.includes('user_id'))
            .filter(name => !name.includes('issueId') && !name.includes('userId'));

        if (toDrop.length === 0) {
            console.log('No legacy indexes to drop.');
        } else {
            for (const name of toDrop) {
                try {
                    await coll.dropIndex(name);
                    console.log('Dropped index:', name);
                } catch (err) {
                    console.error('Failed to drop index', name, err.message);
                }
            }
        }
    } catch (err) {
        console.error('Error inspecting/dropping indexes:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
