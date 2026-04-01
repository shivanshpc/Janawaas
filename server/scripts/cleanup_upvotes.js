// Cleanup malformed upvotes (userId or issueId null)
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

// Ensure models can be required from server/ directory
const Upvote = require(path.join(__dirname, '..', 'models', 'Upvote'));

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    console.log('Connecting to', mongoUri);

    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        const result = await Upvote.deleteMany({ $or: [ { userId: null }, { issueId: null } ] });
        console.log('Deleted malformed upvotes:', result.deletedCount);
    } catch (err) {
        console.error('Error deleting malformed upvotes:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
