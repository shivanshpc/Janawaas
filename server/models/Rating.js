const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    authorityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority',
        required: true
    },
    ratedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    speedScore: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    efficiencyScore: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    satisfactionScore: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
ratingSchema.index({ issueId: 1 });
ratingSchema.index({ authorityId: 1 });
ratingSchema.index({ ratedBy: 1 });
ratingSchema.index({ issueId: 1, ratedBy: 1 }, { unique: true });
ratingSchema.index({ createdAt: -1 });
ratingSchema.index({ authorityId: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema);
