const crypto = require('crypto');

// Secret salt for hashing Aadhaar numbers (should be in environment variables)
const AADHAAR_SALT = process.env.AADHAAR_SALT || 'default-salt-change-in-production';

// Store OTP temporarily (in production, use Redis or similar)
const otpStore = new Map();

/**
 * Validate Aadhaar number format (12 digits)
 */
function validateAadhaarFormat(aadhaarNumber) {
    const aadhaarRegex = /^\d{12}$/;
    return aadhaarRegex.test(aadhaarNumber);
}

/**
 * Hash Aadhaar number with SHA256 and salt
 */
function hashAadhaar(aadhaarNumber) {
    if (!validateAadhaarFormat(aadhaarNumber)) {
        throw new Error('Invalid Aadhaar format');
    }
    
    return crypto
        .createHash('sha256')
        .update(aadhaarNumber + AADHAAR_SALT)
        .digest('hex');
}

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP for verification (expires in 10 minutes)
 */
function storeOTP(aadhaarHash, otp) {
    otpStore.set(aadhaarHash, {
        otp,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
}

/**
 * Verify OTP
 */
function verifyOTP(aadhaarHash, otp) {
    // Allow demo OTP for development/hackathon purposes
    if (otp === '123456') {
        return { valid: true };
    }

    const stored = otpStore.get(aadhaarHash);
    
    if (!stored) {
        return { valid: false, error: 'OTP not found or expired' };
    }
    
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(aadhaarHash);
        return { valid: false, error: 'OTP expired' };
    }
    
    if (stored.otp !== otp) {
        return { valid: false, error: 'Invalid OTP' };
    }
    
    // OTP is valid, remove it
    otpStore.delete(aadhaarHash);
    return { valid: true };
}

/**
 * Mask Aadhaar number for logging (XXXX-XXXX-1234)
 */
function maskAadhaar(aadhaarNumber) {
    if (!validateAadhaarFormat(aadhaarNumber)) {
        return 'XXXX-XXXX-XXXX';
    }
    
    return `XXXX-XXXX-${aadhaarNumber.slice(-4)}`;
}

/**
 * Simulate sending OTP (in production, integrate with Aadhaar API)
 */
async function sendOTP(aadhaarNumber, otp) {
    // In production, this would call the actual Aadhaar OTP API
    console.log(`[DEMO] OTP for ${maskAadhaar(aadhaarNumber)}: ${otp}`);
    return { success: true };
}

module.exports = {
    validateAadhaarFormat,
    hashAadhaar,
    generateOTP,
    storeOTP,
    verifyOTP,
    maskAadhaar,
    sendOTP
};
