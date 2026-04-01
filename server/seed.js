/**
 * JanAwaaz - Database Seed Script
 * Creates test accounts and sample data for platform demonstration
 *
 * Usage: node server/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const User                 = require('./models/User');
const Authority            = require('./models/Authority');
const Issue                = require('./models/Issue');
const Comment              = require('./models/Comment');
const Upvote               = require('./models/Upvote');
const Notification         = require('./models/Notification');
const IdentityVerification = require('./models/IdentityVerification');

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

function hoursAgo(n) {
    return new Date(Date.now() - n * 3600 * 1000);
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fix aadhaarHash index - ensure it is sparse so multiple null values are allowed
    try {
        await mongoose.connection.db.collection('users').dropIndex('aadhaar_hash_1');
        console.log('Dropped old aadhaarHash index');
    } catch (e) { /* index may not exist - that is fine */ }
    try {
        await mongoose.connection.db.collection('users').createIndex(
            { aadhaarHash: 1 }, { unique: true, sparse: true, background: true }
        );
        console.log('Recreated aadhaarHash index as sparse');
    } catch (e) { /* already correct */ }

    // Fix ratings compound index - ensure it is sparse
    try {
        await mongoose.connection.db.collection('ratings').dropIndex('issue_id_1_rated_by_1');
        console.log('Dropped old ratings compound index');
    } catch (e) { /* may not exist */ }
    try {
        await mongoose.connection.db.collection('ratings').createIndex(
            { issueId: 1, ratedBy: 1 }, { unique: true, sparse: true, background: true }
        );
    } catch (e) { /* already correct */ }

    // ── Wipe existing test data ──────────────────────────────────────────────
    const testEmails = [
        'citizen@gmail.com', 'admin@gmail.com',
        'citizen.unverified@gmail.com', 'citizen.aadhaar@gmail.com', 'citizen.banned@gmail.com',
        'admin2@gmail.com',
        'authority.test@gmail.com',
        'ananya@example.com', 'vikram@example.com', 'meera@example.com',
        'arjun@example.com',  'sunita@example.com',
    ];
    const existingUsers = await User.find({ email: { $in: testEmails } });
    const existingIds   = existingUsers.map(u => u._id);

    if (existingIds.length) {
        await Authority.deleteMany({ userId: { $in: existingIds } });
        await IdentityVerification.deleteMany({ userId: { $in: existingIds } });
        const existingIssues = await Issue.find({ reportedBy: { $in: existingIds } });
        const issueIds = existingIssues.map(i => i._id);
        await Comment.deleteMany({ issueId: { $in: issueIds } });
        await Upvote.deleteMany({ issueId: { $in: issueIds } });
        await Notification.deleteMany({ userId: { $in: existingIds } });
        await Issue.deleteMany({ reportedBy: { $in: existingIds } });
        await User.deleteMany({ _id: { $in: existingIds } });
        console.log('Cleared previous test data');
    }

    // ── 1. Users ─────────────────────────────────────────────────────────────
    const citizenUser = await User.create({
        displayName:       'Rahul Sharma',
        username:          'rahulsharma',
        email:             'citizen@gmail.com',
        passwordHash:      'citizen123',     // hashed by pre-save hook
        district:          'Mumbai',
        state:             'Maharashtra',
        role:              'citizen',
        isAadhaarVerified: true,
        isVerified:        true,
        aadhaarHash:       require('crypto').createHash('sha256').update('999900000001').digest('hex'),
        reputationScore:   340,
        createdAt:         daysAgo(90),
    });

    const adminUser = await User.create({
        displayName:       'Admin JanAwaaz',
        username:          'janawaaz_admin',
        email:             'admin@gmail.com',
        passwordHash:      'admin123',
        district:          'Delhi',
        state:             'Delhi',
        role:              'admin',
        isVerified:        true,
        isAadhaarVerified: true,
        aadhaarHash:       require('crypto').createHash('sha256').update('999900000002').digest('hex'),
        createdAt:         daysAgo(120),
    });

    console.log('Created users:', citizenUser.email, adminUser.email);

    // ── 1b. Additional test accounts for comprehensive testing ────────────────
    
    // Additional citizen accounts - different verification/ban states
    const testCitizen1 = await User.create({
        displayName:       'John Doe',
        username:          'johndoe_unverified',
        email:             'citizen.unverified@gmail.com',
        passwordHash:      'citizen123',
        district:          'Delhi',
        state:             'Delhi',
        role:              'citizen',
        isVerified:        false,  // Not email verified
        isAadhaarVerified: false,  // Not Aadhaar verified
        reputationScore:   45,
        createdAt:         daysAgo(30),
    });

    const testCitizen2 = await User.create({
        displayName:       'Jane Smith',
        username:          'janesmith_aadhaar',
        email:             'citizen.aadhaar@gmail.com',
        passwordHash:      'citizen123',
        district:          'Bangalore',
        state:             'Karnataka',
        role:              'citizen',
        isVerified:        true,
        isAadhaarVerified: true,  // Aadhaar verified
        aadhaarHash:       require('crypto').createHash('sha256').update('999900000004').digest('hex'),
        reputationScore:   580,
        createdAt:         daysAgo(60),
    });

    const testCitizen3 = await User.create({
        displayName:       'Banned User',
        username:          'banneduser123',
        email:             'citizen.banned@gmail.com',
        passwordHash:      'citizen123',
        district:          'Mumbai',
        state:             'Maharashtra',
        role:              'citizen',
        isVerified:        true,
        isBanned:          true,  // Banned account
        reputationScore:   -100,
        createdAt:         daysAgo(90),
    });

    // Additional admin account (for testing admin features)
    const testAdmin = await User.create({
        displayName:       'Secondary Admin',
        username:          'secondary_admin',
        email:             'admin2@gmail.com',
        passwordHash:      'admin123',
        district:          'Mumbai',
        state:             'Maharashtra',
        role:              'admin',
        isVerified:        true,
        isAadhaarVerified: true,
        aadhaarHash:       require('crypto').createHash('sha256').update('999900000005').digest('hex'),
        createdAt:         daysAgo(100),
    });

    console.log('Created additional test accounts for comprehensive testing');

    // ── 1c. Test Authority Account ──────────────────────────────────────────
    const testAuthority = await User.create({
        displayName:       'Test Authority Officer',
        username:          'testauthority',
        email:             'authority.test@gmail.com',
        passwordHash:      'authority123',
        district:          'Mumbai',
        state:             'Maharashtra',
        role:              'authority',
        isVerified:        true,
        isAadhaarVerified: true,
        aadhaarHash:       require('crypto').createHash('sha256').update('999900000099').digest('hex'),
        reputationScore:   450,
        createdAt:         daysAgo(60),
    });

    // Create authority profile for test authority
    const testAuthorityProfile = await Authority.create({
        userId:                testAuthority._id,
        designation:           'Test Authority Officer',
        department:            'Test Municipal Department',
        jurisdictionDistrict:  'Mumbai',
        jurisdictionState:     'Maharashtra',
        areaOfExpertise:       'Others',
        issuesAccepted:        0,
        issuesResolved:        0,
        averageRating:         0,
        badge:                 'none',
        createdAt:             daysAgo(60),
    });

    console.log('Created test authority account');

    // ── 1d. Fetch an existing authority from database (imported from Excel) ───
    let dbAuthority = await Authority.findOne().limit(1);
    if (!dbAuthority) {
        console.warn('No authorities found in database! Import authorities using importAuthoritiesFromExcel.js first.');
        dbAuthority = testAuthorityProfile; // fallback to test authority
    }
    console.log(`Using authority from database: ${dbAuthority._id}`);

    // ── 2. Extra citizen accounts for realistic community feel ────────────────
    const extras = await User.insertMany([
        {
            displayName: 'Ananya Iyer',      username: 'ananyaiyer',
            email: 'ananya@example.com',     passwordHash: 'pass1234',
            district: 'Mumbai', state: 'Maharashtra', role: 'citizen',
            isAadhaarVerified: true, reputationScore: 210, createdAt: daysAgo(60),
        },
        {
            displayName: 'Vikram Nair',      username: 'vikramnair',
            email: 'vikram@example.com',     passwordHash: 'pass1234',
            district: 'Mumbai', state: 'Maharashtra', role: 'citizen',
            reputationScore: 95,             createdAt: daysAgo(45),
        },
        {
            displayName: 'Meera Pillai',     username: 'meerapillai',
            email: 'meera@example.com',      passwordHash: 'pass1234',
            district: 'Pune', state: 'Maharashtra', role: 'citizen',
            isAadhaarVerified: true, reputationScore: 175, createdAt: daysAgo(50),
        },
        {
            displayName: 'Arjun Mehta',      username: 'arjunmehta',
            email: 'arjun@example.com',      passwordHash: 'pass1234',
            district: 'Delhi', state: 'Delhi', role: 'citizen',
            isAadhaarVerified: true, reputationScore: 420, createdAt: daysAgo(70),
        },
        {
            displayName: 'Sunita Rao',       username: 'sunitarao',
            email: 'sunita@example.com',     passwordHash: 'pass1234',
            district: 'Bangalore', state: 'Karnataka', role: 'citizen',
            reputationScore: 60,             createdAt: daysAgo(20),
        },
    ]);
    // Extras are bulk-inserted; passwords are NOT auto-hashed via pre-save in
    // insertMany. For seed purposes these accounts are display-only with no login.
    const [ananya, vikram, meera, arjun, sunita] = extras;

    console.log('Created extra community users');

    // ── 4. Identity Verifications ───────────────────────────────────────────
    await IdentityVerification.insertMany([
        {
            userId:       citizenUser._id,
            documentType: 'voter_id',
            documentUrl:  'https://placehold.co/400x250?text=Voter+ID',
            status:       'approved',
            reviewedBy:   adminUser._id,
            reviewNote:   'Document verified successfully.',
            createdAt:    daysAgo(85),
            reviewedAt:   daysAgo(84),
        },
        {
            userId:       adminUser._id,
            documentType: 'pan_card',
            documentUrl:  'https://placehold.co/400x250?text=PAN+Card',
            status:       'approved',
            reviewedBy:   adminUser._id,
            reviewNote:   'Admin account verified.',
            createdAt:    daysAgo(115),
            reviewedAt:   daysAgo(114),
        },
        {
            userId:       testCitizen2._id,
            documentType: 'voter_id',
            documentUrl:  'https://placehold.co/400x250?text=Voter+ID',
            status:       'approved',
            reviewedBy:   adminUser._id,
            reviewNote:   'Document verified successfully.',
            createdAt:    daysAgo(55),
            reviewedAt:   daysAgo(54),
        },
    ]);
    console.log('Created identity verifications');

    // ── 5. Issues ─────────────────────────────────────────────────────────────
    // Status: pending | accepted | in_progress | resolved | denied

    const issues = await Issue.insertMany([
        // --- RESOLVED ---
        {
            title:        'Deep potholes on SV Road near Bandra Station',
            description:  'A stretch of roughly 200 metres on SV Road between Bandra Station and Turner Road has developed multiple deep potholes over the past month due to rain damage. Two-wheelers have had accidents. Urgent repair needed before the rains worsen it.',
            category:     'roads',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0596, longitude: 72.8295,
            status:       'resolved',
            reportedBy:   citizenUser._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  87,
            severityScore: 7.8,
            viewCount:    312,
            resolvedAt:   daysAgo(5),
            createdAt:    daysAgo(28),
            updatedAt:    daysAgo(5),
        },
        {
            title:        'Street lights not working on Linking Road for 3 weeks',
            description:  'More than 15 streetlights between Linking Road and Hill Road have been non-functional for three weeks making the evening commute and night walks dangerous. Women and elderly residents are afraid to go out after dark.',
            category:     'streetlight',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0607, longitude: 72.8362,
            status:       'resolved',
            reportedBy:   ananya._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  64,
            severityScore: 6.2,
            viewCount:    198,
            resolvedAt:   daysAgo(3),
            createdAt:    daysAgo(21),
            updatedAt:    daysAgo(3),
        },
        // --- IN PROGRESS ---
        {
            title:        'Overflowing drain near Dharavi causing waterlogging',
            description:  'The main drainage channel near Dharavi Cross Road is blocked with debris and garbage. Heavy waterlogging occurs even in light rain, flooding ground-floor shops and homes. Multiple requests to BMC over the last 6 months have gone unanswered.',
            category:     'drainage',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0420, longitude: 72.8545,
            status:       'in_progress',
            reportedBy:   citizenUser._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  143,
            severityScore: 9.1,
            viewCount:    576,
            isFeatured:   true,
            deadline:     new Date(Date.now() + 10 * 24 * 3600 * 1000), // 10 days from now
            createdAt:    daysAgo(35),
            updatedAt:    daysAgo(2),
        },
        {
            title:        'No water supply in Kurla West for 4 days',
            description:  'Water supply in Kurla West ward has completely stopped since Monday. Residents across 6 buildings are dependent on water tankers that arrive once every 2 days. Families with infants and elderly people are severely affected.',
            category:     'water',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0726, longitude: 72.8820,
            status:       'in_progress',
            reportedBy:   vikram._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  211,
            severityScore: 9.8,
            viewCount:    840,
            isFeatured:   true,
            deadline:     new Date(Date.now() + 3 * 24 * 3600 * 1000),
            createdAt:    daysAgo(4),
            updatedAt:    hoursAgo(8),
        },
        {
            title:        'Broken footpath tiles on Hill Road causing injuries',
            description:  'Multiple footpath tiles on Hill Road from the bus stop to the market area are cracked, uneven or completely missing. A senior citizen fractured her wrist last week after tripping. The footpath has been in terrible condition for months.',
            category:     'roads',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0640, longitude: 72.8319,
            status:       'in_progress',
            reportedBy:   ananya._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  56,
            severityScore: 6.5,
            viewCount:    203,
            deadline:     new Date(Date.now() + 7 * 24 * 3600 * 1000),
            createdAt:    daysAgo(14),
            updatedAt:    daysAgo(1),
        },
        // --- ACCEPTED ---
        {
            title:        'Garbage not collected in Andheri East for a week',
            description:  'Municipal garbage van has not visited Andheri East Sector 7 for 7 consecutive days. Waste is piling up on the street and near the market. The smell and hygiene risk is severe. Residents have called the helpline multiple times without resolution.',
            category:     'garbage',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.1197, longitude: 72.8674,
            status:       'accepted',
            reportedBy:   citizenUser._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  98,
            severityScore: 8.3,
            viewCount:    389,
            deadline:     new Date(Date.now() + 5 * 24 * 3600 * 1000),
            createdAt:    daysAgo(10),
            updatedAt:    daysAgo(1),
        },
        {
            title:        'Power cuts lasting 8+ hours daily in Ghatkopar',
            description:  'Residents of Ghatkopar East are experiencing 8 to 10 hour daily power cuts since the substation upgrade was suspended last month. Working from home is impossible. Stored food is getting spoiled. MSEDCL has not communicated any resolution timeline.',
            category:     'electricity',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.0862, longitude: 72.9093,
            status:       'accepted',
            reportedBy:   meera._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  175,
            severityScore: 8.9,
            viewCount:    654,
            isFeatured:   true,
            deadline:     new Date(Date.now() + 6 * 24 * 3600 * 1000),
            createdAt:    daysAgo(8),
            updatedAt:    hoursAgo(12),
        },
        // --- PENDING ---
        {
            title:        'Stray dogs attacking pedestrians near school gate',
            description:  'A pack of aggressive stray dogs has been attacking pedestrians and school children near St. Xavier School, Vile Parle every morning. Three children were bitten last week. BMC animal control has not responded despite multiple complaints.',
            category:     'other',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.1056, longitude: 72.8336,
            status:       'pending',
            reportedBy:   vikram._id,
            upvoteCount:  234,
            severityScore: 9.6,
            viewCount:    921,
            isFeatured:   true,
            isPanIndiaFeatured: false,
            createdAt:    daysAgo(3),
            updatedAt:    daysAgo(3),
        },
        {
            title:        'Park in Powai completely waterlogged, unusable',
            description:  'The community park near Powai Lake has been flooded and unusable for the past two weeks due to poor drainage. Children have nowhere to play and the area is becoming a breeding ground for mosquitoes posing a malaria risk.',
            category:     'parks',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.1176, longitude: 72.9060,
            status:       'pending',
            reportedBy:   ananya._id,
            upvoteCount:  47,
            severityScore: 5.8,
            viewCount:    156,
            createdAt:    daysAgo(6),
            updatedAt:    daysAgo(6),
        },
        {
            title:        'Water contamination - yellow water from taps in Malad',
            description:  'Taps in Malad West are running yellowish-brown discoloured water since the pipeline work near Mindspace was completed. Multiple residents reported skin rashes. We are forced to buy 10 litre bottles every day at huge expense.',
            category:     'water',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.1872, longitude: 72.8484,
            status:       'pending',
            reportedBy:   citizenUser._id,
            upvoteCount:  312,
            severityScore: 9.9,
            viewCount:    1120,
            isFeatured:   true,
            isPanIndiaFeatured: true,
            createdAt:    daysAgo(2),
            updatedAt:    daysAgo(2),
        },
        // --- Issues from other districts ---
        {
            title:        'Pothole crater on Ring Road near Connaught Place',
            description:  'A massive pothole, nearly 3 feet wide and 8 inches deep, has formed on Ring Road near CP. Vehicles swerve dangerously to avoid it causing near-misses daily. One motorcycle accident was reported this week.',
            category:     'roads',
            district:     'Delhi', state: 'Delhi',
            latitude:     28.6316, longitude: 77.2198,
            status:       'pending',
            reportedBy:   arjun._id,
            upvoteCount:  189,
            severityScore: 8.7,
            viewCount:    672,
            createdAt:    daysAgo(5),
            updatedAt:    daysAgo(5),
        },
        {
            title:        'Open sewer manhole on MG Road - Bangalore',
            description:  'A manhole cover on MG Road near Trinity Circle has been missing for over 10 days. There is no barricade or warning sign. Pedestrians and bikers risk falling in. BBMP must urgently cover or barricade it.',
            category:     'drainage',
            district:     'Bangalore', state: 'Karnataka',
            latitude:     12.9758, longitude: 77.6096,
            status:       'pending',
            reportedBy:   sunita._id,
            upvoteCount:  267,
            severityScore: 9.4,
            viewCount:    794,
            isFeatured:   true,
            createdAt:    daysAgo(11),
            updatedAt:    daysAgo(11),
        },
        {
            title:        'Garbage dump near residential area in Pune',
            description:  'An unauthorised garbage dump has formed next to the residential apartments on FC Road, Pune. PMC garbage trucks are dumping waste here instead of the designated landfill. Foul smell, flies and health hazard for 2000+ residents.',
            category:     'garbage',
            district:     'Pune', state: 'Maharashtra',
            latitude:     18.5204, longitude: 73.8567,
            status:       'accepted',
            reportedBy:   meera._id,
            assignedAuthority: dbAuthority._id,
            upvoteCount:  122,
            severityScore: 8.1,
            viewCount:    445,
            createdAt:    daysAgo(12),
            updatedAt:    daysAgo(2),
        },
        // --- DENIED ---
        {
            title:        'Request to build new flyover on Western Express Highway',
            description:  'Requesting construction of a new flyover at the Goregaon junction to ease traffic. This is more of a long-term infrastructure request rather than an immediate civic issue.',
            category:     'roads',
            district:     'Mumbai', state: 'Maharashtra',
            latitude:     19.1555, longitude: 72.8491,
            status:       'denied',
            reportedBy:   vikram._id,
            upvoteCount:  18,
            severityScore: 2.1,
            viewCount:    67,
            createdAt:    daysAgo(20),
            updatedAt:    daysAgo(18),
        },
    ]);

    console.log(`Created ${issues.length} issues`);

    // ── 6. Comments ──────────────────────────────────────────────────────────
    const drainiIssue   = issues[2]; // Dharavi drainage - in_progress
    const waterIssue    = issues[3]; // Kurla water - in_progress
    const footpathIssue = issues[4]; // Hill Road footpath - in_progress
    const garbageIssue  = issues[5]; // Andheri garbage - accepted
    const powerIssue    = issues[6]; // Ghatkopar power - accepted
    const resolvedRoad  = issues[0]; // SV Road potholes - resolved
    const resolvedLight = issues[1]; // Linking Road lights - resolved

    const allComments = await Comment.insertMany([
        // Dharavi drainage
        {
            issueId: drainiIssue._id, authorId: citizenUser._id,
            body: 'This has been a problem every monsoon for 5 years! Thank you for finally registering this. Please authorities - just fix the root cause, not a band-aid.',
            upvoteCount: 23, createdAt: daysAgo(34),
        },
        {
            issueId: drainiIssue._id, authorId: ananya._id,
            body: 'Confirmed - the waterlogging reached knee level last Tuesday. My scooter got damaged. I have video of the flooding if the authority team needs evidence.',
            upvoteCount: 18, createdAt: daysAgo(30),
        },
        {
            issueId: drainiIssue._id, authorId: vikram._id,
            body: 'Glad to see the authority has accepted this. The desilting news is encouraging. Hoping it actually gets done this time.',
            upvoteCount: 11, createdAt: daysAgo(9),
        },
        // Water contamination
        {
            issueId: issues[9]._id, authorId: ananya._id,
            body: 'Same issue in our building. We tested the water and it smells of rust. This is a serious health risk especially for children.',
            upvoteCount: 45, createdAt: daysAgo(2),
        },
        {
            issueId: issues[9]._id, authorId: arjun._id,
            body: 'This needs to be escalated immediately. Water contamination can cause disease outbreaks. The local MLA should be notified.',
            upvoteCount: 38, createdAt: daysAgo(1),
        },
        // Stray dogs
        {
            issueId: issues[7]._id, authorId: meera._id,
            body: 'This is terrifying. I saw the attack on Tuesday morning. The school needs to file a formal police complaint in addition to this BMC report.',
            upvoteCount: 67, createdAt: daysAgo(2),
        },
        {
            issueId: issues[7]._id, authorId: arjun._id,
            body: 'Animal control should respond within 24 hours for dog attack complaints. This has been pending 3 days which is unacceptable.',
            upvoteCount: 52, createdAt: daysAgo(2),
        },
        // Power cuts
        {
            issueId: powerIssue._id, authorId: citizenUser._id,
            body: 'Reducing to 3 hours is still too much! But at least there is a response now. Please expedite the transformer replacement.',
            upvoteCount: 29, createdAt: hoursAgo(10),
        },
        {
            issueId: powerIssue._id, authorId: vikram._id,
            body: 'How long will the replacement take? We need a firm date. People working from home are severely affected.',
            upvoteCount: 21, createdAt: hoursAgo(9),
        },
        // Resolved road
        {
            issueId: resolvedRoad._id, authorId: citizenUser._id,
            body: 'The repairs look solid! Hot mix used properly this time. Big improvement over the patchwork done last year. Marking this resolved with 5 stars.',
            upvoteCount: 31, createdAt: daysAgo(4),
        },
        // Delhi pothole
        {
            issueId: issues[10]._id, authorId: arjun._id,
            body: 'This pothole has been here since December. Every day someone barely avoids falling. NDMC needs to prioritise this.',
            upvoteCount: 44, createdAt: daysAgo(4),
        },
        // Bangalore manhole
        {
            issueId: issues[11]._id, authorId: sunita._id,
            body: 'Absolute negligence. BBMP should be held accountable if someone falls in. I have flagged this on the BBMP app too but no response.',
            upvoteCount: 89, createdAt: daysAgo(10),
        },
    ]);

    console.log(`Created ${allComments.length} comments`);

    // ── 8. Upvotes ────────────────────────────────────────────────────────────
    // Spread upvotes across users and issues
    const upvotePairs = [
        [citizenUser._id,   issues[2]._id ],
        [citizenUser._id,   issues[3]._id ],
        [citizenUser._id,   issues[7]._id ],
        [citizenUser._id,   issues[9]._id ],
        [citizenUser._id,   issues[11]._id],
        [ananya._id,        issues[3]._id ],
        [ananya._id,        issues[7]._id ],
        [ananya._id,        issues[9]._id ],
        [ananya._id,        issues[10]._id],
        [vikram._id,        issues[2]._id ],
        [vikram._id,        issues[6]._id ],
        [vikram._id,        issues[9]._id ],
        [vikram._id,        issues[11]._id],
        [meera._id,         issues[3]._id ],
        [meera._id,         issues[7]._id ],
        [meera._id,         issues[9]._id ],
        [arjun._id,         issues[10]._id],
        [arjun._id,         issues[9]._id ],
        [arjun._id,         issues[7]._id ],
        [sunita._id,        issues[11]._id],
        [sunita._id,        issues[9]._id ],
    ];

    for (const [userId, issueId] of upvotePairs) {
        await Upvote.create({ userId, issueId }).catch(() => {}); // ignore dups
    }

    console.log(`Created ${upvotePairs.length} upvotes`);

    // ── 9. Notifications ────────────────────────────────────────────────────
    await Notification.insertMany([
        // Citizen notifications
        {
            userId:    citizenUser._id,
            type:      'issue_update',
            title:     'Update on your issue',
            message:   'Authority posted an update on "Overflowing drain near Dharavi": Desilting work started today.',
            isRead:    false,
            metadata:  { issueId: drainiIssue._id },
            createdAt: daysAgo(4),
        },
        {
            userId:    citizenUser._id,
            type:      'issue_accepted',
            title:     'Issue accepted!',
            message:   'Your issue "Garbage not collected in Andheri East" has been accepted by the authority.',
            isRead:    false,
            metadata:  { issueId: garbageIssue._id },
            createdAt: daysAgo(1),
        },
        {
            userId:    citizenUser._id,
            type:      'issue_resolved',
            title:     'Issue resolved!',
            message:   'Your issue "Deep potholes on SV Road" has been marked as resolved. Please rate the authority.',
            isRead:    true,
            metadata:  { issueId: resolvedRoad._id },
            createdAt: daysAgo(5),
        },
        {
            userId:    citizenUser._id,
            type:      'upvote',
            title:     'People are upvoting your issue',
            message:   '312 people have upvoted "Water contamination - yellow water from taps in Malad". It is now trending!',
            isRead:    false,
            metadata:  { issueId: issues[9]._id },
            createdAt: daysAgo(1),
        },
        {
            userId:    citizenUser._id,
            type:      'comment',
            title:     'New comment on your issue',
            message:   'Arjun Mehta commented on "Water contamination - yellow water from taps in Malad".',
            isRead:    false,
            metadata:  { issueId: issues[9]._id },
            createdAt: daysAgo(1),
        },
        // Admin notifications
        {
            userId:    adminUser._id,
            type:      'new_issue',
            title:     'Issue flagged for review',
            message:   '"Water contamination in Malad" has gone viral with 1120 views and may need admin attention.',
            isRead:    false,
            metadata:  { issueId: issues[9]._id },
            createdAt: daysAgo(1),
        },
    ]);

    console.log('Created notifications');

    // ── Done ─────────────────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('  Seed complete! Test accounts:');
    console.log('========================================');
    console.log('\n  PRIMARY ACCOUNTS:');
    console.log('  ────────────────────────────────────');
    console.log('  Citizen  : citizen@gmail.com   / citizen123');
    console.log('  Admin    : admin@gmail.com      / admin123');
    console.log('\n  TEST AUTHORITY ACCOUNT:');
    console.log('  ────────────────────────────────────');
    console.log('  Authority: authority.test@gmail.com / authority123');
    console.log('\n  ADDITIONAL CITIZEN ACCOUNTS:');
    console.log('  ────────────────────────────────────');
    console.log('  Unverified Citizen: citizen.unverified@gmail.com / citizen123');
    console.log('  Aadhaar Verified  : citizen.aadhaar@gmail.com / citizen123');
    console.log('  Banned Citizen    : citizen.banned@gmail.com / citizen123');
    console.log('\n  ADDITIONAL ADMIN ACCOUNT:');
    console.log('  ────────────────────────────────────');
    console.log('  Secondary Admin   : admin2@gmail.com / admin123');
    console.log('\n  NOTE: Authorities imported from Excel are used for issue assignments.');
    console.log('  Test authority above is available for testing authority features.');
    console.log('\n  COMMUNITY USERS: (5 extra citizens for realistic feel)');
    console.log('  ────────────────────────────────────');
    console.log('  Ananya Iyer, Vikram Nair, Meera Pillai, Arjun Mehta, Sunita Rao');
    console.log('\n  DATA SUMMARY:');
    console.log('  ────────────────────────────────────');
    console.log(`  Issues    : ${issues.length}`);
    console.log(`  Comments  : ${allComments.length}`);
    console.log(`  Upvotes   : ${upvotePairs.length}`);
    console.log('========================================\n');

    await mongoose.disconnect();
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
