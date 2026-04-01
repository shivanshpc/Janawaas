const mongoose = require('mongoose');

const authorityApplicationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    designation: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        required: true,
        trim: true
    },
    jurisdictionDistrict: {
        type: String,
        required: true,
        trim: true
    },
    jurisdictionState: {
        type: String,
        required: true,
        trim: true
    },
    officialEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    governmentIdNumber: {
        type: String,
        required: true,
        trim: true
    },
    appointmentLetterUrl: {
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
    rejectionReason: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    reviewedAt: {
        type: Date
    }
});

// Indexes for performance
authorityApplicationSchema.index({ userId: 1 });
authorityApplicationSchema.index({ status: 1 });
authorityApplicationSchema.index({ createdAt: -1 });
authorityApplicationSchema.index({ status: 1, createdAt: -1 });
authorityApplicationSchema.index({ reviewedBy: 1 });

module.exports = mongoose.model('AuthorityApplication', authorityApplicationSchema);
