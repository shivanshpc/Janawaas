const express = require('express');
const router = express.Router();
const Authority = require('../models/Authority');
const Issue = require('../models/Issue');
const Rating = require('../models/Rating');

// GET /api/leaderboard - Get authority leaderboard
router.get('/', async (req, res) => {
    try {
        const { limit = 50, sortBy = 'resolved' } = req.query;
        const limitNum = parseInt(limit);

        // Optimized aggregation for leaderboard
        const leaderboardData = await Authority.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $lookup: {
                    from: 'issues',
                    let: { userId: '$userId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$assignedAuthority', '$$userId'] },
                                status: 'resolved'
                            }
                        },
                        {
                            $project: {
                                resolutionDays: {
                                    $divide: [
                                        { $subtract: ['$updatedAt', '$createdAt'] },
                                        1000 * 60 * 60 * 24
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'resolvedIssues'
                }
            },
            {
                $lookup: {
                    from: 'ratings',
                    localField: '_id',
                    foreignField: 'authorityId',
                    as: 'ratings'
                }
            },
            {
                $project: {
                    name: { $ifNull: ['$user.displayName', { $ifNull: ['$user.name', 'Unknown'] }] },
                    username: '$user.username',
                    avatar: '$user.avatar',
                    designation: '$designation',
                    department: '$department',
                    jurisdiction: {
                        district: '$jurisdictionDistrict',
                        state: '$jurisdictionState'
                    },
                    metrics: {
                        issuesAccepted: { $ifNull: ['$issuesAccepted', 0] },
                        issuesResolved: { $ifNull: ['$issuesResolved', 0] },
                        averageRating: { 
                            $avg: {
                                $map: {
                                    input: '$ratings',
                                    as: 'r',
                                    in: { $divide: [{ $add: ['$$r.speedScore', '$$r.efficiencyScore', '$$r.satisfactionScore'] }, 3] }
                                }
                            }
                        },
                        averageResolutionTime: { $avg: '$resolvedIssues.resolutionDays' },
                        ratingCount: { $size: '$ratings' }
                    },
                    badge: '$badge'
                }
            }
        ]);

        // Sort based on the metrics
        let sortedLeaderboard;
        switch (sortBy) {
            case 'rating':
                sortedLeaderboard = leaderboardData.sort((a, b) => 
                    (b.metrics.averageRating || 0) - (a.metrics.averageRating || 0)
                );
                break;
            case 'speed':
                sortedLeaderboard = leaderboardData
                    .filter(a => a.metrics.issuesResolved > 0)
                    .sort((a, b) => 
                        (a.metrics.averageResolutionTime || 0) - (b.metrics.averageResolutionTime || 0)
                    );
                break;
            case 'resolved':
            default:
                sortedLeaderboard = leaderboardData.sort((a, b) => 
                    (b.metrics.issuesResolved || 0) - (a.metrics.issuesResolved || 0)
                );
                break;
        }

        // Apply limit and add rank
        const result = sortedLeaderboard.slice(0, limitNum).map((auth, index) => ({
            ...auth,
            rank: index + 1,
            metrics: {
                ...auth.metrics,
                averageRating: (auth.metrics.averageRating || 0).toFixed(2),
                averageResolutionTime: (auth.metrics.averageResolutionTime || 0).toFixed(1)
            }
        }));

        res.json({
            leaderboard: result,
            total: leaderboardData.length,
            sortedBy: sortBy
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Error fetching leaderboard' });
    }
});

module.exports = router;
