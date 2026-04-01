// Test inserting an Upvote document for given issueId and userId
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');
const Upvote = require(path.join(__dirname, '..', 'models', 'Upvote'));

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node test_insert_upvote.js <issueId> <userId>');
        process.exit(1);
    }

    const [issueId, userId] = args;
    console.log('Attempting to insert upvote for issueId:', issueId, 'userId:', userId);

    let created = null;
    try {
        created = await Upvote.create({ issueId, userId });
        console.log('Insert succeeded:', created._id.toString());
    } catch (err) {
        console.error('Insert error:', err && err.code, err && err.message);
    }

    try {
        if (created) {
            await Upvote.deleteOne({ _id: created._id });
            console.log('Cleaned up inserted upvote');
        }
    } catch (e) {
        console.error('Cleanup error:', e);
    }

    await mongoose.disconnect();
}

main();
