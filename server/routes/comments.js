const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Issue = require('../models/Issue');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Notification = require('../models/Notification');
const { authenticate, requireVerification, optionalAuth } = require('../middleware/auth');
const { moderateContent } = require('../utils/moderation');
const { notifyCommentReply, notifyIssueComment } = require('../utils/notifications');

// Helper function to extract @mentions from text
function extractMentions(text) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1]); // Extract username without @
    }
    
    return [...new Set(mentions)]; // Remove duplicates
}

// Get single comment with thread (parent and replies) - for standalone comment page
router.get('/:commentId', optionalAuth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId)
            .populate('authorId', 'displayName username avatar role')
            .populate('issueId', 'title _id district category status');

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Get parent comment if exists
        let parentComment = null;
        if (comment.parentCommentId) {
            parentComment = await Comment.findById(comment.parentCommentId)
                .populate('authorId', 'displayName username avatar role');
        }

        // Get all replies to this comment
        const replies = await Comment.find({ parentCommentId: comment._id })
            .sort({ createdAt: 1 })
            .populate('authorId', 'displayName username avatar role');

        // Get all comments for the issue to show full context
        const allComments = await Comment.find({ issueId: comment.issueId })
            .sort({ createdAt: 1 })
            .populate('authorId', 'displayName username avatar role');

        res.json({ 
            comment,
            parentComment,
            replies,
            issue: comment.issueId,
            allComments
        });
    } catch (error) {
        console.error('Get comment error:', error);
        res.status(500).json({ error: 'Error fetching comment' });
    }
});

// Get comments for an issue
router.get('/issue/:issueId', async (req, res) => {
    try {
        const comments = await Comment.find({ issueId: req.params.issueId })
            .sort({ createdAt: 1 })
            .populate('authorId', 'name avatar role');

        res.json({ comments });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Error fetching comments' });
    }
});

// Add comment to issue
router.post('/', authenticate, requireVerification, async (req, res) => {
    try {
        const { body, issueId, parentCommentId } = req.body;

        const issue = await Issue.findById(issueId).populate('reportedBy');
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Moderate comment content
        const moderationResult = await moderateContent(body);
        if (moderationResult.isViolation) {
            console.log('Content moderation blocked comment:', moderationResult);
            return res.status(400).json({ 
                error: 'Content Policy Violation',
                message: 'Your comment contains content that violates our community guidelines.',
                reason: moderationResult.reason,
                details: moderationResult.message
            });
        }

        // If parentCommentId is provided, verify it exists
        let parentComment = null;
        if (parentCommentId) {
            parentComment = await Comment.findById(parentCommentId).populate('authorId', 'name');
            if (!parentComment) {
                return res.status(404).json({ error: 'Parent comment not found' });
            }
        }

        const comment = new Comment({
            body,
            authorId: req.user._id,
            issueId,
            parentCommentId: parentCommentId || null
        });

        await comment.save();
        await comment.populate('authorId', 'name avatar role');

        // Send notifications
        if (parentComment) {
            // Reply to a comment - notify the comment author
            await notifyCommentReply(parentComment, comment, issue);
        } else {
            // New comment on issue - notify the issue author
            await notifyIssueComment(issue, comment, req.user);
        }

        // Process @mentions in comment
        const mentions = extractMentions(body);
        const taggedUsers = [];
        
        if (mentions.length > 0) {
            // Find users by username
            const usersToTag = await User.find({
                username: { $in: mentions }
            }).select('_id username displayName');
            
            // Create tags and send notifications
            for (const user of usersToTag) {
                // Don't tag yourself
                if (user._id.toString() === req.user._id.toString()) {
                    continue;
                }
                
                // Create tag record
                try {
                    await Tag.create({
                        issueId: issue._id,
                        commentId: comment._id,
                        taggedUserId: user._id,
                        taggedBy: req.user._id
                    });
                    
                    // Send notification
                    await Notification.create({
                        recipientId: user._id,
                        type: 'tag',
                        title: 'You were mentioned',
                        message: `${req.user.displayName || req.user.username} mentioned you in a comment`,
                        link: `/issue.html?id=${issue._id}`,
                        metadata: {
                            issueId: issue._id,
                            issueTitle: issue.title,
                            commentId: comment._id,
                            commentBody: body.substring(0, 100)
                        }
                    });
                    
                    taggedUsers.push(user.username);
                } catch (tagError) {
                    console.error('Error creating tag:', tagError);
                    // Continue even if tagging fails
                }
            }
        }

        // Emit real-time event for comment
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('issue_comment_added', {
                issueId: issue._id,
                comment: comment
            });
        }

        res.status(201).json({
            message: 'Comment added successfully',
            comment,
            taggedUsers
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Delete comment (author or admin only)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);
        
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Check if user is author or admin
        if (comment.authorId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete this comment' });
        }

        // Delete the comment and all its replies
        await Comment.deleteMany({
            $or: [
                { _id: comment._id },
                { parentCommentId: comment._id }
            ]
        });

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Error deleting comment' });
    }
});

module.exports = router;
