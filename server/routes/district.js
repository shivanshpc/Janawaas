const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const { optionalAuth } = require('../middleware/auth');

// GET /api/district/stats - Get district statistics
router.get('/stats', optionalAuth, async (req, res) => {
    try {
        const { district } = req.query;

        if (!district) {
            return res.status(400).json({ error: 'District parameter is required' });
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Optimized single aggregation for all district stats
        const statsAggregation = await Issue.aggregate([
            { $match: { district } },
            {
                $facet: {
                    counts: [
                        {
                            $group: {
                                _id: null,
                                totalIssues: { $sum: 1 },
                                totalResolvedIssues: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                                pendingIssues: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                                issuesInProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                                totalOpenIssues: { $sum: { $cond: [{ $in: ['$status', ['pending', 'accepted', 'in_progress']] }, 1, 0] } }
                            }
                        }
                    ],
                    resolvedLast30: [
                        {
                            $match: {
                                status: 'resolved',
                                resolvedAt: { $gte: thirtyDaysAgo }
                            }
                        },
                        { $count: 'count' }
                    ],
                    resolutionTime: [
                        {
                            $match: {
                                status: 'resolved',
                                resolvedAt: { $exists: true },
                                createdAt: { $exists: true }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgTimeMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } }
                            }
                        }
                    ]
                }
            }
        ]);

        const result = statsAggregation[0];
        const counts = result.counts[0] || {
            totalIssues: 0,
            totalResolvedIssues: 0,
            pendingIssues: 0,
            issuesInProgress: 0,
            totalOpenIssues: 0
        };
        const resolvedLast30 = result.resolvedLast30[0]?.count || 0;
        const avgTimeMs = result.resolutionTime[0]?.avgTimeMs || 0;
        const averageResolutionTimeInDays = avgTimeMs > 0 
            ? Math.round((avgTimeMs / (1000 * 60 * 60 * 24)) * 10) / 10 
            : 0;

        res.json({
            district,
            stats: {
                totalOpenIssues: counts.totalOpenIssues,
                issuesInProgress: counts.issuesInProgress,
                issuesResolvedLast30Days: resolvedLast30,
                averageResolutionTimeInDays,
                totalIssues: counts.totalIssues,
                totalResolvedIssues: counts.totalResolvedIssues,
                pendingIssues: counts.pendingIssues,
                resolutionRate: counts.totalIssues > 0 ? Math.round((counts.totalResolvedIssues / counts.totalIssues) * 100) : 0
            }
        });
    } catch (error) {
        console.error('Get district stats error:', error);
        res.status(500).json({ error: 'Error fetching district statistics' });
    }
});

module.exports = router;
