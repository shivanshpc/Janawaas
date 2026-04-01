const mongoose = require('mongoose');

const upvoteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
upvoteSchema.index({ userId: 1 });
upvoteSchema.index({ issueId: 1 });
upvoteSchema.index({ createdAt: -1 });

// Compound unique index to ensure one upvote per user per issue
upvoteSchema.index({ userId: 1, issueId: 1 }, { unique: true });

module.exports = mongoose.model('Upvote', upvoteSchema);
