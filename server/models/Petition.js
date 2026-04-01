const mongoose = require('mongoose');

const petitionSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['pending', 'submitted', 'under_review', 'accepted', 'rejected'],
        default: 'pending'
    },
    submittedTo: {
        type: String,
        default: null
    },
    upvoteCountAtCreation: {
        type: Number,
        default: 0
    },
    petitionDocument: {
        title: String,
        description: String,
        district: String,
        state: String,
        category: String,
        upvoteCount: Number,
        dateReported: Date
    },
    submissionDate: {
        type: Date,
        default: null
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

// Indexes (note: issueId already has unique index from schema definition)
petitionSchema.index({ status: 1 });
petitionSchema.index({ createdAt: -1 });
petitionSchema.index({ 'petitionDocument.state': 1, 'petitionDocument.district': 1 }); // Added for state/district petition feed
petitionSchema.index({ 'petitionDocument.category': 1 }); // Added for category-wise petition search

// Update timestamp on save
petitionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Petition', petitionSchema);
