const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'issue_accepted',
            'issue_denied',
            'issue_resolved',
            'issue_deleted',
            'issue_flagged',
            'issue_featured',
            'issue_unfeatured',
            'user_banned',
            'user_unbanned',
            'user_verified',
            'user_unverified',
            'user_deleted',
            'deadline_set',
            'deadline_escalated',
            'rating_submitted',
            'badge_updated'
        ]
    },
    entityType: {
        type: String,
        required: true,
        enum: ['Issue', 'User', 'Authority', 'Rating', 'Comment']
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
