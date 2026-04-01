const mongoose = require('mongoose');

const issueFollowerSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure a user can only follow an issue once
issueFollowerSchema.index({ issueId: 1, userId: 1 }, { unique: true });
issueFollowerSchema.index({ userId: 1 });
issueFollowerSchema.index({ issueId: 1 });
issueFollowerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('IssueFollower', issueFollowerSchema);
