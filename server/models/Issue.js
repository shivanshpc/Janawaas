const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        maxlength: 2000
    },
    category: {
        type: String,
        required: [true, 'Category is required']
    },
    district: {
        type: String
    },
    state: {
        type: String
    },
    latitude: {
        type: Number
    },
    longitude: {
        type: Number
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'in_progress', 'resolved', 'denied'],
        default: 'pending'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedAuthority: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority'
    },
    upvoteCount: {
        type: Number,
        default: 0
    },
    severityScore: {
        type: Number,
        default: 0
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    isPanIndiaFeatured: {
        type: Boolean,
        default: false
    },
    isPetition: {
        type: Boolean,
        default: false
    },
    petitionCreatedAt: {
        type: Date,
        default: null
    },
    isFlagged: {
        type: Boolean,
        default: false
    },
    flagReason: {
        type: String,
        default: null
    },
    deadline: {
        type: Date,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    isEscalated: {
        type: Boolean,
        default: false
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    viewCount: {
        type: Number,
        default: 0
    },
    draftRemarks: {
        type: String,
        default: ""
    },
    publishedRemarks: {
        type: String,
        default: ""
    },
    citizenUpdates: [{
        content: {
            type: String,
            required: [true, 'Update content is required'],
            maxlength: 1000
        },
        images: [{
            url: { type: String, required: true },
            publicId: { type: String, required: true }
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    mergedInto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        default: null
    },
    isMerged: {
        type: Boolean,
        default: false
    },
    pendingMergeRequest: {
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'Authority' },
        to: { type: mongoose.Schema.Types.ObjectId, ref: 'Authority' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: null }
    },
    isDissatisfied: {
        type: Boolean,
        default: false
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
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance (duplicates removed for efficiency)
issueSchema.index({ title: 'text', description: 'text' });
issueSchema.index({ category: 1 });
issueSchema.index({ district: 1 });
issueSchema.index({ state: 1 });
issueSchema.index({ status: 1 });
issueSchema.index({ reportedBy: 1 });
issueSchema.index({ assignedAuthority: 1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ updatedAt: -1 }); // Added for efficient sorting by last update
issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ state: 1, district: 1, status: 1 }); // Enhanced for state-district-status hierarchical search
issueSchema.index({ state: 1, category: 1 }); // Added for state-wise category filtering
issueSchema.index({ isFeatured: 1, createdAt: -1 });
issueSchema.index({ isPanIndiaFeatured: 1, createdAt: -1 });
issueSchema.index({ isFlagged: 1 });
issueSchema.index({ isPetition: 1, petitionCreatedAt: -1 });
issueSchema.index({ upvoteCount: -1 });
issueSchema.index({ viewCount: -1 });
issueSchema.index({ severityScore: -1 });
issueSchema.index({ location: '2dsphere' }); // Added for geospatial queries if location is stored as Point
issueSchema.index({ district: 1, category: 1 }); // Added for district-wise category filtering
issueSchema.index({ reportedBy: 1, createdAt: -1 }); // Added for user's own issues feed

// Method to calculate severity score
issueSchema.methods.calculateSeverityScore = async function() {
    // Calculate days open
    const now = new Date();
    const created = new Date(this.createdAt);
    const daysOpen = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    
    // Category weights
    const categoryWeights = {
        'corruption': 20,
        'health': 15,
        'sanitation': 10,
        'garbage': 8,
        'water': 7,
        'drainage': 7,
        'roads': 6,
        'electricity': 6,
        'streetlight': 5,
        'parks': 4,
        'other': 5
    };
    
    const categoryWeight = categoryWeights[this.category.toLowerCase()] || 5;
    
    // Media bonus (if images exist)
    const mediaBonus = (this.images && this.images.length > 0) ? 3 : 0;
    
    // Verified reporter bonus
    let verifiedBonus = 0;
    if (this.reportedBy) {
        // If reportedBy is populated, use it directly
        if (this.reportedBy.isAadhaarVerified || this.reportedBy.isVerified) {
            verifiedBonus = 3;
        } else if (typeof this.reportedBy === 'string' || this.reportedBy instanceof mongoose.Types.ObjectId) {
            // If not populated, we need to fetch it
            const User = mongoose.model('User');
            const user = await User.findById(this.reportedBy);
            if (user && (user.isAadhaarVerified || user.isVerified)) {
                verifiedBonus = 3;
            }
        }
    }
    
    // Calculate severity score
    const severityScore = 
        (this.upvoteCount * 2) + 
        (daysOpen * 1.5) + 
        categoryWeight + 
        mediaBonus +
        verifiedBonus;
    
    return Math.round(severityScore * 10) / 10; // Round to 1 decimal place
};

// Pre-save hook to update severity score
issueSchema.pre('save', async function(next) {
    if (this.isModified('upvoteCount') || this.isNew) {
        this.severityScore = await this.calculateSeverityScore();
    }
    next();
});

module.exports = mongoose.model('Issue', issueSchema);
