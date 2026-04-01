const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    body: {
        type: String,
        required: [true, 'Comment body is required'],
        trim: true
    },
    parentCommentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },
    upvoteCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
commentSchema.index({ issueId: 1 });
commentSchema.index({ authorId: 1 });
commentSchema.index({ issueId: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1 });
commentSchema.index({ parentCommentId: 1 });

// Update updatedAt on save
commentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Comment', commentSchema);
