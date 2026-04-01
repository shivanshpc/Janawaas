const mongoose = require('mongoose');

const issueUpdateSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority',
        required: true
    },
    content: {
        type: String,
        required: [true, 'Update content is required'],
        maxlength: 1000
    },
    stageKey: {
        type: String,
        enum: ['planning', 'permissions', 'team_creation', 'physical_work', 'completion'],
        default: 'planning'
    },
    stageTitle: {
        type: String,
        trim: true,
        maxlength: 120,
        default: null
    },
    progressPercent: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        }
    }],
    mediaUrl: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
issueUpdateSchema.index({ issueId: 1, createdAt: -1 });
issueUpdateSchema.index({ postedBy: 1 });

module.exports = mongoose.model('IssueUpdate', issueUpdateSchema);
