const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const { init: initSocket } = require('./utils/socket');
const io = initSocket(server);

// Make io accessible to routes
app.set('io', io);

// Middleware - CORS configuration for production
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, or same-origin)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            process.env.CLIENT_URL
        ].filter(Boolean); // Remove undefined values
        
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public, css, and js directories
app.use(express.static(path.join(__dirname, '../public')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));

// MongoDB Connection with optimized connection pooling
mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 5,
    maxIdleTimeMS: 45000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000
})
.then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    
    // Start deadline tracking after DB connection
    const { checkAndEscalateOverdueIssues } = require('./utils/deadlineTracking');
    
    // Run initial check
    checkAndEscalateOverdueIssues().catch(err => {
        console.error('Error in initial deadline check:', err);
    });
    
    // Check for overdue issues every hour
    setInterval(async () => {
        try {
            await checkAndEscalateOverdueIssues();
        } catch (error) {
            console.error('Error in scheduled deadline check:', error);
        }
    }, 60 * 60 * 1000); // Every hour
    
    console.log('⏰ Deadline tracking scheduler started');
})
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Import Routes
const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const commentRoutes = require('./routes/comments');
const userRoutes = require('./routes/users');
const ratingRoutes = require('./routes/ratings');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const petitionRoutes = require('./routes/petitions');
const leaderboardRoutes = require('./routes/leaderboard');
const feedRoutes = require('./routes/feed');
const districtRoutes = require('./routes/district');
const statsRoutes = require('./routes/stats');
const verificationRoutes = require('./routes/verification');
const authorityRoutes = require('./routes/authority');
const adminAuthorityRoutes = require('./routes/adminAuthority');
const analyticsRoutes = require('./routes/analytics');

// Import models for dynamic page serving
const { Issue, Authority, Complaint } = require('./models');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/authority', authorityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminAuthorityRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/petitions', petitionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/district', districtRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'login.html'));
});

app.get('/district', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'district.html'));
});

app.get('/issue/:id', async (req, res) => {
    const issueId = req.params.id;
    try {
        const issue = await Issue.findById(issueId).lean();
        
        if (!issue) {
            return res.sendFile(path.join(__dirname, '../public', 'issue.html'));
        }

        let html = await fs.readFile(path.join(__dirname, '../public', 'issue.html'), 'utf8');

        // Prepare meta tags
        const title = `${issue.title} | JanAwaaz`;
        const description = issue.description.substring(0, 160) + (issue.description.length > 160 ? '...' : '');
        const url = `${req.protocol}://${req.get('host')}/issue/${issueId}`;
        const image = (issue.images && issue.images.length > 0) ? issue.images[0].url : `https://placehold.co/1200x630/orange/white?text=${encodeURIComponent(issue.title)}`;

        const metaTags = `
    <!-- Social Sharing Meta Tags -->
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${url}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${image}">
        `;

        // Inject meta tags before </head>
        html = html.replace('<title>Issue Details - JanAwaaz</title>', metaTags);
        
        res.send(html);
    } catch (error) {
        console.error('Error serving issue page:', error);
        res.sendFile(path.join(__dirname, '../public', 'issue.html'));
    }
});

app.get('/authority/:id', async (req, res) => {
    const authorityId = req.params.id;
    try {
        const authority = await Authority.findById(authorityId).populate('userId').lean();
        
        if (!authority) {
            return res.sendFile(path.join(__dirname, '../public', 'authority-detail.html'));
        }

        let html = await fs.readFile(path.join(__dirname, '../public', 'authority-detail.html'), 'utf8');

        const authorityName = authority.userId?.displayName || authority.designation || 'Authority';
        const title = `${authorityName} | JanAwaaz Authority`;
        const description = `${authority.designation || 'Authority'} at ${authority.department || 'Government'}. Serving ${authority.jurisdictionDistrict}, ${authority.jurisdictionState}.`;
        const url = `${req.protocol}://${req.get('host')}/authority/${authorityId}`;
        const image = authority.userId?.avatar || `https://placehold.co/1200x630/blue/white?text=${encodeURIComponent(authorityName)}`;

        const metaTags = `
    <!-- Social Sharing Meta Tags -->
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${url}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${image}">
        `;

        // Inject meta tags (assuming a generic title exists or we just inject before </head>)
        if (html.includes('<title>')) {
            html = html.replace(/<title>.*?<\/title>/, metaTags);
        } else {
            html = html.replace('</head>', `${metaTags}\n</head>`);
        }
        
        res.send(html);
    } catch (error) {
        console.error('Error serving authority page:', error);
        res.sendFile(path.join(__dirname, '../public', 'authority-detail.html'));
    }
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'profile.html'));
});

app.get('/profile/:username', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'profile.html'));
});

app.get('/comment/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'comment.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'admin.html'));
});

app.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'leaderboard.html'));
});

app.get('/verify', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'verify.html'));
});

app.get('/authorities', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'authorities.html'));
});

app.get('/apply-authority', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'apply-authority.html'));
});

app.get('/admin-authorities', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'admin-authorities.html'));
});

app.get('/authority-profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'authority-profile.html'));
});

app.get('/authority-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'authority-dashboard.html'));
});

app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'analytics.html'));
});

app.get('/india', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'india.html'));
});

app.get('/notifications', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'notifications.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    // Join district room
    socket.on('join_district', (district) => {
        socket.join(`district_${district}`);
        console.log(`User ${socket.id} joined district: ${district}`);
    });
    
    // Join issue room
    socket.on('join_issue', (issueId) => {
        socket.join(`issue_${issueId}`);
        console.log(`User ${socket.id} joined issue: ${issueId}`);
    });
    
    // Leave district room
    socket.on('leave_district', (district) => {
        socket.leave(`district_${district}`);
        console.log(`User ${socket.id} left district: ${district}`);
    });
    
    // Leave issue room
    socket.on('leave_issue', (issueId) => {
        socket.leave(`issue_${issueId}`);
        console.log(`User ${socket.id} left issue: ${issueId}`);
    });
    
    // Join user's personal room (for notifications)
    socket.on('join_user', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${socket.id} joined personal room: ${userId}`);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    
    // Render Keep-Alive Cron Job
     // Pings the site every 5 minutes (300,000ms) to prevent spinning down on Render's free tier
     const RENDER_URL = process.env.RENDER_URL || 'https://janawaaz.onrender.com';
     setInterval(() => {
         https.get(RENDER_URL, (res) => {
             console.log(`Keep-alive ping to ${RENDER_URL}: Status ${res.statusCode}`);
         }).on('error', (err) => {
             console.error(`Keep-alive ping error: ${err.message}`);
         });
     }, 300000); // 5 minutes
 });