const express = require('express');
const router = express.Router();
const User = require('../models/User');
const IdentityVerification = require('../models/IdentityVerification');
const { authenticate, isAdmin } = require('../middleware/auth');
const { cloudinary } = require('../config/cloudinary');
const multer = require('multer');
const {
    validateAadhaarFormat,
    hashAadhaar,
    generateOTP,
    storeOTP,
    verifyOTP,
    maskAadhaar,
    sendOTP
} = require('../utils/aadhaarVerification');

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Step 1: Initiate Aadhaar verification (generate and send OTP)
router.post('/verify-aadhaar', authenticate, async (req, res) => {
    try {
        const { aadhaarNumber } = req.body;

        // Validate Aadhaar format
        if (!validateAadhaarFormat(aadhaarNumber)) {
            return res.status(400).json({ error: 'Invalid Aadhaar number format. Must be 12 digits.' });
        }

        // Check if user already verified
        if (req.user.isAadhaarVerified) {
            return res.status(400).json({ error: 'Your Aadhaar is already verified' });
        }

        // Hash the Aadhaar number
        const aadhaarHash = hashAadhaar(aadhaarNumber);

        // Check if this Aadhaar is already registered by another user
        const existingUser = await User.findOne({ 
            aadhaarHash,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            console.log(`[SECURITY] Duplicate Aadhaar attempt: ${maskAadhaar(aadhaarNumber)}`);
            return res.status(400).json({ 
                error: 'This Aadhaar number is already registered with another account' 
            });
        }

        // Generate OTP
        const otp = generateOTP();
        
        // Store OTP
        storeOTP(aadhaarHash, otp);

        // Send OTP (simulated)
        await sendOTP(aadhaarNumber, otp);

        console.log(`[VERIFICATION] OTP sent for user ${req.user.username}: ${maskAadhaar(aadhaarNumber)}`);

        res.json({
            message: 'OTP sent successfully',
            maskedAadhaar: maskAadhaar(aadhaarNumber),
            aadhaarHash, // Send hash to client for OTP verification
            otp // Include OTP in response for demo purposes
        });

    } catch (error) {
        console.error('[ERROR] Aadhaar verification error:', error.message);
        res.status(500).json({ error: 'Error processing Aadhaar verification' });
    }
});

// Step 2: Confirm Aadhaar verification (verify OTP)
router.post('/confirm-aadhaar', authenticate, async (req, res) => {
    try {
        const { aadhaarHash, otp } = req.body;

        if (!aadhaarHash || !otp) {
            return res.status(400).json({ error: 'Aadhaar hash and OTP are required' });
        }

        // Verify OTP
        const verification = verifyOTP(aadhaarHash, otp);

        if (!verification.valid) {
            return res.status(400).json({ error: verification.error });
        }

        // Check if this Aadhaar is already registered by another user
        const existingUser = await User.findOne({ 
            aadhaarHash,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            return res.status(400).json({ 
                error: 'This Aadhaar number is already registered with another account' 
            });
        }

        // Update user with Aadhaar hash and verification status
        await User.findByIdAndUpdate(req.user._id, {
            aadhaarHash,
            isAadhaarVerified: true,
            isVerified: true
        });

        console.log(`[SUCCESS] User ${req.user.username} verified with Aadhaar`);

        res.json({
            message: 'Aadhaar verified successfully',
            user: {
                id: req.user._id,
                displayName: req.user.displayName,
                username: req.user.username,
                isAadhaarVerified: true,
                isVerified: true
            }
        });

    } catch (error) {
        console.error('[ERROR] OTP confirmation error:', error.message);
        res.status(500).json({ error: 'Error confirming Aadhaar verification' });
    }
});

// Upload document for alternative verification
router.post('/upload-document', authenticate, upload.single('document'), async (req, res) => {
    try {
        const { documentType } = req.body;

        if (!documentType) {
            return res.status(400).json({ error: 'Document type is required' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Document file is required' });
        }

        // Check if user already has a pending verification
        const existingVerification = await IdentityVerification.findOne({
            userId: req.user._id,
            status: 'pending'
        });

        if (existingVerification) {
            return res.status(400).json({ 
                error: 'You already have a pending verification request' 
            });
        }

        // Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'identity_verification',
                    resource_type: 'image'
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        // Create verification record
        const verification = new IdentityVerification({
            userId: req.user._id,
            documentType,
            documentUrl: uploadResult.secure_url,
            status: 'pending'
        });

        await verification.save();

        res.json({
            message: 'Document uploaded successfully. Awaiting admin approval.',
            verification: {
                id: verification._id,
                documentType: verification.documentType,
                status: verification.status,
                createdAt: verification.createdAt
            }
        });

    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({ error: 'Error uploading document' });
    }
});

// Get user's verification status
router.get('/status', authenticate, async (req, res) => {
    try {
        const verifications = await IdentityVerification.find({ 
            userId: req.user._id 
        }).sort({ createdAt: -1 });

        res.json({
            isAadhaarVerified: req.user.isAadhaarVerified,
            isVerified: req.user.isVerified,
            documentVerifications: verifications
        });

    } catch (error) {
        console.error('Error fetching verification status:', error);
        res.status(500).json({ error: 'Error fetching verification status' });
    }
});

// Admin: Get all pending verifications
router.get('/pending', authenticate, isAdmin, async (req, res) => {
    try {
        const verifications = await IdentityVerification.find({ 
            status: 'pending' 
        })
        .populate('userId', 'displayName username email')
        .sort({ createdAt: -1 });

        res.json({ verifications });

    } catch (error) {
        console.error('Error fetching pending verifications:', error);
        res.status(500).json({ error: 'Error fetching pending verifications' });
    }
});

// Admin: Approve or reject verification
router.post('/review/:verificationId', authenticate, isAdmin, async (req, res) => {
    try {
        const { verificationId } = req.params;
        const { status, reviewNote } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or rejected' });
        }

        const verification = await IdentityVerification.findById(verificationId)
            .populate('userId');

        if (!verification) {
            return res.status(404).json({ error: 'Verification not found' });
        }

        if (verification.status !== 'pending') {
            return res.status(400).json({ error: 'Verification already reviewed' });
        }

        // Update verification
        verification.status = status;
        verification.reviewedBy = req.user._id;
        verification.reviewNote = reviewNote;
        verification.reviewedAt = new Date();
        await verification.save();

        // If approved, update user verification status
        if (status === 'approved') {
            const user = await User.findById(verification.userId);
            user.isVerified = true;
            await user.save();
        }

        res.json({
            message: `Verification ${status} successfully`,
            verification
        });

    } catch (error) {
        console.error('Error reviewing verification:', error);
        res.status(500).json({ error: 'Error reviewing verification' });
    }
});

module.exports = router;
