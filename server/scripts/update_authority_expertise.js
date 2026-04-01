const mongoose = require('mongoose');
const User = require('../models/User');
const Authority = require('../models/Authority');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function updateAuthorityExpertise() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const email = 'authority.test@gmail.com';
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log(`❌ User with email ${email} not found`);
            process.exit(1);
        }

        const authority = await Authority.findOne({ userId: user._id });

        if (!authority) {
            console.log(`❌ Authority document for user ${email} not found`);
            process.exit(1);
        }

        const oldExpertise = authority.areaOfExpertise;
        authority.areaOfExpertise = 'Roads & Potholes';
        await authority.save();

        console.log(`✅ Updated ${email}'s expertise from "${oldExpertise}" to "Roads & Potholes"`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating authority expertise:', error);
        process.exit(1);
    }
}

updateAuthorityExpertise();
