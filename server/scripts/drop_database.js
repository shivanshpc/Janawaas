require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in environment');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  console.log('Connected. Database name:', db.databaseName);

  const cols = await db.listCollections().toArray();
  if (!cols || cols.length === 0) {
    console.log('No collections found.');
  } else {
    console.log('Collections:');
    cols.forEach(c => console.log(' -', c.name));
  }

  if (process.argv.includes('--drop')) {
    console.log('Dropping database:', db.databaseName);
    await db.dropDatabase();
    console.log('Database dropped.');
  } else {
    console.log('\nNo destructive actions taken. To drop the database, re-run with `--drop`.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
