// Deadline tracking and escalation utility

/**
 * Check for overdue issues and escalate them
 * @returns {Promise<number>} - Number of issues escalated
 */
async function checkAndEscalateOverdueIssues() {
    const Issue = require('../models/Issue');
    
    try {
        const now = new Date();
        
        // Find issues with deadlines that have passed and are not resolved or escalated
        const overdueIssues = await Issue.find({
            deadline: { $lt: now },
            status: { $nin: ['resolved', 'denied'] },
            isEscalated: false
        });
        
        let escalatedCount = 0;
        
        for (const issue of overdueIssues) {
            issue.isEscalated = true;
            await issue.save();
            escalatedCount++;
            
            console.log(`⚠️ Issue ${issue._id} (${issue.title}) has been escalated due to missed deadline`);
        }
        
        if (escalatedCount > 0) {
            console.log(`✅ Escalated ${escalatedCount} overdue issues`);
        }
        
        return escalatedCount;
    } catch (error) {
        console.error('Error checking for overdue issues:', error);
        throw error;
    }
}

/**
 * Get all escalated issues
 * @param {Object} filters - Optional filters (district, state, etc.)
 * @returns {Promise<Array>} - Array of escalated issues
 */
async function getEscalatedIssues(filters = {}) {
    const Issue = require('../models/Issue');
    
    const query = { isEscalated: true, ...filters };
    
    const escalatedIssues = await Issue.find(query)
        .populate('reportedBy', 'displayName username email')
        .populate('assignedAuthority', 'name email')
        .sort({ deadline: 1 });
    
    return escalatedIssues;
}

/**
 * Get issues nearing deadline (within specified days)
 * @param {number} daysThreshold - Number of days before deadline to consider "nearing"
 * @returns {Promise<Array>} - Array of issues nearing deadline
 */
async function getIssuesNearingDeadline(daysThreshold = 3) {
    const Issue = require('../models/Issue');
    
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + (daysThreshold * 24 * 60 * 60 * 1000));
    
    const nearingIssues = await Issue.find({
        deadline: { 
            $gte: now,
            $lte: thresholdDate
        },
        status: { $nin: ['resolved', 'denied'] },
        isEscalated: false
    })
    .populate('reportedBy', 'displayName username email')
    .populate('assignedAuthority', 'name email')
    .sort({ deadline: 1 });
    
    return nearingIssues;
}

/**
 * Check if an issue is overdue
 * @param {Object} issue - Issue document
 * @returns {boolean} - True if overdue
 */
function isIssueOverdue(issue) {
    if (!issue.deadline) return false;
    if (issue.status === 'resolved' || issue.status === 'denied') return false;
    
    return new Date(issue.deadline) < new Date();
}

/**
 * Get days until deadline (negative if overdue)
 * @param {Object} issue - Issue document
 * @returns {number|null} - Days until deadline, negative if overdue, null if no deadline
 */
function getDaysUntilDeadline(issue) {
    if (!issue.deadline) return null;
    
    const now = new Date();
    const deadline = new Date(issue.deadline);
    const diffTime = deadline - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

module.exports = {
    checkAndEscalateOverdueIssues,
    getEscalatedIssues,
    getIssuesNearingDeadline,
    isIssueOverdue,
    getDaysUntilDeadline
};
