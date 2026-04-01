const express = require('express');
const router = express.Router();
const AuthorityApplication = require('../models/AuthorityApplication');
const Authority = require('../models/Authority');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { cloudinary, uploadDocument } = require('../config/cloudinary');

// POST /api/authority/apply - Submit authority application
router.post('/apply', authenticate, uploadDocument.single('appointmentLetter'), async (req, res) => {
    try {
        const {
            fullName,
            designation,
            department,
            jurisdictionDistrict,
            jurisdictionState,
            officialEmail,
            governmentIdNumber
        } = req.body;

        // Validate required fields
        if (!fullName || !designation || !department || !jurisdictionDistrict || 
            !jurisdictionState || !officialEmail || !governmentIdNumber) {
            return res.status(400).json({ 
                error: 'All fields are required',
                code: 'MISSING_FIELDS'
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                error: 'Appointment letter is required',
                code: 'NO_FILE'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(officialEmail)) {
            return res.status(400).json({ 
                error: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
        }

        // Check if user already has a pending or approved application
        const existingApplication = await AuthorityApplication.findOne({
            userId: req.user._id,
            status: { $in: ['pending', 'approved'] }
        });

        if (existingApplication) {
            if (existingApplication.status === 'approved') {
                return res.status(400).json({ 
                    error: 'You are already an authority' ,
                    code: 'ALREADY_AUTHORITY'
                });
            }
            return res.status(400).json({ 
                error: 'You already have a pending application',
                code: 'PENDING_APPLICATION'
            });
        }

        // Check if user is already an authority
        if (req.user.role === 'authority') {
            return res.status(400).json({ 
                error: 'You are already an authority',
                code: 'ALREADY_AUTHORITY'
            });
        }

        // Document has been uploaded via Cloudinary middleware
        if (!req.file.path) {
            return res.status(500).json({ 
                error: 'Document upload failed',
                code: 'UPLOAD_FAILED'
            });
        }

        // Create application
        const application = new AuthorityApplication({
            userId: req.user._id,
            fullName,
            designation,
            department,
            jurisdictionDistrict,
            jurisdictionState,
            officialEmail,
            governmentIdNumber,
            appointmentLetterUrl: req.file.path,
            appointmentLetterPublicId: req.file.filename,
            status: 'pending'
        });

        await application.save();

        res.status(201).json({
            message: 'Authority application submitted successfully. Please wait for admin review.',
            application: {
                id: application._id,
                status: application.status,
                createdAt: application.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Authority application error:', error);
        
        // Handle specific error types
        let statusCode = 500;
        let errorMessage = 'Error submitting authority application';
        let errorCode = 'APPLICATION_ERROR';

        if (error.message && error.message.includes('Invalid file type')) {
            statusCode = 400;
            errorMessage = error.message;
            errorCode = 'INVALID_FILE';
        } else if (error.message && error.message.includes('File too large')) {
            statusCode = 413;
            errorMessage = 'Document size exceeds 20MB limit';
            errorCode = 'FILE_TOO_LARGE';
        } else if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = 'Invalid application data';
            errorCode = 'VALIDATION_ERROR';
        }

        res.status(statusCode).json({ 
            error: errorMessage,
            code: errorCode
        });
    }
});

// GET /api/authority/status - Check application status
router.get('/status', authenticate, async (req, res) => {
    try {
        const application = await AuthorityApplication.findOne({ 
            userId: req.user._id 
        }).sort({ createdAt: -1 });

        if (!application) {
            return res.json({ hasApplication: false });
        }

        res.json({
            hasApplication: true,
            application: {
                id: application._id,
                fullName: application.fullName,
                designation: application.designation,
                department: application.department,
                status: application.status,
                createdAt: application.createdAt,
                reviewedAt: application.reviewedAt,
                rejectionReason: application.rejectionReason
            }
        });

    } catch (error) {
        console.error('Error checking application status:', error);
        res.status(500).json({ error: 'Error checking application status' });
    }
});

// Utility for search text
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/authority/distinct-values - Fetch distinct filter values
router.get('/distinct-values', async (req, res) => {
    try {
        const { state, district } = req.query;
        const filter = {};

        if (state) {
            filter.jurisdictionState = new RegExp(`^${escapeRegex(state)}$`, 'i');
        }
        if (district) {
            filter.jurisdictionDistrict = new RegExp(`^${escapeRegex(district)}$`, 'i');
        }

        const [states, districts, expertise] = await Promise.all([
            Authority.distinct('jurisdictionState'),
            Authority.distinct('jurisdictionDistrict', filter),
            Authority.distinct('areaOfExpertise', filter)
        ]);

        res.json({ states: states.sort(), districts: districts.sort(), expertise: expertise.sort() });
    } catch (error) {
        console.error('Error fetching distinct authority values:', error);
        res.status(500).json({ error: 'Error fetching distinct authority values' });
    }
});

// GET /api/authority - Fetch authorities with optional filters
router.get('/', async (req, res) => {
    try {
        const { state, district, expertise, search, limit = 250, skip = 0 } = req.query;

        const filter = {};

        if (state) {
            filter.jurisdictionState = new RegExp(`^${escapeRegex(state)}$`, 'i');
        }
        if (district) {
            filter.jurisdictionDistrict = new RegExp(`^${escapeRegex(district)}$`, 'i');
        }
        if (expertise) {
            filter.areaOfExpertise = new RegExp(`^${escapeRegex(expertise)}$`, 'i');
        }
        if (search) {
            const term = escapeRegex(search);
            const userFilter = {
                $or: [
                    { displayName: new RegExp(term, 'i') },
                    { email: new RegExp(term, 'i') }
                ]
            };
            
            const users = await User.find(userFilter).select('_id').lean();
            const userIds = users.map(u => u._id);

            filter.$or = [
                { jurisdictionDistrict: new RegExp(term, 'i') },
                { jurisdictionState: new RegExp(term, 'i') },
                { designation: new RegExp(term, 'i') },
                { department: new RegExp(term, 'i') },
                { userId: { $in: userIds } }
            ];
        }

        const authorities = await Authority
            .find(filter)
            .populate('userId', 'displayName username email district state')
            .sort({ jurisdictionState: 1, jurisdictionDistrict: 1, designation: 1 })
            .skip(Number(skip))
            .limit(Math.min(Number(limit), 2000))
            .lean();

        const total = await Authority.countDocuments(filter);
        
        // Get unique districts for the matching documents
        const uniqueDistricts = await Authority.find(filter).distinct('jurisdictionDistrict');
        const uniqueDistrictsCount = uniqueDistricts.filter(d => d && d.trim() !== '').length;

        res.json({
            authorities,
            total,
            uniqueDistrictsCount
        });
    } catch (error) {
        console.error('Error fetching authorities:', error);
        res.status(500).json({ error: 'Error fetching authorities' });
    }
});

// POST /api/authority/merge-request/:id - Send a merge request
router.post('/merge-request/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can send merge requests' });
        }

        const sourceAuthority = await Authority.findOne({ userId: req.user._id });
        const targetAuthority = await Authority.findById(req.params.id);

        if (!sourceAuthority || !targetAuthority) {
            return res.status(404).json({ error: 'Authority not found' });
        }

        if (sourceAuthority._id.equals(targetAuthority._id)) {
            return res.status(400).json({ error: 'Cannot merge with yourself' });
        }

        if (targetAuthority.pendingMergeRequests.includes(sourceAuthority._id)) {
            return res.status(400).json({ error: 'Merge request already sent' });
        }

        if (targetAuthority.mergedAuthorities.includes(sourceAuthority._id)) {
            return res.status(400).json({ error: 'Authorities already merged' });
        }

        targetAuthority.pendingMergeRequests.push(sourceAuthority._id);
        await targetAuthority.save();

        // Send notification to target authority
        const { createNotification } = require('../utils/notifications');
        await createNotification({
            userId: targetAuthority.userId,
            type: 'merge_request',
            title: 'New Merge Request',
            message: `${sourceAuthority.designation} (${sourceAuthority.areaOfExpertise}) has requested to merge issues with you.`,
            metadata: {
                sourceAuthorityId: sourceAuthority._id,
                sourceAuthorityName: sourceAuthority.designation,
                sourceAuthorityExpertise: sourceAuthority.areaOfExpertise
            }
        });

        res.json({ message: 'Merge request sent successfully' });
    } catch (error) {
        console.error('Error sending merge request:', error);
        res.status(500).json({ error: 'Error sending merge request' });
    }
});

// POST /api/authority/merge-accept/:id - Accept a merge request
router.post('/merge-accept/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can accept merge requests' });
        }

        const targetAuthority = await Authority.findOne({ userId: req.user._id });
        const sourceAuthorityId = req.params.id;

        if (!targetAuthority.pendingMergeRequests.includes(sourceAuthorityId)) {
            return res.status(400).json({ error: 'No pending merge request found' });
        }

        const sourceAuthority = await Authority.findById(sourceAuthorityId);
        if (!sourceAuthority) {
            return res.status(404).json({ error: 'Source authority not found' });
        }

        // Add to merged authorities for both
        if (!targetAuthority.mergedAuthorities.includes(sourceAuthorityId)) {
            targetAuthority.mergedAuthorities.push(sourceAuthorityId);
        }
        if (!sourceAuthority.mergedAuthorities.includes(targetAuthority._id)) {
            sourceAuthority.mergedAuthorities.push(targetAuthority._id);
        }

        // Remove from pending
        targetAuthority.pendingMergeRequests = targetAuthority.pendingMergeRequests.filter(
            id => id.toString() !== sourceAuthorityId.toString()
        );

        await targetAuthority.save();
        await sourceAuthority.save();

        // Send notification to source authority
        const { createNotification } = require('../utils/notifications');
        await createNotification({
            userId: sourceAuthority.userId,
            type: 'merge_accepted',
            title: 'Merge Request Accepted',
            message: `${targetAuthority.designation} has accepted your merge request. You can now view each other\'s issues.`,
            metadata: {
                targetAuthorityId: targetAuthority._id,
                targetAuthorityName: targetAuthority.designation
            }
        });

        res.json({ message: 'Merge request accepted successfully' });
    } catch (error) {
        console.error('Error accepting merge request:', error);
        res.status(500).json({ error: 'Error accepting merge request' });
    }
});

// POST /api/authority/merge-reject/:id - Reject a merge request
router.post('/merge-reject/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can reject merge requests' });
        }

        const targetAuthority = await Authority.findOne({ userId: req.user._id });
        const sourceAuthorityId = req.params.id;

        if (!targetAuthority.pendingMergeRequests.includes(sourceAuthorityId)) {
            return res.status(400).json({ error: 'No pending merge request found' });
        }

        const sourceAuthority = await Authority.findById(sourceAuthorityId);

        // Remove from pending
        targetAuthority.pendingMergeRequests = targetAuthority.pendingMergeRequests.filter(
            id => id.toString() !== sourceAuthorityId.toString()
        );

        await targetAuthority.save();

        if (sourceAuthority) {
            // Send notification to source authority
            const { createNotification } = require('../utils/notifications');
            await createNotification({
                userId: sourceAuthority.userId,
                type: 'merge_rejected',
                title: 'Merge Request Rejected',
                message: `${targetAuthority.designation} has rejected your merge request.`,
                metadata: {
                    targetAuthorityId: targetAuthority._id,
                    targetAuthorityName: targetAuthority.designation
                }
            });
        }

        res.json({ message: 'Merge request rejected successfully' });
    } catch (error) {
        console.error('Error rejecting merge request:', error);
        res.status(500).json({ error: 'Error rejecting merge request' });
    }
});

// POST /api/authority/unmerge/:id - Unmerge authorities
router.post('/unmerge/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can unmerge' });
        }

        const currentAuthority = await Authority.findOne({ userId: req.user._id });
        const otherAuthorityId = req.params.id;

        if (!currentAuthority.mergedAuthorities.includes(otherAuthorityId)) {
            return res.status(400).json({ error: 'Authorities are not merged' });
        }

        const otherAuthority = await Authority.findById(otherAuthorityId);
        if (!otherAuthority) {
            return res.status(404).json({ error: 'Other authority not found' });
        }

        // Remove from merged authorities for both
        currentAuthority.mergedAuthorities = currentAuthority.mergedAuthorities.filter(
            id => id.toString() !== otherAuthorityId.toString()
        );
        otherAuthority.mergedAuthorities = otherAuthority.mergedAuthorities.filter(
            id => id.toString() !== currentAuthority._id.toString()
        );

        await currentAuthority.save();
        await otherAuthority.save();

        // Send notification to other authority
        const { createNotification } = require('../utils/notifications');
        await createNotification({
            userId: otherAuthority.userId,
            type: 'unmerged',
            title: 'Authorities Unmerged',
            message: `${currentAuthority.designation} has unmerged from your account.`,
            metadata: {
                unmergedBy: currentAuthority._id,
                unmergedByName: currentAuthority.designation
            }
        });

        res.json({ message: 'Authorities unmerged successfully' });
    } catch (error) {
        console.error('Error unmerging authorities:', error);
        res.status(500).json({ error: 'Error unmerging authorities' });
    }
});

// GET /api/authority/:id - Fetch a single authority by ID
router.get('/:id', async (req, res) => {
    try {
        const authority = await Authority.findById(req.params.id)
            .populate('userId', 'displayName username email district state profilePicture')
            .lean();

        if (!authority) {
            return res.status(404).json({ error: 'Authority not found' });
        }

        res.json(authority);
    } catch (error) {
        console.error('Error fetching authority:', error);
        res.status(500).json({ error: 'Error fetching authority' });
    }
});

// PUT /api/authority/:id - Update authority profile (only by the authority themselves)
router.put('/:id', authenticate, async (req, res) => {
    try {
        const authority = await Authority.findById(req.params.id);

        if (!authority) {
            return res.status(404).json({ error: 'Authority not found' });
        }

        // Check if the current user is the owner of this authority profile
        if (authority.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to update this profile' });
        }

        const {
            about,
            description,
            location,
            contactEmail,
            contactPhone,
            website,
            areaOfExpertise,
            designation,
            department
        } = req.body;

        // Update fields if provided
        if (about !== undefined) authority.about = about;
        if (description !== undefined) authority.description = description;
        if (location !== undefined) authority.location = location;
        if (contactEmail !== undefined) authority.contactEmail = contactEmail;
        if (contactPhone !== undefined) authority.contactPhone = contactPhone;
        if (website !== undefined) authority.website = website;
        if (areaOfExpertise !== undefined) authority.areaOfExpertise = areaOfExpertise;
        if (designation !== undefined) authority.designation = designation;
        if (department !== undefined) authority.department = department;

        await authority.save();

        res.json({
            message: 'Authority profile updated successfully',
            authority
        });

    } catch (error) {
        console.error('Error updating authority:', error);
        res.status(500).json({ error: 'Error updating authority' });
    }
});

module.exports = router;
