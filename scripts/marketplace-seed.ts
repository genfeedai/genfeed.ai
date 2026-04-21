/**
 * Marketplace Seed Script
 *
 * Imports core workflow templates as marketplace listings.
 * Upserts by packageSlug to avoid duplicates.
 *
 * Usage: bun scripts/marketplace-seed.ts [--dry-run]
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');

// Path to core workflow templates
const CORE_WORKFLOWS_DIR = join(__dirname, '../../core/data/workflows');

interface SeedListing {
  packageSlug: string;
  title: string;
  shortDescription: string;
  type: 'workflow';
  price: number;
  currency: string;
  pricingTier: 'free';
  status: 'published';
  isOfficial: true;
  packageSource: 'core';
  version: '1.0.0';
  tags: string[];
}

function getWorkflowIds(): string[] {
  try {
    return readdirSync(CORE_WORKFLOWS_DIR);
  } catch {
    console.error(
      `Cannot read core workflows directory: ${CORE_WORKFLOWS_DIR}`,
    );
    return [];
  }
}

function buildListings(workflowIds: string[]): SeedListing[] {
  return workflowIds.map((id) => ({
    currency: 'usd',
    isOfficial: true as const,
    packageSlug: `core-workflow-${id}`,
    packageSource: 'core' as const,
    price: 0,
    pricingTier: 'free' as const,
    shortDescription: `Official Genfeed.ai core workflow template (${id})`,
    status: 'published' as const,
    tags: ['workflow', 'official', 'core'],
    title: `Core Workflow ${id.slice(0, 8)}`,
    type: 'workflow' as const,
    version: '1.0.0',
  }));
}

async function seed(): Promise<void> {
  const workflowIds = getWorkflowIds();

  if (workflowIds.length === 0) {
    console.log('No workflow templates found in core/data/workflows/');
    return;
  }

  console.log(`Found ${workflowIds.length} workflow templates`);

  const listings = buildListings(workflowIds);

  if (DRY_RUN) {
    console.log('[DRY RUN] Would upsert the following listings:');
    for (const listing of listings) {
      console.log(`  - ${listing.packageSlug}: ${listing.title}`);
    }
    console.log(`\nTotal: ${listings.length} listings`);
    return;
  }

  // Connect to MongoDB and upsert listings
  // This requires MONGODB_MARKETPLACE_URI to be set in the environment
  const mongoUri = process.env.MONGODB_MARKETPLACE_URI;
  if (!mongoUri) {
    console.error('MONGODB_MARKETPLACE_URI environment variable is required');
    console.log('Hint: Source your .env file or set the variable directly');
    process.exit(1);
  }

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('listings');

    let created = 0;
    let updated = 0;

    for (const listing of listings) {
      const result = await collection.updateOne(
        { isDeleted: false, packageSlug: listing.packageSlug },
        {
          $set: listing,
          $setOnInsert: {
            createdAt: new Date(),
            downloadData: {},
            downloads: 0,
            installCount: 0,
            isDeleted: false,
            purchases: 0,
            revenue: 0,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount > 0) {
        created++;
      } else if (result.modifiedCount > 0) {
        updated++;
      }
    }

    console.log(`Seed complete: ${created} created, ${updated} updated`);
  } finally {
    await client.close();
  }
}

seed().catch(console.error);
