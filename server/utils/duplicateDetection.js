// String similarity utility for duplicate issue detection

/**
 * Calculate the Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Distance between the strings
 */
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + 1   // substitution
                );
            }
        }
    }

    return dp[m][n];
}

/**
 * Calculate similarity percentage between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity percentage (0-100)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    // Normalize strings: lowercase and trim
    const normalized1 = str1.toLowerCase().trim();
    const normalized2 = str2.toLowerCase().trim();
    
    if (normalized1 === normalized2) return 100;
    
    const maxLength = Math.max(normalized1.length, normalized2.length);
    if (maxLength === 0) return 100;
    
    const distance = levenshteinDistance(normalized1, normalized2);
    const similarity = ((maxLength - distance) / maxLength) * 100;
    
    return Math.round(similarity * 100) / 100; // Round to 2 decimal places
}

/**
 * Find similar issues based on title similarity in the same district
 * @param {string} title - Title to check
 * @param {string} district - District to check in
 * @param {number} threshold - Similarity threshold (0-100), default 70
 * @returns {Promise<Object|null>} - Similar issue if found, null otherwise
 */
async function findSimilarIssue(title, district, threshold = 70) {
    const Issue = require('../models/Issue');
    
    if (!title || !district) {
        return null;
    }
    
    // Get all issues from the same district
    const existingIssues = await Issue.find({ 
        district: district,
        status: { $ne: 'resolved' } // Don't check against resolved issues
    }).select('title _id createdAt status');
    
    // Check similarity with each existing issue
    for (const existingIssue of existingIssues) {
        const similarity = calculateSimilarity(title, existingIssue.title);
        
        if (similarity >= threshold) {
            return {
                similarIssue: existingIssue,
                similarity: similarity
            };
        }
    }
    
    return null;
}

module.exports = {
    calculateSimilarity,
    findSimilarIssue
};
