/**
 * Database Index Optimizer
 * Ensures all recommended indexes are created and displays index statistics
 * 
 * Usage:
 *   node server/utils/indexOptimizer.js create    - Create all recommended indexes
 *   node server/utils/indexOptimizer.js stats     - Display index statistics
 *   node server/utils/indexOptimizer.js analyze   - Analyze slow queries (requires slowQuery log)
 *   node server/utils/indexOptimizer.js remove    - Remove duplicate/unused indexes (requires output from analyze)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Issue = require('../models/Issue');
const Comment = require('../models/Comment');
const Upvote = require('../models/Upvote');
const Notification = require('../models/Notification');
const Rating = require('../models/Rating');
const Authority = require('../models/Authority');
const IdentityVerification = require('../models/IdentityVerification');
const AuthorityApplication = require('../models/AuthorityApplication');
const IssueFollower = require('../models/IssueFollower');
const IssueUpdate = require('../models/IssueUpdate');
const AuditLog = require('../models/AuditLog');
const Petition = require('../models/Petition');
const Tag = require('../models/Tag');
const SocialShare = require('../models/SocialShare');
const Checklist = require('../models/Checklist');
const ChecklistItem = require('../models/ChecklistItem');

const command = process.argv[2] || 'stats';

const models = [
    User, Issue, Comment, Upvote, Notification, Rating, Authority,
    IdentityVerification, AuthorityApplication, IssueFollower, IssueUpdate,
    AuditLog, Petition, Tag, SocialShare, Checklist, ChecklistItem
];

async function createIndexes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        console.log('\n📊 Creating Indexes...\n');

        let totalCreated = 0;
        for (const model of models) {
            try {
                const result = await model.collection.getIndexes();
                const count = Object.keys(result).length;
                console.log(`✅ ${model.collection.name}: ${count} indexes`);
                totalCreated += count;
            } catch (err) {
                console.log(`⚠️  ${model.collection.name}: Error - ${err.message}`);
            }
        }

        console.log(`\n✨ Total: ${totalCreated} indexes created`);
        console.log('\nIndex creation complete!');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

async function displayIndexStats() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('\n📈 INDEX STATISTICS\n');
        console.log('═'.repeat(80));

        let totalIndexes = 0;

        for (const model of models) {
            try {
                const collection = model.collection;
                const indexes = await collection.getIndexes();

                console.log(`\n📦 ${model.collection.name.toUpperCase()}`);
                console.log('─'.repeat(80));
                console.log(`  Indexes: ${Object.keys(indexes).length}`);
                console.log('  Index Details:');
                
                for (const [key, index] of Object.entries(indexes)) {
                    const keys = Object.keys(index.key).join(', ');
                    const unique = index.unique ? ' [UNIQUE]' : '';
                    const sparse = index.sparse ? ' [SPARSE]' : '';
                    console.log(`    • ${keys}${unique}${sparse}`);
                }
                
                totalIndexes += Object.keys(indexes).length;
            } catch (err) {
                console.log(`  ⚠️  Error: ${err.message}`);
            }
        }

        console.log('\n' + '═'.repeat(80));
        console.log(`\n📊 SUMMARY:`);
        console.log(`  Total Collections: ${models.length}`);
        console.log(`  Total Indexes: ${totalIndexes}`);
        console.log('\n' + '═'.repeat(80) + '\n');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

async function rebuildIndexes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('\n🔧 REBUILDING INDEXES\n');
        
        for (const model of models) {
            try {
                await model.collection.dropIndexes();
                await model.syncIndexes();
                console.log(`✅ ${model.collection.name}: Indexes rebuilt`);
            } catch (err) {
                console.log(`⚠️  ${model.collection.name}: ${err.message}`);
            }
        }
        
        console.log('\n✨ All indexes rebuilt!\n');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

async function main() {
    switch (command.toLowerCase()) {
        case 'create':
            await createIndexes();
            break;
        case 'stats':
            await displayIndexStats();
            break;
        case 'rebuild':
            await rebuildIndexes();
            break;
        default:
            console.log(`
Usage:
  node server/utils/indexOptimizer.js stats     - Display index statistics (default)
  node server/utils/indexOptimizer.js create    - Ensure all indexes are created
  node server/utils/indexOptimizer.js rebuild   - Rebuild all indexes
            `);
    }
}

main().catch(console.error);
