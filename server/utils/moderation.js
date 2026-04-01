// AI Moderation Service using HuggingFace Inference API
const https = require('https');

// HuggingFace API configuration
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || '';
const MODERATION_MODEL = 'facebook/roberta-hate-speech-dynabench-r4-target';

// Fallback: simple keyword-based moderation if API is unavailable
const OFFENSIVE_KEYWORDS = [
    'hate', 'kill', 'death', 'abuse', 'attack', 'violent',
    'stupid', 'idiot', 'moron', 'dumb', 'loser', 'scam'
];

const SPAM_PATTERNS = [
    /\b(click here|buy now|limited offer|act now)\b/i,
    /\b(viagra|cialis|casino|lottery|winner)\b/i,
    /(http[s]?:\/\/[^\s]+){3,}/i, // Multiple URLs
    /(.)\1{10,}/ // Repeated characters
];

/**
 * Moderate text content using HuggingFace API
 * @param {string} text - Text to moderate
 * @returns {Promise<Object>} - Moderation result {isViolation, reason, scores}
 */
async function moderateContent(text) {
    if (!text || typeof text !== 'string') {
        return { isViolation: false, reason: null, scores: {} };
    }

    // First, run local checks for performance
    const localCheck = runLocalModeration(text);
    if (localCheck.isViolation) {
        return localCheck;
    }

    // If HuggingFace API key is not available, only use local moderation
    if (!HUGGINGFACE_API_KEY) {
        console.warn('HuggingFace API key not configured. Using local moderation only.');
        return { isViolation: false, reason: null, scores: {}, method: 'local' };
    }

    // Try HuggingFace API moderation
    try {
        const result = await callHuggingFaceAPI(text);
        return result;
    } catch (error) {
        console.error('HuggingFace API error:', error.message);
        // Fallback to local moderation on API failure
        return { isViolation: false, reason: null, scores: {}, method: 'local_fallback' };
    }
}

/**
 * Local keyword-based moderation
 * @param {string} text - Text to check
 * @returns {Object} - Moderation result
 */
function runLocalModeration(text) {
    const lowerText = text.toLowerCase();

    // Check for spam patterns
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(text)) {
            return {
                isViolation: true,
                reason: 'spam',
                message: 'Content appears to be spam or contains excessive promotional links',
                method: 'local'
            };
        }
    }

    // Check for offensive keywords
    const foundKeywords = OFFENSIVE_KEYWORDS.filter(keyword => 
        lowerText.includes(keyword)
    );

    if (foundKeywords.length >= 2) {
        return {
            isViolation: true,
            reason: 'offensive_language',
            message: 'Content contains potentially offensive language',
            method: 'local'
        };
    }

    // Check for excessive capitalization (shouting)
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (text.length > 20 && capsRatio > 0.7) {
        return {
            isViolation: true,
            reason: 'spam',
            message: 'Excessive use of capital letters detected',
            method: 'local'
        };
    }

    return { isViolation: false, reason: null };
}

/**
 * Call HuggingFace Inference API for text classification
 * @param {string} text - Text to classify
 * @returns {Promise<Object>} - Classification result
 */
function callHuggingFaceAPI(text) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ inputs: text });

        const options = {
            hostname: 'api-inference.huggingface.co',
            port: 443,
            path: `/models/${MODERATION_MODEL}`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        throw new Error(`API returned status ${res.statusCode}: ${responseData}`);
                    }

                    const result = JSON.parse(responseData);
                    const moderationResult = parseHuggingFaceResponse(result);
                    resolve(moderationResult);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/**
 * Parse HuggingFace API response
 * @param {Array|Object} response - API response
 * @returns {Object} - Parsed moderation result
 */
function parseHuggingFaceResponse(response) {
    try {
        // Handle array response format
        let scores = {};
        
        if (Array.isArray(response) && response.length > 0) {
            const firstResult = response[0];
            if (Array.isArray(firstResult)) {
                firstResult.forEach(item => {
                    scores[item.label] = item.score;
                });
            }
        }

        // Check for hate speech, abusive content
        const hateScore = scores['hate'] || scores['LABEL_1'] || 0;
        const threshold = 0.75; // 75% confidence threshold

        if (hateScore > threshold) {
            return {
                isViolation: true,
                reason: 'hate_speech',
                message: 'Content contains hate speech or abusive language',
                scores: scores,
                method: 'huggingface'
            };
        }

        return {
            isViolation: false,
            reason: null,
            scores: scores,
            method: 'huggingface'
        };
    } catch (error) {
        console.error('Error parsing HuggingFace response:', error);
        return { isViolation: false, reason: null, scores: {} };
    }
}

/**
 * Moderate multiple text fields (e.g., title + description)
 * @param {Object} fields - Object with field names and text values
 * @returns {Promise<Object>} - Combined moderation result
 */
async function moderateMultipleFields(fields) {
    const results = [];
    
    for (const [fieldName, text] of Object.entries(fields)) {
        if (text && typeof text === 'string' && text.trim().length > 0) {
            const result = await moderateContent(text);
            if (result.isViolation) {
                result.field = fieldName;
                results.push(result);
            }
        }
    }

    if (results.length > 0) {
        return {
            isViolation: true,
            violations: results,
            message: `Content moderation failed: ${results.map(r => r.message).join('; ')}`
        };
    }

    return { isViolation: false, violations: [] };
}

module.exports = {
    moderateContent,
    moderateMultipleFields,
    runLocalModeration
};
