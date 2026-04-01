const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        required: true
    },
    filedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ['declined_unsatisfied', 'no_acceptance_72h', 'no_update_72h']
    },
    description: {
        type: String,
        maxlength: 1000
    },
    status: {
        type: String,
        enum: ['pending', 'submitted', 'responded', 'closed'],
        default: 'pending'
    },
    complaintReferenceNumber: {
        type: String,
        unique: true,
        sparse: true
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

// Generate reference number before saving
complaintSchema.pre('save', async function(next) {
    if (!this.complaintReferenceNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const random = Math.floor(1000 + Math.random() * 9000);
        this.complaintReferenceNumber = `COMP-${year}${month}-${random}`;
    }
    this.updatedAt = Date.now();
    next();
});

// Create indexes
complaintSchema.index({ issueId: 1 });
complaintSchema.index({ filedBy: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ complaintReferenceNumber: 1 }, { unique: true });
complaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
