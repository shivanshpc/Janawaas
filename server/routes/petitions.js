const express = require('express');
const router = express.Router();
const Petition = require('../models/Petition');
const Issue = require('../models/Issue');
const { authenticate, optionalAuth } = require('../middleware/auth');

// Get all petitions
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        let query = {};

        if (status) query.status = status;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const petitions = await Petition.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate({
                path: 'issueId',
                populate: {
                    path: 'reportedBy',
                    select: 'displayName username name avatar'
                }
            });

        const total = await Petition.countDocuments(query);

        res.json({
            petitions,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: skip + petitions.length < total
            }
        });
    } catch (error) {
        console.error('Get petitions error:', error);
        res.status(500).json({ error: 'Error fetching petitions' });
    }
});

// Get single petition by ID
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const petition = await Petition.findById(req.params.id)
            .populate({
                path: 'issueId',
                populate: [
                    {
                        path: 'reportedBy',
                        select: 'displayName username name email avatar district'
                    },
                    {
                        path: 'assignedAuthority',
                        select: 'name email department'
                    }
                ]
            });

        if (!petition) {
            return res.status(404).json({ error: 'Petition not found' });
        }

        res.json({ petition });
    } catch (error) {
        console.error('Get petition error:', error);
        res.status(500).json({ error: 'Error fetching petition' });
    }
});

// Get petition by issue ID
router.get('/issue/:issueId', optionalAuth, async (req, res) => {
    try {
        const petition = await Petition.findOne({ issueId: req.params.issueId })
            .populate({
                path: 'issueId',
                populate: {
                    path: 'reportedBy',
                    select: 'displayName username name avatar'
                }
            });

        if (!petition) {
            return res.status(404).json({ error: 'No petition found for this issue' });
        }

        res.json({ petition });
    } catch (error) {
        console.error('Get petition by issue error:', error);
        res.status(500).json({ error: 'Error fetching petition' });
    }
});

// Update petition status (admin only)
router.patch('/:id/status', authenticate, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { status, submittedTo } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const petition = await Petition.findById(req.params.id);
        if (!petition) {
            return res.status(404).json({ error: 'Petition not found' });
        }

        petition.status = status;
        if (submittedTo) {
            petition.submittedTo = submittedTo;
        }
        if (status === 'submitted' && !petition.submissionDate) {
            petition.submissionDate = new Date();
        }

        await petition.save();

        res.json({
            message: 'Petition status updated successfully',
            petition
        });
    } catch (error) {
        console.error('Update petition status error:', error);
        res.status(500).json({ error: 'Error updating petition status' });
    }
});

// Generate petition document
router.get('/:id/document', optionalAuth, async (req, res) => {
    try {
        const petition = await Petition.findById(req.params.id)
            .populate({
                path: 'issueId',
                populate: {
                    path: 'reportedBy',
                    select: 'displayName username name'
                }
            });

        if (!petition) {
            return res.status(404).json({ error: 'Petition not found' });
        }

        const issue = petition.issueId;

        // Generate petition document text
        const petitionText = generatePetitionDocument(petition, issue);

        res.json({
            petitionDocument: petitionText,
            metadata: {
                issueTitle: issue.title,
                district: issue.district,
                state: issue.state,
                upvoteCount: issue.upvoteCount,
                dateReported: issue.createdAt,
                petitionCreatedAt: petition.createdAt
            }
        });
    } catch (error) {
        console.error('Generate petition document error:', error);
        res.status(500).json({ error: 'Error generating petition document' });
    }
});

// Helper function to generate petition document
function generatePetitionDocument(petition, issue) {
    const formattedDate = new Date(issue.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const petitionDate = new Date(petition.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return `
PETITION TO THE AUTHORITIES

Date: ${petitionDate}

To,
The Concerned Authority
${issue.district}, ${issue.state}

Subject: Public Petition Regarding - ${issue.title}

Respected Sir/Madam,

We, the undersigned citizens, hereby submit this petition to bring to your immediate attention a matter of public concern that has garnered significant community support on the JanAwaaz civic platform.

ISSUE DETAILS:
Title: ${issue.title}
Category: ${issue.category.toUpperCase()}
Location: ${issue.district}, ${issue.state}
Date First Reported: ${formattedDate}
Current Status: ${issue.status.toUpperCase()}

DESCRIPTION:
${issue.description}

PUBLIC SUPPORT:
This issue has received ${issue.upvoteCount.toLocaleString('en-IN')} upvotes from concerned citizens, demonstrating the widespread impact and urgency of this matter.

PETITION REQUEST:
We, the citizens, respectfully request that immediate action be taken to address this issue. The overwhelming public support indicates the severity and importance of this matter to the community.

We request that:
1. An official investigation be conducted into this matter
2. Appropriate remedial action be taken within a reasonable timeframe
3. Regular updates be provided to the public regarding the progress
4. A final resolution report be published for transparency

This petition represents the collective voice of ${issue.upvoteCount.toLocaleString('en-IN')} citizens who have expressed their concern through the democratic process of upvoting on the official JanAwaaz platform.

We trust that your esteemed office will give this matter the urgent attention it deserves and take necessary action in the public interest.

Thanking you,

On behalf of the Citizens

--
Petition Reference: ${petition._id}
Issue Reference: ${issue._id}
Generated via JanAwaaz Civic Platform
Date: ${petitionDate}
`.trim();
}

module.exports = router;
