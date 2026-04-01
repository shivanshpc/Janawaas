// JanAwaaz Platform - Mongoose Models Index
// Export all models for easy import

module.exports = {
    User: require('./User'),
    Issue: require('./Issue'),
    Comment: require('./Comment'),
    Upvote: require('./Upvote'),
    Authority: require('./Authority'),
    AuthorityApplication: require('./AuthorityApplication'),
    Checklist: require('./Checklist'),
    ChecklistItem: require('./ChecklistItem'),
    Rating: require('./Rating'),
    Notification: require('./Notification'),
    Petition: require('./Petition'),
    SocialShare: require('./SocialShare'),
    AuditLog: require('./AuditLog'),
    IssueUpdate: require('./IssueUpdate'),
    IssueFollower: require('./IssueFollower'),
    Tag: require('./Tag'),
    IdentityVerification: require('./IdentityVerification'),
    Complaint: require('./Complaint')
};
