import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const mongoose = require('mongoose');

dns.setServers(['8.8.8.8', '1.1.1.1']);

async function backupDatabase() {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
  if (!uriMatch) {
    throw new Error('MONGODB_URI not found in .env.local');
  }
  const uri = uriMatch[1].trim().replace(/^['"]|['"]$/g, '');

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.resolve('backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  const manifest = {
    timestamp: new Date().toISOString(),
    collections: {},
    totalDocuments: 0,
  };

  console.log(`Starting export of ${collections.length} collections to ${backupDir}...`);

  for (const collInfo of collections) {
    const collName = collInfo.name;
    const docs = await db.collection(collName).find().toArray();
    const filePath = path.join(backupDir, `${collName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    manifest.collections[collName] = docs.length;
    manifest.totalDocuments += docs.length;
    console.log(`  ✓ ${collName}: ${docs.length} records exported`);
  }

  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log(`\nBackup completed successfully!`);
  console.log(`Manifest: ${manifest.totalDocuments} total documents across ${collections.length} collections.`);
  console.log(`Backup location: ${backupDir}`);

  await mongoose.disconnect();
}

backupDatabase().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

