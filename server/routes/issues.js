const express = require('express');
const router = express.Router();
const multer = require('multer');
const Issue = require('../models/Issue');
const User = require('../models/User');
const Upvote = require('../models/Upvote');
const { createNotification } = require('../utils/notifications');
const Comment = require('../models/Comment');
const Petition = require('../models/Petition');
const SocialShare = require('../models/SocialShare');
const IssueUpdate = require('../models/IssueUpdate');
const IssueFollower = require('../models/IssueFollower');
const Notification = require('../models/Notification');
const { authenticate, optionalAuth, isAuthority, requireVerification } = require('../middleware/auth');
const { moderateMultipleFields } = require('../utils/moderation');
const { upload } = require('../config/cloudinary');
const { notifyIssueAccepted, notifyIssueStatusUpdate } = require('../utils/notifications');
const { updateIssueSeverity } = require('../utils/severity');
const { findSimilarIssue } = require('../utils/duplicateDetection');
const { updateAuthorityBadge } = require('../utils/badges');
const { createAuditLog } = require('../utils/auditLog');
const trendingCache = {
    data: null,
    lastUpdated: 0,
    ttl: 5 * 60 * 1000 // 5 minutes
};
const Authority = require('../models/Authority');

const PROGRESS_STAGES = [
    { key: 'planning', label: 'Devising a plan of action', order: 1 },
    { key: 'permissions', label: 'Getting the necessary permissions', order: 2 },
    { key: 'team_creation', label: 'Creating teams', order: 3 },
    { key: 'physical_work', label: 'Physical working', order: 4 },
    { key: 'completion', label: 'Issue completed', order: 5 }
];

const PROGRESS_STAGE_MAP = PROGRESS_STAGES.reduce((acc, stage) => {
    acc[stage.key] = stage;
    return acc;
}, {});

function escapeRegex(input = '') {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to format issue for anonymous display
function formatIssueForDisplay(issue, currentUserId = null) {
    const issueObj = issue.toObject ? issue.toObject() : issue;
    
    if (issueObj.isAnonymous) {
        // If the current user is the reporter, admin, or assigned authority, show real info
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

function buildProgressTracker(updates = [], issueStatus = 'pending') {
    const stageState = PROGRESS_STAGES.map(stage => ({
        ...stage,
        completed: false,
        lastUpdatedAt: null,
        summary: null
    }));

    let derivedPercent = 0;
    let currentStageKey = 'planning';

    for (const update of updates) {
        const stage = PROGRESS_STAGE_MAP[update.stageKey] || PROGRESS_STAGES[0];
        const index = stageState.findIndex(s => s.key === stage.key);

        if (index >= 0) {
            stageState[index].completed = true;
            stageState[index].lastUpdatedAt = update.createdAt;
            stageState[index].summary = update.content;

            for (let i = 0; i < index; i++) {
                stageState[i].completed = true;
            }

            currentStageKey = stage.key;
            const stagePercent = Math.round((stage.order / PROGRESS_STAGES.length) * 100);
            derivedPercent = Math.max(derivedPercent, stagePercent);
        }

        if (typeof update.progressPercent === 'number') {
            derivedPercent = Math.max(derivedPercent, update.progressPercent);
        }
    }

    if (issueStatus === 'resolved') {
        derivedPercent = 100;
        currentStageKey = 'completion';
        const completionStage = stageState.find(s => s.key === 'completion');
        if (completionStage) completionStage.completed = true;
    }

    return {
        progressPercent: Math.min(100, Math.max(0, derivedPercent)),
        currentStageKey,
        stages: stageState
    };
}

// GET /api/issues/complaints - Get all Complaints (Authority/Admin only)
router.get('/complaints/all', authenticate, isAuthority, async (req, res) => {
    try {
        const authority = await Authority.findOne({ userId: req.user._id });
        if (!authority && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Authority profile not found' });
        }

        let query = {};
        if (req.user.role !== 'admin') {
            // For authorities, only show Complaints in their district
            // Alternatively, only show Complaints for issues assigned to them
            // Let's show all Complaints in their jurisdiction district for better transparency
            const districts = new Set();
            if (authority.jurisdictionDistrict) districts.add(authority.jurisdictionDistrict);
            
            if (authority.mergedAuthorities) {
                authority.mergedAuthorities.forEach(m => {
                    if (m.jurisdictionDistrict) districts.add(m.jurisdictionDistrict);
                });
            }

            const issuesInJurisdiction = await Issue.find({ 
                district: { $in: Array.from(districts) } 
            }).select('_id');
            const issueIds = issuesInJurisdiction.map(i => i._id);
            
            query.issueId = { $in: issueIds };
        }

        const complaints = await Complaint.find(query)
            .populate('issueId', 'title district state status')
            .populate('filedBy', 'displayName username')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ complaints });
    } catch (error) {
        console.error('Get all Complaints error:', error);
        res.status(500).json({ error: 'Error fetching Complaints' });
    }
});

const Complaint = require('../models/Complaint');

// POST /api/issues/:id/complaint - File a Complaint for an issue
router.post('/:id/complaint', authenticate, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        // Check if user is the reporter
        if (issue.reportedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the reporter can file a Complaint' });
        }

        // Check if Complaint already exists
        const existingComplaint = await Complaint.findOne({ issueId: issue._id });
        if (existingComplaint) {
            return res.status(400).json({ error: 'Complaint already filed for this issue', complaint: existingComplaint });
        }

        const { reason, description } = req.body;
        
        // Validate reason
        const validReasons = ['declined_unsatisfied', 'no_acceptance_72h', 'no_update_72h'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Invalid Complaint reason' });
        }

        // Check conditions
        const now = new Date();
        const seventyTwoHoursAgo = new Date(now.getTime() - (72 * 60 * 60 * 1000));
        
        let canFile = false;
        if (reason === 'declined_unsatisfied') {
            if (issue.status === 'denied' && issue.isDissatisfied) {
                canFile = true;
            } else {
                return res.status(400).json({ error: 'Issue must be denied and marked as dissatisfied' });
            }
        } else if (reason === 'no_acceptance_72h') {
            if (issue.status === 'pending' && issue.createdAt < seventyTwoHoursAgo) {
                canFile = true;
            } else {
                return res.status(400).json({ error: 'Issue has not reached the 72-hour mark for non-acceptance' });
            }
        } else if (reason === 'no_update_72h') {
            const lastUpdate = await IssueUpdate.findOne({ issueId: issue._id }).sort({ createdAt: -1 });
            const lastTime = lastUpdate ? lastUpdate.createdAt : issue.createdAt;
            
            if (lastTime < seventyTwoHoursAgo && issue.status !== 'resolved' && issue.status !== 'denied') {
                canFile = true;
            } else {
                return res.status(400).json({ error: 'There has been a recent update or the issue is closed' });
            }
        }

        if (!canFile) {
            return res.status(400).json({ error: 'Complaint filing conditions not met' });
        }

        const complaint = new Complaint({
            issueId: issue._id,
            filedBy: req.user._id,
            reason,
            description,
            status: 'submitted'
        });

        await complaint.save();

        // Notify authorities?
        if (issue.assignedAuthority) {
            // We need to find the user ID associated with the authority
            const authorityUser = await Authority.findById(issue.assignedAuthority).select('userId');
            if (authorityUser && authorityUser.userId) {
                await createNotification({
                    userId: authorityUser.userId,
                    type: 'complaint_filed',
                    title: 'Complaint Filed',
                    message: `A Complaint has been filed for the issue: "${issue.title}".`,
                    metadata: {
                        issueId: issue._id,
                        complaintId: complaint._id,
                        issueTitle: issue.title
                    }
                });
            }
        }

        res.status(201).json({ 
            message: 'Complaint filed successfully', 
            complaint: {
                id: complaint._id,
                referenceNumber: complaint.complaintReferenceNumber,
                status: complaint.status
            }
        });

    } catch (error) {
        console.error('File Complaint error:', error);
        res.status(500).json({ error: 'Error filing Complaint' });
    }
});

// GET /api/issues/:id/complaint - Get Complaint details for an issue
router.get('/:id/complaint', optionalAuth, async (req, res) => {
    try {
        const complaint = await Complaint.findOne({ issueId: req.params.id })
            .populate('filedBy', 'displayName username')
            .lean();

        res.json({ complaint });
    } catch (error) {
        console.error('Get Complaint error:', error);
        res.status(500).json({ error: 'Error fetching Complaint details' });
    }
});

// POST /api/issues/:id/dissatisfied - Mark as dissatisfied
router.post('/:id/dissatisfied', authenticate, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        if (issue.reportedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the reporter can mark as dissatisfied' });
        }

        if (issue.status !== 'denied' && issue.status !== 'resolved') {
            return res.status(400).json({ error: 'Dissatisfaction can only be expressed for closed issues' });
        }

        issue.isDissatisfied = true;
        await issue.save();

        res.json({ message: 'Marked as dissatisfied. You can now file a Complaint if needed.' });
    } catch (error) {
        console.error('Mark dissatisfied error:', error);
        res.status(500).json({ error: 'Error marking as dissatisfied' });
    }
});

// POST /api/issues/merge - Merge multiple issues (Authority only)
router.post('/merge', authenticate, isAuthority, async (req, res) => {
    try {
        const { primaryIssueId, secondaryIssueIds } = req.body;

        if (!primaryIssueId || !secondaryIssueIds || !Array.isArray(secondaryIssueIds) || secondaryIssueIds.length === 0) {
            return res.status(400).json({ error: 'Primary issue ID and at least one secondary issue ID are required' });
        }

        const primaryIssue = await Issue.findById(primaryIssueId);
        if (!primaryIssue) {
            return res.status(404).json({ error: 'Primary issue not found' });
        }

        // Verify authority is assigned to the primary issue or has jurisdiction
        // For simplicity, we'll check if the authority is assigned or if it's in their district
        const authority = await Authority.findOne({ userId: req.user._id });
        if (!authority) {
            return res.status(403).json({ error: 'Authority profile not found' });
        }

        if (primaryIssue.district.toLowerCase() !== authority.jurisdictionDistrict.toLowerCase()) {
            return res.status(403).json({ error: 'You can only merge issues within your jurisdiction' });
        }

        // Update secondary issues
        const updateResult = await Issue.updateMany(
            { _id: { $in: secondaryIssueIds }, district: primaryIssue.district },
            { 
                $set: { 
                    isMerged: true, 
                    mergedInto: primaryIssueId,
                    status: 'resolved', // Mark secondary issues as resolved/merged
                    updatedAt: new Date()
                } 
            }
        );

        // Notify reporters of secondary issues
        const secondaryIssues = await Issue.find({ _id: { $in: secondaryIssueIds } }).populate('reportedBy');
        for (const issue of secondaryIssues) {
            await createNotification({
                userId: issue.reportedBy._id,
                type: 'issue_merged',
                title: 'Issue Merged',
                message: `Your issue "${issue.title}" has been merged into a similar issue: "${primaryIssue.title}". You can follow the primary issue for updates.`,
                metadata: {
                    issueId: primaryIssueId,
                    issueTitle: primaryIssue.title,
                    originalIssueId: issue._id
                }
            });
        }

        res.json({ 
            message: `Successfully merged ${updateResult.modifiedCount} issues into the primary issue.`,
            mergedCount: updateResult.modifiedCount
        });

    } catch (error) {
        console.error('Merge issues error:', error);
        res.status(500).json({ error: 'Error merging issues' });
    }
});

// POST /api/issues/:id/unmerge - Unmerge a previously merged issue
router.post('/:id/unmerge', authenticate, isAuthority, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id)
            .populate('reportedBy')
            .populate('pendingMergeRequest.from')
            .populate('pendingMergeRequest.to');
            
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        const authority = await Authority.findOne({ userId: req.user._id });
        if (!authority) {
            return res.status(403).json({ error: 'Authority profile not found' });
        }

        // Case 1: Authority Collaboration Unmerge
        if (issue.pendingMergeRequest && issue.pendingMergeRequest.status === 'accepted') {
            const isFrom = issue.pendingMergeRequest.from._id.equals(authority._id);
            const isTo = issue.pendingMergeRequest.to._id.equals(authority._id);
            
            if (!isFrom && !isTo && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Only participating authorities can unmerge this collaboration' });
            }

            // Revert assigned authority to the original 'from' authority
            const originalAuthority = issue.pendingMergeRequest.from;
            issue.assignedAuthority = originalAuthority._id;
            
            // Clear merge request
            issue.pendingMergeRequest = {
                from: null,
                to: null,
                status: null
            };
            
            issue.updatedAt = new Date();
            await issue.save();

            // Notify the other authority
            const otherAuth = isFrom ? issue.pendingMergeRequest.to : issue.pendingMergeRequest.from;
            if (otherAuth && otherAuth.userId) {
                await createNotification({
                    userId: otherAuth.userId,
                    type: 'issue_unmerged_collaboration',
                    title: 'Collaboration Ended',
                    message: `The collaboration on issue "${issue.title}" has been ended by ${authority.designation}.`,
                    metadata: {
                        issueId: issue._id,
                        issueTitle: issue.title
                    }
                });
            }

            return res.json({ 
                message: 'Collaboration successfully ended. Issue reverted to original authority.',
                issue
            });
        }

        // Case 2: Citizen Merged Issue Unmerge
        if (issue.isMerged) {
            if (issue.district.toLowerCase() !== authority.jurisdictionDistrict.toLowerCase() && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'You can only unmerge issues within your jurisdiction' });
            }

            // Reset issue fields
            issue.isMerged = false;
            issue.mergedInto = null;
            issue.status = 'pending';
            issue.updatedAt = new Date();
            await issue.save();

            // Notify reporter
            await createNotification({
                userId: issue.reportedBy._id,
                type: 'issue_unmerged',
                title: 'Issue Unmerged',
                message: `Your issue "${issue.title}" has been unmerged from the primary issue and is now active again.`,
                metadata: {
                    issueId: issue._id,
                    issueTitle: issue.title
                }
            });

            return res.json({ 
                message: 'Issue successfully unmerged.',
                issue
            });
        }

        return res.status(400).json({ error: 'This issue is not merged or in collaboration' });

    } catch (error) {
        console.error('Unmerge issue error:', error);
        res.status(500).json({ error: 'Error unmerging issue' });
    }
});

// Get nearby issues based on location
router.get('/nearby', optionalAuth, async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusKm = parseFloat(radius);

        if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusKm)) {
            return res.status(400).json({ error: 'Invalid coordinates or radius' });
        }

        // Find issues within radius using MongoDB geospatial query
        // Convert radius from km to radians (radius / earth radius in km)
        const radiusInRadians = radiusKm / 6371;

        const issues = await Issue.find({
            latitude: { $exists: true },
            longitude: { $exists: true },
            $expr: {
                $lte: [
                    {
                        $sqrt: {
                            $add: [
                                { $pow: [{ $subtract: ['$latitude', latitude] }, 2] },
                                { $pow: [{ $subtract: ['$longitude', longitude] }, 2] }
                            ]
                        }
                    },
                    radiusInRadians
                ]
            }
        })
            .limit(100)
            .sort({ upvoteCount: -1, createdAt: -1 })
            .select('title description category district state status createdAt upvoteCount reportedBy assignedAuthority')
            .populate({ path: 'reportedBy', select: 'displayName username avatar', options: { lean: true } })
            .populate({ path: 'assignedAuthority', select: 'name', options: { lean: true } })
            .populate({ path: 'pendingMergeRequest.from', populate: { path: 'userId', select: 'displayName' } })
            .populate({ path: 'pendingMergeRequest.to', populate: { path: 'userId', select: 'displayName' } })
            .lean();

        // Format issues for anonymous display
        const formattedIssues = issues.map(issue => {
            if (issue.isAnonymous && issue.reportedBy) {
                const canSeeReporter = req.user && (
                    issue.reportedBy._id?.toString() === req.user._id.toString() ||
                    issue.reportedBy._id === req.user._id
                );
                if (!canSeeReporter) {
                    issue.reportedBy = {
                        displayName: 'Anonymous Citizen',
                        username: 'anonymous',
                        avatar: null
                    };
                }
            }
            return issue;
        });

        res.json({ 
            issues: formattedIssues,
            count: formattedIssues.length,
            radius: radiusKm,
            center: { lat: latitude, lng: longitude }
        });
    } catch (error) {
        console.error('Get nearby issues error:', error);
        res.status(500).json({ error: 'Error fetching nearby issues' });
    }
});

// Get all issues (with filters)
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { district, status, category, sort, page = 1, limit = 20, verifiedOnly, q, assignedTo } = req.query;
        let query = {};
        const districtQuery = district ? {
            district: { $in: (Array.isArray(district) ? district : district.split(',')).map(d => new RegExp(`^${escapeRegex(String(d).trim())}$`, 'i')) }
        } : null;

        const categoryQuery = category ? {
            category: { $in: (Array.isArray(category) ? category : category.split(',')).map(c => new RegExp(`^${escapeRegex(String(c).trim())}$`, 'i')) }
        } : null;

        const mergeRequestInvolvedQuery = req.query.mergeRequestInvolved ? {
            $or: [
                { 'pendingMergeRequest.from': req.query.mergeRequestInvolved },
                { 'pendingMergeRequest.to': req.query.mergeRequestInvolved }
            ]
        } : null;

        if (districtQuery || categoryQuery || mergeRequestInvolvedQuery) {
            const conditions = [];
            
            // Standard filters (district + category)
            if (districtQuery || categoryQuery) {
                const standardFilters = {};
                if (districtQuery) Object.assign(standardFilters, districtQuery);
                if (categoryQuery) Object.assign(standardFilters, categoryQuery);
                conditions.push(standardFilters);
            }
            
            // Involvement filter
            if (mergeRequestInvolvedQuery) {
                conditions.push(mergeRequestInvolvedQuery);
            }
            
            if (conditions.length > 1) {
                query.$or = conditions;
            } else if (conditions.length === 1) {
                Object.assign(query, conditions[0]);
            }
        }

        if (status) {
            const normalizedStatus = String(status).trim().toLowerCase().replace(/-/g, '_');
            query.status = normalizedStatus;
        }

        if (assignedTo) {
            query.assignedAuthority = assignedTo;
        }

        if (req.query.isMerged === 'true') {
            query.isMerged = true;
        } else if (req.query.isMerged === 'false') {
            query.isMerged = false;
        }

        if (req.query.mergeRequestFrom) {
            query['pendingMergeRequest.from'] = req.query.mergeRequestFrom;
        }
        if (req.query.mergeRequestTo) {
            query['pendingMergeRequest.to'] = req.query.mergeRequestTo;
        }
        if (req.query.mergeRequestStatus) {
            query['pendingMergeRequest.status'] = req.query.mergeRequestStatus;
        }

        if (q && String(q).trim()) {
            const searchRegex = new RegExp(escapeRegex(String(q).trim()), 'i');
            const searchFields = [
                { title: searchRegex },
                { description: searchRegex },
                { category: searchRegex },
                { district: searchRegex },
                { state: searchRegex }
            ];
            
            if (query.$or) {
                query.$and = query.$and || [];
                query.$and.push({ $or: searchFields });
            } else {
                query.$or = searchFields;
            }
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'upvotes') sortOption = { upvoteCount: -1 };
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'severity') sortOption = { severityScore: -1 };

        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 50); // Cap at 50 for safety
        const skip = (pageNum - 1) * limitNum;

        // Build populate options with conditional match for verified users
        let populateOptions = {
            path: 'reportedBy',
            select: 'displayName username avatar isVerified isAadhaarVerified',
            options: { lean: true }
        };

        // If verifiedOnly filter is set, add match condition
        if (verifiedOnly === 'true') {
            populateOptions.match = {
                $or: [
                    { isVerified: true },
                    { isAadhaarVerified: true }
                ]
            };
        }

        const issues = await Issue.find(query)
            .select('title description category district state status createdAt upvoteCount severityScore reportedBy assignedAuthority images isFeatured isPetition resolvedAt updatedAt draftRemarks publishedRemarks')
            .sort(sortOption)
            .skip(skip)
            .limit(limitNum)
            .populate(populateOptions)
            .populate({ path: 'assignedAuthority', select: 'name userId', populate: { path: 'userId', select: 'displayName' }, options: { lean: true } })
            .lean();

        // Filter out issues where reportedBy is null (when verified filter doesn't match)
        const filteredIssues = verifiedOnly === 'true' 
            ? issues.filter(issue => issue.reportedBy !== null)
            : issues;

        const total = await Issue.countDocuments(query);

        // Format issues for anonymous display and prepare response
        const formattedIssues = filteredIssues.map(issue => {
            if (issue.isAnonymous) {
                const canSeeReporter = req.user && issue.reportedBy && (
                    issue.reportedBy._id?.toString() === req.user._id.toString() ||
                    issue.reportedBy._id === req.user._id
                );
                if (!canSeeReporter) {
                    issue.reportedBy = {
                        displayName: 'Anonymous Citizen',
                        username: 'anonymous',
                        avatar: null
                    };
                }
            }
            return issue;
        });

        res.json({ 
            issues: formattedIssues,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: verifiedOnly === 'true' ? formattedIssues.length : total,
                totalPages: Math.ceil((verifiedOnly === 'true' ? formattedIssues.length : total) / limitNum),
                hasMore: skip + filteredIssues.length < (verifiedOnly === 'true' ? formattedIssues.length : total)
            }
        });
    } catch (error) {
        console.error('Get issues error:', error);
        res.status(500).json({ error: 'Error fetching issues' });
    }
});

// Get single issue by ID
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id)
            .populate({ path: 'reportedBy', select: 'displayName username name email avatar district isVerified isAadhaarVerified', options: { lean: true } })
            .populate({ path: 'assignedAuthority', select: 'name email', options: { lean: true } })
            .populate({ path: 'pendingMergeRequest.from', populate: { path: 'userId', select: 'displayName' } })
            .populate({ path: 'pendingMergeRequest.to', populate: { path: 'userId', select: 'displayName' } });

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Increment view count
        issue.viewCount = (issue.viewCount || 0) + 1;
        await issue.save();

        // Check if current user has upvoted
        let hasUpvoted = false;
        let isFollowing = false;
        if (req.user) {
            const upvote = await Upvote.findOne({ userId: req.user._id, issueId: issue._id });
            hasUpvoted = !!upvote;
            
            const follower = await IssueFollower.findOne({ userId: req.user._id, issueId: issue._id });
            isFollowing = !!follower;
        }

        // Format for anonymous display
        const formattedIssue = formatIssueForDisplay(issue, req.user?._id);

        res.json({ issue: formattedIssue, hasUpvoted, isFollowing });
    } catch (error) {
        console.error('Get issue error:', error);
        res.status(500).json({ error: 'Error fetching issue' });
    }
});

// Upload images for issue
router.post('/upload-images', authenticate, upload.array('images', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                error: 'No images uploaded',
                code: 'NO_FILES'
            });
        }

        // Validate uploaded files before processing
        const uploadedImages = req.files.map(file => {
            if (!file.path || !file.filename) {
                throw new Error('Invalid file upload response from Cloudinary');
            }

            return {
                url: file.path,
                publicId: file.filename,
                // Store metadata for reference
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            };
        });

        // Log successful uploads
        console.log(`✅ Successfully uploaded ${uploadedImages.length} image(s)`);

        res.json({ 
            message: `${uploadedImages.length} image(s) uploaded successfully`,
            images: uploadedImages,
            count: uploadedImages.length
        });
    } catch (error) {
        console.error('❌ Upload images error:', error);
        
        // Provide specific error messages
        let errorMessage = 'Error uploading images';
        let statusCode = 500;

        if (error.message.includes('Invalid file type')) {
            errorMessage = error.message;
            statusCode = 400;
        } else if (error.message.includes('File too large')) {
            errorMessage = 'One or more files exceed the 10MB size limit';
            statusCode = 413;
        } else if (error.message.includes('Too many files')) {
            errorMessage = 'Maximum 5 images allowed per upload';
            statusCode = 400;
        }

        res.status(statusCode).json({ 
            error: errorMessage,
            code: 'UPLOAD_ERROR'
        });
    }
});

// Helper to handle multer upload errors
const handleUpload = (req, res, next) => {
    upload.array('images', 5)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            return res.status(400).json({ error: 'Upload Error', message: err.message });
        } else if (err) {
            // An unknown error occurred when uploading.
            return res.status(400).json({ error: 'File Error', message: err.message });
        }
        // Everything went fine.
        next();
    });
};

// Create new issue
router.post('/', authenticate, requireVerification, async (req, res) => {
    try {
        const { title, description, category, district, state, latitude, longitude, images, isAnonymous } = req.body;
        
        // Moderate content before creating issue
        const moderationResult = await moderateMultipleFields({
            title: title,
            description: description
        });

        if (moderationResult.isViolation) {
            console.log('Content moderation blocked issue:', moderationResult);
            return res.status(400).json({ 
                error: 'Content Policy Violation',
                message: 'Your submission contains content that violates our community guidelines. Please revise and try again.',
                details: moderationResult.message,
                violations: moderationResult.violations
            });
        }

        // Check for duplicate issues in same district
        const duplicateCheck = await findSimilarIssue(title, district, 70);
        
        if (duplicateCheck) {
            return res.status(409).json({
                error: 'Duplicate Issue Detected',
                message: 'A similar issue already exists in your district.',
                similarIssue: {
                    id: duplicateCheck.similarIssue._id,
                    title: duplicateCheck.similarIssue.title,
                    status: duplicateCheck.similarIssue.status,
                    createdAt: duplicateCheck.similarIssue.createdAt
                },
                similarity: duplicateCheck.similarity
            });
        }

        const issue = new Issue({
            title,
            description,
            category,
            district,
            state,
            latitude,
            longitude,
            images: images || [],
            reportedBy: req.user._id,
            isAnonymous: isAnonymous || false
        });

        await issue.save();
        
        // Populate reporter info conditionally based on anonymous status
        if (!issue.isAnonymous) {
            await issue.populate('reportedBy', 'name avatar displayName username');
        }

        // Emit real-time event for issue creation
        const io = req.app.get('io');
        if (io) {
            io.to(`district_${district}`).emit('issue_created', {
                issue: formatIssueForDisplay(issue),
                district
            });
        }

        res.status(201).json({
            message: 'Issue created successfully',
            issue
        });
    } catch (error) {
        console.error('Create issue error:', error);
        res.status(500).json({ error: 'Error creating issue' });
    }
});

// Save draft remarks for an issue
router.post('/:id/draft-remarks', authenticate, isAuthority, async (req, res) => {
    try {
        const { draftRemarks } = req.body;
        const issue = await Issue.findById(req.params.id);
        
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Check if the authority is assigned to this issue (handles both Authority ID and legacy User ID)
        const isAssigned = 
            issue.assignedAuthority?.toString() === authority._id.toString() || 
            issue.assignedAuthority?.toString() === req.user._id.toString();

        if (!authority || !isAssigned) {
            return res.status(403).json({ error: 'You are not assigned to this issue' });
        }

        issue.draftRemarks = draftRemarks;
        await issue.save();

        res.json({ message: 'Draft remarks saved successfully', draftRemarks: issue.draftRemarks });
    } catch (error) {
        console.error('Save draft remarks error:', error);
        res.status(500).json({ error: 'Error saving draft remarks' });
    }
});

// Publish draft remarks as a success story
router.post('/:id/publish-remarks', authenticate, isAuthority, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        if (issue.status !== 'resolved') {
            return res.status(400).json({ error: 'Only resolved issues can be published as success stories' });
        }

        const authority = await Authority.findOne({ userId: req.user._id });
        // Check if the authority is assigned to this issue (handles both Authority ID and legacy User ID)
        const isAssigned = 
            issue.assignedAuthority?.toString() === authority?._id?.toString() || 
            issue.assignedAuthority?.toString() === req.user._id.toString();

        if (!authority || !isAssigned) {
            return res.status(403).json({ error: 'You are not assigned to this issue' });
        }

        if (!issue.draftRemarks || !issue.draftRemarks.trim()) {
            return res.status(400).json({ error: 'No draft remarks to publish' });
        }

        issue.publishedRemarks = issue.draftRemarks;
        issue.draftRemarks = ""; // Clear draft after publishing
        await issue.save();

        res.json({ message: 'Success story published!', publishedRemarks: issue.publishedRemarks });
    } catch (error) {
        console.error('Publish remarks error:', error);
        res.status(500).json({ error: 'Error publishing success story' });
    }
});

// POST /:id/citizen-update - Add an update to an issue (reporter only)
router.post('/:id/citizen-update', authenticate, upload.array('images', 5), async (req, res) => {
    try {
        const { content } = req.body;
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Check if user is the reporter of the issue
        if (issue.reportedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the reporter of the issue can post citizen updates' });
        }

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Update content is required' });
        }

        const images = (req.files || []).map(file => ({
            url: file.path,
            publicId: file.filename
        }));

        const update = {
            content: content.trim(),
            images,
            createdAt: new Date()
        };

        issue.citizenUpdates.push(update);
        await issue.save();

        // Emit real-time event for citizen update
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('citizen_update_posted', {
                issueId: issue._id,
                update
            });
        }

        res.status(201).json({
            message: 'Citizen update posted successfully',
            update
        });
    } catch (error) {
        console.error('Post citizen update error:', error);
        res.status(500).json({ error: 'Error posting citizen update' });
    }
});

// Upvote/unupvote issue
router.post('/:id/upvote', authenticate, requireVerification, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Validate authenticated user
        if (!req.user || !req.user._id) {
            console.error('Upvote attempted without authenticated user');
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = req.user._id;

        // Ensure issue id is valid
        if (!issue._id) {
            console.error('Upvote attempted with invalid issue id:', req.params.id);
            return res.status(400).json({ error: 'Invalid issue id' });
        }

        // Check if user is trying to upvote their own issue
        if (issue.reportedBy.toString() === userId.toString()) {
            return res.status(403).json({ error: 'You cannot upvote your own issue' });
        }

        const existingUpvote = await Upvote.findOne({ userId, issueId: issue._id });

        if (existingUpvote) {
            // Remove upvote
            await Upvote.deleteOne({ _id: existingUpvote._id });
            // Recompute authoritative upvote count from DB after deletion
            const updatedCount = await Upvote.countDocuments({ issueId: issue._id });
            issue.upvoteCount = updatedCount;
            issue.severityScore = await issue.calculateSeverityScore();
            await issue.save();
            
            res.json({
                message: 'Upvote removed',
                upvoteCount: issue.upvoteCount,
                severityScore: issue.severityScore,
                hasUpvoted: false
            });
        } else {
            // Add upvote
            try {
                await Upvote.create({ userId, issueId: issue._id });
            } catch (createErr) {
                // Handle duplicate-key race where upvote was created concurrently
                if (createErr && createErr.code === 11000) {
                    console.warn('Duplicate upvote prevented by unique index', { issueId: issue._id, userId });
                    // Recompute authoritative upvote count from DB
                    const actualCount = await Upvote.countDocuments({ issueId: issue._id });
                    issue.upvoteCount = actualCount;
                    issue.severityScore = await issue.calculateSeverityScore();
                    await issue.save();

                    return res.json({
                        message: 'Issue upvoted',
                        upvoteCount: issue.upvoteCount,
                        severityScore: issue.severityScore,
                        hasUpvoted: true
                    });
                }

                // Re-throw other errors
                throw createErr;
            }

            // Recompute authoritative upvote count from DB to avoid drift
            const newCount = await Upvote.countDocuments({ issueId: issue._id });
            issue.upvoteCount = newCount;
            issue.severityScore = await issue.calculateSeverityScore();
            await issue.save();
            
            // Emit real-time event for upvote
            const io = req.app.get('io');
            if (io) {
                io.to(`issue_${issue._id}`).emit('issue_upvoted', {
                    issueId: issue._id,
                    upvotes: issue.upvoteCount,
                    severityScore: issue.severityScore,
                    hasUpvoted: true
                });
            }
            // Create a notification for the issue reporter about the new upvote
            try {
                const notif = await createNotification({
                    userId: issue.reportedBy,
                    type: 'upvote',
                    title: 'New Upvote',
                    message: `${req.user.name || 'Someone'} upvoted your issue "${issue.title}"`,
                    metadata: {
                        issueId: issue._id,
                        upvoterId: req.user._id
                    }
                });

                // Optionally emit realtime notification event to the user room
                if (io) {
                    io.to(`user_${issue.reportedBy}`).emit('notification_created', { notification: notif });
                }
            } catch (e) {
                console.error('Error creating upvote notification:', e);
            }
            
            // Check if issue reached 10,000 upvotes and create petition automatically
            let petitionCreated = false;
            if (issue.upvoteCount >= 10000 && !issue.isPetition) {
                try {
                    // Check if petition already exists
                    const existingPetition = await Petition.findOne({ issueId: issue._id });
                    
                    if (!existingPetition) {
                        // Create petition
                        const petition = await Petition.create({
                            issueId: issue._id,
                            status: 'pending',
                            upvoteCountAtCreation: issue.upvoteCount,
                            petitionDocument: {
                                title: issue.title,
                                description: issue.description,
                                district: issue.district,
                                state: issue.state,
                                category: issue.category,
                                upvoteCount: issue.upvoteCount,
                                dateReported: issue.createdAt
                            }
                        });
                        
                        // Mark issue as petition
                        issue.isPetition = true;
                        issue.petitionCreatedAt = new Date();
                        await issue.save();
                        
                        petitionCreated = true;
                        console.log(`✨ Petition created for issue ${issue._id} with ${issue.upvoteCount} upvotes`);
                    }
                } catch (petitionError) {
                    console.error('Error creating petition:', petitionError);
                    // Don't fail the upvote if petition creation fails
                }
            }
            
            // Check for viral promotion (500 upvotes)
            let viralPromotionTriggered = false;
            if (issue.upvoteCount >= 500 && !issue.isPanIndiaFeatured) {
                issue.isPanIndiaFeatured = true;
                await issue.save();
                viralPromotionTriggered = true;
                console.log(`🔥 Issue ${issue._id} promoted to Pan-India featured with ${issue.upvoteCount} upvotes`);
            }
            
            res.json({
                message: 'Issue upvoted',
                upvoteCount: issue.upvoteCount,
                severityScore: issue.severityScore,
                hasUpvoted: true,
                petitionCreated,
                isPetition: issue.isPetition,
                isPanIndiaFeatured: issue.isPanIndiaFeatured,
                viralPromotionTriggered
            });
        }
    } catch (error) {
        console.error('Upvote error:', error);
        res.status(500).json({ error: 'Error updating upvote' });
    }
});

// Update issue status (authorities only)
router.patch('/:id/status', authenticate, isAuthority, async (req, res) => {
    try {
        const { status } = req.body;
        const issue = await Issue.findById(req.params.id).populate('reportedBy');

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        const oldStatus = issue.status;
        issue.status = status;
        issue.updatedAt = new Date();

        if (status === 'accepted' && !issue.assignedAuthority) {
            const authority = await Authority.findOne({ userId: req.user._id });
            if (authority) {
                issue.assignedAuthority = authority._id;
            } else {
                // Fallback to user ID if authority profile not found, 
                // but this shouldn't happen due to isAuthority middleware
                issue.assignedAuthority = req.user._id;
            }
        }

        // Handle resolved status
        if (status === 'resolved' && oldStatus !== 'resolved') {
            issue.resolvedAt = new Date();
            
            // Update authority's issuesResolved counter
            if (issue.assignedAuthority) {
                const authority = await Authority.findById(issue.assignedAuthority);
                if (authority) {
                    authority.issuesResolved += 1;
                    await authority.save();
                    
                    // Update badge
                    await updateAuthorityBadge(authority._id);
                }
            }
            
            // Audit log for resolved
            await createAuditLog({
                actorId: req.user._id,
                action: 'issue_resolved',
                entityType: 'Issue',
                entityId: issue._id,
                metadata: { oldStatus, newStatus: status, title: issue.title }
            });
        }

        await issue.save();

        // Emit real-time event for status update
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('issue_status_updated', {
                issueId: issue._id,
                status: status,
                statusBy: req.user.name
            });
            
            // Emit resolved event if resolved
            if (status === 'resolved' && oldStatus !== 'resolved') {
                io.to(`issue_${issue._id}`).emit('issue_resolved', {
                    issueId: issue._id,
                    resolvedBy: req.user.name
                });
            }
        }

        // Send notification for status change
        if (oldStatus !== status && issue.reportedBy._id.toString() !== req.user._id.toString()) {
            if (status === 'accepted') {
                await notifyIssueAccepted(issue, req.user);
            } else {
                await notifyIssueStatusUpdate(issue, status, req.user);
            }
        }

        // Notify followers about status change
        const followers = await IssueFollower.find({ issueId: issue._id }).lean();
        for (const follower of followers) {
            // Don't notify the user who made the change or the reporter (already notified)
            if (follower.userId.toString() !== req.user._id.toString() && 
                follower.userId.toString() !== issue.reportedBy._id.toString()) {
                await Notification.create({
                    recipientId: follower.userId,
                    type: 'issue_status_change',
                    title: 'Issue Status Changed',
                    message: `An issue you're following changed status to ${status}`,
                    link: `/issue.html?id=${issue._id}`,
                    metadata: {
                        issueId: issue._id,
                        issueTitle: issue.title,
                        oldStatus,
                        newStatus: status
                    }
                });
            }
        }

        res.json({
            message: 'Issue status updated',
            issue
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Error updating status' });
    }
});

// Accept issue (authorities only)
router.post('/:id/accept', authenticate, isAuthority, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can accept issues' });
        }
        const { deadline } = req.body;
        const issue = await Issue.findById(req.params.id).populate('reportedBy');

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Validate deadline
        if (!deadline) {
            return res.status(400).json({ error: 'Deadline is required when accepting an issue' });
        }

        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
            return res.status(400).json({ error: 'Deadline must be a valid future date' });
        }

        // Update issue status to accepted
        issue.status = 'accepted';
        issue.updatedAt = new Date();
        issue.deadline = deadlineDate;
        
        // Assign authority if not already assigned
        const authority = await Authority.findOne({ userId: req.user._id });
        if (!issue.assignedAuthority) {
            issue.assignedAuthority = authority ? authority._id : req.user._id;
        }

        // Update authority's issuesAccepted counter
        if (authority) {
            authority.issuesAccepted += 1;
            await authority.save();
        }

        await issue.save();
        await issue.populate('assignedAuthority', 'name email');

        // Emit real-time event for issue acceptance
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('issue_status_updated', {
                issueId: issue._id,
                status: 'accepted',
                statusBy: req.user.name
            });
        }

        // Send notification to issue reporter
        if (issue.reportedBy._id.toString() !== req.user._id.toString()) {
            await notifyIssueAccepted(issue, req.user);
        }

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_accepted',
            entityType: 'Issue',
            entityId: issue._id,
            metadata: { title: issue.title, deadline: deadlineDate }
        });

        res.json({
            message: 'Issue accepted successfully',
            issue,
            deadline: deadlineDate
        });
    } catch (error) {
        console.error('Accept issue error:', error);
        res.status(500).json({ error: 'Error accepting issue' });
    }
});

// Deny issue (authorities only)
router.post('/:id/deny', authenticate, isAuthority, async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only authorities can deny issues' });
        }
        const { reason } = req.body;
        const issue = await Issue.findById(req.params.id).populate('reportedBy');

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Update issue status to denied
        issue.status = 'denied';
        issue.updatedAt = new Date();
        
        // Assign authority if not already assigned
        if (!issue.assignedAuthority) {
            const authority = await Authority.findOne({ userId: req.user._id });
            issue.assignedAuthority = authority ? authority._id : req.user._id;
        }

        await issue.save();
        await issue.populate('assignedAuthority', 'name email');

        // Send notification to issue reporter
        if (issue.reportedBy._id.toString() !== req.user._id.toString()) {
            await notifyIssueStatusUpdate(issue, 'denied', req.user);
        }

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_denied',
            entityType: 'Issue',
            entityId: issue._id,
            metadata: { title: issue.title, reason: reason || 'No reason provided' }
        });

        res.json({
            message: 'Issue denied successfully',
            issue,
            reason
        });
    } catch (error) {
        console.error('Deny issue error:', error);
        res.status(500).json({ error: 'Error denying issue' });
    }
});

// POST /api/issues/:id/merge-request - Send a merge request to another authority
router.post('/:id/merge-request', authenticate, isAuthority, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        const { targetAuthorityId } = req.body;
        if (!targetAuthorityId) return res.status(400).json({ error: 'Target authority ID is required' });

        const sourceAuthority = await Authority.findOne({ userId: req.user._id });
        const targetAuthority = await Authority.findById(targetAuthorityId).populate('userId');

        if (!sourceAuthority || !targetAuthority) {
            return res.status(404).json({ error: 'Authority not found' });
        }

        if (sourceAuthority._id.equals(targetAuthority._id)) {
            return res.status(400).json({ error: 'Cannot merge with yourself' });
        }

        // Update issue with pending merge request
        issue.pendingMergeRequest = {
            from: sourceAuthority._id,
            to: targetAuthority._id,
            status: 'pending'
        };
        await issue.save();

        // Create notification for target authority
        await createNotification({
            userId: targetAuthority.userId._id,
            type: 'issue_merge_request',
            title: 'Issue Merge Request',
            message: `${sourceAuthority.designation || 'An authority'} wants to merge issue "${issue.title}" with your department.`,
            metadata: {
                issueId: issue._id,
                issueTitle: issue.title,
                sourceAuthorityId: sourceAuthority._id,
                sourceAuthorityName: sourceAuthority.designation || 'Authority'
            }
        });

        res.json({ message: 'Merge request sent successfully' });
    } catch (error) {
        console.error('Merge request error:', error);
        res.status(500).json({ error: 'Error sending merge request' });
    }
});

// POST /api/issues/:id/merge-accept - Accept a merge request
router.post('/:id/merge-accept', authenticate, isAuthority, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        const { sourceAuthorityId } = req.body;
        const sourceAuthority = await Authority.findById(sourceAuthorityId).populate('userId');
        const targetAuthority = await Authority.findOne({ userId: req.user._id });

        if (!sourceAuthority || !targetAuthority) {
            return res.status(404).json({ error: 'Authority not found' });
        }

        const oldAuthorityName = sourceAuthority.designation || 'Previous Authority';
        const newAuthorityName = targetAuthority.designation || 'New Authority';

        issue.assignedAuthority = targetAuthority._id;
        issue.pendingMergeRequest.status = 'accepted';
        await issue.save();

        // Add a progress update about the merge
        const mergeUpdate = new IssueUpdate({
            issueId: issue._id,
            postedBy: targetAuthority._id,
            stageKey: 'planning',
            stageTitle: 'Authority Collaboration',
            content: `This issue has been merged from ${oldAuthorityName} to ${newAuthorityName} for better resolution.`,
            progressPercent: 10,
            createdAt: new Date()
        });
        await mergeUpdate.save();

        // Notify source authority that it was accepted
        await createNotification({
            userId: sourceAuthority.userId._id,
            type: 'issue_merge_accepted',
            title: 'Merge Request Accepted',
            message: `${newAuthorityName} has accepted the merge request for issue "${issue.title}".`,
            metadata: {
                issueId: issue._id,
                targetAuthorityId: targetAuthority._id
            }
        });

        res.json({ message: 'Merge request accepted successfully', issue });
    } catch (error) {
        console.error('Merge accept error:', error);
        res.status(500).json({ error: 'Error accepting merge request' });
    }
});

// POST /api/issues/:id/merge-reject - Reject a merge request
router.post('/:id/merge-reject', authenticate, isAuthority, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        const { sourceAuthorityId } = req.body;
        const sourceAuthority = await Authority.findById(sourceAuthorityId).populate('userId');
        const targetAuthority = await Authority.findOne({ userId: req.user._id });

        if (!sourceAuthority) return res.status(404).json({ error: 'Source authority not found' });

        // Update issue merge request status
        if (issue.pendingMergeRequest) {
            issue.pendingMergeRequest.status = 'rejected';
            await issue.save();
        }

        // Notify source authority that it was rejected
        await createNotification({
            userId: sourceAuthority.userId._id,
            type: 'issue_merge_rejected',
            title: 'Merge Request Rejected',
            message: `${targetAuthority?.designation || 'The authority'} has declined the merge request for issue "${issue?.title || 'your issue'}".`,
            metadata: {
                issueId: issue?._id,
                targetAuthorityId: targetAuthority?._id
            }
        });

        res.json({ message: 'Merge request rejected' });
    } catch (error) {
        console.error('Merge reject error:', error);
        res.status(500).json({ error: 'Error rejecting merge request' });
    }
});

// Delete issue (creator or admin only)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Check if user is reportedBy or admin
        if (issue.reportedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete this issue' });
        }

        await Issue.findByIdAndDelete(req.params.id);
        
        res.json({ message: 'Issue deleted successfully' });
    } catch (error) {
        console.error('Delete issue error:', error);
        res.status(500).json({ error: 'Error deleting issue' });
    }
});

// Get comments for an issue
router.get('/:id/comments', async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        const comments = await Comment.find({ issueId: req.params.id })
            .sort({ createdAt: 1 })
            .populate('authorId', 'name avatar role')
            .lean();

        res.json({ comments });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Error fetching comments' });
    }
});

// Add comment to an issue
router.post('/:id/comments', authenticate, requireVerification, async (req, res) => {
    try {
        const { body, parentCommentId } = req.body;

        const issue = await Issue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // If parentCommentId is provided, verify it exists
        if (parentCommentId) {
            const parentComment = await Comment.findById(parentCommentId);
            if (!parentComment) {
                return res.status(404).json({ error: 'Parent comment not found' });
            }
            // Ensure parent comment belongs to the same issue
            if (parentComment.issueId.toString() !== req.params.id) {
                return res.status(400).json({ error: 'Parent comment does not belong to this issue' });
            }
        }

        const comment = new Comment({
            body,
            authorId: req.user._id,
            issueId: req.params.id,
            parentCommentId: parentCommentId || null
        });

        await comment.save();
        await comment.populate('authorId', 'name avatar role');

        // Emit real-time event for comment
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('issue_comment_added', {
                issueId: issue._id,
                comment: comment
            });
        }

        res.status(201).json({
            message: 'Comment added successfully',
            comment
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Get national feed (India-wide issues with special sorting)
// Optimized India-wide feed endpoint with lean() and field selection
router.get('/feed/india', optionalAuth, async (req, res) => {
    try {
        const { filter = 'hot', page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        let issues = [];
        let total = 0;

        if (filter === 'hot') {
            // Hot: upvotes * recency (issues created within last 30 days, weighted by recency)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            issues = await Issue.aggregate([
                {
                    $match: {
                        createdAt: { $gte: thirtyDaysAgo }
                    }
                },
                {
                    $addFields: {
                        daysSinceCreation: {
                            $divide: [
                                { $subtract: [new Date(), '$createdAt'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    }
                },
                {
                    $addFields: {
                        hotScore: {
                            $divide: [
                                { $add: ['$upvoteCount', 1] },
                                { $add: ['$daysSinceCreation', 2] }
                            ]
                        }
                    }
                },
                { $sort: { hotScore: -1 } },
                { $skip: skip },
                { $limit: limitNum }
            ]);

            total = await Issue.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

        } else if (filter === 'trending') {
            const now = Date.now();
            if (now - trendingCache.lastUpdated < trendingCache.ttl && trendingCache.data) {
                console.log('Serving from cache');
                const cachedIssues = trendingCache.data;
                total = cachedIssues.length;
                issues = cachedIssues.slice(skip, skip + limitNum);
            } else {
                console.log('Fetching from DB');
                // Trending: fastest upvote growth in last 24h
                const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
                
                const recentUpvotes = await Upvote.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: twentyFourHoursAgo }
                        }
                    },
                    {
                        $group: {
                            _id: '$issueId',
                            recentUpvotes: { $sum: 1 }
                        }
                    },
                    { $sort: { recentUpvotes: -1 } },
                    { $limit: 100 } // Limit to top 100 trending issues
                ]);

                const issueIds = recentUpvotes.map(item => item._id);
                
                if (issueIds.length > 0) {
                    const issuesMap = {};
                    const issuesList = await Issue.find({ _id: { $in: issueIds } })
                        .select('title description category district state status createdAt upvoteCount severityScore reportedBy assignedAuthority')
                        .populate({ path: 'reportedBy', select: 'displayName username avatar', options: { lean: true } })
                        .populate({ path: 'assignedAuthority', select: 'name', options: { lean: true } })
                        .lean();
                    
                    issuesList.forEach(issue => {
                        issuesMap[issue._id.toString()] = issue;
                    });
                    
                    const allTrendingIssues = issueIds.map(id => issuesMap[id.toString()]).filter(Boolean);
                    
                    trendingCache.data = allTrendingIssues;
                    trendingCache.lastUpdated = now;
                    
                    issues = allTrendingIssues.slice(skip, skip + limitNum);
                    total = allTrendingIssues.length;
                }
            }

        } else if (filter === 'new') {
            // New: most recent issues
            issues = await Issue.find()
                .select('title description category district state status createdAt upvoteCount severityScore reportedBy assignedAuthority')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate({ path: 'reportedBy', select: 'displayName username avatar', options: { lean: true } })
                .populate({ path: 'assignedAuthority', select: 'name', options: { lean: true } })
                .lean();

            total = await Issue.countDocuments();

        } else if (filter === 'top') {
            // Top All Time: highest upvote count
            issues = await Issue.find()
                .select('title description category district state status createdAt upvoteCount severityScore reportedBy assignedAuthority')
                .sort({ upvoteCount: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate({ path: 'reportedBy', select: 'displayName username avatar', options: { lean: true } })
                .populate({ path: 'assignedAuthority', select: 'name', options: { lean: true } })
                .lean();

            total = await Issue.countDocuments();

        } else {
            return res.status(400).json({ error: 'Invalid filter. Use: hot, trending, new, or top' });
        }

        // Populate for aggregation results (hot filter)
        if (filter === 'hot' && issues.length > 0) {
            await Issue.populate(issues, [
                { path: 'reportedBy', select: 'displayName username avatar', options: { lean: true } },
                { path: 'assignedAuthority', select: 'name', options: { lean: true } }
            ]);
        }

        res.json({
            issues,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: skip + issues.length < total
            },
            filter
        });
    } catch (error) {
        console.error('Get India feed error:', error);
        res.status(500).json({ error: 'Error fetching India feed' });
    }
});

// Generate Complaint (Official Grievance) draft for an issue
router.get('/:id/generate-complaint', authenticate, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id)
            .populate('reportedBy', 'displayName username name email')
            .populate('assignedAuthority', 'name email department');

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // Check if issue is unresolved and older than 30 days
        const daysSinceReported = Math.floor((new Date() - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24));
        
        if (daysSinceReported < 30) {
            return res.status(400).json({ 
                error: 'Complaint can only be generated for issues older than 30 days',
                daysSinceReported,
                daysRemaining: 30 - daysSinceReported
            });
        }

        if (issue.status === 'resolved') {
            return res.status(400).json({ 
                error: 'Complaint cannot be generated for resolved issues'
            });
        }

        // Generate Complaint document
        const complaintDocument = generateComplaintDocument(issue, req.user);

        res.json({
            complaintDocument,
            metadata: {
                issueId: issue._id,
                issueTitle: issue.title,
                dateReported: issue.createdAt,
                daysSinceReported,
                currentStatus: issue.status,
                district: issue.district,
                state: issue.state,
                authorityDepartment: issue.assignedAuthority?.department || 'Local Municipal Authority'
            }
        });
    } catch (error) {
        console.error('Generate Complaint error:', error);
        res.status(500).json({ error: 'Error generating Complaint document' });
    }
});

// Helper function to generate Complaint document
function generateComplaintDocument(issue, user) {
    const reportedDate = new Date(issue.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const currentDate = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const daysPending = Math.floor((new Date() - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24));
    const authorityDepartment = issue.assignedAuthority?.department || 'Local Municipal Corporation';

    return `
OFFICIAL GRIEVANCE COMPLAINT

APPLICATION FOR REDRESSAL

Date: ${currentDate}

To,
The Concerned Officer
${authorityDepartment}
${issue.district}, ${issue.state}

Subject: Official Complaint regarding unresolved civic issue: ${issue.title}

Respected Sir/Madam,

I am writing to file an official complaint regarding a civic issue that has remained unresolved despite being reported on the JanAwaaz platform.

REFERENCE ISSUE:
Issue Title: ${issue.title}
Category: ${issue.category.toUpperCase()}
Location: ${issue.district}, ${issue.state}
Date Reported: ${reportedDate}
Current Status: ${issue.status.toUpperCase()}
Days Pending: ${daysPending} days

ISSUE DESCRIPTION:
${issue.description}

GRIEVANCE DETAILS:

1. Whether this issue/complaint has been officially registered by the department?
   - If yes, provide the registration number and date
   - If no, provide reasons for non-registration

2. What action has been taken or is being taken to address this issue?
   - Provide complete details of actions taken with dates
   - Names and designations of officials assigned to this matter

3. What is the current status of this issue and expected timeline for resolution?
   - Provide detailed status report
   - Expected completion date with justification

4. If no action has been taken:
   - Provide specific reasons for inaction
   - Name and designation of the official responsible for taking action

5. Copies of any inspection reports, surveys, or assessments conducted related to this issue

6. Details of budget allocated and expenses incurred (if any) for addressing this issue

7. Correspondence and communications related to this issue within the department and with other agencies

8. Information regarding any complaints or representations received on this matter from citizens or elected representatives

APPLICANT DETAILS:
Name: ${user.displayName || user.name}
Email: ${user.email}
District: ${user.district || issue.district}
State: ${issue.state}

I request you to take immediate cognizance of this matter and provide a timeline for resolution within 30 days.

If the matter pertains to another department, I request you to forward this complaint to the appropriate authority and inform me accordingly.

Thanking you,

Yours faithfully,

${user.displayName || user.name}

--
Generated via JanAwaaz Civic Platform
Issue Reference: ${issue._id}
Platform Registration Date: ${reportedDate}
Complaint Generated Date: ${currentDate}

Note: This is a computer-generated draft. Please review and customize as needed before submission.
Response must be provided within 30 days of receipt as per administrative guidelines.
`.trim();
}

// Recalculate severity scores for all issues (admin only)
router.post('/recalculate-severity', authenticate, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { recalculateAllSeverityScores } = require('../utils/severity');
        const result = await recalculateAllSeverityScores();

        res.json({
            message: 'Severity scores recalculated successfully',
            result
        });
    } catch (error) {
        console.error('Recalculate severity error:', error);
        res.status(500).json({ error: 'Error recalculating severity scores' });
    }
});

// POST /api/issues/upload-images - Upload images to Cloudinary (Multer handles storage)
router.post('/upload-images', authenticate, handleUpload, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        const images = req.files.map(file => ({
            url: file.path,
            publicId: file.filename
        }));

        res.json({ images });
    } catch (error) {
        console.error('Upload images error:', error);
        res.status(500).json({ error: 'Error uploading images' });
    }
});

// Track social share
router.post('/:id/share', authenticate, async (req, res) => {
    try {
        const { platform } = req.body;
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        if (!platform || !['twitter', 'whatsapp', 'facebook', 'linkedin'].includes(platform)) {
            return res.status(400).json({ error: 'Invalid platform' });
        }

        const socialShare = await SocialShare.create({
            issueId: issue._id,
            userId: req.user._id,
            platform
        });

        res.json({
            message: 'Share tracked successfully',
            socialShare
        });
    } catch (error) {
        console.error('Track share error:', error);
        res.status(500).json({ error: 'Error tracking share' });
    }
});

// Get share statistics for an issue
router.get('/:id/share-stats', async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        const shares = await SocialShare.find({ issueId: issue._id }).lean();
        
        const stats = {
            total: shares.length,
            byPlatform: {
                twitter: shares.filter(s => s.platform === 'twitter').length,
                whatsapp: shares.filter(s => s.platform === 'whatsapp').length,
                facebook: shares.filter(s => s.platform === 'facebook').length,
                linkedin: shares.filter(s => s.platform === 'linkedin').length
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('Get share stats error:', error);
        res.status(500).json({ error: 'Error fetching share statistics' });
    }
});

// POST /:id/flag - Flag an issue as inappropriate
router.post('/:id/flag', authenticate, async (req, res) => {
    try {
        const { reason } = req.body;
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        // User cannot flag their own issue
        if (issue.reportedBy.toString() === req.user._id.toString()) {
            return res.status(403).json({ error: 'You cannot flag your own issue' });
        }

        issue.isFlagged = true;
        issue.flagReason = reason || 'No reason provided';
        await issue.save();

        // Audit log
        await createAuditLog({
            actorId: req.user._id,
            action: 'issue_flagged',
            entityType: 'Issue',
            entityId: issue._id,
            metadata: { title: issue.title, reason: reason || 'No reason provided' }
        });

        res.json({
            message: 'Issue flagged for moderation',
            issue: {
                _id: issue._id,
                isFlagged: issue.isFlagged
            }
        });
    } catch (error) {
        console.error('Flag issue error:', error);
        res.status(500).json({ error: 'Error flagging issue' });
    }
});

// POST /:id/follow - Follow/Unfollow an issue
router.post('/:id/follow', authenticate, requireVerification, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        const existingFollower = await IssueFollower.findOne({
            issueId: issue._id,
            userId: req.user._id
        });

        if (existingFollower) {
            // Unfollow
            await IssueFollower.deleteOne({ _id: existingFollower._id });
            res.json({
                message: 'Issue unfollowed',
                isFollowing: false
            });
        } else {
            // Follow
            await IssueFollower.create({
                issueId: issue._id,
                userId: req.user._id
            });
            res.json({
                message: 'Issue followed. You will receive notifications for updates.',
                isFollowing: true
            });
        }
    } catch (error) {
        console.error('Follow issue error:', error);
        res.status(500).json({ error: 'Error following/unfollowing issue' });
    }
});

// POST /:id/update - Post an update on an issue (authority only)
router.post('/:id/update', authenticate, isAuthority, upload.array('images', 5), async (req, res) => {
    try {
        const { content, mediaUrl, stageKey: rawStageKey, stageTitle } = req.body;
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Update content is required' });
        }

        if (issue.status === 'pending' || issue.status === 'denied') {
            return res.status(400).json({ error: 'Issue must be accepted before posting progress updates' });
        }

        const authority = await Authority.findOne({ userId: req.user._id });
        if (!authority) {
            return res.status(404).json({ error: 'Authority profile not found' });
        }

        // Check if the authority is assigned to this issue (handles both Authority ID and legacy User ID)
        const isAssigned = 
            issue.assignedAuthority?.toString() === authority._id.toString() || 
            issue.assignedAuthority?.toString() === req.user._id.toString();

        if (!isAssigned) {
            return res.status(403).json({ error: 'Only the assigned authority can post updates' });
        }

        const stageKey = PROGRESS_STAGE_MAP[rawStageKey] ? rawStageKey : 'planning';
        const stageMeta = PROGRESS_STAGE_MAP[stageKey];
        const parsedProgress = parseInt(req.body.progressPercent, 10);
        const fallbackProgress = Math.round((stageMeta.order / PROGRESS_STAGES.length) * 100);
        const progressPercent = Number.isNaN(parsedProgress)
            ? fallbackProgress
            : Math.min(100, Math.max(0, parsedProgress));

        const images = (req.files || []).map(file => ({
            url: file.path,
            publicId: file.filename
        }));

        const resolvedMediaUrl = mediaUrl || (images.length > 0 ? images[0].url : null);

        const update = await IssueUpdate.create({
            issueId: issue._id,
            postedBy: authority._id,
            content: content.trim(),
            stageKey,
            stageTitle: (stageTitle || stageMeta.label).trim(),
            progressPercent,
            images,
            mediaUrl: resolvedMediaUrl
        });

        await update.populate('postedBy', 'userId');

        if (issue.status === 'accepted' && progressPercent > 0) {
            issue.status = 'in_progress';
            issue.updatedAt = new Date();
            await issue.save();
        }

        const allUpdates = await IssueUpdate.find({ issueId: issue._id }).sort({ createdAt: -1 }).lean();
        const tracker = buildProgressTracker(allUpdates, issue.status);

        // Emit real-time event for issue update
        const io = req.app.get('io');
        if (io) {
            io.to(`issue_${issue._id}`).emit('issue_update_posted', {
                issueId: issue._id,
                update,
                tracker
            });
        }

        // Notify all followers
        const followers = await IssueFollower.find({ issueId: issue._id }).lean();
        for (const follower of followers) {
            // Don't notify the authority who posted the update
            if (follower.userId.toString() !== req.user._id.toString()) {
                await Notification.create({
                    recipientId: follower.userId,
                    type: 'issue_update',
                    title: 'Issue Update',
                    message: `An authority posted an update on an issue you're following`,
                    link: `/issue.html?id=${issue._id}`,
                    metadata: {
                        issueId: issue._id,
                        issueTitle: issue.title,
                        updateContent: content.substring(0, 100)
                    }
                });
            }
        }

        res.status(201).json({
            message: 'Update posted successfully',
            update,
            tracker
        });
    } catch (error) {
        console.error('Post update error:', error);
        res.status(500).json({ error: 'Error posting update' });
    }
});

// GET /:id/updates - Get all updates for an issue
router.get('/:id/updates', async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ error: 'Issue not found' });
        }

        let queryIssueId = issue._id;
        if (issue.isMerged && issue.mergedInto) {
            queryIssueId = issue.mergedInto;
        }

        const updates = await IssueUpdate.find({ issueId: queryIssueId })
            .populate({
                path: 'postedBy',
                populate: {
                    path: 'userId',
                    select: 'displayName username avatar'
                }
            })
            .sort({ createdAt: -1 })
            .lean();

        const tracker = buildProgressTracker(updates, issue.status);

        res.json({ updates, count: updates.length, tracker, isMerged: issue.isMerged, mergedInto: issue.mergedInto });
    } catch (error) {
        console.error('Get updates error:', error);
        res.status(500).json({ error: 'Error fetching updates' });
    }
});

module.exports = router;
