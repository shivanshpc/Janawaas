const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true,
        unique: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance (note: issueId already has unique index from schema definition)
checklistSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Checklist', checklistSchema);
