const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Issue = require('../models/Issue');
const Announcement = require('../models/Announcement');
const Report = require('../models/Report');
const { authenticate, isAdmin } = require('../middleware/auth');
const { getEscalatedIssues, checkAndEscalateOverdueIssues } = require('../utils/deadlineTracking');
const { createAuditLog, getAuditLogs, getEntityAuditLogs, getRecentAuditLogs } = require('../utils/auditLog');

// All routes require admin authentication
router.use(authenticate, isAdmin);

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const [userStats, issueStats] = await Promise.all([
            User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        bannedUsers: { $sum: { $cond: [{ $eq: ['$isBanned', true] }, 1, 0] } },
                        unverifiedAuthorities: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'authority'] }, { $eq: ['$isVerified', false] }] }, 1, 0] } }
                    }
                }
            ]),
            Issue.aggregate([
                {
                    $group: {
                        _id: null,
                        totalIssues: { $sum: 1 },
                        pendingIssues: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                        resolvedIssues: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                        featuredIssues: { $sum: { $cond: [{ $eq: ['$isFeatured', true] }, 1, 0] } }
                    }
                }
            ])
        ]);

        const u = userStats[0] || { totalUsers: 0, bannedUsers: 0, unverifiedAuthorities: 0 };
        const i = issueStats[0] || { totalIssues: 0, pendingIssues: 0, resolvedIssues: 0, featuredIssues: 0 };

        const stats = {
            totalUsers: u.totalUsers,
            totalIssues: i.totalIssues,
            pendingIssues: i.pendingIssues,
            resolvedIssues: i.resolvedIssues,
            bannedUsers: u.bannedUsers,
            unverifiedAuthorities: u.unverifiedAuthorities,
            featuredIssues: i.featuredIssues
        };

        res.json({ stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/users - Get all users with filters
router.get('/users', async (req, res) => {
    try {
        const { role, banned, verified, search, district, state, page = 1, limit = 20 } = req.query;
        
        const query = {};
        if (role) query.role = role;
        if (banned !== undefined) query.isBanned = banned === 'true';
        if (verified !== undefined) query.isVerified = verified === 'true';
        if (district) query.district = new RegExp(district, 'i');
        if (state) query.state = new RegExp(state, 'i');
        
        if (search) {
            query.$or = [
                { username: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { displayName: new RegExp(search, 'i') }
            ];
        }

        const users = await User.find(query)
            .select('-passwordHash')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await User.countDocuments(query);

        res.json({ 
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/issues - Get all issues with filters
router.get('/issues', async (req, res) => {
    try {
        const { status, featured, category, search, district, state, page = 1, limit = 20 } = req.query;
        
        const query = {};
        if (status) query.status = status;
        if (featured !== undefined) query.isFeatured = featured === 'true';
        if (category) query.category = category;
        if (district) query.district = new RegExp(district, 'i');
        if (state) query.state = new RegExp(state, 'i');
        
        if (search) {
            query.$or = [
                { title: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        const issues = await Issue.find(query)
            .populate('reportedBy', 'displayName username email')
            .populate('assignedAuthority', 'displayName username')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await Issue.countDocuments(query);

        res.json({ 
            issues,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching issues:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:userId/ban - Ban a user
router.post('/users/:userId/ban', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Cannot ban admins
        if (user.role === 'admin') {
            return res.status(403).json({ error: 'Cannot ban admin users' });
        }

        user.isBanned = true;
        await user.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_banned',
            entityType: 'User',
            entityId: user._id,
            metadata: { username: user.username, email: user.email }
        });

        res.json({ 
            message: 'User banned successfully',
            user: {
                _id: user._id,
                username: user.username,
                isBanned: user.isBanned
            }
        });
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:userId/unban - Unban a user
router.post('/users/:userId/unban', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.isBanned = false;
        await user.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_unbanned',
            entityType: 'User',
            entityId: user._id,
            metadata: { username: user.username, email: user.email }
        });

        res.json({ 
            message: 'User unbanned successfully',
            user: {
                _id: user._id,
                username: user.username,
                isBanned: user.isBanned
            }
        });
    } catch (error) {
        console.error('Error unbanning user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:userId/verify - Verify an authority account
router.post('/users/:userId/verify', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role !== 'authority') {
            return res.status(400).json({ error: 'Only authority accounts can be verified' });
        }

        user.isVerified = true;
        await user.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_verified',
            entityType: 'User',
            entityId: user._id,
            metadata: { username: user.username, role: user.role }
        });

        res.json({ 
            message: 'Authority verified successfully',
            user: {
                _id: user._id,
                username: user.username,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Error verifying user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:userId/unverify - Unverify an authority account
router.post('/users/:userId/unverify', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.isVerified = false;
        await user.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_unverified',
            entityType: 'User',
            entityId: user._id,
            metadata: { username: user.username, role: user.role }
        });

        res.json({ 
            message: 'Authority verification removed',
            user: {
                _id: user._id,
                username: user.username,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Error unverifying user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/issues/:issueId - Delete an issue
router.delete('/issues/:issueId', async (req, res) => {
    try {
        const { issueId } = req.params;

        const issue = await Issue.findByIdAndDelete(issueId);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_deleted',
            entityType: 'Issue',
            entityId: issueId,
            metadata: { title: issue.title, district: issue.district }
        });

        res.json({ message: 'Issue deleted successfully' });
    } catch (error) {
        console.error('Error deleting issue:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/issues/:issueId/feature - Feature an issue
router.post('/issues/:issueId/feature', async (req, res) => {
    try {
        const { issueId } = req.params;

        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        issue.isFeatured = true;
        await issue.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_featured',
            entityType: 'Issue',
            entityId: issue._id,
            metadata: { title: issue.title }
        });

        res.json({ 
            message: 'Issue featured successfully',
            issue: {
                _id: issue._id,
                title: issue.title,
                isFeatured: issue.isFeatured
            }
        });
    } catch (error) {
        console.error('Error featuring issue:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/issues/:issueId/unfeature - Unfeature an issue
router.post('/issues/:issueId/unfeature', async (req, res) => {
    try {
        const { issueId } = req.params;

        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        issue.isFeatured = false;
        await issue.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_unfeatured',
            entityType: 'Issue',
            entityId: issue._id,
            metadata: { title: issue.title }
        });

        res.json({ 
            message: 'Issue unfeatured successfully',
            issue: {
                _id: issue._id,
                title: issue.title,
                isFeatured: issue.isFeatured
            }
        });
    } catch (error) {
        console.error('Error unfeaturing issue:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/users/:userId - Delete a user (dangerous operation)
router.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Cannot delete admins
        if (user.role === 'admin') {
            return res.status(403).json({ error: 'Cannot delete admin users' });
        }

        await User.findByIdAndDelete(userId);

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_deleted',
            entityType: 'User',
            entityId: userId,
            metadata: { username: user.username, role: user.role }
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/moderation - Get flagged issues for moderation
router.get('/moderation', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const flaggedIssues = await Issue.find({ isFlagged: true })
            .populate('reportedBy', 'displayName username email')
            .populate('assignedAuthority', 'displayName username')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Issue.countDocuments({ isFlagged: true });

        res.json({ 
            flaggedIssues,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching flagged issues:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/ban-user - Ban a user (alternative route)
router.post('/ban-user', async (req, res) => {
    try {
        const { userId, reason } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Cannot ban admins
        if (user.role === 'admin') {
            return res.status(403).json({ error: 'Cannot ban admin users' });
        }

        user.isBanned = true;
        await user.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'user_banned',
            entityType: 'User',
            entityId: user._id,
            metadata: { username: user.username, reason: reason || 'No reason provided' }
        });

        res.json({ 
            message: 'User banned successfully',
            user: {
                _id: user._id,
                username: user.username,
                isBanned: user.isBanned
            }
        });
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/escalated - Get all escalated issues
router.get('/escalated', async (req, res) => {
    try {
        const { district, state } = req.query;
        const filters = {};
        
        if (district) filters.district = district;
        if (state) filters.state = state;
        
        const escalatedIssues = await getEscalatedIssues(filters);
        
        res.json({ 
            escalatedIssues,
            count: escalatedIssues.length
        });
    } catch (error) {
        console.error('Error fetching escalated issues:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Reports Routes ---

// GET /api/admin/reports - Get all reports with filters
router.get('/reports', async (req, res) => {
    try {
        const { status, targetType, search, page = 1, limit = 20 } = req.query;
        
        const query = {};
        if (status) query.status = status;
        if (targetType) query.targetType = targetType;
        
        if (search) {
            query.$or = [
                { reason: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        const reports = await Report.find(query)
            .populate('reporterId', 'username displayName')
            .populate('reviewedBy', 'username displayName')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await Report.countDocuments(query);

        res.json({ 
            reports,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/admin/reports/:reportId - Update report status/action
router.patch('/reports/:reportId', async (req, res) => {
    try {
        const { status, actionTaken } = req.body;
        const { reportId } = req.params;

        const report = await Report.findById(reportId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        if (status) report.status = status;
        if (actionTaken) report.actionTaken = actionTaken;
        
        report.reviewedBy = req.user._id;
        report.reviewedAt = new Date();
        
        await report.save();

        await createAuditLog({
            actorId: req.user._id,
            action: 'report_updated',
            entityType: 'Report',
            entityId: report._id,
            metadata: { status, actionTaken }
        });

        res.json({ message: 'Report updated successfully', report });
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Announcements Routes ---

// GET /api/admin/announcements - Get all announcements
router.get('/announcements', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const announcements = await Announcement.find()
            .populate('createdBy', 'username displayName')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await Announcement.countDocuments();

        res.json({ 
            announcements,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/announcements - Create new announcement
router.post('/announcements', async (req, res) => {
    try {
        const { title, content, type, targetAudience, targetDistrict, targetState, expiresAt } = req.body;

        const announcement = new Announcement({
            title,
            content,
            type,
            targetAudience,
            targetDistrict,
            targetState,
            expiresAt,
            createdBy: req.user._id
        });

        await announcement.save();

        await createAuditLog({
            actorId: req.user._id,
            action: 'announcement_created',
            entityType: 'Announcement',
            entityId: announcement._id,
            metadata: { title, targetAudience }
        });

        res.status(201).json({ message: 'Announcement created successfully', announcement });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/announcements/:id - Delete announcement
router.delete('/announcements/:id', async (req, res) => {
    try {
        const announcement = await Announcement.findByIdAndDelete(req.params.id);
        if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

        await createAuditLog({
            actorId: req.user._id,
            action: 'announcement_deleted',
            entityType: 'Announcement',
            entityId: req.params.id,
            metadata: { title: announcement.title }
        });

        res.json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/check-deadlines - Manually trigger deadline check
router.post('/check-deadlines', async (req, res) => {
    try {
        const escalatedCount = await checkAndEscalateOverdueIssues();
        
        res.json({ 
            message: 'Deadline check completed',
            escalatedCount
        });
    } catch (error) {
        console.error('Error checking deadlines:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/audit-logs - Get audit logs with filters
router.get('/audit-logs', async (req, res) => {
    try {
        const { action, entityType, actorId, page = 1, limit = 50 } = req.query;
        
        const filters = {};
        if (action) filters.action = action;
        if (entityType) filters.entityType = entityType;
        if (actorId) filters.actorId = actorId;
        
        const result = await getAuditLogs(filters, {
            page: parseInt(page),
            limit: parseInt(limit)
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/audit-logs/recent - Get recent audit logs
router.get('/audit-logs/recent', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        
        const logs = await getRecentAuditLogs(parseInt(limit));
        
        res.json({ logs, count: logs.length });
    } catch (error) {
        console.error('Error fetching recent audit logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/audit-logs/entity/:entityType/:entityId - Get audit logs for specific entity
router.get('/audit-logs/entity/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        
        const logs = await getEntityAuditLogs(entityType, entityId);
        
        res.json({ logs, count: logs.length });
    } catch (error) {
        console.error('Error fetching entity audit logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
