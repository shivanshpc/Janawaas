const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const Upvote = require('../models/Upvote');
const Comment = require('../models/Comment');
const SocialShare = require('../models/SocialShare');
const { optionalAuth } = require('../middleware/auth');

// Helper function to format issue for anonymous display
function formatIssueForDisplay(issue, currentUserId = null) {
    const issueObj = issue.toObject ? issue.toObject() : issue;
    
    if (issueObj.isAnonymous) {
        const canSeeReporter = currentUserId && (
            issueObj.reportedBy?._id?.toString() === currentUserId.toString() ||
            issueObj.reportedBy?.toString() === currentUserId.toString()
        );
        
        if (!canSeeReporter) {
            issueObj.reportedBy = {
                displayName: 'Anonymous Citizen',
                username: 'anonymous',
                name: 'Anonymous Citizen'
            };
        }
    }
    
    return issueObj;
}

// GET /api/feed/trending - Get trending issues
router.get('/trending', optionalAuth, async (req, res) => {
    try {
        const { limit = 20, page = 1 } = req.query;
        const limitNum = parseInt(limit);
        const pageNum = parseInt(page);
        const skip = (pageNum - 1) * limitNum;

        // Calculate time threshold (24 hours ago)
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        // Get all issues
        const issues = await Issue.find()
            .populate('reportedBy', 'displayName username name avatar')
            .populate('assignedAuthority', 'name')
            .lean();

        // Calculate trending score for each issue
        const issuesWithScores = await Promise.all(issues.map(async (issue) => {
            // Count upvotes in last 24h
            const recentUpvotes = await Upvote.countDocuments({
                issueId: issue._id,
                createdAt: { $gte: twentyFourHoursAgo }
            });

            // Count comments in last 24h
            const recentComments = await Comment.countDocuments({
                issueId: issue._id,
                createdAt: { $gte: twentyFourHoursAgo }
            });

            // Count shares in last 24h
            const recentShares = await SocialShare.countDocuments({
                issueId: issue._id,
                createdAt: { $gte: twentyFourHoursAgo }
            });

            // Calculate trending score
            const trendScore = (recentUpvotes * 2) + recentComments + recentShares;

            return {
                ...issue,
                trendScore,
                recentActivity: {
                    upvotes: recentUpvotes,
                    comments: recentComments,
                    shares: recentShares
                }
            };
        }));

        // Filter issues with score > 0 and sort by trending score
        const trendingIssues = issuesWithScores
            .filter(issue => issue.trendScore > 0)
            .sort((a, b) => b.trendScore - a.trendScore)
            .slice(skip, skip + limitNum);

        // Format for anonymous display
        const formattedIssues = trendingIssues.map(issue => 
            formatIssueForDisplay(issue, req.user?._id)
        );

        const total = issuesWithScores.filter(issue => issue.trendScore > 0).length;

        res.json({
            issues: formattedIssues,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: skip + trendingIssues.length < total
            }
        });
    } catch (error) {
        console.error('Get trending issues error:', error);
        res.status(500).json({ error: 'Error fetching trending issues' });
    }
});

module.exports = router;
