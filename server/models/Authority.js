const mongoose = require('mongoose');

const authoritySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    designation: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    jurisdictionDistrict: {
        type: String,
        trim: true
    },
    jurisdictionState: {
        type: String,
        trim: true
    },
    issuesAccepted: {
        type: Number,
        default: 0
    },
    issuesResolved: {
        type: Number,
        default: 0
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    areaOfExpertise: {
        type: String,
        trim: true,
        enum: [
            'Roads & Potholes',
            'Sanitation & Waste',
            'Water Supply',
            'Sewer & Drainage',
            'Electricity',
            'Flood Control',
            'Urban Planning',
            'Traffic Management',
            'Public Parks & Horticulture',
            'Street Lighting',
            'Others'
        ],
        default: 'Others'
    },
    badge: {
        type: String,
        enum: ['gold', 'silver', 'bronze', 'none'],
        default: 'none'
    },
    about: {
        type: String,
        trim: true,
        default: 'This authority is dedicated to serving the citizens and resolving issues in their jurisdiction.'
    },
    description: {
        type: String,
        trim: true,
        default: 'Responsible for maintaining and improving public infrastructure and services.'
    },
    location: {
        type: String,
        trim: true
    },
    contactEmail: {
        type: String,
        trim: true
    },
    contactPhone: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    mergedAuthorities: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority'
    }],
    pendingMergeRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance (note: userId already has unique index from schema definition)
authoritySchema.index({ jurisdictionDistrict: 1 });
authoritySchema.index({ jurisdictionState: 1 });
authoritySchema.index({ department: 1 });
authoritySchema.index({ areaOfExpertise: 1 });
authoritySchema.index({ issuesAccepted: -1 });
authoritySchema.index({ issuesResolved: -1 });
authoritySchema.index({ averageRating: -1 });
authoritySchema.index({ badge: 1 });
authoritySchema.index({ jurisdictionDistrict: 1, areaOfExpertise: 1 });
authoritySchema.index({ jurisdictionState: 1, jurisdictionDistrict: 1 }); // Added for efficient hierarchical location search
authoritySchema.index({ designation: 1 }); // Added for searching by role (e.g., "Electricity Authority")
authoritySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Authority', authoritySchema);
