require('dotenv').config();
const mongoose = require('mongoose');
const Authority = require('../models/Authority');

async function checkDistricts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const totalAuthorities = await Authority.countDocuments();
        console.log('Total authorities:', totalAuthorities);

        const distinctDistricts = await Authority.distinct('jurisdictionDistrict');
        console.log('Distinct districts:', distinctDistricts.length);
        console.log('First 10 districts:', distinctDistricts.slice(0, 10));

        process.exit(0);
    } catch (error) {
        console.error('Error checking districts:', error);
        process.exit(1);
    }
}

checkDistricts();
