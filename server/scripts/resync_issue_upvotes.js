// Resync issue.upvoteCount for a specific issue or all issues
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');
// Ensure dependent models are registered before Issue methods are used
require(path.join(__dirname, '..', 'models', 'User'));
const Issue = require(path.join(__dirname, '..', 'models', 'Issue'));
const Upvote = require(path.join(__dirname, '..', 'models', 'Upvote'));

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const args = process.argv.slice(2);
    const issueId = args[0];

    try {
        if (issueId) {
            const count = await Upvote.countDocuments({ issueId });
            const issue = await Issue.findById(issueId);
            if (!issue) {
                console.error('Issue not found:', issueId);
            } else {
                issue.upvoteCount = count;
                issue.severityScore = await issue.calculateSeverityScore();
                await issue.save();
                console.log(`Resynced issue ${issueId}: upvoteCount=${count}`);
            }
        } else {
            // Resync all issues
            const cursor = Issue.find().cursor();
            let updated = 0;
            for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
                const id = doc._id;
                const count = await Upvote.countDocuments({ issueId: id });
                if (doc.upvoteCount !== count) {
                    doc.upvoteCount = count;
                    doc.severityScore = await doc.calculateSeverityScore();
                    await doc.save();
                    updated++;
                    console.log(`Resynced ${id}: upvoteCount=${count}`);
                }
            }
            console.log(`Resynced ${updated} issues`);
        }
    } catch (err) {
        console.error('Error resyncing upvotes:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
