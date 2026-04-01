const mongoose = require('mongoose');

const socialShareSchema = new mongoose.Schema({
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
    platform: {
        type: String,
        required: true,
        enum: ['twitter', 'whatsapp', 'facebook', 'linkedin']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
socialShareSchema.index({ issueId: 1 });
socialShareSchema.index({ userId: 1 });
socialShareSchema.index({ platform: 1 });
socialShareSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SocialShare', socialShareSchema);
