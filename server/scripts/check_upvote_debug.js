// Diagnostic script to inspect issue and upvote records
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

const Issue = require(path.join(__dirname, '..', 'models', 'Issue'));
const Upvote = require(path.join(__dirname, '..', 'models', 'Upvote'));

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node check_upvote_debug.js <issueId> <userId>');
        process.exit(1);
    }

    const [issueId, userId] = args;
    console.log('Inspecting issueId:', issueId, 'userId:', userId);

    try {
        const issue = await Issue.findById(issueId).lean();
        if (!issue) {
            console.log('Issue not found');
        } else {
            console.log('Issue _id:', issue._id.toString());
            console.log('issue.upvoteCount:', issue.upvoteCount);
            console.log('issue.isPetition:', issue.isPetition);
        }

        const totalUpvotes = await Upvote.countDocuments({ issueId });
        console.log('Total Upvote documents for issue:', totalUpvotes);

        const userUpvote = await Upvote.findOne({ issueId, userId }).lean();
        console.log('Upvote by user exists:', !!userUpvote);
        if (userUpvote) console.log('User upvote _id:', userUpvote._id.toString(), 'createdAt:', userUpvote.createdAt);

        const nullUpvotes = await Upvote.find({ $or: [ { issueId: null }, { userId: null } ] }).lean();
        console.log('Upvotes with null fields count:', nullUpvotes.length);
        if (nullUpvotes.length > 0) console.log(nullUpvotes.slice(0,5));
    } catch (err) {
        console.error('Error during inspection:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
