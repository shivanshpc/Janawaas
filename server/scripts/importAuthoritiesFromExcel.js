require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const User = require('../models/User');
const Authority = require('../models/Authority');

const STATE_SHEET_IGNORE = ['📋 State Index'];

const SERVICE_MAPPING = [
    { key: 'electricity', label: 'Electricity', srcColumn: 3 },
    { key: 'water', label: 'Water Supply', srcColumn: 4 },
    { key: 'streetlights', label: 'Street Lighting', srcColumn: 5 },
    { key: 'garbage', label: 'Sanitation & Waste', srcColumn: 6 },
    { key: 'drainage', label: 'Sewer & Drainage', srcColumn: 7 }
];

function normalizeText(value) {
    if (!value) return '';
    return String(value).trim();
}

// Make username longer to reduce collisions from truncation
function normalizeUsername(state, district, service) {
    const name = `${state}-${district}-${service}`.toLowerCase();
    return name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function makeEmail(state, district, service, idx) {
    const safe = `${state}-${district}-${service}`.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    return `${safe}.${idx}@authority.janawaaz.local`;
}

async function main() {
    const workbookPath = process.argv[2] || 'India_Municipal_Authorities_All28States.xlsx';
    const dryRun = process.argv.includes('--dry-run');
    const force = process.argv.includes('--force');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    if (!fs.existsSync(workbookPath)) {
        console.error('Workbook not found:', workbookPath);
        await mongoose.disconnect();
        process.exit(1);
    }

    const workbook = xlsx.readFile(workbookPath);
    const sheetNames = workbook.SheetNames.filter(name => !STATE_SHEET_IGNORE.includes(name));

    const counts = {
        insertedAuthorities: 0,
        createdUsers: 0,
        updatedUsers: 0,
        skippedRows: 0,
        existingAuthorities: 0,
        errors: 0,
        totalRows: 0
    };

    const startTime = Date.now();

    for (const stateName of sheetNames) {
        const sheet = workbook.Sheets[stateName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length <= 3) {
            console.log(`Skipping state "${stateName}" (no data rows).`);
            continue;
        }

        const stateRowStart = 3;
        const stateRowCount = rows.length - stateRowStart;
        counts.totalRows += stateRowCount;

        console.log(`Processing state "${stateName}" (${stateRowCount} rows)...`);

        const userCache = new Map();

        for (let i = stateRowStart; i < rows.length; i++) {
            const row = rows[i];
            const district = normalizeText(row[1]);
            const municipalBody = normalizeText(row[2]);
            if (!district) {
                counts.skippedRows += 1;
                continue;
            }

            for (const map of SERVICE_MAPPING) {
                try {
                    const provider = normalizeText(row[map.srcColumn]);
                    if (!provider || provider.toLowerCase().startsWith('n/a')) continue;

                    const username = normalizeUsername(stateName, district, map.label);
                    const email = makeEmail(stateName, district, map.label, i);

                    let user = userCache.get(username);
                    if (!user) {
                        user = await User.findOne({ username });
                        if (!user) {
                            if (!dryRun) {
                                user = new User({
                                    displayName: `${district} ${map.label} Authority`,
                                    username,
                                    email,
                                    passwordHash: 'defaultpass1',
                                    district,
                                    state: stateName,
                                    role: 'authority',
                                    isVerified: true,
                                    isAadhaarVerified: false,
                                    reputationScore: 0
                                });
                                await user.save();
                            }
                            counts.createdUsers += 1;
                        } else {
                            // ensure existing user has authority role and isVerified
                            let changed = false;
                            if (user.role !== 'authority') { user.role = 'authority'; changed = true; }
                            if (!user.isVerified) { user.isVerified = true; changed = true; }
                            if (!user.email || user.email !== email) { user.email = email; changed = true; }
                            if (changed && !dryRun) {
                                await user.save();
                                counts.updatedUsers += 1;
                            }
                        }
                        userCache.set(username, user);
                    }

                    // In dry-run mode we may not have a real user._id
                    if (!user || !user._id) {
                        counts.skippedRows += 1;
                        continue;
                    }

                    const existingAuthority = await Authority.findOne({ userId: user._id });
                    if (existingAuthority) {
                        if (force) {
                            if (!dryRun) await Authority.deleteOne({ _id: existingAuthority._id });
                        } else {
                            counts.existingAuthorities += 1;
                            continue;
                        }
                    }

                    if (!dryRun) {
                        await Authority.create({
                            userId: user._id,
                            designation: `${map.label} Authority`,
                            department: `${provider}${municipalBody ? ' / ' + municipalBody : ''}`,
                            jurisdictionDistrict: district,
                            jurisdictionState: stateName,
                            areaOfExpertise: map.label,
                            issuesAccepted: 0,
                            issuesResolved: 0,
                            averageRating: 0,
                            badge: 'none'
                        });
                    }

                    counts.insertedAuthorities += 1;
                    if (counts.insertedAuthorities % 50 === 0) {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        console.log(`  Inserted ${counts.insertedAuthorities} authorities so far, elapsed ${elapsed}s`);
                    }
                } catch (err) {
                    console.error(`Error processing row ${i} state ${stateName}:`, err && err.message ? err.message : err);
                    counts.errors += 1;
                    continue;
                }
            }
        }

        console.log(`Finished state "${stateName}".`);
    }

    const elapsedTotal = Math.round((Date.now() - startTime) / 1000);
    console.log('----------------------');
    console.log(`Import completed: totalRows=${counts.totalRows}, insertedAuthorities=${counts.insertedAuthorities}, createdUsers=${counts.createdUsers}, updatedUsers=${counts.updatedUsers}, existingAuthorities=${counts.existingAuthorities}, skippedRows=${counts.skippedRows}, errors=${counts.errors}, elapsed=${elapsedTotal}s`);

    await mongoose.disconnect();
    console.log('Disconnected.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
