const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { displayName, username, email, password, role, district, state } = req.body;

        // Validate required fields
        if (!displayName || !username || !email || !password) {
            return res.status(400).json({ error: 'Please provide all required fields' });
        }

        // Check if user already exists by email or username
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'User with this email already exists' });
            }
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username is already taken' });
            }
        }

        // Create new user (password will be hashed automatically by pre-save hook)
        const user = new User({
            displayName,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            passwordHash: password, // Will be hashed by pre-save hook
            role: role || 'citizen',
            district: district || '',
            state: state || '',
            reputationScore: 0
        });

        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                displayName: user.displayName,
                username: user.username,
                email: user.email,
                role: user.role,
                district: user.district,
                state: user.state,
                reputationScore: user.reputationScore,
                isAadhaarVerified: user.isAadhaarVerified,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ error: `${field} is already taken` });
        }
        res.status(500).json({ error: 'Error registering user' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Please provide email and password' });
        }

        // Find user by email or username - select only needed fields for login
        const user = await User.findOne({ 
            $or: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] 
        }).select('_id passwordHash displayName username email role district state reputationScore isAadhaarVerified isVerified isBanned').lean();
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check if user is banned
        if (user.isBanned) {
            return res.status(403).json({ error: 'Account has been banned' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                displayName: user.displayName,
                username: user.username,
                email: user.email,
                role: user.role,
                district: user.district,
                state: user.state,
                reputationScore: user.reputationScore,
                isAadhaarVerified: user.isAadhaarVerified,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
    try {
        // req.user is already populated by authenticate middleware, no need to query again
        const user = req.user;
        
        res.json({ 
            user: {
                id: user._id,
                displayName: user.displayName,
                username: user.username,
                name: user.displayName, // For backward compatibility
                email: user.email,
                role: user.role,
                district: user.district,
                state: user.state,
                reputationScore: user.reputationScore,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Error fetching profile' });
    }
});

// Verify token
router.get('/verify', authenticate, async (req, res) => {
    try {
        const user = {
            id: req.user._id,
            displayName: req.user.displayName,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role,
            district: req.user.district,
            state: req.user.state,
            reputationScore: req.user.reputationScore,
            isAadhaarVerified: req.user.isAadhaarVerified,
            isVerified: req.user.isVerified
        };

        // If user is authority, fetch authority details
        if (req.user.role === 'authority') {
            const Authority = require('../models/Authority');
            const authorityData = await Authority.findOne({ userId: req.user._id })
                .populate('mergedAuthorities', 'jurisdictionDistrict areaOfExpertise designation')
                .lean();
            if (authorityData) {
                user.authorityDetails = authorityData;
            }
        }

        res.json({ valid: true, user });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Error verifying token' });
    }
});

module.exports = router;
