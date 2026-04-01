const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const { optionalAuth } = require('../middleware/auth');

// GET /api/stats/categories - Get popular categories by district
router.get('/categories', optionalAuth, async (req, res) => {
    try {
        const { district, limit = 10 } = req.query;

        let matchQuery = {};
        if (district) {
            matchQuery.district = district;
        }

        // Aggregate issues by category and district
        const categoryStats = await Issue.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: {
                        district: '$district',
                        category: '$category'
                    },
                    count: { $sum: 1 },
                    totalUpvotes: { $sum: '$upvoteCount' },
                    resolvedCount: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    district: '$_id.district',
                    category: '$_id.category',
                    count: 1,
                    totalUpvotes: 1,
                    resolvedCount: 1,
                    resolutionRate: {
                        $multiply: [
                            { $divide: ['$resolvedCount', '$count'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // If district filter is provided, limit results
        let results = categoryStats;
        if (district) {
            results = categoryStats.slice(0, parseInt(limit));
        } else {
            // Group by district with top categories
            const byDistrict = {};
            categoryStats.forEach(stat => {
                if (!byDistrict[stat.district]) {
                    byDistrict[stat.district] = [];
                }
                if (byDistrict[stat.district].length < parseInt(limit)) {
                    byDistrict[stat.district].push({
                        category: stat.category,
                        count: stat.count,
                        totalUpvotes: stat.totalUpvotes,
                        resolvedCount: stat.resolvedCount,
                        resolutionRate: Math.round(stat.resolutionRate * 10) / 10
                    });
                }
            });
            
            results = byDistrict;
        }

        res.json({
            district: district || 'all',
            categories: results
        });
    } catch (error) {
        console.error('Get category stats error:', error);
        res.status(500).json({ error: 'Error fetching category statistics' });
    }
});

// GET /api/stats/overview - Get overall platform statistics
router.get('/overview', optionalAuth, async (req, res) => {
    try {
        const totalIssues = await Issue.countDocuments();
        const resolvedIssues = await Issue.countDocuments({ status: 'resolved' });
        const pendingIssues = await Issue.countDocuments({ status: 'pending' });
        const inProgressIssues = await Issue.countDocuments({ status: 'in_progress' });
        
        const featuredIssues = await Issue.countDocuments({ isPanIndiaFeatured: true });
        
        // Calculate total upvotes
        const upvoteStats = await Issue.aggregate([
            {
                $group: {
                    _id: null,
                    totalUpvotes: { $sum: '$upvoteCount' }
                }
            }
        ]);

        const totalUpvotes = upvoteStats.length > 0 ? upvoteStats[0].totalUpvotes : 0;

        // Most active districts
        const districtStats = await Issue.aggregate([
            {
                $group: {
                    _id: '$district',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            overview: {
                totalIssues,
                resolvedIssues,
                pendingIssues,
                inProgressIssues,
                featuredIssues,
                totalUpvotes,
                resolutionRate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0
            },
            topDistricts: districtStats.map(d => ({
                district: d._id,
                issueCount: d.count
            }))
        });
    } catch (error) {
        console.error('Get overview stats error:', error);
        res.status(500).json({ error: 'Error fetching overview statistics' });
    }
});

module.exports = router;
