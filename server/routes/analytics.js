const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const Authority = require('../models/Authority');
const User = require('../models/User');
const Rating = require('../models/Rating');
const { authenticate } = require('../middleware/auth');

// Middleware to check admin role
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
};

// GET /api/analytics/summary - Get overall statistics
router.get('/summary', authenticate, isAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [issueStats, userCount, activeDistricts] = await Promise.all([
            Issue.aggregate([
                {
                    $facet: {
                        totals: [
                            {
                                $group: {
                                    _id: null,
                                    totalIssues: { $sum: 1 },
                                    resolvedIssues: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
                                }
                            }
                        ],
                        today: [
                            {
                                $match: {
                                    createdAt: { $gte: todayStart }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    todayIssues: { $sum: 1 },
                                    todayResolved: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'resolved'] }, { $gte: ['$resolvedAt', todayStart] }] }, 1, 0] } }
                                }
                            }
                        ]
                    }
                }
            ]),
            User.countDocuments(),
            Issue.distinct('district')
        ]);

        const totals = issueStats[0].totals[0] || { totalIssues: 0, resolvedIssues: 0 };
        const today = issueStats[0].today[0] || { todayIssues: 0, todayResolved: 0 };

        res.json({
            totalIssues: totals.totalIssues,
            resolvedIssues: totals.resolvedIssues,
            todayIssues: today.todayIssues,
            todayResolved: today.todayResolved,
            activeDistricts: activeDistricts.length,
            totalUsers: userCount
        });
    } catch (error) {
        console.error('Error fetching analytics summary:', error);
        res.status(500).json({ error: 'Error fetching analytics summary' });
    }
});

// GET /api/analytics/categories - Get issues by category
router.get('/categories', authenticate, isAdmin, async (req, res) => {
    try {
        const categories = await Issue.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    count: 1
                }
            }
        ]);

        res.json(categories);
    } catch (error) {
        console.error('Error fetching category analytics:', error);
        res.status(500).json({ error: 'Error fetching category analytics' });
    }
});

// GET /api/analytics/issues-trend - Get issues trend over time
router.get('/issues-trend', authenticate, isAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        const trend = await Issue.aggregate([
            {
                $match: {
                    createdAt: { $gte: daysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    count: 1
                }
            }
        ]);

        res.json(trend);
    } catch (error) {
        console.error('Error fetching issues trend:', error);
        res.status(500).json({ error: 'Error fetching issues trend' });
    }
});

// GET /api/analytics/districts - Get district statistics
router.get('/districts', authenticate, isAdmin, async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const districts = await Issue.aggregate([
            {
                $group: {
                    _id: '$district',
                    issueCount: { $sum: 1 },
                    resolvedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    }
                }
            },
            {
                $sort: { issueCount: -1 }
            },
            {
                $limit: parseInt(limit)
            },
            {
                $project: {
                    _id: 0,
                    district: '$_id',
                    issueCount: 1,
                    resolvedCount: 1
                }
            }
        ]);

        res.json(districts);
    } catch (error) {
        console.error('Error fetching district analytics:', error);
        res.status(500).json({ error: 'Error fetching district analytics' });
    }
});

// GET /api/analytics/authorities - Get authority performance metrics
router.get('/authorities', authenticate, isAdmin, async (req, res) => {
    try {
        // Optimized aggregation for authority performance
        const performanceData = await Authority.aggregate([
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
                                status: 'resolved',
                                resolvedAt: { $exists: true }
                            }
                        },
                        {
                            $project: {
                                resolutionDays: {
                                    $floor: {
                                        $divide: [
                                            { $subtract: ['$resolvedAt', '$createdAt'] },
                                            1000 * 60 * 60 * 24
                                        ]
                                    }
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
                    name: '$user.name',
                    department: '$department',
                    issuesAccepted: { $ifNull: ['$issuesAccepted', 0] },
                    issuesResolved: { $ifNull: ['$issuesResolved', 0] },
                    averageRating: { $avg: '$ratings.rating' },
                    avgResolutionTime: { $avg: '$resolvedIssues.resolutionDays' }
                }
            },
            { $sort: { issuesResolved: -1 } }
        ]);

        res.json(performanceData.map(d => ({
            ...d,
            averageRating: d.averageRating ? parseFloat(d.averageRating.toFixed(1)) : 0,
            avgResolutionTime: d.avgResolutionTime ? parseFloat(d.avgResolutionTime.toFixed(1)) : null
        })));
    } catch (error) {
        console.error('Error fetching authority performance:', error);
        res.status(500).json({ error: 'Error fetching authority performance' });
    }
});

// GET /api/analytics/resolution-time - Get resolution time analytics
router.get('/resolution-time', authenticate, isAdmin, async (req, res) => {
    try {
        const stats = await Issue.aggregate([
            {
                $match: {
                    status: 'resolved',
                    resolvedAt: { $exists: true },
                    createdAt: { $exists: true }
                }
            },
            {
                $project: {
                    days: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$resolvedAt', '$createdAt'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    },
                    assignedAuthority: 1
                }
            },
            {
                $group: {
                    _id: null,
                    averageDays: { $avg: '$days' },
                    fastestDays: { $min: '$days' },
                    slowestDays: { $max: '$days' },
                    // Store top/bottom cases to find authorities later
                    allIssues: { $push: { days: '$days', authorityId: '$assignedAuthority' } }
                }
            }
        ]);

        if (stats.length === 0) {
            return res.json({
                averageDays: 0,
                fastestDays: 0,
                slowestDays: 0,
                fastestAuthority: null,
                slowestAuthority: null
            });
        }

        const s = stats[0];
        
        // Find fastest and slowest authority IDs from the aggregated list
        const fastest = s.allIssues.reduce((min, rt) => rt.days === s.fastestDays ? rt : min);
        const slowest = s.allIssues.reduce((max, rt) => rt.days === s.slowestDays ? rt : max);

        // Get authority names
        let fastestAuthority = null;
        let slowestAuthority = null;

        if (fastest.authorityId) {
            const fastAuth = await Authority.findOne({ userId: fastest.authorityId }).populate('userId', 'name').lean();
            if (fastAuth) fastestAuthority = fastAuth.userId.name;
        }

        if (slowest.authorityId) {
            const slowAuth = await Authority.findOne({ userId: slowest.authorityId }).populate('userId', 'name').lean();
            if (slowAuth) slowestAuthority = slowAuth.userId.name;
        }

        res.json({
            averageDays: parseFloat(s.averageDays.toFixed(1)),
            fastestDays: s.fastestDays,
            slowestDays: s.slowestDays,
            fastestAuthority,
            slowestAuthority
        });
    } catch (error) {
        console.error('Error fetching resolution time analytics:', error);
        res.status(500).json({ error: 'Error fetching resolution time analytics' });
    }
});

module.exports = router;
