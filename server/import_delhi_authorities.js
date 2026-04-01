
require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const User = require('./models/User');
const Authority = require('./models/Authority');

async function importDelhiAuthorities() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const filePath = 'Municipal_Authorities_India.xlsx';
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Skip header rows, data starts from row 4 (index 3)
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const rows = rawData.slice(3); // Headers are in row 3 (index 2)
        
        const delhiRows = rows.filter(row => row[0] === 'NCT Delhi');
        console.log(`Found ${delhiRows.length} Delhi authorities to import.`);

        const categoryMap = {
            'Municipal / Local Body': 'Urban Planning',
            'Electricity Authority': 'Electricity',
            'Water Authority': 'Water Supply',
            'Streetlights Authority': 'Street Lighting',
            'Garbage / Solid Waste': 'Sanitation & Waste',
            'Drainage Authority': 'Sewer & Drainage'
        };

        for (const row of delhiRows) {
            const state = row[0];
            const district = row[1];
            
            // For each service type in the row, create an authority if it doesn't exist
            // Column indices: 2=Municipal, 3=Electricity, 4=Water, 5=Streetlights, 6=Garbage, 7=Drainage
            const services = [
                { name: row[2], type: 'Municipal / Local Body' },
                { name: row[3], type: 'Electricity Authority' },
                { name: row[4], type: 'Water Authority' },
                { name: row[5], type: 'Streetlights Authority' },
                { name: row[6], type: 'Garbage / Solid Waste' },
                { name: row[7], type: 'Drainage Authority' }
            ];

            for (const service of services) {
                if (!service.name || service.name === 'N/A') continue;

                // Create a unique username for this authority
                const baseUsername = service.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
                const districtSlug = district.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
                const username = `${baseUsername}_${districtSlug}`;
                const email = `${username}@janawaaz.gov.in`;

                // Check if user already exists
                let user = await User.findOne({ username });
                if (!user) {
                    user = await User.create({
                        displayName: service.name,
                        username: username,
                        email: email,
                        passwordHash: 'authority123', // Default password
                        role: 'authority',
                        isVerified: true,
                        district: district,
                        state: state
                    });
                    console.log(`Created user: ${username}`);
                }

                // Create or update authority profile
                let authority = await Authority.findOne({ userId: user._id });
                if (!authority) {
                    authority = await Authority.create({
                        userId: user._id,
                        designation: service.type,
                        department: service.name,
                        jurisdictionDistrict: district,
                        jurisdictionState: state,
                        areaOfExpertise: categoryMap[service.type] || 'Others',
                        about: `Official authority for ${service.type} in ${district}, ${state}.`,
                        description: `Responsible for managing ${service.type} services provided by ${service.name}.`
                    });
                    console.log(`Created authority profile for: ${service.name} (${district})`);
                }
            }
        }

        console.log('Import completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Import error:', error);
        process.exit(1);
    }
}

importDelhiAuthorities();
