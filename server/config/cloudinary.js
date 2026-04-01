const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Validate Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('⚠️ Warning: Cloudinary credentials are not fully configured in .env');
}

// Configure Cloudinary storage for Multer with advanced compression
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'janawaaz-issues',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [
            // Optimize image: auto-format, auto-quality, auto-crop
            { fetch_format: 'auto', quality: 'auto' },
            // Resize with limit to max 1200x1200
            { width: 1200, height: 1200, crop: 'limit' },
            // Apply progressive encoding for better performance
            { flags: 'progressive' }
        ],
        // Use signed URLs for security
        sign_url: true
    }
});

// File validation and filtering
const fileFilter = (req, file, cb) => {
    // Only accept image files
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];

    if (!allowedMimes.includes(file.mimetype)) {
        return cb(
            new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WebP are allowed.`),
            false
        );
    }

    // Validate file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
        return cb(
            new Error(`Invalid file extension: ${fileExtension}`),
            false
        );
    }

    cb(null, true);
};

// Create Multer upload middleware with enhanced validation
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
        files: 5 // Max 5 files per request
    },
    fileFilter: fileFilter
});

// Specialized upload middleware for different scenarios
const uploadAvatar = multer({
    storage: new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'janawaaz-avatars',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [
                { width: 300, height: 300, crop: 'fill', gravity: 'face' },
                { fetch_format: 'auto', quality: 'auto' }
            ],
            sign_url: true
        }
    }),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit for avatars
    },
    fileFilter: fileFilter
});

// Upload middleware for documents (authority applications)
const uploadDocument = multer({
    storage: new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'janawaaz-documents',
            allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
            resource_type: 'auto'
        }
    }),
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB limit for documents
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (!allowedMimes.includes(file.mimetype)) {
            return cb(
                new Error(`Invalid file type: ${file.mimetype}. Only PDF, JPEG, and PNG are allowed.`),
                false
            );
        }
        cb(null, true);
    }
});

// Utility function to validate image URL
async function validateImageUrl(url) {
    try {
        const response = await cloudinary.url(url);
        return !!response;
    } catch (error) {
        console.error('Error validating image URL:', error);
        return false;
    }
}

// Utility function to delete image from Cloudinary
async function deleteImage(publicId) {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result.result === 'ok';
    } catch (error) {
        console.error('Error deleting image:', error);
        return false;
    }
}

// Utility function to get optimized image URL with custom transformations
function getOptimizedImageUrl(publicId, options = {}) {
    const defaultOptions = {
        width: 800,
        quality: 'auto',
        fetch_format: 'auto',
        crop: 'limit'
    };

    const finalOptions = { ...defaultOptions, ...options };

    return cloudinary.url(publicId, finalOptions);
}

module.exports = { 
    cloudinary, 
    upload, 
    uploadAvatar,
    uploadDocument,
    validateImageUrl,
    deleteImage,
    getOptimizedImageUrl
};
