const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Issue = require('../models/Issue');
const Comment = require('../models/Comment');
const Upvote = require('../models/Upvote');
const Authority = require('../models/Authority');
const { authenticate, optionalAuth } = require('../middleware/auth');

const Complaint = require('../models/Complaint');

// Get user profile by username
router.get('/:username', optionalAuth, async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        
        // Find user by username
        const user = await User.findOne({ username })
            .select('-passwordHash');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get issues reported by user
        const issues = await Issue.find({ reportedBy: user._id })
            .sort({ createdAt: -1 })
            .select('title description category district state status upvoteCount createdAt images severityScore')
            .limit(50)
            .lean();

        // Get Complaints filed by user (only if it's the current user's profile)
        let complaints = [];
        if (req.user && req.user._id.toString() === user._id.toString()) {
            complaints = await Complaint.find({ filedBy: user._id })
                .populate('issueId', 'title status district state')
                .sort({ createdAt: -1 })
                .lean();
        }

        // Get comments by user
        const comments = await Comment.find({ authorId: user._id })
            .sort({ createdAt: -1 })
            .populate('issueId', 'title _id')
            .limit(50)
            .lean();

        // Get comment count
        const commentCount = await Comment.countDocuments({ authorId: user._id });

        // Get upvote count
        const upvoteCount = await Upvote.countDocuments({ userId: user._id });

        // Calculate additional stats
        const resolvedIssues = await Issue.countDocuments({ 
            reportedBy: user._id, 
            status: 'resolved' 
        });

        const totalIssuesReported = await Issue.countDocuments({ 
            reportedBy: user._id 
        });

        res.json({ 
            user: {
                displayName: user.displayName,
                username: user.username,
                email: user.email,
                district: user.district,
                state: user.state,
                role: user.role,
                reputationScore: user.reputationScore,
                isAadhaarVerified: user.isAadhaarVerified,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            },
            issues,
            complaints,
            stats: {
                issuesReported: totalIssuesReported,
                issuesResolved: resolvedIssues,
                commentsPosted: commentCount,
                upvotesGiven: upvoteCount,
                reputationScore: user.reputationScore
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Error fetching user' });
    }
});

// Update user profile
router.patch('/me', authenticate, async (req, res) => {
    try {
        const { name, phone, avatar } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (avatar) updates.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            message: 'Profile updated successfully',
            user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Error updating profile' });
    }
});

// Get authority profile by user ID
router.get('/:userId/authority', authenticate, async (req, res) => {
    try {
        const authority = await Authority.findOne({ userId: req.params.userId })
            .populate('userId', 'name email');

        if (!authority) {
            return res.status(404).json({ error: 'Authority profile not found' });
        }

        res.json({ authority });
    } catch (error) {
        console.error('Get authority profile error:', error);
        res.status(500).json({ error: 'Error fetching authority profile' });
    }
});

module.exports = router;
