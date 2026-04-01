const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
exports.authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No authentication token, access denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Use lean() and select to minimize query overhead
        const user = await User.findById(decoded.userId)
            .select('-passwordHash')
            .lean()
            .exec();
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token is not valid' });
    }
};

// Check if user is an authority or admin
exports.isAuthority = (req, res, next) => {
    if (req.user.role !== 'authority' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Authority role required.' });
    }
    next();
};

// Check if user is an admin
exports.isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    next();
};

// Optional authentication (doesn't fail if no token)
exports.optionalAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Use lean() for read-only operations
            const user = await User.findById(decoded.userId)
                .select('-passwordHash')
                .lean()
                .exec();
            if (user) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        next();
    }
};

// Check if user is verified (Aadhaar or document)
exports.requireVerification = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!req.user.isVerified && !req.user.isAadhaarVerified) {
        return res.status(403).json({ 
            error: 'Identity verification required. Please verify your Aadhaar or upload identity documents.',
            requiresVerification: true
        });
    }
    
    next();
};
