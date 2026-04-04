/**
 * Organization Prefix Backfill Migration
 *
 * Backfills the `prefix` field on existing organizations that don't have one.
 * Auto-generates a 3-letter uppercase prefix from the first 3 letters of the org label.
 * Handles collisions by replacing the last character with an incrementing digit.
 *
 * Dry-run by default. Pass --live to write.
 * Safe to run multiple times — only updates orgs missing the field.
 *
 * Usage:
 *   bun run scripts/migrations/organization-prefix-backfill.ts                          # dry-run localhost
 *   bun run scripts/migrations/organization-prefix-backfill.ts --env=staging            # dry-run staging
 *   bun run scripts/migrations/organization-prefix-backfill.ts --env=production         # dry-run production
 *   bun run scripts/migrations/organization-prefix-backfill.ts --env=production --live  # actually write to production
 */

import { Logger } from '@nestjs/common';

import { runScript } from '../../apps/server/api/scripts/db/connection';
import { parseArgs } from '../../apps/server/api/scripts/db/seed-utils';

const logger = new Logger('OrgPrefixBackfill');

const COLLECTION_NAME = 'organizations';

/**
 * Generate a 3-letter uppercase prefix from an org label.
 * Strips non-alpha characters and pads with 'X' if too short.
 */
function generatePrefixFromLabel(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 3);
  }
  return cleaned.padEnd(3, 'X');
}

/**
 * Resolve collision by replacing the last character with an incrementing digit.
 * GEN → GE2 → GE3 → ... → GE9 → G10 → G11 → ...
 */
function resolveCollision(
  basePrefix: string,
  takenPrefixes: Set<string>,
): string {
  // Try replacing last char with digits 2-9
  for (let i = 2; i <= 9; i++) {
    const candidate = `${basePrefix.slice(0, 2)}${i}`;
    if (!takenPrefixes.has(candidate)) {
      return candidate;
    }
  }
  // Try replacing last two chars with 10-99
  for (let i = 10; i <= 99; i++) {
    const candidate = `${basePrefix.slice(0, 1)}${i}`;
    if (!takenPrefixes.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Cannot resolve prefix collision for base "${basePrefix}" — all variants exhausted`,
  );
}

const args = parseArgs();

runScript(
  'Organization Prefix Backfill',
  async (db) => {
    const collection = db.collection(COLLECTION_NAME);

    // Gather all existing prefixes
    const orgsWithPrefix = await collection
      .find({ isDeleted: false, prefix: { $exists: true, $ne: null } })
      .project({ _id: 1, label: 1, prefix: 1 })
      .toArray();

    const takenPrefixes = new Set<string>(
      orgsWithPrefix.map((o) => (o.prefix as string).toUpperCase()),
    );

    // Find orgs missing prefix
    const filter = {
      $or: [{ prefix: { $exists: false } }, { prefix: null }],
      isDeleted: false,
    };

    const orgsMissingPrefix = await collection
      .find(filter)
      .project({ _id: 1, label: 1 })
      .toArray();

    const totalCount = await collection.countDocuments({ isDeleted: false });

    logger.log(
      `Organizations: ${totalCount} total, ${orgsMissingPrefix.length} missing prefix, ${orgsWithPrefix.length} already have prefix`,
    );

    if (orgsMissingPrefix.length === 0) {
      logger.log('All organizations already have a prefix. Nothing to do.');
      return { unchanged: totalCount, updated: 0 };
    }

    // Plan assignments
    const assignments: Array<{
      id: unknown;
      label: string;
      prefix: string;
    }> = [];

    for (const org of orgsMissingPrefix) {
      const label = org.label as string;
      let prefix = generatePrefixFromLabel(label);

      if (takenPrefixes.has(prefix)) {
        const original = prefix;
        prefix = resolveCollision(prefix, takenPrefixes);
        logger.log(
          `  Collision: "${label}" → ${original} taken → resolved to ${prefix}`,
        );
      }

      takenPrefixes.add(prefix);
      assignments.push({ id: org._id, label, prefix });
    }

    // Log planned assignments
    logger.log('');
    logger.log('Planned prefix assignments:');
    for (const a of assignments) {
      logger.log(`  ${a.label} → ${a.prefix}`);
    }
    logger.log('');

    if (args.dryRun) {
      logger.log(
        `[DRY RUN] Would update ${assignments.length} organizations with prefixes`,
      );
      return { assignments, dryRun: true, wouldUpdate: assignments.length };
    }

    // Apply updates one by one (prefix must be unique per org)
    let updated = 0;
    let errors = 0;

    for (const a of assignments) {
      try {
        const result = await collection.updateOne(
          { _id: a.id },
          { $set: { prefix: a.prefix, updatedAt: new Date() } },
        );
        if (result.modifiedCount === 1) {
          updated++;
          logger.log(`  Updated: ${a.label} → ${a.prefix}`);
        }
      } catch (err) {
        errors++;
        logger.error(`  Failed: ${a.label} → ${a.prefix}:`, err);
      }
    }

    // Summary
    logger.log('');
    logger.log('═'.repeat(50));
    logger.log('BACKFILL SUMMARY');
    logger.log('═'.repeat(50));
    logger.log(`Updated: ${updated}`);
    logger.log(`Errors: ${errors}`);
    logger.log(`Already set: ${orgsWithPrefix.length}`);
    logger.log(`Total organizations: ${totalCount}`);
    logger.log('═'.repeat(50));

    return {
      alreadySet: orgsWithPrefix.length,
      errors,
      updated,
    };
  },
  { database: args.database || 'auth', uri: args.uri },
).catch((error) => {
  logger.error('Migration failed:', error);
  process.exit(1);
});
