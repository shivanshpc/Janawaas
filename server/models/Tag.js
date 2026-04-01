const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },
    taggedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    taggedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
tagSchema.index({ issueId: 1 });
tagSchema.index({ taggedUserId: 1 });
tagSchema.index({ commentId: 1 });

module.exports = mongoose.model('Tag', tagSchema);
