const Issue = require('../models/Issue');

/**
 * Calculate and update severity score for a single issue
 * @param {String} issueId - Issue ID to update
 * @returns {Object} Updated issue
 */
async function updateIssueSeverity(issueId) {
    try {
        const issue = await Issue.findById(issueId);
        if (!issue) {
            throw new Error('Issue not found');
        }
        
        issue.severityScore = issue.calculateSeverityScore();
        await issue.save();
        
        return issue;
    } catch (error) {
        console.error('Error updating severity score:', error);
        throw error;
    }
}

/**
 * Recalculate severity scores for all open issues
 * Should be run daily via cron job or scheduled task
 * @returns {Object} Statistics about the update
 */
async function recalculateAllSeverityScores() {
    try {
        // Only recalculate for open issues (not resolved or denied)
        const openIssues = await Issue.find({ 
            status: { $in: ['pending', 'accepted', 'in_progress'] } 
        });
        
        let updated = 0;
        let errors = 0;
        
        for (const issue of openIssues) {
            try {
                issue.severityScore = issue.calculateSeverityScore();
                await issue.save();
                updated++;
            } catch (error) {
                console.error(`Error updating issue ${issue._id}:`, error);
                errors++;
            }
        }
        
        console.log(`Severity scores recalculated: ${updated} updated, ${errors} errors`);
        
        return {
            total: openIssues.length,
            updated,
            errors,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error recalculating severity scores:', error);
        throw error;
    }
}

/**
 * Get category weight for severity calculation
 * @param {String} category - Issue category
 * @returns {Number} Category weight
 */
function getCategoryWeight(category) {
    const categoryWeights = {
        'corruption': 20,
        'health': 15,
        'sanitation': 10,
        'garbage': 8,
        'water': 7,
        'drainage': 7,
        'roads': 6,
        'electricity': 6,
        'streetlight': 5,
        'parks': 4,
        'other': 5
    };
    
    return categoryWeights[category.toLowerCase()] || 5;
}

module.exports = {
    updateIssueSeverity,
    recalculateAllSeverityScores,
    getCategoryWeight
};
