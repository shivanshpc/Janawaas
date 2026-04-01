const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    displayName: {
        type: String,
        required: [true, 'Display name is required'],
        trim: true
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6
    },
    district: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['citizen', 'authority', 'admin'],
        default: 'citizen'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    aadhaarHash: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values but unique non-null values
    },
    isAadhaarVerified: {
        type: Boolean,
        default: false
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    reputationScore: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance (note: username, email, aadhaarHash already have unique indexes from schema)
userSchema.index({ district: 1 });
userSchema.index({ state: 1 });
userSchema.index({ state: 1, district: 1 }); // Added for hierarchical location lookups
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isAadhaarVerified: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, isVerified: 1 });
userSchema.index({ role: 1, state: 1, district: 1 }); // Added for authority directory filtering
userSchema.index({ reputationScore: -1 });
userSchema.index({ displayName: 'text' }); // Added for user search functionality

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash')) return next();
    
    try {
        // Using 8 rounds for faster hashing (still secure, ~40ms vs 250ms)
        const salt = await bcrypt.genSalt(8);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
