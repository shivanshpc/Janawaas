const Notification = require('../models/Notification');

/**
 * Create a notification for a user
 * @param {Object} params - Notification parameters
 * @param {String} params.userId - User to notify
 * @param {String} params.type - Type of notification (issue_accepted, issue_update, comment_reply)
 * @param {String} params.title - Notification title
 * @param {String} params.message - Notification message
 * @param {Object} params.metadata - Additional metadata (issueId, commentId, etc.)
 */
async function createNotification({ userId, type, title, message, metadata = {} }) {
    try {
        const notification = new Notification({
            userId,
            type,
            title,
            message,
            metadata
        });
        
        await notification.save();

        // Real-time emit
        const { getIO } = require('./socket');
        const io = getIO();
        if (io) {
            io.to(`user_${userId}`).emit('notification', {
                notification: notification.toObject(),
                unreadCount: await Notification.countDocuments({ userId, isRead: false })
            });
        }

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

/**
 * Notify user when their issue is accepted
 */
async function notifyIssueAccepted(issue, authority) {
    try {
        await createNotification({
            userId: issue.reportedBy,
            type: 'issue_accepted',
            title: 'Issue Accepted',
            message: `Your issue "${issue.title}" has been accepted by ${authority.name}`,
            metadata: {
                issueId: issue._id,
                authorityId: authority._id,
                issueTitle: issue.title
            }
        });
    } catch (error) {
        console.error('Error notifying issue accepted:', error);
    }
}

/**
 * Notify user when their issue status is updated
 */
async function notifyIssueStatusUpdate(issue, newStatus, authority) {
    try {
        const statusMessages = {
            'in_progress': 'is now in progress',
            'resolved': 'has been resolved',
            'denied': 'has been denied'
        };

        const message = statusMessages[newStatus] || `status has been updated to ${newStatus}`;
        
        await createNotification({
            userId: issue.reportedBy,
            type: 'issue_update',
            title: 'Issue Status Updated',
            message: `Your issue "${issue.title}" ${message}`,
            metadata: {
                issueId: issue._id,
                status: newStatus,
                authorityId: authority ? authority._id : null,
                issueTitle: issue.title
            }
        });
    } catch (error) {
        console.error('Error notifying issue update:', error);
    }
}

/**
 * Notify user when someone replies to their comment
 */
async function notifyCommentReply(originalComment, newComment, issue) {
    try {
        // Don't notify if user is replying to their own comment
        if (originalComment.authorId.toString() === newComment.authorId.toString()) {
            return;
        }

        await createNotification({
            userId: originalComment.authorId,
            type: 'comment_reply',
            title: 'New Reply to Your Comment',
            message: `${newComment.authorId.name} replied to your comment on "${issue.title}"`,
            metadata: {
                issueId: issue._id,
                commentId: newComment._id,
                parentCommentId: originalComment._id,
                issueTitle: issue.title
            }
        });
    } catch (error) {
        console.error('Error notifying comment reply:', error);
    }
}

/**
 * Notify issue author when someone comments on their issue
 */
async function notifyIssueComment(issue, comment, commenter) {
    try {
        // Don't notify if author is commenting on their own issue
        if (issue.reportedBy.toString() === comment.authorId.toString()) {
            return;
        }

        await createNotification({
            userId: issue.reportedBy,
            type: 'comment_reply',
            title: 'New Comment on Your Issue',
            message: `${commenter.name} commented on your issue "${issue.title}"`,
            metadata: {
                issueId: issue._id,
                commentId: comment._id,
                issueTitle: issue.title
            }
        });
    } catch (error) {
        console.error('Error notifying issue comment:', error);
    }
}

module.exports = {
    createNotification,
    notifyIssueAccepted,
    notifyIssueStatusUpdate,
    notifyCommentReply,
    notifyIssueComment
};
