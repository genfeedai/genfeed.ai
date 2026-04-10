/**
 * One-time migration: backfill slug for all existing organizations.
 *
 * Dry run (preview only, no writes):
 *   bun run scripts/migrate-org-slugs.ts --dry-run
 *
 * Apply:
 *   bun run scripts/migrate-org-slugs.ts
 */
import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/genfeed';
const DRY_RUN = process.argv.includes('--dry-run');

function generateSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function migrate() {
  if (DRY_RUN) {
    console.log('=== DRY RUN — no writes will be made ===\n');
  }

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection database is not available.');
  }
  const orgs = db.collection('organizations');

  const cursor = orgs.find({ isDeleted: false, slug: { $exists: false } });
  const usedSlugs = new Set<string>();

  const existingSlugs = await orgs.distinct('slug', {
    slug: { $exists: true },
  });
  for (const s of existingSlugs) usedSlugs.add(s);

  let updated = 0;
  for await (const org of cursor) {
    let slug = generateSlug(org.label || 'org');
    let counter = 2;
    const base = slug;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${counter}`;
      counter++;
    }
    usedSlugs.add(slug);

    if (!DRY_RUN) {
      await orgs.updateOne({ _id: org._id }, { $set: { slug } });
    }
    console.log(`${org.label} → ${slug}`);
    updated++;
  }

  console.log(
    `\n${DRY_RUN ? '[DRY RUN] Would migrate' : 'Migrated'} ${updated} organizations.`,
  );
  await mongoose.disconnect();
}

migrate().catch(console.error);
