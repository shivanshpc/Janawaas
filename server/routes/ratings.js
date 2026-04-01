const express = require('express');
const router = express.Router();
const Rating = require('../models/Rating');
const Issue = require('../models/Issue');
const Authority = require('../models/Authority');
const { authenticate } = require('../middleware/auth');
const { updateAuthorityBadge } = require('../utils/badges');
const { createAuditLog } = require('../utils/auditLog');

// POST /api/ratings - Submit a rating for a resolved issue
router.post('/', authenticate, async (req, res) => {
    try {
        const { issueId, speedScore, efficiencyScore, satisfactionScore, comment } = req.body;

        // Validate required fields
        if (!issueId || !speedScore || !efficiencyScore || !satisfactionScore) {
            return res.status(400).json({ error: 'Issue ID and all rating scores are required' });
        }

        // Validate score ranges
        if (speedScore < 1 || speedScore > 5 || efficiencyScore < 1 || efficiencyScore > 5 || satisfactionScore < 1 || satisfactionScore > 5) {
            return res.status(400).json({ error: 'All scores must be between 1 and 5' });
        }

        // Find the issue
        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Check if issue is resolved
        if (issue.status !== 'resolved') {
            return res.status(400).json({ error: 'Can only rate resolved issues' });
        }

        // Check if issue has an assigned authority
        if (!issue.assignedAuthority) {
            return res.status(400).json({ error: 'Issue has no assigned authority to rate' });
        }

        // Check if user is the issue reporter
        if (issue.reportedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the issue reporter can rate the authority' });
        }

        // Check if user has already rated this issue
        const existingRating = await Rating.findOne({ issueId, ratedBy: req.user._id });
        if (existingRating) {
            return res.status(400).json({ error: 'You have already rated this issue' });
        }

        // Create rating
        const rating = new Rating({
            issueId,
            authorityId: issue.assignedAuthority,
            ratedBy: req.user._id,
            speedScore,
            efficiencyScore,
            satisfactionScore,
            comment: comment || ''
        });

        await rating.save();

        // Update authority's average rating
        const allRatings = await Rating.find({ authorityId: issue.assignedAuthority });
        const totalRatings = allRatings.length;
        
        if (totalRatings > 0) {
            const averageRating = allRatings.reduce((sum, r) => {
                return sum + (r.speedScore + r.efficiencyScore + r.satisfactionScore) / 3;
            }, 0) / totalRatings;
            
            // Update authority's average rating
            const authority = await Authority.findById(issue.assignedAuthority);
            if (authority) {
                authority.averageRating = Math.round(averageRating * 100) / 100; // Round to 2 decimal places
                await authority.save();
                
                // Update badge
                await updateAuthorityBadge(issue.assignedAuthority);
            }
        }

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'rating_submitted',
            entityType: 'Rating',
            entityId: rating._id,
            metadata: { 
                issueId: issue._id, 
                issueTitle: issue.title,
                authorityId: issue.assignedAuthority,
                overallScore: (speedScore + efficiencyScore + satisfactionScore) / 3
            }
        });

        res.status(201).json({ 
            message: 'Rating submitted successfully',
            rating 
        });
    } catch (error) {
        console.error('Error creating rating:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/ratings/issue/:issueId - Get rating for a specific issue
router.get('/issue/:issueId', async (req, res) => {
    try {
        const { issueId } = req.params;

        const rating = await Rating.findOne({ issueId })
            .populate('ratedBy', 'name')
            .populate('authorityId', 'name');

        if (!rating) {
            return res.status(404).json({ error: 'No rating found for this issue' });
        }

        res.json({ rating });
    } catch (error) {
        console.error('Error fetching rating:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/ratings/authority/:authorityId - Get all ratings for an authority
router.get('/authority/:authorityId', async (req, res) => {
    try {
        const { authorityId } = req.params;

        const ratings = await Rating.find({ authorityId })
            .populate('issueId', 'title')
            .populate('ratedBy', 'name')
            .sort({ createdAt: -1 });

        // Calculate average scores
        const totalRatings = ratings.length;
        if (totalRatings === 0) {
            return res.json({ 
                ratings: [],
                averages: null
            });
        }

        const averages = {
            speed: ratings.reduce((sum, r) => sum + r.speedScore, 0) / totalRatings,
            efficiency: ratings.reduce((sum, r) => sum + r.efficiencyScore, 0) / totalRatings,
            satisfaction: ratings.reduce((sum, r) => sum + r.satisfactionScore, 0) / totalRatings,
            overall: ratings.reduce((sum, r) => sum + (r.speedScore + r.efficiencyScore + r.satisfactionScore) / 3, 0) / totalRatings
        };

        res.json({ 
            ratings,
            averages,
            totalRatings
        });
    } catch (error) {
        console.error('Error fetching authority ratings:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
