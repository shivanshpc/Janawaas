const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Authority = require('../models/Authority');
const Issue = require('../models/Issue');

async function seedData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find or create test authority user
        let authUser = await User.findOne({ email: 'authority.test@gmail.com' });
        if (!authUser) {
            console.log('Test authority user not found. Please create it first via UI or another script.');
            process.exit(1);
        }

        let authority = await Authority.findOne({ userId: authUser._id });
        if (!authority) {
            console.log('Authority profile not found for test user. Creating one...');
            authority = new Authority({
                userId: authUser._id,
                name: 'Test Authority Officer',
                designation: 'Test Municipal Officer',
                department: 'Public Works',
                jurisdictionDistrict: 'Mumbai',
                jurisdictionState: 'Maharashtra',
                areaOfExpertise: 'Roads & Potholes'
            });
            await authority.save();
        }

        const mumbaiDistricts = ['Mumbai', 'Mumbai Suburban'];
        const states = ['Maharashtra'];

        // Add some resolved issues from this authority
        const resolvedIssues = [
            {
                title: 'Fixed major pothole on Link Road',
                description: 'The large pothole near the metro station has been filled and resurfaced. Traffic flow is now normal.',
                category: 'roads',
                district: 'Mumbai',
                state: 'Maharashtra',
                status: 'resolved',
                reportedBy: authUser._id,
                assignedAuthority: authority._id,
                resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                publishedRemarks: 'We fixed this pothole on priority to ensure safe commuting for the residents.'
            },
            {
                title: 'Restored water supply in Bandra West',
                description: 'The broken main pipeline has been repaired. Water supply to all affected areas has been restored with full pressure.',
                category: 'water',
                district: 'Mumbai',
                state: 'Maharashtra',
                status: 'resolved',
                reportedBy: authUser._id,
                assignedAuthority: authority._id,
                resolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                publishedRemarks: 'The repair work was completed in record time to minimize inconvenience to the local residents.'
            },
            {
                title: 'Cleared illegal dumping site in Andheri',
                description: 'The unauthorized garbage dumping spot near the park has been cleared. Anti-dumping signs have been installed.',
                category: 'garbage',
                district: 'Mumbai',
                state: 'Maharashtra',
                status: 'resolved',
                reportedBy: authUser._id,
                assignedAuthority: authority._id,
                resolvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
                publishedRemarks: 'A clean neighborhood is a healthy neighborhood. We are committed to keeping our public spaces waste-free.'
            }
        ];

        // Add some pending/in-progress issues assigned to this authority (for testing Drafts)
        const draftTestIssues = [
            {
                title: 'Broken streetlights on Linking Road',
                description: 'Multiple streetlights are non-functional for over a week near the shopping district.',
                category: 'streetlight',
                district: 'Mumbai',
                state: 'Maharashtra',
                status: 'resolved',
                reportedBy: authUser._id,
                assignedAuthority: authority._id,
                resolvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                draftRemarks: 'We resolved this issue within a week.'
            },
            {
                title: 'Blocked drainage in Juhu',
                description: 'Heavy rains have caused the main drain to overflow near the beach road.',
                category: 'drainage',
                district: 'Mumbai',
                state: 'Maharashtra',
                status: 'resolved',
                reportedBy: authUser._id,
                assignedAuthority: authority._id,
                resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                draftRemarks: 'Cleaning crew completed the work on priority.'
            }
        ];

        await Issue.insertMany([...resolvedIssues, ...draftTestIssues]);
        console.log('Successfully seeded issues for testing.');

        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seedData();
