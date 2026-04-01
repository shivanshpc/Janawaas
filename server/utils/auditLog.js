// Audit logging utility

/**
 * Create an audit log entry
 * @param {Object} params - Audit log parameters
 * @param {string} params.actorId - ID of the user performing the action
 * @param {string} params.action - Action being performed
 * @param {string} params.entityType - Type of entity affected
 * @param {string} params.entityId - ID of the affected entity
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} - Created audit log entry
 */
async function createAuditLog({ actorId, action, entityType, entityId, metadata = {} }) {
    const AuditLog = require('../models/AuditLog');
    
    try {
        const auditLog = new AuditLog({
            actorId,
            action,
            entityType,
            entityId,
            metadata
        });
        
        await auditLog.save();
        console.log(`📝 Audit Log: ${action} on ${entityType} ${entityId} by ${actorId}`);
        
        return auditLog;
    } catch (error) {
        console.error('Error creating audit log:', error);
        // Don't throw - audit logging failures shouldn't break the main operation
        return null;
    }
}

/**
 * Get audit logs with filters
 * @param {Object} filters - Query filters
 * @param {Object} options - Query options (page, limit, sort)
 * @returns {Promise<Object>} - Audit logs and pagination info
 */
async function getAuditLogs(filters = {}, options = {}) {
    const AuditLog = require('../models/AuditLog');
    
    const {
        page = 1,
        limit = 50,
        sort = { createdAt: -1 }
    } = options;
    
    const skip = (page - 1) * limit;
    
    const logs = await AuditLog.find(filters)
        .populate('actorId', 'username displayName email role')
        .sort(sort)
        .limit(limit)
        .skip(skip);
    
    const total = await AuditLog.countDocuments(filters);
    
    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + logs.length < total
        }
    };
}

/**
 * Get audit logs for a specific entity
 * @param {string} entityType - Type of entity
 * @param {string} entityId - ID of entity
 * @returns {Promise<Array>} - Audit logs for the entity
 */
async function getEntityAuditLogs(entityType, entityId) {
    const AuditLog = require('../models/AuditLog');
    
    const logs = await AuditLog.find({ entityType, entityId })
        .populate('actorId', 'username displayName email role')
        .sort({ createdAt: -1 });
    
    return logs;
}

/**
 * Get audit logs for a specific user's actions
 * @param {string} actorId - ID of the user
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Audit logs and pagination
 */
async function getUserAuditLogs(actorId, options = {}) {
    return getAuditLogs({ actorId }, options);
}

/**
 * Get recent audit logs (last N logs)
 * @param {number} limit - Number of logs to retrieve
 * @returns {Promise<Array>} - Recent audit logs
 */
async function getRecentAuditLogs(limit = 20) {
    const AuditLog = require('../models/AuditLog');
    
    const logs = await AuditLog.find()
        .populate('actorId', 'username displayName email role')
        .sort({ createdAt: -1 })
        .limit(limit);
    
    return logs;
}

/**
 * Delete old audit logs (data retention)
 * @param {number} daysToKeep - Number of days to keep logs
 * @returns {Promise<number>} - Number of logs deleted
 */
async function deleteOldAuditLogs(daysToKeep = 365) {
    const AuditLog = require('../models/AuditLog');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoffDate }
    });
    
    console.log(`🗑️ Deleted ${result.deletedCount} old audit logs (older than ${daysToKeep} days)`);
    return result.deletedCount;
}

module.exports = {
    createAuditLog,
    getAuditLogs,
    getEntityAuditLogs,
    getUserAuditLogs,
    getRecentAuditLogs,
    deleteOldAuditLogs
};
