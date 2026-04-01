// Authority badge utility

/**
 * Calculate badge for an authority based on their performance
 * @param {number} averageRating - Average rating of the authority
 * @param {number} issuesResolved - Number of issues resolved
 * @returns {string} - Badge level: 'gold', 'silver', 'bronze', or 'none'
 */
function calculateBadge(averageRating, issuesResolved) {
    // Gold badge: avg rating >= 4.5 and resolved >= 50
    if (averageRating >= 4.5 && issuesResolved >= 50) {
        return 'gold';
    }
    
    // Silver badge: avg rating >= 4.0 and resolved >= 25
    if (averageRating >= 4.0 && issuesResolved >= 25) {
        return 'silver';
    }
    
    // Bronze badge: avg rating >= 3.5 and resolved >= 10
    if (averageRating >= 3.5 && issuesResolved >= 10) {
        return 'bronze';
    }
    
    // No badge
    return 'none';
}

/**
 * Update badge for a specific authority
 * @param {string} authorityId - Authority ID
 * @returns {Promise<Object>} - Updated authority
 */
async function updateAuthorityBadge(authorityId) {
    const Authority = require('../models/Authority');
    const { createAuditLog } = require('./auditLog');
    
    const authority = await Authority.findById(authorityId).populate('userId');
    if (!authority) {
        throw new Error('Authority not found');
    }
    
    const oldBadge = authority.badge;
    const newBadge = calculateBadge(authority.averageRating, authority.issuesResolved);
    
    if (authority.badge !== newBadge) {
        authority.badge = newBadge;
        await authority.save();
        console.log(`✨ Badge updated for authority ${authorityId}: ${oldBadge} → ${newBadge}`);
        
        // Audit log
        if (authority.userId) {
            await createAuditLog({
                actorId: authority.userId._id || authority.userId,
                action: 'badge_updated',
                entityType: 'Authority',
                entityId: authority._id,
                metadata: { 
                    oldBadge, 
                    newBadge,
                    averageRating: authority.averageRating,
                    issuesResolved: authority.issuesResolved
                }
            });
        }
    }
    
    return authority;
}

/**
 * Update badges for all authorities
 * @returns {Promise<number>} - Number of authorities updated
 */
async function updateAllAuthorityBadges() {
    const Authority = require('../models/Authority');
    
    const authorities = await Authority.find();
    let updatedCount = 0;
    
    for (const authority of authorities) {
        const newBadge = calculateBadge(authority.averageRating, authority.issuesResolved);
        
        if (authority.badge !== newBadge) {
            authority.badge = newBadge;
            await authority.save();
            updatedCount++;
        }
    }
    
    console.log(`✨ Updated badges for ${updatedCount} authorities`);
    return updatedCount;
}

module.exports = {
    calculateBadge,
    updateAuthorityBadge,
    updateAllAuthorityBadges
};
