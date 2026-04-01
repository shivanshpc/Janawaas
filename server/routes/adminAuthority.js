const express = require('express');
const router = express.Router();
const AuthorityApplication = require('../models/AuthorityApplication');
const Authority = require('../models/Authority');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate, isAdmin } = require('../middleware/auth');

// GET /api/admin/authority-applications - Get all authority applications
router.get('/authority-applications', authenticate, isAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        
        if (status) {
            query.status = status;
        }

        const applications = await AuthorityApplication.find(query)
            .populate('userId', 'displayName username email')
            .populate('reviewedBy', 'displayName username')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ applications });

    } catch (error) {
        console.error('Error fetching authority applications:', error);
        res.status(500).json({ error: 'Error fetching authority applications' });
    }
});

// GET /api/admin/authority-applications/:id - Get single application
router.get('/authority-applications/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const application = await AuthorityApplication.findById(req.params.id)
            .populate('userId', 'displayName username email district state')
            .populate('reviewedBy', 'displayName username');

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json({ application });

    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: 'Error fetching application' });
    }
});

// POST /api/admin/authority-applications/:id/approve - Approve application
router.post('/authority-applications/:id/approve', authenticate, isAdmin, async (req, res) => {
    try {
        const application = await AuthorityApplication.findById(req.params.id)
            .populate('userId');

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Application already reviewed' });
        }

        // Update application status
        application.status = 'approved';
        application.reviewedBy = req.user._id;
        application.reviewedAt = new Date();
        await application.save();

        // Update user role to authority
        const user = await User.findById(application.userId);
        user.role = 'authority';
        await user.save();

        // Create Authority record
        const authority = new Authority({
            userId: application.userId,
            designation: application.designation,
            department: application.department,
            jurisdictionDistrict: application.jurisdictionDistrict,
            jurisdictionState: application.jurisdictionState,
            issuesAccepted: 0,
            issuesResolved: 0,
            averageRating: 0,
            badge: 'none'
        });

        await authority.save();

        // Create notification for user
        const notification = new Notification({
            userId: application.userId,
            type: 'authority_approved',
            title: 'Authority Application Approved',
            message: `Congratulations! Your application to become an authority has been approved. You can now access the authority dashboard.`,
            isRead: false
        });

        await notification.save();

        res.json({
            message: 'Authority application approved successfully',
            application,
            authority
        });

    } catch (error) {
        console.error('Error approving application:', error);
        res.status(500).json({ error: 'Error approving application' });
    }
});

// POST /api/admin/authority-applications/:id/reject - Reject application
router.post('/authority-applications/:id/reject', authenticate, isAdmin, async (req, res) => {
    try {
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const application = await AuthorityApplication.findById(req.params.id)
            .populate('userId');

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Application already reviewed' });
        }

        // Update application status
        application.status = 'rejected';
        application.reviewedBy = req.user._id;
        application.reviewedAt = new Date();
        application.rejectionReason = rejectionReason;
        await application.save();

        // Create notification for user
        const notification = new Notification({
            userId: application.userId,
            type: 'authority_rejected',
            title: 'Authority Application Rejected',
            message: `Your application to become an authority has been rejected. Reason: ${rejectionReason}`,
            isRead: false
        });

        await notification.save();

        res.json({
            message: 'Authority application rejected',
            application
        });

    } catch (error) {
        console.error('Error rejecting application:', error);
        res.status(500).json({ error: 'Error rejecting application' });
    }
});

// GET /api/admin/authorities - Get all authorities
router.get('/authorities', authenticate, isAdmin, async (req, res) => {
    try {
        const authorities = await Authority.find()
            .populate('userId', 'displayName username email')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ authorities });

    } catch (error) {
        console.error('Error fetching authorities:', error);
        res.status(500).json({ error: 'Error fetching authorities' });
    }
});

module.exports = router;
