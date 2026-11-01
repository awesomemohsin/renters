import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const mongoose = require('mongoose');

dns.setServers(['8.8.8.8', '1.1.1.1']);

async function restoreDatabase() {
  const args = process.argv.slice(2);
  const backupFolderArg = args.find((a) => !a.startsWith('--'));
  const isConfirmed = args.includes('--confirm');

  if (!backupFolderArg) {
    console.error('Usage: node scripts/restore-db.mjs <backup-folder-path> [--confirm]');
    console.error('Example: node scripts/restore-db.mjs backups/2026-11-01T12-49-22 --confirm');
    process.exit(1);
  }

  const backupDir = path.resolve(backupFolderArg);
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`Invalid backup folder: manifest.json not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Loaded backup manifest from ${manifest.timestamp}`);
  console.log(`Collections to restore:`, manifest.collections);

  if (!isConfirmed) {
    console.log('\n[DRY RUN] Add --confirm to execute actual restoration into MongoDB Atlas.');
    return;
  }

  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
  if (!uriMatch) {
    throw new Error('MONGODB_URI not found in .env.local');
  }
  const uri = uriMatch[1].trim().replace(/^['"]|['"]$/g, '');

  console.log('\nConnecting to MongoDB Atlas for restoration...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const [collName, count] of Object.entries(manifest.collections)) {
    const filePath = path.join(backupDir, `${collName}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ Warning: file not found for collection ${collName}`);
      continue;
    }

    const docs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (docs.length === 0) {
      console.log(`  - ${collName}: 0 records to restore`);
      continue;
    }

    // Convert string _id and dates to BSON types
    const convertedDocs = docs.map((doc) => {
      const copy = { ...doc };
      if (copy._id && typeof copy._id === 'string') {
        try {
          copy._id = new mongoose.Types.ObjectId(copy._id);
        } catch {
          // keep as string
        }
      }
      return copy;
    });

    const collection = db.collection(collName);
    const bulkOps = convertedDocs.map((doc) => ({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
      console.log(`  ✓ ${collName}: restored/upserted ${bulkOps.length} documents`);
    }
  }

  console.log('\nDatabase restoration completed successfully!');
  await mongoose.disconnect();
}

restoreDatabase().catch((err) => {
  console.error('Restoration failed:', err);
  process.exit(1);
});

