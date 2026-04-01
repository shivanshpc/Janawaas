const mongoose = require('mongoose');

const identityVerificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    documentType: {
        type: String,
        enum: ['voter_id', 'pan_card', 'driving_license', 'other'],
        required: true
    },
    documentUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewNote: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    reviewedAt: {
        type: Date
    }
});

// Indexes
identityVerificationSchema.index({ userId: 1 });
identityVerificationSchema.index({ status: 1 });
identityVerificationSchema.index({ userId: 1, status: 1 });
identityVerificationSchema.index({ createdAt: -1 });
identityVerificationSchema.index({ reviewedBy: 1 });

module.exports = mongoose.model('IdentityVerification', identityVerificationSchema);
